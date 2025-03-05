#!/bin/bash
# Linux launcher for backend
echo "Starting Hospital Scheduler Backend..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python is not installed"
    echo "Please install Python 3.8 or higher"
    exit 1
fi

# Get the directory where this script resides
BACKEND_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Run the backend
python3 "${BACKEND_DIR}/app.py"
exit $?
