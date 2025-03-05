# Hospital Staff Scheduler - Electron Desktop Application

This is an Electron-based desktop application version of the Hospital Staff Scheduler. It packages both the React frontend and the Python backend into a single installable application that can be run on Windows and Linux.

## Features

- All features of the web-based Hospital Staff Scheduler
- Runs as a native desktop application
- Automatically starts the Python backend server
- Monitors backend status and provides easy restart functionality
- Can be installed without requiring separate setup of web servers

## Requirements

- Node.js 16+ (for development only)
- Python 3.8+ (required on the target system)
- Required Python packages: `flask`, `flask-cors`, etc. (see backend/requirements.txt)

## Development Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/hospital-scheduler.git
   cd hospital-scheduler
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up Python virtual environment (optional but recommended):
   ```
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cd ..
   ```

4. Start the development version:
   ```
   npm run dev
   ```

   This will start both the Vite dev server and the Electron app in development mode.

## Building for Production

### Prerequisites

- For Windows builds on Linux/macOS, you need Wine
- For better icon conversion, ImageMagick is recommended

### Build Steps

1. Create application icons:
   - Place a 1024x1024 PNG icon in `build/icon.png`
   - For Windows, you can also provide `build/icon.ico`

2. Run the build script:
   ```
   chmod +x build.sh
   ./build.sh
   ```

   Or you can run the build commands manually:

   ```
   # Build React app
   npm run build
   
   # Package for Windows
   npm run dist:win
   
   # Package for Linux
   npm run dist:linux
   
   # Package for both
   npm run dist:all
   ```

3. Find the packaged applications in the `release` directory.

## Running the Application

### Windows

1. Run the installer (`.exe` file in the `release` directory)
2. The application will be installed and a shortcut created
3. Python must be installed and accessible in the PATH

### Linux

1. Make the AppImage file executable:
   ```
   chmod +x HospitalScheduler-*.AppImage
   ```

2. Run the AppImage:
   ```
   ./HospitalScheduler-*.AppImage
   ```

3. Python must be installed and accessible in the PATH

## Backend Management

- The application will automatically start and manage the Python backend server
- If the backend crashes, you will be notified and given the option to restart it
- You can access backend logs and controls from the "Backend Status" button in the bottom right corner

## Troubleshooting

- **Backend Not Starting**: Ensure Python is installed and in the PATH
- **Backend Errors**: Check the logs in the Backend Status panel
- **Application Not Starting**: Look for log files in:
  - Windows: `%APPDATA%/hospital-scheduler/logs`
  - Linux: `~/.config/hospital-scheduler/logs`

## License

This project is licensed under the MIT License - see the LICENSE file for details.