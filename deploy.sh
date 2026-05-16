#!/bin/bash
# StatPacks deploy script
# Usage: ./deploy.sh "your commit message"
# Or just: ./deploy.sh  (defaults to "update")

MSG=${1:-"update"}
cd "$(dirname "$0")"
git add -A
git commit -m "$MSG"
git push
