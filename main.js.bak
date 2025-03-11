// main.js - Fixed for Windows paths with spaces
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

// Helper function to set up logging for a process
function setupProcessLogging(proc) {
  if (!proc) return;
  
  // Log stdout
  if (proc.stdout) {
    proc.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        const logEntry = logBackend('stdout', message);
        // Notify the renderer process of new logs
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-log', logEntry);
        }
      }
    });
  }
  
  // Log stderr
  if (proc.stderr) {
    proc.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        const logEntry = logBackend('stderr', message);
        // Notify the renderer process of new logs
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-log', logEntry);
        }
      }
    });
  }
  
  // Handle backend process exit
  proc.on('close', (code) => {
    logBackend('system', `Backend process exited with code ${code}`);
    
    // Notify the renderer if backend crashes unexpectedly
    if (code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-exit', { code });
    }
    
    backendProcess = null;
  });
  
  // Handle errors in starting process
  proc.on('error', (err) => {
    logBackend('error', `Backend process error: ${err.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-exit', { 
        code: -1, 
        error: err.message 
      });
    }
  });
}

// Function to start backend server - Fixed for Windows paths with spaces
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
    // List files in backend directory for debugging
    let files = [];
    try {
      files = fs.readdirSync(backendDir);
      logBackend('info', `Files in backend directory: ${files.join(', ')}`);
    } catch (err) {
      logBackend('error', `Error reading backend directory: ${err.message}`);
    }
    
    // Try using the batch file first - this is better for Windows paths with spaces
    const batchPath = path.join(backendDir, 'run_backend.bat');
    
    if (fs.existsSync(batchPath)) {
      logBackend('info', `Found batch launcher: ${batchPath}`);
      
      // Use exec for batch files (better handling of paths with spaces)
      const { exec } = require('child_process');
      
      // Properly quote the path for Windows
      const quotedPath = `"${batchPath}"`;
      
      logBackend('info', `Executing: ${quotedPath}`);
      backendProcess = exec(quotedPath, {
        cwd: backendDir,
        windowsHide: false
      });
      
      logBackend('info', `Process started with batch script, PID: ${backendProcess.pid || 'unknown'}`);
      
      // Setup logging and error handling
      setupProcessLogging(backendProcess);
    }
    // Fallback: Try the executable directly 
    else {
      const exePath = path.join(backendDir, 'hospital_backend.exe');
      
      if (fs.existsSync(exePath)) {
        logBackend('info', `Found exe file: ${exePath}`);
        
        // Explicitly use cmd.exe to run the executable (handles spaces better)
        const { exec } = require('child_process');
        
        // Construct a cmd.exe command that properly handles paths with spaces
        const cmdCommand = `cmd.exe /c ""${exePath}""`;
        
        logBackend('info', `Starting backend with command: ${cmdCommand}`);
        
        backendProcess = exec(cmdCommand, {
          cwd: backendDir
        });
        
        logBackend('info', `Process started with PID: ${backendProcess.pid || 'unknown'}`);
        
        // Setup logging and error handling
        setupProcessLogging(backendProcess);
      }
      // Fallback to app.py with Python 
      else if (fs.existsSync(path.join(backendDir, 'app.py'))) {
        const appPyPath = path.join(backendDir, 'app.py');
        logBackend('info', `No executable or batch file found, falling back to Python: ${appPyPath}`);
        
        // Use python to run app.py
        backendProcess = spawn('python', [`"${appPyPath}"`], {
          cwd: backendDir,
          shell: true,  // Important for Windows path handling
          stdio: 'pipe'
        });
        
        logBackend('info', `Process started with PID: ${backendProcess.pid || 'unknown'}`);
        
        // Setup logging and error handling
        setupProcessLogging(backendProcess);
      }
      else {
        throw new Error("No executable, batch file, or Python script found in backend directory");
      }
    }
    
    // Wait for the backend to start
    await new Promise((resolve) => setTimeout(resolve, 2000));
    logBackend('info', 'Backend server started (or wait time elapsed)');
    
  } catch (error) {
    logBackend('error', `Failed to start backend server: ${error.message}`);
    
    dialog.showErrorBox(
      'Backend Error',
      `Failed to start the backend server: ${error.message}\n\nPlease reinstall the application.`
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
  logBackend('info', `Default files copied: ${defaultFilesCopy.filesCopied.join(', ') || 'none'}`);
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

app.on('window-all-closed', () => {
  // Ensure backend process is terminated
  if (backendProcess) {
    logBackend('info', 'Terminating backend process on window close...');
    try {
      // Try more forceful termination
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        if (backendProcess.pid) {
          execSync(`taskkill /pid ${backendProcess.pid} /T /F`);
        }
      } else {
        backendProcess.kill('SIGKILL');
      }
    } catch (err) {
      logBackend('error', `Error killing backend process: ${err.message}`);
    }
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up the backend process when quitting
app.on('will-quit', () => {
  if (backendProcess) {
    logBackend('info', 'Terminating backend process...');
    try {
      // Try more forceful termination
      if (process.platform === 'win32') {
        // On Windows, use taskkill to force terminate the process tree
        const { execSync } = require('child_process');
        if (backendProcess.pid) {
          execSync(`taskkill /pid ${backendProcess.pid} /T /F`);
        }
      } else {
        // On Unix systems, send SIGKILL for more forceful termination
        backendProcess.kill('SIGKILL');
      }
    } catch (err) {
      logBackend('error', `Error killing backend process: ${err.message}`);
    } finally {
      backendProcess = null;
    }
  }
});
