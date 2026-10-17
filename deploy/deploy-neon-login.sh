#!/usr/bin/env bash
# =============================================================================
# deploy-neon-login.sh - deploy the student login endpoint as a Neon Function.
#
# The web chat and the demo page validate logins against neon/functions/login/
# - the same request/response contract as Rasa's /auth/login channel
# (rasa/auth_channel.py), served by a Neon Function next to the `users` table,
# so sign-in works even while the Rasa backend is asleep.
#
# Ships the most recent release tag by default; override with REF:
#   REF=1.0.1  ./deploy/deploy-neon-login.sh
#   REF=master ./deploy/deploy-neon-login.sh     # branch tip (pre-release checks)
#
# Usage (from anywhere in the repo, Git Bash on Windows):
#   ./deploy/deploy-neon-login.sh
#
# Requires the neon CLI, signed in and linked to the project (.neon), and a
# seeded `users` table in Neon. One-time (or after changing the cohort):
#   set DATABASE_URL to the .env.local value, then
#   (cd action_server && python database/populate_db.py --users-only)
#
# Re-run this script whenever the login function changes. It exports the
# function from the chosen ref, deploys it to the linked branch and smoke-tests
# the live URL. When the invocation URL ever changes, update it in
# .github/workflows/pages.yml (VITE_AUTH_URL) and deploy/static-space/app.js
# (AUTH_URL).
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# What to ship: the REF environment variable wins, then the first argument,
# then the latest release tag, then the branch tip.
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

# The function, exactly as committed at the ref, with its dependencies.
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
