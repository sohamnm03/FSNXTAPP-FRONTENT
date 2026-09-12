const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const path = require('path');
const { createGoogleDesktopAuth } = require('./googleDesktopAuth');
const { createClaudeTokenStore } = require('./claudeTokenStore');
const { createSapTerminalManager } = require('./sapTerminalManager');

const isDevelopment = !app.isPackaged;
const GOOGLE_DESKTOP_CLIENT_ID = process.env.GOOGLE_DESKTOP_CLIENT_ID
  || '418759424186-vhvn6f4g6ckvef5gvjdtqi4g6gvfmvpe.apps.googleusercontent.com';
let googleDesktopAuth;
let sapTerminalManager;

async function registerSapTerminalHandlers() {
  const claudeTokenStore = createClaudeTokenStore(app, safeStorage);
  sapTerminalManager = await createSapTerminalManager(app, claudeTokenStore, dialog);
  ipcMain.handle('sap-terminal:get-project', (_event, username) => sapTerminalManager.getProject(username));
  ipcMain.handle('sap-terminal:choose-archive-directory', (event) => (
    sapTerminalManager.chooseArchiveDirectory(BrowserWindow.fromWebContents(event.sender))
  ));
  ipcMain.handle('sap-terminal:get-auth-status', () => sapTerminalManager.getAuthStatus());
  ipcMain.handle('sap-terminal:test-connection', (_event, systemId, credentials) => sapTerminalManager.testConnection(systemId, credentials));
  ipcMain.handle('sap-terminal:open-gui-session', (_event, systemId, credentials) => sapTerminalManager.openGuiSession(systemId, credentials));
  ipcMain.handle('sap-terminal:configure-token', (_event, token) => sapTerminalManager.configureToken(token));
  ipcMain.handle('sap-terminal:clear-token', () => sapTerminalManager.clearToken());
  ipcMain.handle('sap-terminal:list-cases', (_event, lane) => sapTerminalManager.listCases(lane));
  ipcMain.handle('sap-terminal:get-case-file', (_event, lane, caseId) => sapTerminalManager.getCaseFile(lane, caseId));
  ipcMain.handle('sap-terminal:prepare-case-creation', (_event, lane, systemId) => sapTerminalManager.prepareCaseCreation(lane, systemId));
  ipcMain.handle('sap-terminal:finalize-case-creation', (_event, lane, systemId, existingFiles, author) => sapTerminalManager.finalizeCaseCreation(lane, systemId, existingFiles, author));
  ipcMain.handle('sap-terminal:browse-case', (event) => sapTerminalManager.browseCase(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle('sap-terminal:prepare-case', (_event, lane, caseId, stage, credentials) => sapTerminalManager.prepareCase(lane, caseId, stage, credentials));
  ipcMain.handle('sap-terminal:start-confirmed-case', (_event, confirmationId) => sapTerminalManager.startConfirmedCase(confirmationId));
  ipcMain.handle('sap-terminal:answer-elicitation', (_event, runId, accept) => sapTerminalManager.answerElicitation(runId, accept));
  ipcMain.handle('sap-terminal:start', (_event, prompt, sessionId, lane) => sapTerminalManager.start(prompt, sessionId, lane));
  ipcMain.handle('sap-terminal:get-run', (_event, runId) => sapTerminalManager.getRun(runId));
  ipcMain.handle('sap-terminal:stop', (_event, runId) => sapTerminalManager.stop(runId));
}

function registerGoogleAuthHandlers() {
  googleDesktopAuth = createGoogleDesktopAuth({
    clientId: GOOGLE_DESKTOP_CLIENT_ID,
    openExternal: (url) => shell.openExternal(url),
  });
  ipcMain.handle('google-auth:login', () => googleDesktopAuth.login());
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
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { action: 'deny' };
    }

    if (parsedUrl.protocol === 'https:') shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedUrl = isDevelopment
      ? 'http://localhost:5173/'
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
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  registerGoogleAuthHandlers();
  await registerSapTerminalHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  dialog.showErrorBox('FSNXT could not start', error.message);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  sapTerminalManager?.stopAll();
});
