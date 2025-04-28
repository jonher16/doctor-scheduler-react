#!/usr/bin/env bash
set -e

# ─── Start backend ───────────────────────────────────────
cd /app/backend
source .venv/bin/activate
python3 app.py &

# ─── Serve built frontend ───────────────────────────────
cd /app/frontend
serve -s dist -l 3000
