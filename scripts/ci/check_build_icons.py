#!/usr/bin/env python3
"""CI helper: validate build artifacts referenced by the build manifest exist.

Checks performed:
 - icon files in extension/build/icons are valid PNGs (magic bytes)
 - icons referenced by the manifest exist in build or fallback to extension/icons
 - files referenced by the manifest (background.service_worker, content_scripts js,
   and web_accessible_resources) exist in the build directory (or extension/ as a fallback)

Usage: python3 scripts/ci/check_build_icons.py [--build-dir path] [--manifest path]
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


def exists_in_build_or_fallback(build_dir: Path, rel: str) -> bool:
    """Check for a resource in build_dir (exact path or by basename), or fallback to extension/ path.

    This handles both 'icons/icon16.png' and 'icon16.png' references.
    """
    relpath = Path(rel)
    # Exact relative path under build (e.g., build/icons/icon16.png)
    cand_exact = build_dir / relpath
    if cand_exact.exists():
        return True
    # Fallback: check by basename at build root
    cand_basename = build_dir / relpath.name
    if cand_basename.exists():
        return True
    # Fallbacks under extension dir
    fb_exact = Path('extension') / relpath
    if fb_exact.exists():
        return True
    fb_basename = Path('extension') / relpath.name
    return fb_basename.exists()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--build-dir', default='extension/build', help='Path to build directory')
    p.add_argument('--manifest', default='extension/build/manifest.json', help='Path to extension manifest (prefer build/manifest.json)')
    args = p.parse_args()

    build_dir = Path(args.build_dir)
    manifest_path = Path(args.manifest)

    if not build_dir.exists():
        print(f"ERROR: build directory does not exist: {build_dir}")
        return 2

    bad = False

    # Check icons
    icons_dir = build_dir / 'icons'
    if not icons_dir.exists() or not icons_dir.is_dir():
        print(f"ERROR: icons directory missing under build: {icons_dir}")
        bad = True
    else:
        for pth in sorted(icons_dir.glob('*.png')):
            if not check_png(pth):
                print(f"ERROR: {pth} is not a valid PNG (missing PNG magic bytes)")
                bad = True

    # Parse manifest in build (or provided manifest) and verify referenced files exist
    if manifest_path.exists():
        try:
            m = json.loads(manifest_path.read_text(encoding='utf8'))

            # Background service worker
            if 'background' in m and isinstance(m['background'], dict) and 'service_worker' in m['background']:
                sw = m['background']['service_worker']
                if not exists_in_build_or_fallback(build_dir, sw):
                    print(f"ERROR: background.service_worker '{sw}' not found in build or extension/")
                    bad = True

            # Content scripts
            if 'content_scripts' in m and isinstance(m['content_scripts'], list):
                for cs in m['content_scripts']:
                    if 'js' in cs and isinstance(cs['js'], list):
                        for s in cs['js']:
                            if not exists_in_build_or_fallback(build_dir, s):
                                print(f"ERROR: content script '{s}' referenced in manifest not found in build or extension/")
                                bad = True

            # Web accessible resources
            if 'web_accessible_resources' in m and isinstance(m['web_accessible_resources'], list):
                for war in m['web_accessible_resources']:
                    resources = war.get('resources', []) if isinstance(war, dict) else []
                    for r in resources:
                        if isinstance(r, str) and not exists_in_build_or_fallback(build_dir, r):
                            print(f"ERROR: web_accessible_resource '{r}' not found in build or extension/")
                            bad = True

            # Icons (already checked via file existence but double-check entries)
            icons = m.get('icons', {})
            for size, rel in icons.items():
                if not exists_in_build_or_fallback(build_dir, rel):
                    print(f"ERROR: manifest references icon '{rel}', but it was not found in build or extension/")
                    bad = True

        except Exception as e:
            print(f"ERROR: Failed to parse manifest {manifest_path}: {e}")
            return 4
    else:
        print(f"ERROR: manifest not found at {manifest_path}; cannot validate manifest-referenced files")
        return 5

    if bad:
        print('\nOne or more checks failed. Ensure the build contains all files referenced by the manifest (scripts, icons, resources).')
        return 1

    print('All build artifact checks passed ✅')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
