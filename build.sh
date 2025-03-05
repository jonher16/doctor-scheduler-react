#!/bin/bash
# Modified build script to create standalone application

echo "===== Hospital Scheduler Build Process ====="

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build React frontend
echo "1. Building React Frontend..."
npm run build

# Create standalone backend
echo "2. Creating standalone backend..."
rm -rf bundled_backend
mkdir -p bundled_backend

# Run PyInstaller
echo "   Running PyInstaller..."
pyinstaller --onefile --distpath ./bundled_backend backend/app.py

# Copy any additional required files
echo "   Copying additional backend files..."
cp backend/schedule_optimizer.py bundled_backend/

# Build the Electron application
echo "3. Creating Distribution Package..."
if [ "$1" == "--all" ]; then
    npx electron-builder -wl  # Windows and Linux
elif [ "$1" == "--linux" ]; then
    npx electron-builder --linux
else
    npx electron-builder --win
fi

echo "===== Build Complete! ====="
echo "Installer can be found in the \"release\" directory"