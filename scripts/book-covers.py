#!/usr/bin/env python3
"""Composes the custom cover textures for public/models/books.glb.

    python3 scripts/book-covers.py

The Random_Books source maps each book's cover mesh onto one 1024x512 image laid out
as  [ back cover | spine | front cover ]  along u (from the UVs: back u 0–0.458, spine
0.458–0.542, front 0.542–1), and — as the converter stored it — flipped top to bottom:
the text reads left to right with the letters upside down. It is a flip, not a 180°
turn; a turn would mirror the covers. So a custom cover is that layout, built from one
front-cover image: the image is fitted into the front region, the spine and back are
filled with the cover's dominant colour, and the sheet is flipped to match the store.

Sources are the jpgs in tmp/3DObjects/; the result goes to tmp/covers/<material>.webp
— WebP at the same quality is about a third smaller than the JPEG the rest of the
pipeline writes, and the covers are most of books.glb — and is baked into the GLB by
scripts/bake-book-covers.mjs.
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tmp" / "3DObjects"
OUT = ROOT / "tmp" / "covers"

W, H = 1024, 512
# The three regions along u, in pixels. The final flip is vertical, so it leaves them
# where they are.
BACK = (0, int(W * 0.458))
SPINE = (int(W * 0.458), int(W * 0.542))
FRONT = (int(W * 0.542), W)

# material in books.glb  ->  the front-cover image it gets.
COVERS = {
    "BookCover4": "am5o22l17ol7.jpg",                        # Cambridge IELTS Academic 19
    "BookCover2": "61ViPUXS8ZL._AC_UF1000,1000_QL80_.jpg",   # Python Programming
    "BookCover10": "81unYzab9VL._AC_UF1000,1000_QL80_.jpg",  # Legendary
    "BookCover12": "59808050.jpg",                           # Daisy Darker
}


def dominant(im):
    """The cover's overall colour: the image shrunk to a pixel, darkened a touch."""
    r, g, b = im.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    return tuple(int(c * 0.85) for c in (r, g, b))


def compose(front):
    sheet = Image.new("RGB", (W, H), dominant(front))

    # Back: the same colour, with a soft, dark echo of the front so it is not flat.
    back_w = BACK[1] - BACK[0]
    echo = front.resize((back_w, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(24))
    echo = Image.blend(Image.new("RGB", echo.size, sheet.getpixel((0, 0))), echo, 0.25)
    sheet.paste(echo, (BACK[0], 0))

    # Spine: a slightly darker band, so the edge reads against the desk.
    dark = tuple(int(c * 0.8) for c in sheet.getpixel((0, 0)))
    sheet.paste(Image.new("RGB", (SPINE[1] - SPINE[0], H), dark), (SPINE[0], 0))

    # Front: fitted to the region, stretched the little a cover needs — the meshes are
    # near enough the covers' own aspect that it does not show.
    front_w = FRONT[1] - FRONT[0]
    sheet.paste(front.resize((front_w, H), Image.LANCZOS), (FRONT[0], 0))

    return sheet.transpose(Image.FLIP_TOP_BOTTOM)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for material, name in COVERS.items():
        front = Image.open(SRC / name).convert("RGB")
        out = OUT / f"{material}.webp"
        compose(front).save(out, quality=85, method=6)
        print(f"{out.relative_to(ROOT)}  ({out.stat().st_size // 1024} KB)  <- {name}")


if __name__ == "__main__":
    main()
