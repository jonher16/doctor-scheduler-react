// main.js - Electron main process file with bat file compatibility
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const isDev = process.env.NODE_ENV === 'development';
const PORT = 3000;
const API_PORT = 5000;

// Import default file copying functionality
const { copyDefaultFilesToUserData } = require('./copy-defaults');

// Keep references to prevent garbage collection
let mainWindow;
let backendProcess;
let backendLogs = [];

// Add logging function for backend messages
function logBackend(type, message) {
  const logEntry = { 
    type, 
    message, 
    timestamp: new Date().toISOString() 
  };
  console.log(`[${type.toUpperCase()}] ${message}`);
  backendLogs.push(logEntry);
  
  // Save to log file in userData directory
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    
    fs.appendFileSync(
      path.join(logDir, 'backend.log'),
      `[${logEntry.timestamp}] [${type.toUpperCase()}] ${message}\n`
    );
  } catch (err) {
    // Silently fail if we can't write to log file
  }
  
  return logEntry;
}

// Function to get Backend directory
function getBackendDir() {
  // In development mode, use the backend directory in the project
  if (isDev) {
    return path.join(__dirname, 'backend');
  }
  
  // In production, the backend should be in the resources directory
  return path.join(process.resourcesPath, 'backend');
}

// Function to start backend server
async function startBackendServer() {
  logBackend('info', 'Starting backend server...');
  
  // Find the backend directory
  const backendDir = getBackendDir();
  
  if (!fs.existsSync(backendDir)) {
    const errorMessage = `Backend directory not found at: ${backendDir}`;
    logBackend('error', errorMessage);
    
    dialog.showErrorBox(
      'Backend Not Found',
      errorMessage + '\n\nPlease reinstall the application.'
    );
    
    app.quit();
    return;
  }
  
  logBackend('info', `Using backend directory: ${backendDir}`);
  
  try {
    let cmd, args, cwd, shell = false;
    
    // Try to use the launcher batch file/script first
    if (process.platform === 'win32') {
      const launchBat = path.join(backendDir, 'launch_backend.bat');
      if (fs.existsSync(launchBat)) {
        cmd = launchBat;
        args = [];
        cwd = backendDir;
        shell = true; // Use shell for .bat files
        logBackend('info', `Using launch batch file: ${launchBat}`);
      } else {
        // Fall back to direct Python execution
        logBackend('info', 'No launch batch file found, trying direct Python execution');
        cmd = 'python';
        args = [path.join(backendDir, 'app.py')];
        cwd = backendDir;
      }
    } else {
      // On non-Windows platforms, try the shell script first
      const launchSh = path.join(backendDir, 'launch_backend.sh');
      if (fs.existsSync(launchSh) && fs.statSync(launchSh).mode & 0o111) {
        cmd = launchSh;
        args = [];
        cwd = backendDir;
        logBackend('info', `Using launch shell script: ${launchSh}`);
      } else {
        // Fall back to direct Python execution
        logBackend('info', 'No launch shell script found or it is not executable, trying direct Python execution');
        cmd = 'python3';
        args = [path.join(backendDir, 'app.py')];
        cwd = backendDir;
      }
    }
    
    logBackend('info', `Starting backend with command: ${cmd} ${args.join(' ')} (shell: ${shell ? 'yes' : 'no'})`);
    
    backendProcess = spawn(cmd, args, {
      cwd: cwd,
      stdio: 'pipe',
      shell: shell
    });
    
    // Log stdout
    backendProcess.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        const logEntry = logBackend('stdout', message);
        
        // Notify the renderer process of new logs
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-log', logEntry);
        }
      }
    });
    
    // Log stderr
    backendProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        const logEntry = logBackend('stderr', message);
        
        // Notify the renderer process of new logs
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-log', logEntry);
        }
      }
    });
    
    // Handle backend process exit
    backendProcess.on('close', (code) => {
      logBackend('system', `Backend process exited with code ${code}`);
      
      // Notify the renderer if backend crashes unexpectedly
      if (code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend-exit', { code });
      }
      
      backendProcess = null;
    });
    
    // Wait for the backend to start
    await new Promise((resolve) => setTimeout(resolve, 2000));
    logBackend('info', 'Backend server started (or wait time elapsed)');
    
  } catch (error) {
    logBackend('error', `Failed to start backend server: ${error.message}`);
    
    dialog.showErrorBox(
      'Backend Error',
      `Failed to start the backend server: ${error.message}\n\nPlease check your Python installation.`
    );
    
    app.quit();
  }
}

// Create the main browser window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'build/icon.png')
  });
  
  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL(`http://localhost:${PORT}`);
    // Open DevTools
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from built files
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    logBackend('info', `Loading index.html from: ${indexPath}`);
    
    mainWindow.loadFile(indexPath);
  }
  
  // Add context menu for inspecting elements in development
  if (isDev) {
    mainWindow.webContents.on('context-menu', (_, params) => {
      const menu = require('electron').Menu.buildFromTemplate([
        {
          label: 'Inspect Element',
          click: () => {
            mainWindow.webContents.inspectElement(params.x, params.y);
          }
        },
        {
          label: 'Open Developer Tools',
          click: () => {
            mainWindow.webContents.openDevTools();
          }
        }
      ]);
      menu.popup();
    });
  }
  
  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize the app
app.whenReady().then(async () => {
  logBackend('info', `Starting application from: ${__dirname}`);
  logBackend('info', `User data directory: ${app.getPath('userData')}`);
  logBackend('info', `Resources path: ${process.resourcesPath}`);
  
  // Copy default files to userData directory (only happens on first run)
  const defaultFilesCopy = await copyDefaultFilesToUserData();
  logBackend('info', `Default files copied: ${defaultFilesCopy.filesCopied.join(', ')}`);
  if (defaultFilesCopy.filesMissing.length > 0) {
    logBackend('info', `Default files not found: ${defaultFilesCopy.filesMissing.join(', ')}`);
  }
  
  // Start the backend server
  await startBackendServer();
  
  // Create the main window
  createWindow();
  
  // Re-create window on activation (macOS)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// IPC handlers for communicating with the renderer process
ipcMain.handle('get-backend-logs', () => {
  return backendLogs;
});

ipcMain.handle('restart-backend', async () => {
  if (backendProcess) {
    // Kill the existing process
    backendProcess.kill();
  }
  
  // Start a new backend process
  await startBackendServer();
  return { success: true };
});

// Handler for loading files from userData
ipcMain.handle('load-user-data-file', async (_, fileName) => {
  try {
    const filePath = path.join(app.getPath('userData'), fileName);
    if (!fs.existsSync(filePath)) {
      logBackend('info', `File not found in userData: ${fileName}`);
      return null;
    }
    
    logBackend('info', `Loading file from userData: ${filePath}`);
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    logBackend('error', `Error loading file ${fileName} from userData: ${error.message}`);
    return null;
  }
});

// Handler for getting app paths (for debugging)
ipcMain.handle('get-app-paths', () => {
  return {
    appPath: app.getAppPath(),
    userData: app.getPath('userData'),
    resourcesPath: process.resourcesPath,
    currentDir: __dirname,
    backendDir: getBackendDir()
  };
});

// Quit the app when all windows are closed (Windows & Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up the backend process when quitting
app.on('will-quit', () => {
  if (backendProcess) {
    logBackend('info', 'Terminating backend process...');
    backendProcess.kill();
    backendProcess = null;
  }
});