#!/usr/bin/env bash
# =============================================================================
# deploy-neon-login.sh - deploy the student login endpoint as a Neon Function.
#
# The web chat and the demo page validate logins against
# neon/functions/login/ - the same request/response contract as Rasa's
# /auth/login channel (rasa/auth_channel.py), served by a Neon Function
# next to the `users` table, so sign-in works even while the Rasa backend
# is asleep.
#
# Usage (from anywhere in the repo, Git Bash on Windows):
#   ./deploy/deploy-neon-login.sh
#
# Requires the neon CLI, signed in and linked to the project (.neon), and a
# seeded `users` table in Neon. One-time (or after changing the cohort):
#   set DATABASE_URL to the .env.local value, then
#   (cd action_server && python database/populate_db.py --users-only)
#
# Re-run this script whenever neon/functions/login/ changes. It deploys the
# `login` function to the linked branch and smoke-tests the live URL. When
# the invocation URL ever changes, update it in .github/workflows/pages.yml
# (VITE_AUTH_URL) and deploy/static-space/app.js (AUTH_URL).
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOGIN_DIR="neon/functions/login"
if [ ! -d "$LOGIN_DIR/node_modules" ]; then
  echo "Installing function dependencies"
  (cd "$LOGIN_DIR" && npm install --no-audit --no-fund)
fi

neon functions deploy login --src "$LOGIN_DIR" --wait

URL="$(neon functions get login -o json | grep -o '"invocation_url": *"[^\"]*"' | cut -d'"' -f4)"
echo "Live at: ${URL}"

BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

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
