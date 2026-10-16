#!/usr/bin/env bash
# =============================================================================
# dev-run.sh - development runner for the attendance-bot action server.
#
# Usage (run from this folder):
#   ./dev-run.sh -r           start the action server (default port 5055)
#   ./dev-run.sh -r -p 5056   start it on a custom port
#   ./dev-run.sh --setup      create .venv and install requirements.txt
#   ./dev-run.sh -h           show this help
#
# On Windows, run this with Git Bash, or use .\dev-run.ps1 instead.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${ACTION_PORT:-5055}"
MODE="run"

usage() {
    cat <<'EOF'
Usage: ./dev-run.sh [options]

  -r, --run        start the action server on port 5055 (default action)
  -p, --port N     listen on port N instead of 5055
      --setup      create a virtual environment (.venv) and install
                   requirements.txt into it
  -h, --help       show this help

The server is started with --auto-reload, so changes to actions.py are
picked up on the next request without restarting anything.
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -r|--run)   MODE="run"; shift ;;
        -p|--port)  PORT="${2:?usage: -p needs a port number}"; shift 2 ;;
        --setup)    MODE="setup"; shift ;;
        -h|--help)  usage ;;
        *) echo "dev-run.sh: unknown option '$1'" >&2; echo "Try './dev-run.sh -h' for help." >&2; exit 2 ;;
    esac
done

# --- locate a Python interpreter ---------------------------------------------
find_python() {
    local candidate
    for candidate in \
        "$SCRIPT_DIR/.venv/Scripts/python.exe" \
        "$SCRIPT_DIR/venv/Scripts/python.exe" \
        "$SCRIPT_DIR/.venv/bin/python" \
        "$SCRIPT_DIR/venv/bin/python" \
        "$SCRIPT_DIR/../venv/Scripts/python.exe" \
        "$SCRIPT_DIR/../venv/bin/python"; do
        if [[ -e "$candidate" ]]; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

PY="$(find_python || true)"

if [[ "$MODE" == "setup" ]]; then
    echo "==> Creating virtual environment in $SCRIPT_DIR/.venv"
    if [[ -n "$PY" ]]; then
        base_python="$PY"
    elif command -v python3 >/dev/null 2>&1; then
        base_python="python3"
    else
        base_python="python"
    fi
    "$base_python" -m venv .venv
    if [[ -e ".venv/Scripts/python.exe" ]]; then
        venv_python=".venv/Scripts/python.exe"
    else
        venv_python=".venv/bin/python"
    fi
    "$venv_python" -m pip install --upgrade pip
    "$venv_python" -m pip install -r requirements.txt
    echo "==> Done. Start the server with: ./dev-run.sh -r"
    exit 0
fi

if [[ -z "$PY" ]]; then
    if command -v python3 >/dev/null 2>&1; then
        PY="python3"
    else
        PY="python"
    fi
    echo "==> No virtual environment found - falling back to '$PY'."
    echo "    Run './dev-run.sh --setup' to create one."
fi

echo "==> Starting action server on port $PORT"
echo "    python: $PY"
exec "$PY" -m rasa run actions --port "$PORT" --auto-reload
