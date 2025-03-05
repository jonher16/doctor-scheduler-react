#!/bin/bash
# Simplified script to copy backend files into bundled_backend

echo "===== Preparing Backend Files ====="

# Create a directory for the bundled backend
mkdir -p bundled_backend

# Copy backend files directly
echo "Copying backend files directly..."
cp -r backend/* bundled_backend/

# Create a launcher script for Windows
echo "Creating Windows launcher script..."
cat > bundled_backend/launch_backend.bat << 'BATCH_EOL'
@echo off
REM Windows launcher for backend
echo Starting Hospital Scheduler Backend...

REM Check if Python is installed
python3 --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python is not installed or not in PATH.
    echo Please install Python 3.8 or higher from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    exit /b 1
)

REM Run the backend
python3 app.py
exit /b %ERRORLEVEL%
BATCH_EOL

# Create a launcher script for Linux
echo "Creating Linux launcher script..."
cat > bundled_backend/launch_backend.sh << 'SH_EOL'
#!/bin/bash
# Linux launcher for backend
echo "Starting Hospital Scheduler Backend..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python is not installed"
    echo "Please install Python 3.8 or higher"
    exit 1
fi

# Run the backend
python3 app.py
exit $?
SH_EOL

# Make the Linux launcher executable
chmod +x bundled_backend/launch_backend.sh

echo "Backend files prepared successfully!"
echo "Files are in the bundled_backend directory"
