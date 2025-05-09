# Doctor Scheduler - Docker Edition

This application has been containerized for easy deployment and operation.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed on your computer

## Running the Application

### First-time Setup

1. **Open Docker Desktop** application
2. **Import the application**:
   - Click on "Add Application" or "Images" in Docker Desktop
   - Choose "Import" option
   - Browse to the location where you've saved the doctor-scheduler Docker image (.tar file)
   - Select the file and click "Import"

### Starting the Application

1. **Open Docker Desktop**
2. Go to the "Containers" tab
3. Find "doctor-scheduler" container
4. If not running, click the ▶ (play) button next to the container
5. The application will now start automatically

### Accessing the Application

Once the container is running:
- Frontend interface: [http://localhost:3000](http://localhost:3000)
- API backend: [http://localhost:5000](http://localhost:5000)

### Stopping the Application

1. In Docker Desktop, go to the "Containers" tab
2. Find "doctor-scheduler" container
3. Click the ⏹ (stop) button next to the container

## Data Persistence

Your application data is stored in a Docker volume called `doctor-scheduler-data`. This means:
- Your data will persist even when the container is stopped
- Your data will persist across Docker Desktop restarts
- If you delete the container, make sure not to delete the volume if you want to keep your data

## Troubleshooting

If the application isn't working properly:

1. Check container logs in Docker Desktop:
   - Click on the "doctor-scheduler" container
   - Select the "Logs" tab to view application output

2. Restart the container:
   - Stop the container
   - Start it again using the play button

3. Rebuild the container (if you have the Dockerfile):
   - Open a terminal in the application directory
   - Run: `docker-compose build --no-cache`
   - Run: `docker-compose up -d` 