const fs = require('fs');
const path = require('path');

function createClaudeTokenStore(electronApp, safeStorage) {
  const tokenPath = path.join(electronApp.getPath('userData'), 'claude-oauth-token.bin');

  return {
    clear() {
      if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
    },
    get() {
      if (!fs.existsSync(tokenPath) || !safeStorage.isEncryptionAvailable()) return '';
      try {
        return safeStorage.decryptString(fs.readFileSync(tokenPath));
      } catch {
        return '';
      }
    },
    set(token) {
      const normalized = typeof token === 'string' ? token.trim() : '';
      if (normalized.length < 20 || normalized.length > 4096 || /\s/.test(normalized)) {
        throw new Error('Enter a valid Claude OAuth token.');
      }
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Secure credential storage is unavailable on this Windows account.');
      }
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
      fs.writeFileSync(tokenPath, safeStorage.encryptString(normalized));
      return normalized;
    },
  };
}

module.exports = { createClaudeTokenStore };
