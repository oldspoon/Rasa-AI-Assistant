#!/usr/bin/env bash
# =============================================================================
# push-space.sh - push this repository as a Hugging Face Space (Docker SDK).
#
# Usage (from anywhere in the repo, Git Bash on Windows):
#   HF_USER=<hugging-face-username> HF_TOKEN=<write-token> ./deploy/push-space.sh [space-name]
#
# Ships the most recent release tag by default - a frozen revision - rather
# than the working state of the branch. Override the ref when needed:
#   REF=1.0.1  ./deploy/push-space.sh     # a specific tag
#   REF=master ./deploy/push-space.sh     # the branch tip (pre-release checks)
#
# Defaults to space name "rasa-attendance-bot". The script builds a staging
# tree from the chosen ref (rasa/, action_server/ and deploy/space/ - exactly
# as committed there), adds the Space metadata (the generated README.md lives
# only inside the Space repository) and force-pushes the result as a single
# fresh commit. When the ref is a tag, the same tag is pushed to the Space
# repository too, so the deployed revision is labelled.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

: "${HF_USER:?set HF_USER to your Hugging Face username}"
: "${HF_TOKEN:?set HF_TOKEN to a Hugging Face write token}"
SPACE_NAME="${1:-rasa-attendance-bot}"

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

# The application code and the Space's hosting files, exactly as in the ref.
git archive --format=tar "$REF" rasa action_server deploy/space | tar -x -C "$STAGE"
mv "$STAGE/deploy/space/Dockerfile" "$STAGE/Dockerfile"
mv "$STAGE/deploy/space/start.sh" "$STAGE/start.sh"
rm -rf "$STAGE/deploy"
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
webhook and the login endpoint (`/auth/login`). Set the `DATABASE_URL` secret
to point the action server at a hosted Postgres database (Neon); without it the
bundled SQLite file is used. Keep the `users` table seeded for logins
(`populate_db.py --users-only`). Every conversation is logged under its UUID
(see `rasa/tracker_store.py`); set `DATABASE_URL_UNPOOLED` so the tracker
store connects directly to Neon.
EOF

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
