#!/bin/bash
# Simplified script to build the Python backend as a standalone executable

# Exit on any error
set -e

echo "===== Building Standalone Backend ====="

# Create the spec file
cat > backend.spec << 'EOL'
# -*- mode: python ; coding: utf-8 -*-

import os
from PyInstaller.utils.hooks import collect_data_files

block_cipher = None

# Collect data files
data_files = []
data_files.extend(collect_data_files('flask'))
data_files.extend(collect_data_files('flask_cors'))

# Add requirements.txt
data_files.append(('backend/requirements.txt', '.'))

a = Analysis(
    ['backend/app.py'],
    pathex=[],
    binaries=[],
    datas=data_files,
    hiddenimports=['flask', 'flask_cors', 'gunicorn', 'ortools', 'pulp'],
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

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='backend_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
EOL

echo "Created PyInstaller spec file"

# Make sure PyInstaller is installed
echo "Installing PyInstaller..."
pip install pyinstaller

# Build using the spec file
echo "Building executable with PyInstaller..."
pyinstaller backend.spec

# Create bundled_backend directory if it doesn't exist
mkdir -p bundled_backend

# Copy the executable to bundled_backend
if [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32" ]]; then
  cp dist/backend_server.exe bundled_backend/
  echo "Copied backend_server.exe to bundled_backend/"
else
  cp dist/backend_server bundled_backend/
  chmod +x bundled_backend/backend_server
  echo "Copied backend_server to bundled_backend/"
fi

echo "===== Backend Build Complete ====="
echo "You can now run 'npm run dist:win' or 'npm run dist:linux' to build the Electron app."