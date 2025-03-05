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
