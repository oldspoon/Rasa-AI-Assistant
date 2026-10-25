#!/usr/bin/env bash
# Copy the modules shared with the web chat into shared/, for local preview.
# The list is in shared-files.txt (paths under web/src).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$here/shared"
while read -r file; do
  [ -n "$file" ] && cp "$here/../../web/src/$file" "$here/shared/$(basename "$file")"
done < "$here/shared-files.txt"
echo "Synced $(wc -l < "$here/shared-files.txt") modules into shared/"
