const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { encryptFile, resolveTarExecutable } = require('./sapAutomationPayload');
const { buildPythonRuntime } = require('./buildPythonRuntime');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'packages', 'sap-testing-automation');
const buildRoot = path.join(projectRoot, '.build', 'sap-automation');
const payloadPath = path.join(buildRoot, 'sap-testing-automation.fsnxtpkg');
const generatedKeyPath = path.join(projectRoot, 'electron', 'sapAutomationKey.generated.js');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}.`);
}

function requireBuildPassword() {
  const password = process.env.SAP_AUTOMATION_PASSWORD || '';
  if (password.length < 12) {
    throw new Error('Set SAP_AUTOMATION_PASSWORD to at least 12 characters before packaging Windows builds.');
  }
  return password;
}

async function main() {
  fs.rmSync(buildRoot, { recursive: true, force: true });
  fs.rmSync(generatedKeyPath, { force: true });
  const password = requireBuildPassword();
  await buildPythonRuntime();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fsnxt-sap-build-'));
  const archivePath = path.join(temporaryRoot, 'sap-testing-automation.tar.gz');
  fs.mkdirSync(buildRoot, { recursive: true });

  try {
    run(resolveTarExecutable(), [
      '-czf', archivePath,
      '--exclude=*/.env',
      '--exclude=*/settings.local.json',
      '--exclude=*/.venv',
      '--exclude=*/.auth',
      '--exclude=*/__pycache__',
      '--exclude=*.pyc',
      '--exclude=*/results',
      '--exclude=*/evidence',
      '--exclude=*/logs',
      '--exclude=*/test-results',
      '--exclude=*/playwright-report',
      '--exclude=*/blob-report',
      '-C', path.dirname(sourceRoot),
      path.basename(sourceRoot),
    ]);

    const key = await encryptFile(archivePath, payloadPath, password);
    fs.writeFileSync(
      generatedKeyPath,
      `'use strict';\nmodule.exports = '${key.toString('base64')}';\n`,
      { mode: 0o600 },
    );

    const electronBuilderCli = require.resolve('electron-builder/cli.js');
    run(process.execPath, [electronBuilderCli, '--win']);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    fs.rmSync(buildRoot, { recursive: true, force: true });
    fs.rmSync(generatedKeyPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
