#!/bin/bash
# Complete build script for Hospital Scheduler with self-contained backend

# Function to check if command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Print header
echo "===================================="
echo "Hospital Scheduler - Complete Build"
echo "===================================="

# Check requirements
if ! command_exists npm; then
  echo "❌ npm is required but not installed"
  exit 1
fi

if ! command_exists python || ! command_exists python3; then
  echo "❌ Python is required for bundling the backend (only needed for build, not for end users)"
  exit 1
fi

# Set Python command
PYTHON_CMD="python3"
if ! command_exists python3; then
  PYTHON_CMD="python"
fi

# Create the bundler script
echo "📝 Creating backend bundler script..."
cat > bundle_backend.py << 'EOL'
#!/usr/bin/env python
"""
Comprehensive backend bundler that creates a standalone executable with all dependencies.
No Python installation required on target machines.
"""
import os
import sys
import subprocess
import platform
import shutil

def check_dependencies():
    """Install PyInstaller and other dependencies needed for bundling."""
    print("Checking and installing bundling dependencies...")
    
    try:
        # First try to import PyInstaller
        import PyInstaller
        print("PyInstaller is already installed.")
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "PyInstaller"])
    
    # Install backend dependencies
    requirements_file = os.path.join("backend", "requirements.txt")
    if os.path.exists(requirements_file):
        print("Installing backend dependencies...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", requirements_file])
    else:
        print(f"Warning: Could not find {requirements_file}")
        # Install the core dependencies manually
        core_deps = ["flask==2.3.3", "flask-cors==4.0.0", "ortools==9.8.3296", 
                    "gunicorn==21.2.0", "pulp==3.0.2"]
        for dep in core_deps:
            print(f"Installing {dep}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", dep])
    
    print("All dependencies installed!")

def build_backend():
    """Build the backend server into a standalone executable."""
    print("\nBuilding standalone backend executable...")
    
    # Determine platform-specific settings
    is_windows = platform.system() == "Windows"
    output_name = "backend_server.exe" if is_windows else "backend_server"
    icon_option = []
    
    # Check for icon file
    if is_windows and os.path.exists("build/icon.ico"):
        icon_option = ["--icon", "build/icon.ico"]
    elif not is_windows and os.path.exists("build/icon.png"):
        icon_option = ["--icon", "build/icon.png"]
    
    # Create a temp directory for the build
    os.makedirs("temp_backend", exist_ok=True)
    
    # Create a small Flask server wrapper to handle imports properly
    wrapper_path = os.path.join("temp_backend", "server_wrapper.py")
    with open(wrapper_path, "w") as f:
        f.write("""#!/usr/bin/env python
# Wrapper script for the Flask backend server
import os
import sys
import importlib.util

# Add the backend directory to the path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if os.path.exists(backend_dir):
    sys.path.insert(0, backend_dir)

# Import and run the Flask app
from app import app

if __name__ == "__main__":
    # Run the app on localhost:5000
    app.run(host="0.0.0.0", port=5000)
""")
    
    # Copy the backend files to the temp directory
    backend_temp_dir = os.path.join("temp_backend", "backend")
    os.makedirs(backend_temp_dir, exist_ok=True)
    
    for item in os.listdir("backend"):
        source = os.path.join("backend", item)
        destination = os.path.join(backend_temp_dir, item)
        
        if os.path.isfile(source):
            shutil.copy2(source, destination)
        elif os.path.isdir(source):
            if item not in ["__pycache__", "dist", "build"]:
                shutil.copytree(source, destination, dirs_exist_ok=True)
    
    # Remove any existing build/dist directories in the temp directory
    for cleanup_dir in [os.path.join("temp_backend", "build"), 
                         os.path.join("temp_backend", "dist")]:
        if os.path.exists(cleanup_dir):
            shutil.rmtree(cleanup_dir)
    
    # Build the executable
    build_command = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--clean",
        f"--name={output_name}",
        "--hidden-import=flask",
        "--hidden-import=flask_cors",
        "--hidden-import=ortools",
        "--hidden-import=pulp",
    ]
    
    # Add icon if available
    if icon_option:
        build_command.extend(icon_option)
    
    # Specify the wrapper script
    build_command.append(wrapper_path)
    
    # Run PyInstaller
    print("Running PyInstaller with command:")
    print(" ".join(build_command))
    subprocess.check_call(build_command, cwd="temp_backend")
    
    # Move the executable to bundled_backend
    os.makedirs("bundled_backend", exist_ok=True)
    source_exe = os.path.join("temp_backend", "dist", output_name)
    dest_exe = os.path.join("bundled_backend", output_name)
    
    if os.path.exists(source_exe):
        # Remove existing executable if it exists
        if os.path.exists(dest_exe):
            os.remove(dest_exe)
        
        # Copy the new executable
        shutil.copy2(source_exe, dest_exe)
        print(f"\n✅ Successfully created standalone executable at: {dest_exe}")
        
        # Make it executable on Unix-like systems
        if not is_windows:
            os.chmod(dest_exe, 0o755)
        
        # Clean up temp directories
        shutil.rmtree("temp_backend")
        
        return True
    else:
        print(f"\n❌ Error: Could not find executable at {source_exe}")
        return False

def main():
    """Main function to orchestrate the build process."""
    print("=" * 60)
    print("Hospital Scheduler - Backend Bundler")
    print("=" * 60)
    print(f"Python: {sys.executable}")
    print(f"Platform: {platform.system()}")
    print("=" * 60)
    
    # Check and install dependencies
    check_dependencies()
    
    # Build the backend executable
    success = build_backend()
    
    if success:
        print("\n✅ Backend bundled successfully!")
        print("You can now build the Electron app with this bundled backend.")
    else:
        print("\n❌ Failed to bundle backend.")
        sys.exit(1)

if __name__ == "__main__":
    main()
EOL

# Make the bundler script executable
chmod +x bundle_backend.py

# Run the bundler script
echo "🐍 Creating standalone Python backend executable..."
$PYTHON_CMD bundle_backend.py

# Check if bundling was successful
if [ $? -ne 0 ]; then
  echo "❌ Backend bundling failed. Aborting packaging."
  exit 1
fi

# Check if backend executable exists
BACKEND_EXE="bundled_backend/backend_server"
if [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32" ]]; then
  BACKEND_EXE="bundled_backend/backend_server.exe"
fi

if [ ! -f "$BACKEND_EXE" ]; then
  echo "❌ Backend executable not found at $BACKEND_EXE"
  exit 1
fi

echo "✅ Backend executable created successfully at $BACKEND_EXE"

# Update main.js to use the standalone executable
echo "📝 Updating main.js to use the standalone executable..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the React application
echo "🔨 Building React application..."
npx vite build

# Check if build was successful
if [ $? -ne 0 ]; then
  echo "❌ React build failed. Aborting packaging."
  exit 1
fi

# Create a verification file
echo "This file helps verify that resources are correctly included in the build." > bundled_backend/VERIFY.txt

# Update package.json to include copy-defaults.js in the build
echo "📝 Updating package.json..."
sed -i 's/"files": \[/"files": \[\n    "copy-defaults.js",/' package.json 2>/dev/null || true

# Package for Windows (NSIS installer)
echo "📦 Packaging for Windows (NSIS installer)..."
npm run dist:win

# Package for Linux (AppImage)
echo "📦 Packaging for Linux (AppImage)..."
npm run dist:linux

echo "✅ Build complete!"
echo "You can find the packaged applications in the release directory."