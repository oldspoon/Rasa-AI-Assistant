#!/usr/bin/env bash
# =============================================================================
# dev-run.sh - development runner for the attendance-bot Rasa project.
#
# Usage (run from this folder):
#   ./dev-run.sh -r          start the Rasa server and open the chat shell in
#                            this terminal (REST API on http://localhost:5005)
#   ./dev-run.sh -stop       stop a Rasa server running on port 5005
#   ./dev-run.sh -t          train a model into models/
#   ./dev-run.sh -b          build: validate the training data, then train every
#                            story in data/stories/ into a fresh model
#   ./dev-run.sh -i          inspect mode: talk to the bot while seeing the
#                            model's predictions at every step (rasa interactive)
#   ./dev-run.sh --setup     create .venv and install requirements.txt
#   ./dev-run.sh -h          show this help
#
# -r runs `rasa shell --enable-api`: the server runs in this terminal while the
# shell is open - quit the shell (Ctrl+C) and the server stops with it. If a
# server is already running on port 5005, it is stopped first ('-stop' does
# the same on its own).
#
# The action server (../action_server) must be running for the custom actions
# to work - endpoints.yml points at http://localhost:5055/webhook.
#
# On Windows, run this with Git Bash.
# =============================================================================
set -euo pipefail

# Keep Rasa's emoji/box output from crashing on legacy Windows code pages
export PYTHONUTF8=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="run"
RASA_PORT=5005

usage() {
    cat <<'EOF'
Usage: ./dev-run.sh [options]

  -r, --run        start the Rasa server and open the chat shell in this
                   terminal (http://localhost:5005) - default action.
                   Ctrl+C quits the shell and stops the server
  -stop, --stop    stop a Rasa server running on port 5005
  -t, --train      train a model into models/
  -b, --build      build all stories: validate the training data (domain,
                   NLU, every file in data/stories/) and then train a
                   fresh model into models/
  -i, --inspect    inspect mode: chat with the bot while seeing what the
                   model predicts at every step (rasa interactive)
      --setup      create a virtual environment (.venv) and install
                   requirements.txt into it
  -h, --help       show this help

The server started by -r lives inside the shell - it stops when the shell is
closed. A leftover server can be stopped any time with '-stop'.
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -r|--run)   MODE="run"; shift ;;
        -stop|--stop) MODE="stop"; shift ;;
        -t|--train) MODE="train"; shift ;;
        -b|--build) MODE="build"; shift ;;
        -i|--interactive|--inspect) MODE="interactive"; shift ;;
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
    echo "==> Done. Start with: ./dev-run.sh -r"
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

# -r cleanup: after the shell closes (also on Ctrl+C / kill) stop a server
# that is still listening on the port.
cleanup_run_server() {
    if [[ -n "$(listening_pids "$RASA_PORT")" ]]; then
        echo
        echo "==> Cleaning up: a Rasa server is still listening on port $RASA_PORT"
        stop_port "$RASA_PORT" "Rasa server" || true
    fi
}

# In Git Bash's mintty window the chat UI (prompt-toolkit) must run under
# winpty; a Windows console (cmd / Windows Terminal / PowerShell) works as is.
# Prints "winpty" when it should be used, nothing otherwise.
winpty_wrapper() {
    if [[ "${TERM:-}" == xterm* ]] && [[ -t 0 ]] && command -v winpty >/dev/null 2>&1; then
        echo "winpty"
    fi
}

case "$MODE" in
    run)
        if [[ -n "$(listening_pids "$RASA_PORT")" ]]; then
            echo "==> A Rasa server is already running on http://localhost:$RASA_PORT"
            echo "    The chat shell needs the port, so the old server is stopped first:"
            stop_port "$RASA_PORT" "Rasa server"
        fi
        trap cleanup_run_server EXIT
        SHELL_CMD=("$PY" -m rasa shell --enable-api)
        WRAP="$(winpty_wrapper)"
        if [[ -n "$WRAP" ]]; then
            echo "==> mintty detected - running the shell under winpty (needed for the chat UI)"
            SHELL_CMD=("$WRAP" "${SHELL_CMD[@]}")
        fi
        echo "==> Starting the Rasa server + chat shell on http://localhost:$RASA_PORT"
        echo "    python: $PY"
        echo "    (chat with the bot below - Ctrl+C quits and stops the server)"
        echo
        "${SHELL_CMD[@]}" || true
        echo
        echo "==> Shell closed."
        echo "    Start again: ./dev-run.sh -r     Stop a leftover server: ./dev-run.sh -stop"
        ;;
    stop)
        stop_port "$RASA_PORT" "Rasa server"
        ;;
    train)
        echo "==> Training a model into models/"
        echo "    python: $PY"
        exec "$PY" -m rasa train
        ;;
    build)
        echo "==> Building: validating the training data (domain, NLU, all stories)"
        echo "    python: $PY"
        "$PY" -m rasa data validate
        story_count="$(find data/stories -maxdepth 1 -name '*.yml' | wc -l | tr -d ' ')"
        echo "==> Training all ${story_count} stories from data/stories/ into models/"
        find data/stories -maxdepth 1 -name '*.yml' | sort | sed 's|^|      |'
        exec "$PY" -m rasa train
        ;;
    interactive)
        CMD=("$PY" -m rasa interactive -m models --skip-visualization --port 5006)
        WRAP="$(winpty_wrapper)"
        if [[ -n "$WRAP" ]]; then
            echo "==> mintty detected - running interactive mode under winpty"
            CMD=("$WRAP" "${CMD[@]}")
        fi
        echo "==> Inspect mode: interactive chat showing the model's predictions"
        echo "    python: $PY"
        echo "    (custom actions need the action server: ../action_server -> ./dev-run.sh -r)"
        echo "    (internal UI server is on port 5006, so a 5005 dev server can keep running)"
        exec "${CMD[@]}"
        ;;
esac
