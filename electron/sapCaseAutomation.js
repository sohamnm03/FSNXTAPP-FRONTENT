const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Portable sidecars contain data and a fixed launcher, never arbitrary model-
// generated code. The desktop validates the entire file before using its plan.
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');
const normalize = (text) => text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const caseDigest = (text) => digest(normalize(text));
const sidecarPath = (file, lane) => file.replace(/\.md$/i, lane === 'gui' ? '.py' : '.spec.ts');
// Temporary build input, kept out of the way: users see only the .md and its script.
const candidatePath = (file) => path.join(path.dirname(file), '.fsnxt-plans', `${path.basename(file).replace(/\.md$/i, '')}.json`);
function clearCandidate(file) {
  try { fs.rmSync(candidatePath(file), { force: true }); fs.rmdirSync(path.dirname(candidatePath(file))); } catch { /* not empty or absent */ }
}
const operations = {
  gui: new Set(['transaction', 'fill', 'press', 'key', 'tab', 'select', 'check', 'assert']),
  web: new Set(['transaction', 'fill', 'click', 'key', 'select', 'check', 'assert']),
};

const vkeys = { enter: '0', f1: '1', f2: '2', f3: '3', back: '3', f4: '4', f5: '5', f6: '6', f7: '7', f8: '8', execute: '8', f9: '9', f10: '10', save: '11', f11: '11', f12: '12', cancel: '12' };

// Models describe the same observed step in slightly different spellings
// (full /app/con/ses ids, key names, doubled regex escapes). Normalize those
// to the strict contract instead of discarding an otherwise correct plan.
function normalizePlan(plan) {
  if (!plan || !Array.isArray(plan.steps)) return plan;
  const steps = plan.steps.map((step) => {
    if (!step || typeof step !== 'object') return step;
    const next = { ...step };
    if (typeof next.target === 'string') next.target = next.target.replace(/^\/app\/con\[\d+\]\/ses\[\d+\]\//, '');
    if (plan.lane === 'gui' && next.action === 'key' && typeof next.value === 'string') {
      next.value = vkeys[next.value.trim().toLowerCase()] ?? next.value.trim();
    }
    if (typeof next.pattern === 'string') next.pattern = next.pattern.replace(/\\\\/g, '\\');
    return next;
  });
  return { ...plan, steps };
}

function validatePlan(plan, { caseId, lane, systemId }) {
  if (!plan || plan.version !== 1 || plan.caseId !== caseId || plan.lane !== lane || plan.systemId !== systemId) throw new Error('Automation does not match this case, lane and system.');
  if (!Array.isArray(plan.steps) || !plan.steps.length || plan.steps.length > 500) throw new Error('Automation must contain 1–500 observed steps.');
  let assertions = 0;
  const captures = new Set();
  for (const [index, step] of plan.steps.entries()) {
    if (!step || !operations[lane]?.has(step.action) || typeof step.label !== 'string' || !step.label.trim()) throw new Error(`Unsupported automation step ${index + 1}.`);
    if (step.action === 'transaction' && !/^[A-Za-z0-9_/]+$/.test(step.value || '')) throw new Error('Invalid transaction.');
    if (['fill', 'select', 'key'].includes(step.action) && typeof step.value !== 'string') throw new Error('Step value must be text.');
    if (step.action === 'key' && lane === 'gui' && !/^\d{1,3}$/.test(step.value)) throw new Error('GUI keys must be numeric VKeys.');
    if (step.action === 'check' && typeof step.value !== 'boolean') throw new Error('Checkbox value must be boolean.');
    if (lane === 'gui' && !['transaction', 'key'].includes(step.action) && !(step.action === 'assert' && ['status', 'popup'].includes(step.source)) && !/^wnd\[\d+\]\//.test(step.target || '')) throw new Error('GUI step requires a discovered control id.');
    if (lane === 'web' && step.action !== 'transaction' && (typeof step.target !== 'string' || !step.target)) throw new Error('Web step requires a discovered selector.');
    if (step.action === 'assert') {
      assertions++;
      if (typeof step.expected !== 'string' || !['equals', 'contains'].includes(step.match || 'equals')) throw new Error('Assertion requires an expected value and equals/contains comparison.');
      if (!['field', 'status', 'text', 'value', 'checked', 'popup'].includes(step.source)) throw new Error('Assertion source is required.');
      if (step.capture) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(step.capture) || typeof step.pattern !== 'string' || !step.pattern) throw new Error('Capture needs a name and a pattern with one capture group.');
        new RegExp(step.pattern);
        captures.add(step.capture);
      }
    }
    for (const value of [step.value, step.expected]) {
      if (typeof value === 'string') for (const match of value.matchAll(/\$\{([^}]+)\}/g)) {
        if (!captures.has(match[1]) || match[1] === step.capture) throw new Error('A dynamic value must be captured from an earlier SAP observation.');
      }
    }
    if (step.write === true) {
      // Only popup confirmations (a window[1+] press or Enter) may sit between a write and its proof.
      let at = index + 1;
      while (plan.steps[at] && (plan.steps[at].action === 'assert' && plan.steps[at].source === 'popup' && !plan.steps[at].verifiesWrite
        || plan.steps[at].action === 'press' && /^wnd\[[1-9]\]\//.test(plan.steps[at].target || '')
        || plan.steps[at].action === 'key' && plan.steps[at].value === '0')) at++;
      const next = plan.steps[at];
      if (!next || next.action !== 'assert' || next.verifiesWrite !== true || !next.expected) throw new Error('Every database write must be followed by a success assertion (only popup confirmations may come between).');
    }
    if (step.verifiesWrite === true && (step.action !== 'assert' || !plan.steps.slice(0, index).some((earlier) => earlier.write === true))) throw new Error('Write verification must follow its write.');
  }
  if (!assertions) throw new Error('Automation needs observed assertions.');
  return plan;
}

function renderSidecar(bundle) {
  const encoded = Buffer.from(JSON.stringify(bundle)).toString('base64');
  if (bundle.plan.lane === 'gui') return `# FSNXT-AUTOMATION-V1 ${encoded}\n# Keep this file beside its matching Markdown case. Run through FSNXT.\nfrom gui_tests.external_case import run_encoded\n\nif __name__ == "__main__":\n    run_encoded("${encoded}")\n`;
  return `// FSNXT-AUTOMATION-V1 ${encoded}\n// Keep this file beside its matching Markdown case. Run through FSNXT.\nexport {};\nconst { defineExternalCase } = await import(process.env.FSNXT_EXTERNAL_CASE_RUNTIME as string);\ndefineExternalCase(JSON.parse(Buffer.from('${encoded}', 'base64').toString('utf8')).plan);\n`;
}

function readAutomation(filePath, content, identity) {
  try {
    const file = sidecarPath(filePath, identity.lane);
    const source = normalize(fs.readFileSync(file, 'utf8'));
    if (source.length > 2_000_000) return null;
    const match = source.match(/^(?:#|\/\/) FSNXT-AUTOMATION-V1 ([A-Za-z0-9+/=]+)\n/);
    if (!match) return null;
    const bundle = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    if (bundle.caseSha256 !== caseDigest(content) || renderSidecar(bundle) !== source) return null;
    validatePlan(bundle.plan, identity);
    return { filePath: file, source, sha256: digest(source), plan: bundle.plan };
  } catch { return null; }
}

function publishAutomation(filePath, identity, sourcePath = candidatePath(filePath)) {
  if (!fs.existsSync(sourcePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const candidate = JSON.parse(fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, ''));
  if (candidate.observedOutcome !== 'PASS') return null;
  const plan = validatePlan(normalizePlan(candidate), identity);
  const bundle = { caseSha256: caseDigest(content), plan };
  const destination = sidecarPath(filePath, identity.lane);
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, renderSidecar(bundle), 'utf8');
  fs.renameSync(temporary, destination);
  fs.unlinkSync(sourcePath);
  clearCandidate(filePath);
  return destination;
}

function automationPrompt(lane, destination) {
  return [
    'Prepare repeat-run automation from the exact steps you just observed, without running the scenario again or doing extra SAP writes. Read docs/external-case-automation.md for the supported step contract.',
    `After a completely successful observed case, write a JSON plan to ${destination}. For new cases write one plan per .md file at <that folder>/.fsnxt-plans/<Markdown basename without .md>.json (create the .fsnxt-plans folder if needed); it is a temporary build input the app consumes and deletes, never a deliverable. For a failed, blocked or incompletely observed case, do not create a plan.`,
    `Use version:1, caseId, lane:"${lane}", systemId (the exact registry id), observedOutcome:"PASS", and steps. Include EVERY precondition, step and assertion in the Markdown, in order; never shorten the business flow for speed. Use only actually discovered controls and observed values. Mark every Save/post/settle or other database-writing action write:true and immediately follow it with an assert marked verifiesWrite:true that reads the real success result. Capture new document numbers from SAP; never reuse the document number from authoring. Do not store credentials, cookies or machine-specific paths. Use exact spellings from docs/external-case-automation.md: GUI targets start at wnd[0]/ (no /app/con[0]/ses[0]/ prefix) and GUI keys are numeric VKey strings ("0" Enter, "11" Save). If any step cannot be represented by the supported contract, omit the plan and explain that this case still needs interactive execution.`,
    'The app validates the plan structure and creates the matching .py (GUI) or .spec.ts (web) sidecar. Do not write arbitrary Python/TypeScript code, change execution registries, or mark the case frozen. A saved plan is not evidence that a scripted regression run has passed.',
  ].join('\n\n');
}

module.exports = { clearCandidate, normalizePlan, automationPrompt, candidatePath, caseDigest, publishAutomation, readAutomation, renderSidecar, sidecarPath, validatePlan };
