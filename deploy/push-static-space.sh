#!/usr/bin/env bash
# =============================================================================
# push-static-space.sh - push the in-browser demo as a Hugging Face Space
# (static SDK).
#
# Usage (from anywhere in the repo, Git Bash on Windows):
#   HF_USER=<hugging-face-username> HF_TOKEN=<write-token> ./deploy/push-static-space.sh [space-name]
#
# Defaults to space name "rasa-attendance-bot-demo". The script builds a
# staging tree from the files committed on the current branch, adds the
# Space's README card (deploy/static-space/README.md lives only in the
# working tree - this repository never commits readmes) and force-pushes the
# result as a single fresh commit.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

: "${HF_USER:?set HF_USER to your Hugging Face username}"
: "${HF_TOKEN:?set HF_TOKEN to a Hugging Face write token}"
SPACE_NAME="${1:-rasa-attendance-bot-demo}"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# The demo page, exactly as committed (tracked files only).
git archive --format=tar "HEAD:deploy/static-space" | tar -x -C "$STAGE"

# The Space configuration card.
cp deploy/static-space/README.md "$STAGE/README.md"

cd "$STAGE"
git init -q -b main
git add -A
git -c user.name="rasa-attendance-bot" -c user.email="deploy@users.noreply.github.com" \
    commit -q -m "Deploy the in-browser demo"
git push -f "https://${HF_USER}:${HF_TOKEN}@huggingface.co/spaces/${HF_USER}/${SPACE_NAME}" main:main
echo "Pushed: https://huggingface.co/spaces/${HF_USER}/${SPACE_NAME}"
