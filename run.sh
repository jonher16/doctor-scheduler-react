#!/bin/bash
# Script to start the backend API server, the React frontend, and Nginx for local development

# Function to clean up processes on exit
cleanup() {
    echo "Stopping all services..."
    if [ -n "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    # Stop Nginx if it's running
    if [ -n "$NGINX_PID" ]; then
        kill $NGINX_PID 2>/dev/null || true
    fi
    # Remove the temporary Nginx config
    if [ -f "$TEMP_NGINX_CONF" ]; then
        rm -f "$TEMP_NGINX_CONF"
    fi
    echo "All services stopped"
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM to clean up properly
trap cleanup SIGINT SIGTERM EXIT

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "❌ Nginx is not installed. Please install it first:"
    echo "   sudo apt-get update && sudo apt-get install -y nginx"
    exit 1
fi

# Start the backend server in the background
echo "Starting the optimization server..."
cd backend

# Use correct path for Linux/Mac virtual environment
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
elif [ -f ".venv/Scripts/activate" ]; then  # Windows path
    source .venv/Scripts/activate
else
    echo "❌ Virtual environment activation script not found"
    echo "Please create a virtual environment and install dependencies:"
    echo "python -m venv .venv"
    echo "source .venv/bin/activate  # On Linux/Mac"
    echo "pip install -r requirements.txt"
    exit 1
fi

# Check for required Python packages
if ! python -c "import flask_cors" &>/dev/null; then
    echo "❌ Missing required Python package: flask_cors"
    echo "Installing required packages..."
    pip install flask-cors
fi

# Start the Flask backend
python app.py &
BACKEND_PID=$!

# Wait a bit for the server to start
sleep 3

# Check if server is running
if curl -s http://localhost:5000/api/status > /dev/null; then
    echo "✅ Optimization server running at http://localhost:5000"
else
    echo "❌ Failed to start optimization server"
    kill $BACKEND_PID
    exit 1
fi

# Modify the frontend to use a relative API URL
echo "Setting up temporary API configuration for development..."
cd ../frontend
cat > .env.local << 'EOF'
VITE_API_URL=/api
EOF

# Start the React frontend dev server in the background
echo "Starting the React frontend..."
npm run dev &
FRONTEND_PID=$!

# Wait for frontend to start
sleep 3

# Create a temporary Nginx configuration file after backend and frontend are running
TEMP_NGINX_CONF=$(mktemp)
cat > $TEMP_NGINX_CONF << 'EOF'
worker_processes 1;
error_log stderr;
pid /tmp/nginx-run.pid;
events {
    worker_connections 1024;
}
http {
    # MIME types included directly since we can't rely on include path
    types {
        text/html                                        html htm shtml;
        text/css                                         css;
        text/xml                                         xml;
        image/gif                                        gif;
        image/jpeg                                       jpeg jpg;
        application/javascript                           js;
        application/json                                 json;
        image/png                                        png;
        image/svg+xml                                    svg svgz;
        image/webp                                       webp;
        application/wasm                                 wasm;
        font/woff                                        woff;
        font/woff2                                       woff2;
    }
    
    default_type application/octet-stream;
    access_log /dev/stdout;
    sendfile on;
    keepalive_timeout 65;
    
    server {
        listen 3000;
        server_name localhost;
        
        # Proxy most requests to the Vite dev server
        location / {
            proxy_pass http://localhost:5173;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            
            # Websocket support for Vite HMR
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Proxy API requests to the Flask backend
        location /api/ {
            proxy_pass http://localhost:5000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
EOF

# Start Nginx with our config
echo "Starting Nginx reverse proxy..."
nginx -c $TEMP_NGINX_CONF -g "daemon off;" &
NGINX_PID=$!

echo "✅ Development environment ready!"
echo "📱 Access your app at http://localhost:3000"
echo "Press Ctrl+C to stop all services"

# Wait for any child to exit
wait

# Cleanup happens via the trap
