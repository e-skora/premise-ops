#!/usr/bin/env bash
# Proves `bun test` leaves the working checkout and the live database untouched.
# Records git state plus mtime and sha256 of premise.db and every demo fixture
# file, runs the suite, records again, and fails if anything differs.
set -euo pipefail

cd "$(dirname "$0")/.."

file_mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1"
}

file_sha() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

snapshot() {
  echo "## git status"
  git status --porcelain --ignored=matching
  echo "## git branches"
  git branch --list
  echo "## HEAD"
  git rev-parse HEAD
  echo "## files"
  local roots=()
  for dir in packages services infra ops docs/adr examples; do
    [ -e "$dir" ] && roots+=("$dir")
  done
  {
    for db in premise.db premise.db-wal premise.db-shm; do
      [ -e "$db" ] && echo "$db"
    done
    if [ "${#roots[@]}" -gt 0 ]; then
      find "${roots[@]}" -type f
    fi
  } | sort | while read -r f; do
    echo "$f $(file_mtime "$f") $(file_sha "$f")"
  done
}

before="$(mktemp)"
after="$(mktemp)"
trap 'rm -f "$before" "$after"' EXIT

snapshot > "$before"
bun test
snapshot > "$after"

if ! diff -u "$before" "$after"; then
  echo "FAIL: bun test changed the working checkout or premise.db (diff above)." >&2
  exit 1
fi

echo "PASS: bun test left the working checkout and premise.db untouched ($(grep -c . "$before") lines compared)."
