#!/usr/bin/env bash
set -e

# ─── Start backend ───────────────────────────────────────
cd /app/backend
source .venv/bin/activate
python3 app.py &

# ─── Start Nginx to serve frontend and proxy API requests ───
# Remove default Nginx config if it exists
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
fi

# Start Nginx in the foreground
nginx -g "daemon off;"
