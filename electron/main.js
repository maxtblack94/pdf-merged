const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const url = require('url');

let win;

function resolveAppIconPath() {
  const preferredIconPath = app.isPackaged
    ? path.join(__dirname, '../dist/pdf-merger/assets/icon.ico')
    : path.join(__dirname, '../src/assets/icon.ico');
  if (fs.existsSync(preferredIconPath)) {
    return preferredIconPath;
  }

  return app.isPackaged
    ? path.join(__dirname, '../dist/pdf-merger/assets/icon.png')
    : path.join(__dirname, '../src/assets/icon.png');
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    title: 'PDF Merger',
    icon: resolveAppIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#1a1a2e',
  });

  win.loadURL(
    url.format({
      pathname: path.join(__dirname, '../dist/pdf-merger/index.html'),
      protocol: 'file:',
      slashes: true,
    })
  );

  win.setMenuBarVisibility(false);
  win.on('closed', () => { win = null; });
}

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (win === null) createWindow(); });
