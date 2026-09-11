#!/usr/bin/env bash
# Splits the Pro Display XDR's mount off its panel, in place.
# Re-run after `npm run apple`, which copies the untouched model back over it.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
blender="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
model="$root/public/models/proDisplayXdr.glb"

[ -x "$blender" ] || { echo "Blender not found at $blender (set BLENDER=...)"; exit 1; }
[ -f "$model" ] || { echo "Missing model: $model — run npm run apple first"; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

"$blender" --background --factory-startup \
  --python "$root/scripts/split-display-mount.py" -- "$model" "$tmp/out.glb" \
  | grep '^\[split\]' || { echo "Split failed"; exit 1; }

[ -s "$tmp/out.glb" ] || { echo "Split produced no output"; exit 1; }
mv "$tmp/out.glb" "$model"
echo "Done: public/models/proDisplayXdr.glb ($(du -h "$model" | cut -f1))"
