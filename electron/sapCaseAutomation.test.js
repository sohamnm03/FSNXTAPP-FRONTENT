const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { automationPrompt, candidatePath, completePlanFromMarkdown, caseDigest, normalizePlan, publishAutomation, readAutomation, renderSidecar, sidecarPath, validatePlan } = require('./sapCaseAutomation');

const identity = { caseId: 'TC-900', lane: 'gui', systemId: 'DS4_100_NIIF' };
const plan = { version: 1, ...identity, observedOutcome: 'PASS', steps: [
  { action: 'transaction', label: 'Open', value: 'FTR_CREATE' },
  { action: 'fill', label: 'Company', target: 'wnd[0]/usr/ctxtX', value: '1000' },
  { action: 'press', label: 'Save', target: 'wnd[0]/tbar[0]/btn[11]', write: true },
  { action: 'assert', label: 'Saved', source: 'status', expected: 'Deal ', match: 'contains', verifiesWrite: true, capture: 'deal', pattern: 'Deal (\d+)' },
] };

test('authoring prompt records padding-safe fields and table-aware ALV assertions', () => {
  const prompt = automationPrompt('gui', 'automation.json');
  assert.match(prompt, /outer display padding/);
  assert.match(prompt, /numeric:true/);
  assert.match(prompt, /never mark identifiers, company codes or dates numeric/);
  assert.match(prompt, /ALV\/GuiGridView assertion/);
  assert.match(prompt, /source:"text"/);
  assert.match(prompt, /reads row data rather than the COM type name/);
});

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-auto-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const md = path.join(dir, 'TC-900-case.md');
  fs.writeFileSync(md, '# TC-900\n', 'utf8');
  fs.mkdirSync(path.dirname(candidatePath(md)), { recursive: true });
  fs.writeFileSync(candidatePath(md), JSON.stringify(plan));
  return md;
}

test('publishes a script beside the md and finds it again', (t) => {
  const md = setup(t);
  const script = publishAutomation(md, identity);
  assert.equal(script, sidecarPath(md, 'gui'));
  assert.ok(script.endsWith('.py'));
  assert.equal(readAutomation(md, fs.readFileSync(md, 'utf8'), identity).plan.caseId, 'TC-900');
});

test('refuses a script for another system or an edited case', (t) => {
  const md = setup(t);
  publishAutomation(md, identity);
  const content = fs.readFileSync(md, 'utf8');
  assert.equal(readAutomation(md, content, { ...identity, systemId: 'OTHER' }), null);
  assert.equal(readAutomation(md, content + 'edit', identity), null);
});

test('rejects a write that is not verified', (t) => {
  const md = setup(t);
  const bad = { ...plan, steps: plan.steps.map((step) => {
    const withoutVerification = { ...step };
    delete withoutVerification.verifiesWrite;
    return withoutVerification;
  }) };
  fs.writeFileSync(candidatePath(md), JSON.stringify(bad));
  assert.throws(() => publishAutomation(md, identity), /success assertion/);
});

test('rejects command-field navigation that could bypass the transaction policy', () => {
  const bypass = { ...plan, steps: plan.steps.map((step, index) => index === 0 ? {
    action: 'fill', label: 'Open', target: 'wnd[0]/tbar[0]/okcd', value: '/nSE16N',
  } : step) };
  assert.throws(
    () => validatePlan(bypass, identity),
    /transaction navigation must use a transaction step/,
  );
});

test('normalizes press/select on GUI tab controls to the tab action', () => {
  const normalized = normalizePlan({ ...plan, steps: [
    { action: 'press', label: 'Administr. tab', target: 'wnd[0]/usr/tabsMAIN/tabpADMIN' },
    { action: 'select', label: 'Structure tab', target: 'wnd[0]/usr/tabsMAIN/tabpSTRUCTURE', value: 'STRUCTURE' },
    { action: 'press', label: 'Normal button', target: 'wnd[0]/usr/btnSAVE' },
  ] });
  assert.deepEqual(normalized.steps.map(({ action, value }) => ({ action, value })), [
    { action: 'tab', value: undefined },
    { action: 'tab', value: undefined },
    { action: 'press', value: undefined },
  ]);
});

test('restores an omitted Markdown company code in an existing signed sidecar', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-company-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const md = path.join(dir, 'TC-900-case.md');
  const content = [
    '# TC-900',
    '',
    '| Field | Technical name | Value |',
    '|---|---|---|',
    '| Company Code | `FTR_ENTRY-BUKRS` | `IDF` |',
  ].join('\n');
  fs.writeFileSync(md, content, 'utf8');
  fs.writeFileSync(sidecarPath(md, 'gui'), renderSidecar({
    caseSha256: caseDigest(content),
    plan,
  }), 'utf8');

  const loaded = readAutomation(md, content, identity);
  assert.deepEqual(loaded.plan.steps.slice(0, 2), [
    plan.steps[0],
    {
      action: 'fill',
      target: 'wnd[0]/usr/ctxtFTR_ENTRY-BUKRS',
      value: 'IDF',
      label: 'Set Company Code IDF',
    },
  ]);
});

test('types entry Product/Transaction Type that a plan only asserted as defaults', () => {
  const asserted = (target, expected, label) => ({ action: 'assert', source: 'field', target, expected, match: 'equals', label });
  const sgsart = 'wnd[0]/usr/ctxtFTR_ENTRY-SGSART';
  const sfhaart = 'wnd[0]/usr/ctxtFTR_ENTRY-SFHAART';
  const typed = { action: 'fill', target: sfhaart, value: '200', label: 'Transaction Type' };
  const completed = completePlanFromMarkdown({ version: 1, ...identity, steps: [
    { action: 'transaction', label: 'Create', value: 'FTR_CREATE' },
    asserted(sgsart, 'FAC', 'Product Type defaulted to FAC'),
    typed,
    asserted(sfhaart, '200', 'Transaction Type'),
    { action: 'transaction', label: 'Edit', value: 'FTR_EDIT' },
    asserted(sgsart, 'FAC', 'Verify saved Product Type'),
    { action: 'transaction', label: 'Create another', value: '/nFTR_CREATE' },
    asserted(sfhaart, '200', 'Second Transaction Type'),
  ] }, '').steps;
  assert.deepEqual(completed.map((step) => [step.action, step.target]), [
    ['transaction', undefined],
    ['fill', sgsart], ['assert', sgsart], ['fill', sfhaart], ['assert', sfhaart],
    ['transaction', undefined], ['assert', sgsart],
    ['transaction', undefined], ['fill', sfhaart], ['assert', sfhaart],
  ]);
  assert.equal(completed[1].value, 'FAC');
  assert.equal(completed[8].value, '200');
});

test('accepts numeric amount assertions but rejects unsafe numeric markers', () => {
  const amount = {
    action: 'assert', label: 'Investment Amount confirmed', source: 'field',
    target: 'wnd[0]/usr/txtVTG_INVEST-XZBETR', expected: '1,000,000.00',
    match: 'equals', numeric: true,
  };
  assert.equal(validatePlan({ ...plan, steps: [plan.steps[0], amount] }, identity).steps[1].numeric, true);
  assert.throws(
    () => validatePlan({ ...plan, steps: [plan.steps[0], { ...amount, numeric: 'yes' }] }, identity),
    /numeric marker must be true or false/,
  );
  assert.throws(
    () => validatePlan({ ...plan, steps: [plan.steps[0], { ...amount, source: 'status' }] }, identity),
    /only valid for exact field\/value assertions/,
  );
  assert.throws(
    () => validatePlan({ ...plan, steps: [plan.steps[0], { ...amount, match: 'contains' }] }, identity),
    /only valid for exact field\/value assertions/,
  );
});
