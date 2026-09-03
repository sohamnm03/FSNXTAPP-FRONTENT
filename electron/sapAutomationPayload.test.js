const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { decryptFile, encryptFile } = require('../scripts/sapAutomationPayload');

test('SAP automation payload decrypts only with its generated key', async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-payload-test-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, 'source.bin');
  const payloadPath = path.join(root, 'payload.fsnxtpkg');
  const restoredPath = path.join(root, 'restored.bin');
  const content = Buffer.concat([Buffer.from('private SAP automation source\n'), Buffer.alloc(8192, 0xa5)]);
  fs.writeFileSync(sourcePath, content);

  const key = await encryptFile(sourcePath, payloadPath, 'a-long-build-password');
  assert.notDeepEqual(fs.readFileSync(payloadPath).subarray(0, content.length), content);

  await decryptFile(payloadPath, restoredPath, key);
  assert.deepEqual(fs.readFileSync(restoredPath), content);

  await assert.rejects(
    decryptFile(payloadPath, path.join(root, 'wrong.bin'), Buffer.alloc(32, 7)),
    /authenticate|auth/i,
  );
});

test('tampered SAP automation payload is rejected', async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-payload-test-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, 'source.bin');
  const payloadPath = path.join(root, 'payload.fsnxtpkg');
  fs.writeFileSync(sourcePath, 'protected content');

  const key = await encryptFile(sourcePath, payloadPath, 'another-long-build-password');
  const payload = fs.readFileSync(payloadPath);
  payload[Math.floor(payload.length / 2)] ^= 0xff;
  fs.writeFileSync(payloadPath, payload);

  await assert.rejects(
    decryptFile(payloadPath, path.join(root, 'restored.bin'), key),
    /authenticate|auth/i,
  );
});
