#!/bin/bash
# Script to run the containerized doctor scheduler application

# Function to clean up on exit
cleanup() {
    echo "Stopping containers..."
    docker-compose down
    echo "Containers stopped."
    exit 0
}

# Trap signals for clean exit
trap cleanup SIGINT SIGTERM

# Check if docker and docker-compose are installed
if ! command -v docker &> /dev/null || ! command -v docker-compose &> /dev/null; then
    echo "Error: Docker and/or docker-compose are not installed."
    echo "Please install Docker and docker-compose to use this script."
    exit 1
fi

# Build and start the containers
echo "Building and starting the application containers..."
docker-compose up --build

# The script will wait here until docker-compose is terminated
# Then the cleanup function will be called automatically 