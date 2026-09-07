#!/usr/bin/env bash
# Copies the ceramic floor tiles baked by the WorkDesk3D project into
# public/textures/floor-tiles/. Usage: copy-floor-tiles.sh [path/to/floor-tiles]
#
# The maps are baked there by tools/convert-floor-tiles.py out of ancient_tiles.usdz;
# read that script before touching them. The short version: the sheet is 8 x 8 tiles
# of 0.60 m, it already tiles seamlessly, and the joints live in the normal map and in
# the occlusion that is folded into the colour — so there is no AO map and nothing
# here should be drawing grout of its own.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="${1:-$HOME/Develop/WorkDesk3D/assets/floor-tiles}"
out="$root/public/textures/floor-tiles"

[ -d "$src" ] || { echo "Floor tiles not found: $src"; exit 1; }

files=(
  "floor-tiles-color.jpg"
  "floor-tiles-roughness.jpg"
  "floor-tiles-normal.jpg"
)

mkdir -p "$out"
for name in "${files[@]}"; do
  [ -s "$src/$name" ] || { echo "Missing in source: $name"; exit 1; }
  cp "$src/$name" "$out/$name"
done

echo "Done: $out ($(du -sh "$out" | cut -f1), ${#files[@]} files)"
