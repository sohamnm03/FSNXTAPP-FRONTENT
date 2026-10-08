const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const path = require('path');
const { createGoogleDesktopAuth } = require('./googleDesktopAuth');
const { createClaudeTokenStore } = require('./claudeTokenStore');
const { createSapDevelopmentManager } = require('./sapDevelopmentManager');
const { createSapTerminalManager } = require('./sapTerminalManager');

const isDevelopment = !app.isPackaged;
const GOOGLE_DESKTOP_CLIENT_ID = process.env.GOOGLE_DESKTOP_CLIENT_ID
  || '418759424186-vhvn6f4g6ckvef5gvjdtqi4g6gvfmvpe.apps.googleusercontent.com';
let googleDesktopAuth;
let sapDevelopmentManager;
let sapTerminalManager;

function registerSapDevelopmentHandlers() {
  const claudeTokenStore = createClaudeTokenStore(app, safeStorage);
  sapDevelopmentManager = createSapDevelopmentManager(app, claudeTokenStore, {
    chooseDirectory: (ownerWindow, options) => dialog.showOpenDialog(ownerWindow, options),
    openPath: (filePath) => shell.openPath(filePath),
  });
  ipcMain.handle('sap-development:get-status', (_event, username) => sapDevelopmentManager.getStatus(username));
  ipcMain.handle('sap-development:choose-report-directory', (event) => (
    sapDevelopmentManager.chooseReportDirectory(BrowserWindow.fromWebContents(event.sender))
  ));
  ipcMain.handle('sap-development:get-auth-status', () => sapDevelopmentManager.getAuthStatus());
  ipcMain.handle('sap-development:configure-token', (_event, token) => sapDevelopmentManager.configureToken(token));
  ipcMain.handle('sap-development:clear-token', () => sapDevelopmentManager.clearToken());
  ipcMain.handle('sap-development:start', (_event, prompt, sessionId, systemId, credentials) => (
    sapDevelopmentManager.start(prompt, sessionId, systemId, credentials)
  ));
  ipcMain.handle('sap-development:get-run', (_event, runId) => sapDevelopmentManager.getRun(runId));
  ipcMain.handle('sap-development:stop', (_event, runId) => sapDevelopmentManager.stop(runId));
}

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
  ipcMain.handle('sap-terminal:list-cases', (_event, lane, systemId) => sapTerminalManager.listCases(lane, systemId));
  ipcMain.handle('sap-terminal:get-case-file', (_event, lane, caseId, systemId) => sapTerminalManager.getCaseFile(lane, caseId, systemId));
  ipcMain.handle('sap-terminal:prepare-case-creation', (_event, lane, systemId) => sapTerminalManager.prepareCaseCreation(lane, systemId));
  ipcMain.handle('sap-terminal:finalize-case-creation', (_event, lane, systemId, existingFiles, author) => sapTerminalManager.finalizeCaseCreation(lane, systemId, existingFiles, author));
  ipcMain.handle('sap-terminal:browse-case', (event) => sapTerminalManager.browseCase(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle('sap-terminal:prepare-case', (_event, lane, caseId, stage, credentials, externalCase, systemId) => sapTerminalManager.prepareCase(lane, caseId, stage, credentials, externalCase, systemId));
  ipcMain.handle('sap-terminal:start-confirmed-case', (_event, confirmationId) => sapTerminalManager.startConfirmedCase(confirmationId));
  ipcMain.handle('sap-terminal:answer-elicitation', (_event, runId, accept) => sapTerminalManager.answerElicitation(runId, accept));
  ipcMain.handle('sap-terminal:answer-walkthrough', (_event, runId, approve) => sapTerminalManager.answerWalkthrough(runId, approve));
  ipcMain.handle('sap-terminal:start', (_event, prompt, sessionId, lane, options) => sapTerminalManager.start(prompt, sessionId, lane, options));
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
    title: 'FS Sprint',
    icon: path.join(__dirname, '../assets/company-logo.ico'),
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

// Brings this window back in front of SAP GUI. Windows often refuses a plain
// focus() from a background app, so briefly pin the window on top as well.
function registerWindowHandlers() {
  ipcMain.handle('app:focus-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;
    if (window.isMinimized()) window.restore();
    window.show();
    window.setAlwaysOnTop(true);
    window.focus();
    window.setAlwaysOnTop(false);
    app.focus({ steal: true });
    window.webContents.focus();
    return true;
  });
}

app.whenReady().then(async () => {
  registerWindowHandlers();
  registerGoogleAuthHandlers();
  await registerSapTerminalHandlers();
  registerSapDevelopmentHandlers();
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
  sapDevelopmentManager?.stopAll();
  sapTerminalManager?.stopAll();
});
