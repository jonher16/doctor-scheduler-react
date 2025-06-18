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
    if [ -n "$NGINX_PID" ]; then
        kill $NGINX_PID 2>/dev/null || true
    fi
    if [ -f "$TEMP_NGINX_CONF" ]; then
        rm -f "$TEMP_NGINX_CONF"
    fi
    echo "All services stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Check if Nginx is installed or running on Windows
WINDOWS_NGINX_PATH="/c/nginx/nginx.exe"
IS_WINDOWS=false

if [[ "$OS" == "Windows_NT" ]]; then
    IS_WINDOWS=true
fi

if ! command -v nginx &>/dev/null; then
    if [ "$IS_WINDOWS" = true ]; then
        if [ ! -f "$WINDOWS_NGINX_PATH" ]; then
            echo "❌ Nginx not found at default path: $WINDOWS_NGINX_PATH"
            echo "Please install NGINX for Windows in C:\\nginx"
            exit 1
        fi
        echo "✅ Nginx (Windows) detected at $WINDOWS_NGINX_PATH"
        USE_WINDOWS_NGINX=true
    else
        echo "❌ Nginx is not installed. Please install it first:"
        echo "   sudo apt-get update && sudo apt-get install -y nginx"
        exit 1
    fi
fi

# Start backend
echo "Starting the optimization server..."
cd backend

if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
elif [ -f ".venv/Scripts/activate" ]; then
    source .venv/Scripts/activate
else
    echo "❌ Virtual environment activation script not found"
    echo "Please create a virtual environment and install dependencies:"
    echo "python -m venv .venv"
    echo "source .venv/bin/activate  # On Linux/Mac"
    echo "pip install -r requirements.txt"
    exit 1
fi

if ! python -c "import flask_cors" &>/dev/null; then
    echo "❌ Missing required Python package: flask_cors"
    echo "Installing required packages..."
    pip install flask-cors
fi

python app.py &
BACKEND_PID=$!
sleep 3

if curl -s http://localhost:5000/api/status > /dev/null; then
    echo "✅ Optimization server running at http://localhost:5000"
else
    echo "❌ Failed to start optimization server"
    kill $BACKEND_PID
    exit 1
fi

cd ../frontend
cat > .env.local << 'EOF'
VITE_API_URL=/api
EOF

echo "Starting the React frontend..."
npm run dev &
FRONTEND_PID=$!
sleep 3

# Prepare nginx conf only for Linux/macOS (not Windows-native NGINX)
if [ "$USE_WINDOWS_NGINX" != true ]; then
    TEMP_NGINX_CONF=$(mktemp)
    cat > $TEMP_NGINX_CONF << 'EOF'
worker_processes 1;
error_log stderr;
pid /tmp/nginx-run.pid;
events {
    worker_connections 1024;
}
http {
    types {
        text/html html htm shtml;
        text/css css;
        text/xml xml;
        image/gif gif;
        image/jpeg jpeg jpg;
        application/javascript js;
        application/json json;
        image/png png;
        image/svg+xml svg svgz;
        image/webp webp;
        application/wasm wasm;
        font/woff woff;
        font/woff2 woff2;
    }

    default_type application/octet-stream;
    access_log /dev/stdout;
    sendfile on;
    keepalive_timeout 65;

    server {
        listen 3000;
        server_name localhost;

        location / {
            proxy_pass http://localhost:5173;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_cache_bypass \$http_upgrade;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        location /api/ {
            proxy_pass http://localhost:5000;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
    }
}
EOF

    echo "Starting Nginx reverse proxy with custom config..."
    nginx -c $TEMP_NGINX_CONF -g "daemon off;" &
    NGINX_PID=$!
else
    echo "Starting Windows NGINX from $WINDOWS_NGINX_PATH..."
    cd /c/nginx
    ./nginx.exe -c "C:/Users/1999j/VSCode/doctor-scheduler-react/nginx-windows.conf"
    if [ $? -eq 0 ]; then
        echo "✅ Nginx reverse proxy started successfully!"
        echo "   Proxying port 3000 → Frontend (5173) + Backend API (5000)"
    else
        echo "❌ Failed to start Nginx"
        exit 1
    fi
    cd - > /dev/null
fi

echo "✅ Development environment ready!"
echo "📱 Access your app at http://localhost:3000"
echo "Press Ctrl+C to stop all services"

wait
