#!/bin/sh
# Container entry point: the Rasa action server (internal, port 5055) and the
# Rasa server (public, port 7860 - the Space's app port).
set -e

cd /app/action_server
python -m rasa run actions --port 5055 &
ACTION_PID=$!
trap 'kill $ACTION_PID 2>/dev/null || true' EXIT INT TERM

cd /app/rasa
python -m rasa run --enable-api --cors "*" --interface 0.0.0.0 --port 7860
