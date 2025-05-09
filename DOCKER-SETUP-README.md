# Docker Setup Instructions

This document provides instructions for exporting the Doctor Scheduler Docker image and deploying it on another machine.

## For Developers: Exporting the Docker Image

1. Make sure the Docker image has been built successfully:
   ```
   docker build -t doctor-scheduler .
   ```

2. Run the export script to create a portable tar file:
   ```
   chmod +x export-docker-image.sh
   ./export-docker-image.sh
   ```

3. This will create a file called `doctor-scheduler-image.tar` that you can transfer to the target machine.

4. Copy both the `doctor-scheduler-image.tar` file and the `setup-docker-windows.bat` script to a USB drive or cloud storage for deployment.

## For End Users (Windows): Installing and Running the Application

### Prerequisites:
- Windows 10 (64-bit) or Windows 11
- Administrative privileges on your computer
- At least 4GB of RAM (8GB recommended)
- Internet connection for the initial setup

### Installation Steps:

1. Copy the `doctor-scheduler-image.tar` file and the `setup-docker-windows.bat` script to the same folder on your computer.

2. Double-click on the `setup-docker-windows.bat` file to run it.

3. The script will:
   - Check if Docker Desktop is already installed
   - If not, it will download and install Docker Desktop for you
   - After installation, you'll need to restart your computer
   - After restarting, run the script again to load the Docker image and start the application

4. Once the application is running, you can access it by opening your web browser and going to:
   ```
   http://localhost:3000
   ```

5. The application will continue running in the background. To stop it, you can run:
   ```
   docker stop doctor-scheduler
   ```

6. To start it again later, you can run:
   ```
   docker start doctor-scheduler
   ```

## Troubleshooting

- If Docker Desktop fails to start, make sure virtualization is enabled in your BIOS settings.
- If you see an error about WSL 2, follow the prompts to install the WSL 2 Linux kernel update.
- If the browser shows "Connection refused" when accessing localhost:3000, wait a minute for the application to fully start, then try again.
- For any other issues, please contact technical support. 