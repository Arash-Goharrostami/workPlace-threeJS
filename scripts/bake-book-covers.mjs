#!/usr/bin/env node
/**
 * Bakes the custom covers from tmp/covers/ into public/models/books.glb.
 *
 *     python3 scripts/book-covers.py && node scripts/bake-book-covers.mjs
 *
 * For every `<material>.webp` in tmp/covers/, the base-colour image of that material is
 * swapped for it. The covers are WebP, so the file declares `EXT_texture_webp`; three.js's
 * GLTFLoader reads that natively and `src/gltfLoader.js` needs nothing for it. The
 * source's metallic/roughness maps are dropped at the same time: `src/books.js` sets the
 * covers' finish as constants and the maps were single-value images, so they were
 * download weight and nothing else. Re-runnable — it only ever replaces images, and the
 * Draco compression survives the round trip.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const file = 'public/models/books.glb';
const covers = 'tmp/covers';

const io = new NodeIO()
  // ALL rather than KHRONOS: EXT_texture_webp is a vendor extension, and one the IO has
  // not registered is silently left out of the file.
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });
const doc = await io.read(file);

const before = fs.statSync(file).size;
doc.createExtension(EXTTextureWebP).setRequired(true);
for (const material of doc.getRoot().listMaterials()) {
  const cover = path.join(covers, `${material.getName()}.webp`);
  if (!fs.existsSync(cover)) continue;

  const texture = material.getBaseColorTexture();
  if (!texture) {
    console.warn(`${material.getName()}: no base colour texture to replace`);
    continue;
  }
  texture.setImage(fs.readFileSync(cover)).setMimeType('image/webp').setName(`${material.getName()}_baseColor`);
  material.setMetallicRoughnessTexture(null);
  console.log(`${material.getName()} <- ${cover}`);
}

// Textures nothing references any more (the dropped metal/rough maps) go with the pass.
await doc.transform(prune({ keepAttributes: true }));
await io.write(file, doc);
const after = fs.statSync(file).size;
console.log(`${file}: ${(before / 1e3).toFixed(0)} KB → ${(after / 1e3).toFixed(0)} KB`);
