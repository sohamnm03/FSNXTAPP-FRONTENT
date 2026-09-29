const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const { generateDevelopmentReport, safeReportFolderName } = require('./sapDevelopmentReport');

test('safeReportFolderName produces a Windows-safe unique folder name', () => {
  const result = safeReportFolderName('run:id/unsafe', new Date('2026-09-23T10:30:45.123Z'));
  assert.equal(result, '2026-09-23T10-30-45-123Z-runidunsafe');
});

test('development dashboard is generated, preserved and opened', { skip: process.platform !== 'win32' }, async (context) => {
  const fixtureBase = path.resolve(__dirname, '../.build/test-temp');
  fs.mkdirSync(fixtureBase, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(fixtureBase, 'fsnxt-development-report-'));
  context.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const projectRoot = path.join(fixtureRoot, 'project');
  const reportsRoot = path.join(fixtureRoot, 'reports');
  const sourceRoot = path.resolve(__dirname, '../packages/Sap-Project-Development V1/Sap-Project-Development V1');

  for (const relative of ['scripts/build-dashboard.ps1', 'scripts/lib-markdown.ps1', 'dashboard/template.html']) {
    const destination = path.join(projectRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, relative), destination);
  }
  const worklog = path.join(projectRoot, 'worklog', 'DS4_100_NIIF', '2026-09', '2026-09-23-1600-sample.md');
  fs.mkdirSync(path.dirname(worklog), { recursive: true });
  fs.writeFileSync(worklog, [
    '# Sample development activity',
    '- **Package:** ZFS_SAMPLE',
    '- **Transport:** DS4K900001',
    '## Todo',
    '- [x] Complete work',
    '## Object list',
    '| Object | Type | Package | Transport | Status |',
    '|---|---|---|---|---|',
    '| ZFS_R_SAMPLE | PROG/P | ZFS_SAMPLE | DS4K900001 | Activated |',
    '## Delivery checks',
    '- [x] Activated',
    '## Lessons raised',
    'None.',
  ].join('\n'));

  let openedPath = '';
  const result = await generateDevelopmentReport({
    completedWorklogPaths: ['worklog/DS4_100_NIIF/2026-09/2026-09-23-1600-sample.md'],
    projectRoot,
    reportsRoot,
    runId: 'sample-run',
    openPath: async (filePath) => { openedPath = filePath; return ''; },
  });

  assert.equal(result.reportPath, openedPath);
  assert.equal(result.reportDirectory, reportsRoot);
  assert.equal(path.dirname(result.reportPath), reportsRoot);
  assert.match(path.basename(result.reportPath), /^sap-development-activity-.+\.html$/);
  assert.equal(fs.existsSync(result.reportPath), true);
  assert.equal(fs.existsSync(path.join(result.reportDirectory, 'dashboard-payload.json')), false);
  const report = fs.readFileSync(result.reportPath, 'utf8');
  assert.match(report, /Sample development activity/);
  assert.match(report, /"status": "complete"/);
});
