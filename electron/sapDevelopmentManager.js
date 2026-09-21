const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FINAL_STATUSES = new Set(['completed', 'failed', 'stopped']);
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
  if (!electronApp.isPackaged) {
    return path.resolve(__dirname, '..', 'packages', 'SAP-Project-Development V1');
  }
  return path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'packages',
    'SAP-Project-Development V1',
  );
}

function validateSource(sourceRoot) {
  return [
    path.join(sourceRoot, 'AGENTS.md'),
    path.join(sourceRoot, 'CLAUDE.md'),
    path.join(sourceRoot, 'config', 'sap-systems.json'),
    path.join(sourceRoot, 'tools', 'mcp-abap-adt-api', 'node_modules', 'mcp-abap-abap-adt-api', 'dist', 'index.js'),
    path.join(sourceRoot, 'tools', 'mcp-sap-gui', '.venv', 'Scripts', 'python.exe'),
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

function createSapDevelopmentManager(electronApp, claudeTokenStore) {
  const runs = new Map();
  const sourceRoot = developmentSourceRoot(electronApp);
  const claudePath = claudeExecutable(electronApp);
  const claudeConfigDir = path.join(electronApp.getPath('userData'), 'claude-runtime');
  let runtime = null;

  fs.mkdirSync(claudeConfigDir, { recursive: true });

  function sourceLocalEnvironment() {
    const settings = readJson(path.join(sourceRoot, '.claude', 'settings.local.json'));
    return settings && typeof settings.env === 'object' && settings.env ? settings.env : {};
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
    if (!validateSource(sourceRoot)) {
      throw new Error('The SAP Development package is missing required MCP runtimes or project files.');
    }
    runtime = createRuntimeCopy(sourceRoot);
    return runtime;
  }

  function writeRuntimeConfiguration(system, credentials) {
    const activeRuntime = ensureRuntime();
    const localEnvironment = sourceLocalEnvironment();
    const passwordVariable = system.adt?.passwordEnvVar || 'SAP_DEVELOPMENT_PASSWORD';
    const username = String(credentials?.username || system.adt?.user || '').trim();
    const password = String(credentials?.password || localEnvironment[passwordVariable] || '');
    const adtToken = String(process.env.ADT_MCP_TOKEN || localEnvironment.ADT_MCP_TOKEN || '');
    if (!username || !password) throw new Error('Enter the SAP username and password before starting development.');
    if (!adtToken) {
      throw new Error('The VS Code ADT MCP token is missing. Keep VS Code open and configure ADT_MCP_TOKEN for this project.');
    }

    const nodeEntry = path.join(sourceRoot, 'tools', 'mcp-abap-adt-api', 'node_modules', 'mcp-abap-abap-adt-api', 'dist', 'index.js');
    const guiPython = path.join(sourceRoot, 'tools', 'mcp-sap-gui', '.venv', 'Scripts', 'python.exe');
    const auditLog = path.join(activeRuntime.projectRoot, 'logs', 'sap-gui-audit.jsonl');
    const serverNames = ['adt-mcp', 'mcp-abap-abap-adt-api'];
    const mcpServers = {
      'adt-mcp': {
        type: 'http',
        url: 'http://localhost:2236/mcp',
        headers: { Authorization: 'Bearer ${ADT_MCP_TOKEN}' },
      },
      'mcp-abap-abap-adt-api': {
        command: process.execPath,
        args: [nodeEntry],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          SAP_URL: String(system.adt.url),
          SAP_USER: username,
          SAP_PASSWORD: '${SAP_DEVELOPMENT_PASSWORD}',
          SAP_CLIENT: String(system.client || '100'),
          SAP_LANGUAGE: String(system.language || 'EN'),
          NODE_TLS_REJECT_UNAUTHORIZED: system.adt.tlsRejectUnauthorized === false ? '0' : '1',
        },
      },
    };

    if (system.sapGui?.enabled !== false && fs.existsSync(guiPython)) {
      serverNames.push('sap-gui');
      const args = ['-m', 'mcp_sap_gui.server'];
      if (system.sapGui?.readOnly) args.push('--read-only');
      args.push('--profile', String(system.sapGui?.profile || 'full'), '--audit-log', auditLog);
      if (Array.isArray(system.sapGui?.allowedTransactions) && system.sapGui.allowedTransactions.length) {
        args.push('--allowed-transactions', ...system.sapGui.allowedTransactions.map(String));
      }
      mcpServers['sap-gui'] = {
        command: guiPython,
        args,
        env: {
          SAP_USER: username,
          SAP_PASSWORD: '${SAP_DEVELOPMENT_PASSWORD}',
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
      adtToken,
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
    };
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
    getStatus() {
      const localEnvironment = sourceLocalEnvironment();
      return {
        configured: validateSource(sourceRoot),
        companionTokenConfigured: Boolean(process.env.ADT_MCP_TOKEN || localEnvironment.ADT_MCP_TOKEN),
        sourceFolder: sourceRoot,
      };
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
        '--append-system-prompt', `${DISPLAY_GUIDANCE} The user selected ${system.label || system.id} [${system.id}]. Confirm the active ADT destination and SAP system before every write.`,
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
        process: null,
      };
      const childEnvironment = {
        ...process.env,
        ADT_MCP_TOKEN: configuration.adtToken,
        SAP_DEVELOPMENT_PASSWORD: configuration.password,
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
        if (run.status === 'failed' && run.error) return;
        run.error = parsed.error || (code === 0 ? '' : 'SAP Development Assistant could not complete the request.');
        run.status = code === 0 && !run.error ? 'completed' : 'failed';
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

module.exports = { createSapDevelopmentManager };
