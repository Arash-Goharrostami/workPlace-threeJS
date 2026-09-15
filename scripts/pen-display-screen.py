#!/usr/bin/env python3
"""Draws a screenshot onto the pen display's screen.

    python3 scripts/pen-display-screen.py [screenshot] [top-crop]

The display's `screen` material is an atlas, and the picture is one island in its
top-left corner — the rest of the sheet dresses the bezel and the stand — so the map is
re-drawn rather than replaced: the island is found (the lit rectangle inside the black
bezel), the screenshot is cropped to the screen's 312 × 183 shape, turned to the island's
odd orientation (u runs *up* the screen, v *along* it from the viewer's right — a flip
about the anti-diagonal) and pasted in, and the whole sheet is written to
public/textures/penDisplay/screen.jpg at 2048², since the island is only 153 × 339 on the
source's 1024² sheet and the screen stands 50 cm wide. `src/penDisplay.js` swaps it in at
load time; the GLB is untouched.

`top-crop` is how many rows to take off the top of the screenshot — 8 for
tmp/blender-interface.jpeg, which carries a white strip there.
"""
import io
import os
import struct
import sys
import zlib

from PIL import Image

MODEL = 'public/models/penDisplay.glb'
OUT = 'public/textures/penDisplay/screen.jpg'
SCREEN = (312, 183)  # mm, the picture's shape
SCALE = 2

shot_path = sys.argv[1] if len(sys.argv) > 1 else 'tmp/blender-interface.jpeg'
top_crop = int(sys.argv[2]) if len(sys.argv) > 2 else 8


def atlas_from_glb(path):
    """The `screen` material's base colour image, straight out of the GLB's JSON and BIN."""
    with open(path, 'rb') as f:
        data = f.read()
    _, _, length = struct.unpack_from('<III', data, 0)
    offset = 12
    json_chunk = bin_chunk = None
    while offset < length:
        size, kind = struct.unpack_from('<II', data, offset)
        chunk = data[offset + 8:offset + 8 + size]
        if kind == 0x4E4F534A:
            json_chunk = chunk
        elif kind == 0x004E4942:
            bin_chunk = chunk
        offset += 8 + size
    import json
    gltf = json.loads(json_chunk)
    material = next(m for m in gltf['materials'] if m.get('name') == 'screen')
    texture = gltf['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
    image = gltf['images'][texture['source']]
    view = gltf['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    return Image.open(io.BytesIO(bin_chunk[start:start + view['byteLength']])).convert('RGB')


atlas = atlas_from_glb(MODEL)
px = atlas.load()


def lit(x, y):
    return sum(px[x, y]) > 30


# The island: the lit rectangle inside the black bezel of the top-left corner.
cols = [x for x in range(10, 200) if sum(lit(x, y) for y in range(60, 340)) > 200]
rows = [y for y in range(20, 400) if sum(lit(x, y) for x in range(40, 160)) > 100]
x0, x1, y0, y1 = min(cols), max(cols) + 1, min(rows), max(rows) + 1

shot = Image.open(shot_path).convert('RGB')
w, h = shot.size
shot = shot.crop((0, top_crop, w, h))
w, h = shot.size
# Trimmed at the sides to the screen's shape, so the picture is not squashed onto it.
fit = int(round(h * SCREEN[0] / SCREEN[1]))
if fit < w:
    shot = shot.crop(((w - fit) // 2, 0, (w - fit) // 2 + fit, h))
shot = shot.transpose(Image.Transpose.TRANSVERSE)

sheet = atlas.resize((atlas.width * SCALE, atlas.height * SCALE), Image.LANCZOS)
panel = shot.resize(((x1 - x0) * SCALE, (y1 - y0) * SCALE), Image.LANCZOS)
sheet.paste(panel, (x0 * SCALE, y0 * SCALE))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
sheet.save(OUT, quality=82, optimize=True, progressive=True)
print(f'island {x1 - x0} × {y1 - y0} at ({x0}, {y0}); {OUT}: {os.path.getsize(OUT) // 1024} KB')
