const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

let mainWindow = null;
let serverProcess = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const DEFAULT_PORT = 3100;

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else {
            retry();
          }
        })
        .on('error', () => {
          retry();
        });
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for local server at ${url}`));
      } else {
        setTimeout(check, 500);
      }
    };

    check();
  });
}

async function startProductionServer(port) {
  const serverPath = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
  serverProcess = spawn(process.execPath, [serverPath, 'start', '-p', String(port)], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
    },
    stdio: 'ignore',
  });

  serverProcess.on('error', (err) => {
    console.error('[Electron] Failed to start Next.js production server:', err);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'ChatFlow',
    autoHideMenuBar: true,
    backgroundColor: '#090d16',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const appUrl = `http://localhost:${DEFAULT_PORT}`;

  if (!isDev) {
    try {
      await startProductionServer(DEFAULT_PORT);
      await waitForServer(appUrl);
    } catch (err) {
      console.warn('[Electron] Could not start local server, attempting to load directly:', err);
    }
  }

  // Open external links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.loadURL(appUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {}
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {}
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
