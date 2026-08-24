const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { createAiAgentsManager } = require('./aiAgentsManager');

const isDevelopment = !app.isPackaged;
let aiAgentsManager;

function registerAiAgentsHandlers() {
  aiAgentsManager = createAiAgentsManager(app, dialog);
  ipcMain.handle('ai-agents:start', (_event, inputs) => aiAgentsManager.start(inputs));
  ipcMain.handle('ai-agents:get-run', (_event, runId) => aiAgentsManager.getRun(runId));
  ipcMain.handle('ai-agents:get-logs', (_event, runId) => aiAgentsManager.getLogs(runId));
  ipcMain.handle('ai-agents:get-artifacts', (_event, runId) => aiAgentsManager.getArtifacts(runId));
  ipcMain.handle('ai-agents:stop', (_event, runId) => aiAgentsManager.stop(runId));
  ipcMain.handle('ai-agents:download', (event, runId, artifactPath) => (
    aiAgentsManager.download(runId, artifactPath, BrowserWindow.fromWebContents(event.sender))
  ));
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: '#f4f7fc',
    show: false,
    title: 'FSNXT Testing Application',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedUrl = isDevelopment
      ? 'http://127.0.0.1:5173/'
      : `file://${path.join(__dirname, '../dist/index.html').replace(/\\/g, '/')}`;
    if (url !== allowedUrl) event.preventDefault();
  });

  if (isDevelopment) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const isDevToolsShortcut = input.type === 'keyDown'
        && (input.key === 'F12'
          || (input.control && input.shift && input.key.toLowerCase() === 'i'));

      if (isDevToolsShortcut) {
        event.preventDefault();
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  if (isDevelopment) {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  registerAiAgentsHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => aiAgentsManager?.stopAll());
