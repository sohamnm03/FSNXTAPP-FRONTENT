const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createSapAutomationWorkspace } = require('./sapAutomationWorkspace');
const { webRuntimeEnvironment } = require('./sapWebRuntime');

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
  const claudePath = claudeExecutable(electronApp);
  const pythonPath = bundledPython(electronApp);
  const workspace = await createSapAutomationWorkspace(electronApp);
  let connectionCheckProcess = null;
  let currentUsername = '';
  const claudeConfigDir = path.join(electronApp.getPath('userData'), 'claude-runtime');
  const settingsPath = path.join(electronApp.getPath('userData'), 'sap-terminal-settings.json');
  const projectRoot = workspace.projectRoot;
  const externalCasesRoot = path.join(electronApp.getPath('documents'), 'FSNXT SAP Test Cases');
  const externalCasesManifestPath = path.join(externalCasesRoot, 'config', 'external-cases.json');
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

  function claudeEnvironment(token) {
    const env = {
      ...(electronApp.isPackaged ? webRuntimeEnvironment(process.resourcesPath) : process.env),
      NO_COLOR: '1', FORCE_COLOR: '0', CLAUDE_CONFIG_DIR: claudeConfigDir,
      FSNXT_ARTIFACT_ARCHIVE_DIR: archiveDir(),
      FSNXT_APP_USERNAME: currentUsername,
    };
    if (pythonPath) env.FSNXT_PYTHON = pythonPath;
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    if (token) env.CLAUDE_CODE_OAUTH_TOKEN = token;
    return env;
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

  function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function laneLabel(lane) {
    return lane === 'gui' ? 'SAP GUI' : 'Web';
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
    return path.join(externalCasesRoot, 'test-cases', laneCaseFolder(lane), system);
  }

  function readJsonFile(filePath, fallback) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return fallback;
    }
  }

  function writeJsonFile(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  function externalManifest() {
    const parsed = readJsonFile(externalCasesManifestPath, null);
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

  function nextExternalCaseId(lane) {
    const builtInManifest = caseManifest(lane);
    const builtInIds = Object.keys(builtInManifest.cases || {});
    const externalIds = externalCaseEntries(lane).map((item) => item.entry.caseId);
    const highest = [...builtInIds, ...externalIds].reduce((max, caseId) => Math.max(max, caseNumber(caseId)), 0);
    return `TC-${String(highest + 1).padStart(3, '0')}`;
  }

  function sanitizeFilePart(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
  }

  function sanitizeText(value, fallback = '') {
    const text = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    return text || fallback;
  }

  function markdownTableRows(value, blankCount) {
    const lines = sanitizeText(value).split('\n').map((line) => line.trim()).filter(Boolean);
    const blanks = Array.from({ length: blankCount }, () => '').join(' | ');
    if (!lines.length) return `| 1 | ${blanks} |\n`;
    return lines.map((line, index) => `| ${index + 1} | ${line.replace(/\|/g, '\\|')} | ${blanks} |`).join('\n');
  }

  function buildExternalCaseMarkdown(lane, systemId, caseId, payload, author) {
    const summary = sanitizeText(payload.summary, 'User-created SAP test case');
    const transaction = sanitizeText(payload.transaction, '-');
    const purpose = sanitizeText(payload.purpose, summary);
    const writes = sanitizeText(payload.writes, 'Draft - writes not classified yet.');
    const preconditions = markdownTableRows(payload.preconditions, 1);
    const testData = markdownTableRows(payload.testData, 2);
    const steps = markdownTableRows(payload.steps, 2);
    const assertions = markdownTableRows(payload.assertions, 3);
    const cleanup = sanitizeText(payload.cleanup, 'None specified.');
    const system = sanitizeText(systemId, 'DS4_100_NIIF');
    const caseType = sanitizeText(payload.caseType, 'functional');
    const status = sanitizeText(payload.status, 'draft');
    const laneName = lane === 'gui' ? 'sap-gui (SAP GUI for Windows)' : 'web (Fiori / WebGUI / UI5)';
    return `# ${caseId} - ${transaction}: ${summary}

- **Case id:** ${caseId}
- **Lane:** ${laneName}
- **Transaction / app:** ${transaction}
- **Spec file:** - external documentation-only case
- **System:** ${system}
- **Type:** ${caseType}
- **Author:** ${sanitizeText(author, 'FSNXT app user')}
- **Created:** ${todayIsoDate()}
- **Status:** ${status}
- **Source:** External created TC
- **Writes to the database:** ${writes}

## Purpose

${purpose}

## Preconditions

| # | Condition | How to check |
|---|---|---|
${preconditions}

## Test data

| # | Field | Technical name | Value |
|---|---|---|---|
${testData}

## Steps

${lane === 'gui' ? 'GUI lane:' : 'Web lane:'}

| # | Action | Tool / API | Element / argument |
|---|---|---|---|
${steps}

## Assertions

| # | Field / source | Technical name | Expected | Read with |
|---|---|---|---|---|
${assertions}

## Writes

${writes}

## Cleanup

${cleanup}

## Known deviations

None recorded.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|
| | | | |
`;
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

  function listCases(lane) {
    if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
    const manifest = caseManifest(lane);
    const builtInCases = Object.entries(manifest.cases || {})
      .map(([caseId, entry]) => ({
        caseId,
        summary: String(entry.summary || ''),
        writes: String(entry.writes || ''),
        stages: Array.isArray(entry.stages) ? entry.stages.map(String) : [],
        defaultStage: entry.defaultStage ? String(entry.defaultStage) : '',
        hasFile: Boolean(findCaseMarkdownFile(lane, caseId, entry)),
        source: 'built-in',
      }));
    const externalCases = externalCaseEntries(lane)
      .map(({ entry }) => ({
        caseId: String(entry.caseId || ''),
        summary: String(entry.summary || ''),
        writes: String(entry.writes || ''),
        stages: [],
        defaultStage: '',
        hasFile: typeof entry.caseFile === 'string' && fs.existsSync(path.join(externalCasesRoot, entry.caseFile)),
        source: 'external',
        externalLabel: 'External created TC',
        filePath: typeof entry.caseFile === 'string' ? path.join(externalCasesRoot, entry.caseFile) : '',
      }))
      .filter((entry) => /^TC-\d{3}$/.test(entry.caseId));
    const cases = [...builtInCases, ...externalCases]
      .sort((a, b) => caseNumber(a.caseId) - caseNumber(b.caseId) || a.caseId.localeCompare(b.caseId));
    return { lane, cases };
  }

  function getCaseFile(lane, requestedCaseId) {
    if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
    const caseId = normalizeCaseId(requestedCaseId);
    const manifest = caseManifest(lane);
    const entry = manifest.cases?.[caseId];
    if (!entry) {
      const externalEntry = externalCaseEntries(lane).find((item) => item.entry.caseId === caseId)?.entry;
      if (!externalEntry?.caseFile) {
        throw new Error(`${caseId} is not registered in the selected ${lane === 'gui' ? 'SAP GUI' : 'Fiori / WebGUI'} lane.`);
      }
      const externalPath = path.join(externalCasesRoot, externalEntry.caseFile);
      if (!fs.existsSync(externalPath)) throw new Error(`No documentation file was found for ${caseId}.`);
      return {
        caseId,
        fileName: path.basename(externalPath),
        content: fs.readFileSync(externalPath, 'utf8'),
        source: 'external',
        externalLabel: 'External created TC',
        filePath: externalPath,
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

  function createCase(lane, systemId, payload = {}) {
    if (!['gui', 'web'].includes(lane)) throw new Error('Select SAP GUI or Fiori / WebGUI testing.');
    if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
    const system = String(systemId || '').trim() || 'DS4_100_NIIF';
    const summary = sanitizeText(payload.summary);
    if (!summary) throw new Error('Enter a test case summary.');
    const transaction = sanitizeText(payload.transaction);
    if (!transaction) throw new Error('Enter the SAP transaction or app name.');
    const purpose = sanitizeText(payload.purpose);
    if (!purpose) throw new Error('Enter the test purpose.');
    const steps = sanitizeText(payload.steps);
    if (!steps) throw new Error('Enter at least one test step.');

    const caseId = nextExternalCaseId(lane);
    const slug = sanitizeFilePart(`${transaction}-${summary}`) || `external-${caseId.toLowerCase()}`;
    const fileName = `${caseId}-${slug}-${lane === 'gui' ? 'gui' : 'web'}.md`;
    const caseDirectory = externalLaneCasesDir(lane, system);
    const filePath = path.join(caseDirectory, fileName);
    fs.mkdirSync(caseDirectory, { recursive: true });
    if (fs.existsSync(filePath)) throw new Error(`${caseId} already exists in the external test case folder.`);

    const author = currentUsername || payload.author || '';
    const markdown = buildExternalCaseMarkdown(lane, system, caseId, payload, author);
    fs.writeFileSync(filePath, markdown, 'utf8');

    const manifest = externalManifest();
    const relativeCaseFile = path.relative(externalCasesRoot, filePath).split(path.sep).join('/');
    manifest.cases[externalCaseKey(lane, caseId)] = {
      caseId,
      lane,
      system,
      summary,
      writes: sanitizeText(payload.writes, 'Draft - writes not classified yet.'),
      transaction,
      caseFile: relativeCaseFile,
      createdAt: new Date().toISOString(),
      createdBy: author,
      source: 'external',
    };
    writeJsonFile(externalCasesManifestPath, manifest);

    return {
      caseId,
      lane,
      summary,
      writes: manifest.cases[externalCaseKey(lane, caseId)].writes,
      source: 'external',
      externalLabel: 'External created TC',
      fileName,
      filePath,
      storageRoot: externalCasesRoot,
    };
  }

  // Parses the "- **Header:** value" bullets every case file (built-in,
  // external, or a random one someone hands us) is written with — see
  // test-cases/_TEMPLATE.md and buildExternalCaseMarkdown() above.
  function parseCaseHeaders(content) {
    const headers = {};
    for (const line of String(content || '').split('\n')) {
      const match = line.match(/^-\s*\*\*(.+?):\*\*\s*(.*)$/);
      if (match) headers[match[1].trim()] = match[2].trim();
    }
    return headers;
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
    } catch {
      manifestEntry = null;
    }

    return {
      canceled: false,
      caseId,
      lane,
      fileName: path.basename(filePath),
      filePath,
      content,
      summary: String(manifestEntry?.summary || headers['Transaction / app'] || ''),
      runnable: Boolean(manifestEntry),
      reason: manifestEntry
        ? ''
        : `${caseId} isn't registered in this project's ${lane === 'gui' ? 'config/gui-runs.json' : 'config/runs.json'} yet, so there's no frozen automation script for it — use "Run interactively" to have the AI Assistant drive it live instead.`,
    };
  }

  function prepareCase(lane, requestedCaseId, requestedStage = '', requestedCredentials = null) {
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

  return {
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
    createCase,
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
              reason: typeof result.reason === 'string' ? result.reason : '',
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
              reason: typeof result.reason === 'string' ? result.reason : '',
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
    start(prompt, previousSessionId = '', lane = 'gui') {
      if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
      const oauthToken = claudeTokenStore.get();
      if (!oauthToken) throw new Error('Configure a Claude OAuth token before using the AI Assistant.');
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
        env: claudeEnvironment(oauthToken),
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
      connectionCheckProcess?.kill();
      runs.forEach((run) => run.process?.kill());
      workspace.cleanup();
    },
  };
}

module.exports = { createSapTerminalManager };
