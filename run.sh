#!/bin/bash
# Script to start the backend API server, the React frontend, and Nginx for local development

# Function to check if a port is in use
check_port() {
    local port=$1
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        # Windows (Git Bash/MSYS2)
        if netstat -ano | grep -q ":$port.*LISTENING"; then
            return 0  # Port is in use
        else
            return 1  # Port is free
        fi
    else
        # Linux/macOS
        if netstat -tlnp 2>/dev/null | grep -q ":$port " || ss -tlnp 2>/dev/null | grep -q ":$port "; then
            return 0  # Port is in use
        else
            return 1  # Port is free
        fi
    fi
}

# Function to kill processes on specific ports
kill_port_processes() {
    local port=$1
    echo "Checking for processes on port $port..."
    
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        # Windows (Git Bash/MSYS2)
        local pid=$(netstat -ano | grep ":$port.*LISTENING" | awk '{print $5}' | head -1)
        if [ -n "$pid" ]; then
            echo "Killing process $pid on port $port"
            powershell "Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue" 2>/dev/null || true
            sleep 1
        fi
    else
        # Linux/macOS
        local pid=$(netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1 | head -1)
        if [ -z "$pid" ]; then
            pid=$(ss -tlnp 2>/dev/null | grep ":$port " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
        fi
        if [ -n "$pid" ] && [ "$pid" != "-" ]; then
            echo "Killing process $pid on port $port"
            kill -9 $pid 2>/dev/null || sudo kill -9 $pid 2>/dev/null || true
            sleep 1
        fi
    fi
}

# Function to clean up processes on exit
cleanup() {
    echo "Stopping all services..."
    
    # Kill background processes started by this script
    if [ -n "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
        echo "Backend stopped"
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        echo "Frontend stopped"
    fi
    
    # Stop nginx processes
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        # Windows
        powershell "Stop-Process -Name nginx -Force -ErrorAction SilentlyContinue" 2>/dev/null || true
    else
        # Linux/macOS
        pkill -f nginx 2>/dev/null || true
        # Also try to kill nginx by PID if we have it
        if [ -n "$NGINX_PID" ]; then
            kill $NGINX_PID 2>/dev/null || true
        fi
    fi
    echo "Nginx stopped"
    
    # Clean up temp files
    if [ -f "$TEMP_NGINX_CONF" ]; then
        rm -f "$TEMP_NGINX_CONF"
    fi
    
    echo "All services stopped"
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM EXIT

# Check for existing processes and offer to clean them up
echo "🔍 Checking for existing processes..."

if check_port 3000; then
    echo "⚠️  Port 3000 is already in use"
    read -p "Kill existing process on port 3000? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kill_port_processes 3000
    else
        echo "❌ Cannot continue with port 3000 in use"
        exit 1
    fi
fi

if check_port 5000; then
    echo "⚠️  Port 5000 is already in use"
    read -p "Kill existing process on port 5000? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kill_port_processes 5000
    else
        echo "❌ Cannot continue with port 5000 in use"
        exit 1
    fi
fi

if check_port 5173; then
    echo "⚠️  Port 5173 is already in use"
    read -p "Kill existing process on port 5173? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kill_port_processes 5173
    else
        echo "❌ Cannot continue with port 5173 in use"
        exit 1
    fi
fi

# Check if Nginx is installed or running on Windows
WINDOWS_NGINX_PATH="/c/nginx/nginx.exe"
IS_WINDOWS=false

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
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
        if command -v apt-get &>/dev/null; then
            echo "   sudo apt-get update && sudo apt-get install -y nginx"
        elif command -v yum &>/dev/null; then
            echo "   sudo yum install -y nginx"
        elif command -v pacman &>/dev/null; then
            echo "   sudo pacman -S nginx"
        elif command -v brew &>/dev/null; then
            echo "   brew install nginx"
        else
            echo "   Please install nginx using your system's package manager"
        fi
        exit 1
    fi
fi

# Start backend
echo "🚀 Starting the optimization server..."
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
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

cd ../frontend
cat > .env.local << 'EOF'
VITE_API_URL=/api
EOF

echo "🚀 Starting the React frontend..."
npm run dev &
FRONTEND_PID=$!
sleep 3

# Check if frontend started successfully
if check_port 5173; then
    echo "✅ Frontend server running at http://localhost:5173"
else
    echo "❌ Failed to start frontend server"
    exit 1
fi

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

    echo "🚀 Starting Nginx reverse proxy with custom config..."
    nginx -c $TEMP_NGINX_CONF -g "daemon off;" &
    NGINX_PID=$!
else
    echo "🚀 Starting Windows NGINX..."
    
    # Verify we're actually on Windows
    if [[ "$OSTYPE" != "msys" && "$OSTYPE" != "cygwin" ]]; then
        echo "❌ Windows nginx path detected but not running on Windows"
        exit 1
    fi
    
    cd /c/nginx
    
    # Stop any existing nginx processes first
    powershell "Stop-Process -Name nginx -Force -ErrorAction SilentlyContinue" 2>/dev/null || true
    sleep 1
    
    # Start nginx in the background and capture its PID
    ./nginx.exe -c "C:/Users/1999j/VSCode/doctor-scheduler-react/nginx-windows.conf" &
    NGINX_PID=$!
    
    # Give nginx time to start
    sleep 2
    
    # Check if nginx started successfully
    if check_port 3000; then
        echo "✅ Nginx reverse proxy started successfully!"
        echo "   Proxying port 3000 → Frontend (5173) + Backend API (5000)"
    else
        echo "❌ Failed to start Nginx"
        exit 1
    fi
    cd - > /dev/null
fi

echo ""
echo "🎉 Development environment ready!"
echo "📱 Access your app at http://localhost:3000"
echo "🔧 Backend API: http://localhost:5000"
echo "⚛️  Frontend Dev: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for user to stop the services
# Use a more responsive wait loop that can handle signals better
while true; do
    sleep 1
    
    # Check if any of our processes have died
    if [ -n "$BACKEND_PID" ] && ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "❌ Backend process died unexpectedly"
        break
    fi
    
    if [ -n "$FRONTEND_PID" ] && ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "❌ Frontend process died unexpectedly"
        break
    fi
    
    # For Windows nginx, we can't easily check the PID, so just check the port
    if [ "$USE_WINDOWS_NGINX" = true ]; then
        if ! check_port 3000; then
            echo "❌ Nginx process died unexpectedly"
            break
        fi
    elif [ -n "$NGINX_PID" ] && ! kill -0 $NGINX_PID 2>/dev/null; then
        echo "❌ Nginx process died unexpectedly"
        break
    fi
done
