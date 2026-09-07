const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { webRuntimeEnvironment } = require('./sapWebRuntime');

test('packaged web runtime replaces host browser settings and handles Windows Path casing', () => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt runtime test '));
  try {
    const runtime = path.join(resources, 'sap-web-runtime');
    fs.mkdirSync(path.join(runtime, 'browsers'), { recursive: true });
    fs.writeFileSync(path.join(runtime, 'node.exe'), '');
    const original = { Path: 'host-node', PLAYWRIGHT_BROWSERS_PATH: 'developer-cache', SAP_SYSTEM_ID: 'test' };
    const env = webRuntimeEnvironment(resources, original);
    assert.equal(env.PATH, `${runtime}${path.delimiter}host-node`);
    assert.equal(env.Path, undefined);
    assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, path.join(runtime, 'browsers'));
    assert.equal(env.SAP_SYSTEM_ID, 'test');
    assert.equal(original.Path, 'host-node');
  } finally {
    fs.rmSync(resources, { recursive: true, force: true });
  }
});

test('missing runtime gives an actionable error', () => {
  assert.throws(() => webRuntimeEnvironment(path.join(__dirname, 'missing-runtime')), /Reinstall the latest FSNXT/);
});
