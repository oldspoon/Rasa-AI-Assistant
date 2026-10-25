#!/usr/bin/env bash
# =============================================================================
# dev-run.sh - development runner for the attendance-bot Rasa project.
#
# Usage (run from this folder):
#   ./dev-run.sh -r          start the Rasa server (REST API on http://localhost:5005)
#   ./dev-run.sh -t          train a model into models/
#   ./dev-run.sh -b          build: validate the training data, then train every
#                            story in data/stories/ into a fresh model
#   ./dev-run.sh -i          inspect mode: talk to the bot while seeing the
#                            model's predictions at each step (rasa interactive)
#   ./dev-run.sh --setup     create .venv and install requirements.txt
#   ./dev-run.sh -h          show this help
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

usage() {
    cat <<'EOF'
Usage: ./dev-run.sh [options]

  -r, --run        start the Rasa server with the REST channel and API
                   enabled (http://localhost:5005) - default action
  -t, --train      train a model into models/
  -b, --build      build all stories: validate the training data (domain,
                   NLU, every file in data/stories/) and then train a
                   fresh model into models/
  -i, --inspect    inspect mode: chat with the bot while seeing what the
                   model predicts at every step (rasa interactive)
      --setup      create a virtual environment (.venv) and install
                   requirements.txt into it
  -h, --help       show this help

While the server runs you can chat with the bot:

    ./dev-run.sh -i          inspect mode (chat + predictions)
    python -m rasa shell     plain chat
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -r|--run)   MODE="run"; shift ;;
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

case "$MODE" in
    run)
        echo "==> Starting Rasa server (REST channel + API) on http://localhost:5005"
        echo "    python: $PY"
        echo "    (custom actions need the action server too: ../action_server -> ./dev-run.sh -r)"
        exec "$PY" -m rasa run --enable-api
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
        echo "==> Inspect mode: interactive chat showing the model's predictions"
        echo "    python: $PY"
        echo "    (custom actions need the action server: ../action_server -> ./dev-run.sh -r)"
        echo "    (internal UI server is on port 5006, so a 5005 dev server can keep running)"
        exec "$PY" -m rasa interactive -m models --skip-visualization --port 5006
        ;;
esac
