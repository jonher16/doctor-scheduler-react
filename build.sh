#!/bin/bash
# Hospital Scheduler Build Script for Linux (targeting Windows)

echo "===== Hospital Scheduler Build Process ====="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed or not in PATH."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Error installing dependencies!"
        exit 1
    fi
fi

# Check for wine (needed for Windows builds on Linux)
if ! command -v wine &> /dev/null; then
    echo "Warning: Wine is not installed. This is needed to build Windows installers on Linux."
    echo "Install it with: sudo apt-get install wine"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo
echo "1. Building React Frontend..."
npm run build

if [ $? -ne 0 ]; then
    echo "Error building React frontend!"
    exit 1
fi

echo
echo "2. Creating required backend files..."

# Check if backend directory exists
if [ ! -d "backend" ]; then
    echo "Error: Backend directory not found!"
    exit 1
fi

# Create the launch_backend.bat file
echo "Creating launch_backend.bat file..."
cat > backend/launch_backend.bat << 'EOF'
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
EOF

# Create the launch_backend.sh file (in case it's needed)
echo "Creating launch_backend.sh file..."
cat > backend/launch_backend.sh << 'EOF'
#!/bin/bash
# Linux launcher for backend
echo "Starting Hospital Scheduler Backend..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python is not installed"
    echo "Please install Python 3.8 or higher"
    exit 1
fi

# Get the directory where this script resides
BACKEND_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Run the backend
python3 "${BACKEND_DIR}/app.py"
exit $?
EOF

# Make the shell script executable
chmod +x backend/launch_backend.sh

echo "3. Checking for installer.nsh..."
if [ ! -f "installer.nsh" ]; then
    echo "Creating installer.nsh file..."
    cat > installer.nsh << 'EOF'
!macro customInstall
  ; Check if Python is installed
  nsExec::ExecToStack 'py --version'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_YESNO "Python is required but not detected. Would you like to download and install Python now?" IDYES download IDNO continue
    download:
      ExecShell "open" "https://www.python.org/downloads/windows/"
    continue:
  ${EndIf}
  
  ; Install required Python packages if Python is installed
  ${If} $0 == 0
    DetailPrint "Installing required Python packages..."
    nsExec::ExecToLog 'py -m pip install flask==2.3.3 flask-cors==4.0.0'
  ${EndIf}
!macroend
EOF
    chmod 644 installer.nsh
fi

echo
echo "4. Creating Distribution Package..."
# Check if we're building specifically for Windows or for all platforms
if [ "$1" == "--all" ]; then
    echo "Building for all platforms..."
    npx electron-builder -wl  # Windows and Linux
elif [ "$1" == "--linux" ]; then
    echo "Building for Linux only..."
    npx electron-builder --linux
else
    echo "Building for Windows..."
    npx electron-builder --win
fi

if [ $? -ne 0 ]; then
    echo "Error creating distribution package!"
    exit 1
fi

echo
echo "===== Build Complete! ====="
echo "Installer can be found in the \"release\" directory"
echo