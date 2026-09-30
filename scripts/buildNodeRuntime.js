const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveTarExecutable } = require('./sapAutomationPayload');

const NODE_VERSION = '24.19.0';
const NODE_ARCHIVE_NAME = `node-v${NODE_VERSION}-win-x64.zip`;
const NODE_DOWNLOAD_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE_NAME}`;

const projectRoot = path.resolve(__dirname, '..');
const cacheRoot = path.join(projectRoot, '.build', 'node-cache');
const runtimeRoot = path.join(projectRoot, '.build', 'node-runtime');
const runtimeDir = path.join(runtimeRoot, 'node');
const nodeExecutable = path.join(runtimeDir, 'node.exe');
const stampPath = path.join(runtimeRoot, 'runtime.stamp');

async function download(url, destination) {
  if (fs.existsSync(destination)) return destination;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url} (HTTP ${response.status}).`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  return destination;
}

function verifyNodeRuntime(executable = nodeExecutable) {
  if (!fs.existsSync(executable)) return false;
  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return !result.error && result.status === 0 && result.stdout.trim() === `v${NODE_VERSION}`;
}

async function buildNodeRuntime() {
  const cachedStamp = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, 'utf8').trim() : '';
  if (cachedStamp === NODE_VERSION && verifyNodeRuntime()) {
    process.stdout.write('Reusing the cached standalone Node.js MCP runtime.\n');
    return runtimeDir;
  }

  process.stdout.write(`Building the standalone Node.js ${NODE_VERSION} MCP runtime...\n`);
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  const archivePath = await download(NODE_DOWNLOAD_URL, path.join(cacheRoot, NODE_ARCHIVE_NAME));
  const extractionRoot = path.join(runtimeRoot, 'extracted');
  fs.mkdirSync(extractionRoot, { recursive: true });
  const extraction = spawnSync(resolveTarExecutable(), ['-xf', archivePath, '-C', extractionRoot], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
  });
  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) throw new Error(`Could not extract ${NODE_ARCHIVE_NAME}.`);

  const distributionRoot = path.join(extractionRoot, `node-v${NODE_VERSION}-win-x64`);
  for (const fileName of ['node.exe', 'LICENSE', 'README.md']) {
    const source = path.join(distributionRoot, fileName);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(runtimeDir, fileName));
  }
  fs.rmSync(extractionRoot, { recursive: true, force: true });

  if (!verifyNodeRuntime()) throw new Error('The standalone Node.js MCP runtime failed validation.');
  fs.writeFileSync(stampPath, NODE_VERSION, 'utf8');
  process.stdout.write('Standalone Node.js MCP runtime is ready.\n');
  return runtimeDir;
}

module.exports = { buildNodeRuntime, nodeExecutable, runtimeDir, verifyNodeRuntime };

if (require.main === module) {
  buildNodeRuntime().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
