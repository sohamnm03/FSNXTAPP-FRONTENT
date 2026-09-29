const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function safeReportFolderName(runId, now = new Date()) {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${String(runId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36)}`;
}

function runDashboardBuilder(projectRoot) {
  const scriptPath = path.join(projectRoot, 'scripts', 'build-dashboard.ps1');
  if (!fs.existsSync(scriptPath)) {
    return Promise.reject(new Error('The SAP Development dashboard generator is missing.'));
  }

  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-NoOpen',
    ], {
      cwd: projectRoot,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `The dashboard generator exited with code ${code}.`));
    });
  });
}

function markCompletedWorklogs(html, payloadPath, completedWorklogPaths) {
  if (!fs.existsSync(payloadPath) || !completedWorklogPaths?.length) return html;
  const completed = new Set(completedWorklogPaths.map((entry) => entry.replace(/\\/g, '/').toLowerCase()));
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8').replace(/^\uFEFF/, ''));
  for (const run of payload.runs || []) {
    if (completed.has(String(run.worklogPath || '').replace(/\\/g, '/').toLowerCase())) {
      run.status = 'complete';
    }
  }
  const json = JSON.stringify(payload, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return html.replace(
    /(<script type="application\/json" id="dashboard-payload">).*?(<\/script>)/s,
    `$1\n${json}\n$2`,
  );
}

async function generateDevelopmentReport({ completedWorklogPaths, projectRoot, reportsRoot, runId, openPath }) {
  await runDashboardBuilder(projectRoot);

  const generatedRoot = path.join(projectRoot, 'dashboard', 'output');
  const generatedHtml = path.join(generatedRoot, 'dashboard.html');
  const generatedPayload = path.join(generatedRoot, 'dashboard-payload.json');
  if (!fs.existsSync(generatedHtml)) throw new Error('The dashboard generator did not produce an HTML report.');

  const reportDirectory = reportsRoot;
  fs.mkdirSync(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, `sap-development-activity-${safeReportFolderName(runId)}.html`);
  const renderedHtml = markCompletedWorklogs(
    fs.readFileSync(generatedHtml, 'utf8'),
    generatedPayload,
    completedWorklogPaths,
  );
  fs.writeFileSync(reportPath, renderedHtml, 'utf8');

  let openError = '';
  if (typeof openPath === 'function') {
    try {
      openError = String(await openPath(reportPath) || '');
    } catch (error) {
      openError = error.message;
    }
  }

  return { reportDirectory, reportPath, openError };
}

module.exports = { generateDevelopmentReport, markCompletedWorklogs, safeReportFolderName };
