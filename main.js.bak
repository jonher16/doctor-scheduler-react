// main.js - Fixed for Windows paths with spaces and clean shutdown on close
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync, spawnSync } = require('child_process');
const isDev = process.env.NODE_ENV === 'development';
const PORT = 3000;

// Import default file copying functionality
const { copyDefaultFilesToUserData } = require('./copy-defaults');

// Keep references to prevent garbage collection
let mainWindow;
let backendProcess;
let backendLogs = [];

// --- Logging utility --------------------------------------------------------
function logBackend(type, message) {
  const logEntry = {
    type,
    message,
    timestamp: new Date().toISOString()
  };
  console.log(`[${type.toUpperCase()}] ${message}`);
  backendLogs.push(logEntry);

  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'backend.log'),
      `[${logEntry.timestamp}] [${type.toUpperCase()}] ${message}\n`
    );
  } catch { /* silently ignore */ }

  return logEntry;
}

// --- Backend path resolver -------------------------------------------------
function getBackendDir() {
  if (isDev) {
    return path.join(__dirname, 'backend');
  }
  return path.join(process.resourcesPath, 'backend');
}

// --- Process logging setup -------------------------------------------------
function setupProcessLogging(proc) {
  if (!proc) return;

  if (proc.stdout) {
    proc.stdout.on('data', data => {
      const msg = data.toString().trim();
      if (msg) {
        const entry = logBackend('stdout', msg);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-log', entry);
        }
      }
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', data => {
      const msg = data.toString().trim();
      if (msg) {
        const entry = logBackend('stderr', msg);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-log', entry);
        }
      }
    });
  }

  proc.on('close', code => {
    logBackend('system', `Backend exited with code ${code}`);
    if (code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-exit', { code });
    }
    backendProcess = null;
  });

  proc.on('error', err => {
    logBackend('error', `Backend error: ${err.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-exit', { code: -1, error: err.message });
    }
  });
}

// --- Start backend server -------------------------------------------------
async function startBackendServer() {
  logBackend('info', 'Starting backend server...');
  const backendDir = getBackendDir();

  if (!fs.existsSync(backendDir)) {
    const msg = `Backend directory not found at: ${backendDir}`;
    logBackend('error', msg);
    dialog.showErrorBox('Backend Not Found', msg + '\n\nPlease reinstall.');
    app.quit();
    return;
  }

  logBackend('info', `Using backend directory: ${backendDir}`);

  try {
    const batch = path.join(backendDir, 'run_backend.bat');
    if (fs.existsSync(batch)) {
      logBackend('info', `Launching batch: ${batch}`);
      backendProcess = spawn(batch, { cwd: backendDir, shell: true });
    } else {
      const exe = path.join(backendDir, 'hospital_backend.exe');
      if (fs.existsSync(exe)) {
        logBackend('info', `Launching exe: ${exe}`);
        backendProcess = spawn('cmd.exe', ['/c', `"${exe}"`], { cwd: backendDir });
      } else if (fs.existsSync(path.join(backendDir, 'app.py'))) {
        const py = path.join(backendDir, 'app.py');
        logBackend('info', `Falling back to Python: ${py}`);
        backendProcess = spawn('python', [py], { cwd: backendDir, shell: true });
      } else {
        throw new Error('No launcher found (bat, exe, or app.py)');
      }
    }

    setupProcessLogging(backendProcess);
    // give it a moment
    await new Promise(r => setTimeout(r, 2000));
    logBackend('info', 'Backend start wait elapsed');
  } catch (err) {
    logBackend('error', `Failed to start backend: ${err.message}`);
    dialog.showErrorBox('Backend Error', `Could not start backend:\n${err.message}`);
    app.quit();
  }
}

// --- Clean shutdown --------------------------------------------------------
function terminateAllBackendProcesses() {
  if (process.platform === 'win32') {
    if (backendProcess && backendProcess.pid) {
      logBackend('info', `Killing PID ${backendProcess.pid}`);
      try {
        spawnSync('taskkill', ['/F', '/T', '/PID', `${backendProcess.pid}`]);
        logBackend('info', 'Primary process terminated');
      } catch (e) {
        logBackend('error', `Error killing PID: ${e.message}`);
      }
    }
    try {
      spawnSync('taskkill', ['/F', '/T', '/IM', 'hospital_backend.exe']);
      logBackend('info', 'All hospital_backend.exe processes terminated');
    } catch (e) {
      logBackend('error', `Error sweeping exe: ${e.message}`);
    }
  } else {
    if (backendProcess && backendProcess.pid) {
      try {
        process.kill(-backendProcess.pid, 'SIGKILL');
        logBackend('info', 'Killed process group');
      } catch (e) {
        logBackend('error', `Unix kill error: ${e.message}`);
      }
    }
    try {
      spawnSync('pkill', ['-f', 'python.*app.py']);
      logBackend('info', 'Pkilled Python backend processes');
    } catch { /* ignore */ }
  }
  backendProcess = null;
}

// --- Electron lifecycle ----------------------------------------------------
app.on('before-quit', () => {
  if (backendProcess) {
    logBackend('info', 'before-quit hook: terminating backend');
    terminateAllBackendProcesses();
  }
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    logBackend('info', 'window-all-closed: terminating backend');
    terminateAllBackendProcesses();
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (backendProcess) {
    logBackend('info', 'will-quit: terminating backend');
    terminateAllBackendProcesses();
  }
});

// --- Window creation -------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${PORT}`);
    mainWindow.webContents.openDevTools();
  } else {
    const index = path.join(__dirname, 'dist/index.html');
    logBackend('info', `Loading index.html from: ${index}`);
    mainWindow.loadFile(index);
  }

  // ⬇️ ensure backend is killed before window actually closes
  mainWindow.on('close', (e) => {
    if (backendProcess) {
      e.preventDefault();
      logBackend('info', 'Window close: terminating backend…');
      terminateAllBackendProcesses();
      mainWindow.destroy();
      app.quit();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- App ready -------------------------------------------------------------
app.whenReady().then(async () => {
  logBackend('info', `App ready, cwd: ${__dirname}`);
  const copyResult = await copyDefaultFilesToUserData();
  logBackend('info', `Defaults copied: ${copyResult.filesCopied.join(', ')}`);
  if (copyResult.filesMissing.length) {
    logBackend('info', `Defaults missing: ${copyResult.filesMissing.join(', ')}`);
  }

  await startBackendServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// --- IPC Handlers ----------------------------------------------------------
ipcMain.handle('get-backend-logs', () => backendLogs);

ipcMain.handle('restart-backend', async () => {
  if (backendProcess) {
    logBackend('info', 'Restart: terminating existing backend');
    terminateAllBackendProcesses();
  }
  await startBackendServer();
  return { success: true };
});

ipcMain.handle('load-user-data-file', async (_, fileName) => {
  const fp = path.join(app.getPath('userData'), fileName);
  if (!fs.existsSync(fp)) return null;
  const content = await fs.promises.readFile(fp, 'utf8');
  return JSON.parse(content);
});

ipcMain.handle('get-app-paths', () => ({
  appPath: app.getAppPath(),
  userData: app.getPath('userData'),
  resourcesPath: process.resourcesPath,
  currentDir: __dirname,
  backendDir: getBackendDir()
}));

ipcMain.handle('save-file', async (_, { defaultPath, filters, content, isBase64 }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath,
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation']
  });
  if (canceled || !filePath) return { canceled: true };
  if (isBase64) {
    fs.writeFileSync(filePath, Buffer.from(content, 'base64'));
  } else {
    fs.writeFileSync(filePath, content);
  }
  logBackend('info', `File saved: ${filePath}`);
  return { success: true, filePath };
});

ipcMain.handle('open-file', async (_, { filters }) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return { canceled: true };
  const content = fs.readFileSync(filePaths[0], 'utf8');
  logBackend('info', `File opened: ${filePaths[0]}`);
  return { success: true, filePath: filePaths[0], content };
});
