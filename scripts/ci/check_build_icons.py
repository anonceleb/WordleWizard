#!/usr/bin/env python3
"""CI helper: validate build icons are binary PNGs and manifest references exist.

Usage: python3 scripts/ci/check_build_icons.py [--build-dir path]
Exits non-zero on errors with helpful messages.
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def check_png(path: Path) -> bool:
    try:
        with path.open('rb') as f:
            head = f.read(len(PNG_MAGIC))
            return head == PNG_MAGIC
    except Exception as e:
        print(f"ERROR: Failed to read {path}: {e}")
        return False


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--build-dir', default='extension/build', help='Path to build directory')
    p.add_argument('--manifest', default='extension/manifest.json', help='Path to extension manifest')
    args = p.parse_args()

    build_dir = Path(args.build_dir)
    manifest_path = Path(args.manifest)

    if not build_dir.exists():
        print(f"ERROR: build directory does not exist: {build_dir}")
        return 2

    # Check icons directory
    icons_dir = build_dir / 'icons'
    if not icons_dir.exists() or not icons_dir.is_dir():
        print(f"ERROR: icons directory missing under build: {icons_dir}")
        return 3

    bad = False
    for pth in sorted(icons_dir.glob('*.png')):
        if not check_png(pth):
            print(f"ERROR: {pth} is not a valid PNG (missing PNG magic bytes)")
            bad = True

    # Also sanity-check that icons referenced in the extension manifest exist in build/icons
    if manifest_path.exists():
        try:
            m = json.loads(manifest_path.read_text(encoding='utf8'))
            icons = m.get('icons', {})
            for size, rel in icons.items():
                # Accept both "icons/icon128.png" and "extension/icons/icon128.png"
                relpath = Path(rel)
                # Prefer build/icons path
                candidate = build_dir / relpath.name
                if not candidate.exists():
                    # fallback: extension/icons
                    fallback = Path('extension/icons') / relpath.name
                    if not fallback.exists():
                        print(f"ERROR: manifest references icon '{rel}', but neither '{candidate}' nor '{fallback}' exist")
                        bad = True
        except Exception as e:
            print(f"ERROR: Failed to parse manifest {manifest_path}: {e}")
            return 4
    else:
        print(f"WARNING: manifest not found at {manifest_path}; skipping manifest checks")

    if bad:
        print('\nOne or more checks failed. Ensure build icons are committed as binary PNGs (not base64 text).')
        return 1

    print('All build icon checks passed ✅')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
