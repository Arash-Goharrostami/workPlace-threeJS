#!/usr/bin/env bash
# Converts tmp/<Name>.usdz into public/models/<Name>.glb using Blender.
# Usage: convert-usdz.sh [Name ...]   (no arguments converts every model in tmp/)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
blender="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"

[ -x "$blender" ] || { echo "Blender not found at $blender (set BLENDER=...)"; exit 1; }

names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  # Sources may sit in subfolders of tmp/, so search rather than glob one level.
  while IFS= read -r f; do
    names+=("$(basename "$f" .usdz)")
  done < <(find "$root/tmp" -name '*.usdz' -not -path '*/extracted/*')
fi

for name in "${names[@]}"; do
  usdz="$(find "$root/tmp" -name "$name.usdz" -not -path '*/extracted/*' | head -1)"
  # Each model gets its own dir so sibling texture folders can't collide.
  extracted="$root/tmp/extracted/$name"
  out="$root/public/models/$name.glb"

  [ -f "$usdz" ] || { echo "Missing source model: $usdz"; exit 1; }

  rm -rf "$extracted"
  mkdir -p "$extracted"
  unzip -oq "$usdz" -d "$extracted"
  usdc="$(find "$extracted" -maxdepth 2 \( -name '*.usdc' -o -name '*.usda' \) | head -1)"
  [ -n "$usdc" ] || { echo "No .usdc/.usda inside $usdz"; exit 1; }

  mkdir -p "$(dirname "$out")"
  "$blender" --background --factory-startup \
    --python "$root/scripts/usdz_to_glb.py" -- "$usdc" "$out" "$usdz" >/dev/null

  [ -s "$out" ] || { echo "Conversion produced no output for $name"; exit 1; }
  echo "Done: $out ($(du -h "$out" | cut -f1))"
done
