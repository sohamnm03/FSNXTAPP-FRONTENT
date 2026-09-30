const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateDevelopmentReport } = require('./sapDevelopmentReport');
const { uploadDevelopmentReport } = require('./sapDevelopmentUpload');

const FINAL_STATUSES = new Set(['completed', 'failed', 'stopped']);
const DEVELOPMENT_FOLDER_NAME = 'Sap-Project-Development V1';
const DEVELOPMENT_REPORT_FOLDER_NAME = 'FS Sprint Development Reports';
const DISPLAY_GUIDANCE = [
  'You are running inside the FSNXT SAP Development desktop companion.',
  'Follow AGENTS.md and CLAUDE.md in this runtime workspace exactly.',
  'The packages source folder is protected; this working directory is an isolated runtime copy.',
  'Use the configured MCP servers for SAP work and keep user-facing responses concise and actionable.',
  'Never claim an SAP object was changed, activated, tested, or transported unless the tool result verifies it.',
].join(' ');

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

function developmentSourceRoot(electronApp) {
  const packageRoot = electronApp.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'packages', DEVELOPMENT_FOLDER_NAME)
    : path.resolve(__dirname, '..', 'packages', DEVELOPMENT_FOLDER_NAME);
  const nestedProjectRoot = path.join(packageRoot, DEVELOPMENT_FOLDER_NAME);

  // Updated distributions keep the actual Claude workspace one level below
  // the package container. Retain the legacy fallback so existing installs
  // that placed AGENTS.md directly in the outer folder still work.
  if (fs.existsSync(path.join(nestedProjectRoot, 'AGENTS.md'))) return nestedProjectRoot;
  return packageRoot;
}

function developmentPython(electronApp, sourceRoot) {
  const candidates = [
    process.env.FSNXT_PYTHON,
    electronApp.isPackaged ? path.join(process.resourcesPath, 'python', 'python.exe') : '',
    !electronApp.isPackaged ? path.resolve(__dirname, '..', '.build', 'python-runtime', 'python', 'python.exe') : '',
    path.join(sourceRoot, 'tools', 'mcp-sap-gui', '.venv', 'Scripts', 'python.exe'),
  ].filter(Boolean);

  return candidates.find((candidate) => {
    if (!fs.existsSync(candidate)) return false;
    const venvConfig = path.resolve(candidate, '..', '..', 'pyvenv.cfg');
    if (!fs.existsSync(venvConfig)) return true;
    const configuredExecutable = fs.readFileSync(venvConfig, 'utf8').match(/^executable\s*=\s*(.+)$/im)?.[1]?.trim();
    return !configuredExecutable || fs.existsSync(configuredExecutable);
  }) || '';
}

function developmentNode(electronApp) {
  const resourcesPath = electronApp.resourcesPath || process.resourcesPath;
  const candidates = [
    process.env.FSNXT_NODE,
    electronApp.isPackaged && resourcesPath ? path.join(resourcesPath, 'node', 'node.exe') : '',
    !electronApp.isPackaged ? path.resolve(__dirname, '..', '.build', 'node-runtime', 'node', 'node.exe') : '',
    !electronApp.isPackaged ? process.env.npm_node_execpath : '',
    !electronApp.isPackaged && process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : '',
    !electronApp.isPackaged && !process.versions.electron ? process.execPath : '',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function developmentMcpRuntime(electronApp, sourceRoot) {
  const runtimeRoot = electronApp.isPackaged
    ? path.join(electronApp.resourcesPath || process.resourcesPath, 'sap-development-mcp')
    : path.join(sourceRoot, 'tools', 'mcp-abap-adt-api');
  const modulesRoot = path.join(runtimeRoot, electronApp.isPackaged ? 'modules' : 'node_modules');
  return {
    entry: path.join(modulesRoot, 'mcp-abap-abap-adt-api', 'dist', 'index.js'),
    modulesRoot,
  };
}

function verifyDirectMcpServer(nodePath, nodeEntry, environment = {}) {
  if (!nodePath || !fs.existsSync(nodePath)) {
    return { ready: false, reason: 'The standalone Node.js MCP runtime is missing.' };
  }
  if (!fs.existsSync(nodeEntry)) {
    return { ready: false, reason: 'The bundled SAP ADT API MCP server is missing.' };
  }
  const result = spawnSync(nodePath, [nodeEntry], {
    cwd: path.dirname(nodeEntry),
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    input: '',
    shell: false,
    timeout: 10000,
    windowsHide: true,
  });
  if (!result.error && result.status === 0) return { ready: true, reason: '' };
  const detail = String(result.stderr || result.error?.message || '').trim();
  return {
    ready: false,
    reason: detail || 'The bundled SAP ADT API MCP server could not start.',
  };
}

function validateSource(sourceRoot, nodeEntry) {
  return [
    path.join(sourceRoot, 'AGENTS.md'),
    path.join(sourceRoot, 'CLAUDE.md'),
    path.join(sourceRoot, 'config', 'sap-systems.json'),
    nodeEntry,
  ].every((candidate) => fs.existsSync(candidate));
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function parseClaudeResult(stdout, stderr) {
  try {
    const payload = JSON.parse(stdout.trim());
    return {
      response: typeof payload.result === 'string' ? payload.result.trim() : '',
      sessionId: payload.session_id || '',
      error: payload.is_error ? (payload.result || 'SAP Development Assistant could not complete the request.') : '',
    };
  } catch {
    const fallback = stdout.trim() || stderr.trim();
    return {
      response: fallback,
      sessionId: '',
      error: fallback || 'SAP Development Assistant returned an unreadable response.',
    };
  }
}

function removeRuntimeDirectory(runtimeRoot) {
  if (!runtimeRoot) return;
  const resolved = path.resolve(runtimeRoot);
  const expectedParent = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== expectedParent || !path.basename(resolved).startsWith('fsnxt-sap-development-')) return;
  try {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // A child process may briefly retain a handle while the application closes.
  }
}

function createRuntimeCopy(sourceRoot) {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `fsnxt-sap-development-${process.pid}-`));
  const projectRoot = path.join(runtimeRoot, 'SAP-Project-Development V1');
  const duplicateFolderName = path.basename(sourceRoot).toLowerCase();

  try {
    fs.cpSync(sourceRoot, projectRoot, {
      recursive: true,
      filter(source) {
        const relative = path.relative(sourceRoot, source);
        if (!relative) return true;
        const normalized = relative.replace(/\\/g, '/');
        const parts = normalized.toLowerCase().split('/');
        if (parts[0] === duplicateFolderName) return false;
        if (parts.includes('node_modules') || parts.includes('.venv') || parts.includes('__pycache__')) return false;
        if (parts.includes('logs') || parts.includes('evidence')) return false;
        if (normalized.toLowerCase().startsWith('dashboard/output/')) return false;
        if (normalized.toLowerCase().startsWith('graphify-out/cache/')) return false;
        if (normalized.toLowerCase() === '.mcp.json') return false;
        if (normalized.toLowerCase() === '.claude/settings.local.json') return false;
        if (/^(cookies|headers|response_.*)\.txt$/i.test(path.basename(normalized))) return false;
        if (/^response_.*\.json$/i.test(path.basename(normalized))) return false;
        return true;
      },
    });
    return { runtimeRoot, projectRoot };
  } catch (error) {
    removeRuntimeDirectory(runtimeRoot);
    throw error;
  }
}

function captureWorklogState(projectRoot) {
  const worklogRoot = path.join(projectRoot, 'worklog');
  const state = new Map();
  if (!fs.existsSync(worklogRoot)) return state;

  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() !== 'evidence') visit(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') && entry.name !== '_TEMPLATE.md') {
        const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');
        const stats = fs.statSync(fullPath);
        state.set(relativePath, `${stats.size}:${stats.mtimeMs}`);
      }
    }
  };
  visit(worklogRoot);
  return state;
}

function changedWorklogPaths(projectRoot, previousState) {
  const currentState = captureWorklogState(projectRoot);
  return [...currentState.entries()]
    .filter(([relativePath, signature]) => previousState.get(relativePath) !== signature)
    .map(([relativePath]) => relativePath);
}

function sanitizeForFolderName(value) {
  return String(value || '').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
}

function createSapDevelopmentManager(electronApp, claudeTokenStore, desktop = {}) {
  const runs = new Map();
  const sourceRoot = developmentSourceRoot(electronApp);
  const pythonPath = developmentPython(electronApp, sourceRoot);
  const nodePath = developmentNode(electronApp);
  const mcpRuntime = developmentMcpRuntime(electronApp, sourceRoot);
  const nodeEntry = mcpRuntime.entry;
  const claudePath = claudeExecutable(electronApp);
  const claudeConfigDir = path.join(electronApp.getPath('userData'), 'claude-runtime');
  const settingsPath = path.join(electronApp.getPath('userData'), 'sap-development-settings.json');
  let currentUsername = '';
  let runtime = null;

  fs.mkdirSync(claudeConfigDir, { recursive: true });

  function sourceLocalEnvironment() {
    const settings = readJson(path.join(sourceRoot, '.claude', 'settings.local.json'));
    return settings && typeof settings.env === 'object' && settings.env ? settings.env : {};
  }

  function readSettings() {
    return readJson(settingsPath, {});
  }

  function writeSettings(settings) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  }

  function currentUsernameKey() {
    return sanitizeForFolderName(currentUsername).toLowerCase();
  }

  function defaultReportsRoot() {
    return path.join(electronApp.getPath('downloads'), DEVELOPMENT_REPORT_FOLDER_NAME);
  }

  function reportsRoot() {
    const settings = readSettings();
    const usernameKey = currentUsernameKey();
    const selected = usernameKey
      ? settings.reportDirectories?.[usernameKey]
      : settings.reportDirectory;
    return typeof selected === 'string' && selected.trim() ? selected : defaultReportsRoot();
  }

  function systemRegistry() {
    return readJson(path.join(sourceRoot, 'config', 'sap-systems.json'), { systems: [] });
  }

  function configuredSystem(systemId) {
    const registry = systemRegistry();
    const selectedId = String(systemId || registry.defaultSystem || '');
    const system = (registry.systems || []).find((entry) => entry.id === selectedId && entry.enabled !== false);
    if (!system) throw new Error('Select an enabled SAP Development system.');
    if (!system.adt?.url) throw new Error('The selected SAP system has no ADT endpoint.');
    return system;
  }

  function ensureRuntime() {
    if (runtime && fs.existsSync(runtime.projectRoot)) return runtime;
    if (!validateSource(sourceRoot, nodeEntry)) {
      throw new Error('The SAP Development package is missing required MCP runtimes or project files.');
    }
    runtime = createRuntimeCopy(sourceRoot);
    return runtime;
  }

  function writeRuntimeConfiguration(system, credentials) {
    const activeRuntime = ensureRuntime();
    const localEnvironment = sourceLocalEnvironment();
    const registry = systemRegistry();
    const passwordVariable = String(system.adt?.passwordEnvVar || 'SAP_DEVELOPMENT_PASSWORD');
    const username = String(credentials?.username || system.adt?.user || '').trim();
    const password = String(credentials?.password || localEnvironment[passwordVariable] || '');
    if (!username || !password) throw new Error('Enter the SAP username and password before starting development.');

    const auditLog = path.join(activeRuntime.projectRoot, 'logs', 'sap-gui-audit.jsonl');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(passwordVariable)) {
      throw new Error('The selected SAP system has an invalid password environment variable name.');
    }
    const directServerName = String(system.mcpServerName
      || (system.id === registry.defaultSystem
        ? 'mcp-abap-abap-adt-api'
        : `abap-adt-${String(system.systemId).toLowerCase()}-${system.client}`));
    const directEnvironment = {
      NODE_PATH: mcpRuntime.modulesRoot,
      SAP_URL: String(system.adt.url),
      SAP_USER: username,
      SAP_PASSWORD: password,
      SAP_CLIENT: String(system.client || '100'),
      SAP_LANGUAGE: String(system.language || 'EN'),
      NODE_TLS_REJECT_UNAUTHORIZED: system.adt.tlsRejectUnauthorized === false ? '0' : '1',
    };
    const directRuntime = verifyDirectMcpServer(nodePath, nodeEntry, directEnvironment);
    if (!directRuntime.ready) {
      console.error(`[SAP Development] MCP startup failed: ${directRuntime.reason}`);
      throw new Error('SAP Development tools could not start. Please reinstall FS Sprint or contact support.');
    }

    const serverNames = [directServerName];
    const mcpServers = {
      [directServerName]: {
        command: nodePath,
        args: [nodeEntry],
        env: {
          NODE_PATH: mcpRuntime.modulesRoot,
          SAP_URL: String(system.adt.url),
          SAP_USER: username,
          SAP_PASSWORD: `\${${passwordVariable}}`,
          SAP_CLIENT: String(system.client || '100'),
          SAP_LANGUAGE: String(system.language || 'EN'),
          NODE_TLS_REJECT_UNAUTHORIZED: system.adt.tlsRejectUnauthorized === false ? '0' : '1',
        },
      },
    };

    if (system.sapGui?.enabled === true) {
      if (!pythonPath) throw new Error('The SAP GUI Python runtime is missing. Reinstall the application.');
      const guiServerName = String(system.sapGui.mcpServerName
        || (system.id === registry.defaultSystem
          ? 'sap-gui'
          : `sap-gui-${String(system.systemId).toLowerCase()}-${system.client}`));
      serverNames.push(guiServerName);
      const args = ['-m', 'mcp_sap_gui.server'];
      if (system.sapGui?.readOnly) args.push('--read-only');
      args.push('--profile', String(system.sapGui?.profile || 'full'), '--audit-log', auditLog);
      if (Array.isArray(system.sapGui?.allowedTransactions) && system.sapGui.allowedTransactions.length) {
        args.push('--allowed-transactions', ...system.sapGui.allowedTransactions.map(String));
      }
      mcpServers[guiServerName] = {
        command: pythonPath,
        args,
        env: {
          SAP_USER: username,
          SAP_PASSWORD: `\${${passwordVariable}}`,
          SAP_CLIENT: String(system.client || '100'),
          SAP_LANGUAGE: String(system.language || 'EN'),
        },
      };
    }

    const mcpPath = path.join(activeRuntime.projectRoot, '.mcp.runtime.json');
    fs.writeFileSync(mcpPath, JSON.stringify({ mcpServers }, null, 2), 'utf8');
    const localSettingsPath = path.join(activeRuntime.projectRoot, '.claude', 'settings.local.json');
    fs.mkdirSync(path.dirname(localSettingsPath), { recursive: true });
    const sourceSettings = readJson(path.join(sourceRoot, '.claude', 'settings.local.json'));
    fs.writeFileSync(localSettingsPath, JSON.stringify({
      ...(sourceSettings.permissions ? { permissions: sourceSettings.permissions } : {}),
      enabledMcpjsonServers: serverNames,
    }, null, 2), 'utf8');

    return {
      mcpPath,
      password,
      projectRoot: activeRuntime.projectRoot,
      system,
      username,
    };
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
      reportError: run.reportError,
      reportPath: run.reportPath,
      reportUrl: run.reportUrl,
    };
  }

  async function finalizeReport(run, finalStatus, projectRoot) {
    try {
      const report = await generateDevelopmentReport({
        completedWorklogPaths: finalStatus === 'completed'
          ? changedWorklogPaths(projectRoot, run.worklogState)
          : [],
        projectRoot,
        reportsRoot: run.reportsRoot,
        runId: run.id,
        openPath: desktop.openPath,
        uploadReport: (reportPath) => uploadDevelopmentReport({
          electronApp, reportPath, runId: run.id, username: run.username,
          connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING
            || sourceLocalEnvironment().AZURE_STORAGE_CONNECTION_STRING,
        }),
      });
      run.reportPath = report.reportPath;
      run.reportUrl = report.reportUrl;
      run.reportError = [
        report.openError ? `The report was saved, but could not be opened automatically: ${report.openError}` : '',
        report.uploadError ? `The report was saved locally, but could not be uploaded to Azure: ${report.uploadError}` : '',
      ].filter(Boolean).join(' ');
    } catch (error) {
      run.reportError = `The development request finished, but its HTML report could not be generated: ${error.message}`;
    } finally {
      run.status = finalStatus;
    }
  }

  function getAuthStatus() {
    const token = claudeTokenStore.get();
    if (!token) return Promise.resolve({ available: true, loggedIn: false, authMethod: 'oauth_token' });
    return new Promise((resolve) => {
      let stdout = '';
      let settled = false;
      const child = spawn(claudePath, ['auth', 'status', '--json'], {
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: claudeConfigDir,
          CLAUDE_CODE_OAUTH_TOKEN: token,
        },
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
    getStatus(username = '') {
      currentUsername = typeof username === 'string' ? username : '';
      const registry = systemRegistry();
      const systems = (registry.systems || [])
        .filter((system) => system.enabled !== false)
        .map((system) => ({
          id: String(system.id),
          name: String(system.label || system.sapGui?.logonDescription || system.id),
        }));
      return {
        configured: validateSource(sourceRoot, nodeEntry) && Boolean(nodePath),
        directMcpRuntimeConfigured: Boolean(nodePath),
        defaultSystemId: String(registry.defaultSystem || systems[0]?.id || ''),
        reportDirectory: reportsRoot(),
        sapGuiRuntimeConfigured: Boolean(pythonPath),
        sourceFolder: sourceRoot,
        systems,
      };
    },
    async chooseReportDirectory(ownerWindow) {
      const current = reportsRoot();
      const result = await desktop.chooseDirectory?.(ownerWindow, {
        title: 'Choose FS Sprint development report folder',
        defaultPath: current,
        properties: ['openDirectory', 'createDirectory'],
      });
      if (!result || result.canceled || !result.filePaths?.[0]) {
        return { reportDirectory: current };
      }
      const selectedParent = result.filePaths[0];
      const selected = path.basename(selectedParent).toLowerCase() === DEVELOPMENT_REPORT_FOLDER_NAME.toLowerCase()
        ? selectedParent
        : path.join(selectedParent, DEVELOPMENT_REPORT_FOLDER_NAME);
      const settings = readSettings();
      const usernameKey = currentUsernameKey();
      if (usernameKey) {
        writeSettings({
          ...settings,
          reportDirectories: {
            ...(settings.reportDirectories || {}),
            [usernameKey]: selected,
          },
        });
      } else {
        writeSettings({ ...settings, reportDirectory: selected });
      }
      return { reportDirectory: selected };
    },
    getAuthStatus,
    configureToken(token) {
      claudeTokenStore.set(token);
      return getAuthStatus();
    },
    clearToken() {
      claudeTokenStore.clear();
      return { available: true, loggedIn: false, authMethod: 'oauth_token' };
    },
    start(prompt, previousSessionId = '', systemId = '', credentials = null) {
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Type what you want the SAP Development Assistant to do.');
      if (previousSessionId && !/^[0-9a-f-]{36}$/i.test(previousSessionId)) {
        throw new Error('The SAP Development Assistant session is invalid. Start a new chat.');
      }
      if ([...runs.values()].some((run) => !FINAL_STATUSES.has(run.status))) {
        throw new Error('Another SAP Development request is already running.');
      }
      const oauthToken = claudeTokenStore.get();
      if (!oauthToken) throw new Error('Configure a Claude OAuth token before using SAP Development.');
      const system = configuredSystem(systemId);
      const configuration = writeRuntimeConfiguration(system, credentials);
      const id = crypto.randomUUID();
      const args = [
        '-p', prompt.trim(),
        '--output-format', 'json',
        '--permission-mode', 'auto',
        '--strict-mcp-config',
        '--mcp-config', configuration.mcpPath,
        '--append-system-prompt', `${DISPLAY_GUIDANCE} Desktop runtime policy: use the configured ${system.mcpServerName || 'mcp-abap-abap-adt-api'} server directly for all supported SAP reads, creations, edits, locks, activations, and transport operations. The official adt-mcp service is intentionally not connected in this standalone app; never search for it, wait for it, or treat its absence as a blocker. The user selected ${system.label || system.id} [${system.id}]. Confirm the active SAP system through the direct API before every write. The desktop app has already validated the credentials and opened the SAP GUI session${system.sapGui?.logonDescription ? ` on "${system.sapGui.logonDescription}"` : ''}. Never ask the user to log on to SAP manually: for screen work first attach with sap_connect_existing and verify the user and system with sap_get_session_info; only if no session is open, call sap_connect with the configured credentials.`,
      ];
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
        reportError: '',
        reportPath: '',
        reportUrl: '',
        username: currentUsername,
        reportsRoot: reportsRoot(),
        worklogState: captureWorklogState(configuration.projectRoot),
        process: null,
      };
      const childEnvironment = {
        ...process.env,
        [system.adt?.passwordEnvVar || 'SAP_DEVELOPMENT_PASSWORD']: configuration.password,
        SAP_URL: String(system.adt.url),
        SAP_USER: configuration.username,
        SAP_PASSWORD: configuration.password,
        SAP_CLIENT: String(system.client || '100'),
        SAP_LANGUAGE: String(system.language || 'EN'),
        CLAUDE_CONFIG_DIR: claudeConfigDir,
        CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
        MCP_TIMEOUT: '600000',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      };
      delete childEnvironment.ANTHROPIC_API_KEY;
      delete childEnvironment.ANTHROPIC_AUTH_TOKEN;

      const child = spawn(claudePath, args, {
        cwd: configuration.projectRoot,
        env: childEnvironment,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      run.process = child;
      runs.set(id, run);
      child.stdout.on('data', (chunk) => { run.stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk) => { run.stderr += chunk.toString('utf8'); });
      child.once('error', (error) => {
        run.status = 'failed';
        run.error = error.code === 'ENOENT'
          ? 'The Claude Code runtime is missing. Reinstall the application.'
          : error.message;
      });
      child.once('close', (code) => {
        run.process = null;
        run.exitCode = code;
        const parsed = parseClaudeResult(run.stdout, run.stderr);
        run.response = parsed.response;
        run.sessionId = parsed.sessionId || run.sessionId;
        if (run.status === 'stopping') {
          run.status = 'stopped';
          return;
        }
        if (!(run.status === 'failed' && run.error)) {
          run.error = parsed.error || (code === 0 ? '' : 'SAP Development Assistant could not complete the request.');
        }
        const finalStatus = code === 0 && !run.error ? 'completed' : 'failed';
        if (finalStatus === 'completed') {
          run.status = 'finalizing';
          void finalizeReport(run, finalStatus, configuration.projectRoot);
        } else {
          run.status = finalStatus;
        }
      });
      return publicRun(run);
    },
    getRun(runId) {
      const run = runs.get(runId);
      if (!run) throw new Error('SAP Development request not found.');
      return publicRun(run);
    },
    stop(runId) {
      const run = runs.get(runId);
      if (!run) throw new Error('SAP Development request not found.');
      if (!run.process || FINAL_STATUSES.has(run.status)) throw new Error('SAP Development Assistant has already finished.');
      run.status = 'stopping';
      run.process.kill();
      return publicRun(run);
    },
    stopAll() {
      runs.forEach((run) => run.process?.kill());
      if (runtime) removeRuntimeDirectory(runtime.runtimeRoot);
      runtime = null;
    },
  };

  return manager;
}

module.exports = {
  createSapDevelopmentManager,
  developmentMcpRuntime,
  developmentNode,
  verifyDirectMcpServer,
};
