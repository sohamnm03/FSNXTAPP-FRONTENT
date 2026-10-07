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
const isGuiTabTarget = (target) => typeof target === 'string' && /\/tabp[^/]+$/i.test(target);
const isGuiCommandField = (target) => typeof target === 'string'
  && /\/tbar\[\d+\]\/(?:c?txt)?(?:okcd|okcode)(?:\b|$)/i.test(target);

function markdownTechnicalValue(content, technicalName) {
  for (const line of String(content || '').split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    const at = cells.findIndex((cell) => cell.replace(/[`*]/g, '').trim() === technicalName);
    if (at < 0 || !cells[at + 1]) continue;
    const code = cells[at + 1].match(/`([^`]+)`/);
    const value = String(code?.[1] || cells[at + 1]).split(/\s+[—–-]\s+/, 1)[0].trim();
    if (/^[A-Za-z0-9_.-]{1,20}$/.test(value)) return value;
  }
  return '';
}

// A repeat run must not depend on a user's current SAP default company code.
// Restore the exact FTR_ENTRY-BUKRS value approved in the matching Markdown
// when an early sidecar omitted that precondition from its plan.
function completePlanFromMarkdown(plan, content) {
  return completeEntryDefaults(completeCompanyCode(plan, content));
}

// Product/Transaction Type on the FTR_CREATE entry screen are not derived from
// the company code: they are the user's remembered SAP parameter values, so a
// different SAP user or session shows them blank. A plan authored on a session
// where they happened to be pre-filled asserts them without ever typing them.
// Type the asserted value first; the assertion then reads back what was typed.
function completeEntryDefaults(plan) {
  if (!plan || plan.lane !== 'gui' || !Array.isArray(plan.steps)) return plan;
  const entryField = /^wnd\[0\]\/usr\/ctxtFTR_ENTRY-(?:SGSART|SFHAART)$/i;
  let inCreateTransaction = false;
  let filled = new Set();
  const steps = [];
  for (const step of plan.steps) {
    if (step?.action === 'transaction') {
      const transaction = String(step.value || '').trim().toUpperCase().replace(/^\/(?:N|O)/, '');
      inCreateTransaction = transaction === 'FTR_CREATE';
      filled = new Set();
    }
    const target = step?.target || '';
    if (inCreateTransaction && step?.action === 'fill' && entryField.test(target)) filled.add(target.toLowerCase());
    if (inCreateTransaction && step?.action === 'assert' && step.source === 'field' && entryField.test(target)
      && !filled.has(target.toLowerCase()) && step.match !== 'contains' && step.expected) {
      filled.add(target.toLowerCase());
      steps.push({ action: 'fill', target, value: step.expected, label: `Set ${step.label}` });
    }
    steps.push(step);
  }
  return { ...plan, steps };
}

function completeCompanyCode(plan, content) {
  const normalized = normalizePlan(plan);
  if (!normalized || normalized.lane !== 'gui' || !Array.isArray(normalized.steps)) return normalized;
  const companyCode = markdownTechnicalValue(content, 'FTR_ENTRY-BUKRS');
  if (!companyCode || normalized.steps.some((step) => /(?:^|\/)c?txtFTR_ENTRY-BUKRS$/i.test(step?.target || ''))) return normalized;
  const transaction = normalized.steps.findIndex((step) => step?.action === 'transaction');
  if (transaction < 0) return normalized;
  const steps = normalized.steps.slice();
  steps.splice(transaction + 1, 0, {
    action: 'fill',
    target: 'wnd[0]/usr/ctxtFTR_ENTRY-BUKRS',
    value: companyCode,
    label: `Set Company Code ${companyCode}`,
  });
  return { ...normalized, steps };
}

// Models describe the same observed step in slightly different spellings
// (full /app/con/ses ids, key names, doubled regex escapes). Normalize those
// to the strict contract instead of discarding an otherwise correct plan.
function normalizePlan(plan) {
  if (!plan || !Array.isArray(plan.steps)) return plan;
  const steps = plan.steps.map((step) => {
    if (!step || typeof step !== 'object') return step;
    const next = { ...step };
    if (typeof next.target === 'string') next.target = next.target.replace(/^\/app\/con\[\d+\]\/ses\[\d+\]\//, '');
    // SAP GUI tab controls expose `.select()`, not `.press()`. Models often
    // describe that operation as press/select because both words are natural
    // in prose. Store one canonical action so new sidecars cannot reproduce
    // the <unknown>.press failure seen on TFSIN and LTFS.
    if (plan.lane === 'gui' && isGuiTabTarget(next.target) && ['press', 'select'].includes(next.action)) {
      next.action = 'tab';
      delete next.value;
    }
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
    if (lane === 'gui' && step.action === 'fill' && isGuiCommandField(step.target)) throw new Error('GUI transaction navigation must use a transaction step.');
    if (step.action === 'key' && lane === 'gui' && !/^\d{1,3}$/.test(step.value)) throw new Error('GUI keys must be numeric VKeys.');
    if (step.action === 'check' && typeof step.value !== 'boolean') throw new Error('Checkbox value must be boolean.');
    if (lane === 'gui' && !['transaction', 'key'].includes(step.action) && !(step.action === 'assert' && ['status', 'popup'].includes(step.source)) && !/^wnd\[\d+\]\//.test(step.target || '')) throw new Error('GUI step requires a discovered control id.');
    if (lane === 'gui' && step.action === 'tab' && !isGuiTabTarget(step.target)) throw new Error('GUI tab action requires a discovered tab control id.');
    if (lane === 'web' && step.action !== 'transaction' && (typeof step.target !== 'string' || !step.target)) throw new Error('Web step requires a discovered selector.');
    if (step.action === 'assert') {
      assertions++;
      if (typeof step.expected !== 'string' || !['equals', 'contains'].includes(step.match || 'equals')) throw new Error('Assertion requires an expected value and equals/contains comparison.');
      if (!['field', 'status', 'text', 'value', 'checked', 'popup'].includes(step.source)) throw new Error('Assertion source is required.');
      if (step.numeric !== undefined && typeof step.numeric !== 'boolean') throw new Error('Assertion numeric marker must be true or false.');
      if (step.numeric === true && (!['field', 'value'].includes(step.source) || (step.match || 'equals') !== 'equals')) {
        throw new Error('Numeric comparison is only valid for exact field/value assertions.');
      }
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
    const plan = validatePlan(completePlanFromMarkdown(bundle.plan, content), identity);
    return { filePath: file, source, sha256: digest(source), plan };
  } catch { return null; }
}

function publishAutomation(filePath, identity, sourcePath = candidatePath(filePath)) {
  if (!fs.existsSync(sourcePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const candidate = JSON.parse(fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, ''));
  if (candidate.observedOutcome !== 'PASS') return null;
  const plan = validatePlan(completePlanFromMarkdown(candidate, content), identity);
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
    `Use version:1, caseId, lane:"${lane}", systemId (the exact registry id), observedOutcome:"PASS", and steps. Include EVERY precondition, step and assertion in the Markdown, in order; never shorten the business flow for speed. Use only actually discovered controls and observed values. Never rely on the user's current SAP default company code: explicitly set and read back the Markdown's FTR_ENTRY-BUKRS value before the other entry fields. Likewise never rely on pre-filled Product Type / Transaction Type (FTR_ENTRY-SGSART / FTR_ENTRY-SFHAART): they are the SAP user's remembered values and read blank on another session, so fill each with the Markdown value before asserting it. Mark every Save/post/settle or other database-writing action write:true and immediately follow it with an assert marked verifiesWrite:true that reads the real success result. Capture new document numbers from SAP; never reuse the document number from authoring. Do not store credentials, cookies or machine-specific paths. Use exact spellings from docs/external-case-automation.md: GUI targets start at wnd[0]/ (no /app/con[0]/ses[0]/ prefix), GUI tab targets ending in /tabp... always use action:"tab" (never press/select), and GUI keys are numeric VKey strings ("0" Enter, "11" Save). Before using a control nested below /tabp..., include a tab action for that exact ancestor even if it was already active while authoring. Record field/value assertions without SAP's outer display padding; the runtime ignores outer whitespace and treats inner whitespace runs as one space. Mark exact field/value assertions for amounts, rates or quantities with numeric:true so grouping separators, decimal zero-padding and SAP's trailing minus are compared by numeric value; never mark identifiers, company codes or dates numeric. For an ALV/GuiGridView assertion, use source:"text", the discovered grid target and match:"contains" with an observed cell value; the runtime reads row data rather than the COM type name. A GUI status assertion can match the SAP message id/number, message text, or exact active-screen title exposed by the runtime (with match:"equals" the expected value must be exactly one of those values; use match:"contains" for partial text); never append a selected tab caption to that title. If any step cannot be represented by the supported contract, omit the plan and explain that this case still needs interactive execution.`,
    'The app validates the plan structure and creates the matching .py (GUI) or .spec.ts (web) sidecar. Do not write arbitrary Python/TypeScript code, change execution registries, or mark the case frozen. A saved plan is not evidence that a scripted regression run has passed.',
  ].join('\n\n');
}

module.exports = { clearCandidate, completePlanFromMarkdown, normalizePlan, automationPrompt, candidatePath, caseDigest, publishAutomation, readAutomation, renderSidecar, sidecarPath, validatePlan };
