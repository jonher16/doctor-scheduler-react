@echo off
REM Windows launcher for backend
echo Starting Hospital Scheduler Backend...

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python is not installed or not in PATH.
    echo Please install Python 3.8 or higher from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    exit /b 1
)

REM Get the directory where this batch file resides
set BACKEND_DIR=%~dp0

REM Run the backend using the app.py file in the same directory
python "%BACKEND_DIR%app.py"
exit /b %ERRORLEVEL%
