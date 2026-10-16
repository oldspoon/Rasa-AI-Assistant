#!/usr/bin/env bash
# =============================================================================
# push-space.sh - push this repository as a Hugging Face Space (Docker SDK).
#
# Usage (from anywhere in the repo, Git Bash on Windows):
#   HF_USER=<hugging-face-username> HF_TOKEN=<write-token> ./deploy/push-space.sh [space-name]
#
# Defaults to space name "rasa-attendance-bot". The script builds a staging
# tree from the files committed on the current branch, adds the Space
# metadata (the generated README.md lives only inside the Space repository)
# and force-pushes the result as a single fresh commit.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

: "${HF_USER:?set HF_USER to your Hugging Face username}"
: "${HF_TOKEN:?set HF_TOKEN to a Hugging Face write token}"
SPACE_NAME="${1:-rasa-attendance-bot}"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# The application code, exactly as committed (tracked files only).
git archive --format=tar HEAD rasa action_server | tar -x -C "$STAGE"

# The Space's own hosting files.
cp deploy/space/Dockerfile "$STAGE/Dockerfile"
cp deploy/space/start.sh "$STAGE/start.sh"
chmod +x "$STAGE/start.sh"

# Space configuration. Generated here; this repository never commits readmes.
cat > "$STAGE/README.md" <<'EOF'
---
title: Rasa Attendance Bot
emoji: 🎓
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

Campus attendance assistant. The Rasa server and its custom action server run
inside this Space; the React chat front end (GitHub Pages) calls the REST
webhook. Set the `DATABASE_URL` secret to point the action server at a hosted
Postgres database (Neon); without it the bundled SQLite file is used. Every
conversation is logged under its UUID (see `rasa/tracker_store.py`); set
`DATABASE_URL_UNPOOLED` so the tracker store connects directly to Neon.
EOF

cd "$STAGE"
git init -q -b main
git add -A
git -c user.name="rasa-attendance-bot" -c user.email="deploy@users.noreply.github.com" \
    commit -q -m "Deploy the campus attendance assistant"
git push -f "https://${HF_USER}:${HF_TOKEN}@huggingface.co/spaces/${HF_USER}/${SPACE_NAME}" main:main
echo "Pushed: https://huggingface.co/spaces/${HF_USER}/${SPACE_NAME}"
