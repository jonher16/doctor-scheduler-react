@echo off
setlocal enabledelayedexpansion

echo ====================================================
echo   Doctor Scheduler Docker Setup
echo ====================================================
echo.

:: Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Docker is already installed on your system.
) else (
    echo Docker Desktop is not installed on your system.
    echo.
    echo This script will download and install Docker Desktop for Windows.
    echo.
    echo Please note:
    echo  - You need administrator privileges for installation
    echo  - Your computer will need to restart after installation
    echo  - WSL 2 will be installed if not already present
    echo.
    choice /C YN /M "Do you want to proceed with downloading and installing Docker Desktop? (Y/N)"
    if !errorlevel! equ 2 (
        echo Installation cancelled by user.
        goto end
    )
    
    :: Download Docker Desktop installer
    echo.
    echo Downloading Docker Desktop installer...
    powershell -Command "& {Invoke-WebRequest -Uri 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe' -OutFile '%TEMP%\DockerDesktopInstaller.exe'}"
    
    echo.
    echo Starting Docker Desktop installation...
    echo After installation completes, you'll need to restart your computer.
    echo Then run this script again to load the Docker image.
    echo.
    
    :: Run the installer
    start "" "%TEMP%\DockerDesktopInstaller.exe"
    echo Please complete the installation and restart your computer.
    echo After restart, run this script again to continue setup.
    goto end
)

:: Check if Docker service is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker service is not running.
    echo.
    echo Please start Docker Desktop from your Start menu and wait for it to fully initialize.
    echo Once Docker Desktop is running, run this script again.
    goto end
)

:: Check if the Docker image file exists
echo.
set "IMAGE_FILE=doctor-scheduler-image.tar"
if not exist "%IMAGE_FILE%" (
    echo Error: Docker image file "%IMAGE_FILE%" not found in the current directory.
    echo Please make sure the file is in the same folder as this script.
    goto end
)

:: Load the Docker image
echo Loading Docker image from "%IMAGE_FILE%"...
docker load -i "%IMAGE_FILE%"
if %errorlevel% neq 0 (
    echo Error loading Docker image.
    goto end
)

:: Stop any existing instances of the container
echo Stopping any running instances of the doctor-scheduler container...
docker stop doctor-scheduler 2>nul
docker rm doctor-scheduler 2>nul

:: Run the container
echo.
echo Starting the Doctor Scheduler application...
docker run -d --name doctor-scheduler -p 3000:3000 -p 5000:5000 doctor-scheduler
if %errorlevel% neq 0 (
    echo Error starting the container.
    goto end
)

echo.
echo ====================================================
echo   Success! The Doctor Scheduler is now running.
echo.
echo   You can access it at: http://localhost:3000
echo ====================================================
echo.
echo To stop the application, you can run:
echo docker stop doctor-scheduler
echo.
echo To start it again later, you can run:
echo docker start doctor-scheduler
echo.

:end
pause 