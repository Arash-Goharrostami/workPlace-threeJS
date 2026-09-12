#!/usr/bin/env python3
"""Re-encodes a directory of loose maps as WebP, in place, at a quality per role.

    python3 scripts/textures-to-webp.py <dir> [--halve <stem> ...]

Called by `extract-desk-textures.sh` and `copy-floor-tiles.sh` after they copy the JPEGs
out of their sources, so `npm run textures` and `npm run floor` write the WebPs the
material modules ask for. Resolution is kept and the JPEG removed once its WebP is
written. Normal maps get the highest quality: a lossy artefact on one shows as a shading
ripple, where the same artefact on a roughness map is invisible.

`--halve` names a map (by filename without extension) to be served at half size. It is
for the roughness maps that are pure grain — high-frequency noise no codec compresses
(the desk's metal was 342 KB as JPEG and 318 KB as WebP at 1024²) — on a surface the
camera never resolves at grain level.
"""
import sys
from pathlib import Path

from PIL import Image

QUALITY = {"normal": 85, "rough": 75}
DEFAULT_QUALITY = 80


def quality(name: str) -> int:
    for key, q in QUALITY.items():
        if key in name:
            return q
    return DEFAULT_QUALITY


def main() -> int:
    args = sys.argv[1:]
    halve = set()
    while "--halve" in args:
        at = args.index("--halve")
        halve.add(args[at + 1])
        del args[at:at + 2]
    if not args:
        print("Usage: textures-to-webp.py <dir> [--halve <stem> ...]")
        return 1

    folder = Path(args[0])
    for jpg in sorted(folder.glob("*.jpg")):
        webp = jpg.with_suffix(".webp")
        image = Image.open(jpg).convert("RGB")
        if jpg.stem in halve:
            image = image.resize((image.width // 2, image.height // 2), Image.LANCZOS)
        image.save(webp, "WEBP", quality=quality(jpg.name), method=6)
        print(f"  {jpg.name}: {jpg.stat().st_size // 1024} KB → {webp.name} {webp.stat().st_size // 1024} KB")
        jpg.unlink()
    return 0


if __name__ == "__main__":
    sys.exit(main())
