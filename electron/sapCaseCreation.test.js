const { candidatePath } = require('./sapCaseAutomation');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');
const vm = require('node:vm');

function temporaryDirectory(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-creation-test-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function absoluteEditRule(directory) {
  const normalized = path.resolve(directory)
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, (_match, drive) => `/${drive.toLowerCase()}`);
  const escaped = normalized.replace(/([*?[\]\\])/g, '\\$1');
  return `Edit(//${escaped.replace(/^\/+/, '')}/**)`;
}

const saveEvent = {
  hook_event_name: 'Elicitation',
  mcp_server_name: 'sap-gui',
  mode: 'form',
  message: "You are about to send 'Save' which triggers Save (F11) in SAP. This can persist changes to the database. Do you want to proceed?",
  requested_schema: { type: 'object', properties: { value: { type: 'boolean' } }, required: ['value'] },
};

function invokeHook(root, event, autoSave = '1', runId = 'test-run', hookName = 'sap-save-confirmation.ps1', extraEnv = {}) {
  const hook = path.join(root, '.claude', 'hooks', hookName);
  fs.mkdirSync(path.dirname(hook), { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '../packages/sap-testing-automation/.claude/hooks', hookName), hook);
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', hook], {
    input: JSON.stringify(event), encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: { ...process.env, FSNXT_RUN_ID: runId, FSNXT_CASE_CREATION_AUTO_SAVE: autoSave, ...extraEnv },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout.trim()) : null;
}

test('authorized testcase Save returns the MCP boolean without creating a popup request', { skip: process.platform !== 'win32' }, (context) => {
  const root = temporaryDirectory(context);
  const result = invokeHook(root, saveEvent);
  assert.deepEqual(result, { hookSpecificOutput: { hookEventName: 'Elicitation', action: 'accept', content: { value: true } } });
  assert.equal(fs.existsSync(path.join(root, 'logs')), false);
});

test('Save hook ignores other elicitation shapes and non-desktop sessions', { skip: process.platform !== 'win32' }, (context) => {
  const root = temporaryDirectory(context);
  assert.equal(invokeHook(root, { ...saveEvent, mcp_server_name: 'unrelated' }), null);
  assert.equal(invokeHook(root, { ...saveEvent, requested_schema: { type: 'object', properties: { value: { type: 'string' } } } }), null);
  assert.equal(invokeHook(root, { ...saveEvent, message: 'Confirm deletion?' }), null);
  assert.equal(invokeHook(root, saveEvent, '1', ''), null);
});

test('other desktop runs still honor a declined Save', { skip: process.platform !== 'win32' }, (context) => {
  const root = temporaryDirectory(context);
  const dir = path.join(root, 'logs', 'elicitation-requests');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'test-run.response.json'), JSON.stringify({ accept: false }));
  assert.equal(invokeHook(root, saveEvent, '0').hookSpecificOutput.action, 'cancel');
});

test('authoring cannot stop without a new Markdown case, and the reminder cannot loop', { skip: process.platform !== 'win32' }, (context) => {
  const root = temporaryDirectory(context);
  const dir = path.join(root, 'drafts');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'old.md'), '- **Case id:** TC-001');
  const env = { FSNXT_CASE_DIRECTORY: dir, FSNXT_CASE_EXISTING_FILES: '["old.md"]' };
  const invoke = (active) => invokeHook(root, { hook_event_name: 'Stop', stop_hook_active: active }, '1', 'test-run', 'require-case-file.ps1', env);
  assert.equal(invoke(false).decision, 'block');
  assert.equal(invoke(true), null);
  fs.writeFileSync(path.join(dir, 'new.md'), '- **Case id:** TC-002');
  assert.equal(invoke(false), null);
});

async function managerFixture(context, isPackaged = false) {
  const root = temporaryDirectory(context);
  const projectRoot = path.join(root, 'project');
  const files = {
    'gui_tests/run.py': '', 'scripts/run-gui-case.ps1': '', 'CLAUDE.md': '',
    'config/sap-systems.json': JSON.stringify({
      defaultSystem: 'DS4_100_NIIF',
      systems: [
        { id: 'DS4_100_NIIF', systemId: 'DS4', client: '100', enabled: true, sapGui: { enabled: true } },
        { id: 'DS4_100_TFSIN', systemId: 'DS4', client: '100', enabled: true, sapGui: { enabled: true, mcpServerName: 'sap-gui-ds4-100-tfsin' } },
        { id: 'LFD_100_LTFS', systemId: 'LFD', client: '100', enabled: true, sapGui: { enabled: true, mcpServerName: 'sap-gui-lfd-100-ltfs' } },
      ],
    }),
    'config/gui-runs.json': '{"cases":{}}', 'config/runs.json': '{"cases":{}}',
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(projectRoot, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  const calls = [];
  const resourcesPath = path.join(root, 'resources');
  for (const name of ['python/python.exe', 'sap-web-runtime/node.exe', 'sap-web-runtime/browsers/.keep', 'app.asar.unpacked/node_modules/@anthropic-ai/claude-code/bin/claude.exe']) {
    const file = path.join(resourcesPath, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
  }
  const filename = path.join(__dirname, 'sapTerminalManager.js');
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, __dirname, process: { ...process, resourcesPath }, Buffer,
    require(name) {
      if (name === './sapAutomationWorkspace') return { createSapAutomationWorkspace: async () => ({ projectRoot, cleanup() {} }) };
      if (name === 'child_process') return { spawn(command, args, options) {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {};
        calls.push({ command, args, options, child });
        return child;
      } };
      return localRequire(name);
    },
  }, { filename });
  const manager = await module.exports.createSapTerminalManager({ isPackaged, getPath: (name) => path.join(root, name) }, { get: () => 'test-token' }, {
    showOpenDialog: async (_ownerWindow, options) => ({
      canceled: false,
      filePaths: [options?.properties?.includes('openDirectory')
        ? path.join(root, 'chosen-archive')
        : path.join(root, 'browsed.md')],
    }),
  });
  const prep = manager.prepareCaseCreation('gui', 'DS4_100_NIIF');
  return { manager, calls, prep, root, projectRoot, options: { caseCreation: { systemId: 'DS4_100_NIIF', existingFiles: prep.existingFiles, author: 'test-author' } } };
}

const markdown = '# TC-001 - Saved loan\n\n- **Case id:** TC-001\n- **Lane:** sap-gui\n- **System:** DS4_100_NIIF\n- **Transaction / app:** FTR_CREATE\n- **Writes to the database:** Creates one loan\n\n## Steps\n1. Save the entered loan.\n\n## Assertions\n- SAP displayed transaction 12345 saved.\n';

const validPlan = { version: 1, caseId: 'TC-001', lane: 'gui', systemId: 'DS4_100_NIIF', observedOutcome: 'PASS', steps: [
  { action: 'transaction', label: 'Open', value: 'FTR_CREATE' },
  { action: 'press', label: 'Save', target: 'wnd[0]/tbar[0]/btn[11]', write: true },
  { action: 'assert', label: 'Saved', source: 'status', expected: 'saved', match: 'contains', verifiesWrite: true },
] };

test('every enabled SAP GUI system inherits the shared transaction denylist', () => {
  const registry = JSON.parse(fs.readFileSync(path.resolve(
    __dirname,
    '../packages/sap-testing-automation/config/sap-systems.json',
  ), 'utf8'));
  assert.ok(Array.isArray(registry.blockedTransactions) && registry.blockedTransactions.length > 0);
  assert.equal(new Set(registry.blockedTransactions).size, registry.blockedTransactions.length);
  for (const expected of ['STMS_IMPORT', 'SU53', 'SE16N', 'SM30', 'SNOTE']) {
    assert.ok(registry.blockedTransactions.includes(expected), `${expected} must be blocked`);
  }
  for (const system of registry.systems.filter((entry) => entry.enabled && entry.sapGui?.enabled)) {
    assert.equal(system.sapGui.allowedTransactions, undefined, `${system.id} must not use whitelist mode`);
    assert.deepEqual(
      system.sapGui.blockedTransactions || registry.blockedTransactions,
      registry.blockedTransactions,
      `${system.id} must use the shared transaction denylist`,
    );
  }
});

const passingObservation = {
  verdict: 'PASS', systemConfirmed: true, writesVerified: true, session: 'DS4/100 user=TESTER',
  assertions: [{ expected: 'Saved', observed: 'Saved', result: 'pass' }],
  steps: [{ step: 'Save', outcome: 'ok', detail: 'Executed and checked' }],
  documents: [{ type: 'Loan', number: '12345', leftInPlace: true }],
};
const failingObservation = {
  verdict: 'FAIL', systemConfirmed: true, writesVerified: false, session: 'DS4/100 user=TESTER',
  summary: "Product Type defaulted to FAC: expected 'FAC', observed ''",
  assertions: [{ expected: 'Product Type defaulted to FAC: FAC', observed: '', result: 'fail' }],
  steps: [{ step: 'Product Type defaulted to FAC', outcome: 'error', detail: 'Started; completion not yet verified' }],
  documents: [],
};

async function until(condition, what) {
  for (let i = 0; i < 300; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${what}`);
}

// Drives the scripted dry run the app starts on its own: waits for the runner
// process, writes what it observed, and lets the result archive finish.
async function finishDryRun(calls, observation, exitCode = 0) {
  await until(() => calls.filter((call) => call.args.includes('gui_tests.external_case')).length > finishDryRun.done, 'a dry run to start');
  const runner = calls.filter((call) => call.args.includes('gui_tests.external_case'))[finishDryRun.done++];
  fs.writeFileSync(path.join(runner.options.env.FSNXT_EXTERNAL_RUN_DIR, 'observations.json'), JSON.stringify(observation));
  runner.child.emit('close', exitCode);
  const finalizer = calls.at(-1);
  assert.match(finalizer.args[finalizer.args.indexOf('-File') + 1], /finalize-external-run.ps1$/);
  finalizer.child.emit('close', 0);
  return runner;
}

async function nextRepair(calls, seen) {
  await until(() => calls.filter((call) => call.command.endsWith('claude.exe') || call.args.includes('--resume')).length > seen, 'an AI repair');
  return calls.filter((call) => call.command.endsWith('claude.exe') || call.args.includes('--resume'))[seen];
}

async function createCaseForLoop(context, extra = {}) {
  finishDryRun.done = 0;
  const fixture = await managerFixture(context);
  const { manager, calls, prep, options } = fixture;
  const run = manager.start('Create a testcase', '', 'gui', { ...options, ...extra });
  const caseFile = path.join(prep.caseDirectory, 'TC-001-loan-gui.md');
  fs.writeFileSync(caseFile, markdown);
  fs.mkdirSync(path.dirname(candidatePath(caseFile)), { recursive: true });
  fs.writeFileSync(candidatePath(caseFile), JSON.stringify(validPlan));
  calls.at(-1).child.stdout.emit('data', Buffer.from(JSON.stringify({ result: 'Saved 12345', session_id: '00000000-0000-0000-0000-000000000002' })));
  calls.at(-1).child.emit('close', 0);
  return { ...fixture, run, saved: manager.getRun(run.id).createdCases[0].filePath };
}

test('a rejected plan is corrected by the same session with no SAP tools, then the script is saved', async (context) => {
  const { manager, calls, prep, options } = await managerFixture(context);
  const run = manager.start('Create a testcase', '', 'gui', options);
  const call = calls.at(-1);
  const caseFile = path.join(prep.caseDirectory, 'TC-001-loan-gui.md');
  fs.writeFileSync(caseFile, markdown);
  fs.mkdirSync(path.dirname(candidatePath(caseFile)), { recursive: true });
  fs.writeFileSync(candidatePath(caseFile), JSON.stringify({ ...validPlan, steps: [{ action: 'key', label: 'x', value: 'Save' }] }));
  call.child.stdout.emit('data', Buffer.from(JSON.stringify({ result: 'Saved 12345', session_id: '00000000-0000-0000-0000-000000000001' })));
  call.child.emit('close', 0);
  assert.equal(manager.getRun(run.id).status, 'finalizing');
  const repair = calls.at(-1);
  assert.equal(repair.args[repair.args.indexOf('--resume') + 1], '00000000-0000-0000-0000-000000000001');
  assert.equal(repair.args.some((arg) => String(arg).includes('mcp__')), false);
  const moved = manager.getRun(run.id).createdCases[0].filePath;
  fs.mkdirSync(path.dirname(candidatePath(moved)), { recursive: true });
  fs.writeFileSync(candidatePath(moved), JSON.stringify(validPlan));
  repair.child.emit('close', 0);
  finishDryRun.done = 0;
  await finishDryRun(calls, passingObservation);
  await until(() => manager.getRun(run.id).status === 'completed', 'the case to complete');
  assert.ok(fs.existsSync(moved.replace(/.md$/, '.py')));
});

test('creation carries scoped Save authorization and persists Markdown without renderer polling', async (context) => {
  const { manager, calls, prep, options, root, projectRoot } = await managerFixture(context);
  const run = manager.start('Create a testcase', '', 'gui', options);
  const call = calls.at(-1);
  assert.equal(call.options.env.FSNXT_CASE_CREATION_AUTO_SAVE, '1');
  assert.equal(call.args[call.args.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.equal(call.options.env.FSNXT_CASE_DIRECTORY, prep.caseDirectory);
  assert.equal(call.args[call.args.indexOf('--add-dir') + 1], prep.caseDirectory);
  assert.ok(call.args.includes(absoluteEditRule(prep.caseDirectory)));
  assert.equal(absoluteEditRule(prep.caseDirectory).startsWith('Edit(//'), true);
  assert.equal(call.args.some((arg) => String(arg).includes('.case-drafts')), false);
  assert.match(call.args[call.args.indexOf('--append-system-prompt') + 1], /without asking for another chat confirmation/);
  assert.equal(prep.caseDirectory, path.join(
    root,
    'downloads',
    'FSNXT SAP Test Archives',
    'FSNXT SAP Test Cases',
    'test-cases',
    'GUI-TC',
    'DS4_100_NIIF',
  ));
  assert.equal(fs.existsSync(path.join(projectRoot, '.case-drafts')), false);
  const caseFile = path.join(prep.caseDirectory, 'TC-001-loan-gui.md');
  fs.writeFileSync(caseFile, markdown);
  fs.mkdirSync(path.dirname(candidatePath(caseFile)), { recursive: true });
  fs.writeFileSync(candidatePath(caseFile), JSON.stringify(validPlan));
  call.child.stdout.emit('data', Buffer.from(JSON.stringify({ result: 'Saved 12345', session_id: 'session' })));
  call.child.emit('close', 0);
  // The new case is dry-run immediately; the run only completes after it passes.
  assert.equal(manager.getRun(run.id).status, 'finalizing');
  finishDryRun.done = 0;
  await finishDryRun(calls, passingObservation);
  await until(() => manager.getRun(run.id).status === 'completed', 'the case to complete');
  const finished = manager.getRun(run.id);
  assert.equal(finished.createdCases.length, 1);
  const saved = finished.createdCases[0].filePath;
  assert.equal(saved, path.join(prep.caseDirectory, 'TC_001_FTR_CREATE_Saved_loan', 'TC-001-loan-gui.md'));
  assert.ok(fs.existsSync(saved.replace(/.md$/, '.py')), 'the script is saved in the same case folder as the Markdown');
  assert.equal(fs.existsSync(caseFile), false, 'nothing is left loose at the root');
  assert.equal(fs.existsSync(candidatePath(saved)), false);
  assert.equal(fs.readFileSync(saved, 'utf8'), markdown);
  assert.equal(manager.listCases('gui').cases[0].caseId, 'TC-001');
  manager.start('Explain this case');
  assert.equal(calls.at(-1).options.env.FSNXT_CASE_CREATION_AUTO_SAVE, '0');
  assert.equal(calls.at(-1).args[calls.at(-1).args.indexOf('--permission-mode') + 1], 'auto');
  assert.equal(calls.at(-1).args.includes('--allowedTools'), false);
});

test('a failing dry run is repaired by the AI and the loop ends on the first pass', async (context) => {
  const { manager, calls, run, saved } = await createCaseForLoop(context);
  assert.equal(manager.getRun(run.id).status, 'finalizing');
  await finishDryRun(calls, failingObservation, 1);
  const repair = await nextRepair(calls, 1);
  assert.equal(repair.args[repair.args.indexOf('--resume') + 1], '00000000-0000-0000-0000-000000000002');
  assert.equal(repair.args.some((arg) => String(arg).includes('mcp__')), false);
  assert.match(repair.args[repair.args.indexOf('-p') + 1], /Product Type defaulted to FAC/);
  const repaired = { ...validPlan, steps: [{ action: 'key', label: 'Enter', value: '0' }, ...validPlan.steps] };
  fs.writeFileSync(candidatePath(saved), JSON.stringify(repaired));
  repair.child.stdout.emit('data', Buffer.from(JSON.stringify({ result: 'Added an Enter step so SAP derives the value.' })));
  repair.child.emit('close', 0);
  await finishDryRun(calls, passingObservation);
  await until(() => manager.getRun(run.id).status === 'completed', 'the case to complete');
  const done = manager.getRun(run.id);
  assert.match(done.response, /Test case creation succeeded — the saved automation passed dry run 2 of 3 after 1 AI repair\./);
  assert.equal(done.error, '');
  assert.doesNotMatch(done.response, /FAIL|expected 'FAC'/, 'earlier attempts are not shown as errors once a run passes');
  assert.equal(done.createdCases[0].verification.status, 'passed');
  assert.match(fs.readFileSync(saved.replace(/.md$/, '.py'), 'utf8'), /FSNXT-AUTOMATION-V1/);
  assert.match(fs.readFileSync(path.join(path.dirname(saved), 'verification-log.md'), 'utf8'), /PASSED/);
  assert.equal(calls.filter((call) => call.args.includes('gui_tests.external_case')).length, 2);
});

test('three failed dry runs end the loop, report failure and keep the draft', async (context) => {
  const { manager, calls, run, saved } = await createCaseForLoop(context);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await finishDryRun(calls, failingObservation, 1);
    if (attempt === 3) break;
    const repair = await nextRepair(calls, attempt);
    fs.writeFileSync(candidatePath(saved), JSON.stringify({ ...validPlan, steps: [{ action: 'key', label: `Attempt ${attempt}`, value: '0' }, ...validPlan.steps] }));
    repair.child.emit('close', 0);
  }
  await until(() => manager.getRun(run.id).status === 'failed', 'the case to be reported as failed');
  const done = manager.getRun(run.id);
  assert.match(done.response, /Test case creation failed/);
  assert.match(done.error, /test case creation failed after 3 dry run/);
  assert.equal(calls.filter((call) => call.args.includes('gui_tests.external_case')).length, 3);
  assert.equal(calls.filter((call) => call.args.includes('--resume') && !call.args.includes('gui_tests.external_case')).length, 2, 'no repair follows the last dry run');
  assert.ok(fs.existsSync(saved), 'the draft Markdown is kept');
  assert.ok(fs.existsSync(saved.replace(/.md$/, '.py')), 'the draft script is kept');
  assert.match(fs.readFileSync(path.join(path.dirname(saved), 'verification-log.md'), 'utf8'), /FAILED/);
  assert.equal(done.createdCases[0].verification.status, 'failed');
});

test('the loop stops early when the AI proposes no change', async (context) => {
  const { manager, calls, run, saved } = await createCaseForLoop(context);
  await finishDryRun(calls, failingObservation, 1);
  const repair = await nextRepair(calls, 1);
  repair.child.stdout.emit('data', Buffer.from(JSON.stringify({ result: 'SAP was not logged on; nothing to change.' })));
  repair.child.emit('close', 0);
  await until(() => manager.getRun(run.id).status === 'failed', 'the case to be reported as failed');
  assert.equal(calls.filter((call) => call.args.includes('gui_tests.external_case')).length, 1);
  assert.match(manager.getRun(run.id).response, /No fix found\./);
  assert.match(manager.getRun(run.id).response, /Test case creation failed/);
  assert.match(fs.readFileSync(path.join(path.dirname(saved), 'verification-log.md'), 'utf8'), /SAP was not logged on/);
  assert.ok(fs.existsSync(saved.replace(/.md$/, '.py')), 'the original script stays valid');
});

test('the dry run logs on with the SAP credentials typed for the creation run', async (context) => {
  const { manager, calls, run } = await createCaseForLoop(context, { dryRunCredentials: { username: ' TESTER ', password: 'secret' } });
  const creation = calls[0];
  assert.equal(creation.options.env.SAP_TEST_PASSWORD, undefined, 'the AI Assistant never receives the password');
  assert.equal(JSON.stringify(manager.getRun(run.id)).includes('secret'), false);
  const runner = await finishDryRun(calls, passingObservation);
  assert.equal(runner.options.env.SAP_TEST_USERNAME, 'TESTER');
  assert.equal(runner.options.env.SAP_TEST_PASSWORD, 'secret');
  assert.equal(runner.options.env.PYTHON_COLORS, '0');
  await until(() => manager.getRun(run.id).status === 'completed', 'the case to complete');
});

test('a dry run that never reaches the case is reported plainly and not sent to the AI', async (context) => {
  const { manager, calls, run } = await createCaseForLoop(context);
  await until(() => calls.some((call) => call.args.includes('gui_tests.external_case')), 'a dry run to start');
  const runner = calls.find((call) => call.args.includes('gui_tests.external_case'));
  fs.writeFileSync(path.join(runner.options.env.FSNXT_EXTERNAL_RUN_DIR, 'observations.json'), JSON.stringify({ verdict: 'BLOCKED', steps: [], assertions: [] }));
  runner.child.stderr.emit('data', Buffer.from('Traceback (most recent call last):\n  File \u001b[35m"session.py"\u001b[0m, line 182\n    \u001b[31mraise SystemMismatch(\u001b[0m\n\u001b[1;35mgui_tests.session.SystemMismatch\u001b[0m: \u001b[35mlogin() needs logon_description, sap_user and sap_password\u001b[0m\n'));
  runner.child.emit('close', 1);
  calls.at(-1).child.emit('close', 0);
  await until(() => manager.getRun(run.id).status === 'failed', 'the case to be reported as failed');
  const done = manager.getRun(run.id);
  assert.match(done.response, /dry run 1 could not start — SystemMismatch: login\(\) needs logon_description, sap_user and sap_password/);
  assert.doesNotMatch(done.response, /\u001b|Traceback/);
  assert.equal(calls.filter((call) => call.args.includes('--resume')).length, 0, 'no AI repair for a run that never reached the case');
});

test('an AI repair can only edit the case folder', async (context) => {
  const { manager, run, calls, saved, prep } = await createCaseForLoop(context);
  await finishDryRun(calls, failingObservation, 1);
  const repair = await nextRepair(calls, 1);
  const caseFolder = path.dirname(saved);
  assert.equal(repair.args[repair.args.indexOf('--add-dir') + 1], caseFolder);
  assert.ok(repair.args.includes(absoluteEditRule(caseFolder)));
  assert.equal(repair.args.includes(absoluteEditRule(prep.caseDirectory)), false);
  repair.child.emit('close', 0);
  await until(() => manager.getRun(run.id).status === 'failed', 'the loop to end');
});

const successfulObservation = {
  verdict: 'PASS', systemConfirmed: true, writesVerified: true, session: 'DS4 client 100, tester',
  assertions: [{ expected: 'Loan saved', observed: 'Loan 12345 saved', result: 'pass' }],
  steps: [{ step: 'Save', outcome: 'ok' }], documents: [{ type: 'Loan', number: '12345', leftInPlace: true }],
};

for (const isPackaged of [false, true]) {
  for (const lane of ['gui', 'web']) {
    test(`external ${lane} case uses confirmed writes and finalizes before completion (packaged=${isPackaged})`, async (context) => {
      const { manager, calls, root, projectRoot } = await managerFixture(context, isPackaged);
      const filePath = path.join(root, 'browsed.md');
      fs.writeFileSync(filePath, markdown.replace('sap-gui', lane === 'gui' ? 'sap-gui' : 'web'));
      const original = fs.readFileSync(filePath, 'utf8');
      const proposal = manager.prepareCase(lane, 'TC-001', '', { username: 'tester', password: 'test-only' }, { filePath, systemId: 'DS4_100_NIIF' });
      assert.equal(proposal.source, 'external');
      assert.equal(proposal.writes, 'Creates one loan');
      assert.equal(calls.length, 0);
      fs.writeFileSync(filePath, 'modified after approval review');
      const run = manager.startConfirmedCase(proposal.confirmationId);
      const runner = calls.at(-1);
      assert.equal(runner.options.env.FSNXT_CASE_CREATION_AUTO_SAVE, '0');
      assert.equal(runner.options.env.FSNXT_EXTERNAL_RUN_AUTO_SAVE, lane === 'gui' ? '1' : '0');
      assert.equal(runner.args[runner.args.indexOf('--permission-mode') + 1], 'dontAsk');
      assert.equal(runner.args.includes('--resume'), false);
      assert.match(runner.args[1], /without another chat confirmation or popup/);
      assert.equal(fs.readFileSync(path.join(projectRoot, '.external-runs', run.id, 'case.md'), 'utf8'), original);
      if (isPackaged) {
        assert.match(runner.command, /app\.asar\.unpacked/);
        assert.match(runner.options.env.FSNXT_PYTHON, /resources.*python.exe/);
        assert.match(runner.options.env.PLAYWRIGHT_BROWSERS_PATH, /resources.*browsers/);
      }
      if (lane === 'web') assert.equal(runner.options.env.SAP_WEB_USER, 'tester');
      fs.writeFileSync(runner.options.env.FSNXT_EXTERNAL_RUN_RECORD, JSON.stringify(successfulObservation));
      runner.child.stdout.emit('data', Buffer.from('{"result":"Saved loan 12345"}'));
      runner.child.emit('close', 0);
      const finalizing = manager.getRun(run.id);
      assert.equal(finalizing.status, 'finalizing');
      assert.match(finalizing.resultPath, /downloads/);
      assert.match(fs.readFileSync(finalizing.resultPath, 'utf8'), /\*\*Verdict:\*\* PASS/);
      assert.throws(() => manager.start('Start another request'), /already running/);
      const finalizer = calls.at(-1);
      assert.match(finalizer.args[finalizer.args.indexOf('-File') + 1], /finalize-external-run.ps1$/);
      assert.equal(finalizer.args[finalizer.args.indexOf('-Lane') + 1], lane);
      finalizer.child.stdout.emit('data', Buffer.from('Uploaded to Azure Blob\nAzure archive log updated.'));
      finalizer.child.emit('close', 0);
      assert.equal(manager.getRun(run.id).status, 'completed');
      assert.match(manager.getRun(run.id).response, /Azure archive log updated/);
      assert.throws(() => manager.startConfirmedCase(proposal.confirmationId), /expired/);
      manager.start('Explain the result');
      assert.equal(calls.at(-1).options.env.FSNXT_EXTERNAL_RUN_AUTO_SAVE, '0');
      assert.equal(calls.at(-1).options.env.FSNXT_EXTERNAL_RUN_RECORD, '');
      assert.equal(calls.at(-1).args[calls.at(-1).args.indexOf('--permission-mode') + 1], 'auto');
    });
  }
}

test('external failures still retain a result and attempt the archive', async (context) => {
  const { manager, calls, root } = await managerFixture(context);
  const filePath = path.join(root, 'browsed.md');
  fs.writeFileSync(filePath, markdown);
  const proposal = manager.prepareCase('gui', 'TC-001', '', null, { filePath, systemId: 'DS4_100_NIIF' });
  const run = manager.startConfirmedCase(proposal.confirmationId);
  calls.at(-1).child.stdout.emit('data', Buffer.from('{"result":"Disconnected","is_error":true}'));
  calls.at(-1).child.emit('close', 1);
  assert.equal(manager.getRun(run.id).status, 'finalizing');
  calls.at(-1).child.stderr.emit('data', Buffer.from('Disk full'));
  calls.at(-1).child.emit('close', 1);
  const finished = manager.getRun(run.id);
  assert.equal(finished.status, 'failed');
  assert.match(finished.error, /Disconnected/);
  assert.match(finished.error, /Disk full/);
  assert.match(fs.readFileSync(finished.resultPath, 'utf8'), /\*\*Verdict:\*\* FAIL/);
});

test('external headers are validated and colliding built-in ids cannot select the wrong script', async (context) => {
  const { manager, root, projectRoot } = await managerFixture(context);
  const filePath = path.join(root, 'browsed.md');
  fs.writeFileSync(filePath, markdown);
  assert.throws(() => manager.prepareCase('web', 'TC-001', '', null, { filePath, systemId: 'DS4_100_NIIF' }), /lane does not match/);
  fs.writeFileSync(filePath, markdown.replace('DS4_100_NIIF', 'OTHER_SYSTEM'));
  assert.throws(() => manager.prepareCase('gui', 'TC-001', '', null, { filePath, systemId: 'DS4_100_NIIF' }), /System header/);
  fs.writeFileSync(filePath, markdown);
  fs.writeFileSync(path.join(projectRoot, 'config/gui-runs.json'), JSON.stringify({ cases: { 'TC-001': { summary: 'Unrelated built-in test' } } }));
  const browsed = await manager.browseCase();
  assert.equal(browsed.runnable, false);
  assert.equal(browsed.summary, 'FTR_CREATE');
});

test('confirmed external Save is accepted by the hook without authoring authorization', { skip: process.platform !== 'win32' }, (context) => {
  const root = temporaryDirectory(context);
  const result = invokeHook(root, saveEvent, '0', 'external-run', 'sap-save-confirmation.ps1', { FSNXT_EXTERNAL_RUN_AUTO_SAVE: '1' });
  assert.equal(result.hookSpecificOutput.content.value, true);
  assert.equal(fs.existsSync(path.join(root, 'logs')), false);
});

test('external runs get one reminder to record missing observations, including the web lane', { skip: process.platform !== 'win32' }, (context) => {
  const root = temporaryDirectory(context);
  const record = path.join(root, 'observations.json');
  const invoke = (active) => invokeHook(root, { hook_event_name: 'Stop', stop_hook_active: active }, '0', 'external-run', 'require-external-result.ps1', { FSNXT_EXTERNAL_RUN_RECORD: record });
  assert.equal(invoke(false).decision, 'block');
  assert.equal(invoke(true), null);
  fs.writeFileSync(record, JSON.stringify({ verdict: 'BLOCKED', summary: 'No SAP connection' }));
  assert.equal(invoke(false), null);
});

test('a follow-up can finish a testcase whose first turn wrote no file', async (context) => {
  const { manager, calls, prep, options } = await managerFixture(context);
  const first = manager.start('Create a testcase', '', 'gui', options);
  calls.at(-1).child.stdout.emit('data', Buffer.from(JSON.stringify({ result: 'Need a value', session_id: '12345678-1234-1234-1234-123456789abc' })));
  calls.at(-1).child.emit('close', 0);
  const paused = manager.getRun(first.id);
  assert.equal(paused.status, 'failed');
  assert.match(paused.error, /no Markdown file/);
  assert.equal(paused.createdCases.length, 0);
  const second = manager.start('Use the supplied value and finish', paused.sessionId, 'gui', options);
  assert.ok(calls.at(-1).args.includes('--resume'));
  fs.writeFileSync(path.join(prep.caseDirectory, 'TC-001-loan-gui.md'), markdown);
  calls.at(-1).child.stdout.emit('data', Buffer.from('{"result":"Saved"}'));
  calls.at(-1).child.emit('close', 0);
  assert.equal(manager.getRun(second.id).createdCases.length, 1);
});

test('registration failure is visible and retains the case only in the selected archive', async (context) => {
  const { manager, calls, prep, options, root } = await managerFixture(context);
  const run = manager.start('Create a testcase', '', 'gui', options);
  const caseFile = path.join(prep.caseDirectory, 'TC-001-loan-gui.md');
  fs.writeFileSync(caseFile, markdown);
  const archiveRoot = path.join(root, 'downloads', 'FSNXT SAP Test Archives');
  fs.writeFileSync(path.join(archiveRoot, 'FSNXT SAP Test Cases', 'config'), 'blocks manifest directory');
  calls.at(-1).child.emit('close', 0);
  assert.equal(manager.getRun(run.id).status, 'failed');
  assert.match(manager.getRun(run.id).error, /remains in the selected folder but could not be registered/);
  assert.equal(fs.existsSync(path.join(prep.caseDirectory, 'TC_001_FTR_CREATE_Saved_loan', 'TC-001-loan-gui.md')), true);
});

test('selected archive location stores TFSIN cases in the TFSIN HANA Dev folder', async (context) => {
  const { manager, root } = await managerFixture(context);
  manager.getProject('test-user');
  const selected = await manager.chooseArchiveDirectory();
  assert.equal(selected.archiveDirectory, path.join(root, 'chosen-archive'));

  const prep = manager.prepareCaseCreation('gui', 'DS4_100_TFSIN');
  const caseFile = path.join(prep.caseDirectory, 'TC-001-tfsin-gui.md');
  fs.writeFileSync(
    caseFile,
    markdown.replace('DS4_100_NIIF', 'DS4_100_TFSIN'),
  );
  const result = manager.finalizeCaseCreation('gui', 'DS4_100_TFSIN', prep.existingFiles, 'test-user');
  assert.equal(result.created.length, 1);
  assert.equal(path.dirname(path.dirname(result.created[0].filePath)), path.join(
    root,
    'chosen-archive',
    'FSNXT SAP Test Cases',
    'test-cases',
    'GUI-TC',
    'TFSIN HANA Dev',
  ));
  assert.equal(path.basename(result.created[0].filePath), 'TC-001-tfsin-gui.md');
  assert.equal(fs.existsSync(result.created[0].filePath), true);
});

test('case lists and files are scoped to NIIF, TFSIN, or LTFS instead of being NIIF-only', async (context) => {
  const { manager, projectRoot } = await managerFixture(context);
  fs.writeFileSync(path.join(projectRoot, 'config', 'gui-runs.json'), JSON.stringify({
    cases: { 'TC-010': { summary: 'Built-in NIIF case', writes: 'No database writes' } },
  }));

  const tfsin = manager.prepareCaseCreation('gui', 'DS4_100_TFSIN');
  fs.writeFileSync(path.join(tfsin.caseDirectory, 'TC-001-tfsin.md'), markdown.replace('DS4_100_NIIF', 'DS4_100_TFSIN'));
  manager.finalizeCaseCreation('gui', 'DS4_100_TFSIN', tfsin.existingFiles, 'test-author');

  const ltfs = manager.prepareCaseCreation('gui', 'LFD_100_LTFS');
  fs.writeFileSync(
    path.join(ltfs.caseDirectory, 'TC-002-ltfs.md'),
    markdown.replaceAll('TC-001', 'TC-002').replace('DS4_100_NIIF', 'LFD_100_LTFS'),
  );
  manager.finalizeCaseCreation('gui', 'LFD_100_LTFS', ltfs.existingFiles, 'test-author');

  assert.deepEqual(Array.from(manager.listCases('gui', 'DS4_100_NIIF').cases, (entry) => entry.caseId), ['TC-010']);
  assert.deepEqual(Array.from(manager.listCases('gui', 'DS4_100_TFSIN').cases, (entry) => entry.caseId), ['TC-001']);
  assert.deepEqual(Array.from(manager.listCases('gui', 'LFD_100_LTFS').cases, (entry) => entry.caseId), ['TC-002']);
  assert.equal(manager.getCaseFile('gui', 'TC-001', 'DS4_100_TFSIN').source, 'external');
  assert.throws(() => manager.getCaseFile('gui', 'TC-001', 'LFD_100_LTFS'), /not registered/);
  assert.throws(() => manager.prepareCase('gui', 'TC-010', '', null, null, 'DS4_100_TFSIN'), /built-in NIIF testcase/);
});

for (const [systemId, mcpTool] of [
  ['DS4_100_NIIF', 'mcp__sap-gui__*'],
  ['DS4_100_TFSIN', 'mcp__sap-gui-ds4-100-tfsin__*'],
  ['LFD_100_LTFS', 'mcp__sap-gui-lfd-100-ltfs__*'],
]) {
  test(`${systemId} testcase authoring and execution use the selected MCP server without auto-classifier blocking`, async (context) => {
    const { manager, calls, root } = await managerFixture(context);
    const prep = manager.prepareCaseCreation('gui', systemId);
    const options = { caseCreation: { systemId, existingFiles: prep.existingFiles, author: 'test-author' } };
    manager.start(`Create a ${systemId} testcase`, '', 'gui', options);
    const authoringCall = calls.at(-1);
    assert.equal(authoringCall.args[authoringCall.args.indexOf('--permission-mode') + 1], 'dontAsk');
    assert.ok(authoringCall.args.includes(mcpTool));
    assert.equal(authoringCall.args[authoringCall.args.indexOf('--add-dir') + 1], prep.caseDirectory);
    authoringCall.child.emit('close', 0);

    const filePath = path.join(root, `${systemId}.md`);
    fs.writeFileSync(filePath, markdown.replace('DS4_100_NIIF', systemId));
    const proposal = manager.prepareCase('gui', 'TC-001', '', null, { filePath, systemId }, systemId);
    manager.startConfirmedCase(proposal.confirmationId);
    const executionCall = calls.at(-1);
    assert.equal(executionCall.args[executionCall.args.indexOf('--permission-mode') + 1], 'dontAsk');
    assert.ok(executionCall.args.includes(mcpTool));
  });
}
