#!/usr/bin/env node
/**
 * Drops named images out of a GLB, in place.
 *
 *     node scripts/strip-glb-image.mjs <file.glb> <imageName…>
 *
 * Some Sketchfab sources ship a texture that costs more than the rest of the model put
 * together — the ScreenBar remote's metallic/roughness PNG is 12.8 MB against a 1 MB
 * base colour — and the scene is better served by a constant in the material than by
 * downloading it. This removes the image, every texture that pointed at it and every
 * material slot that used that texture, then repacks the binary chunk without the
 * bufferViews they owned.
 *
 * Only the top-level PBR/material texture slots are handled; extensions that carry their
 * own texture references are left alone, so check the output if a model uses them.
 */
import fs from 'node:fs';

const [file, ...names] = process.argv.slice(2);
if (!file || !names.length) {
  console.error('Usage: strip-glb-image.mjs <file.glb> <imageName…>');
  process.exit(1);
}

const glb = fs.readFileSync(file);
const before = glb.length;

// GLB: a 12-byte header, then length-prefixed chunks — JSON first, binary second.
const HEADER = 12;
const CHUNK_HEADER = 8;
const jsonLength = glb.readUInt32LE(HEADER);
const json = JSON.parse(glb.subarray(HEADER + CHUNK_HEADER, HEADER + CHUNK_HEADER + jsonLength).toString());
const binStart = HEADER + CHUNK_HEADER + jsonLength;
const binLength = glb.readUInt32LE(binStart);
const bin = glb.subarray(binStart + CHUNK_HEADER, binStart + CHUNK_HEADER + binLength);

const doomedImages = new Set(
  (json.images ?? []).map((image, i) => [image, i]).filter(([image]) => names.includes(image.name)).map(([, i]) => i)
);
if (!doomedImages.size) {
  console.error(`No image named ${names.join(', ')} in ${file}`);
  process.exit(1);
}

const doomedTextures = new Set(
  (json.textures ?? []).map((texture, i) => [texture, i])
    .filter(([texture]) => doomedImages.has(texture.source))
    .map(([, i]) => i)
);

// Every slot on every material that pointed at one of those textures.
const SLOTS = ['normalTexture', 'occlusionTexture', 'emissiveTexture'];
const PBR_SLOTS = ['baseColorTexture', 'metallicRoughnessTexture'];
for (const material of json.materials ?? []) {
  for (const slot of SLOTS) {
    if (material[slot] && doomedTextures.has(material[slot].index)) delete material[slot];
  }
  const pbr = material.pbrMetallicRoughness;
  for (const slot of pbr ? PBR_SLOTS : []) {
    if (pbr[slot] && doomedTextures.has(pbr[slot].index)) delete pbr[slot];
  }
}

// The bufferViews the doomed images owned, and nobody else does.
const stillUsed = new Set();
const keep = (index) => { if (index !== undefined) stillUsed.add(index); };
(json.images ?? []).forEach((image, i) => { if (!doomedImages.has(i)) keep(image.bufferView); });
(json.accessors ?? []).forEach((accessor) => {
  keep(accessor.bufferView);
  keep(accessor.sparse?.indices?.bufferView);
  keep(accessor.sparse?.values?.bufferView);
});
(json.meshes ?? []).forEach((mesh) => mesh.primitives.forEach((primitive) => {
  keep(primitive.extensions?.KHR_draco_mesh_compression?.bufferView);
}));

const views = json.bufferViews ?? [];
const keptViews = views.map((_, i) => i).filter((i) => stillUsed.has(i));

// Repack: the kept views are copied out in order, so their offsets have to be rewritten
// rather than carried over, and every index into the array re-mapped to its new slot.
const chunks = [];
const viewMap = new Map();
let offset = 0;
keptViews.forEach((index, position) => {
  const view = views[index];
  const start = view.byteOffset ?? 0;
  chunks.push(bin.subarray(start, start + view.byteLength));
  viewMap.set(index, position);
  view.byteOffset = offset;
  // glTF requires accessor-backed views to start on a 4-byte boundary; padding the
  // buffer between them is how the spec's own exporters do it.
  offset += view.byteLength;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    offset += pad;
  }
});
json.bufferViews = keptViews.map((index) => views[index]);

const remap = (index) => viewMap.get(index);
(json.accessors ?? []).forEach((accessor) => {
  if (accessor.bufferView !== undefined) accessor.bufferView = remap(accessor.bufferView);
  if (accessor.sparse) {
    accessor.sparse.indices.bufferView = remap(accessor.sparse.indices.bufferView);
    accessor.sparse.values.bufferView = remap(accessor.sparse.values.bufferView);
  }
});
(json.meshes ?? []).forEach((mesh) => mesh.primitives.forEach((primitive) => {
  const draco = primitive.extensions?.KHR_draco_mesh_compression;
  if (draco) draco.bufferView = remap(draco.bufferView);
}));

// Images and textures are dropped, so everything pointing at *them* re-indexes too.
const imageMap = reindex(json.images ?? [], doomedImages);
const textureMap = reindex(json.textures ?? [], doomedTextures);
json.images = (json.images ?? []).filter((_, i) => !doomedImages.has(i));
json.textures = (json.textures ?? []).filter((_, i) => !doomedTextures.has(i));
json.images.forEach((image) => {
  if (image.bufferView !== undefined) image.bufferView = remap(image.bufferView);
});
json.textures.forEach((texture) => { texture.source = imageMap.get(texture.source); });
for (const material of json.materials ?? []) {
  for (const slot of SLOTS) {
    if (material[slot]) material[slot].index = textureMap.get(material[slot].index);
  }
  const pbr = material.pbrMetallicRoughness;
  for (const slot of pbr ? PBR_SLOTS : []) {
    if (pbr[slot]) pbr[slot].index = textureMap.get(pbr[slot].index);
  }
}

const binOut = Buffer.concat(chunks);
json.buffers = [{ byteLength: binOut.length }];

/** New index for each survivor, once the dropped entries are gone. */
function reindex(list, dropped) {
  const map = new Map();
  let next = 0;
  list.forEach((_, i) => { if (!dropped.has(i)) map.set(i, next++); });
  return map;
}

// JSON pads with spaces and the binary chunk with zeros — the spec is specific about it.
const jsonOut = pad(Buffer.from(JSON.stringify(json)), 0x20);
const binPadded = pad(binOut, 0x00);

function pad(buffer, byte) {
  const extra = (4 - (buffer.length % 4)) % 4;
  return extra ? Buffer.concat([buffer, Buffer.alloc(extra, byte)]) : buffer;
}

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
console.log(
  `Stripped ${names.join(', ')} from ${file}: ` +
  `${(before / 1e6).toFixed(1)} MB → ${(out.length / 1e6).toFixed(1)} MB`
);
