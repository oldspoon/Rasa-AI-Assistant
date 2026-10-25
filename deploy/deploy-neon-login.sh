#!/usr/bin/env bash
# deploy-neon-login.sh: deploy the login endpoint as a Neon Function.
# Usage: ./deploy/deploy-neon-login.sh   (REF=<tag|main> to pick the ref)
# Same contract as rasa/auth_channel.py, so sign-in works while Rasa is asleep.
# Needs the neon CLI, linked to the project, and a seeded users table.
# Also update the URL in pages.yml and static-space/app.js if it changes.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# REF env var, then 1st argument, then latest tag, then branch tip.
REF="${REF:-${1:-}}"
if [ -z "$REF" ]; then
  REF="$(git describe --tags --abbrev=0 2>/dev/null || true)"
  [ -n "$REF" ] || REF="HEAD"
fi
git rev-parse -q --verify "$REF^{commit}" >/dev/null 2>&1 \
  || { echo "Unknown git ref: $REF" >&2; exit 1; }
VERSION="$(git rev-parse --short "$REF^{commit}")"
echo "Shipping ref '$REF' ($VERSION)"

EXPORT="$(mktemp -d)"
BODY="$(mktemp)"
trap 'rm -rf "$EXPORT"; rm -f "$BODY"' EXIT

# The function as committed at the ref, with its dependencies.
SRC="$EXPORT/neon/functions/login"
git archive --format=tar "$REF" neon/functions/login | tar -x -C "$EXPORT"
echo "Installing function dependencies"
(cd "$SRC" && npm install --no-audit --no-fund >/dev/null)

neon functions deploy login --src "$SRC" --wait

URL="$(neon functions get login -o json | grep -o '"invocation_url": *"[^"]*"' | cut -d'"' -f4)"
echo "Live at: ${URL}"

status() { # status <curl args...>
  curl -sS -o "$BODY" -w '%{http_code}' "$@"
}

echo
echo "Smoke test:"

s="$(status -X POST "$URL" -H 'Content-Type: application/json' \
  --data '{"username":"alicejohnson","password":"johnsonalice"}')"
[ "$s" = "200" ] && grep -q '"ok":true' "$BODY" \
  && echo "  ok   valid credentials answer 200" \
  || { echo "  FAIL valid credentials (HTTP $s)"; cat "$BODY"; exit 1; }

s="$(status -X POST "$URL" -H 'Content-Type: application/json' \
  --data '{"username":"alicejohnson","password":"wrong"}')"
[ "$s" = "401" ] \
  && echo "  ok   wrong password answers 401" \
  || { echo "  FAIL wrong password (HTTP $s)"; exit 1; }

s="$(status -X OPTIONS "$URL")"
[ "$s" = "204" ] \
  && echo "  ok   CORS preflight answers 204" \
  || { echo "  FAIL CORS preflight (HTTP $s)"; exit 1; }

echo
echo "Deploy complete."
