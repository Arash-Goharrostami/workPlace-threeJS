#!/usr/bin/env bash
# Copies the Apple models and three's Draco decoder into public/, so the viewer has
# no runtime dependency on the WorkDesk3D project.
# Usage: import-apple-models.sh [path/to/WorkDesk3D/assets]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=model-name.sh
source "$root/scripts/model-name.sh"
assets="${1:-$HOME/Develop/WorkDesk3D/assets}"
decoder="$root/node_modules/three/examples/jsm/libs/draco/gltf"

# The pack's `3d-printer` is deliberately absent: the printer now comes from
# `npm run convert 3D_Printer`, a far more detailed model of the same machine, and
# both write public/models/printer3d.glb — leaving it here would silently put the
# low-poly one back the next time this script runs.
models=(
  "macbook-pro-16/macbook-pro-16.glb"
  "pro-display-xdr/pro-display-xdr.glb"
  "magic-keyboard/magic-keyboard.glb"
  "magic-trackpad/magic-trackpad.glb"
  "magic-mouse/magic-mouse.obj"
  "guitar-on-stand/guitar-on-stand.glb"
  "carpet/carpet.glb"
  "ipad-pro/ipad-pro.glb"
  "apple-pencil/apple-pencil.glb"
  "apple-watch-se/apple-watch-se.glb"
)

[ -d "$decoder" ] || { echo "Draco decoder missing — run npm install first"; exit 1; }
mkdir -p "$root/public/models" "$root/public/draco"

# The pack names these after Apple's own product slugs; public/models/ is camelCase, so
# each one is renamed on the way in rather than copied under its source name.
for model in "${models[@]}"; do
  src="$assets/$model"
  [ -f "$src" ] || { echo "Model not found: $src"; exit 1; }
  file="$(basename "$model")"
  name="$(model_name "${file%.*}")"

  # The mouse is the pack's one OBJ, and an OBJ spells every coordinate out in ASCII —
  # 1.97 MB for a model that is 75 KB as a compressed GLB. Converting on the way in is
  # what stops this step from putting the heavy version back.
  if [ "${file##*.}" = "obj" ]; then
    cp "$src" "$root/public/models/$name.obj"
    node "$root/scripts/obj-to-glb.mjs" "$root/public/models/$name.obj" \
      "$root/public/models/$name.glb" >/dev/null
    rm -f "$root/public/models/$name.obj"
    node "$root/scripts/shrink-glb.mjs" "$name" 512 >/dev/null
    echo "Done: public/models/$name.glb (converted from $file)"
    continue
  fi

  cp "$src" "$root/public/models/$name.${file##*.}"
  echo "Done: public/models/$name.${file##*.} ($(du -h "$src" | cut -f1))"
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
