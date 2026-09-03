const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { decryptFile } = require('../scripts/sapAutomationPayload');

function removeRuntimeDirectory(runtimeRoot) {
  if (!runtimeRoot) return;
  const resolved = path.resolve(runtimeRoot);
  const expectedParent = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== expectedParent || !path.basename(resolved).startsWith('fsnxt-sap-runtime-')) {
    return;
  }
  try {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // A child process can briefly retain a file handle while the app is closing.
  }
}

function processIsRunning(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

function removeStaleRuntimeDirectories() {
  for (const entry of fs.readdirSync(os.tmpdir(), { withFileTypes: true })) {
    const match = /^fsnxt-sap-runtime-(\d+)-/.exec(entry.name);
    if (!match || !entry.isDirectory()) continue;
    const ownerProcessId = Number(match[1]);
    if (ownerProcessId !== process.pid && !processIsRunning(ownerProcessId)) {
      removeRuntimeDirectory(path.join(os.tmpdir(), entry.name));
    }
  }
}

function extractArchive(archivePath, destinationPath) {
  const result = spawnSync('tar.exe', ['-xzf', archivePath, '-C', destinationPath], {
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'Windows could not unpack the SAP automation workspace.');
  }
}

async function createSapAutomationWorkspace(electronApp) {
  if (!electronApp.isPackaged) {
    return {
      projectRoot: path.resolve(__dirname, '..', 'packages', 'sap-testing-automation'),
      cleanup() {},
    };
  }

  const payloadPath = path.join(process.resourcesPath, 'sap-testing-automation.fsnxtpkg');
  if (!fs.existsSync(payloadPath)) {
    throw new Error('The encrypted SAP automation package is missing. Reinstall the application.');
  }

  let encodedKey;
  try {
    encodedKey = require('./sapAutomationKey.generated');
  } catch {
    throw new Error('The SAP automation package key is missing. Reinstall the application.');
  }
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) {
    throw new Error('The SAP automation package key is invalid. Reinstall the application.');
  }

  removeStaleRuntimeDirectories();
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `fsnxt-sap-runtime-${process.pid}-`));
  const archivePath = path.join(runtimeRoot, 'workspace.tar.gz');
  try {
    await decryptFile(payloadPath, archivePath, key);
    extractArchive(archivePath, runtimeRoot);
    fs.rmSync(archivePath, { force: true });
    spawnSync('attrib.exe', ['+H', runtimeRoot], { windowsHide: true, shell: false });
    return {
      projectRoot: path.join(runtimeRoot, 'sap-testing-automation'),
      cleanup: () => removeRuntimeDirectory(runtimeRoot),
    };
  } catch (error) {
    removeRuntimeDirectory(runtimeRoot);
    throw new Error(`The protected SAP automation workspace could not be opened: ${error.message}`);
  }
}

module.exports = { createSapAutomationWorkspace, removeRuntimeDirectory };
