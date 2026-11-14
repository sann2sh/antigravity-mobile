#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

AUTO_YES=0
KEEP_ENV=0

for arg in "$@"; do
    case "$arg" in
        --yes|-y)
            AUTO_YES=1
            ;;
        --keep-env)
            KEEP_ENV=1
            ;;
        --help|-h)
            echo "Usage: ./uninstall.sh [--yes | -y] [--keep-env] [--help | -h]"
            echo "  --yes, -y    Skip confirmation prompts (removes .env unless --keep-env is set)"
            echo "  --keep-env   Keep .env configuration file"
            echo "  --help, -h   Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg" >&2
            echo "Usage: ./uninstall.sh [--yes | -y] [--keep-env] [--help | -h]" >&2
            exit 1
            ;;
    esac
done

# Load .env if present to get PORT
if [ -f "$DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$DIR/.env"
    set +a
fi
PORT="${PORT:-8000}"

echo "=================================================="
echo "  Antigravity Mobile Companion - Uninstaller"
echo "=================================================="

if [ "$AUTO_YES" -eq 0 ]; then
    read -r -p "Stop server, remove systemd user service, venv, and frontend build artifacts? [y/N] " reply
    case "$reply" in
        [yY]|[yY][eE][sS])
            ;;
        *)
            echo "Uninstall cancelled."
            exit 0
            ;;
    esac
fi

# 1. Stop systemd user service if installed
USER_SERVICE="$HOME/.config/systemd/user/mobileterminal.service"
if command -v systemctl >/dev/null 2>&1; then
    if systemctl --user list-unit-files mobileterminal.service >/dev/null 2>&1 || [ -f "$USER_SERVICE" ]; then
        echo "Stopping and disabling systemd user service..."
        systemctl --user stop mobileterminal.service 2>/dev/null || true
        systemctl --user disable mobileterminal.service 2>/dev/null || true
    fi
fi

if [ -f "$USER_SERVICE" ]; then
    rm -f "$USER_SERVICE"
    echo "Removed $USER_SERVICE"
    if command -v systemctl >/dev/null 2>&1; then
        systemctl --user daemon-reload 2>/dev/null || true
    fi
fi

# 2. Stop any running uvicorn process or port listener
if pgrep -f "uvicorn backend\.main:app" >/dev/null 2>&1; then
    echo "Stopping running server process..."
    pkill -f "uvicorn backend\.main:app" 2>/dev/null || true
fi
if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
fi

# 3. Remove generated environment and build artifacts
for path in "$DIR/venv" "$DIR/frontend/node_modules" "$DIR/frontend/dist" "$DIR/backend/__pycache__"; do
    if [ -e "$path" ]; then
        rm -rf "$path"
        echo "Removed $path"
    fi
done

# 4. Handle .env
if [ -f "$DIR/.env" ] && [ "$KEEP_ENV" -eq 0 ]; then
    if [ "$AUTO_YES" -eq 1 ]; then
        rm -f "$DIR/.env"
        echo "Removed $DIR/.env"
    else
        read -r -p "Also remove .env configuration file? [y/N] " env_reply
        case "$env_reply" in
            [yY]|[yY][eE][sS])
                rm -f "$DIR/.env"
                echo "Removed $DIR/.env"
                ;;
            *)
                echo "Kept $DIR/.env"
                ;;
        esac
    fi
fi

echo ""
echo "=================================================="
echo "  Uninstall complete!"
echo "=================================================="
echo "Source files in $DIR were preserved."
echo "To delete the repository completely, run:"
echo "  rm -rf \"$DIR\""
echo ""
