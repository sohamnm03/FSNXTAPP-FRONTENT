const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createSapAutomationWorkspace } = require('./sapAutomationWorkspace');

const FINAL_STATUSES = new Set(['completed', 'failed', 'stopped']);
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const DISPLAY_GUIDANCE = [
  'You are running inside the FSNXT SAP Testing desktop application.',
  'Keep user-facing responses functional and concise.',
  'Show test choices, business steps, results, document numbers, warnings, and actionable errors.',
  'Do not expose internal tool traces or verbose technical investigation unless needed to explain a failure.',
  'Follow every safety and write-confirmation rule in this SAP Testing Automation project.',
].join(' ');

function validateProject(projectRoot) {
  if (!projectRoot || typeof projectRoot !== 'string') return false;
  return [
    path.join(projectRoot, 'gui_tests', 'run.py'),
    path.join(projectRoot, 'scripts', 'run-gui-case.ps1'),
    path.join(projectRoot, 'CLAUDE.md'),
  ].every((candidate) => fs.existsSync(candidate));
}

function claudeExecutable(electronApp) {
  const bundled = electronApp.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    : path.resolve(__dirname, '..', 'node_modules', '@anthropic-ai', 'claude-code-win32-x64', 'claude.exe');
  const candidates = [
    process.env.CLAUDE_CODE_EXECUTABLE,
    bundled,
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe'),
    'claude.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === 'claude.exe' || fs.existsSync(candidate)) || 'claude.exe';
}

function parseClaudeResult(stdout, stderr) {
  try {
    const payload = JSON.parse(stdout.trim());
    return {
      response: typeof payload.result === 'string' ? payload.result.trim() : '',
      sessionId: payload.session_id || '',
      error: payload.is_error ? (payload.result || 'AI Assistant could not complete the request.') : '',
    };
  } catch {
    const fallback = stdout.trim() || stderr.trim();
    return {
      response: fallback,
      sessionId: '',
      error: fallback || 'AI Assistant returned an unreadable response.',
    };
  }
}

async function createSapTerminalManager(electronApp) {
  const runs = new Map();
  const confirmations = new Map();
  const claudePath = claudeExecutable(electronApp);
  const workspace = await createSapAutomationWorkspace(electronApp);
  let authProcess = null;
  let connectionCheckProcess = null;
  const projectRoot = workspace.projectRoot;

  function requireRun(runId) {
    const run = runs.get(runId);
    if (!run) throw new Error('AI Assistant request not found.');
    return run;
  }

  function publicRun(run) {
    return {
      id: run.id,
      status: run.status,
      prompt: run.prompt,
      response: run.response,
      sessionId: run.sessionId,
      error: run.error,
      exitCode: run.exitCode,
      source: run.source || 'claude',
    };
  }

  function caseManifest(lane) {
    if (!['gui', 'web'].includes(lane)) throw new Error('Select SAP GUI or Fiori / WebGUI testing.');
    const fileName = lane === 'gui' ? 'gui-runs.json' : 'runs.json';
    return JSON.parse(fs.readFileSync(path.join(projectRoot, 'config', fileName), 'utf8'));
  }

  function systemRegistry() {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, 'config', 'sap-systems.json'), 'utf8'));
  }

  function configuredDefaultSystem() {
    const registry = systemRegistry();
    const system = registry.systems?.find((entry) => entry.id === registry.defaultSystem);
    if (!system || !system.enabled || !system.sapGui?.enabled) {
      throw new Error('The configured default SAP GUI system is missing or disabled.');
    }
    return system;
  }

  function connectionCheckSystems() {
    const registry = systemRegistry();
    return (registry.systems || []).filter((system) => (
      system.connectionCheckEnabled === true || (system.enabled && system.sapGui?.enabled)
    ));
  }

  function configuredConnectionCheckSystem(systemId) {
    const system = connectionCheckSystems().find((entry) => entry.id === String(systemId || ''));
    if (!system) throw new Error('Select an SAP system that is available for connection testing.');
    return system;
  }

  function normalizeCaseId(caseId) {
    const match = String(caseId || '').toUpperCase().match(/^TC[- ]?0*(\d{1,3})$/);
    if (!match) throw new Error('Enter a valid test case such as TC-015.');
    return `TC-${match[1].padStart(3, '0')}`;
  }

  function prepareCase(lane, requestedCaseId, requestedStage = '') {
    if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
    const caseId = normalizeCaseId(requestedCaseId);
    const manifest = caseManifest(lane);
    const testCase = manifest.cases?.[caseId];
    if (!testCase) throw new Error(`${caseId} is not registered in the selected ${lane === 'gui' ? 'SAP GUI' : 'Fiori / WebGUI'} lane.`);
    const stages = Array.isArray(testCase.stages) ? testCase.stages.map(String) : [];
    const stage = String(requestedStage || testCase.defaultStage || '');
    if (requestedStage && !stages.includes(String(requestedStage))) {
      throw new Error(`${caseId} does not have stage '${requestedStage}'. Available stages: ${stages.join(', ') || 'none'}.`);
    }

    const system = configuredDefaultSystem();

    const confirmationId = crypto.randomUUID();
    const proposal = {
      confirmationId,
      createdAt: Date.now(),
      lane,
      caseId,
      summary: String(testCase.summary || ''),
      writes: String(testCase.writes || 'The manifest does not describe the writes.'),
      stage: stage || 'complete configured flow',
      hasStageArgument: Boolean(stage && stages.length),
      systemId: system.id,
      systemLabel: `${system.label} [${system.id}]`,
    };
    confirmations.set(confirmationId, proposal);
    return {
      confirmationId: proposal.confirmationId,
      lane: proposal.lane,
      caseId: proposal.caseId,
      summary: proposal.summary,
      writes: proposal.writes,
      stage: proposal.stage,
      systemLabel: proposal.systemLabel,
    };
  }

  function startConfirmedCase(confirmationId) {
    const proposal = confirmations.get(confirmationId);
    confirmations.delete(confirmationId);
    if (!proposal || Date.now() - proposal.createdAt > CONFIRMATION_TTL_MS) {
      throw new Error('This confirmation expired. Request the test again and review the current write details.');
    }
    if ([...runs.values()].some((run) => !FINAL_STATUSES.has(run.status))) {
      throw new Error('Another SAP request is already running. Wait for it to finish or stop it first.');
    }

    const scriptName = proposal.lane === 'gui' ? 'run-gui-case.ps1' : 'run-case.ps1';
    const args = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', path.join(projectRoot, 'scripts', scriptName),
      '-Case', proposal.caseId,
    ];
    if (proposal.hasStageArgument) args.push('-Stage', proposal.stage);
    if (proposal.lane === 'gui') args.push('-System', proposal.systemId);
    args.push('-Yes');

    const run = {
      id: crypto.randomUUID(),
      prompt: `Confirmed ${proposal.lane} run ${proposal.caseId}`,
      status: 'running',
      response: '',
      sessionId: '',
      error: '',
      stdout: '',
      stderr: '',
      exitCode: null,
      process: null,
      source: 'direct',
    };
    const child = spawn('powershell.exe', args, {
      cwd: projectRoot,
      env: { ...process.env, SAP_SYSTEM_ID: proposal.systemId, NO_COLOR: '1', FORCE_COLOR: '0' },
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    run.process = child;
    runs.set(run.id, run);
    child.stdout.on('data', (chunk) => { run.stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { run.stderr += chunk.toString('utf8'); });
    child.once('error', (error) => {
      run.status = 'failed';
      run.error = error.message;
    });
    child.once('close', (code) => {
      run.process = null;
      run.exitCode = code;
      if (run.status === 'stopping') {
        run.status = 'stopped';
        return;
      }
      if (run.status === 'failed' && run.error) return;
      run.response = run.stdout.trim() || 'The test runner completed without console output.';
      run.error = code === 0 ? '' : (run.stderr.trim() || `${proposal.caseId} exited with code ${code}.`);
      run.status = code === 0 ? 'completed' : 'failed';
    });
    return publicRun(run);
  }

  function getAuthStatus() {
    return new Promise((resolve) => {
      let stdout = '';
      let settled = false;
      const child = spawn(claudePath, ['auth', 'status', '--json'], {
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
      child.once('error', () => finish({ available: false, loggedIn: false }));
      child.once('close', (code) => {
        try {
          const status = JSON.parse(stdout.trim());
          finish({ available: true, loggedIn: code === 0 && status.loggedIn === true, authMethod: status.authMethod || '' });
        } catch {
          finish({ available: true, loggedIn: false });
        }
      });
    });
  }

  return {
    getProject() {
      const configured = validateProject(projectRoot);
      if (!configured) return { configured: false, defaultSystemId: '', systems: [] };
      try {
        const registry = systemRegistry();
        const systems = connectionCheckSystems().map((system) => ({
          id: String(system.id),
          name: String(system.label || system.sapGui?.logonDescription || system.id),
        }));
        return {
          configured: true,
          defaultSystemId: String(registry.defaultSystem || systems[0]?.id || ''),
          systems,
        };
      } catch {
        return { configured: true, defaultSystemId: '', systems: [] };
      }
    },
    prepareCase,
    startConfirmedCase,
    getAuthStatus,
    testConnection(systemId) {
      if (connectionCheckProcess) {
        throw new Error('An SAP connection check is already running.');
      }
      if ([...runs.values()].some((run) => !FINAL_STATUSES.has(run.status))) {
        throw new Error('Another SAP request is already running. Wait for it to finish or stop it first.');
      }
      const system = configuredConnectionCheckSystem(systemId);
      if (!system.rfc?.applicationServer || !/^\d{2}$/.test(String(system.rfc.systemNumber))) {
        throw new Error('The default SAP system has no valid RFC connection metadata.');
      }
      const scriptPath = path.join(projectRoot, 'scripts', 'test-sap-connection.ps1');
      if (!fs.existsSync(scriptPath)) {
        throw new Error('The SAP connection check is missing. Reinstall the application.');
      }

      return new Promise((resolve) => {
        let stdout = '';
        let settled = false;
        const child = spawn('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', scriptPath,
          '-SystemId', String(system.systemId),
          '-Client', String(system.client),
          '-LogonDescription', String(system.sapGui.logonDescription),
          '-ApplicationServer', String(system.rfc.applicationServer),
          '-SystemNumber', String(system.rfc.systemNumber),
        ], {
          cwd: projectRoot,
          env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        connectionCheckProcess = child;

        const finish = (result) => {
          if (settled) return;
          settled = true;
          connectionCheckProcess = null;
          resolve(result);
        };

        child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
        child.once('error', () => finish({ connected: false }));
        child.once('close', () => {
          try {
            const result = JSON.parse(stdout.trim());
            finish({
              connected: result.connected === true,
              serverName: String(system.label || system.sapGui.logonDescription || system.id),
              reason: typeof result.reason === 'string' ? result.reason : '',
            });
          } catch {
            finish({ connected: false, reason: 'The SAP connection check returned an invalid result.' });
          }
        });
      });
    },
    login() {
      if (authProcess) throw new Error('AI Assistant sign-in is already in progress.');
      return new Promise((resolve, reject) => {
        let stderr = '';
        const child = spawn(claudePath, ['auth', 'login', '--claudeai'], {
          env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        authProcess = child;
        child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
        child.once('error', (error) => {
          authProcess = null;
          reject(new Error(error.code === 'ENOENT'
            ? 'The bundled AI Assistant runtime is missing. Reinstall the application.'
            : error.message));
        });
        child.once('close', async (code) => {
          authProcess = null;
          if (code !== 0) {
            reject(new Error(stderr.trim() || 'AI Assistant sign-in was not completed.'));
            return;
          }
          const status = await getAuthStatus();
          if (!status.loggedIn) {
            reject(new Error('AI Assistant sign-in was not completed.'));
            return;
          }
          resolve(status);
        });
      });
    },
    start(prompt, previousSessionId = '', lane = 'gui') {
      if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Type what you want the AI Assistant to do.');
      if (previousSessionId && !/^[0-9a-f-]{36}$/i.test(previousSessionId)) throw new Error('The AI Assistant session is invalid. Start a new chat.');
      if (!['gui', 'web'].includes(lane)) throw new Error('Select SAP GUI or Fiori / WebGUI testing.');

      const laneGuidance = lane === 'gui'
        ? 'The user selected the SAP GUI lane. Use GUI-lane cases and scripts/run-gui-case.ps1 for runnable tests.'
        : 'The user selected the Fiori / WebGUI lane. Use web-lane cases and scripts/run-case.ps1 for runnable tests.';

      const args = [
        '-p', prompt.trim(),
        '--output-format', 'json',
        '--permission-mode', 'auto',
        '--append-system-prompt', `${DISPLAY_GUIDANCE} ${laneGuidance}`,
      ];
      if (previousSessionId) args.push('--resume', previousSessionId);

      const run = {
        id: crypto.randomUUID(),
        prompt: prompt.trim(),
        status: 'running',
        response: '',
        sessionId: previousSessionId,
        error: '',
        stdout: '',
        stderr: '',
        exitCode: null,
        process: null,
      };
      const child = spawn(claudePath, args, {
        cwd: projectRoot,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      run.process = child;
      runs.set(run.id, run);

      child.stdout.on('data', (chunk) => { run.stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk) => { run.stderr += chunk.toString('utf8'); });
      child.once('error', (error) => {
        run.status = 'failed';
        run.error = error.code === 'ENOENT'
          ? 'The bundled AI Assistant runtime is missing. Reinstall the application.'
          : error.message;
      });
      child.once('close', (code) => {
        run.process = null;
        run.exitCode = code;
        if (run.status === 'stopping') {
          run.status = 'stopped';
          return;
        }
        if (run.status === 'failed' && run.error) return;
        const parsed = parseClaudeResult(run.stdout, run.stderr);
        run.response = parsed.response;
        run.sessionId = parsed.sessionId || run.sessionId;
        run.error = parsed.error || (code === 0 ? '' : 'AI Assistant could not complete the request. Check that you are signed in.');
        run.status = code === 0 && !run.error ? 'completed' : 'failed';
      });
      return publicRun(run);
    },
    getRun(runId) {
      return publicRun(requireRun(runId));
    },
    stop(runId) {
      const run = requireRun(runId);
      if (!run.process || FINAL_STATUSES.has(run.status)) throw new Error('AI Assistant has already finished responding.');
      run.status = 'stopping';
      run.process.kill();
      return publicRun(run);
    },
    stopAll() {
      authProcess?.kill();
      connectionCheckProcess?.kill();
      runs.forEach((run) => run.process?.kill());
      workspace.cleanup();
    },
  };
}

module.exports = { createSapTerminalManager };
