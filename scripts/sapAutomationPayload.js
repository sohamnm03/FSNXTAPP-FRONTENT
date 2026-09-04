const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const MAGIC = Buffer.from('FSNXTSAP');
const VERSION = 1;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH;

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

async function encryptFile(sourcePath, destinationPath, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv]);

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, header);
  await pipeline(
    fs.createReadStream(sourcePath),
    cipher,
    fs.createWriteStream(destinationPath, { flags: 'a' }),
  );
  fs.appendFileSync(destinationPath, cipher.getAuthTag());
  return key;
}

function readHeader(payloadPath) {
  const handle = fs.openSync(payloadPath, 'r');
  try {
    const header = Buffer.alloc(HEADER_LENGTH);
    if (fs.readSync(handle, header, 0, header.length, 0) !== header.length) {
      throw new Error('The encrypted SAP automation payload is incomplete.');
    }
    if (!header.subarray(0, MAGIC.length).equals(MAGIC) || header[MAGIC.length] !== VERSION) {
      throw new Error('The SAP automation payload format is not supported.');
    }
    return {
      salt: header.subarray(MAGIC.length + 1, MAGIC.length + 1 + SALT_LENGTH),
      iv: header.subarray(MAGIC.length + 1 + SALT_LENGTH),
    };
  } finally {
    fs.closeSync(handle);
  }
}

async function decryptFile(payloadPath, destinationPath, key) {
  const stats = fs.statSync(payloadPath);
  if (stats.size <= HEADER_LENGTH + TAG_LENGTH) {
    throw new Error('The encrypted SAP automation payload is incomplete.');
  }
  const { iv } = readHeader(payloadPath);
  const handle = fs.openSync(payloadPath, 'r');
  let tag;
  try {
    tag = Buffer.alloc(TAG_LENGTH);
    fs.readSync(handle, tag, 0, tag.length, stats.size - TAG_LENGTH);
  } finally {
    fs.closeSync(handle);
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  await pipeline(
    fs.createReadStream(payloadPath, {
      start: HEADER_LENGTH,
      end: stats.size - TAG_LENGTH - 1,
    }),
    decipher,
    fs.createWriteStream(destinationPath),
  );
}

function resolveTarExecutable() {
  // Git for Windows and other tools ship a GNU tar that shadows the OS's own
  // tar.exe on PATH. GNU tar treats a "C:\..." archive path as a remote
  // "host:file" spec and fails with "Cannot connect to C: resolve failed".
  // Windows' built-in tar.exe (System32, bsdtar) handles drive letters
  // correctly, so prefer it explicitly instead of relying on PATH order.
  const systemTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  return fs.existsSync(systemTar) ? systemTar : 'tar.exe';
}

module.exports = {
  deriveKey,
  decryptFile,
  encryptFile,
  readHeader,
  resolveTarExecutable,
};
