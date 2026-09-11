#!/usr/bin/env node
/**
 * Shrinks a GLB in place: downsizes its embedded textures, then Draco-compresses its
 * geometry.
 *
 *     node scripts/shrink-glb.mjs <name|file.glb> [maxTextureSize=1024] [quality=85] \\
 *         [simplifyRatio]
 *
 * Sketchfab sources are authored for a turntable render, not for a desk prop seen from a
 * metre away: the ScreenBar remote ships a 4096² base colour for a 7.5 cm puck, and every
 * model in this scene stores its vertices as raw float32. Both are paid for on every page
 * load, and the texture is paid for again in VRAM — a 4096² map decodes to 64 MB there
 * whatever it cost on the wire.
 *
 * So this does the two things that actually move the number:
 *
 *  0. with `--no-textures`, the images are dropped outright — for a model whose materials
 *     are replaced at load time, they are pure download weight;
 *  1. otherwise every embedded image larger than `maxTextureSize` is resampled down to it (Lanczos,
 *     via Pillow — `scripts/extract-wall-texture.py` already leans on the same python),
 *     re-encoded as JPEG unless it carries alpha, in which case it stays PNG;
 *  2. `@gltf-transform/cli` cleans and compresses the meshes with Draco, and — only when
 *     a simplify ratio is passed — decimates them first.
 *
 * Draco needs no runtime change: `src/gltfLoader.js` already attaches a shared
 * `DRACOLoader` pointing at `public/draco/`, so a compressed GLB simply loads.
 *
 * The untouched original is kept in `tmp/originals/<name>.orig.glb` — reverting is one
 * `mv` back. It lives there rather than beside the model because `public/` is what Vite
 * copies into `dist/`, so a backup kept next to its model ships with the build; `tmp/`
 * already holds the `.usdz` sources and is already ignored.
 *
 * That backup is written once, so re-running with a different size still compares against
 * the true original rather than the last attempt.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

/** Prints `<fromSize> <toSize> <mimeType>`, or `skip` if the image is already small. */
const PYTHON = `
import sys
from PIL import Image

src, dst, limit, quality = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
image = Image.open(src)
was = image.format

# A palette image can carry its alpha in a \`transparency\` key rather than a band, and
# \`getbands()\` reports it as ('P',) — flattening one to JPEG silently drops the cut-out.
# Normalising first is what makes the alpha check below tell the truth.
if image.mode in ('P', 'PA') and 'transparency' in image.info:
    image = image.convert('RGBA')
elif image.mode == 'P':
    image = image.convert('RGB')

width, height = image.size
alpha = 'A' in image.getbands()

# Two independent reasons to touch it: too big, or PNG that owes nothing to its alpha.
oversize = max(width, height) > limit
recodable = was == 'PNG' and not alpha
if not oversize and not recodable:
    print('skip')
    sys.exit()

if oversize:
    scale = limit / max(width, height)
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    image = image.resize(size, Image.LANCZOS)
else:
    size = (width, height)

if alpha:
    image.save(dst, 'PNG', optimize=True)
    mime = 'image/png'
else:
    image.convert('RGB').save(dst, 'JPEG', quality=quality, optimize=True)
    mime = 'image/jpeg'

print(f'{width}x{height} {size[0]}x{size[1]} {mime}')
`;

const args = process.argv.slice(2);
/**
 * Drops the model's textures instead of resampling them, for a model whose materials are
 * replaced at load time — `desk.glb` carries three 2048x2048 maps that
 * `src/deskMaterials.js` overwrites the moment it loads, so they are 4.6 MB of download
 * and decode for nothing. Taken as a flag rather than a position so it can sit anywhere.
 */
const dropTextures = args.includes('--no-textures');
/**
 * Coarser Draco quantization — 12-bit positions instead of the default 14, and fewer bits
 * for normals and UVs. Worth about a tenth of the geometry, and invisible on a prop that
 * is never inspected closely: 12 bits still resolves a 1 m object to a quarter of a
 * millimetre. Opt-in, because it is a real (if tiny) loss of precision and because
 * changing the default would silently re-cut every model already shrunk.
 */
const coarse = args.includes('--coarse');
/**
 * `--only a,b` keeps the meshes on nodes whose name starts with one of the given prefixes
 * and strips the rest, for a model where most of what is in the file is never rendered.
 *
 * `powerCable.glb` is the case it was written for: 95% of its 240,032 triangles are three
 * `curve3` meshes drawing the cable itself, and nothing loads them — `src/mainsCable.js`
 * and `src/macProCable.js` take only the `polySurface89` plug and `polySurface90` socket
 * from it and draw the run between them with `buildCable()`.
 *
 * A prefix rather than an exact name because that is how those modules already look parts
 * up: `getObjectByName(part) ?? getObjectByName(`${part}_phong4_0`)`. Stripping the mesh
 * is all this does; `prune` then collects the orphaned meshes, accessors and the emptied
 * nodes.
 */
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? (args[onlyAt + 1] ?? '').split(',').filter(Boolean) : [];
const [target, sizeArg = '1024', qualityArg = '85', ratioArg = ''] = args.filter(
  (arg, i) => !arg.startsWith('--') && !(onlyAt >= 0 && i === onlyAt + 1)
);
if (!target) {
  console.error(
    'Usage: shrink-glb.mjs <name|file.glb> [maxTextureSize] [quality] [simplifyRatio] ' +
    '[--no-textures] [--coarse] [--only prefix,prefix]'
  );
  process.exit(1);
}

const maxSize = Number(sizeArg);
const quality = Number(qualityArg);
/** Fraction of triangles to keep, or 0 to leave the topology alone. See `STEPS` below. */
const ratio = ratioArg ? Number(ratioArg) : 0;
const file = target.endsWith('.glb')
  ? target
  : path.join('public/models', `${resolveName(target)}.glb`);
if (!fs.existsSync(file)) {
  console.error(`No such model: ${file}`);
  process.exit(1);
}

const backup = path.join('tmp/originals', `${path.basename(file, '.glb')}.orig.glb`);
fs.mkdirSync(path.dirname(backup), { recursive: true });
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
const before = fs.statSync(backup).size;

// ── 1. textures ──────────────────────────────────────────────────────────────────────
// The original is the input every time, so a re-run never resamples an already-resampled
// image.
const glb = fs.readFileSync(backup);

// GLB: a 12-byte header, then length-prefixed chunks — JSON first, binary second.
const HEADER = 12;
const CHUNK_HEADER = 8;
const jsonLength = glb.readUInt32LE(HEADER);
const json = JSON.parse(
  glb.subarray(HEADER + CHUNK_HEADER, HEADER + CHUNK_HEADER + jsonLength).toString()
);
const binStart = HEADER + CHUNK_HEADER + jsonLength;
const binLength = glb.readUInt32LE(binStart);
const bin = glb.subarray(binStart + CHUNK_HEADER, binStart + CHUNK_HEADER + binLength);

const views = json.bufferViews ?? [];
/** New bytes for the views that hold an image, keyed by view index. */
const replaced = new Map();

// Clearing the slots is all this has to do: `prune`, already in `STEPS`, then collects
// the textures, samplers and images nobody points at any more.
if (dropTextures) {
  const SLOTS = ['normalTexture', 'occlusionTexture', 'emissiveTexture'];
  const PBR_SLOTS = ['baseColorTexture', 'metallicRoughnessTexture'];
  for (const material of json.materials ?? []) {
    for (const slot of SLOTS) delete material[slot];
    for (const slot of material.pbrMetallicRoughness ? PBR_SLOTS : []) {
      delete material.pbrMetallicRoughness[slot];
    }
  }
  console.log(`  dropped ${(json.images ?? []).length} textures the materials never use`);
}

if (only.length) {
  // A match keeps its whole subtree, because the name a module looks up is often a parent
  // rather than the mesh itself: `usbCable.glb`'s connector is the node `Cube_002_8`, and
  // its four meshes hang off it as `Object_4` … `Object_7`. Matching only mesh-bearing
  // nodes would have stripped every one of them.
  const nodes = json.nodes ?? [];
  const keep = new Set();
  const take = (index) => {
    if (keep.has(index)) return;
    keep.add(index);
    for (const child of nodes[index]?.children ?? []) take(child);
  };
  nodes.forEach((node, index) => {
    if (only.some((prefix) => (node.name ?? '').startsWith(prefix))) take(index);
  });

  let stripped = 0;
  nodes.forEach((node, index) => {
    if (node.mesh === undefined || keep.has(index)) return;
    delete node.mesh;
    stripped++;
  });
  console.log(
    `  stripped ${stripped} meshes, keeping ${keep.size} nodes under ${only.join(', ')}`
  );
}

for (const image of dropTextures ? [] : json.images ?? []) {
  if (image.bufferView === undefined) continue;
  const view = views[image.bufferView];
  const start = view.byteOffset ?? 0;
  const source = bin.subarray(start, start + view.byteLength);
  const { bytes, mimeType, from, to } = resample(source);
  if (!bytes || bytes.length >= source.length) continue;
  replaced.set(image.bufferView, bytes);
  image.mimeType = mimeType;
  console.log(
    `  ${image.name ?? '(unnamed)'}: ${from} → ${to}  ` +
    `${kb(source.length)} → ${kb(bytes.length)}`
  );
}

// Repacking: the views are copied out in order, so an image that changed length shifts
// every view after it and their offsets have to be rewritten.
const chunks = [];
let offset = 0;
views.forEach((view, index) => {
  const start = view.byteOffset ?? 0;
  const bytes = replaced.get(index) ?? bin.subarray(start, start + view.byteLength);
  chunks.push(bytes);
  view.byteOffset = offset;
  view.byteLength = bytes.length;
  offset += bytes.length;
  // glTF requires accessor-backed views to start on a 4-byte boundary; padding the buffer
  // between them is how the spec's own exporters do it.
  const extra = (4 - (offset % 4)) % 4;
  if (extra) {
    chunks.push(Buffer.alloc(extra));
    offset += extra;
  }
});

const binOut = Buffer.concat(chunks);
json.buffers = [{ byteLength: binOut.length }];

// JSON pads with spaces and the binary chunk with zeros — the spec is specific about it.
const jsonOut = pad(Buffer.from(JSON.stringify(json)), 0x20);
const binPadded = pad(binOut, 0x00);

const total = HEADER + CHUNK_HEADER + jsonOut.length + CHUNK_HEADER + binPadded.length;
const out = Buffer.alloc(total);
out.write('glTF', 0, 'ascii');
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
out.writeUInt32LE(jsonOut.length, 12);
out.write('JSON', 16, 'ascii');
jsonOut.copy(out, 20);
const binHeader = 20 + jsonOut.length;
out.writeUInt32LE(binPadded.length, binHeader);
out.write('BIN\0', binHeader + 4, 'ascii');
binPadded.copy(out, binHeader + 8);

fs.writeFileSync(file, out);
const afterTextures = out.length;
// With --no-textures the images are still sitting in the binary here — only the material
// slots were cleared — so this stage shows no saving and `prune` collects them below.
if (!dropTextures) console.log(`Textures: ${kb(before)} → ${kb(afterTextures)}`);

// ── 2. geometry ──────────────────────────────────────────────────────────────────────
// Cleaned before it is compressed, because all three cleanups make the compression
// better and none of them change how the model looks:
//
//   prune  drops what nothing references — macPro.glb alone carried sixteen dead 1x1
//          placeholder PNGs its exporter left behind. It also drops unused vertex
//          attributes, which is worth real bytes: macbookPro16.glb carries UV sets no
//          material reads. The exception is `--no-textures`, where the materials that
//          referenced those UVs have just been cleared and prune would take a set that
//          is still wanted at runtime — `src/deskMaterials.js` pins the desk frame's
//          metal maps to TEXCOORD_0 — so there, and only there, they are kept;
//   dedup  merges accessors, textures and meshes that are byte-identical — but NOT
//          materials, because a material's name is load-bearing here and merging throws
//          it away. `magicMouse.glb` has nine materials that differ only by name (their
//          finishes are built in code), and deduping them collapsed all nine into one,
//          leaving `src/mouseArea.js` unable to find `glass_top` or `aluminium`.
//          `src/floorSocket.js` looks up `CAJA` the same way. The saving was bytes of
//          JSON; the failure was a missing prop. Texture dedup is off for a duller
//          reason: its JPEG parser rejects re-encoded maps that macOS's own decoder and
//          a strict marker walk both accept ("Invalid JPG, marker table corrupted", on
//          macbookPro16.glb), and merging byte-identical images is worth less than a
//          pipeline that always runs. `prune` still drops the ones nobody uses;
//   weld   merges vertices that sit in the same place with the same attributes, which is
//          the one that matters — Draco codes a welded mesh far more tightly, and
//          `simplify` refuses to run on an unwelded mesh at all.
//
// `simplify` is the exception: it throws triangles away, so it only runs when a ratio is
// asked for. Everything above is safe to run on anything; this one is a judgement call
// about a particular model, which is why it is not a default. The error bound is loose
// enough that the ratio is what actually governs the result.
const STEPS = [
  ['prune', ...(dropTextures ? ['--keep-attributes', 'true'] : [])],
  ['dedup', '--materials', 'false', '--textures', 'false'],
  ['weld'],
  // Run twice when a ratio is asked for. meshoptimizer is greedy: one pass stops at a
  // local floor well short of the ratio — the guitar answered 0.08 with 0.37 — and a
  // second pass over the collapsed mesh finds edges the first could not see. It
  // self-limits, so a model already at its floor is unchanged by the repeat.
  ...(ratio
    ? [
        ['simplify', '--ratio', String(ratio), '--error', '0.005'],
        ['simplify', '--ratio', String(ratio), '--error', '0.005'],
      ]
    : []),
  coarse
    ? ['draco', '--quantize-position', '12', '--quantize-normal', '8',
       '--quantize-texcoord', '10']
    : ['draco'],
];

// Run through temp files: gltf-transform will not read and write the same path.
let input = file;
// The index is in the temp name because a step can appear twice — `simplify` does — and
// two turns sharing one path would have gltf-transform read and write the same file.
for (const [index, [step, ...flags]] of STEPS.entries()) {
  const staged = path.join(os.tmpdir(), `shrink-${index}-${step}-${path.basename(file)}`);
  try {
    // gltf-transform reports its failures on stdout, not stderr, so capturing it is the
    // only way a failing step says why — swallowing it turns "Invalid JPG, marker table
    // corrupted" into a bare "draco failed".
    execFileSync('npx', ['--yes', '@gltf-transform/cli', step, input, staged, ...flags], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const said = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    console.error(`\`${step}\` failed — the texture-shrunk file is still in place.`);
    if (said) console.error(said);
    process.exit(1);
  }
  if (input !== file) fs.rmSync(input, { force: true });
  input = staged;
}
fs.copyFileSync(input, file);
fs.rmSync(input, { force: true });

const after = fs.statSync(file).size;
console.log(`Geometry: ${kb(afterTextures)} → ${kb(after)}`);
console.log(
  `${file}: ${kb(before)} → ${kb(after)}  ` +
  `(${(before / after).toFixed(1)}× smaller; original kept as ${backup})`
);

/**
 * Takes either name — a model's source name or the camelCase one it is served under — and
 * gives back the served one, so `npm run shrink Mac_Pro` and `npm run shrink macPro` both
 * work. The map is `scripts/model-names.txt`, the same file the two import scripts read.
 */
function resolveName(name) {
  const map = path.join(path.dirname(new URL(import.meta.url).pathname), 'model-names.txt');
  for (const line of fs.readFileSync(map, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [from, to] = line.split('\t');
    if (from === name) return to;
  }
  return name;
}

/**
 * Re-encodes one image: down to `maxSize` on its longest side if it is over it, and out
 * of PNG into JPEG whenever it has no alpha to lose.
 *
 * Being already small enough is not a reason to leave it alone. The Pro Display ships two
 * 512x512 PNGs that weigh 470 KB and 384 KB between them — a size this script would once
 * have skipped, for maps that are 30 KB as JPEG. Re-encoding is most of the win on any
 * model that was exported straight to PNG.
 *
 * Anything with alpha stays PNG — a JPEG would drop the channel and take a cut-out
 * texture's mask with it, which is exactly what the Mac Pro's BLEND-mode panels need.
 *
 * Returns empty when there was nothing to do, and the caller drops any result that came
 * out no smaller than the source, so a re-encode can never make a file worse.
 */
function resample(source) {
  const input = path.join(os.tmpdir(), 'shrink-in');
  const output = path.join(os.tmpdir(), 'shrink-out');
  fs.writeFileSync(input, source);
  try {
    const report = execFileSync(
      'python3',
      ['-c', PYTHON, input, output, String(maxSize), String(quality)],
      { encoding: 'utf8' }
    ).trim();
    if (report === 'skip') return {};
    const [from, to, mimeType] = report.split(' ');
    return { bytes: fs.readFileSync(output), mimeType, from, to };
  } finally {
    fs.rmSync(input, { force: true });
    fs.rmSync(output, { force: true });
  }
}

function pad(buffer, byte) {
  const extra = (4 - (buffer.length % 4)) % 4;
  return extra ? Buffer.concat([buffer, Buffer.alloc(extra, byte)]) : buffer;
}

function kb(bytes) {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;
}
