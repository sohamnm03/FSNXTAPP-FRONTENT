const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { candidatePath, publishAutomation, readAutomation, sidecarPath } = require('./sapCaseAutomation');

const identity = { caseId: 'TC-900', lane: 'gui', systemId: 'DS4_100_NIIF' };
const plan = { version: 1, ...identity, observedOutcome: 'PASS', steps: [
  { action: 'transaction', label: 'Open', value: 'FTR_CREATE' },
  { action: 'fill', label: 'Company', target: 'wnd[0]/usr/ctxtX', value: '1000' },
  { action: 'press', label: 'Save', target: 'wnd[0]/tbar[0]/btn[11]', write: true },
  { action: 'assert', label: 'Saved', source: 'status', expected: 'Deal ', match: 'contains', verifiesWrite: true, capture: 'deal', pattern: 'Deal (\d+)' },
] };

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
  const bad = { ...plan, steps: plan.steps.map(({ verifiesWrite, ...step }) => step) };
  fs.writeFileSync(candidatePath(md), JSON.stringify(bad));
  assert.throws(() => publishAutomation(md, identity), /success assertion/);
});
