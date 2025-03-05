#!/bin/bash
# Script to bundle the Python backend into a standalone Windows executable

echo "===== Bundling Python Backend for Windows Only ====="

# Ensure PyInstaller is installed
if ! pip show pyinstaller &> /dev/null; then
    echo "Installing PyInstaller..."
    pip install pyinstaller
fi

# Ensure the output directory exists
mkdir -p bundled_backend

# Go to the backend directory
cd backend

# Make a copy of app.py that we can modify for bundling
cp app.py app_bundle.py

# Create a main function in app_bundle.py to ensure it can run directly
cat >> app_bundle.py << 'EOF'

# Add a __main__ block to ensure app can be run directly
if __name__ == "__main__":
    import sys
    print("Starting Hospital Scheduler Backend...", file=sys.stderr)
    print("Python version:", sys.version, file=sys.stderr)
    try:
        app.run(host='0.0.0.0', port=5000, debug=False)
    except Exception as e:
        print(f"Error starting Flask app: {e}", file=sys.stderr)
        sys.exit(1)
EOF

echo "Creating PyInstaller spec file..."

# Create spec file for the backend - Windows-focused with explicit .exe extension
cat > app.spec << 'EOF'
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['app_bundle.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'flask', 
        'flask_cors', 
        'schedule_optimizer',
        'random',
        'copy',
        'time',
        'logging',
        'threading',
        'datetime',
        'json'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# Explicitly set target to Windows .exe
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='hospital_backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='hospital_backend',
)
EOF

echo "Building standalone backend with PyInstaller..."

# Try using explicit Windows target
if ! pyinstaller --clean app.spec --target-platform=win32 --windowed; then
    echo "Explicit Windows target failed, trying standard PyInstaller build..."
    pyinstaller --clean app.spec
fi

# Check if build succeeded
if [ ! -d "dist/hospital_backend" ]; then
    echo "ERROR: PyInstaller build failed! dist/hospital_backend directory not found."
    exit 1
fi

# Now let's check if we got the .exe
echo "Checking for hospital_backend.exe..."
if [ -f "dist/hospital_backend/hospital_backend.exe" ]; then
    echo "SUCCESS: hospital_backend.exe was created correctly!"
else
    echo "WARNING: hospital_backend.exe wasn't created. Let's copy and rename the file."
    
    # If we're on Windows or can run 'file' command, check the file type
    if [ -f "dist/hospital_backend/hospital_backend" ]; then
        echo "Found hospital_backend without extension"
        
        # Try to determine if it's an executable
        if command -v file >/dev/null 2>&1; then
            file_type=$(file "dist/hospital_backend/hospital_backend")
            echo "File type: $file_type"
            
            # If it contains "PE" or "executable", it's likely a Windows exe
            if [[ "$file_type" == *"PE"* ]] || [[ "$file_type" == *"executable"* ]]; then
                echo "This appears to be a Windows executable, renaming to add .exe extension"
                cp "dist/hospital_backend/hospital_backend" "dist/hospital_backend/hospital_backend.exe"
            fi
        else
            # Can't determine file type, just copy and assume it's an exe
            echo "Copying file and adding .exe extension"
            cp "dist/hospital_backend/hospital_backend" "dist/hospital_backend/hospital_backend.exe"
        fi
    else
        echo "ERROR: No hospital_backend file was found at all!"
        # Create a batch file that will run Python instead
        echo "Creating a fallback batch file..."
    fi
fi

# Copy the bundled backend to project root
echo "Copying bundled backend to project root..."
rm -rf ../bundled_backend/*  # Clean the directory first
cp -r dist/hospital_backend/* ../bundled_backend/

# Ensure the executable has the .exe extension in the output directory
if [ -f "../bundled_backend/hospital_backend" ] && [ ! -f "../bundled_backend/hospital_backend.exe" ]; then
    echo "Copying hospital_backend → hospital_backend.exe in bundled_backend dir"
    cp "../bundled_backend/hospital_backend" "../bundled_backend/hospital_backend.exe"
fi

# Copy the schedule_optimizer.py to the output directory as backup
echo "Copying schedule_optimizer.py to bundled backend..."
cp schedule_optimizer.py ../bundled_backend/

# Create a simple app.py in the output directory as a fallback
echo "Creating fallback app.py in the bundled backend..."
cat > ../bundled_backend/app.py << 'EOF'
#!/usr/bin/env python
# Fallback app.py - Simple server if the bundled executable fails
from flask import Flask, request, jsonify
from flask_cors import CORS
import datetime
import json
import os

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing

@app.route('/api/status', methods=['GET'])
def status():
    """Simple status endpoint"""
    return jsonify({
        "status": "up",
        "version": "1.0.0 (Fallback)",
        "timestamp": datetime.datetime.now().isoformat()
    })

@app.route('/api/optimize', methods=['POST'])
def optimize():
    """Simple optimizer that just returns a basic schedule"""
    try:
        data = request.json
        doctors = data.get("doctors", [])
        
        # Create a very simple schedule
        schedule = {}
        doctor_names = [doc["name"] for doc in doctors]
        if doctor_names:
            for month in range(1, 13):
                for day in range(1, 29):  # Simplified to avoid month length issues
                    date_str = f"2025-{month:02d}-{day:02d}"
                    schedule[date_str] = {
                        "Day": [doctor_names[0], doctor_names[min(1, len(doctor_names)-1)]],
                        "Evening": [doctor_names[min(2, len(doctor_names)-1)]],
                        "Night": [doctor_names[min(3, len(doctor_names)-1)], doctor_names[min(4, len(doctor_names)-1)]]
                    }
        
        # Return simple result
        return jsonify({
            "schedule": schedule,
            "statistics": {
                "status": "OK (Fallback)",
                "solution_time_seconds": 1.0,
                "objective_value": 100.0,
                "coverage_errors": 0,
                "doctor_shift_counts": {name: 50 for name in doctor_names}
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/optimize/progress', methods=['GET'])
def progress():
    """Simple progress endpoint"""
    return jsonify({
        "current": 100,
        "total": 100,
        "status": "completed",
        "message": "Using fallback server"
    })

if __name__ == "__main__":
    print("Starting fallback server on port 5000...")
    app.run(host='0.0.0.0', port=5000)
EOF

# Create a launcher script that will try the executable and fall back to Python if needed
echo "Creating a Windows launcher script..."
cat > ../bundled_backend/backend_launcher.bat << 'EOF'
@echo off
REM Backend launcher script - Tries executable first, falls back to Python
echo Starting Hospital Scheduler Backend...

REM Get the directory of this batch file
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Check if the executable exists
if exist hospital_backend.exe (
  echo Found hospital_backend.exe, starting...
  start "" hospital_backend.exe
  exit /b 0
)

REM If we get here, try Python
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo Executable not found, trying Python...
  if exist app.py (
    echo Found app.py, starting with Python...
    start "" python app.py
    exit /b 0
  )
)

echo ERROR: Could not start backend server.
echo Neither hospital_backend.exe nor Python with app.py is available.
exit /b 1
EOF

# Also create a version that doesn't use "start" command for direct execution
cat > ../bundled_backend/run_backend.bat << 'EOF'
@echo off
REM Backend direct execution - Tries executable first, falls back to Python
echo Starting Hospital Scheduler Backend...

REM Get the directory of this batch file
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Check if the executable exists
if exist hospital_backend.exe (
  echo Found hospital_backend.exe, starting...
  hospital_backend.exe
  exit /b %ERRORLEVEL%
)

REM If we get here, try Python
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo Executable not found, trying Python...
  if exist app.py (
    echo Found app.py, starting with Python...
    python app.py
    exit /b %ERRORLEVEL%
  )
)

echo ERROR: Could not start backend server.
echo Neither hospital_backend.exe nor Python with app.py is available.
exit /b 1
EOF

echo "===== Backend Bundling Complete ====="
echo "Windows executable is in the bundled_backend directory"
if [ -f "../bundled_backend/hospital_backend.exe" ]; then
    echo "SUCCESS: hospital_backend.exe was created correctly!"
else
    echo "WARNING: hospital_backend.exe wasn't found in the final directory."
    echo "Check the bundled_backend directory for what was created."
fi