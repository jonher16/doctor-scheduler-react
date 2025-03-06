@echo off
REM Backend launcher that properly handles Windows paths with spaces
echo Starting Hospital Scheduler Backend...

REM Stay in the current directory (do not use cd)
REM This is important for paths with spaces

REM Get the directory of this batch file
set "SCRIPT_DIR=%~dp0"

REM Try to use the executable directly with proper quoting
echo Attempting to start hospital_backend.exe...
"%SCRIPT_DIR%hospital_backend.exe"

REM Check the result
if %ERRORLEVEL% NEQ 0 (
  echo Failed to start executable, error code: %ERRORLEVEL%
  
  REM Try with Python as fallback
  where python >nul 2>&1
  if %ERRORLEVEL% EQU 0 (
    echo Trying Python fallback...
    if exist "%SCRIPT_DIR%app.py" (
      python "%SCRIPT_DIR%app.py"
      exit /b %ERRORLEVEL%
    )
  )
  
  echo ERROR: Could not start backend server.
  exit /b 1
) else (
  echo Backend started successfully.
  exit /b 0
)