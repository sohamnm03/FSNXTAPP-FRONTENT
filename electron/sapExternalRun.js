const fs = require('fs');
const path = require('path');
const { automationPrompt } = require('./sapCaseAutomation');
const { buildRunReportDocx } = require('./sapRunReportDocx');
const { buildFunctionalReport } = require('./sapRunReport');

function createExternalRun(projectRoot, archiveRoot, runId, proposal) {
  const relativeRoot = `.external-runs/${runId}`;
  const workRoot = path.join(projectRoot, relativeRoot);
  const outputRoot = path.join(archiveRoot, 'runs', runId);
  fs.mkdirSync(path.join(workRoot, 'evidence'), { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(workRoot, 'case.md'), proposal.content, 'utf8');
  // Preserve the approved input before SAP is touched, outside the EXE's temporary workspace.
  fs.writeFileSync(path.join(outputRoot, 'case.md'), proposal.content, 'utf8');
  return { ...proposal, relativeRoot, workRoot, outputRoot, startedAt: new Date().toISOString() };
}

function externalRunPrompt(run) {
  return [
    `Execute the approved external testcase ${run.caseId} through the ${run.lane === 'gui' ? 'SAP GUI' : 'Fiori / WebGUI'} MCP tools. Read ${run.relativeRoot}/case.md first. This snapshot is the exact case the user approved; do not substitute a built-in case with the same id or run an unrelated frozen script.`,
    `The user selected Confirm & Run for system ${run.systemId} and these database writes: ${run.writes}. This satisfies rule 3 for this run only. Announce and perform those writes, including Save, without another chat confirmation or popup. Do not add writes outside that scope. Verify the actual session system, client and logged-on user before writing; stop on a mismatch. Discover controls live and execute every precondition, step and assertion. Verify the saved document number and success message from SAP. If a Save outcome is uncertain, inspect SAP before retrying to avoid duplicates.`,
    'For SAP GUI, attach to the logged-on session with sap_connect_existing and verify sap_get_session_info. For web, use the configured web tools and credentials. Never report an expected value as an observation.',
    `Record observations as you go with Write/Edit in ${run.relativeRoot}/observations.json. Take one screenshot per screen, not per step: once you have done everything on a screen and before you leave it (a new transaction, Enter, a button, a tab or a popup), capture it into ${run.relativeRoot}/evidence (screen-01.png, screen-02.png, ...) and list it in evidence with the screen title and the numbers of the steps done on it; the app builds the run's Word report from these. The JSON shape is {"verdict":"PASS|FAIL|BLOCKED|PARTIAL","systemConfirmed":true,"writesVerified":false,"session":"observed session and user","summary":"observed outcome or blocker","assertions":[{"expected":"from case","observed":"read from SAP, or NOT OBSERVED","result":"pass|fail|NOT OBSERVED"}],"steps":[{"step":"case step","outcome":"ok|skipped|error","detail":"what happened"}],"documents":[{"type":"observed type","number":"verified SAP number","leftInPlace":true}],"deviations":["observed deviation"],"evidence":[{"file":"screen-01.png","shows":"what is visible","screen":"screen title","steps":[1,2,3]}]}. Start with BLOCKED and update as you execute. Set writesVerified to true only after every authorized write is verified in SAP, or if the case is entirely read-only. PASS requires every step and assertion to succeed and all intended writes to be verified. Record missing values as NOT OBSERVED, never invent them.`,
    'Before finishing, write and read back observations.json even if blocked or failed. The desktop app will generate the result Markdown, rebuild the dashboard, create the local archive and upload it to Azure using the normal archive pipeline. Do not run those scripts yourself or claim an upload before the app reports it. Finish with a concise observed summary.',
    automationPrompt(run.lane, `${run.relativeRoot}/automation.json`),
  ].join('\n\n');
}

function cell(value) {
  return String(value ?? '').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ').trim();
}

function writeExternalResult(run, execution) {
  let observed = {};
  let problem = '';
  try {
    observed = JSON.parse(fs.readFileSync(path.join(run.workRoot, 'observations.json'), 'utf8').replace(/^\uFEFF/, ''));
    if (!observed || typeof observed !== 'object' || Array.isArray(observed)) throw new Error('Expected a JSON object');
  } catch {
    observed = {};
    problem = 'The runner did not produce a readable observation record. SAP writes may be unverified; inspect SAP before retrying.';
  }
  const rows = (key) => Array.isArray(observed[key]) ? observed[key].filter((row) => row && typeof row === 'object') : [];
  const assertions = rows('assertions').map((row) => ({ ...row, observed: row.observed ?? 'NOT OBSERVED', result: row.observed == null || row.observed === 'NOT OBSERVED' ? 'NOT OBSERVED' : row.result }));
  const steps = rows('steps');
  const documents = rows('documents');
  // A saved script says exactly whether the case writes (a step marked write:true);
  // only an AI-driven run falls back to reading the "Writes to the database" text,
  // and a header that opens with No/None ("None — nothing is created") is read-only.
  const planSteps = run.automation?.plan?.steps;
  const expectsDocument = Array.isArray(planSteps)
    ? planSteps.some((step) => step?.write === true)
    : /\b(?:creat\w*|sav\w*)\b/i.test(run.writes) && !/^\W*(?:no|none|n\/a|read[- ]only)\b/i.test(String(run.writes || ''));
  const missingDocument = expectsDocument
    && !documents.some((row) => row.number && row.number !== 'NOT OBSERVED');
  let verdict = ['PASS', 'FAIL', 'BLOCKED', 'PARTIAL'].includes(observed.verdict) ? observed.verdict : 'BLOCKED';
  if (execution.status !== 'completed') verdict = execution.status === 'stopped' ? 'PARTIAL' : 'FAIL';
  if (verdict === 'PASS' && (observed.systemConfirmed !== true || observed.writesVerified !== true || missingDocument || !assertions.length || !steps.length || assertions.some((row) => row.result !== 'pass') || steps.some((row) => row.outcome !== 'ok'))) {
    verdict = 'PARTIAL';
    problem = 'The observation record does not verify all steps, assertions, database writes and the target SAP system.';
  }
  if (problem && verdict === 'PASS') verdict = 'BLOCKED';
  fs.cpSync(run.workRoot, run.outputRoot, { recursive: true, filter: (source) => !fs.lstatSync(source).isSymbolicLink() });
  const evidence = rows('evidence').filter((row) => typeof row.file === 'string' && path.basename(row.file) === row.file && fs.existsSync(path.join(run.outputRoot, 'evidence', row.file)));
  const result = [
    `# ${run.caseId} — run ${run.startedAt}`,
    '',
    `- **Case:** \`${run.relativeRoot}/case.md\``,
    `- **System:** ${cell(run.systemId)} — **confirmed via session inspection:** ${observed.systemConfirmed === true ? 'yes' : 'no'}`,
    `- **Session:** ${cell(observed.session) || 'NOT OBSERVED'}`,
    `- **Run by:** ${cell(run.username)}`,
    `- **Verdict:** ${verdict}`,
    '', '## Assertions', '', '| # | Expected | Observed | Result |', '|---|---|---|---|',
    ...assertions.map((row, index) => `| ${index + 1} | ${cell(row.expected)} | ${cell(row.observed)} | ${cell(row.result) || 'NOT OBSERVED'} |`),
    '', '## Steps executed', '', '| # | Step | Outcome |', '|---|---|---|',
    ...steps.map((row, index) => `| ${index + 1} | ${cell(row.step)} | ${cell(row.outcome)} ${cell(row.detail)} |`),
    '', '## Deviations', '',
    ...(Array.isArray(observed.deviations) ? observed.deviations.map(cell) : []),
    ...(!observed.deviations?.length ? ['None'] : []),
    '', '## Outcome', '',
    cell(observed.summary), cell(problem), cell(execution.error),
    '', '## Documents created', '', '| Type | Number | Left in place? |', '|---|---|---|',
    ...documents.map((row) => `| ${cell(row.type)} | ${cell(row.number) || 'NOT OBSERVED'} | ${typeof row.leftInPlace === 'boolean' ? (row.leftInPlace ? 'yes' : 'no') : 'NOT OBSERVED'} |`),
    ...(documents.length ? [] : ['NOT OBSERVED']),
    '', '## Evidence', '', '| File | Shows |', '|---|---|',
    ...evidence.map((row) => `| evidences/${cell(row.file)} | ${cell(row.shows)} |`),
    '', '## Runner summary', '', execution.response || 'No final runner response.', '',
  ].join('\n');
  const stamp = run.startedAt.slice(0, 16).replace('T', '-').replace(':', '');
  const resultPath = path.join(run.outputRoot, `${run.caseId}-${stamp}-external.md`);
  fs.writeFileSync(resultPath, result, 'utf8');
  fs.writeFileSync(path.join(run.outputRoot, 'run.json'), JSON.stringify({ caseId: run.caseId, lane: run.lane, systemId: run.systemId, startedAt: run.startedAt, verdict, error: problem || execution.error, response: execution.response }, null, 2));
  // The shareable run report is a Word document: each step with the screenshot
  // of its screen, then assertions, documents and deviations. It replaces the
  // HTML dashboard in the run archive. A report that cannot be written never
  // costs the run its Markdown result.
  let reportPath = '';
  try {
    reportPath = path.join(run.outputRoot, `${run.caseId}-${stamp}-report.docx`);
    fs.writeFileSync(reportPath, buildRunReportDocx(buildFunctionalReport({
      run, observed, verdict, problem, execution, evidence, evidenceDir: path.join(run.outputRoot, 'evidence'),
    })));
  } catch {
    reportPath = '';
  }
  return { verdict, resultPath, reportPath, error: problem || (verdict !== 'PASS' ? observed.summary || `External testcase finished with ${verdict}.` : '') };
}

module.exports = { createExternalRun, externalRunPrompt, writeExternalResult };
