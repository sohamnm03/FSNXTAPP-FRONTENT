const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveTarExecutable } = require('./sapAutomationPayload');

const PYTHON_VERSION = '3.13.12';
const PYTHON_TAG = 'python313';
const REQUIREMENT = 'mcp-sap-gui[screenshots]==0.2.2';
const EMBED_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const GET_PIP_URL = 'https://bootstrap.pypa.io/pip/get-pip.py';

const projectRoot = path.resolve(__dirname, '..');
const cacheRoot = path.join(projectRoot, '.build', 'python-cache');
const runtimeRoot = path.join(projectRoot, '.build', 'python-runtime');
const runtimeDir = path.join(runtimeRoot, 'python');
const stampPath = path.join(runtimeRoot, 'runtime.stamp');
const stampValue = `${PYTHON_VERSION}|${REQUIREMENT}`;

// The GUI lane imports these three; a runtime that cannot load them would fail
// at test time on the user's machine instead of here.
const IMPORT_CHECK = 'import win32com.client, PIL; from mcp_sap_gui.sap_controller import SAPGUIController';

// pip and the pywin32 help file are build-time only, and __pycache__ is
// regenerated on first use. Together they are ~15MB of installer.
const PRUNE = ['Lib/site-packages/pip', 'Lib/site-packages/PyWin32.chm'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: runtimeDir,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with code ${result.status}.`);
}

async function download(url, destination) {
  if (fs.existsSync(destination)) return destination;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url} (HTTP ${response.status}).`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  return destination;
}

function prunePycache(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(directory, entry.name);
    if (entry.name === '__pycache__') {
      fs.rmSync(full, { recursive: true, force: true });
      continue;
    }
    prunePycache(full);
  }
}

async function buildPythonRuntime() {
  const pythonExe = path.join(runtimeDir, 'python.exe');
  const cachedStamp = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, 'utf8') : '';
  if (cachedStamp === stampValue && fs.existsSync(pythonExe)) {
    console.log('Reusing the cached embedded Python runtime.');
    return runtimeDir;
  }

  console.log(`Building the embedded Python ${PYTHON_VERSION} runtime for the SAP GUI lane...`);
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  const embedZip = await download(EMBED_URL, path.join(cacheRoot, path.basename(EMBED_URL)));
  const getPip = await download(GET_PIP_URL, path.join(cacheRoot, 'get-pip.py'));

  // Windows' bundled tar is bsdtar, which reads zip archives as well as tarballs.
  run(resolveTarExecutable(), ['-xf', embedZip, '-C', runtimeDir]);

  // The embeddable distribution ships with site disabled, which also skips .pth
  // files. pywin32 finds its DLLs through pywin32.pth, so site must be on.
  fs.writeFileSync(
    path.join(runtimeDir, `${PYTHON_TAG}._pth`),
    `${PYTHON_TAG}.zip\n.\nLib\\site-packages\nimport site\n`,
  );

  run(pythonExe, [getPip, '--no-warn-script-location']);
  run(pythonExe, ['-m', 'pip', 'install', '--no-warn-script-location', REQUIREMENT]);

  // A ._pth file also puts the interpreter in isolated mode, which drops the
  // working directory that `python -m` normally puts on sys.path. The GUI lane
  // is invoked as `-m gui_tests.run` from the workspace root, so put it back.
  fs.writeFileSync(
    path.join(runtimeDir, 'Lib', 'site-packages', 'sitecustomize.py'),
    'import os, sys\n\nworkspace = os.getcwd()\nif workspace not in sys.path:\n    sys.path.insert(0, workspace)\n',
  );

  for (const relative of PRUNE) {
    fs.rmSync(path.join(runtimeDir, relative), { recursive: true, force: true });
  }
  prunePycache(runtimeDir);

  run(pythonExe, ['-c', IMPORT_CHECK]);
  fs.writeFileSync(stampPath, stampValue);
  console.log('Embedded Python runtime is ready.');
  return runtimeDir;
}

module.exports = { buildPythonRuntime, runtimeDir };

if (require.main === module) {
  buildPythonRuntime().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
