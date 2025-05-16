# ─── Frontend build ─────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

# install deps
COPY frontend/package*.json ./
RUN npm ci

# bring in source + env (so Vite bakes your Firebase keys)
COPY frontend/.env ./
COPY frontend/ ./

# build!
RUN npm run build  # outputs ./dist

# ─── Backend build ──────────────────────────────────────
FROM node:20-slim AS backend-builder

# install Python & venv tools
RUN apt-get update && apt-get install -y python3 python3-venv \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /backend

COPY backend/requirements.txt ./
RUN python3 -m venv .venv \
  && . .venv/bin/activate \
  && pip install --no-cache-dir -r requirements.txt

# copy your code
COPY backend/ ./

# ─── Runtime image ──────────────────────────────────────
FROM node:20-slim

# Install Python, Nginx & other tools
RUN apt-get update && apt-get install -y python3 python3-venv python3-pip python3-full nginx \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# bring in built frontend + backend
COPY --from=frontend-builder /frontend/../dist ./frontend/dist
COPY --from=backend-builder  /backend         ./backend

# Create Python virtual environment and install backend dependencies
WORKDIR /app/backend
RUN python3 -m venv .venv \
  && . .venv/bin/activate \
  && pip install --no-cache-dir --break-system-packages -r requirements.txt

# Reset working directory
WORKDIR /app

# entrypoint
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000 5000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
