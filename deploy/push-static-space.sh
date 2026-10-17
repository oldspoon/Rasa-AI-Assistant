#!/usr/bin/env bash
# =============================================================================
# push-static-space.sh - push the in-browser demo as a Hugging Face Space
# (static SDK).
#
# Usage (from anywhere in the repo, Git Bash on Windows):
#   HF_USER=<hugging-face-username> HF_TOKEN=<write-token> ./deploy/push-static-space.sh [space-name]
#
# Ships the most recent release tag by default; override with REF:
#   REF=1.0.1  ./deploy/push-static-space.sh
#   REF=master ./deploy/push-static-space.sh     # branch tip (pre-release checks)
#
# Defaults to space name "rasa-attendance-bot-demo". The script builds a
# staging tree from deploy/static-space at the chosen ref, adds the Space's
# README card (deploy/static-space/README.md lives only in the working tree -
# this repository never commits readmes) and force-pushes the result as a
# single fresh commit. When the ref is a tag, the same tag is pushed to the
# Space repository too.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

: "${HF_USER:?set HF_USER to your Hugging Face username}"
: "${HF_TOKEN:?set HF_TOKEN to a Hugging Face write token}"
SPACE_NAME="${1:-rasa-attendance-bot-demo}"

# What to ship: the REF environment variable wins, then a second argument,
# then the latest release tag, then the branch tip.
REF="${REF:-${2:-}}"
if [ -z "$REF" ]; then
  REF="$(git describe --tags --abbrev=0 2>/dev/null || true)"
  [ -n "$REF" ] || REF="HEAD"
fi
git rev-parse -q --verify "$REF^{commit}" >/dev/null 2>&1 \
  || { echo "Unknown git ref: $REF" >&2; exit 1; }
VERSION="$(git rev-parse --short "$REF^{commit}")"
echo "Shipping ref '$REF' ($VERSION)"

# Mirror the tag on the Space when the ref is a tag (checked before we cd).
TAG_MIRROR=""
if git rev-parse -q --verify "refs/tags/$REF" >/dev/null 2>&1; then
  TAG_MIRROR="$REF"
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# The demo page, exactly as committed at the ref.
git archive --format=tar "$REF:deploy/static-space" | tar -x -C "$STAGE"

# The Space configuration card (never committed - always from the working tree).
cp deploy/static-space/README.md "$STAGE/README.md"

cd "$STAGE"
git init -q -b main
git add -A
git -c user.name="rasa-attendance-bot" -c user.email="deploy@users.noreply.github.com" \
    commit -q -m "Deploy $REF ($VERSION)"
git push -f "https://${HF_USER}:${HF_TOKEN}@huggingface.co/spaces/${HF_USER}/${SPACE_NAME}" main:main
if [ -n "$TAG_MIRROR" ]; then
  git tag "$TAG_MIRROR"
  git push -f "https://${HF_USER}:${HF_TOKEN}@huggingface.co/spaces/${HF_USER}/${SPACE_NAME}" "refs/tags/$TAG_MIRROR"
  echo "Tagged the Space repository: $TAG_MIRROR"
fi
echo "Pushed: https://huggingface.co/spaces/${HF_USER}/${SPACE_NAME}"
