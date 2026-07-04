#!/usr/bin/env bash
# tidemail launcher for macOS/Linux — sets up everything on first run, then starts the app.
set -e
cd "$(dirname "$0")"

echo "=== tidemail ==="

PY="venv/bin/python"

# 1) Python virtual environment + backend deps
if [ ! -x "$PY" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv venv
  echo "Installing backend dependencies..."
  "$PY" -m pip install --upgrade pip >/dev/null
  "$PY" -m pip install -r requirements.txt
fi

# 2) Frontend build (needs Node.js)
if [ ! -f "frontend/dist/browser/index.html" ]; then
  echo "Building the interface..."
  ( cd frontend && { [ -d node_modules ] || npm install; } && npm run build )
fi

# 3) Run
echo "Starting tidemail at http://127.0.0.1:8000 ..."
exec "$PY" backend/app.py
