const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createSapAutomationWorkspace } = require('./sapAutomationWorkspace');
const { webRuntimeEnvironment } = require('./sapWebRuntime');
const { createExternalRun, externalRunPrompt, writeExternalResult } = require('./sapExternalRun');

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
  const externalAuthorization = Symbol('confirmed external testcase');
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
      FSNXT_CASE_DRAFT_DIR: caseCreation ? caseDraftDirectory(lane, caseCreation.systemId) : '',
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
    return path.join(externalCasesRoot, 'test-cases', laneCaseFolder(lane), system);
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

  // Where the AI Assistant is told to write a case it is authoring, before
  // this app relocates it. Deliberately INSIDE projectRoot (the same cwd the
  // spawned claude.exe process already gets — see start() below), never the
  // user's persistent externalCasesRoot (Documents\FSNXT SAP Test Cases):
  // that folder is often outside the sandboxed/packaged process's working
  // tree, and --permission-mode auto is not something we've verified lets a
  // headless `claude -p` write to an arbitrary absolute path outside its cwd.
  // Writing inside cwd is unambiguous — every other file this app already
  // has Claude Code touch (results/*.md, evidence/*, the case it reads to run
  // interactively) is cwd-relative too. finalizeCaseCreation() below copies
  // whatever lands here into the real, persistent folder afterward.
  function caseDraftDirectory(lane, system) {
    return path.join(projectRoot, '.case-drafts', lane, system);
  }

  // Picks the folder a newly authored case belongs in and everything the
  // live AI Assistant run needs to write real case files there itself —
  // this app no longer fabricates a case file from typed answers (that
  // produced documentation for a test that was never actually run). The
  // assistant explores and drives SAP live, then writes the case file(s)
  // into the draft folder above using test-cases/_TEMPLATE.md's shape;
  // finalizeCaseCreation relocates them once the run finishes.
  function prepareCaseCreation(lane, systemId) {
    if (!['gui', 'web'].includes(lane)) throw new Error('Select SAP GUI or Fiori / WebGUI testing.');
    if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
    const system = String(systemId || '').trim() || 'DS4_100_NIIF';
    const draftDirectory = caseDraftDirectory(lane, system);
    fs.mkdirSync(draftDirectory, { recursive: true });
    // Should normally be empty (each run's leftovers are deleted once copied
    // out — see finalizeCaseCreation), but if an earlier run in this same app
    // session was interrupted before it could clean up, its files must not
    // look "new" to the next run's diff.
    const existingFiles = fs.readdirSync(draftDirectory).filter((name) => name.toLowerCase().endsWith('.md'));

    const builtInDirectory = path.join(laneCasesDir(lane), system);
    const exampleCaseFile = fs.existsSync(builtInDirectory)
      ? fs.readdirSync(builtInDirectory).find((name) => name.toLowerCase().endsWith('.md'))
      : null;

    return {
      lane,
      system,
      caseDirectory: draftDirectory,
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

  // Runs once a case-creation AI Assistant run finishes: diffs the draft
  // folder against the file list prepareCaseCreation captured before the run
  // started, and for whatever new *.md files showed up (there may be several
  // — one run can produce a case per combination it explored) copies each
  // into the user's persistent external case folder, registers it, and
  // deletes the draft. A file the run never got around to writing simply
  // means nothing new is found; it does not error, since a partial or
  // interrupted run is a normal outcome, not a bug.
  function finalizeCaseCreation(lane, systemId, existingFilesBeforeRun = [], author = '') {
    if (!['gui', 'web'].includes(lane)) throw new Error('Select SAP GUI or Fiori / WebGUI testing.');
    const system = String(systemId || '').trim() || 'DS4_100_NIIF';
    const draftDirectory = caseDraftDirectory(lane, system);
    if (!fs.existsSync(draftDirectory)) return { created: [] };

    const before = new Set(Array.isArray(existingFilesBeforeRun) ? existingFilesBeforeRun : []);
    const newFiles = fs.readdirSync(draftDirectory)
      .filter((name) => name.toLowerCase().endsWith('.md') && !before.has(name));
    if (!newFiles.length) return { created: [] };

    const destinationDirectory = externalLaneCasesDir(lane, system);
    fs.mkdirSync(destinationDirectory, { recursive: true });

    const manifest = externalManifest();
    const created = [];
    for (const fileName of newFiles) {
      const draftPath = path.join(draftDirectory, fileName);
      const content = fs.readFileSync(draftPath, 'utf8');
      const headers = parseCaseHeaders(content);
      let caseId;
      try { caseId = normalizeCaseId(headers['Case id']); } catch {
        throw new Error(`${fileName} has no valid Case id header. The draft was retained at ${draftPath}.`);
      }
      const titleLine = content.split('\n').find((line) => line.trim().startsWith('# ')) || '';
      const summary = titleLine.replace(/^#\s*/, '').replace(/^TC-\d{3}\s*[—-]\s*/, '').trim()
        || headers['Transaction / app'] || fileName;

      // The next free id was only a snapshot at prepareCaseCreation time — if
      // something else claimed this exact filename in the meantime, keep the
      // existing file rather than silently overwriting it.
      const destinationPath = path.join(destinationDirectory, fileName);
      if (fs.existsSync(destinationPath)) {
        if (fs.readFileSync(destinationPath, 'utf8') !== content) {
          throw new Error(`${destinationPath} already exists with different contents. The new draft was retained.`);
        }
      } else {
        fs.copyFileSync(draftPath, destinationPath, fs.constants.COPYFILE_EXCL);
      }

      const relativeCaseFile = path.relative(externalCasesRoot, destinationPath).split(path.sep).join('/');
      const key = externalCaseKey(lane, caseId);
      const writes = headers['Writes to the database'] || 'Not classified yet.';
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
        caseId, lane, summary, writes, source: 'external', externalLabel: 'External created TC', fileName, filePath: destinationPath, storageRoot: externalCasesRoot,
      });
    }
    if (created.length) {
      writeJsonFile(externalCasesManifestPath, manifest);
      for (const entry of created) {
        try { fs.unlinkSync(path.join(draftDirectory, entry.fileName)); } catch { /* Retain a recoverable draft if cleanup fails. */ }
      }
    }
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

  function prepareCase(lane, requestedCaseId, requestedStage = '', requestedCredentials = null, externalCase = null) {
    if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
    const caseId = normalizeCaseId(requestedCaseId);
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
      if (!String(headers.System || '').split(/[\s`()[\],;]+/).includes(system.id)) {
        throw new Error('The testcase System header must match the selected SAP system before running.');
      }
      if (!headers['Writes to the database']) throw new Error('The testcase must describe its database writes before it can be approved.');
      external = { content, systemId: system.id };
      testCase = { summary: headers['Transaction / app'] || caseId, writes: headers['Writes to the database'] };
    }
    if (!testCase) throw new Error(`${caseId} is not registered in the selected ${lane === 'gui' ? 'SAP GUI' : 'Fiori / WebGUI'} lane.`);
    const stages = Array.isArray(testCase.stages) ? testCase.stages.map(String) : [];
    const stage = String(requestedStage || testCase.defaultStage || '');
    if (requestedStage && !stages.includes(String(requestedStage))) {
      throw new Error(`${caseId} does not have stage '${requestedStage}'. Available stages: ${stages.join(', ') || 'none'}.`);
    }

    const system = external ? configuredConnectionCheckSystem(external.systemId) : configuredDefaultSystem();

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
      source: external ? 'external' : 'direct',
      systemId: system.id,
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

    if (proposal.external) {
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
    start(prompt, previousSessionId = '', lane = 'gui', options = {}) {
      if (!validateProject(projectRoot)) throw new Error('The bundled SAP automation package is missing or incomplete. Reinstall the application.');
      const oauthToken = claudeTokenStore.get();
      if (!oauthToken) throw new Error('Configure a Claude OAuth token before using the AI Assistant.');
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Type what you want the AI Assistant to do.');
      if (previousSessionId && !/^[0-9a-f-]{36}$/i.test(previousSessionId)) throw new Error('The AI Assistant session is invalid. Start a new chat.');
      if (!['gui', 'web'].includes(lane)) throw new Error('Select SAP GUI or Fiori / WebGUI testing.');
      const caseCreation = options?.caseCreation || null;
      if (caseCreation) configuredConnectionCheckSystem(caseCreation.systemId);
      if ([...runs.values()].some((run) => !FINAL_STATUSES.has(run.status))) {
        throw new Error('Another SAP request is already running. Wait for it to finish or stop it first.');
      }
      const id = crypto.randomUUID();
      const externalRun = options?.[externalAuthorization]
        ? createExternalRun(projectRoot, archiveDir(), id, options[externalAuthorization]) : null;
      if (externalRun) prompt = externalRunPrompt(externalRun);

      const laneGuidance = lane === 'gui'
        ? 'The user selected the SAP GUI lane. Use GUI-lane cases and scripts/run-gui-case.ps1 for runnable tests.'
        : 'The user selected the Fiori / WebGUI lane. Use web-lane cases and scripts/run-case.ps1 for runnable tests.';

      const args = [
        '-p', prompt.trim(),
        '--output-format', 'json',
        '--permission-mode', 'auto',
        '--append-system-prompt', `${DISPLAY_GUIDANCE} ${laneGuidance}${caseCreation ? ` This is an FSNXT testcase creation run on ${caseCreation.systemId}. The user authorizes saving the requested deal as part of creating the testcase. Announce the Save and perform it without asking for another chat confirmation or popup. This authorization satisfies rule 3 for this requested scenario only. Verify the target SAP system before writing. Do not add settlement, posting, or other writes beyond the request. Verify the saved document number from SAP, then write the Markdown testcase to ${caseDraftDirectory(lane, caseCreation.systemId)} before finishing. If blocked, write the observed partial steps and exact failure as a draft; never claim an unverified save or repeat a Save whose outcome is uncertain.` : ''}`,
      ];
      if (caseCreation) {
        args.push('--allowedTools', 'mcp__sap-gui__*', 'Write(/.case-drafts/**)', 'Edit(/.case-drafts/**)');
      }
      if (externalRun) {
        args.push('--allowedTools', ...(lane === 'gui' ? ['mcp__sap-gui__*'] : []),
          `Write(/${externalRun.relativeRoot}/**)`, `Edit(/${externalRun.relativeRoot}/**)`);
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
        // Persist drafts in the main process, even if the user left this screen.
        if (caseCreation) {
          try {
            run.createdCases = finalizeCaseCreation(lane, caseCreation.systemId, caseCreation.existingFiles, caseCreation.author).created;
            if (!run.createdCases.length && run.status === 'completed') {
              run.status = 'failed';
              run.error = 'Testcase creation is unfinished: no Markdown file was produced. Continue this testcase in chat; verify the existing SAP deal before retrying any Save.';
            }
          } catch (error) {
            run.error = `Could not store the testcase locally: ${error.message}`;
            run.status = 'failed';
          }
        }
        if (externalRun) {
          const execution = { status: run.status, error: run.error, response: run.response };
          run.status = 'finalizing';
          try {
            const result = writeExternalResult(externalRun, execution);
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
