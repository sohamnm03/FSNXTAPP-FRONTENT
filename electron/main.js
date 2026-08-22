const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const isDevelopment = !app.isPackaged;

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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
