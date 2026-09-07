#!/usr/bin/env bash
# Copies the Apple models and three's Draco decoder into public/, so the viewer has
# no runtime dependency on the WorkDesk3D project.
# Usage: import-apple-models.sh [path/to/WorkDesk3D/assets]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
assets="${1:-$HOME/Develop/WorkDesk3D/assets}"
decoder="$root/node_modules/three/examples/jsm/libs/draco/gltf"

models=(
  "macbook-pro-16/macbook-pro-16.glb"
  "pro-display-xdr/pro-display-xdr.glb"
  "magic-keyboard/magic-keyboard.glb"
  "magic-trackpad/magic-trackpad.glb"
  "magic-mouse/magic-mouse.obj"
  "3d-printer/3d-printer.glb"
  "guitar-on-stand/guitar-on-stand.glb"
  "carpet/carpet.glb"
  "ipad-pro/ipad-pro.glb"
  "apple-pencil/apple-pencil.glb"
  "apple-watch-se/apple-watch-se.glb"
)

[ -d "$decoder" ] || { echo "Draco decoder missing — run npm install first"; exit 1; }
mkdir -p "$root/public/models" "$root/public/draco"

for model in "${models[@]}"; do
  src="$assets/$model"
  [ -f "$src" ] || { echo "Model not found: $src"; exit 1; }
  cp "$src" "$root/public/models/$(basename "$model")"
  echo "Done: public/models/$(basename "$model") ($(du -h "$src" | cut -f1))"
done

# The iPhone is built in code rather than loaded, but its screen is drawn from images —
# the wallpaper and the app icons — so those travel with it.
iphone="$root/public/textures/iphone"
mkdir -p "$iphone"
cp "$assets/PhoneWallpaper.jpg" "$iphone/"
cp "$assets"/icons/*.png "$iphone/"
echo "      public/textures/iphone/ ($(ls "$iphone" | wc -l | tr -d ' ') files)"

# Both GLBs are Draco-compressed, so the decoder has to be served alongside them.
cp "$decoder"/* "$root/public/draco/"
echo "      public/draco/ ($(ls "$root/public/draco" | wc -l | tr -d ' ') files)"
