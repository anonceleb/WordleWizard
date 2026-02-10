#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
EXT_DIR="$ROOT_DIR/extension"
BUILD_DIR="$EXT_DIR/build"

# Tools used (via npx if available): terser (for minify) and javascript-obfuscator (for obfuscation)
TERSER_CMD="npx terser"
OBF_CMD="npx javascript-obfuscator"

# Files to process (relative to extension/)
# Include `meanings_blob_full.js` so the big generated blob that the manifest references
# is present in the build and is obfuscated/minified like other scripts.
JS_FILES=("meanings_blob_full.js" "content_script.js" "solver.js" "background.js")

# Quick check for required tools
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run the build (install node >= 16)." >&2
  exit 1
fi

# Create clean build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy static assets (css, icons, data)
cp "$EXT_DIR/manifest.json" "$BUILD_DIR/"
cp -R "$EXT_DIR/icons" "$BUILD_DIR/"
cp "$EXT_DIR/ui.css" "$BUILD_DIR/"
cp "$EXT_DIR/words.txt" "$BUILD_DIR/" || true
cp "$EXT_DIR/words_meanings.json" "$BUILD_DIR/" || true
cp "$EXT_DIR/privacy.md" "$BUILD_DIR/" || true

# Minify + obfuscate JS files
for f in "${JS_FILES[@]}"; do
  src="$EXT_DIR/$f"
  if [ ! -f "$src" ]; then
    echo "Skipping missing file: $src"
    continue
  fi
  base=$(basename "$f" .js)
  tmp="$BUILD_DIR/$base.min.js"
  out="$BUILD_DIR/$base.obf.js"

  echo "Minifying $f..."
  # Use terser to minify; fall back to a simple copy if terser fails
  if $TERSER_CMD "$src" --compress --mangle -o "$tmp" 2>/dev/null; then
    echo "Minified -> $tmp"
  else
    echo "Terser failed or not available; copying original to $tmp" >&2
    cp "$src" "$tmp"
  fi

  echo "Obfuscating $tmp -> $out ..."
  # javascript-obfuscator with sensible defaults; tweak options as desired
  if $OBF_CMD "$tmp" --compact true --selfDefending true --controlFlowFlattening true --rotateStringArray true --output "$out" 2>/dev/null; then
    echo "Obfuscated -> $out"
  else
    echo "javascript-obfuscator failed or not available; using minified file as final output" >&2
    cp "$tmp" "$out"
  fi

  rm -f "$tmp"
done

# Update manifest in build to reference obfuscated file names
# We'll produce a build/manifest.json that mirrors extension/manifest.json but swaps script names
python3 - <<PY
import json,sys,os
p='''$BUILD_DIR'''
manifest_path=os.path.join(p,'manifest.json')
with open(manifest_path,'r',encoding='utf8') as f:
    m=json.load(f)
# Update background service worker if present
if 'background' in m and isinstance(m['background'], dict) and 'service_worker' in m['background']:
    sw=m['background']['service_worker']
    m['background']['service_worker']=sw.replace('.js','.obf.js')
# Update content scripts
if 'content_scripts' in m and isinstance(m['content_scripts'], list):
    for cs in m['content_scripts']:
        if 'js' in cs and isinstance(cs['js'], list):
            cs['js']=[s.replace('.js','.obf.js') for s in cs['js']]
# Update action default script/icon (if any)
json.dump(m,open(manifest_path,'w',encoding='utf8'),indent=2)
print('Wrote build manifest')
PY

# Tidy: remove source maps or debug files if any
find "$BUILD_DIR" -type f -name '*.map' -delete

# Informational copy (no source JS moved out of repo)
cat > "$BUILD_DIR/BUILD_README.txt" <<README
This folder contains a minified and optionally obfuscated build of the extension
scripts. It is intended for packaging for publish. Obfuscation raises the bar
against casual inspection but does NOT prevent determined reverse engineering.

Tools used: terser (minify) + javascript-obfuscator (obfuscate) via npx. If these
are not available on your system, the build falls back to minified files.
README

echo "Build complete: $BUILD_DIR"

echo "Next: run scripts/pack_extension.sh (which will prefer the build/ dir if present)"