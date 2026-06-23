#!/bin/bash
# push_psi.sh — commit and push the latest PSI+ data to GitHub (triggers Vercel deploy)
# Run this after: 1) the update shell, 2) convert_psi_data.py
# Usage:
#   ./push_psi.sh                 -> commits with "psi+ update - YYYY-MM-DD"
#   ./push_psi.sh "custom msg"    -> uses your own commit message

set -e
cd "$(dirname "$0")"

DATE=$(date +%F)
MSG=${1:-"psi+ update - $DATE"}

# Only proceed if anything in public/data actually changed
if git diff --quiet public/data/ && git diff --cached --quiet public/data/; then
  echo "public/data/ has no changes — nothing to push."
  exit 0
fi

git add public/data/
git commit -m "$MSG"
git push

echo "Pushed: $MSG"
