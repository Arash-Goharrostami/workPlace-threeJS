#!/usr/bin/env python3
"""Pulls the room's concrete wall map out of the Gallery bare concrete wall usdz.

The usdz carries two 2048² base-colour images and nothing else — no normal or
roughness maps. `material1_baseColor.jpg` is the large panel; it sits on a grey
background with ragged edges, so only its clean interior is kept.

Usage: extract-wall-texture.py [path/to/gallery.usdz]
"""
import sys
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_USDZ = ROOT / "tmp" / "Gallery_bare_concrete_wall.usdz"
STAGING = ROOT / "tmp" / "extracted" / "Gallery"
OUT = ROOT / "public" / "textures" / "wall" / "Concrete_baseColor.jpg"

SOURCE = "0/material1_baseColor.jpg"

# Interior of the concrete panel: inside the seam line on the left, below the top
# edge, and above the point where the panel frays out into the grey background.
CROP = (120, 80, 2040, 1230)


def main() -> int:
    usdz = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_USDZ
    if not usdz.is_file():
        print(f"Gallery usdz not found: {usdz}")
        return 1

    STAGING.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(usdz) as archive:
        archive.extract(SOURCE, STAGING)

    image = Image.open(STAGING / SOURCE).convert("RGB").crop(CROP)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, quality=90, optimize=True)

    print(f"Done: {OUT} ({image.width}x{image.height}, {OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
