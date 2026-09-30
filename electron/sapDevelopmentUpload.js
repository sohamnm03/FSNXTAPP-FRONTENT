const { spawn } = require('child_process');
const path = require('path');
const { createSapAutomationWorkspace } = require('./sapAutomationWorkspace');

async function uploadDevelopmentReport({ electronApp, reportPath, runId, username, connectionString }) {
  const workspace = await createSapAutomationWorkspace(electronApp);
  try {
    return await new Promise((resolve, reject) => {
      let stdout = '';
      const child = spawn('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(workspace.projectRoot, 'scripts', 'archive-run-artifacts.ps1'),
        '-RunId', runId, '-StartedAtUtc', new Date().toISOString(),
        '-DevelopmentReportPath', reportPath,
      ], {
        cwd: workspace.projectRoot,
        env: {
          ...process.env,
          ...(connectionString ? { AZURE_STORAGE_CONNECTION_STRING: connectionString } : {}),
          FSNXT_APP_USERNAME: username || process.env.FSNXT_APP_USERNAME || process.env.USERNAME || '',
        },
        windowsHide: true,
        shell: false,
        timeout: 120000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
      child.once('error', () => reject(new Error('The Azure report uploader could not start.')));
      child.once('close', (code) => {
        const url = stdout.trim().split(/\r?\n/).at(-1);
        if (code === 0 && /^https?:\/\//.test(url)) resolve(url);
        else reject(new Error('Azure upload failed. Check the storage configuration and network connection.'));
      });
    });
  } finally {
    workspace.cleanup();
  }
}

module.exports = { uploadDevelopmentReport };
