#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
EXT_DIR="$ROOT_DIR/extension"
DIST_DIR="$ROOT_DIR/dist"
mkdir -p "$DIST_DIR"

# Try to read version from extension/manifest.json
VERSION=$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$EXT_DIR/manifest.json','utf8'));console.log(m.version||'0.0.0')")
OUT="$DIST_DIR/wordle-wizard-$VERSION.zip"

rm -f "$OUT"

# Prefer a build output directory if present (minified/obfuscated files)
if [ -d "$EXT_DIR/build" ]; then
  echo "Found build artifacts in $EXT_DIR/build — packaging them"
  cd "$EXT_DIR/build"
else
  cd "$EXT_DIR"
fi

zip -r "$OUT" . -x "*.DS_Store" "screenshots/*" "test_*" "test_*.*" "test*.*" "MEANINGS.md" "README.md" "README_STORE.md" "STORE_LISTING.md" "store_listing.json"

echo "Created: $OUT"