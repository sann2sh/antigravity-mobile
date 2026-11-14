#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Load .env if present
if [ -f "$DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$DIR/.env"
    set +a
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

print_status() {
    local tailscale_ip=""
    local lan_ip=""
    if command -v tailscale >/dev/null 2>&1; then
        tailscale_ip=$(tailscale ip -4 2>/dev/null | head -n1 || true)
    fi
    lan_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)

    local pids=""
    pids=$(pgrep -f "uvicorn backend\.main:app" 2>/dev/null || true)

    local health_ok=0
    if command -v curl >/dev/null 2>&1; then
        if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
            health_ok=1
        fi
    elif command -v python3 >/dev/null 2>&1; then
        if python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${PORT}/api/health', timeout=2)" >/dev/null 2>&1; then
            health_ok=1
        fi
    fi

    echo "=================================================="
    echo "  Antigravity Mobile Companion - Status"
    echo "=================================================="
    if [ "$health_ok" -eq 1 ]; then
        echo "  Server:    RUNNING (healthy on port ${PORT})"
    elif [ -n "$pids" ]; then
        echo "  Server:    RUNNING (PIDs: $(echo "$pids" | tr '\n' ' ' | xargs), health check did not respond on port ${PORT})"
    else
        echo "  Server:    STOPPED"
    fi

    if [ -n "$pids" ]; then
        echo "  PID(s):    $(echo "$pids" | tr '\n' ' ' | xargs)"
    fi

    if command -v systemctl >/dev/null 2>&1 && [ -f "$HOME/.config/systemd/user/mobileterminal.service" ]; then
        local svc_state
        svc_state=$(systemctl --user is-active mobileterminal.service 2>/dev/null || true)
        echo "  Systemd:   ${svc_state:-inactive} (user service)"
    fi

    echo "  Bind:      ${HOST}:${PORT}"
    if [ -n "${MOBILETERMINAL_TOKEN:-}" ]; then
        echo "  Auth:      enabled (MOBILETERMINAL_TOKEN set)"
    else
        echo "  Auth:      disabled"
    fi
    echo "  Venv:      $([ -d "$DIR/venv" ] && echo "present" || echo "missing")"
    echo "  Frontend:  $([ -d "$DIR/frontend/dist" ] && echo "built" || echo "not built")"

    if [ "$health_ok" -eq 1 ] || [ -n "$pids" ]; then
        echo ""
        echo "  URLs:"
        [ -n "$tailscale_ip" ] && echo "    Tailscale: http://${tailscale_ip}:${PORT}"
        [ -n "$lan_ip" ] && echo "    LAN:       http://${lan_ip}:${PORT}"
        echo "    Localhost: http://127.0.0.1:${PORT}"
    fi
    echo "=================================================="

    if [ "$health_ok" -eq 1 ] || [ -n "$pids" ]; then
        return 0
    fi
    return 1
}

case "${1:-}" in
    --status|-s)
        print_status
        exit $?
        ;;
    --help|-h)
        echo "Usage: ./start.sh [--status | -s | --help | -h]"
        echo "  (no args)     Start the Antigravity Mobile Companion server"
        echo "  --status, -s  Show server, systemd, auth, and URL status"
        echo "  --help, -h    Show this help message"
        exit 0
        ;;
    "")
        ;;
    *)
        echo "Unknown option: $1" >&2
        echo "Usage: ./start.sh [--status | -s | --help | -h]" >&2
        exit 1
        ;;
esac

echo "=================================================="
echo "  Starting Antigravity Mobile Companion Server..."
echo "=================================================="

# Check virtualenv
if [ ! -d "$DIR/venv" ]; then
    echo "Creating Python virtualenv..."
    python3 -m venv "$DIR/venv"
    "$DIR/venv/bin/pip" install --upgrade pip
    "$DIR/venv/bin/pip" install -r "$DIR/requirements.txt"
fi

# Build frontend if dist doesn't exist
if [ ! -d "$DIR/frontend/dist" ]; then
    echo "Building frontend..."
    (
        cd "$DIR/frontend"
        npm ci
        npm run build
    )
fi

# Detect Tailscale & LAN IPs
TAILSCALE_IP=""
if command -v tailscale >/dev/null 2>&1; then
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null | head -n1 || true)
fi
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)

echo ""
echo "📱 How to open on your phone:"
echo ""
if [ -n "$LAN_IP" ]; then
    echo "  1. Same Wi-Fi Network:"
    echo "     👉 http://${LAN_IP}:${PORT}"
    echo ""
fi
if [ -n "$TAILSCALE_IP" ]; then
    echo "  2. Anywhere / Cellular (Tailscale):"
    echo "     👉 http://${TAILSCALE_IP}:${PORT}"
    echo "     💡 Tip: Run 'tailscale serve --bg ${PORT}' for HTTPS (enables PWA 'Add to Home Screen')"
    echo ""
else
    echo "  2. From another network / outside home:"
    echo "     Install Tailscale (https://tailscale.com) on your PC and phone, then run:"
    echo "       tailscale serve --bg ${PORT}"
    echo ""
fi
echo "  3. On this computer:"
echo "     👉 http://127.0.0.1:${PORT}"

# Print terminal QR code if qrcode is available in python3
QR_URL=""
if [ -n "$TAILSCALE_IP" ]; then
    QR_URL="http://${TAILSCALE_IP}:${PORT}"
elif [ -n "$LAN_IP" ]; then
    QR_URL="http://${LAN_IP}:${PORT}"
fi

if [ -n "$QR_URL" ]; then
    "$DIR/venv/bin/python" - "$QR_URL" 2>/dev/null <<'PY' || true
import sys
try:
    import qrcode
except ImportError:
    sys.exit(0)
print("")
print(f"Scan QR code for {sys.argv[1]}:")
qr = qrcode.QRCode(border=1)
qr.add_data(sys.argv[1])
qr.make(fit=True)
qr.print_ascii(invert=True)
PY
fi

echo ""
echo "=================================================="

export PYTHONPATH="$DIR/backend"
if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
fi

exec "$DIR/venv/bin/uvicorn" backend.main:app --host "$HOST" --port "$PORT"
