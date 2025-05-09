#!/bin/bash
# Script to export the doctor-scheduler Docker image to a tar file

# Set image name and output filename
IMAGE_NAME="doctor-scheduler"
OUTPUT_FILE="doctor-scheduler-image.tar"

echo "Saving Docker image '$IMAGE_NAME' to '$OUTPUT_FILE'..."
docker save -o $OUTPUT_FILE $IMAGE_NAME

# Check if the export was successful
if [ $? -eq 0 ]; then
  # Get the file size for reporting
  FILE_SIZE=$(du -h $OUTPUT_FILE | cut -f1)
  echo "Success! Docker image exported to '$OUTPUT_FILE' (Size: $FILE_SIZE)"
  echo "You can transfer this file to another machine and load it with:"
  echo "docker load -i $OUTPUT_FILE"
else
  echo "Error: Failed to export Docker image."
  exit 1
fi 