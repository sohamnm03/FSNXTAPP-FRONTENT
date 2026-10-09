const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { publishElectronBuilderOutput } = require('./packageWindows');

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-package-output-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'staged');
  const destination = path.join(root, 'release');
  fs.mkdirSync(path.join(source, 'win-unpacked'), { recursive: true });
  fs.mkdirSync(path.join(destination, 'win-unpacked'), { recursive: true });
  fs.writeFileSync(path.join(source, 'win-unpacked', 'FS Sprint.exe'), 'new app');
  fs.writeFileSync(path.join(source, 'FS Sprint Setup 1.0.7.exe'), 'new installer');
  fs.writeFileSync(path.join(source, 'latest.yml'), 'new metadata');
  fs.writeFileSync(path.join(destination, 'win-unpacked', 'stale.txt'), 'stale app');
  fs.writeFileSync(path.join(destination, 'FS Sprint Setup 1.0.7.exe'), 'old installer');
  fs.writeFileSync(path.join(destination, 'keep-older-version.exe'), 'older release');
  return { source, destination };
}

test('publishes completed Electron Builder output and preserves unrelated releases', (context) => {
  const { source, destination } = fixture(context);

  publishElectronBuilderOutput(source, destination);

  assert.equal(fs.readFileSync(path.join(destination, 'win-unpacked', 'FS Sprint.exe'), 'utf8'), 'new app');
  assert.equal(fs.existsSync(path.join(destination, 'win-unpacked', 'stale.txt')), false);
  assert.equal(fs.readFileSync(path.join(destination, 'FS Sprint Setup 1.0.7.exe'), 'utf8'), 'new installer');
  assert.equal(fs.readFileSync(path.join(destination, 'latest.yml'), 'utf8'), 'new metadata');
  assert.equal(fs.readFileSync(path.join(destination, 'keep-older-version.exe'), 'utf8'), 'older release');
});

test('refuses an empty Electron Builder output directory', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-package-empty-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'staged');
  fs.mkdirSync(source);

  assert.throws(() => publishElectronBuilderOutput(source, path.join(root, 'release')), /empty output directory/);
});
