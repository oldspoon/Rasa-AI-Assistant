#!/bin/sh
# Container entry point: the Rasa action server (internal, port 5055) and the
# Rasa server (public, port 7860 - the Space's app port).
set -e

cd /app/action_server
python -m rasa run actions --port 5055 &
ACTION_PID=$!
trap 'kill $ACTION_PID 2>/dev/null || true' EXIT INT TERM

cd /app/rasa

# Conversation logging (see tracker_store.py): every conversation is stored
# keyed by its UUID. Prefer the direct (unpooled) Neon URL for the
# long-lived tracker-store connection; without a secret it falls back to the
# bundled SQLite file.
if [ -n "${DATABASE_URL_UNPOOLED:-}" ]; then
    export RASA_TRACKER_STORE_URL="$DATABASE_URL_UNPOOLED"
elif [ -n "${DATABASE_URL:-}" ]; then
    export RASA_TRACKER_STORE_URL="$DATABASE_URL"
fi

python -m rasa run --enable-api --cors "*" --interface 0.0.0.0 --port 7860
