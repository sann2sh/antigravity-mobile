#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=================================================="
echo "🚀 Starting Antigravity Mobile Companion Server..."
echo "=================================================="

# Check virtualenv
if [ ! -d "$DIR/venv" ]; then
    echo "Creating Python virtualenv..."
    python3 -m venv "$DIR/venv"
    "$DIR/venv/bin/pip" install --upgrade pip fastapi uvicorn websockets pydantic aiofiles
fi

# Build frontend if dist doesn't exist
if [ ! -d "$DIR/frontend/dist" ]; then
    echo "Building frontend..."
    cd "$DIR/frontend"
    npm install
    npm run build
    cd "$DIR"
fi

# Detect Tailscale IP if available
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")

echo ""
echo "📱 Access from your phone on the same Wi-Fi or Tailscale:"
if [ -n "$TAILSCALE_IP" ]; then
    echo "  👉 Tailscale URL: http://${TAILSCALE_IP}:8000"
fi
echo "  👉 Local Network: http://$(hostname -I | awk '{print $1}'):8000"
echo "  👉 Localhost:     http://127.0.0.1:8000"
echo ""
echo "💡 Tip on Phone: Open the URL in Safari or Chrome and tap"
echo "   'Add to Home Screen' to run it as a full-screen PWA!"
echo "=================================================="

export PYTHONPATH="$DIR/backend"
exec "$DIR/venv/bin/uvicorn" main:app --host 0.0.0.0 --port 8000
