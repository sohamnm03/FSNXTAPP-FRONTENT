const { spawn } = require('child_process');
const electronPath = require('electron');

const electronEnvironment = { ...process.env };
delete electronEnvironment.ELECTRON_RUN_AS_NODE;

const electronProcess = spawn(electronPath, ['.'], {
  env: electronEnvironment,
  stdio: 'inherit',
});

electronProcess.on('exit', (code) => {
  process.exitCode = code ?? 0;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => electronProcess.kill(signal));
}
