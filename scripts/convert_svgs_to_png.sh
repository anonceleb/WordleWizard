#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SVG_DIR="$ROOT_DIR/extension/screenshots"
OUT_DIR="$SVG_DIR"

# Preferred: ImageMagick 'magick' or 'convert' must be available
if command -v magick >/dev/null 2>&1; then
  CMD=magick
elif command -v convert >/dev/null 2>&1; then
  CMD=convert
else
  echo "No ImageMagick found. Install it (brew install imagemagick) or convert SVGs to PNG in Chrome/Safari by opening and saving as PNG." >&2
  exit 1
fi

for f in "$SVG_DIR"/screenshot-*.svg; do
  base=$(basename "$f" .svg)
  out="$OUT_DIR/$base.png"
  echo "Converting $f -> $out"
  "$CMD" "$f" -background white -flatten -resize 1280x800 "$out"
done

echo "Converted SVGs to PNGs in $OUT_DIR"