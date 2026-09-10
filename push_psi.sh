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

# Stage and commit only PSI+ website data. The legacy file paths remain in this
# list so their tracked deletions are included exactly once.
PSI_PATHS=(
  public/data/psi_leaderboard_2026.json
  public/data/psi_meta.json
  public/data/psi_rolling/
)

# Include legacy deletions while those files are still tracked. After the
# deletion commit, later daily runs will not fail on nonexistent pathspecs.
for LEGACY_PATH in \
  public/data/psi_rolling.json \
  public/data/psi_signals.json \
  public/data/psi_weights.json
do
  if git ls-files --error-unmatch "$LEGACY_PATH" >/dev/null 2>&1; then
    PSI_PATHS+=("$LEGACY_PATH")
  fi
done

if git diff --quiet -- "${PSI_PATHS[@]}" && git diff --cached --quiet -- "${PSI_PATHS[@]}"; then
  echo "PSI+ public data has no changes — nothing to push."
  exit 0
fi

git add -A -- "${PSI_PATHS[@]}"
git commit --only -m "$MSG" -- "${PSI_PATHS[@]}"
git push

echo "Pushed: $MSG"
