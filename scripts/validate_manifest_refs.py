#!/usr/bin/env python3
"""Validate that files referenced in a manifest.json exist relative to the manifest file.
Usage: python scripts/validate_manifest_refs.py <path-to-manifest.json>
"""
import json
import os
import sys


def check_manifest(manifest_path):
    base = os.path.dirname(manifest_path)
    with open(manifest_path, 'r', encoding='utf-8') as f:
        m = json.load(f)

    missing = []

    # Check content_scripts js
    for cs in m.get('content_scripts', []):
        for js in cs.get('js', []):
            p = os.path.join(base, js)
            if not os.path.exists(p):
                missing.append(js)

    # Check web_accessible_resources
    for war in m.get('web_accessible_resources', []):
        for r in war.get('resources', []):
            p = os.path.join(base, r)
            if not os.path.exists(p):
                missing.append(r)

    # Check background service worker
    bg = m.get('background', {})
    sw = bg.get('service_worker')
    if sw:
        p = os.path.join(base, sw)
        if not os.path.exists(p):
            missing.append(sw)

    if missing:
        print('Missing files referenced by', manifest_path)
        for f in missing:
            print('  -', f)
        return 1
    else:
        print('All manifest references present for', manifest_path)
        return 0


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: validate_manifest_refs.py <manifest.json>')
        sys.exit(2)
    sys.exit(check_manifest(sys.argv[1]))
