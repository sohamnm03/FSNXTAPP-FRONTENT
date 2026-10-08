// Turns a run's technical record (plan steps, observations, runner messages)
// into the functional content of its Word report: business-language steps,
// plain-language outcomes, the case's objective and test data. Nothing here
// talks to SAP; it only re-words what the run already recorded.
const path = require('path');

const KEY_NAMES = {
  0: 'Press Enter', 3: 'Go back (F3)', 5: 'Press F5', 8: 'Execute (F8)', 11: 'Save the transaction',
  12: 'Cancel (F12)', 4: 'Open the value help (F4)', 2: 'Select (F2)',
};

const STARTS_WITH_VERB = /^(?:set|enter|fill|select|choose|open|start|press|save|confirm|verify|check|read|navigate|click|acknowledge|switch|display|create|go|tick|untick|post|settle|capture|run|execute|close|accept|cancel)\b/i;

function readableValue(value) {
  return String(value ?? '').replace(/\$\{[^}]+\}/g, 'the number SAP generated earlier').trim();
}

// The instruction a business tester would follow for one plan step.
function describe(step) {
  const label = String(step.label || '').trim();
  const value = readableValue(step.value);
  switch (step.action) {
    case 'transaction': return { action: `Open transaction ${value || label}`, input: '' };
    case 'fill': return { action: STARTS_WITH_VERB.test(label) ? label : `Enter ${label}`, input: value };
    case 'key': {
      const named = KEY_NAMES[Number(value)];
      return { action: label && !/^\d+$/.test(label) ? label : named || `Press key ${value}`, input: '' };
    }
    case 'tab': return { action: STARTS_WITH_VERB.test(label) ? label : `Go to the ${label.replace(/\s*tab$/i, '')} tab`, input: '' };
    case 'press': return { action: STARTS_WITH_VERB.test(label) ? label : `Click ${label}`, input: '' };
    case 'select': return { action: STARTS_WITH_VERB.test(label) ? label : `Choose ${label}`, input: value };
    case 'check': return { action: `${String(step.value) === 'true' ? 'Tick' : 'Untick'} ${label}`, input: '' };
    case 'assert': return { action: STARTS_WITH_VERB.test(label) ? label : `Check: ${label}`, input: readableValue(step.expected) ? `Expected: ${readableValue(step.expected)}` : '' };
    default: return { action: label, input: value };
  }
}

// Runner and SAP GUI messages, said the way a business reader would.
// Drops the technical parts of an SAP status line (message id/number,
// program / screen) and keeps the words a person reads on screen.
function screenText(value) {
  return String(value ?? '').split(' | ')
    .filter((part) => !/^[A-Z0-9_]+ \/ \d+$/.test(part.trim()) && !/^[A-Z0-9_]{1,20} \d{3}$/.test(part.trim()))
    .join(' — ').trim();
}

function plainLanguage(message, label = '') {
  let text = String(message || '').trim();
  if (label && text.startsWith(`${label}:`)) text = text.slice(label.length + 1).trim();
  const subject = label && !/^\d+$/.test(label) ? `"${label}"` : 'This field or button';
  let match = text.match(/SAP control '[^']*' was not present on .*?\((.*?)\)\.?(?:\s*Status:\s*(.*))?$/);
  if (match) return `${subject === 'This field or button' ? subject : `The ${subject} field or button`} was not found on the "${match[1].replace(/:\s*$/, '')}" screen.${match[2] ? ` SAP said: ${match[2]}` : ''}`;
  match = text.match(/expected '([\s\S]*)', observed '([\s\S]*)'$/) || text.match(/expected '([\s\S]*)', observed "([\s\S]*)"$/);
  if (match) {
    const shown = screenText(match[2]);
    return shown ? `Expected "${match[1]}", but SAP showed "${shown}".` : `Expected "${match[1]}", but SAP showed no value.`;
  }
  if (/was never captured/.test(text)) return 'This step needed the document number from an earlier step, which was not available.';
  if (/^Started; completion not yet verified$/.test(text)) return 'The run stopped before this step finished.';
  if (/^Executed and checked$/.test(text)) return '';
  return text;
}

function section(markdown, heading) {
  const lines = String(markdown || '').split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${heading}\\b`, 'i').test(line.trim()));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line.trim()));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

const stripMarkdown = (value) => String(value || '').replace(/`/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

function objectiveFrom(markdown) {
  const paragraph = [];
  for (const line of section(markdown, 'Purpose')) {
    if (!line.trim()) { if (paragraph.length) break; continue; }
    paragraph.push(line.trim());
  }
  return stripMarkdown(paragraph.join(' '));
}

// The case's Test data table without its technical-name column.
function testDataFrom(markdown) {
  const rows = section(markdown, 'Test data')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => stripMarkdown(cell)));
  if (rows.length < 3) return [];
  const header = rows[0].map((cell) => cell.toLowerCase());
  const fieldAt = Math.max(0, header.findIndex((cell) => cell.includes('field')));
  const valueAt = header.findIndex((cell) => cell.includes('value'));
  return rows.slice(2)
    .map((cells) => ({ field: cells[fieldAt] || '', value: cells[valueAt < 0 ? cells.length - 1 : valueAt] || '' }))
    .filter((row) => row.field || row.value);
}

function titleFrom(markdown, fallback) {
  const heading = String(markdown || '').split(/\r?\n/).find((line) => /^#\s+/.test(line)) || '';
  return stripMarkdown(heading.replace(/^#\s+/, '').replace(/^TC-\d+\s*[—–-]\s*/, '')) || fallback || '';
}

const RESULT_WORDS = { PASS: 'Passed', FAIL: 'Failed', PARTIAL: 'Partially verified', BLOCKED: 'Blocked' };

function buildFunctionalReport({ run, observed, verdict, problem, execution, evidence, evidenceDir }) {
  const planSteps = Array.isArray(run.automation?.plan?.steps) ? run.automation.plan.steps : [];
  const observedSteps = Array.isArray(observed.steps) ? observed.steps.filter((row) => row && typeof row === 'object') : [];
  const shotsByStep = new Map();
  const unmatchedShots = [];
  for (const item of evidence) {
    const file = path.join(evidenceDir, item.file);
    const number = Number(item.step);
    if (number > 0) shotsByStep.set(number, [...(shotsByStep.get(number) || []), { path: file, caption: item.shows }]);
    else unmatchedShots.push({ path: file, caption: item.shows, label: item.shows });
  }

  // Observed steps follow the plan in order; extra rows (for example an SAP
  // information message the runner acknowledged) have no plan step.
  let planAt = 0;
  const steps = observedSteps.map((row) => {
    const label = String(row.step || '');
    let planStep = null;
    if (planSteps[planAt] && planSteps[planAt].label === label) planStep = planSteps[planAt++];
    const described = planStep ? describe(planStep)
      : /express information/i.test(label) ? { action: 'Acknowledge the SAP information message', input: '' }
        : { action: label, input: '' };
    const status = row.outcome === 'ok' ? 'Passed' : row.outcome === 'skipped' ? 'Not run' : 'Failed';
    let screenshots = planStep ? shotsByStep.get(planAt) || [] : [];
    if (!planStep && !planSteps.length) {
      // An AI-driven run has no plan: match its screenshots by caption.
      screenshots = unmatchedShots.filter((shot) => shot.label && shot.label.trim() === label.trim());
      screenshots.forEach((shot) => { shot.used = true; });
    }
    return {
      action: described.action,
      input: described.input,
      status,
      note: status === 'Passed' ? '' : plainLanguage(row.detail, label),
      screenshots,
    };
  });
  if (!planSteps.length) {
    for (const [number, shots] of shotsByStep) if (steps[number - 1]) steps[number - 1].screenshots.push(...shots);
  }

  // Verification checks are the case's own assert steps; the read-back of every
  // typed value is evidence for the step, not a separate business check.
  const checkLabels = new Set(planSteps.filter((step) => step.action === 'assert').map((step) => step.label));
  const assertions = Array.isArray(observed.assertions) ? observed.assertions.filter((row) => row && typeof row === 'object') : [];
  const checks = assertions
    .map((row) => {
      const full = String(row.expected || '');
      const label = [...checkLabels].find((candidate) => full.startsWith(`${candidate}: `)) || (checkLabels.size ? '' : full.split(': ')[0]);
      if (!label && checkLabels.size) return null;
      const expected = full.slice(label.length + 2) || full;
      const actual = row.observed == null || row.observed === 'NOT OBSERVED' ? 'Not observed' : screenText(row.observed) || 'No value shown';
      return { check: label || full, expected, actual, passed: row.result === 'pass' };
    })
    .filter(Boolean);

  const documents = (Array.isArray(observed.documents) ? observed.documents : [])
    .filter((row) => row && row.number && row.number !== 'NOT OBSERVED')
    .map((row) => ({ type: row.type || 'Document', number: String(row.number) }));
  const stepFor = (message) => {
    const at = observedSteps.findIndex((row) => row.step && String(message).startsWith(`${row.step}:`));
    return at < 0 ? null : { number: at + 1, label: String(observedSteps[at].step) };
  };
  const issues = [...new Set([
    ...(Array.isArray(observed.deviations) ? observed.deviations : []).map((row) => {
      const step = stepFor(row);
      return step ? `Step ${step.number} (${steps[step.number - 1]?.action || step.label}): ${plainLanguage(row, step.label)}` : plainLanguage(row);
    }),
    plainLanguage(problem),
    plainLanguage(execution?.error),
  ].filter(Boolean))];

  const passedSteps = steps.filter((step) => step.status === 'Passed').length;
  return {
    caseId: run.caseId,
    title: titleFrom(run.content, run.summary),
    objective: objectiveFrom(run.content),
    systemId: run.systemId,
    runBy: run.username || '',
    startedAt: run.startedAt,
    result: RESULT_WORDS[verdict] || verdict || 'Not observed',
    passed: verdict === 'PASS',
    stepsSummary: `${passedSteps} of ${steps.length} steps passed`,
    checksSummary: checks.length ? `${checks.filter((check) => check.passed).length} of ${checks.length} checks passed` : '',
    testData: testDataFrom(run.content),
    steps,
    otherScreenshots: unmatchedShots.filter((shot) => !shot.used),
    checks,
    documents,
    issues,
  };
}

module.exports = { buildFunctionalReport, describe, plainLanguage, testDataFrom, objectiveFrom };
