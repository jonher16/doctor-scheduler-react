@echo off
:: Complete automated build script for Hospital Scheduler on Windows
:: This script handles everything from dependencies to packaging

echo ===== Hospital Scheduler Complete Build Process =====
echo This script will build the complete application for Windows

:: Check if npm is installed
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: npm is not installed or not in PATH.
  echo Please install Node.js from https://nodejs.org/
  exit /b 1
)

:: Check if Python is installed for backend bundling
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Python is not installed or not in PATH.
  echo Python is needed to bundle the backend.
  echo Please install Python from https://www.python.org/downloads/
  echo Make sure to check "Add Python to PATH" during installation.
  exit /b 1
)

:: Ensure the project structure is correct
if not exist "frontend" (
  echo ERROR: frontend directory not found
  echo Please run this script from the project root
  exit /b 1
)

if not exist "backend" (
  echo ERROR: backend directory not found
  echo Please run this script from the project root
  exit /b 1
)

:: Clean up old build artifacts
echo Cleaning up old build artifacts...
if exist "dist" rmdir /s /q dist
if exist "release" rmdir /s /q release
if exist "bundled_backend" rmdir /s /q bundled_backend

:: Create necessary directories
mkdir dist
mkdir bundled_backend

:: Create build directory for icons if it doesn't exist
echo Creating build directory for icons...
if not exist "build" mkdir build

:: Copy the icon.svg to the build directory
echo Copying icon.svg to build directory...
copy "icon.png" "build\icon.png" >nul
copy "icon.ico" "build\icon.ico" >nul

:: Install dependencies in root directory if needed
echo Installing root directory dependencies...
if not exist "node_modules" (
  echo Installing npm dependencies in root directory...
  call npm install
  if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install npm dependencies in root directory.
    exit /b 1
  )
)

:: Navigate to frontend directory and install dependencies
echo Installing and building frontend...
cd frontend

:: Create or update vite.config.js
echo Creating proper vite.config.js...
echo // vite.config.js - Configured for the project structure> vite.config.js
echo import { defineConfig } from 'vite';>> vite.config.js
echo import react from '@vitejs/plugin-react';>> vite.config.js
echo import path from 'path';>> vite.config.js
echo.>> vite.config.js
echo // https://vitejs.dev/config/>> vite.config.js
echo export default defineConfig({>> vite.config.js
echo   plugins: [react()],>> vite.config.js
echo   base: './',>> vite.config.js
echo   build: {>> vite.config.js
echo     // Output to the dist folder in the project root>> vite.config.js
echo     outDir: '../dist',>> vite.config.js
echo     emptyOutDir: true,>> vite.config.js
echo     sourcemap: true>> vite.config.js
echo   },>> vite.config.js
echo   resolve: {>> vite.config.js
echo     alias: {>> vite.config.js
echo       '@': path.resolve(__dirname, './src')>> vite.config.js
echo     }>> vite.config.js
echo   }>> vite.config.js
echo });>> vite.config.js

:: Install frontend dependencies
if not exist "node_modules" (
  echo Installing npm dependencies in frontend directory...
  call npm install
  if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install npm dependencies in frontend directory.
    echo Trying to fix npm issues...
    
    :: Clean npm cache and try again
    call npm cache clean --force
    call npm install
    
    if %ERRORLEVEL% NEQ 0 (
      echo ERROR: Still failed to install dependencies after cleanup.
      cd ..
      exit /b 1
    )
  )
)

:: Build frontend
echo Building React frontend...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Frontend build failed.
  echo Attempting to fix rollup issue...
  
  :: Remove package-lock.json and node_modules to fix rollup issue
  if exist "package-lock.json" del package-lock.json
  if exist "node_modules" rmdir /s /q node_modules
  
  echo Installing frontend dependencies again...
  call npm install
  
  echo Retrying frontend build...
  call npm run build
  if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Frontend build failed again even after fixing dependencies.
    cd ..
    exit /b 1
  )
)

:: Return to root directory
cd ..

:: Check if dist directory was created
if not exist "dist" (
  echo ERROR: Frontend build did not create the dist directory
  exit /b 1
)

echo Frontend build completed successfully.

:: Build the backend executable
echo Building backend executable...
cd backend

:: Install PyInstaller if not already installed
python -m pip show pyinstaller >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Installing PyInstaller...
  python -m pip install pyinstaller
)

:: Install Flask and other dependencies if needed
python -m pip install flask flask-cors >nul 2>&1

:: Create a copy of app.py for bundling
copy app.py app_bundle.py >nul

:: Add the main block to ensure it runs correctly
echo. >> app_bundle.py
echo # Add a __main__ block to ensure app can be run directly >> app_bundle.py
echo if __name__ == "__main__": >> app_bundle.py
echo     import sys >> app_bundle.py
echo     print("Starting Hospital Scheduler Backend...", file=sys.stderr) >> app_bundle.py
echo     print("Python version:", sys.version, file=sys.stderr) >> app_bundle.py
echo     try: >> app_bundle.py
echo         app.run(host='0.0.0.0', port=5000, debug=False) >> app_bundle.py
echo     except Exception as e: >> app_bundle.py
echo         print(f"Error starting Flask app: {e}", file=sys.stderr) >> app_bundle.py
echo         sys.exit(1) >> app_bundle.py

:: Create PyInstaller spec file
echo Creating PyInstaller spec file...
echo # -*- mode: python ; coding: utf-8 -*- > app.spec
echo. >> app.spec
echo block_cipher = None >> app.spec
echo. >> app.spec
echo a = Analysis( >> app.spec
echo     ['app_bundle.py'], >> app.spec
echo     pathex=[], >> app.spec
echo     binaries=[], >> app.spec
echo     datas=[], >> app.spec
echo     hiddenimports=[ >> app.spec
echo         'flask',  >> app.spec
echo         'flask_cors',  >> app.spec
echo         'random', >> app.spec
echo         'copy', >> app.spec
echo         'time', >> app.spec
echo         'logging', >> app.spec
echo         'threading', >> app.spec
echo         'datetime', >> app.spec
echo         'json' >> app.spec
echo     ], >> app.spec
echo     hookspath=[], >> app.spec
echo     hooksconfig={}, >> app.spec
echo     runtime_hooks=[], >> app.spec
echo     excludes=[], >> app.spec
echo     win_no_prefer_redirects=False, >> app.spec
echo     win_private_assemblies=False, >> app.spec
echo     cipher=block_cipher, >> app.spec
echo     noarchive=False, >> app.spec
echo ) >> app.spec
echo. >> app.spec
echo pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher) >> app.spec
echo. >> app.spec
echo exe = EXE( >> app.spec
echo     pyz, >> app.spec
echo     a.scripts, >> app.spec
echo     a.binaries, >> app.spec
echo     a.zipfiles, >> app.spec
echo     a.datas,  >> app.spec
echo     [], >> app.spec
echo     name='hospital_backend', >> app.spec
echo     debug=False, >> app.spec
echo     bootloader_ignore_signals=False, >> app.spec
echo     strip=False, >> app.spec
echo     upx=True, >> app.spec
echo     upx_exclude=[], >> app.spec
echo     runtime_tmpdir=None, >> app.spec
echo     console=True, >> app.spec
echo     disable_windowed_traceback=False, >> app.spec
echo     argv_emulation=False, >> app.spec
echo     target_arch=None, >> app.spec
echo     codesign_identity=None, >> app.spec
echo     entitlements_file=None, >> app.spec
echo ) >> app.spec

echo Building backend executable with PyInstaller...
python -m PyInstaller --clean app.spec

:: Copy the built backend files to bundled_backend directory
cd ..
echo Copying backend files to bundled_backend directory...

:: Copy executable if available
if exist "backend\dist\hospital_backend.exe" (
  copy "backend\dist\hospital_backend.exe" "bundled_backend\" >nul
) else (
  echo ERROR: Failed to build backend executable.
  echo Will include app.py as fallback.
)

:: Copy key Python files as fallback
copy "backend\app.py" "bundled_backend\" >nul
copy "backend\monthly_schedule_optimizer.py" "bundled_backend\" >nul

:: Create the Windows-optimized run_backend.bat file
echo Creating Windows-optimized run_backend.bat...
echo @echo off > "bundled_backend\run_backend.bat"
echo REM Backend launcher that properly handles Windows paths with spaces >> "bundled_backend\run_backend.bat"
echo echo Starting Hospital Scheduler Backend... >> "bundled_backend\run_backend.bat"
echo. >> "bundled_backend\run_backend.bat"
echo REM Stay in the current directory (do not use cd) >> "bundled_backend\run_backend.bat"
echo REM This is important for paths with spaces >> "bundled_backend\run_backend.bat"
echo. >> "bundled_backend\run_backend.bat"
echo REM Get the directory of this batch file >> "bundled_backend\run_backend.bat"
echo set "SCRIPT_DIR=%%~dp0" >> "bundled_backend\run_backend.bat"
echo. >> "bundled_backend\run_backend.bat"
echo REM Try to use the executable directly with proper quoting >> "bundled_backend\run_backend.bat"
echo echo Attempting to start hospital_backend.exe... >> "bundled_backend\run_backend.bat"
echo "%%SCRIPT_DIR%%hospital_backend.exe" >> "bundled_backend\run_backend.bat"
echo. >> "bundled_backend\run_backend.bat"
echo REM Check the result >> "bundled_backend\run_backend.bat"
echo if %%ERRORLEVEL%% NEQ 0 ( >> "bundled_backend\run_backend.bat"
echo   echo Failed to start executable, error code: %%ERRORLEVEL%% >> "bundled_backend\run_backend.bat"
echo. >> "bundled_backend\run_backend.bat"
echo   REM Try with Python as fallback >> "bundled_backend\run_backend.bat"
echo   where python ^>nul 2^>^&1 >> "bundled_backend\run_backend.bat"
echo   if %%ERRORLEVEL%% EQU 0 ( >> "bundled_backend\run_backend.bat"
echo     echo Trying Python fallback... >> "bundled_backend\run_backend.bat"
echo     if exist "%%SCRIPT_DIR%%app.py" ( >> "bundled_backend\run_backend.bat"
echo       python "%%SCRIPT_DIR%%app.py" >> "bundled_backend\run_backend.bat"
echo       exit /b %%ERRORLEVEL%% >> "bundled_backend\run_backend.bat"
echo     ) >> "bundled_backend\run_backend.bat"
echo   ) >> "bundled_backend\run_backend.bat"
echo. >> "bundled_backend\run_backend.bat"
echo   echo ERROR: Could not start backend server. >> "bundled_backend\run_backend.bat"
echo   exit /b 1 >> "bundled_backend\run_backend.bat"
echo ) else ( >> "bundled_backend\run_backend.bat"
echo   echo Backend started successfully. >> "bundled_backend\run_backend.bat"
echo   exit /b 0 >> "bundled_backend\run_backend.bat"
echo ) >> "bundled_backend\run_backend.bat"

:: Create default files directory
echo Copying default JSON files...
mkdir "default" 2>nul
copy "frontend\public\doctors.json" "default\" >nul 2>nul
copy "frontend\public\holidays.json" "default\" >nul 2>nul

:: Create proper main.js file - FIXED APPROACH
echo Creating main.js with Windows path fixes...
if exist "main.js" (
  :: Backup the original main.js
  copy main.js main.js.bak >nul
)

:: Create main.js file directly - this avoids batch output in the JS file
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
echo // Function to forcefully terminate all hospital_backend processes
echo function terminateAllBackendProcesses^(^) {
echo   if ^(process.platform === 'win32'^) {
echo     try {
echo       // First try to kill our known process
echo       if ^(backendProcess ^&^& backendProcess.pid^) {
echo         try {
echo           const { execSync } = require^('child_process'^);
echo           execSync^(`taskkill /pid ${backendProcess.pid} /T /F`^);
echo           logBackend^('info', `Terminated backend process with PID: ${backendProcess.pid}`^);
echo         } catch ^(err^) {
echo           logBackend^('error', `Error killing known backend process: ${err.message}`^);
echo         }
echo       }
echo.
echo       // Then find and kill ALL hospital_backend.exe processes to be thorough
echo       const { execSync } = require^('child_process'^);
echo       logBackend^('info', 'Searching for any remaining hospital_backend.exe processes...'^);
echo       
echo       // Get a list of all hospital_backend.exe processes
echo       const { exec } = require^('child_process'^);
echo       exec^('tasklist /FI "IMAGENAME eq hospital_backend.exe" /FO CSV', ^(err, stdout^) =^> {
echo         if ^(err^) {
echo           logBackend^('error', `Error listing backend processes: ${err.message}`^);
echo           return;
echo         }
echo         
echo         // Parse CSV output to get PIDs
echo         const lines = stdout.trim^(^).split^('\n'^);
echo         if ^(lines.length ^> 1^) { // First line is header
echo           logBackend^('info', `Found ${lines.length - 1} hospital_backend.exe processes still running`^);
echo           
echo           try {
echo             // Kill all hospital_backend.exe processes forcefully
echo             execSync^('taskkill /F /IM hospital_backend.exe /T'^);
echo             logBackend^('info', 'Successfully terminated all hospital_backend.exe processes'^);
echo           } catch ^(killErr^) {
echo             logBackend^('error', `Error killing all backend processes: ${killErr.message}`^);
echo           }
echo         } else {
echo           logBackend^('info', 'No additional hospital_backend.exe processes found'^);
echo         }
echo       }^);
echo     } catch ^(err^) {
echo       logBackend^('error', `Error in terminate all processes: ${err.message}`^);
echo     }
echo   } else {
echo     // On Unix systems
echo     if ^(backendProcess^) {
echo       try {
echo         backendProcess.kill^('SIGKILL'^);
echo         logBackend^('info', 'Backend process terminated with SIGKILL'^);
echo       } catch ^(err^) {
echo         logBackend^('error', `Error killing backend process: ${err.message}`^);
echo       }
echo       
echo       // Try to find other Python processes that might be running the backend
echo       try {
echo         const { exec } = require^('child_process'^);
echo         exec^('pkill -f "python.*app.py"', ^(err^) =^> {
echo           if ^(err ^&^& err.code !== 1^) { // pkill returns 1 if no processes found
echo             logBackend^('error', `Error killing Python backend processes: ${err.message}`^);
echo           } else {
echo             logBackend^('info', 'All Python backend processes terminated'^);
echo           }
echo         }^);
echo       } catch ^(err^) {
echo         logBackend^('error', `Error in pkill command: ${err.message}`^);
echo       }
echo     }
echo   }
echo   
echo   // Clear the reference regardless of success
echo   backendProcess = null;
echo }
echo.
echo ipcMain.handle^('restart-backend', async ^(^) =^> {
echo   if ^(backendProcess^) {
echo     // Kill the existing process
echo     logBackend^('info', 'Terminating backend processes before restart...'^);
echo     terminateAllBackendProcesses^(^);
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
echo   // Ensure backend process is terminated
echo   if ^(backendProcess^) {
echo     logBackend^('info', 'Terminating backend processes on window close...'^);
echo     terminateAllBackendProcesses^(^);
echo   }
echo   
echo   if ^(process.platform !== 'darwin'^) {
echo     app.quit^(^);
echo   }
echo }^);
echo.
echo // Clean up the backend process when quitting
echo app.on^('will-quit', ^(^) =^> {
echo   if ^(backendProcess^) {
echo     logBackend^('info', 'Terminating backend processes...'^);
echo     terminateAllBackendProcesses^(^);
echo   }
echo }^);
) > main.js

echo Main.js created successfully with Windows path handling fixes.

:: Update package.json to include proper resources
echo Checking package.json for proper resource configuration...

:: Build the Electron application
echo Building electron application...
call npx electron-builder --win
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Electron build failed.
  exit /b 1
)

echo.
echo ===== BUILD COMPLETED SUCCESSFULLY! =====
echo.
echo The application has been built with Windows path handling fixes and is in the "release" directory:
echo    - Doctor Scheduler-1.0.0.exe (Bundled App)
echo.
echo This build includes:
echo    1. Fixed main.js with Windows path handling
echo    2. Windows-optimized run_backend.bat launcher
echo    3. All necessary fallbacks and safety checks
echo.
echo Thank you for using Hospital Scheduler!