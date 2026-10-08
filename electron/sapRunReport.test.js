const assert = require('node:assert/strict');
const test = require('node:test');
const { buildFunctionalReport, describe, plainLanguage, testDataFrom, objectiveFrom } = require('./sapRunReport');

test('plan steps read as business instructions, without control ids or key codes', () => {
  assert.deepEqual(describe({ action: 'transaction', label: 'Start', value: 'FTR_CREATE' }), { action: 'Open transaction FTR_CREATE', input: '' });
  assert.deepEqual(describe({ action: 'fill', label: 'Company Code', target: 'wnd[0]/usr/ctxtFTR_ENTRY-BUKRS', value: 'LTFH' }), { action: 'Enter Company Code', input: 'LTFH' });
  assert.equal(describe({ action: 'key', label: '11', value: '11' }).action, 'Save the transaction');
  assert.equal(describe({ action: 'key', label: '0', value: '0' }).action, 'Press Enter');
  assert.equal(describe({ action: 'tab', label: 'Structure tab', target: 'wnd[0]/usr/tabs/tabpMMFD01' }).action, 'Go to the Structure tab');
  assert.equal(describe({ action: 'fill', label: 'Facility number', value: '${facilityNumber}' }).input, 'the number SAP generated earlier');
});

test('runner messages are said in plain language', () => {
  assert.equal(
    plainLanguage("Partner: SAP control 'VTGFHA-KONTRH' was not present on SAPLFTR_FC / 1100 (Create Facility: Structure).", 'Partner'),
    'The "Partner" field or button was not found on the "Create Facility: Structure" screen.',
  );
  assert.equal(plainLanguage("Amount: expected '100', observed ''", 'Amount'), 'Expected "100", but SAP showed no value.');
  assert.equal(plainLanguage("Saved: expected 'created', observed 'FTR_GUI 339 | Enter a date | SAPLFTR_IRATE / 1100'", 'Saved'),
    'Expected "created", but SAP showed "Enter a date".');
});

test('the objective and test data come from the case Markdown, without technical names', () => {
  const markdown = '# TC-001 — x\n\n## Purpose\n\nCreate a **fixed deposit**\nfor `LTFH`.\n\nMore.\n\n## Test data\n\n| Field | Technical name | Value |\n|---|---|---|\n| Company Code | `FTR_ENTRY-BUKRS` | `LTFH` |\n';
  assert.equal(objectiveFrom(markdown), 'Create a fixed deposit for LTFH.');
  assert.deepEqual(testDataFrom(markdown), [{ field: 'Company Code', value: 'LTFH' }]);
});

test('only the case\'s own checks are verification checks, and each step gets its screenshot', () => {
  const plan = { steps: [
    { action: 'fill', label: 'Amount', value: '100' },
    { action: 'assert', label: 'Saved', source: 'status', expected: 'created' },
  ] };
  const report = buildFunctionalReport({
    run: { caseId: 'TC-001', systemId: 'S', startedAt: '2026-10-08T09:00:00Z', content: '# TC-001 — Loan', automation: { plan } },
    observed: {
      steps: [{ step: 'Amount', outcome: 'ok' }, { step: 'Saved', outcome: 'ok' }],
      assertions: [{ expected: 'Amount: 100', observed: '100', result: 'pass' }, { expected: 'Saved: created', observed: 'V1 311 | Loan 9 created', result: 'pass' }],
      documents: [{ type: 'Loan', number: '9' }],
    },
    verdict: 'PASS', problem: '', execution: {},
    evidence: [{ file: 'step-01.png', step: 1 }, { file: 'step-02.png', step: 2 }],
    evidenceDir: '/evidence',
  });
  assert.equal(report.result, 'Passed');
  assert.deepEqual(report.checks, [{ check: 'Saved', expected: 'created', actual: 'Loan 9 created', passed: true }]);
  assert.deepEqual(report.steps.map((step) => step.screenshots.length), [1, 1]);
  assert.equal(report.title, 'Loan');
});
