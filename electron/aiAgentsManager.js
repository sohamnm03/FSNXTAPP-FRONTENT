const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stopped', 'timed_out']);
const SECRET_KEY_PATTERN = /password|passwd|secret|token|api[_-]?key|credential|role_test_users|extra_role_users/i;
const INLINE_SECRET_PATTERN = /(password|passwd|secret|token|api[_-]?key)(\s*[:=]\s*)([^\s,;]+)/gi;

function isoNow() {
  return new Date().toISOString();
}

function collectSecrets(value, key = '', found = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSecrets(item, key, found));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([childKey, child]) => collectSecrets(child, childKey, found));
  } else if (SECRET_KEY_PATTERN.test(key) && value !== null && value !== undefined && String(value).length >= 3) {
    found.add(String(value));
  }
  return found;
}

function redact(value, secrets) {
  let safe = String(value);
  [...secrets].sort((left, right) => right.length - left.length).forEach((secret) => {
    safe = safe.split(secret).join('[REDACTED]');
  });
  return safe.replace(INLINE_SECRET_PATTERN, '$1$2[REDACTED]');
}

function ensureDirectChild(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (path.dirname(resolved) !== resolvedRoot) throw new Error('Invalid run directory.');
  return resolved;
}

function ensureArtifactPath(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error('The artifact path is invalid.');
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('The artifact path is invalid.');
  }
  return resolved;
}

function validateInputs(inputs, manifest) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    throw new Error('inputs must be an object.');
  }
  const required = new Map(manifest.required_inputs.map((item) => [item.name, item]));
  const optional = new Map(manifest.optional_inputs.map((item) => [item.name, item]));
  const allowed = new Map([...required, ...optional]);
  const unknown = Object.keys(inputs).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unknown input(s): ${unknown.sort().join(', ')}`);

  const missing = [...required.keys()].filter((key) => inputs[key] === '' || inputs[key] === null || inputs[key] === undefined);
  if (missing.length) throw new Error(`Missing required input(s): ${missing.join(', ')}`);

  Object.entries(inputs).forEach(([key, value]) => {
    const specification = allowed.get(key);
    const expected = specification.type || 'string';
    if (expected === 'string' && typeof value !== 'string') throw new Error(`${key} must be a string.`);
    if (expected === 'boolean' && typeof value !== 'boolean') throw new Error(`${key} must be a boolean.`);
    if (expected === 'array' && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) {
      throw new Error(`${key} must be an array of strings.`);
    }
    if (specification.format === 'url') {
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        throw new Error(`${key} must be an HTTP(S) URL without embedded credentials.`);
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error(`${key} must be an HTTP(S) URL without embedded credentials.`);
      }
    }
  });

  (inputs.routes || []).forEach((route) => {
    if (!route.startsWith('/') || route.includes('..') || route.includes('\\') || route.includes('\0')) {
      throw new Error('routes must be absolute URL paths without traversal.');
    }
  });
  return { ...inputs };
}

function listFiles(root, current = root) {
  if (!fs.existsSync(current)) return [];
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return listFiles(root, entryPath);
    if (!entry.isFile() || entry.name === 'run.log') return [];
    return [{
      path: path.relative(root, entryPath).split(path.sep).join('/'),
      size_bytes: fs.statSync(entryPath).size,
    }];
  });
}

function publicRun(run) {
  return {
    id: run.id,
    status: run.status,
    created_at: run.createdAt,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    exit_status: run.exitStatus,
    result: run.result,
    error: run.error,
  };
}

function createAiAgentsManager(electronApp, dialog) {
  const packageRoot = electronApp.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'packages', 'ai_agents')
    : path.resolve(__dirname, '..', 'packages', 'ai_agents');
  const runtimeRoot = path.join(electronApp.getPath('userData'), 'ai_agents', 'runtime');
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'manifest.json'), 'utf8'));
  const runs = new Map();
  fs.mkdirSync(runtimeRoot, { recursive: true });

  function workerCommand() {
    if (!electronApp.isPackaged) {
      return {
        executable: process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3'),
        prefixArguments: [path.join(packageRoot, 'worker.py')],
      };
    }

    const executable = path.join(process.resourcesPath, 'python-worker', 'ai-agents-worker.exe');
    if (!fs.existsSync(executable)) {
      throw new Error('The bundled AI Agents worker is missing. Rebuild the Windows installer with npm run package:win.');
    }
    return { executable, prefixArguments: [] };
  }

  function requireRun(runId) {
    const run = runs.get(runId);
    if (!run) throw new Error('Run not found.');
    return run;
  }

  function appendLog(run, chunk) {
    const safe = redact(chunk, run.secrets);
    fs.appendFileSync(run.logPath, safe, 'utf8');
  }

  function finishRun(run, code) {
    run.process = null;
    run.exitStatus = code;
    run.finishedAt = isoNow();
    if (run.status === 'stopping') {
      run.status = 'stopped';
      run.error = 'Run stopped by user.';
      return;
    }
    if (run.status === 'timing_out') {
      run.status = 'timed_out';
      run.error = 'Run exceeded its configured timeout.';
      return;
    }
    const resultPath = path.join(run.outputDirectory, 'result.json');
    if (code === 0 && fs.existsSync(resultPath)) {
      run.status = 'completed';
      run.result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      return;
    }
    const errorPath = path.join(run.outputDirectory, 'error.json');
    run.status = 'failed';
    run.error = fs.existsSync(errorPath)
      ? redact(JSON.parse(fs.readFileSync(errorPath, 'utf8')).error || 'AI Agents worker exited unsuccessfully.', run.secrets)
      : 'AI Agents worker exited unsuccessfully.';
  }

  function start(inputs) {
    const validated = validateInputs(inputs, manifest);
    const command = workerCommand();
    const runId = crypto.randomUUID();
    const outputDirectory = ensureDirectChild(runtimeRoot, path.join(runtimeRoot, runId));
    fs.mkdirSync(outputDirectory, { recursive: false });
    const run = {
      id: runId,
      status: 'queued',
      createdAt: isoNow(),
      startedAt: null,
      finishedAt: null,
      exitStatus: null,
      result: null,
      error: null,
      outputDirectory,
      logPath: path.join(outputDirectory, 'run.log'),
      process: null,
      timeout: null,
      secrets: collectSecrets(validated),
    };
    fs.writeFileSync(run.logPath, '', 'utf8');
    runs.set(runId, run);

    const child = spawn(command.executable, [
      ...command.prefixArguments,
      '--run-id', runId,
      '--runtime-root', runtimeRoot,
      '--output-dir', outputDirectory,
    ], {
      cwd: packageRoot,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    run.process = child;
    child.once('spawn', () => {
      run.status = 'running';
      run.startedAt = isoNow();
    });
    child.stdout.on('data', (chunk) => appendLog(run, chunk));
    child.stderr.on('data', (chunk) => appendLog(run, chunk));
    child.once('error', (error) => {
      if (!TERMINAL_STATUSES.has(run.status)) {
        run.status = 'failed';
        run.error = redact(error.message, run.secrets);
        run.finishedAt = isoNow();
      }
    });
    child.once('close', (code) => {
      clearTimeout(run.timeout);
      if (!TERMINAL_STATUSES.has(run.status)) finishRun(run, code);
    });
    run.timeout = setTimeout(() => {
      if (run.process && !TERMINAL_STATUSES.has(run.status)) {
        run.status = 'timing_out';
        run.process.kill();
      }
    }, Math.min(Number(manifest.timeout_seconds || 900), 900) * 1000);
    child.stdin.end(JSON.stringify(validated));
    return { run_id: runId, status: 'queued' };
  }

  return {
    start,
    getRun(runId) {
      return publicRun(requireRun(runId));
    },
    getLogs(runId) {
      const run = requireRun(runId);
      return { run_id: runId, logs: fs.existsSync(run.logPath) ? fs.readFileSync(run.logPath, 'utf8') : '' };
    },
    getArtifacts(runId) {
      const run = requireRun(runId);
      return {
        run_id: runId,
        artifacts: listFiles(run.outputDirectory).map((artifact) => ({ ...artifact, run_id: runId })),
      };
    },
    stop(runId) {
      const run = requireRun(runId);
      if (!run.process || TERMINAL_STATUSES.has(run.status)) throw new Error('Run is already in a terminal state.');
      run.status = 'stopping';
      run.process.kill();
      return { run_id: runId, status: 'stopping' };
    },
    async download(runId, relativePath, ownerWindow) {
      const run = requireRun(runId);
      const source = ensureArtifactPath(run.outputDirectory, relativePath);
      if (!fs.existsSync(source) || !fs.statSync(source).isFile() || path.basename(source) === 'run.log') {
        throw new Error('Artifact not found.');
      }
      const selection = await dialog.showSaveDialog(ownerWindow, {
        defaultPath: path.join(electronApp.getPath('downloads'), path.basename(source)),
      });
      if (selection.canceled || !selection.filePath) return { canceled: true };
      fs.copyFileSync(source, selection.filePath);
      return { canceled: false, path: selection.filePath };
    },
    stopAll() {
      runs.forEach((run) => {
        if (run.process && !TERMINAL_STATUSES.has(run.status)) run.process.kill();
      });
    },
  };
}

module.exports = { createAiAgentsManager };
