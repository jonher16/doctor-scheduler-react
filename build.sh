#!/bin/bash
# Script to build the Electron application for Windows and Linux

# Function to check if command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Check requirements
if ! command_exists npm; then
  echo "❌ npm is required but not installed"
  exit 1
fi

# Create the simple backend bundling script
cat > bundle-backend.sh << 'EOL'
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
EOL

# Make the script executable
chmod +x bundle-backend.sh

# Create build directory if it doesn't exist
mkdir -p build

# Generate application icons
echo "🖼️ Checking application icons..."
if [ ! -f "build/icon.png" ] || [ ! -f "build/icon.ico" ]; then
  if [ -f "icon.svg" ]; then
    echo "Generating icons from icon.svg..."
    
    if command_exists convert; then
      # Using ImageMagick
      convert -background none icon.svg -resize 1024x1024 build/icon.png
      echo "✅ Generated build/icon.png (1024x1024)"
      
      # Make sure the Windows icon has the required sizes
      convert build/icon.png -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico
      echo "✅ Generated build/icon.ico with multiple sizes (including 256x256)"
    else
      echo "⚠️ ImageMagick not found - can't generate icons automatically."
      echo "Please create icon files manually:"
      echo "  - build/icon.png (1024x1024)"
      echo "  - build/icon.ico (with 256x256 size included)"
      exit 1
    fi
  else
    echo "❌ No icon source found. Please add icon.svg to the project root."
    exit 1
  fi
fi

# Check for frontend directory
if [ ! -d "frontend" ]; then
  echo "❌ frontend directory not found in project root."
  exit 1
fi

# Check for index.html in frontend directory
if [ ! -f "frontend/index.html" ]; then
  echo "❌ index.html not found in frontend directory."
  exit 1
fi

# Check for backend directory
if [ ! -d "backend" ]; then
  echo "❌ backend directory not found in project root."
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Bundle the backend - using the simplified approach
echo "🐍 Preparing backend files..."
./bundle-backend.sh

# Check if bundling was successful
if [ $? -ne 0 ]; then
  echo "❌ Backend preparation failed. Aborting packaging."
  exit 1
fi

# Check if bundled_backend directory exists and is not empty
if [ ! -d "bundled_backend" ] || [ -z "$(ls -A bundled_backend)" ]; then
  echo "❌ Error: bundled_backend directory is empty or does not exist."
  exit 1
fi

# Check if the main Python file exists in the bundled backend
if [ ! -f "bundled_backend/app.py" ]; then
  echo "❌ Error: app.py not found in bundled_backend directory."
  exit 1
fi

# Build the React application using npx to run local vite
echo "🔨 Building React application..."
npx vite build

# Check if build was successful
if [ $? -ne 0 ]; then
  echo "❌ React build failed. Aborting packaging."
  exit 1
fi

# Create a verification file to help with path debugging
echo "Creating verification files..."
echo "This file helps verify that resources are correctly included in the build." > bundled_backend/VERIFY.txt
echo "This file helps verify that resources are correctly included in the build." > build/VERIFY.txt

# Package for Windows (NSIS installer)
echo "📦 Packaging for Windows (NSIS installer)..."
npm run dist:win

# Package for Linux (AppImage)
echo "📦 Packaging for Linux (AppImage)..."
npm run dist:linux

echo "✅ Build complete!"
echo "You can find the packaged applications in the release directory."