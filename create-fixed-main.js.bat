@echo off
:: Script to create a fixed main.js file without batch output mixing in
:: This approach prevents syntax errors in the generated JavaScript

echo Creating fixed main.js file...

:: Create the file with proper JavaScript syntax
(
echo // main.js - Fixed for Windows paths with spaces
echo const { app, BrowserWindow, ipcMain, dialog } = require^('electron'^);
echo const path = require^('path'^);
echo const { spawn } = require^('child_process'^);
echo const fs = require^('fs'^);
echo const isDev = process.env.NODE_ENV === 'development';
echo const PORT = 3000;
echo const API_PORT = 5000;
echo.
echo // Import default file copying functionality
echo const { copyDefaultFilesToUserData } = require^('./copy-defaults'^);
echo.
echo // Keep references to prevent garbage collection
echo let mainWindow;
echo let backendProcess;
echo let backendLogs = [];
echo.
echo // Add logging function for backend messages
echo function logBackend^(type, message^) {
echo   const logEntry = { 
echo     type, 
echo     message, 
echo     timestamp: new Date^(^).toISOString^(^) 
echo   };
echo   console.log^(`[${type.toUpperCase^(^)}] ${message}`^);
echo   backendLogs.push^(logEntry^);
echo   
echo   // Save to log file in userData directory
echo   try {
echo     const logDir = path.join^(app.getPath^('userData'^), 'logs'^);
echo     fs.mkdirSync^(logDir, { recursive: true }^);
echo     
echo     fs.appendFileSync^(
echo       path.join^(logDir, 'backend.log'^),
echo       `[${logEntry.timestamp}] [${type.toUpperCase^(^)}] ${message}\n`
echo     ^);
echo   } catch ^(err^) {
echo     // Silently fail if we can't write to log file
echo   }
echo   
echo   return logEntry;
echo }
echo.
echo // Function to get Backend directory
echo function getBackendDir^(^) {
echo   // In development mode, use the backend directory in the project
echo   if ^(isDev^) {
echo     return path.join^(__dirname, 'backend'^);
echo   }
echo   
echo   // In production, the backend should be in the resources directory
echo   return path.join^(process.resourcesPath, 'backend'^);
echo }
echo.
echo // Helper function to set up logging for a process
echo function setupProcessLogging^(process^) {
echo   if ^(!process^) return;
echo   
echo   // Log stdout
echo   process.stdout?.on^('data', ^(data^) =^> {
echo     const message = data.toString^(^).trim^(^);
echo     if ^(message^) {
echo       const logEntry = logBackend^('stdout', message^);
echo       
echo       // Notify the renderer process of new logs
echo       if ^(mainWindow ^&^& !mainWindow.isDestroyed^(^)^) {
echo         mainWindow.webContents.send^('backend-log', logEntry^);
echo       }
echo     }
echo   }^);
echo   
echo   // Log stderr
echo   process.stderr?.on^('data', ^(data^) =^> {
echo     const message = data.toString^(^).trim^(^);
echo     if ^(message^) {
echo       const logEntry = logBackend^('stderr', message^);
echo       
echo       // Notify the renderer process of new logs
echo       if ^(mainWindow ^&^& !mainWindow.isDestroyed^(^)^) {
echo         mainWindow.webContents.send^('backend-log', logEntry^);
echo       }
echo     }
echo   }^);
echo   
echo   // Handle backend process exit
echo   process.on^('close', ^(code^) =^> {
echo     logBackend^('system', `Backend process exited with code ${code}`^);
echo     
echo     // Notify the renderer if backend crashes unexpectedly
echo     if ^(code !== 0 ^&^& mainWindow ^&^& !mainWindow.isDestroyed^(^)^) {
echo       mainWindow.webContents.send^('backend-exit', { code }^);
echo     }
echo     
echo     backendProcess = null;
echo   }^);
echo   
echo   // Handle errors in starting process
echo   process.on^('error', ^(err^) =^> {
echo     logBackend^('error', `Backend process error: ${err.message}`^);
echo     if ^(mainWindow ^&^& !mainWindow.isDestroyed^(^)^) {
echo       mainWindow.webContents.send^('backend-exit', { 
echo         code: -1, 
echo         error: err.message 
echo       }^);
echo     }
echo   }^);
echo }
echo.
echo // Function to start backend server
echo async function startBackendServer^(^) {
echo   logBackend^('info', 'Starting backend server...'^);
echo   
echo   // Find the backend directory
echo   const backendDir = getBackendDir^(^);
echo   
echo   if ^(!fs.existsSync^(backendDir^)^) {
echo     const errorMessage = `Backend directory not found at: ${backendDir}`;
echo     logBackend^('error', errorMessage^);
echo     
echo     dialog.showErrorBox^(
echo       'Backend Not Found',
echo       errorMessage + '\n\nPlease reinstall the application.'
echo     ^);
echo     
echo     app.quit^(^);
echo     return;
echo   }
echo   
echo   logBackend^('info', `Using backend directory: ${backendDir}`^);
echo   
echo   try {
echo     // List files in backend directory for debugging
echo     let files = [];
echo     try {
echo       files = fs.readdirSync^(backendDir^);
echo       logBackend^('info', `Files in backend directory: ${files.join^(', '^)}`^);
echo     } catch ^(err^) {
echo       logBackend^('error', `Error reading backend directory: ${err.message}`^);
echo     }
echo     
echo     // Try using the batch file first - better for Windows paths with spaces
echo     const batchPath = path.join^(backendDir, 'run_backend.bat'^);
echo     
echo     if ^(fs.existsSync^(batchPath^)^) {
echo       logBackend^('info', `Found batch launcher: ${batchPath}`^);
echo       
echo       // Use exec for batch files ^(better for Windows paths^)
echo       const { exec } = require^('child_process'^);
echo       
echo       // Properly quote the path for Windows
echo       const quotedPath = `"${batchPath}"`;
echo       
echo       logBackend^('info', `Executing: ${quotedPath}`^);
echo       backendProcess = exec^(quotedPath, {
echo         cwd: backendDir,
echo         windowsHide: false
echo       }^);
echo       
echo       logBackend^('info', `Process started with batch script, PID: ${backendProcess.pid || 'unknown'}`^);
echo       
echo       // Setup logging and error handling
echo       setupProcessLogging^(backendProcess^);
echo     }
echo     // Fallback: Try direct executable approach
echo     else {
echo       const exePath = path.join^(backendDir, 'hospital_backend.exe'^);
echo       
echo       if ^(fs.existsSync^(exePath^)^) {
echo         logBackend^('info', `Found exe file: ${exePath}`^);
echo         
echo         // Use cmd.exe to execute (handles paths with spaces better)
echo         const { exec } = require^('child_process'^);
echo         
echo         // Use cmd.exe with explicit quotes
echo         const cmdCommand = `cmd.exe /c ""${exePath}""`;
echo         
echo         logBackend^('info', `Starting backend with command: ${cmdCommand}`^);
echo         
echo         backendProcess = exec^(cmdCommand, {
echo           cwd: backendDir
echo         }^);
echo         
echo         logBackend^('info', `Process started with PID: ${backendProcess.pid || 'unknown'}`^);
echo         
echo         // Setup logging and error handling
echo         setupProcessLogging^(backendProcess^);
echo       }
echo       // Fallback to app.py with Python 
echo       else if ^(fs.existsSync^(path.join^(backendDir, 'app.py'^)^)^) {
echo         const appPyPath = path.join^(backendDir, 'app.py'^);
echo         logBackend^('info', `Falling back to Python: ${appPyPath}`^);
echo         
echo         // Use python with shell: true for path handling
echo         const { spawn } = require^('child_process'^);
echo         backendProcess = spawn^('python', [appPyPath], {
echo           cwd: backendDir,
echo           shell: true,
echo           stdio: 'pipe'
echo         }^);
echo         
echo         logBackend^('info', `Process started with PID: ${backendProcess.pid || 'unknown'}`^);
echo         
echo         // Setup logging and error handling
echo         setupProcessLogging^(backendProcess^);
echo       }
echo       else {
echo         throw new Error^("No executable, batch file, or Python script found in backend directory"^);
echo       }
echo     }
echo     
echo     // Wait for the backend to start
echo     await new Promise^(^(resolve^) =^> setTimeout^(resolve, 2000^)^);
echo     logBackend^('info', 'Backend server started ^(or wait time elapsed^)'^);
echo     
echo   } catch ^(error^) {
echo     logBackend^('error', `Failed to start backend server: ${error.message}`^);
echo     
echo     dialog.showErrorBox^(
echo       'Backend Error',
echo       `Failed to start the backend server: ${error.message}\n\nPlease reinstall the application.`
echo     ^);
echo     
echo     app.quit^(^);
echo   }
echo }
echo.
echo // Create the main browser window
echo function createWindow^(^) {
echo   mainWindow = new BrowserWindow^({
echo     width: 1280,
echo     height: 800,
echo     webPreferences: {
echo       nodeIntegration: false,
echo       contextIsolation: true,
echo       preload: path.join^(__dirname, 'preload.js'^)
echo     },
echo     icon: path.join^(__dirname, 'build/icon.png'^)
echo   }^);
echo   
echo   // Load the app
echo   if ^(isDev^) {
echo     // In development, load from Vite dev server
echo     mainWindow.loadURL^(`http://localhost:${PORT}`^);
echo     // Open DevTools
echo     mainWindow.webContents.openDevTools^(^);
echo   } else {
echo     // In production, load from built files
echo     const indexPath = path.join^(__dirname, 'dist', 'index.html'^);
echo     logBackend^('info', `Loading index.html from: ${indexPath}`^);
echo     
echo     mainWindow.loadFile^(indexPath^);
echo   }
echo   
echo   // Add context menu for inspecting elements in development
echo   if ^(isDev^) {
echo     mainWindow.webContents.on^('context-menu', ^(_, params^) =^> {
echo       const menu = require^('electron'^).Menu.buildFromTemplate^([
echo         {
echo           label: 'Inspect Element',
echo           click: ^(^) =^> {
echo             mainWindow.webContents.inspectElement^(params.x, params.y^);
echo           }
echo         },
echo         {
echo           label: 'Open Developer Tools',
echo           click: ^(^) =^> {
echo             mainWindow.webContents.openDevTools^(^);
echo           }
echo         }
echo       ]^);
echo       menu.popup^(^);
echo     }^);
echo   }
echo   
echo   // Handle window close
echo   mainWindow.on^('closed', ^(^) =^> {
echo     mainWindow = null;
echo   }^);
echo }
echo.
echo // Initialize the app
echo app.whenReady^(^).then^(async ^(^) =^> {
echo   logBackend^('info', `Starting application from: ${__dirname}`^);
echo   logBackend^('info', `User data directory: ${app.getPath^('userData'^)}`^);
echo   logBackend^('info', `Resources path: ${process.resourcesPath}`^);
echo   
echo   // Copy default files to userData directory ^(only happens on first run^)
echo   const defaultFilesCopy = await copyDefaultFilesToUserData^(^);
echo   logBackend^('info', `Default files copied: ${defaultFilesCopy.filesCopied.join^(', '^) || 'none'}`^);
echo   if ^(defaultFilesCopy.filesMissing.length ^> 0^) {
echo     logBackend^('info', `Default files not found: ${defaultFilesCopy.filesMissing.join^(', '^)}`^);
echo   }
echo   
echo   // Start the backend server
echo   await startBackendServer^(^);
echo   
echo   // Create the main window
echo   createWindow^(^);
echo   
echo   // Re-create window on activation ^(macOS^)
echo   app.on^('activate', ^(^) =^> {
echo     if ^(BrowserWindow.getAllWindows^(^).length === 0^) {
echo       createWindow^(^);
echo     }
echo   }^);
echo }^);
echo.
echo // IPC handlers for communicating with the renderer process
echo ipcMain.handle^('get-backend-logs', ^(^) =^> {
echo   return backendLogs;
echo }^);
echo.
echo ipcMain.handle^('restart-backend', async ^(^) =^> {
echo   if ^(backendProcess^) {
echo     // Kill the existing process
echo     backendProcess.kill^(^);
echo   }
echo   
echo   // Start a new backend process
echo   await startBackendServer^(^);
echo   return { success: true };
echo }^);
echo.
echo // Handler for loading files from userData
echo ipcMain.handle^('load-user-data-file', async ^(_, fileName^) =^> {
echo   try {
echo     const filePath = path.join^(app.getPath^('userData'^), fileName^);
echo     if ^(!fs.existsSync^(filePath^)^) {
echo       logBackend^('info', `File not found in userData: ${fileName}`^);
echo       return null;
echo     }
echo     
echo     logBackend^('info', `Loading file from userData: ${filePath}`^);
echo     const fileContent = await fs.promises.readFile^(filePath, 'utf8'^);
echo     return JSON.parse^(fileContent^);
echo   } catch ^(error^) {
echo     logBackend^('error', `Error loading file ${fileName} from userData: ${error.message}`^);
echo     return null;
echo   }
echo }^);
echo.
echo // Handler for getting app paths ^(for debugging^)
echo ipcMain.handle^('get-app-paths', ^(^) =^> {
echo   return {
echo     appPath: app.getAppPath^(^),
echo     userData: app.getPath^('userData'^),
echo     resourcesPath: process.resourcesPath,
echo     currentDir: __dirname,
echo     backendDir: getBackendDir^(^)
echo   };
echo }^);
echo.
echo // Quit the app when all windows are closed ^(Windows ^& Linux^)
echo app.on^('window-all-closed', ^(^) =^> {
echo   if ^(process.platform !== 'darwin'^) {
echo     app.quit^(^);
echo   }
echo }^);
echo.
echo // Clean up the backend process when quitting
echo app.on^('will-quit', ^(^) =^> {
echo   if ^(backendProcess^) {
echo     logBackend^('info', 'Terminating backend process...'^);
echo     backendProcess.kill^(^);
echo     backendProcess = null;
echo   }
echo }^);
) > main.js

echo Fixed main.js file created successfully!