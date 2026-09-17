#!/usr/bin/env bash
# Renders public/favicon.png from the mirror cube with Blender — see render-favicon.py.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
blender="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
[ -x "$blender" ] || { echo "Blender not found at $blender (set BLENDER=...)"; exit 1; }
"$blender" --background --factory-startup --python "$root/scripts/render-favicon.py" | grep '\[favicon\]'
