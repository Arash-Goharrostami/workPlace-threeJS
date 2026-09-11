#!/usr/bin/env node
/**
 * Converts a Wavefront OBJ into a GLB.
 *
 *     node scripts/obj-to-glb.mjs <file.obj> [out.glb]
 *
 * Written for `magicMouse.obj`, the one model that arrived as an OBJ. At 1.97 MB it was
 * the largest file in `public/models/` for its detail, and the reason is the format: an
 * OBJ stores every coordinate as ASCII text, so 12,857 positions, 12,922 normals and
 * 10,226 UVs cost more than a quarter-million-triangle GLB does. Fully optimised — the
 * unused materials dropped, the UVs dropped, the floats rounded — it still only came down
 * to 813 KB. As a Draco-compressed GLB it is a fraction of that.
 *
 * Conversion is done here rather than in Blender because the parse is needed anyway to
 * re-index, and because the material names have to survive verbatim: `src/mouseArea.js`
 * picks the mouse's skin out by matching on `glass_top`, `glass_edges` and `aluminium`.
 * An exporter is free to rename or merge those; this is not.
 *
 * Every material is kept, including the six that module currently discards, so the file
 * stays a complete Magic Mouse rather than a snapshot of what one caller happens to want.
 *
 * Only geometry is carried over: `v`/`vn`/`vt`/`f`/`usemtl`, triangulated by fan. The
 * `.mtl` is not read — this project's OBJ never shipped one, and the materials it does
 * define are built in code.
 */
import fs from 'node:fs';
import path from 'node:path';

const [input, outputArg] = process.argv.slice(2);
if (!input) {
  console.error('Usage: obj-to-glb.mjs <file.obj> [out.glb]');
  process.exit(1);
}
const output = outputArg ?? input.replace(/\.obj$/i, '.glb');

const positions = [];
const normals = [];
const uvs = [];
/** One entry per `usemtl` run, in file order; runs with the same name are merged below. */
const groups = new Map();
let current = 'default';

for (const line of fs.readFileSync(input, 'utf8').split('\n')) {
  const parts = line.trim().split(/\s+/);
  switch (parts[0]) {
    case 'v': positions.push(parts.slice(1, 4).map(Number)); break;
    case 'vn': normals.push(parts.slice(1, 4).map(Number)); break;
    case 'vt': uvs.push(parts.slice(1, 3).map(Number)); break;
    case 'usemtl': current = parts[1] ?? 'default'; break;
    case 'f': {
      const corners = parts.slice(1).map(parse);
      // OBJ faces may be any convex polygon; a fan is the standard triangulation and is
      // what every loader this file has been through already applied.
      for (let i = 1; i < corners.length - 1; i++) {
        (groups.get(current) ?? groups.set(current, []).get(current))
          .push(corners[0], corners[i], corners[i + 1]);
      }
      break;
    }
  }
}

/** `v`, `v/vt`, `v//vn` or `v/vt/vn`, with 1-based indices that may be negative. */
function parse(token) {
  const [v, vt, vn] = token.split('/');
  const at = (value, list) => {
    if (!value) return -1;
    const i = Number(value);
    return i > 0 ? i - 1 : list.length + i;
  };
  return { v: at(v, positions), vt: at(vt, uvs), vn: at(vn, normals) };
}

const hasNormals = [...groups.values()].some((c) => c.some((corner) => corner.vn >= 0));
const hasUVs = [...groups.values()].some((c) => c.some((corner) => corner.vt >= 0));

// One primitive per material. Each is welded on the (position, normal, uv) triple, which
// is the same vertex identity glTF uses — a shared OBJ position with two different
// normals is two glTF vertices, and merging them would flatten the shading.
const primitives = [];
const chunks = [];
let offset = 0;
const accessors = [];
const bufferViews = [];

for (const [material, corners] of groups) {
  const seen = new Map();
  const index = [];
  const vertices = [];
  for (const corner of corners) {
    const key = `${corner.v}/${corner.vn}/${corner.vt}`;
    let at = seen.get(key);
    if (at === undefined) {
      at = vertices.length;
      seen.set(key, at);
      vertices.push(corner);
    }
    index.push(at);
  }

  const attributes = {};
  attributes.POSITION = pushAccessor(
    new Float32Array(vertices.flatMap((c) => positions[c.v] ?? [0, 0, 0])),
    'VEC3', 5126, 34962, vertices.length
  );
  if (hasNormals) {
    attributes.NORMAL = pushAccessor(
      new Float32Array(vertices.flatMap((c) => normals[c.vn] ?? [0, 1, 0])),
      'VEC3', 5126, 34962, vertices.length
    );
  }
  if (hasUVs) {
    attributes.TEXCOORD_0 = pushAccessor(
      new Float32Array(vertices.flatMap((c) => uvs[c.vt] ?? [0, 0])),
      'VEC2', 5126, 34962, vertices.length
    );
  }
  const indices = pushAccessor(
    vertices.length > 65535 ? new Uint32Array(index) : new Uint16Array(index),
    'SCALAR', vertices.length > 65535 ? 5125 : 5123, 34963, index.length
  );

  primitives.push({ attributes, indices, material: primitives.length, mode: 4 });
  console.log(`  ${material}: ${index.length / 3} triangles, ${vertices.length} vertices`);
}

/** Copies one typed array into the binary chunk and returns its accessor index. */
function pushAccessor(array, type, componentType, target, count) {
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  // glTF requires each accessor's view to start on a multiple of its component size; 4
  // satisfies every type used here.
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  chunks.push(bytes);
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
  offset += bytes.length;

  const accessor = { bufferView: bufferViews.length - 1, componentType, count, type };
  // POSITION is the one accessor glTF requires min/max on — viewers use it for bounds.
  if (type === 'VEC3' && target === 34962 && accessors.length % (hasNormals ? 2 : 1) === 0) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < array.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], array[i + a]);
        max[a] = Math.max(max[a], array[i + a]);
      }
    }
    accessor.min = min;
    accessor.max = max;
  }
  accessors.push(accessor);
  return accessors.length - 1;
}

const json = {
  asset: { version: '2.0', generator: 'obj-to-glb.mjs' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: path.basename(output, '.glb') }],
  meshes: [{ name: path.basename(output, '.glb'), primitives }],
  materials: [...groups.keys()].map((name) => ({
    name,
    doubleSided: true,
    pbrMetallicRoughness: {},
  })),
  accessors,
  bufferViews,
  buffers: [{ byteLength: offset }],
};

const binOut = Buffer.concat(chunks);
// JSON pads with spaces and the binary chunk with zeros — the spec is specific about it.
const jsonOut = pad(Buffer.from(JSON.stringify(json)), 0x20);
const binPadded = pad(binOut, 0x00);

function pad(buffer, byte) {
  const extra = (4 - (buffer.length % 4)) % 4;
  return extra ? Buffer.concat([buffer, Buffer.alloc(extra, byte)]) : buffer;
}

const total = 12 + 8 + jsonOut.length + 8 + binPadded.length;
const glb = Buffer.alloc(total);
glb.write('glTF', 0, 'ascii');
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(total, 8);
glb.writeUInt32LE(jsonOut.length, 12);
glb.write('JSON', 16, 'ascii');
jsonOut.copy(glb, 20);
const binHeader = 20 + jsonOut.length;
glb.writeUInt32LE(binPadded.length, binHeader);
glb.write('BIN\0', binHeader + 4, 'ascii');
binPadded.copy(glb, binHeader + 8);

fs.writeFileSync(output, glb);
const before = fs.statSync(input).size;
console.log(
  `${input} → ${output}: ${(before / 1e6).toFixed(2)} MB → ` +
  `${(glb.length / 1e6).toFixed(2)} MB, ${groups.size} materials`
);
