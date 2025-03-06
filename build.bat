@echo off
:: All-in-One Windows build script for Hospital Scheduler

echo ===== Hospital Scheduler Full Build Process =====
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

:: Install dependencies if needed
if not exist "node_modules" (
  echo Installing npm dependencies...
  call npm install
  if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install npm dependencies.
    exit /b 1
  )
)

:: Build frontend
echo Building React frontend...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Frontend build failed.
  exit /b 1
)

:: Bundle backend
echo Bundling Python backend...
call bundle-backend.bat
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Backend bundling failed.
  exit /b 1
)

:: Build Windows installer and portable version
echo Building Windows applications...
call npm run dist:win
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Electron build failed.
  exit /b 1
)

echo.
echo ===== BUILD SUCCESSFUL! =====
echo.
echo The installer can be found in the "release" directory:
echo    - Hospital Scheduler-Setup-1.0.0.exe (Installer)
echo    - Hospital Scheduler-1.0.0.exe (Portable version)
echo.
echo Thank you for using Hospital Scheduler!