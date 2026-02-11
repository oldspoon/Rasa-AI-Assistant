#!/usr/bin/env bash
# =============================================================================
# dev-run.sh - development runner for the attendance-bot web chat (React/Vite).
#
# Usage (run from this folder):
#   ./dev-run.sh -r -localhost   start the Vite dev server for http://localhost:5173
#   ./dev-run.sh -r -p 5174      same, on a custom port
#   ./dev-run.sh -stop           stop the dev server on port 5173 (or the -p port)
#   ./dev-run.sh --setup         install the npm dependencies
#   ./dev-run.sh -h              show this help
#
# -localhost serves the page for this machine only (also the default).
# The page reaches Rasa through the Vite proxy in vite.config.js
# (/api -> http://localhost:5005), so the browser stays same-origin - the
# Rasa side needs no CORS setup.
#
# For the bot to actually answer, the other two projects must be running:
#   ../action_server/dev-run.sh -r      the custom actions + SQLite database
#   ../rasa/dev-run.sh -r               the Rasa server (lives in that shell)
#
# On Windows, run this with Git Bash.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="run"
HOST="localhost"
PORT="${WEB_PORT:-5173}"

usage() {
    cat <<'EOF'
Usage: ./dev-run.sh [options]

  -r, --run        start the Vite dev server on port 5173 (default action);
                   it stays attached to this terminal (Ctrl+C stops it)
  -localhost       serve the page on localhost only (default; explicit flag)
  -p, --port N     listen on port N instead of 5173
  -stop, --stop    stop the dev server on port 5173 (or on the -p / WEB_PORT
                   port) - works also for a server started in another terminal
      --setup      install the npm dependencies (npm install)
  -h, --help       show this help

The page is served at http://localhost:5173 and talks to the Rasa REST
channel through a dev-server proxy (/api -> http://localhost:5005).
Start the Rasa server with: ../rasa/dev-run.sh -r
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -r|--run)       MODE="run"; shift ;;
        -localhost|--localhost) HOST="localhost"; shift ;;
        -p|--port)      PORT="${2:?usage: -p needs a port number}"; shift 2 ;;
        -stop|--stop)   MODE="stop"; shift ;;
        --setup)        MODE="setup"; shift ;;
        -h|--help)      usage ;;
        *) echo "dev-run.sh: unknown option '$1'" >&2; echo "Try './dev-run.sh -h' for help." >&2; exit 2 ;;
    esac
done

# --- process helpers ----------------------------------------------------------
is_windows() {
    case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*) return 0 ;;
        *) return 1 ;;
    esac
}

# Print the PIDs listening on a TCP port, one per line.
listening_pids() {
    local port="$1"
    if is_windows; then
        netstat -ano | tr -d '\r' \
            | awk -v suffix=":$port" '$1 == "TCP" && $4 == "LISTENING" && $2 ~ suffix "$" { print $5 }' \
            | sort -u
    else
        lsof -ti "tcp:$port" 2>/dev/null | sort -u
    fi
}

# Stop everything listening on a TCP port. $1 = port, $2 = friendly name.
stop_port() {
    local port="$1" name="$2" pids pid
    pids="$(listening_pids "$port")"
    if [[ -z "$pids" ]]; then
        echo "==> Nothing is listening on port $port - $name is not running."
        return 0
    fi
    echo "==> Stopping $name (port $port)"
    for pid in $pids; do
        if is_windows; then
            taskkill //F //PID "$pid" >/dev/null 2>&1 || true
        else
            kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
        fi
        echo "    stopped process $pid"
    done
    sleep 1
    if [[ -n "$(listening_pids "$port")" ]]; then
        echo "!! Something is still listening on port $port - stop it manually." >&2
        return 1
    fi
    echo "==> Port $port is free."
}

if [[ "$MODE" == "stop" ]]; then
    stop_port "$PORT" "Web chat (Vite)"
    exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "!! npm was not found - install Node.js first: https://nodejs.org" >&2
    exit 1
fi

if [[ "$MODE" == "setup" ]]; then
    echo "==> Installing npm dependencies (node $(node --version))"
    npm install
    echo "==> Done. Start with: ./dev-run.sh -r -localhost"
    exit 0
fi

if [[ ! -d node_modules ]]; then
    echo "!! node_modules is missing - run './dev-run.sh --setup' first." >&2
    exit 1
fi

echo "==> Starting the web chat (Vite dev server)"
echo "    URL:     http://localhost:$PORT  (localhost only)"
echo "    Rasa:    /api is proxied to http://localhost:5005"
echo "    Actions: ../action_server/dev-run.sh -r must be running for custom actions"
echo "    node:    $(node --version)"
echo "    (Ctrl+C stops it here - './dev-run.sh -stop' works from anywhere)"
echo
exec npm run dev -- --host "$HOST" --port "$PORT"
