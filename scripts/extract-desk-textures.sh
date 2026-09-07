#!/usr/bin/env bash
# Copies the desk's PBR textures out of the Computer Workspace Pack usdz into
# public/textures/desk/. Usage: extract-desk-textures.sh [path/to/pack.usdz]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
pack="${1:-$HOME/Develop/WorkDesk3D/tmp/3D-Models/Computer_Workspace_Pack_-_FREE.usdz}"
out="$root/public/textures/desk"
staging="$root/tmp/extracted/pack-textures"

[ -f "$pack" ] || { echo "Pack not found: $pack"; exit 1; }

# Dark_Wood_Final dresses the pack's tabletop (Object_3); Metal_PBR_Final its
# frame (Object_16). Those are the two surfaces this desk mirrors.
files=(
  "Dark_Wood_Final_baseColor.jpg"
  "Dark_Wood_Final_metallicRoughness_rough.jpg"
  "Dark_Wood_Final_metallicRoughness_metal_scale0.jpg"
  "Dark_Wood_Final_normal_norm.jpg"
  "Metal_PBR_Final_baseColor.jpg"
  "Metal_PBR_Final_metallicRoughness_rough.jpg"
  "Metal_PBR_Final_metallicRoughness_metal_scale0.jpg"
  "Metal_PBR_Final_normal_norm.jpg"
)

rm -rf "$staging"
mkdir -p "$staging" "$out"
unzip -oq "$pack" -d "$staging" "0/*"

for name in "${files[@]}"; do
  src="$staging/0/$name"
  [ -s "$src" ] || { echo "Missing in pack: $name"; exit 1; }
  cp "$src" "$out/$name"
done

rm -rf "$staging"
echo "Done: $out ($(du -sh "$out" | cut -f1), ${#files[@]} files)"
