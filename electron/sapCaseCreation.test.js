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
  const env = { FSNXT_CASE_DRAFT_DIR: dir, FSNXT_CASE_EXISTING_FILES: '["old.md"]' };
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
    'config/sap-systems.json': JSON.stringify({ systems: [{ id: 'DS4_100_NIIF', enabled: true, sapGui: { enabled: true } }] }),
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
    showOpenDialog: async () => ({ canceled: false, filePaths: [path.join(root, 'browsed.md')] }),
  });
  const prep = manager.prepareCaseCreation('gui', 'DS4_100_NIIF');
  return { manager, calls, prep, root, projectRoot, options: { caseCreation: { systemId: 'DS4_100_NIIF', existingFiles: prep.existingFiles, author: 'test-author' } } };
}

const markdown = '# TC-001 - Saved loan\n\n- **Case id:** TC-001\n- **Lane:** sap-gui\n- **System:** DS4_100_NIIF\n- **Transaction / app:** FTR_CREATE\n- **Writes to the database:** Creates one loan\n\n## Steps\n1. Save the entered loan.\n\n## Assertions\n- SAP displayed transaction 12345 saved.\n';

test('creation carries scoped Save authorization and persists Markdown without renderer polling', async (context) => {
  const { manager, calls, prep, options } = await managerFixture(context);
  const run = manager.start('Create a testcase', '', 'gui', options);
  const call = calls.at(-1);
  assert.equal(call.options.env.FSNXT_CASE_CREATION_AUTO_SAVE, '1');
  assert.ok(call.args.includes('Write(/.case-drafts/**)'));
  assert.match(call.args[call.args.indexOf('--append-system-prompt') + 1], /without asking for another chat confirmation/);
  const draft = path.join(prep.caseDirectory, 'TC-001-loan-gui.md');
  fs.writeFileSync(draft, markdown);
  call.child.stdout.emit('data', Buffer.from(JSON.stringify({ result: 'Saved 12345', session_id: 'session' })));
  call.child.emit('close', 0);
  const finished = manager.getRun(run.id);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.createdCases.length, 1);
  assert.equal(fs.readFileSync(finished.createdCases[0].filePath, 'utf8'), markdown);
  assert.equal(fs.existsSync(draft), false);
  assert.equal(manager.listCases('gui').cases[0].caseId, 'TC-001');
  manager.start('Explain this case');
  assert.equal(calls.at(-1).options.env.FSNXT_CASE_CREATION_AUTO_SAVE, '0');
  assert.equal(calls.at(-1).args.includes('--allowedTools'), false);
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

test('local storage failure is visible and retains the draft', async (context) => {
  const { manager, calls, prep, options, root } = await managerFixture(context);
  const run = manager.start('Create a testcase', '', 'gui', options);
  const draft = path.join(prep.caseDirectory, 'TC-001-loan-gui.md');
  fs.writeFileSync(draft, markdown);
  fs.mkdirSync(path.join(root, 'documents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'documents', 'FSNXT SAP Test Cases'), 'blocks destination');
  calls.at(-1).child.emit('close', 0);
  assert.equal(manager.getRun(run.id).status, 'failed');
  assert.match(manager.getRun(run.id).error, /Could not store the testcase locally/);
  assert.equal(fs.existsSync(draft), true);
});
