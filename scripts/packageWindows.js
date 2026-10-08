const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { encryptFile, resolveTarExecutable } = require('./sapAutomationPayload');
const { buildPythonRuntime } = require('./buildPythonRuntime');
const { buildNodeRuntime } = require('./buildNodeRuntime');
const { buildSapWebRuntime } = require('./buildSapWebRuntime');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'packages', 'sap-testing-automation');
const buildRoot = path.join(projectRoot, '.build', 'sap-automation');
const developmentMcpSource = path.join(
  projectRoot,
  'packages',
  'SAP-Project-Development V1',
  'SAP-Project-Development V1',
  'tools',
  'mcp-abap-adt-api',
);
const developmentMcpBuildRoot = path.join(projectRoot, '.build', 'sap-development-mcp');
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

function buildDevelopmentMcpRuntime() {
  const requiredSourceFiles = [
    path.join(developmentMcpSource, 'node_modules', 'mcp-abap-abap-adt-api', 'dist', 'index.js'),
    path.join(developmentMcpSource, 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'cjs', 'experimental', 'tasks', 'interfaces.js'),
  ];
  const missingFile = requiredSourceFiles.find((candidate) => !fs.existsSync(candidate));
  if (missingFile) {
    throw new Error(`The SAP Development MCP runtime is incomplete: ${missingFile}`);
  }

  fs.rmSync(developmentMcpBuildRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(developmentMcpBuildRoot), { recursive: true });
  fs.mkdirSync(developmentMcpBuildRoot, { recursive: true });
  for (const fileName of ['package.json', 'package-lock.json', 'README.md']) {
    const sourceFile = path.join(developmentMcpSource, fileName);
    if (fs.existsSync(sourceFile)) fs.copyFileSync(sourceFile, path.join(developmentMcpBuildRoot, fileName));
  }

  // electron-builder excludes directories named node_modules even inside
  // extraResources. Stage the complete dependency tree under `modules` and
  // provide it through NODE_PATH at runtime.
  // Links are skipped: npm can leave one pointing back at this repository (for
  // example after `npm install --prefix` from the repo root), and recreating it
  // needs admin rights on Windows and would pull the whole repo into the app.
  // The MCP server's own packages are plain folders.
  fs.cpSync(
    path.join(developmentMcpSource, 'node_modules'),
    path.join(developmentMcpBuildRoot, 'modules'),
    { recursive: true, filter: (source) => !fs.lstatSync(source).isSymbolicLink() },
  );

  const packagedInterface = path.join(
    developmentMcpBuildRoot,
    'modules',
    '@modelcontextprotocol',
    'sdk',
    'dist',
    'cjs',
    'experimental',
    'tasks',
    'interfaces.js',
  );
  if (!fs.existsSync(packagedInterface)) {
    throw new Error('The SAP Development MCP SDK could not be prepared for packaging.');
  }
}

async function main() {
  fs.rmSync(buildRoot, { recursive: true, force: true });
  fs.rmSync(generatedKeyPath, { force: true });
  const password = requireBuildPassword();
  buildSapWebRuntime();
  await buildNodeRuntime();
  await buildPythonRuntime();
  buildDevelopmentMcpRuntime();
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
      '--exclude=*/.external-runs',
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
    fs.rmSync(developmentMcpBuildRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildDevelopmentMcpRuntime };
