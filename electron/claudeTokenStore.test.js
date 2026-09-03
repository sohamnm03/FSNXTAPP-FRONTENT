const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createClaudeTokenStore } = require('./claudeTokenStore');

test('Claude OAuth tokens are encrypted, restored, and removed', (context) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-token-store-'));
  context.after(() => fs.rmSync(userData, { force: true, recursive: true }));
  const safeStorage = {
    decryptString: (encrypted) => Buffer.from(encrypted).reverse().toString('utf8'),
    encryptString: (value) => Buffer.from(value, 'utf8').reverse(),
    isEncryptionAvailable: () => true,
  };
  const store = createClaudeTokenStore({ getPath: () => userData }, safeStorage);
  const token = 'sk-ant-oat01-example-token-value';

  store.set(token);

  const encrypted = fs.readFileSync(path.join(userData, 'claude-oauth-token.bin'));
  assert.equal(encrypted.includes(token), false);
  assert.equal(store.get(), token);

  store.clear();
  assert.equal(store.get(), '');
});

test('Claude OAuth tokens are never stored without OS encryption', () => {
  const store = createClaudeTokenStore(
    { getPath: () => os.tmpdir() },
    { isEncryptionAvailable: () => false },
  );

  assert.throws(
    () => store.set('sk-ant-oat01-example-token-value'),
    /Secure credential storage is unavailable/,
  );
});
