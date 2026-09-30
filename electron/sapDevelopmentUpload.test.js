const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('development upload uses Azure HTML content type, user folder and exact saved bytes', { skip: process.platform !== 'win32' }, (context) => {
  const base = path.resolve(__dirname, '../.build/test-temp');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'development-upload-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const html = '<!doctype html><html>Completed development</html>';
  const report = path.join(root, 'saved report.html');
  fs.writeFileSync(report, html);
  const script = path.resolve(__dirname, '../packages/sap-testing-automation/scripts/archive-run-artifacts.ps1');
  const wrapper = path.join(root, 'test-upload.ps1');
  fs.writeFileSync(wrapper, `
param($ArchiveScript, $ReportPath, $RequestPath)
$ErrorActionPreference = 'Stop'
function Invoke-WebRequest {
    param($Uri, $Method, $Headers, $Body, [switch]$UseBasicParsing, $TimeoutSec)
    if ($env:TEST_UPLOAD_FAILURE -eq '1') { throw 'Simulated network failure' }
    if ($Uri -like '*restype=container') { return }
    @{ uri = $Uri; method = $Method; contentType = $Headers['Content-Type'];
       authorization = $Headers.Authorization.StartsWith('SharedKey fixture:');
       body = [Text.Encoding]::UTF8.GetString($Body)
    } | ConvertTo-Json | Set-Content -LiteralPath $RequestPath
}
& $ArchiveScript -RunId 'test-run' -StartedAtUtc '2026-09-30T10:00:00Z' -DevelopmentReportPath $ReportPath
`);
  const request = path.join(root, 'request.json');
  const options = {
    encoding: 'utf8', windowsHide: true,
    env: {
      ...process.env,
      AZURE_STORAGE_CONNECTION_STRING: `DefaultEndpointsProtocol=https;AccountName=fixture;AccountKey=${Buffer.alloc(32).toString('base64')}`,
      FSNXT_APP_USERNAME: 'sample.user@example.com',
      TEST_UPLOAD_FAILURE: '0',
    },
  };
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapper, script, report, request];
  const result = spawnSync('powershell.exe', args, options);
  assert.equal(result.status, 0, result.stderr);
  const sent = JSON.parse(fs.readFileSync(request, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(sent.uri, 'https://fixture.blob.core.windows.net/sap-development-reports/sample.user/saved%20report.html');
  assert.equal(sent.contentType, 'text/html; charset=utf-8');
  assert.equal(sent.method, 'Put');
  assert.equal(sent.authorization, true);
  assert.equal(sent.body, html);
  assert.match(result.stdout, /sap-development-reports\/sample.user\/saved%20report.html/);
  const failed = spawnSync('powershell.exe', args, {
    ...options, env: { ...options.env, TEST_UPLOAD_FAILURE: '1' },
  });
  assert.notEqual(failed.status, 0);
  assert.equal(fs.readFileSync(report, 'utf8'), html);
});
