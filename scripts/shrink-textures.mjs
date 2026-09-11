#!/usr/bin/env node
/**
 * Re-encodes a directory of textures in place.
 *
 *     node scripts/shrink-textures.mjs <dir> [maxSize=1024] [quality=80]
 *
 * The counterpart to `shrink-glb.mjs` for the maps that are served as loose files rather
 * than embedded in a model — `public/textures/desk/`, whose two normal maps arrive from
 * the Computer Workspace Pack at a JPEG quality far past what they need: 530 KB and
 * 448 KB for 1024x1024 images that are 79 KB and 39 KB at q80. That is most of a
 * megabyte for **no loss of resolution at all**, which is why the default here
 * re-encodes rather than downsamples, and why `maxSize` is a ceiling rather than a
 * target.
 *
 * Anything with alpha stays PNG; everything else becomes JPEG. A result that came out no
 * smaller than the file it replaces is discarded, so this is safe to run repeatedly and
 * cannot ratchet quality down over successive runs — which matters, because
 * `extract-desk-textures.sh` calls it every time it refreshes the directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

/** Prints `<from> <to> <extension>`, or `skip` when there is nothing worth doing. */
const PYTHON = `
import sys
from PIL import Image

src, dst, limit, quality = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
image = Image.open(src)
was = image.format

if image.mode in ('P', 'PA') and 'transparency' in image.info:
    image = image.convert('RGBA')
elif image.mode == 'P':
    image = image.convert('RGB')

width, height = image.size
alpha = 'A' in image.getbands()

# A 1x1 map is a constant the pack stores as an image; leave it be.
if max(width, height) <= 1:
    print('skip')
    sys.exit()

if max(width, height) > limit:
    scale = limit / max(width, height)
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    image = image.resize(size, Image.LANCZOS)
else:
    size = (width, height)

if alpha:
    image.save(dst, 'PNG', optimize=True)
    ext = 'png'
else:
    image.convert('RGB').save(dst, 'JPEG', quality=quality, optimize=True)
    ext = 'jpg'

print(f'{width}x{height} {size[0]}x{size[1]} {ext}')
`;

const [dir, sizeArg = '1024', qualityArg = '80'] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: shrink-textures.mjs <dir> [maxSize] [quality]');
  process.exit(1);
}
if (!fs.existsSync(dir)) {
  console.error(`No such directory: ${dir}`);
  process.exit(1);
}

const maxSize = Number(sizeArg);
const quality = Number(qualityArg);
const IMAGES = new Set(['.jpg', '.jpeg', '.png']);

let before = 0;
let after = 0;

for (const name of fs.readdirSync(dir).sort()) {
  const file = path.join(dir, name);
  if (!IMAGES.has(path.extname(name).toLowerCase())) continue;
  if (!fs.statSync(file).isFile()) continue;

  const size = fs.statSync(file).size;
  before += size;
  after += size;

  const output = path.join(os.tmpdir(), `shrink-texture-${name}`);
  let report;
  try {
    report = execFileSync(
      'python3',
      ['-c', PYTHON, file, output, String(maxSize), String(quality)],
      { encoding: 'utf8' }
    ).trim();
  } catch {
    console.error(`  ${name}: could not be read — left alone`);
    continue;
  }

  try {
    if (report === 'skip') continue;
    const [from, to, ext] = report.split(' ');
    const written = fs.statSync(output).size;
    // Never take a result that is no smaller, and never change a file's extension out
    // from under the code that names it: `deskMaterials.js` asks for these by filename.
    if (written >= size || `.${ext}` !== path.extname(name).toLowerCase().replace('.jpeg', '.jpg')) {
      continue;
    }
    fs.copyFileSync(output, file);
    after += written - size;
    console.log(`  ${name}: ${from} → ${to}  ${kb(size)} → ${kb(written)}`);
  } finally {
    fs.rmSync(output, { force: true });
  }
}

console.log(`${dir}: ${kb(before)} → ${kb(after)}`);

function kb(bytes) {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;
}
