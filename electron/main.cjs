const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

let mainWindow = null;
let serverProcess = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const DEFAULT_PORT = 3100;

function resolveServerPath() {
  const candidates = [
    // 1. Packaged app with asarUnpack
    path.join(process.resourcesPath || '', 'app.asar.unpacked', '.next', 'standalone', 'server.js'),
    // 2. Packaged app unpacked without asar
    path.join(process.resourcesPath || '', 'app', '.next', 'standalone', 'server.js'),
    // 3. Local standalone build (in project directory)
    path.join(__dirname, '..', '.next', 'standalone', 'server.js'),
    // 4. Next CLI fallback
    path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      });

      req.on('error', () => {
        retry();
      });

      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for local server at ${url}`));
      } else {
        setTimeout(check, 400);
      }
    };

    check();
  });
}

async function startProductionServer(port) {
  const serverPath = resolveServerPath();
  if (!serverPath) {
    throw new Error('Could not find Next.js server executable (standalone server.js or next CLI).');
  }

  const isStandalone = serverPath.endsWith('server.js');
  const spawnArgs = isStandalone ? [serverPath] : [serverPath, 'start', '-p', String(port)];
  const spawnCwd = isStandalone ? path.dirname(serverPath) : path.join(__dirname, '..');

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
  };

  console.log(`[Electron] Spawning Next.js server: ${serverPath} (standalone: ${isStandalone}) on port ${port}`);

  serverProcess = spawn(process.execPath, spawnArgs, {
    cwd: spawnCwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (data) => {
    console.log(`[NextServer] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[NextServer ERR] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (err) => {
    console.error('[Electron] Failed to start Next.js server process:', err);
  });

  serverProcess.on('exit', (code, signal) => {
    console.warn(`[Electron] Next.js server process exited with code ${code}, signal ${signal}`);
  });
}

async function loadApp() {
  const port = process.env.PORT || (isDev ? 3000 : DEFAULT_PORT);
  const appUrl = `http://127.0.0.1:${port}`;

  try {
    if (!isDev) {
      if (!serverProcess) {
        await startProductionServer(port);
      }
    }
    await waitForServer(appUrl);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(appUrl);
    }
  } catch (err) {
    console.error('[Electron] Failed to connect to local server:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('loading-error', err.message || 'Server timeout');
    }
  }
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
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load splash screen immediately to avoid white/blank flash
  const splashPath = path.join(__dirname, 'splash.html');
  mainWindow.loadFile(splashPath);

  // Open external links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await loadApp();
}

ipcMain.on('retry-connect', async () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
    serverProcess = null;
  }
  await loadApp();
});

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
