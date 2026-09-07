const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function buildSapWebRuntime() {
  if (process.platform !== 'win32') throw new Error('Build the Fiori Windows runtime on Windows.');
  const root = path.resolve(__dirname, '..');
  const webTests = path.join(root, 'packages', 'sap-testing-automation', 'web-tests');
  const cli = require.resolve('@playwright-sap/test/cli', { paths: [webTests] });
  const runtimeRoot = path.join(root, '.build', 'sap-web-runtime');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const nodePath = path.join(runtimeRoot, 'node.exe');
  fs.copyFileSync(process.execPath, nodePath);
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(runtimeRoot, 'browsers') };
  const install = spawnSync(nodePath, [cli, 'install', 'chromium'], {
    cwd: webTests, env, stdio: 'inherit', shell: false, windowsHide: true,
  });
  if (install.error) throw install.error;
  if (install.status !== 0) throw new Error('Unable to bundle the Fiori browser. Check the build machine internet connection and retry.');
  // Verify the bundled executable and browser together without contacting SAP.
  const smoke = spawnSync(nodePath, ['-e', `
    const { chromium } = require('@playwright-sap/test');
    (async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.setContent('<title>FSNXT runtime ready</title>');
        if (await page.title() !== 'FSNXT runtime ready') throw new Error('Browser smoke check failed');
      } finally { await browser.close(); }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: webTests, env, stdio: 'inherit', shell: false, windowsHide: true });
  if (smoke.error) throw smoke.error;
  if (smoke.status !== 0) throw new Error('Bundled Fiori browser failed its smoke check.');
}

module.exports = { buildSapWebRuntime };
