#!/bin/bash
# Script to start both the backend API server and the React frontend

# Set environment variables
export REACT_APP_API_URL="http://localhost:5000/api"

# Start the backend server in the background
echo "Starting the optimization server..."
cd backend
source .venv/Scripts/activate
python app.py &
BACKEND_PID=$!

# Wait a bit for the server to start
sleep 2

# Check if server is running
if curl -s http://localhost:5000/api/status > /dev/null; then
    echo "✅ Optimization server running at http://localhost:5000"
else
    echo "❌ Failed to start optimization server"
    kill $BACKEND_PID
    exit 1
fi

# Start the React frontend
echo "Starting the React frontend..."
cd ../frontend
npm run dev

# Clean up when the frontend is closed
kill $BACKEND_PID
echo "Stopped optimization server"