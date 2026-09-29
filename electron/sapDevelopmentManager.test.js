const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { developmentMcpRuntime, developmentNode, verifyDirectMcpServer } = require('./sapDevelopmentManager');

test('developmentNode uses the packaged standalone Node runtime', () => {
  const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-node-runtime-'));
  const executable = path.join(resourcesPath, 'node', 'node.exe');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, 'fixture');
  try {
    assert.equal(developmentNode({ isPackaged: true, resourcesPath }), executable);
  } finally {
    fs.rmSync(resourcesPath, { recursive: true, force: true });
  }
});

test('developmentMcpRuntime uses the packaging-safe dependency directory', () => {
  const resourcesPath = path.join('C:', 'Program Files', 'FS Sprint', 'resources');
  const runtime = developmentMcpRuntime({ isPackaged: true, resourcesPath }, 'unused');
  assert.equal(runtime.modulesRoot, path.join(resourcesPath, 'sap-development-mcp', 'modules'));
  assert.equal(runtime.entry, path.join(
    resourcesPath,
    'sap-development-mcp',
    'modules',
    'mcp-abap-abap-adt-api',
    'dist',
    'index.js',
  ));
});

test('verifyDirectMcpServer reports a missing runtime clearly', () => {
  const result = verifyDirectMcpServer('missing-node.exe', 'missing-server.js');
  assert.equal(result.ready, false);
  assert.match(result.reason, /Node\.js MCP runtime is missing/);
});

test('verifyDirectMcpServer validates a stdio server entry point', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-mcp-probe-'));
  const entry = path.join(fixtureRoot, 'server.js');
  fs.writeFileSync(entry, "process.stderr.write('ready\\n');\n");
  try {
    assert.deepEqual(verifyDirectMcpServer(process.execPath, entry), { ready: true, reason: '' });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
