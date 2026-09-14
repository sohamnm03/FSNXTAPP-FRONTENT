const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createExternalRun, writeExternalResult } = require('./sapExternalRun');

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-external-test-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'temporary extracted project');
  const archives = path.join(root, 'persistent archives');
  const run = createExternalRun(project, archives, 'test-run', {
    caseId: 'TC-099', lane: 'gui', systemId: 'DS4_100_NIIF', username: 'test-user', writes: 'Creates one loan',
    content: '# TC-099 - External loan\n- **Lane:** sap-gui\n- **Transaction / app:** FTR_CREATE\n',
  });
  return { root, project, archives, run };
}

const observation = {
  verdict: 'PASS', systemConfirmed: true, writesVerified: true,
  steps: [{ step: 'Save loan', outcome: 'ok' }],
  assertions: [{ expected: 'Saved loan', observed: 'Loan 12345 saved', result: 'pass' }],
  documents: [{ type: 'Loan', number: '12345', leftInPlace: true }],
};

test('missing, incomplete and unverified results cannot become PASS', (context) => {
  const { run } = fixture(context);
  const execution = { status: 'completed', response: 'Finished', error: '' };
  assert.equal(writeExternalResult(run, execution).verdict, 'BLOCKED');
  for (const incomplete of [
    { ...observation, systemConfirmed: false },
    { ...observation, writesVerified: false },
    { ...observation, documents: [] },
    { ...observation, assertions: [{ expected: 'Saved loan', result: 'pass' }] },
    { ...observation, steps: [{ step: 'Save loan', outcome: 'skipped' }] },
  ]) {
    fs.writeFileSync(path.join(run.workRoot, 'observations.json'), JSON.stringify(incomplete));
    assert.equal(writeExternalResult(run, execution).verdict, 'PARTIAL');
  }
});

test('stopped runs preserve partial observations and do not claim success', (context) => {
  const { run } = fixture(context);
  fs.writeFileSync(path.join(run.workRoot, 'observations.json'), JSON.stringify(observation));
  const result = writeExternalResult(run, { status: 'stopped', response: '', error: '' });
  assert.equal(result.verdict, 'PARTIAL');
  assert.match(fs.readFileSync(result.resultPath, 'utf8'), /12345/);
  assert.equal(fs.existsSync(path.join(run.outputRoot, 'observations.json')), true);
});

test('real PowerShell finalization builds the standard dashboard, zip and Azure/log calls from only this run', { skip: process.platform !== 'win32' }, (context) => {
  const { project, archives, run } = fixture(context);
  const source = path.resolve(__dirname, '../packages/sap-testing-automation');
  for (const name of ['scripts/build-dashboard.ps1', 'scripts/lib-markdown.ps1', 'scripts/archive-run-artifacts.ps1', 'scripts/finalize-external-run.ps1', 'dashboard/template.html']) {
    const target = path.join(project, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, name), target);
  }
  fs.mkdirSync(path.join(project, 'test-cases'));
  fs.mkdirSync(path.join(project, 'results'));
  fs.writeFileSync(path.join(project, 'results/dashboard.html'), 'STALE REPORT MUST NOT BE ARCHIVED');
  fs.writeFileSync(path.join(run.workRoot, 'evidence', 'save.png'), 'test image placeholder');
  fs.writeFileSync(path.join(run.workRoot, 'observations.json'), JSON.stringify({ ...observation, evidence: [{ file: 'save.png', shows: 'Saved loan status' }] }));
  writeExternalResult(run, { status: 'completed', response: 'Saved 12345', error: '' });
  // Replace network boundaries only in this temporary fixture. No real Azure
  // connection, credentials or SAP system are accessed by this regression test.
  const archiveScript = path.join(project, 'scripts/archive-run-artifacts.ps1');
  const text = fs.readFileSync(archiveScript, 'utf8');
  const boundary = '$azureConnectionString = Get-AzureStorageConnectionString';
  assert.ok(text.includes(boundary));
  const mock = `
function Get-AzureStorageConnectionString { return 'mock-only' }
function Get-AzureBlobContext { param($ConnectionString) return @{ BlobEndpoint = 'https://example.invalid' } }
function Send-AzureBlobFile {
  param($Context, $Container, $BlobPath, $FilePath)
  if (-not (Test-Path -LiteralPath $FilePath)) { throw 'Archive not created' }
  @{ container = $Container; blob = $BlobPath } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputRoot 'upload.json')
}
function Send-ArchiveLog {
  param($Username, $Client, $TestCase, $BlobUrl, $Lane)
  @{ username = $Username; client = $Client; TC = $TestCase; path = $BlobUrl; lane = $Lane } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputRoot 'log.json')
}
`;
  fs.writeFileSync(archiveScript, text.replace(boundary, mock + boundary));
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(project, 'scripts/finalize-external-run.ps1'),
    '-RunId', 'test-run', '-StartedAtUtc', run.startedAt, '-Case', 'TC-099', '-Lane', 'gui', '-SystemId', run.systemId,
    '-ResultsDirectory', run.outputRoot, '-OutputRoot', archives,
  ], { encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, FSNXT_APP_USERNAME: 'test-user@example.invalid' } });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /Azure archive log updated/);
  const payload = JSON.parse(fs.readFileSync(path.join(run.outputRoot, 'dashboard-payload.json'), 'utf8'));
  assert.equal(payload.runs.length, 1);
  assert.equal(payload.runs[0].case, 'TC-099');
  assert.equal(payload.runs[0].lane, 'sap-gui');
  assert.equal(payload.runs[0].verdict, 'PASS');
  const upload = JSON.parse(fs.readFileSync(path.join(archives, 'upload.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(upload.container, 'sap-test-archives');
  assert.equal(upload.blob, 'test-user/test-run-TC-099-NIIF-gui.zip');
  const log = JSON.parse(fs.readFileSync(path.join(archives, 'log.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(log.TC, 'TC-099');
  assert.equal(log.client, 'NIIF');
  const zip = path.join(archives, 'test-run-TC-099-NIIF-gui.zip');
  const listing = spawnSync('tar.exe', ['-tf', zip], { encoding: 'utf8', windowsHide: true });
  assert.equal(listing.status, 0, listing.stderr);
  for (const file of ['dashboard.html', 'observations.json', 'run.json', 'case.md', 'evidences/save.png']) assert.ok(listing.stdout.replace(/\\/g, '/').includes(file), file);
});
