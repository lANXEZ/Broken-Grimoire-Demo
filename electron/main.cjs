// Electron entry point: wraps the built web game (dist/) in a desktop window so it ships as a Windows .exe.
// `npm run electron` builds and opens it; `npm run dist` builds the portable .exe into release/.
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 576,
    backgroundColor: '#120d0a',
    title: 'Broken Grimoire',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());

  // Set ELECTRON_DEV_URL=http://127.0.0.1:5173 to run against the Vite dev server instead of dist/.
  const devUrl = process.env.ELECTRON_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Links never open inside the game window.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

Menu.setApplicationMenu(null);

ipcMain.on('grimoire:quit', () => app.quit());
ipcMain.on('grimoire:toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setFullScreen(!win.isFullScreen());
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
