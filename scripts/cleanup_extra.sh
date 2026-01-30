#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SCREEN_DIR="$ROOT_DIR/extension/screenshots"

echo "This script will remove optional Puppeteer-based screenshot generator files from the repo."
read -p "Proceed and delete generator files in $SCREEN_DIR? [y/N] " ans
ans=${ans:-N}
if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
  echo "Aborted. No files were removed."; exit 0
fi

FILES=(
  "$SCREEN_DIR/generate_screenshots.js"
  "$SCREEN_DIR/package.json"
  "$SCREEN_DIR/node_modules"
)

for f in "${FILES[@]}"; do
  if [ -e "$f" ]; then
    echo "Removing $f"
    rm -rf "$f"
  else
    echo "Not found: $f"
  fi
done

echo "Cleanup complete. If you want to restore the generator, re-add the files from Git history."