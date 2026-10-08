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

// npm can leave links in node_modules that point outside it, most often a link
// named after this repository back to its root (after `npm install --prefix`
// from the repo root). tar follows them and recurses forever, so every such
// link is listed and excluded from the payload.
function linksLeavingNodeModules(root) {
  const found = [];
  const walk = (directory) => {
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === '.bin' || entry.name === '.cache') continue;
      const full = path.join(directory, entry.name);
      let stat;
      try { stat = fs.lstatSync(full); } catch { continue; }
      if (stat.isSymbolicLink()) {
        let target = '';
        try { target = fs.realpathSync(full); } catch { target = ''; }
        const nodeModulesPath = full.slice(0, full.lastIndexOf(`${path.sep}node_modules${path.sep}`) + `${path.sep}node_modules`.length);
        let nodeModules = nodeModulesPath;
        try { nodeModules = fs.realpathSync(nodeModulesPath); } catch { /* compare unresolved */ }
        if (!target || !(target === nodeModules || target.startsWith(nodeModules + path.sep))) found.push(full);
      } else if (stat.isDirectory() && (entry.name === 'node_modules' || entry.name.startsWith('@') || path.basename(directory) === 'node_modules' || path.basename(path.dirname(directory)) === 'node_modules')) {
        // Packages and scopes directly under a node_modules folder, and nested node_modules.
        walk(full);
      }
    }
  };
  const visit = (directory) => {
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.name === 'node_modules') walk(full);
      else if (!['.git', '.venv', 'results', 'evidence', 'logs'].includes(entry.name)) visit(full);
    }
  };
  visit(root);
  return found;
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
    const strayLinks = linksLeavingNodeModules(sourceRoot);
    for (const link of strayLinks) {
      console.warn(`Skipping a node_modules link that points outside its folder: ${link}`);
    }
    run(resolveTarExecutable(), [
      '-czf', archivePath,
      ...strayLinks.map((link) => `--exclude=${path.relative(path.dirname(sourceRoot), link).split(path.sep).join('/')}`),
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

module.exports = { buildDevelopmentMcpRuntime, linksLeavingNodeModules };
