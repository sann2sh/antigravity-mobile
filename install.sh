#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

AUTO_START=0

for arg in "$@"; do
    case "$arg" in
        --start|-s)
            AUTO_START=1
            ;;
        --help|-h)
            echo "Usage: ./install.sh [--start | -s | --help | -h]"
            echo "  --start, -s  Automatically start the server after installation finishes"
            echo "  --help, -h   Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg" >&2
            echo "Usage: ./install.sh [--start | -s | --help | -h]" >&2
            exit 1
            ;;
    esac
done

echo "=================================================="
echo "  Antigravity Mobile Companion - Installer"
echo "=================================================="

# Check required tools
for cmd in python3 node npm; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Error: '$cmd' is required but was not found on PATH." >&2
        exit 1
    fi
done

if ! command -v agy >/dev/null 2>&1; then
    echo "Warning: 'agy' CLI was not found on PATH."
    echo "  Agent features require Antigravity IDE / 'agy' CLI (or set AGY_BIN in .env)."
fi

# Create Python virtual environment if missing and install dependencies
if [ ! -d "$DIR/venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$DIR/venv"
fi

echo "Installing Python dependencies..."
"$DIR/venv/bin/pip" install --upgrade pip
"$DIR/venv/bin/pip" install -r "$DIR/requirements.txt"

# Build frontend
echo "Installing frontend dependencies and building..."
(
    cd "$DIR/frontend"
    npm ci
    npm run build
)

# Initialize .env if missing
if [ ! -f "$DIR/.env" ]; then
    cp "$DIR/.env.example" "$DIR/.env"
    echo "Created .env from .env.example."
else
    echo ".env already exists; leaving it untouched."
fi

echo ""
echo "=================================================="
echo "  Installation complete!"
echo "=================================================="
echo ""

if [ "$AUTO_START" -eq 1 ]; then
    echo "Starting server now..."
    echo ""
    exec "$DIR/start.sh"
fi

echo "Next steps:"
echo "  1. (Optional) Edit .env to configure PORT, DEFAULT_WORKSPACE, or MOBILETERMINAL_TOKEN."
echo "  2. Start the server:"
echo "       ./start.sh"
echo ""
echo "Optional systemd setup:"
echo "  1. Copy mobileterminal.service.example to ~/.config/systemd/user/mobileterminal.service"
echo "  2. Replace <USER> and <INSTALL_DIR> ($DIR) in the unit file."
echo "  3. Enable and start:"
echo "       systemctl --user daemon-reload"
echo "       systemctl --user enable --now mobileterminal.service"
echo ""
