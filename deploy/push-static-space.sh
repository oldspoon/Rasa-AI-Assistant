#!/usr/bin/env bash
# push-static-space.sh: publish the in-browser demo as a Hugging Face Space.
# Usage: HF_USER=<user> HF_TOKEN=<write-token> ./deploy/push-static-space.sh [space-name]
# Ships the latest release tag unless REF is set (REF=main for the branch tip).
# Force-pushes one fresh commit. A tag ref is also pushed to the Space.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

: "${HF_USER:?set HF_USER to your Hugging Face username}"
: "${HF_TOKEN:?set HF_TOKEN to a Hugging Face write token}"
SPACE_NAME="${1:-rasa-attendance-bot-demo}"

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

# The demo page, as committed at the ref.
git archive --format=tar "$REF:deploy/static-space" | tar -x -C "$STAGE"

# Modules shared with the web chat, from the same ref.
mkdir -p "$STAGE/shared"
while read -r file; do
  [ -n "$file" ] && git show "$REF:web/src/$file" > "$STAGE/shared/$(basename "$file")"
done < <(git show "$REF:deploy/static-space/shared-files.txt")

# Space card, always from the working tree.
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
