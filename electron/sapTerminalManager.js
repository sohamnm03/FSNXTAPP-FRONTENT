const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createSapAutomationWorkspace } = require('./sapAutomationWorkspace');
const { webRuntimeEnvironment } = require('./sapWebRuntime');
const { createExternalRun, externalRunPrompt, writeExternalResult } = require('./sapExternalRun');
const { automationPrompt, candidatePath, clearCandidate, caseDigest, publishAutomation, readAutomation } = require('./sapCaseAutomation');

const FINAL_STATUSES = new Set(['completed', 'failed', 'stopped']);
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;
// Authoring ends with up to this many automatic dry runs of the new case; the AI
// repairs the Markdown/plan between runs (so at most MAX - 1 repairs).
const MAX_VERIFY_ATTEMPTS = 3;
const VERIFY_POLL_MS = 100;
const DISPLAY_GUIDANCE = [
  'You are running inside the FSNXT SAP Testing desktop application.',
  'Keep user-facing responses functional and concise.',
  'Show test choices, business steps, results, document numbers, warnings, and actionable errors.',
  'Do not expose internal tool traces or verbose technical investigation unless needed to explain a failure.',
  'Follow every safety and write-confirmation rule in this SAP Testing Automation project.',
].join(' ');

const INVALID_CREDENTIALS_MESSAGE = 'Invalid User ID or Password. Please check your credentials and try again.';

// The SAP GUI helper scripts report str(exception), so a failed logon can reach
// the UI as a raw COM error such as "(-2147417848, 'The object invoked has
// disconnected from its clients.', None, None)". Those carry no meaning for the
// user — a rejected logon is what they almost always mean — so swap them for
// a plain message. Readable reasons (e.g. SAP's own popup text) pass through.
function isRawConnectionError(reason) {
  return /^\s*\(\s*-?\d{4,}\s*,/.test(reason)
    || /com_error|disconnected from its clients|RPC server is unavailable|did not reach an authenticated session|0x8[0-9a-f]{7}/i.test(reason);
}

function userFacingConnectionReason(reason, fallback = INVALID_CREDENTIALS_MESSAGE) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  return isRawConnectionError(text) ? fallback : text;
}

function validateProject(projectRoot) {
  if (!projectRoot || typeof projectRoot !== 'string') return false;
  return [
    path.join(projectRoot, 'gui_tests', 'run.py'),
    path.join(projectRoot, 'scripts', 'run-gui-case.ps1'),
    path.join(projectRoot, 'CLAUDE.md'),
  ].every((candidate) => fs.existsSync(candidate));
}

// The GUI lane drives SAP through pywin32, so it needs a real interpreter. The
// packaged app carries a self-contained one because the repo's venv borrows the
// developer's Python install and cannot be copied to another machine.
function bundledPython(electronApp) {
  if (!electronApp.isPackaged) return '';
  const candidate = path.join(process.resourcesPath, 'python', 'python.exe');
  return fs.existsSync(candidate) ? candidate : '';
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

async function createSapTerminalManager(electronApp, claudeTokenStore, dialog) {
  const runs = new Map();
  const confirmations = new Map();
  const externalAuthorization = Symbol('confirmed external testcase');
  const claudePath = claudeExecutable(electronApp);
  const pythonPath = bundledPython(electronApp);
  const workspace = await createSapAutomationWorkspace(electronApp);
  let connectionCheckProcess = null;
  let currentUsername = '';
  const claudeConfigDir = path.join(electronApp.getPath('userData'), 'claude-runtime');
  const settingsPath = path.join(electronApp.getPath('userData'), 'sap-terminal-settings.json');
  const projectRoot = workspace.projectRoot;
  fs.mkdirSync(claudeConfigDir, { recursive: true });

  // .mcp.json bakes in an absolute python.exe path and audit-log path at the
  // moment scripts/sync-sap-systems.ps1 last ran — on whatever machine that
  // was. A payload built and packaged on one machine, then installed on
  // another (or just unpacked into a fresh runtime temp dir each launch, per
  // createSapAutomationWorkspace), carries those stale paths, so the AI
  // Assistant's SAP GUI MCP server never starts there — no sap_* tools at
  // all, not a login failure. Regenerating here, every launch, with this
  // process's own pythonPath/projectRoot, means no one ever has to run this
  // by hand on a second machine.
  if (validateProject(projectRoot)) {
    try {
      await new Promise((resolve) => {
        const syncScript = path.join(projectRoot, 'scripts', 'sync-sap-systems.ps1');
        if (!fs.existsSync(syncScript)) { resolve(); return; }
        const child = spawn('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', syncScript,
        ], {
          cwd: projectRoot,
          env: {
            ...process.env,
            ...(pythonPath ? { FSNXT_PYTHON: pythonPath } : {}),
            NO_COLOR: '1',
            FORCE_COLOR: '0',
          },
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
        child.once('error', () => resolve());
        child.once('close', () => resolve());
      });
    } catch {
      // Best-effort — a stale .mcp.json still surfaces as a clear "no sap_*
      // tools" error from the AI Assistant itself rather than failing silently.
    }
  }

  // Windows folder names can't hold <>:"/\|?* or control characters.
  function sanitizeForFolderName(value) {
    return String(value || '').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
  }

  function currentUsernameKey() {
    return sanitizeForFolderName(currentUsername).toLowerCase();
  }

  function defaultArchiveDir() {
    const suffix = sanitizeForFolderName(currentUsername);
    const folderName = suffix ? `FSNXT SAP Test Archives - ${suffix}` : 'FSNXT SAP Test Archives';
    return path.join(electronApp.getPath('downloads'), folderName);
  }

  function readSettings() {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      return {};
    }
  }

  function writeSettings(settings) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  }

  function archiveDir() {
    const settings = readSettings();
    const usernameKey = currentUsernameKey();
    const userConfigured = usernameKey && settings.archiveDirectories?.[usernameKey];
    if (typeof userConfigured === 'string' && userConfigured.trim()) return userConfigured;
    if (!usernameKey && typeof settings.archiveDirectory === 'string' && settings.archiveDirectory.trim()) {
      return settings.archiveDirectory;
    }
    return defaultArchiveDir();
  }

  // User-created testcases travel with the selected test archive location
  // instead of being fixed under Documents. Changing the archive folder in
  // the app therefore changes both result storage and testcase storage.
  function externalCasesRoot() {
    return path.join(archiveDir(), 'FSNXT SAP Test Cases');
  }

  function externalCasesManifestPath() {
    return path.join(externalCasesRoot(), 'config', 'external-cases.json');
  }

  // The AI-chat lane spawns claude.exe with cwd=projectRoot, so Claude Code
  // loads this file's "env" block itself (the same mechanism that hands
  // SAP_DS4_100_NIIF_PASSWORD to a run). The confirmed-case lane below spawns
  // powershell.exe directly and bypasses Claude Code, so it has to read the
  // same gitignored, local-only file itself to pick up secrets such as
  // AZURE_STORAGE_CONNECTION_STRING.
  function projectLocalEnv() {
    try {
      const raw = fs.readFileSync(path.join(projectRoot, '.claude', 'settings.local.json'), 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed.env === 'object' && parsed.env ? parsed.env : {};
    } catch {
      return {};
    }
  }

  // runId, when given, is read back by .claude/hooks/sap-save-confirmation.ps1
  // (an Elicitation hook — see .claude/settings.json) so it can file the
  // mid-run "confirm this Save" request under the same id this manager
  // already tracks the run by, with no session-id plumbing needed. Omitted
  // for the plain `claude auth status` check below, which never touches SAP.
  function claudeEnvironment(token, runId = '', caseCreation = null, lane = 'gui', externalRun = null) {
    const env = {
      ...(electronApp.isPackaged ? webRuntimeEnvironment(process.resourcesPath) : process.env),
      NO_COLOR: '1', FORCE_COLOR: '0', CLAUDE_CONFIG_DIR: claudeConfigDir,
      FSNXT_ARTIFACT_ARCHIVE_DIR: archiveDir(),
      FSNXT_APP_USERNAME: currentUsername,
      FSNXT_CASE_CREATION_AUTO_SAVE: caseCreation && lane === 'gui' ? '1' : '0',
      FSNXT_EXTERNAL_RUN_AUTO_SAVE: externalRun && lane === 'gui' ? '1' : '0',
      FSNXT_EXTERNAL_RUN_RECORD: externalRun ? path.join(externalRun.workRoot, 'observations.json') : '',
      FSNXT_CASE_DIRECTORY: caseCreation ? caseCreationDirectory(lane, caseCreation.systemId) : '',
      FSNXT_CASE_EXISTING_FILES: JSON.stringify(caseCreation?.existingFiles || []),
    };
    if (pythonPath) env.FSNXT_PYTHON = pythonPath;
    if (runId) env.FSNXT_RUN_ID = runId;
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    if (token) env.CLAUDE_CODE_OAUTH_TOKEN = token;
    return env;
  }

  // Bridges the sap-gui MCP server's "confirm before Save" elicitation
  // (docs/sap-gui-mcp-setup.md § Safety rails, CLAUDE.md rule 3) out to this
  // app's own UI instead of letting it die silently: the Electron-spawned
  // `claude -p` run has no TTY, so with no Elicitation hook configured,
  // Claude Code cancels any MCP elicitation on its own (nobody can answer it)
  // and the Save reports "cancelled" with the fields already typed and
  // nothing written — the exact symptom this fixes. sap-save-confirmation.ps1
  // (registered as an Elicitation hook in .claude/settings.json) drops a
  // request file here and blocks waiting for a response file; these three
  // functions are this side of that handshake. Both sides key off run.id
  // (via FSNXT_RUN_ID above), so no session-id correlation is needed and two
  // runs can never collide.
  function elicitationRequestsDir() {
    return path.join(projectRoot, 'logs', 'elicitation-requests');
  }

  function cleanupElicitationFiles(runId) {
    if (!runId) return;
    for (const suffix of ['request', 'response']) {
      try { fs.unlinkSync(path.join(elicitationRequestsDir(), `${runId}.${suffix}.json`)); } catch { /* nothing to clean up */ }
    }
  }

  // Polled from publicRun() on the same ~500ms cadence the renderer already
  // polls run status with, so a pending Save shows up as a modal within a
  // fraction of a second of the hook writing its request file.
  function readPendingElicitation(runId) {
    if (!runId) return null;
    const dir = elicitationRequestsDir();
    const requestPath = path.join(dir, `${runId}.request.json`);
    const responsePath = path.join(dir, `${runId}.response.json`);
    // A response already sitting next to the request means the hook hasn't
    // caught up and deleted both yet — treat it as already answered, not
    // pending, so the dialog doesn't flash back open after the user acts.
    if (!fs.existsSync(requestPath) || fs.existsSync(responsePath)) return null;
    const parsed = readJsonFile(requestPath, null);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      id: runId,
      mcpServer: String(parsed.mcpServer || ''),
      toolName: String(parsed.toolName || ''),
      message: String(parsed.message || 'The AI Assistant wants to save changes in SAP.'),
      createdAt: String(parsed.createdAt || ''),
    };
  }

  function answerElicitation(runId, accept) {
    if (!runId) throw new Error('There is no active AI Assistant request to answer.');
    const requestPath = path.join(elicitationRequestsDir(), `${runId}.request.json`);
    if (!fs.existsSync(requestPath)) {
      throw new Error('This confirmation is no longer waiting for an answer — the AI Assistant may have already timed out or moved on.');
    }
    writeJsonFile(path.join(elicitationRequestsDir(), `${runId}.response.json`), {
      accept: Boolean(accept),
      answeredAt: new Date().toISOString(),
    });
    return { accepted: Boolean(accept) };
  }

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
      createdCases: run.createdCases || [],
      error: run.error,
      exitCode: run.exitCode,
      source: run.source || 'claude',
      resultPath: run.resultPath || '',
      pendingElicitation: run.status === 'running' ? readPendingElicitation(run.id) : null,
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

  function sapGuiMcpToolPattern(system) {
    if (!system) return '';
    const registry = systemRegistry();
    const explicitName = String(system.sapGui?.mcpServerName || '').trim();
    const serverName = explicitName || (system.id === registry.defaultSystem
      ? 'sap-gui'
      : `sap-gui-${String(system.systemId || '').toLowerCase()}-${String(system.client || '')}`);
    if (!/^[A-Za-z0-9_-]+$/.test(serverName)) {
      throw new Error(`The SAP GUI MCP server name for ${system.id} is invalid.`);
    }
    return `mcp__${serverName}__*`;
  }

  // Claude Code normalizes Windows paths to /c/... and requires two leading
  // slashes for an absolute Edit rule. Edit path rules cover both Edit and
  // Write, so authoring stays limited to the selected testcase directory.
  function claudeAbsoluteEditRule(directory) {
    const resolved = path.resolve(directory);
    if (resolved.startsWith('\\\\')) {
      throw new Error('Choose a local folder or a mapped drive for SAP test archives; network paths are not supported.');
    }
    const normalized = resolved
      .replace(/\\/g, '/')
      .replace(/^([A-Za-z]):/, (_match, drive) => `/${drive.toLowerCase()}`);
    const escaped = normalized.replace(/([*?[\]\\])/g, '\\$1');
    return `Edit(//${escaped.replace(/^\/+/, '')}/**)`;
  }

  function normalizeCaseId(caseId) {
    const match = String(caseId || '').toUpperCase().match(/^TC[- ]?0*(\d{1,3})$/);
    if (!match) throw new Error('Enter a valid test case such as TC-015.');
    return `TC-${match[1].padStart(3, '0')}`;
  }

  function laneCaseFolder(lane) {
    return lane === 'gui' ? 'GUI-TC' : 'Web-TC';
  }

  function laneCasesDir(lane) {
    return path.join(projectRoot, 'test-cases', laneCaseFolder(lane));
  }

  function externalLaneCasesDir(lane, systemId) {
    const system = String(systemId || '').trim() || 'DS4_100_NIIF';
    if (!/^[A-Za-z0-9_-]+$/.test(system)) throw new Error('The selected SAP system id is invalid.');
    const systemFolder = system === 'DS4_100_TFSIN' ? 'TFSIN HANA Dev' : system;
    return path.join(externalCasesRoot(), 'test-cases', laneCaseFolder(lane), systemFolder);
  }

  function readJsonFile(filePath, fallback) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      return fallback;
    }
  }

  function writeJsonFile(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  function externalManifest() {
    const parsed = readJsonFile(externalCasesManifestPath(), null);
    if (parsed && typeof parsed === 'object' && parsed.cases && typeof parsed.cases === 'object') return parsed;
    return {
      description: 'User-created SAP test cases stored outside the packaged FSNXT automation workspace.',
      cases: {},
    };
  }

  function externalCaseKey(lane, caseId) {
    return `${lane}:${caseId}`;
  }

  function externalCaseEntries(lane) {
    const manifest = externalManifest();
    return Object.entries(manifest.cases || {})
      .filter(([, entry]) => entry?.lane === lane)
      .map(([key, entry]) => ({ key, entry }));
  }

  function caseNumber(caseId) {
    const match = String(caseId || '').match(/^TC-(\d{3})$/);
    return match ? Number(match[1]) : 0;
  }

  // Ids are unique across BOTH lanes and every system folder (new-test-case
  // skill) — a GUI case and a Web case must never claim the same number, so
  // this checks every manifest (built-in and external, both lanes) rather
  // than just the one the new case is being filed under.
  function nextExternalCaseId() {
    const ids = new Set();
    for (const knownLane of ['gui', 'web']) {
      try { Object.keys(caseManifest(knownLane).cases || {}).forEach((id) => ids.add(id)); } catch { /* manifest missing/unreadable — ignore */ }
      externalCaseEntries(knownLane).forEach(({ entry }) => { if (entry.caseId) ids.add(entry.caseId); });
    }
    const highest = [...ids].reduce((max, caseId) => Math.max(max, caseNumber(caseId)), 0);
    return `TC-${String(highest + 1).padStart(3, '0')}`;
  }

  function findCaseMarkdownFile(lane, caseId, manifestEntry) {
    if (manifestEntry?.caseFile) {
      const explicit = path.join(projectRoot, manifestEntry.caseFile);
      if (fs.existsSync(explicit)) return explicit;
    }
    const baseDir = laneCasesDir(lane);
    if (!fs.existsSync(baseDir)) return null;
    const stack = [baseDir];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) { stack.push(full); continue; }
        if (entry.isFile() && entry.name.toUpperCase().startsWith(`${caseId}-`)) return full;
      }
    }
    return null;
  }

  function listCases(lane, systemId = '') {
    if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
    const selectedSystem = systemId ? configuredConnectionCheckSystem(systemId) : configuredDefaultSystem();
    const registry = systemRegistry();
    const manifest = caseManifest(lane);
    // Frozen built-in scripts currently belong to the registry's default
    // system. Other systems list only cases authored for that exact system.
    const builtInCases = selectedSystem.id === registry.defaultSystem
      ? Object.entries(manifest.cases || {})
      .map(([caseId, entry]) => ({
        caseId,
        summary: String(entry.summary || ''),
        writes: String(entry.writes || ''),
        stages: Array.isArray(entry.stages) ? entry.stages.map(String) : [],
        defaultStage: entry.defaultStage ? String(entry.defaultStage) : '',
        hasFile: Boolean(findCaseMarkdownFile(lane, caseId, entry)),
        source: 'built-in',
      }))
      : [];
    const externalCases = externalCaseEntries(lane)
      .filter(({ entry }) => entry?.system === selectedSystem.id)
      .map(({ entry }) => ({
        caseId: String(entry.caseId || ''),
        summary: String(entry.summary || ''),
        writes: String(entry.writes || ''),
        stages: [],
        defaultStage: '',
        hasFile: typeof entry.caseFile === 'string' && fs.existsSync(path.join(externalCasesRoot(), entry.caseFile)),
        source: 'external',
        externalLabel: 'External created TC',
        filePath: typeof entry.caseFile === 'string' ? path.join(externalCasesRoot(), entry.caseFile) : '',
        hasAutomation: typeof entry.caseFile === 'string'
          && hasSavedAutomation(path.join(externalCasesRoot(), entry.caseFile), lane, String(entry.caseId || ''), selectedSystem.id),
      }))
      .filter((entry) => /^TC-\d{3}$/.test(entry.caseId));
    const cases = [...builtInCases, ...externalCases]
      .sort((a, b) => caseNumber(a.caseId) - caseNumber(b.caseId) || a.caseId.localeCompare(b.caseId));
    return { lane, systemId: selectedSystem.id, cases };
  }

  function getCaseFile(lane, requestedCaseId, systemId = '') {
    if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
    const caseId = normalizeCaseId(requestedCaseId);
    const selectedSystem = systemId ? configuredConnectionCheckSystem(systemId) : configuredDefaultSystem();
    const registry = systemRegistry();
    const manifest = caseManifest(lane);
    const entry = selectedSystem.id === registry.defaultSystem ? manifest.cases?.[caseId] : null;
    if (!entry) {
      const externalEntry = externalCaseEntries(lane)
        .find((item) => item.entry.caseId === caseId && item.entry.system === selectedSystem.id)?.entry;
      if (!externalEntry?.caseFile) {
        throw new Error(`${caseId} is not registered in the selected ${lane === 'gui' ? 'SAP GUI' : 'Fiori / WebGUI'} lane.`);
      }
      const externalPath = path.join(externalCasesRoot(), externalEntry.caseFile);
      if (!fs.existsSync(externalPath)) throw new Error(`No documentation file was found for ${caseId}.`);
      return {
        caseId,
        fileName: path.basename(externalPath),
        content: fs.readFileSync(externalPath, 'utf8'),
        source: 'external',
        externalLabel: 'External created TC',
        filePath: externalPath,
        hasAutomation: hasSavedAutomation(externalPath, lane, caseId, selectedSystem.id),
      };
    }
    const filePath = findCaseMarkdownFile(lane, caseId, entry);
    if (!filePath) throw new Error(`No documentation file was found for ${caseId}.`);
    return {
      caseId,
      fileName: path.basename(filePath),
      content: fs.readFileSync(filePath, 'utf8'),
      source: 'built-in',
      filePath,
    };
  }

  // Authored cases are written directly into the user's selected archive.
  // The temporary packaged automation workspace must never hold a testcase
  // copy because it can disappear whenever the desktop process exits.
  function caseCreationDirectory(lane, system) {
    return externalLaneCasesDir(lane, system);
  }

  // Picks the folder a newly authored case belongs in and everything the
  // live AI Assistant run needs to write real case files there itself —
  // this app no longer fabricates a case file from typed answers (that
  // produced documentation for a test that was never actually run). The
  // assistant explores and drives SAP live, then writes the case file(s)
  // directly into the selected archive using test-cases/_TEMPLATE.md's shape;
  // finalizeCaseCreation validates and registers them once the run finishes.
  function prepareCaseCreation(lane, systemId) {
    if (!['gui', 'web'].includes(lane)) throw new Error('Select SAP GUI or Fiori / WebGUI testing.');
    if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
    const system = String(systemId || '').trim() || 'DS4_100_NIIF';
    const caseDirectory = caseCreationDirectory(lane, system);
    fs.mkdirSync(caseDirectory, { recursive: true });
    // Snapshot the permanent folder so finalization registers only files made
    // by this authoring run and never mistakes an existing case for a new one.
    const existingFiles = fs.readdirSync(caseDirectory).filter((name) => name.toLowerCase().endsWith('.md'));

    const builtInDirectory = path.join(laneCasesDir(lane), system);
    const exampleCaseFile = fs.existsSync(builtInDirectory)
      ? fs.readdirSync(builtInDirectory).find((name) => name.toLowerCase().endsWith('.md'))
      : null;

    return {
      lane,
      system,
      caseDirectory,
      existingFiles,
      nextCaseId: nextExternalCaseId(),
      exampleCaseFile: exampleCaseFile ? path.join(builtInDirectory, exampleCaseFile) : '',
      templateFile: path.join(projectRoot, 'test-cases', '_TEMPLATE.md'),
    };
  }

  // Parses the "- **Header:** value" bullets every case file (built-in,
  // external, or a random one someone hands us) is written with — see
  // test-cases/_TEMPLATE.md.
  function parseCaseHeaders(content) {
    const headers = {};
    for (const line of String(content || '').split('\n')) {
      const match = line.match(/^-\s*\*\*(.+?):\*\*\s*(.*)$/);
      if (match) headers[match[1].trim()] = match[2].trim();
    }
    return headers;
  }

  // True only when a valid saved script sits beside this exact Markdown case
  // for this lane and SAP system; anything else means the case still needs its
  // first (interactive) run, which prepares the script.
  function hasSavedAutomation(filePath, lane, caseId, systemId) {
    try {
      return Boolean(filePath && systemId
        && readAutomation(filePath, fs.readFileSync(filePath, 'utf8'), { caseId, lane, systemId }));
    } catch { return false; }
  }

  // Runs once a case-creation AI Assistant run finishes: diffs the permanent
  // folder against the file list prepareCaseCreation captured before the run
  // started, and for whatever new *.md files showed up (there may be several
  // — one run can produce a case per combination it explored) validates and
  // registers each in place. A file the run never got around to writing
  // simply means nothing new is found; it does not error, since a partial or
  // interrupted run is a normal outcome, not a bug.
  function finalizeCaseCreation(lane, systemId, existingFilesBeforeRun = [], author = '') {
    if (!['gui', 'web'].includes(lane)) throw new Error('Select SAP GUI or Fiori / WebGUI testing.');
    const system = String(systemId || '').trim() || 'DS4_100_NIIF';
    const caseDirectory = caseCreationDirectory(lane, system);
    if (!fs.existsSync(caseDirectory)) return { created: [] };

    const before = new Set(Array.isArray(existingFilesBeforeRun) ? existingFilesBeforeRun : []);
    const newFiles = fs.readdirSync(caseDirectory)
      .filter((name) => name.toLowerCase().endsWith('.md') && !before.has(name));
    if (!newFiles.length) return { created: [] };

    const manifest = externalManifest();
    const created = [];
    for (const fileName of newFiles) {
      let casePath = path.join(caseDirectory, fileName);
      const content = fs.readFileSync(casePath, 'utf8');
      const headers = parseCaseHeaders(content);
      let caseId;
      try { caseId = normalizeCaseId(headers['Case id']); } catch {
        throw new Error(`${fileName} has no valid Case id header. The file was retained at ${casePath}.`);
      }
      const titleLine = content.split('\n').find((line) => line.trim().startsWith('# ')) || '';
      const summary = titleLine.replace(/^#\s*/, '').replace(/^TC-\d{3}\s*[—-]\s*/, '').trim()
        || headers['Transaction / app'] || fileName;

      // Each case lives in its own folder, [TC_nnn]_[ShortDescription], holding the
      // Markdown and its script together so the pair can be shared as one unit.
      const shortDescription = (headers['Transaction / app'] ? `${headers['Transaction / app']} ${summary}` : summary)
        .normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40).replace(/_+$/, '') || 'Testcase';
      let caseFolder = path.join(caseDirectory, `${caseId.replace('-', '_')}_${shortDescription}`);
      for (let n = 2; fs.existsSync(caseFolder); n++) caseFolder = path.join(caseDirectory, `${caseId.replace('-', '_')}_${shortDescription}_${n}`);
      fs.mkdirSync(caseFolder, { recursive: true });
      const loosePlan = candidatePath(casePath);
      const movedPath = path.join(caseFolder, fileName);
      fs.renameSync(casePath, movedPath);
      if (fs.existsSync(loosePlan)) {
        fs.mkdirSync(path.dirname(candidatePath(movedPath)), { recursive: true });
        fs.renameSync(loosePlan, candidatePath(movedPath));
        clearCandidate(casePath);
      }
      casePath = movedPath;

      const storageRoot = externalCasesRoot();
      const relativeCaseFile = path.relative(storageRoot, casePath).split(path.sep).join('/');
      const key = externalCaseKey(lane, caseId);
      const writes = headers['Writes to the database'] || 'Not classified yet.';
      let automationFile = '';
      let automationNote = '';
      try {
        automationFile = publishAutomation(casePath, { caseId, lane, systemId: system }) || '';
      } catch (error) {
        automationNote = `Case saved; repeat-run automation was not accepted: ${error.message}`;
      }
      manifest.cases[key] = {
        caseId,
        lane,
        system,
        summary,
        writes,
        transaction: headers['Transaction / app'] || '',
        caseFile: relativeCaseFile,
        createdAt: new Date().toISOString(),
        createdBy: author || currentUsername || '',
        source: 'external',
      };
      created.push({
        caseId, lane, summary, writes, source: 'external', externalLabel: 'External created TC', fileName, filePath: casePath, storageRoot, automationFile, automationNote,
      });
    }
    if (created.length) writeJsonFile(externalCasesManifestPath(), manifest);
    return { created };
  }

  function laneFromHeader(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized.startsWith('sap-gui')) return 'gui';
    if (normalized.startsWith('web')) return 'web';
    return '';
  }

  // Lets a user point the app at any TC-*.md file via a native file picker —
  // not just cases the packaged project already knows about — and, if that
  // case turns out to be registered to run (config/gui-runs.json or
  // config/runs.json), hands back everything prepareCase() needs to launch it
  // through the exact same human-confirmed pipeline as a case picked from the
  // left panel. A file that parses but isn't registered is still opened, just
  // marked not runnable, matching how an "external created" case behaves.
  async function browseCase(ownerWindow) {
    if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
    const testCasesDir = path.join(projectRoot, 'test-cases');
    const result = await dialog.showOpenDialog(ownerWindow, {
      title: 'Browse for a test case',
      defaultPath: fs.existsSync(testCasesDir) ? testCasesDir : undefined,
      filters: [{ name: 'Test case (Markdown)', extensions: ['md'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };

    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    const headers = parseCaseHeaders(content);

    let caseId;
    try {
      caseId = normalizeCaseId(headers['Case id']);
    } catch {
      throw new Error(`${path.basename(filePath)} does not have a "- **Case id:** TC-nnn" header, so it can't be recognized as a test case.`);
    }
    const lane = laneFromHeader(headers['Lane']);
    if (!lane) {
      throw new Error(`${caseId} does not declare a recognized "- **Lane:**" header (expected "sap-gui" or "web"), so it can't be identified.`);
    }

    let manifestEntry = null;
    try {
      manifestEntry = caseManifest(lane).cases?.[caseId] || null;
      // An unrelated external file may reuse a built-in id. Only the exact
      // registered case contents may dispatch to that frozen script.
      if (manifestEntry && getCaseFile(lane, caseId).content !== content) manifestEntry = null;
    } catch {
      manifestEntry = null;
    }

    const headerSystems = String(headers.System || '').split(/[\s`()[\],;]+/);
    const automationSystem = manifestEntry ? null : (systemRegistry().systems || [])
      .find((entry) => headerSystems.includes(entry.id) && hasSavedAutomation(filePath, lane, caseId, entry.id));

    return {
      canceled: false,
      caseId,
      lane,
      hasAutomation: Boolean(automationSystem),
      fileName: path.basename(filePath),
      filePath,
      content,
      summary: String(manifestEntry?.summary || headers['Transaction / app'] || ''),
      runnable: Boolean(manifestEntry),
      reason: manifestEntry || automationSystem
        ? ''
        : `${caseId} isn't registered in this project's ${lane === 'gui' ? 'config/gui-runs.json' : 'config/runs.json'} yet, so there's no frozen automation script for it — use "Run interactively" to have the AI Assistant drive it live instead.`,
    };
  }

  function prepareCase(lane, requestedCaseId, requestedStage = '', requestedCredentials = null, externalCase = null, requestedSystemId = '') {
    if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
    const caseId = normalizeCaseId(requestedCaseId);
    const requestedSystem = requestedSystemId ? configuredConnectionCheckSystem(requestedSystemId) : null;
    const manifest = caseManifest(lane);
    let testCase = manifest.cases?.[caseId];
    let external = null;
    if (externalCase) {
      const content = fs.readFileSync(externalCase.filePath, 'utf8');
      const headers = parseCaseHeaders(content);
      if (normalizeCaseId(headers['Case id']) !== caseId || laneFromHeader(headers.Lane) !== lane) {
        throw new Error('The selected testcase id or lane does not match the file. Reopen the testcase.');
      }
      const system = configuredConnectionCheckSystem(externalCase.systemId);
      if (requestedSystem && requestedSystem.id !== system.id) {
        throw new Error('The testcase system does not match the currently connected SAP system.');
      }
      if (!String(headers.System || '').split(/[\s`()[\],;]+/).includes(system.id)) {
        throw new Error('The testcase System header must match the selected SAP system before running.');
      }
      if (!headers['Writes to the database']) throw new Error('The testcase must describe its database writes before it can be approved.');
      external = { content, systemId: system.id, filePath: externalCase.filePath,
        automation: readAutomation(externalCase.filePath, content, { caseId, lane, systemId: system.id }) };
      testCase = { summary: headers['Transaction / app'] || caseId, writes: headers['Writes to the database'] };
    }
    if (!testCase) throw new Error(`${caseId} is not registered in the selected ${lane === 'gui' ? 'SAP GUI' : 'Fiori / WebGUI'} lane.`);
    const stages = Array.isArray(testCase.stages) ? testCase.stages.map(String) : [];
    const stage = String(requestedStage || testCase.defaultStage || '');
    if (requestedStage && !stages.includes(String(requestedStage))) {
      throw new Error(`${caseId} does not have stage '${requestedStage}'. Available stages: ${stages.join(', ') || 'none'}.`);
    }

    const system = external ? configuredConnectionCheckSystem(external.systemId) : (requestedSystem || configuredDefaultSystem());
    if (!external && system.id !== systemRegistry().defaultSystem) {
      throw new Error(`${caseId} is a built-in NIIF testcase. Select an external testcase created for ${system.id}.`);
    }

    // Web lane only: a username/password typed into the sidebar overrides the
    // registry's account for this run. The GUI lane logs on through the
    // already-open SAP GUI session, so credentials typed here do not apply to it.
    const username = typeof requestedCredentials?.username === 'string' ? requestedCredentials.username.trim() : '';
    const password = typeof requestedCredentials?.password === 'string' ? requestedCredentials.password : '';
    const credentials = username && password ? { username, password } : null;

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
      credentials,
      external,
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
      usesCustomCredentials: Boolean(credentials),
      source: external && !external.automation ? 'external' : 'direct',
      systemId: system.id,
    };
  }

  function finishExternalRun(run, externalRun, lane) {
  const execution = { status: run.status, error: run.error, response: run.response };
  run.status = 'finalizing';
  try {
    const result = writeExternalResult(externalRun, execution);
    run.verdict = result.verdict;
    if (!externalRun.automation && result.verdict === 'PASS' && externalRun.filePath) {
      try {
        if (caseDigest(fs.readFileSync(externalRun.filePath, 'utf8')) === caseDigest(externalRun.content)) {
          const saved = publishAutomation(externalRun.filePath,
            { caseId: externalRun.caseId, lane, systemId: externalRun.systemId },
            path.join(externalRun.workRoot, 'automation.json'));
          if (saved) run.response += '\nRepeat-run automation saved beside the testcase.';
        }
      } catch (error) {
        run.response += `\nThe test result is retained; automation could not be saved: ${error.message}`;
      }
    }
    run.resultPath = result.resultPath;
    run.response += `\n\nTest result: ${result.verdict}\nSaved result: ${result.resultPath}`;
    run.error = execution.error || result.error;
    const finish = (error = '') => {
      run.process = null;
      if (error) run.error = [run.error, error].filter(Boolean).join('\n');
      run.status = execution.status === 'stopped' ? 'stopped' : run.error ? 'failed' : 'completed';
    };
    const finalizer = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(projectRoot, 'scripts', 'finalize-external-run.ps1'),
      '-RunId', run.id, '-StartedAtUtc', externalRun.startedAt, '-Case', externalRun.caseId,
      '-Lane', lane, '-SystemId', externalRun.systemId, '-ResultsDirectory', externalRun.outputRoot,
      '-OutputRoot', path.dirname(path.dirname(externalRun.outputRoot)),
    ], {
      cwd: projectRoot,
      env: { ...process.env, ...projectLocalEnv(), FSNXT_APP_USERNAME: externalRun.username },
      windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    });
    run.process = finalizer;
    let archiveError = '';
    finalizer.stdout.on('data', (chunk) => { run.response += `\n${chunk.toString('utf8').trim()}`; });
    finalizer.stderr.on('data', (chunk) => { archiveError += chunk.toString('utf8'); });
    finalizer.once('error', (error) => finish(`Could not archive the test result: ${error.message}. The local result is retained.`));
    finalizer.once('close', (code) => finish(code === 0 ? '' : `Result archive failed: ${archiveError || `exit code ${code}`}. The local result is retained.`));
  } catch (error) {
    run.status = 'failed';
    run.error = `Could not finalize the external testcase: ${error.message}. Inspect SAP before retrying any Save.`;
  }
  }

  function startScriptedExternalCase(proposal) {
    const { external, lane, caseId } = proposal;
    const current = fs.readFileSync(external.filePath, 'utf8');
    const automation = readAutomation(external.filePath, current, { caseId, lane, systemId: proposal.systemId });
    if (caseDigest(current) !== caseDigest(external.content) || !automation || automation.sha256 !== external.automation.sha256) {
      throw new Error('The testcase or automation changed after approval. Reopen the testcase and confirm it again.');
    }
    const id = crypto.randomUUID();
    const externalRun = createExternalRun(projectRoot, archiveDir(), id, { ...proposal, ...external, username: currentUsername });
    const planFile = path.join(externalRun.workRoot, 'plan.json');
    fs.writeFileSync(planFile, JSON.stringify(automation.plan), 'utf8');
    fs.writeFileSync(path.join(externalRun.workRoot, lane === 'gui' ? 'case.py' : 'case.spec.ts'), automation.source, 'utf8');
    const env = {
      ...(electronApp.isPackaged && lane === 'web' ? webRuntimeEnvironment(process.resourcesPath) : process.env),
      ...projectLocalEnv(), SAP_SYSTEM_ID: proposal.systemId,
      FSNXT_AUTOMATION_PLAN: planFile, FSNXT_EXTERNAL_RUN_DIR: externalRun.workRoot,
      FSNXT_AUTOMATION_APPROVED: '1', FSNXT_RUN_ID: id,
      FSNXT_EXTERNAL_CASE_RUNTIME: require('url').pathToFileURL(path.join(projectRoot, 'web-tests', 'external-case.ts')).href,
      ...(proposal.credentials ? (lane === 'gui'
        ? { SAP_TEST_USERNAME: proposal.credentials.username, SAP_TEST_PASSWORD: proposal.credentials.password }
        : { SAP_WEB_USER: proposal.credentials.username, SAP_WEB_PASSWORD: proposal.credentials.password }) : {}),
    };
    const command = lane === 'gui'
      ? pythonPath || path.join(projectRoot, 'tools', 'mcp-sap-gui', '.venv', 'Scripts', 'python.exe')
      : electronApp.isPackaged ? path.join(process.resourcesPath, 'sap-web-runtime', 'node.exe') : 'node';
    const args = lane === 'gui' ? ['-m', 'gui_tests.external_case']
      : [path.join(projectRoot, 'web-tests', 'node_modules', '@playwright-sap', 'test', 'cli.js'), 'test', '--config', 'external-case.config.ts'];
    const run = { id, status: 'running', source: 'direct', response: '', sessionId: '', error: '', stdout: '', stderr: '', exitCode: null, process: null, workRoot: externalRun.workRoot };
    const child = spawn(command, args, { cwd: lane === 'gui' ? projectRoot : path.join(projectRoot, 'web-tests'), env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    run.process = child;
    runs.set(id, run);
    child.stdout.on('data', (chunk) => { run.stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { run.stderr += chunk.toString('utf8'); });
    child.once('error', (error) => { run.error = error.message; });
    child.once('close', (code) => {
      run.process = null;
      run.exitCode = code;
      run.status = run.status === 'stopping' ? 'stopped' : code === 0 && !run.error ? 'completed' : 'failed';
      run.response = run.stdout.trim();
      if (run.status === 'failed') run.error ||= run.stdout.trim() || run.stderr.trim() || 'Saved automation stopped. Inspect the result before retrying.';
      finishExternalRun(run, externalRun, lane);
    });
    return publicRun(run);
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

    if (proposal.external) {
      if (proposal.external.automation) return startScriptedExternalCase(proposal);
      return manager.start('Run the approved external testcase.', '', proposal.lane, {
        [externalAuthorization]: { ...proposal, ...proposal.external, username: currentUsername },
      });
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
      env: {
        ...(electronApp.isPackaged && proposal.lane === 'web' ? webRuntimeEnvironment(process.resourcesPath) : process.env),
        ...projectLocalEnv(),
        SAP_SYSTEM_ID: proposal.systemId,
        ...(proposal.credentials ? {
          ...(proposal.lane === 'web' ? { SAP_WEB_USER: proposal.credentials.username, SAP_WEB_PASSWORD: proposal.credentials.password } : {}),
          ...(proposal.lane === 'gui' ? { SAP_TEST_USERNAME: proposal.credentials.username, SAP_TEST_PASSWORD: proposal.credentials.password } : {}),
        } : {}),
        ...(pythonPath ? { FSNXT_PYTHON: pythonPath } : {}),
        FSNXT_ARTIFACT_ARCHIVE_DIR: archiveDir(),
        FSNXT_APP_USERNAME: currentUsername,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
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
    const token = claudeTokenStore.get();
    if (!token) return Promise.resolve({ available: true, loggedIn: false, authMethod: 'oauth_token' });
    return new Promise((resolve) => {
      let stdout = '';
      let settled = false;
      const child = spawn(claudePath, ['auth', 'status', '--json'], {
        env: claudeEnvironment(token),
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
          finish({
            available: true,
            loggedIn: code === 0 && status.loggedIn === true && status.authMethod === 'oauth_token',
            authMethod: 'oauth_token',
            tokenEnding: token.slice(-4),
          });
        } catch {
          finish({ available: true, loggedIn: false });
        }
      });
    });
  }

  const manager = {
    getProject(username = '') {
      currentUsername = typeof username === 'string' ? username : '';
      const configured = validateProject(projectRoot);
      if (!configured) return { configured: false, defaultSystemId: '', systems: [], archiveDirectory: archiveDir() };
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
          archiveDirectory: archiveDir(),
        };
      } catch {
        return { configured: true, defaultSystemId: '', systems: [], archiveDirectory: archiveDir() };
      }
    },
    async chooseArchiveDirectory(ownerWindow) {
      const current = archiveDir();
      const result = await dialog.showOpenDialog(ownerWindow, {
        title: 'Choose SAP test archive folder',
        defaultPath: current,
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return { archiveDirectory: current };
      }
      const selected = result.filePaths[0];
      const settings = readSettings();
      const usernameKey = currentUsernameKey();
      if (usernameKey) {
        writeSettings({
          ...settings,
          archiveDirectories: {
            ...(settings.archiveDirectories || {}),
            [usernameKey]: selected,
          },
        });
      } else {
        writeSettings({ ...settings, archiveDirectory: selected });
      }
      return { archiveDirectory: selected };
    },
    prepareCaseCreation,
    finalizeCaseCreation,
    listCases,
    getCaseFile,
    browseCase,
    prepareCase,
    startConfirmedCase,
    getAuthStatus,
    testConnection(systemId, requestedCredentials = null) {
      if (connectionCheckProcess) {
        throw new Error('An SAP connection check is already running.');
      }
      if ([...runs.values()].some((run) => !FINAL_STATUSES.has(run.status))) {
        throw new Error('Another SAP request is already running. Wait for it to finish or stop it first.');
      }
      const system = configuredConnectionCheckSystem(systemId);
      const username = typeof requestedCredentials?.username === 'string' ? requestedCredentials.username.trim() : '';
      const password = typeof requestedCredentials?.password === 'string' ? requestedCredentials.password : '';
      if (!username || !password) throw new Error('Enter an SAP username and password.');
      if (!system.rfc?.applicationServer || !/^\d{2}$/.test(String(system.rfc.systemNumber))) {
        throw new Error('The default SAP system has no valid RFC connection metadata.');
      }
      const scriptPath = path.join(projectRoot, 'scripts', 'test-sap-gui-login.ps1');
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
          env: {
            ...process.env,
            ...(pythonPath ? { FSNXT_PYTHON: pythonPath } : {}),
            SAP_TEST_USERNAME: username,
            SAP_TEST_PASSWORD: password,
            NO_COLOR: '1',
            FORCE_COLOR: '0',
          },
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
              reason: userFacingConnectionReason(result.reason),
            });
          } catch {
            finish({ connected: false, reason: 'The SAP connection check returned an invalid result.' });
          }
        });
      });
    },
    // Opens a brand-new, logged-on SAP GUI session and leaves it running —
    // the same sap_connect (not sap_connect_existing) every frozen-script
    // GUI-lane run already does via gui_tests/session.py's GuiSession.login()
    // (CLAUDE.md rule 2/9). Used before "Run interactively" on a case with no
    // frozen script, so the AI Assistant has a known-good session to attach
    // to instead of guessing whether one is already open.
    openGuiSession(systemId, requestedCredentials = null) {
      if ([...runs.values()].some((run) => !FINAL_STATUSES.has(run.status))) {
        throw new Error('Another SAP request is already running. Wait for it to finish or stop it first.');
      }
      const system = configuredConnectionCheckSystem(systemId);
      const username = typeof requestedCredentials?.username === 'string' ? requestedCredentials.username.trim() : '';
      const password = typeof requestedCredentials?.password === 'string' ? requestedCredentials.password : '';
      if (!username || !password) throw new Error('Enter an SAP username and password before opening a session.');
      if (!system.rfc?.applicationServer || !/^\d{2}$/.test(String(system.rfc.systemNumber))) {
        throw new Error('The selected SAP system has no valid RFC connection metadata.');
      }
      const scriptPath = path.join(projectRoot, 'scripts', 'open-gui-session.ps1');
      if (!fs.existsSync(scriptPath)) {
        throw new Error('The SAP session opener is missing. Reinstall the application.');
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
          env: {
            ...process.env,
            ...(pythonPath ? { FSNXT_PYTHON: pythonPath } : {}),
            SAP_TEST_USERNAME: username,
            SAP_TEST_PASSWORD: password,
            NO_COLOR: '1',
            FORCE_COLOR: '0',
          },
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        const finish = (result) => { if (!settled) { settled = true; resolve(result); } };

        child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
        child.once('error', () => finish({ opened: false, reason: 'Could not start the SAP session opener.' }));
        child.once('close', () => {
          try {
            const result = JSON.parse(stdout.trim());
            finish({
              opened: result.connected === true,
              user: typeof result.user === 'string' ? result.user : '',
              reason: userFacingConnectionReason(result.reason, 'The SAP GUI window closed unexpectedly.'),
            });
          } catch {
            finish({ opened: false, reason: 'The SAP session opener returned an invalid result.' });
          }
        });
      });
    },
    configureToken(token) {
      claudeTokenStore.set(token);
      return getAuthStatus();
    },
    clearToken() {
      claudeTokenStore.clear();
      return { available: true, loggedIn: false, authMethod: 'oauth_token' };
    },
    start(prompt, previousSessionId = '', lane = 'gui', options = {}) {
      if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
      const oauthToken = claudeTokenStore.get();
      if (!oauthToken) throw new Error('Configure a Claude OAuth token before using the AI Assistant.');
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Type what you want the AI Assistant to do.');
      if (previousSessionId && !/^[0-9a-f-]{36}$/i.test(previousSessionId)) throw new Error('The AI Assistant session is invalid. Start a new chat.');
      if (!['gui', 'web'].includes(lane)) throw new Error('Select SAP GUI or Fiori / WebGUI testing.');
      const caseCreation = options?.caseCreation || null;
      const caseCreationSystem = caseCreation ? configuredConnectionCheckSystem(caseCreation.systemId) : null;
      if ([...runs.values()].some((run) => !FINAL_STATUSES.has(run.status))) {
        throw new Error('Another SAP request is already running. Wait for it to finish or stop it first.');
      }
      const id = crypto.randomUUID();
      const externalRun = options?.[externalAuthorization]
        ? createExternalRun(projectRoot, archiveDir(), id, options[externalAuthorization]) : null;
      const externalRunSystem = externalRun ? configuredConnectionCheckSystem(externalRun.systemId) : null;
      const approvedGuiTool = lane === 'gui'
        ? sapGuiMcpToolPattern(caseCreationSystem || externalRunSystem)
        : '';
      const creationDirectory = caseCreation ? caseCreationDirectory(lane, caseCreation.systemId) : '';
      // Approved testcase operations must use only their explicit allowlist.
      // Auto mode can still classifier-block a pre-approved SAP policy tool;
      // dontAsk runs allowed tools and rejects everything else without a prompt.
      const permissionMode = caseCreation || externalRun ? 'dontAsk' : 'auto';
      if (externalRun) prompt = externalRunPrompt(externalRun);
      if (caseCreation) prompt += '\n\n' + automationPrompt(lane, creationDirectory);

      const laneGuidance = lane === 'gui'
        ? 'The user selected the SAP GUI lane. Use GUI-lane cases and scripts/run-gui-case.ps1 for runnable tests.'
        : 'The user selected the Fiori / WebGUI lane. Use web-lane cases and scripts/run-case.ps1 for runnable tests.';

      const args = [
        '-p', prompt.trim(),
        '--output-format', 'json',
        '--permission-mode', permissionMode,
        '--append-system-prompt', `${DISPLAY_GUIDANCE} ${laneGuidance}${caseCreation ? ` This is an FSNXT testcase creation run on ${caseCreation.systemId}. The user authorizes saving the requested deal as part of creating the testcase. Announce the Save and perform it without asking for another chat confirmation or popup. This authorization satisfies rule 3 for this requested scenario only. Verify the target SAP system before writing. Do not add settlement, posting, or other writes beyond the request. Verify the saved document number from SAP, then write the Markdown testcase directly to ${creationDirectory} before finishing. Do not create a testcase copy anywhere else. If blocked, write the observed partial steps and exact failure there; never claim an unverified save or repeat a Save whose outcome is uncertain.` : ''}`,
      ];
      if (caseCreation) {
        args.push('--add-dir', creationDirectory);
        args.push('--allowedTools', ...(approvedGuiTool ? [approvedGuiTool] : []), claudeAbsoluteEditRule(creationDirectory));
      }
      if (externalRun) {
        args.push('--allowedTools', ...(approvedGuiTool ? [approvedGuiTool] : []),
          `Edit(/${externalRun.relativeRoot}/**)`);
      }
      if (previousSessionId) args.push('--resume', previousSessionId);

      const run = {
        id,
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
        env: {
          ...claudeEnvironment(oauthToken, run.id, caseCreation, lane, externalRun),
          ...(externalRun ? { SAP_SYSTEM_ID: externalRun.systemId } : {}),
          ...(externalRun?.credentials && lane === 'web' ? { SAP_WEB_USER: externalRun.credentials.username, SAP_WEB_PASSWORD: externalRun.credentials.password } : {}),
        },
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      run.process = child;
      runs.set(run.id, run);

      child.stdout.on('data', (chunk) => { run.stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk) => { run.stderr += chunk.toString('utf8'); });
      // Up to two correction passes per case; each reuses the creation session so the
      // discovered control ids and observed values are still in context.
      async function repairAutomation(run, missing) {
        for (const created of missing) {
          const identity = { caseId: created.caseId, lane, systemId: caseCreation.systemId };
          for (let attempt = 0; attempt < 2 && !created.automationFile; attempt++) {
            const destination = candidatePath(created.filePath);
            const reason = created.automationNote || 'No automation plan was found beside the testcase.';
            const repairPrompt = [
              `The Markdown testcase ${created.filePath} was saved, but its repeat-run automation plan was not accepted: ${reason}`,
              `Do NOT use any SAP tool and do not perform any SAP action. Using only the steps, control ids and values you already observed in this session, write a corrected plan to ${destination}.`,
              automationPrompt(lane, destination),
            ].join('\n\n');
            await new Promise((resolve) => {
              const repair = spawn(claudePath, ['-p', repairPrompt, '--output-format', 'json', '--permission-mode', 'dontAsk',
                '--add-dir', creationDirectory, '--allowedTools', claudeAbsoluteEditRule(creationDirectory), '--resume', run.sessionId], {
                cwd: projectRoot, env: claudeEnvironment(oauthToken, run.id, caseCreation, lane, externalRun),
                windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'ignore'],
              });
              run.process = repair;
              repair.once('error', resolve);
              repair.once('close', resolve);
            });
            run.process = null;
            try {
              created.automationFile = publishAutomation(created.filePath, identity) || '';
              created.automationNote = created.automationFile ? '' : 'No passing automation plan was written.';
            } catch (error) {
              created.automationNote = `Repeat-run automation was not accepted: ${error.message}`;
            }
          }
          if (!created.automationFile) clearCandidate(created.filePath);
          if (!created.automationFile) run.response +=`\n${created.caseId}: saved without a script. ${created.automationNote}`;
          else run.response += `\n${created.caseId}: automation script saved beside the testcase (${path.basename(created.automationFile)}).`;
        }
      }
      const { setTimeout: sleep } = require('timers/promises');

      function readObservations(workRoot) {
        try { return JSON.parse(fs.readFileSync(path.join(workRoot, 'observations.json'), 'utf8').replace(/^﻿/, '')); } catch { return null; }
      }

      function failureEvidence(observations, attemptRun) {
        const lines = [];
        if (observations) {
          if (observations.summary) lines.push(`Runner summary: ${observations.summary}`);
          const failed = (observations.assertions || []).filter((row) => row?.result !== 'pass');
          failed.forEach((row) => lines.push(`Failed assertion: ${row.expected} | observed: ${row.observed}`));
          const steps = observations.steps || [];
          lines.push(`Steps: ${steps.filter((row) => row?.outcome === 'ok').length} of ${steps.length} recorded steps completed.`);
          steps.filter((row) => row?.outcome !== 'ok').forEach((row) => lines.push(`Step that did not complete: ${row.step} (${row.outcome}) ${row.detail || ''}`));
          (observations.deviations || []).forEach((row) => lines.push(`Deviation: ${row}`));
          (observations.documents || []).forEach((row) => lines.push(`Document written before the stop: ${row.type} ${row.number}`));
        } else {
          lines.push('The runner produced no readable observation record.');
        }
        const tail = `${attemptRun.stderr || ''}\n${attemptRun.stdout || ''}`.trim().slice(-2000);
        if (tail) lines.push(`Runner console tail:\n${tail}`);
        return lines.join('\n');
      }

      // One scripted dry run of the freshly created case, through the same
      // runner a user's Confirm & Run uses. Resolves with its verdict and evidence.
      async function runScriptedAttempt(created, identity) {
        const content = fs.readFileSync(created.filePath, 'utf8');
        const automation = readAutomation(created.filePath, content, identity);
        if (!automation) return { verdict: 'BLOCKED', summary: 'The saved automation does not match the testcase.', evidence: '' };
        let started;
        try {
          started = startScriptedExternalCase({
            lane, caseId: created.caseId, systemId: identity.systemId, credentials: null,
            summary: created.summary, writes: created.writes,
            external: { content, systemId: identity.systemId, filePath: created.filePath, automation },
          });
        } catch (error) {
          return { verdict: 'BLOCKED', summary: error.message, evidence: '' };
        }
        const attemptRun = runs.get(started.id);
        run.process = attemptRun.process;
        // No wall-clock limit: a run ends when its runner does. The one case that never
        // reports a close is a runner that could not start at all (it has no pid).
        while (!FINAL_STATUSES.has(attemptRun.status)) {
          if (attemptRun.error && attemptRun.process && attemptRun.process.pid === undefined) {
            attemptRun.status = 'failed';
            break;
          }
          await sleep(VERIFY_POLL_MS);
        }
        run.process = null;
        const observations = readObservations(attemptRun.workRoot);
        // The verdict normally comes from the result file the app writes. If that step
        // itself broke after a clean run, trust the runner's own verified PASS instead
        // of reporting a passing dry run as failed.
        const runnerPassed = attemptRun.exitCode === 0 && observations?.verdict === 'PASS'
          && observations.writesVerified === true && observations.systemConfirmed === true;
        return {
          verdict: attemptRun.verdict || (runnerPassed ? 'PASS' : 'FAIL'),
          summary: observations?.summary || attemptRun.error || 'The dry run failed.',
          evidence: failureEvidence(observations, attemptRun),
          resultPath: attemptRun.resultPath || '',
          documents: (observations?.documents || []).map((row) => `${row.type} ${row.number}`),
        };
      }

      // The creation session sees the failure evidence and repairs the Markdown and/or
      // the plan. No SAP tool is granted: the repair works from what was observed.
      async function repairFromDryRun(created, identity, attempt, outcome) {
        const markdownBefore = fs.readFileSync(created.filePath, 'utf8');
        const current = readAutomation(created.filePath, markdownBefore, identity);
        if (!current) return { changed: false, note: 'The saved automation could not be read back.' };
        const destination = candidatePath(created.filePath);
        const seeded = JSON.stringify(current.plan, null, 2);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, seeded, 'utf8');
        const prompt = [
          `The testcase ${created.filePath} was just created and its saved repeat-run automation failed automatic dry run ${attempt} of ${MAX_VERIFY_ATTEMPTS}. Verdict: ${outcome.verdict}.`,
          `Evidence from the dry run:\n${outcome.evidence || outcome.summary}`,
          `The current plan is at ${destination}. Edit that plan so the next dry run passes, and edit the Markdown ${created.filePath} only where the documented flow or expected values were wrong or must stay consistent with the plan.`,
          'Do NOT use any SAP tool and do not perform any SAP action; work only from what you observed while creating this case and from the evidence above. Fix the cause, not the symptom: add a missing step (for example key "0" so SAP derives a value, a tab step, an explicit fill for a value SAP only remembers per user), or correct a control id or expected value the evidence proves wrong. Never weaken or delete an assertion to make it pass, never remove a write or its verification, and never add database writes beyond this case. If the failure is environmental (SAP not logged on, wrong system, data already used) or a genuine product defect, change nothing and say why.',
          'Reply with one short paragraph saying what you changed and why.',
          automationPrompt(lane, destination),
        ].join('\n\n');
        const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'dontAsk',
          '--add-dir', creationDirectory, '--allowedTools', claudeAbsoluteEditRule(creationDirectory)];
        if (run.sessionId) args.push('--resume', run.sessionId);
        let note = '';
        await new Promise((resolve) => {
          const repair = spawn(claudePath, args, {
            cwd: projectRoot, env: claudeEnvironment(oauthToken, run.id, caseCreation, lane, externalRun),
            windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'],
          });
          run.process = repair;
          let out = '';
          repair.stdout?.on('data', (chunk) => { out += chunk.toString('utf8'); });
          const done = () => { note = parseClaudeResult(out, '').response || ''; resolve(); };
          repair.once('error', done);
          repair.once('close', done);
        });
        run.process = null;
        const markdownAfter = fs.readFileSync(created.filePath, 'utf8');
        const candidate = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : seeded;
        const changed = markdownAfter !== markdownBefore || candidate !== seeded;
        try {
          if (!publishAutomation(created.filePath, identity)) throw new Error('No passing automation plan was written.');
        } catch (error) {
          // Never leave the case without a valid script: put the previous version back.
          fs.writeFileSync(created.filePath, markdownBefore, 'utf8');
          fs.writeFileSync(destination, seeded, 'utf8');
          publishAutomation(created.filePath, identity);
          return { changed: false, note: `The proposed repair was not accepted (${error.message}) and was discarded.` };
        }
        return { changed, note: note || (changed ? 'Repair applied.' : 'No change was proposed.') };
      }

      function recordVerification(created, identity, attempts, passed) {
        created.verification = { status: passed ? 'passed' : 'failed', attempts: attempts.length };
        const log = [
          `# ${created.caseId} verification — ${passed ? 'PASSED' : 'FAILED'}`, '',
          passed ? `The saved automation passed dry run ${attempts.length} of ${MAX_VERIFY_ATTEMPTS}.`
            : `The saved automation did not pass within ${MAX_VERIFY_ATTEMPTS} dry runs. The Markdown and script beside this file are the latest draft, kept for reference.`,
          '',
          ...attempts.flatMap((entry) => [
            `## Dry run ${entry.attempt}: ${entry.verdict}`, '', entry.summary || '',
            ...(entry.documents?.length ? ['', `Documents written: ${entry.documents.join(', ')}`] : []),
            ...(entry.evidence ? ['', '```', entry.evidence, '```'] : []),
            ...(entry.fix ? ['', `AI repair: ${entry.fix}`] : []), '',
          ]),
        ].join('\n');
        try { fs.writeFileSync(path.join(path.dirname(created.filePath), 'verification-log.md'), log, 'utf8'); } catch { /* the draft itself is already saved */ }
        try {
          const manifest = externalManifest();
          const entry = manifest.cases[externalCaseKey(lane, created.caseId)];
          if (entry) { entry.verification = created.verification; writeJsonFile(externalCasesManifestPath(), manifest); }
        } catch { /* the manifest is refreshed on the next creation */ }
      }

      // TC created -> dry run -> (fail -> AI repair -> dry run) ... at most
      // MAX_VERIFY_ATTEMPTS dry runs; stops at the first pass.
      async function verifyCreatedCases(run) {
        for (const created of run.createdCases || []) {
          if (!created.automationFile) continue;
          const identity = { caseId: created.caseId, lane, systemId: caseCreation.systemId };
          const attempts = [];
          let passed = false;
          for (let attempt = 1; attempt <= MAX_VERIFY_ATTEMPTS && !passed; attempt++) {
            run.response += `\n${created.caseId}: dry run ${attempt} of ${MAX_VERIFY_ATTEMPTS} started.`;
            const outcome = await runScriptedAttempt(created, identity);
            const entry = { attempt, ...outcome };
            attempts.push(entry);
            if (outcome.verdict === 'PASS') { passed = true; break; }
            // Detail goes to verification-log.md; the chat only says it did not pass yet.
            run.response += `\n${created.caseId}: dry run ${attempt} did not pass.`;
            if (attempt === MAX_VERIFY_ATTEMPTS) break;
            run.response += ' The AI Assistant is checking how to fix it.';
            const repaired = await repairFromDryRun(created, identity, attempt, outcome);
            entry.fix = repaired.note;
            run.response += `\n${created.caseId}: ${repaired.note}`;
            if (!repaired.changed) break;
          }
          recordVerification(created, identity, attempts, passed);
          if (passed) {
            const repairs = attempts.length - 1;
            run.response += `\n${created.caseId}: Test case creation succeeded — the saved automation passed dry run ${attempts.length} of ${MAX_VERIFY_ATTEMPTS}${repairs ? ` after ${repairs} AI repair${repairs > 1 ? 's' : ''}` : ''}.`;
          } else {
            const last = attempts.at(-1);
            run.response += `\n${created.caseId}: Test case creation failed — the automation did not pass a dry run (last: ${last?.verdict} — ${last?.summary}). The latest draft is saved at ${created.filePath} with verification-log.md for reference.`;
            run.error = [run.error, `${created.caseId}: test case creation failed after ${attempts.length} dry run(s); draft retained with verification-log.md.`].filter(Boolean).join('\n');
          }
        }
      }
      child.once('error', (error) => {
        if (!externalRun) run.status = 'failed';
        run.error = error.code === 'ENOENT'
          ? 'The bundled AI Assistant runtime is missing. Reinstall the application.'
          : error.message;
      });
      child.once('close', (code) => {
        run.process = null;
        run.exitCode = code;
        // Whatever sap-save-confirmation.ps1 dropped for this run is done
        // mattering the moment the run itself ends — an unanswered request
        // left behind (the process was killed before the hook's own timeout)
        // would otherwise sit in logs/elicitation-requests forever.
        cleanupElicitationFiles(run.id);
        const parsed = parseClaudeResult(run.stdout, run.stderr);
        run.response = parsed.response;
        run.sessionId = parsed.sessionId || run.sessionId;
        if (run.status === 'stopping') {
          run.status = 'stopped';
        } else if (run.status !== 'failed') {
          run.error = run.error || parsed.error || (code === 0 ? '' : 'AI Assistant could not complete the request. Check that you are signed in.');
          run.status = code === 0 && !run.error ? 'completed' : 'failed';
        }
        // Register files from the selected archive even if the user left this screen.
        if (caseCreation) {
          try {
            run.createdCases = finalizeCaseCreation(lane, caseCreation.systemId, caseCreation.existingFiles, caseCreation.author).created;
            if (!run.createdCases.length && run.status === 'completed') {
              run.status = 'failed';
              run.error = 'Testcase creation is unfinished: no Markdown file was produced. Continue this testcase in chat; verify the existing SAP deal before retrying any Save.';
            }
            // A case must leave with its script. If the plan was missing or rejected, the
            // same AI session (no SAP tools, no new writes) corrects the plan from what it observed.
            const missing = run.createdCases.filter((created) => !created.automationFile);
            const canRepair = run.status === 'completed' && Boolean(run.sessionId);
            if (missing.length && !canRepair) missing.forEach((created) => clearCandidate(created.filePath));
            // Every case that has a script is then dry-run immediately; a failing run
            // hands the evidence to the AI, which repairs the case before the next run.
            if (run.status === 'completed' && ((missing.length && canRepair) || run.createdCases.some((created) => created.automationFile))) {
              run.status = 'finalizing';
              (async () => {
                if (missing.length && canRepair) await repairAutomation(run, missing);
                await verifyCreatedCases(run);
              })().catch((error) => { run.error = [run.error, `Testcase verification stopped: ${error.message}`].filter(Boolean).join('\n'); })
                .finally(() => { run.status = run.error ? 'failed' : 'completed'; });
            }
          } catch (error) {
            run.error = `The testcase remains in the selected folder but could not be registered: ${error.message}`;
            run.status = 'failed';
          }
        }
        if (externalRun) finishExternalRun(run, externalRun, lane);
      });
      return publicRun(run);
    },
    getRun(runId) {
      return publicRun(requireRun(runId));
    },
    stop(runId) {
      const run = requireRun(runId);
      if (run.status === 'finalizing') throw new Error('The test has finished. Wait for its result archive and upload to finish.');
      if (!run.process || FINAL_STATUSES.has(run.status)) throw new Error('AI Assistant has already finished responding.');
      run.status = 'stopping';
      // Tidy up now rather than relying on the close handler: killing the
      // process tree does not guarantee sap-save-confirmation.ps1 (a child of
      // it) dies with it, so it may keep polling out its own timeout with
      // nothing left to answer it either way — this at least leaves no
      // request file behind in the meantime.
      cleanupElicitationFiles(run.id);
      run.process.kill();
      return publicRun(run);
    },
    answerElicitation,
    stopAll() {
      connectionCheckProcess?.kill();
      runs.forEach((run) => run.process?.kill());
      workspace.cleanup();
    },
  };
  return manager;
}

module.exports = { createSapTerminalManager };
