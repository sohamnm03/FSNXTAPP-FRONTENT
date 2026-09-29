const { spawn } = require('child_process');
const electronPath = require('electron');

const electronEnvironment = { ...process.env };
delete electronEnvironment.ELECTRON_RUN_AS_NODE;

// Wrap electronPath in double quotes to handle spaces in folder paths
const command = `"${electronPath}"`;

const electronProcess = spawn(command, ['.'], {
  env: electronEnvironment,
  stdio: 'inherit',
  shell: true,
  windowsVerbatimArguments: true, // Prevents Windows from removing quotes
});

electronProcess.on('exit', (code) => {
  process.exitCode = code ?? 0;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => electronProcess.kill(signal));
}