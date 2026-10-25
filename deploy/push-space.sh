#!/usr/bin/env bash
# push-space.sh: publish this repo as a Hugging Face Space (Docker SDK).
# Usage: HF_USER=<user> HF_TOKEN=<write-token> ./deploy/push-space.sh [space-name]
# Ships the latest release tag unless REF is set (REF=main for the branch tip).
# Force-pushes one fresh commit. A tag ref is also pushed to the Space.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

: "${HF_USER:?set HF_USER to your Hugging Face username}"
: "${HF_TOKEN:?set HF_TOKEN to a Hugging Face write token}"
SPACE_NAME="${1:-rasa-attendance-bot}"

# REF env var, then 2nd argument, then latest tag, then branch tip.
REF="${REF:-${2:-}}"
if [ -z "$REF" ]; then
  REF="$(git describe --tags --abbrev=0 2>/dev/null || true)"
  [ -n "$REF" ] || REF="HEAD"
fi
git rev-parse -q --verify "$REF^{commit}" >/dev/null 2>&1 \
  || { echo "Unknown git ref: $REF" >&2; exit 1; }
VERSION="$(git rev-parse --short "$REF^{commit}")"
echo "Shipping ref '$REF' ($VERSION)"

# Mirror a tag ref onto the Space.
TAG_MIRROR=""
if git rev-parse -q --verify "refs/tags/$REF" >/dev/null 2>&1; then
  TAG_MIRROR="$REF"
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# App code and Space files, as committed at the ref.
git archive --format=tar "$REF" rasa action_server deploy/space | tar -x -C "$STAGE"
mv "$STAGE/deploy/space/Dockerfile" "$STAGE/Dockerfile"
mv "$STAGE/deploy/space/start.sh" "$STAGE/start.sh"
rm -rf "$STAGE/deploy"
chmod +x "$STAGE/start.sh"

# Generated Space README (not committed here).
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
