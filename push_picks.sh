#!/bin/bash
# push_picks.sh — commit and push the day's picks.json to GitHub (triggers Vercel deploy)
# Usage:
#   ./push_picks.sh                 -> commits with "picks update - YYYY-MM-DD"
#   ./push_picks.sh "custom msg"    -> uses your own commit message

set -e
cd "$(dirname "$0")"

DATE=$(date +%F)
MSG=${1:-"picks update - $DATE"}

# Only proceed if picks.json actually changed (or -A picked up something else)
if git diff --quiet public/data/picks.json && git diff --cached --quiet public/data/picks.json; then
  echo "picks.json has no changes — nothing to push."
  exit 0
fi

git add public/data/picks.json
git commit -m "$MSG"
git push

echo "Pushed: $MSG"
