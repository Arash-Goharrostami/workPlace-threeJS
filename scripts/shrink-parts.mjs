#!/usr/bin/env node
/**
 * Shrinks a model part by part, where `shrink-glb.mjs` treats every triangle alike.
 *
 *     node scripts/shrink-parts.mjs <model> [--drop mat,mat] [--keep mat,mat]
 *                                   [--only node,node] [--drop-nodes node,node]
 *                                   [--ratio r] [maxTextureSize] [quality] [--coarse]
 *                                   [--out name]
 *
 * A model's parts are told apart by material name, which is the one handle a Sketchfab
 * export reliably has. Each primitive is then one of three things:
 *
 *   --drop   deleted outright, together with any material and map only it used — the
 *            guitar's interior is never seen through its sound hole from across a room;
 *   --keep   left at full detail — the guitar's soundboard is the face the room looks at,
 *            and a whole-model simplify took its edge off first;
 *   the rest simplified at `--ratio`, twice, the way `shrink-glb.mjs` does it.
 *
 * That is the only part this script does itself. The result is handed to
 * `shrink-glb.mjs` for the textures and the finish (prune, dedup with material names kept,
 * weld, Draco), so the two produce the same kind of file. It starts from
 * `tmp/originals/<model>.orig.glb`, the same untouched import `shrink-glb.mjs` keeps, so it
 * can be re-run with different lists without compounding a previous pass.
 *
 * `--only` and `--drop-nodes` cut by *node* name instead, for a source whose material
 * names do not tell its parts apart: the pen display's `silver` is on the laptop, the
 * stand and the pen holder alike. A mesh is matched through its own node or any
 * ancestor, the nearest one deciding — so `--only tablet_13 --drop-nodes pen_holder_12`
 * keeps the display, drops the holder inside it, and `pen_11` inside *that* is kept by
 * naming it in `--only` too. With `--only` given, a mesh under no listed node is
 * dropped. Both run before the material lists.
 *
 * `--out` writes the result as `public/models/<name>.glb` instead of over the model
 * itself, for a second cut of the same import — `proDisplayXdrLite` is the display with
 * its back lattice dropped and the rest coarsened, shown while the real one downloads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const args = process.argv.slice(2);
const list = (flag) => {
  const at = args.indexOf(flag);
  if (at < 0) return [];
  const value = (args[at + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  args.splice(at, 2);
  return value;
};
const drop = new Set(list('--drop'));
const keep = new Set(list('--keep'));
const only = new Set(list('--only'));
const dropNodes = new Set(list('--drop-nodes'));
const ratio = Number(list('--ratio')[0] ?? 0.5);
const out = list('--out')[0];
const coarse = args.includes('--coarse');
const [target, sizeArg = '1024', qualityArg = '85'] = args.filter((a) => !a.startsWith('--'));

if (!target) {
  console.error('Usage: shrink-parts.mjs <model> [--drop mat,mat] [--keep mat,mat] [--only node,node] [--drop-nodes node,node] [--ratio r] [maxTextureSize] [quality] [--coarse] [--out name]');
  process.exit(1);
}

const name = path.basename(target, '.glb');
const source = path.join('public/models', `${name}.glb`);
const file = path.join('public/models', `${out ?? name}.glb`);
const original = path.join('tmp/originals', `${name}.orig.glb`);
if (!fs.existsSync(original)) {
  // First time through: the file in public/ is the original.
  fs.mkdirSync(path.dirname(original), { recursive: true });
  fs.copyFileSync(source, original);
}

// ── 1. the parts ─────────────────────────────────────────────────────────────────────
const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(original);

await MeshoptSimplifier.ready;
const tally = { dropped: [], kept: [], halved: [] };
const tris = (prim) => Math.round((prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3);

// The node cut first: a mesh goes with the nearest of its node and ancestors that either
// list names. Under `--only`, one that reaches the root unnamed goes too.
if (only.size || dropNodes.size) {
  const gone = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    let verdict = only.size ? 'drop' : 'keep';
    for (let at = node; at; at = at.getParentNode()) {
      if (dropNodes.has(at.getName())) { verdict = 'drop'; break; }
      if (only.has(at.getName())) { verdict = 'keep'; break; }
    }
    if (verdict === 'keep') continue;
    gone.push(`${node.getName()} (${mesh.listPrimitives().reduce((n, p) => n + tris(p), 0).toLocaleString()})`);
    node.setMesh(null);
    if (mesh.listParents().every((p) => p.propertyType === 'Root')) mesh.dispose();
  }
  console.log(`nodes dropped: ${gone.join(', ') || '—'}`);
}

for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const material = prim.getMaterial()?.getName() ?? '';
    if (drop.has(material)) {
      tally.dropped.push(`${material} (${tris(prim).toLocaleString()})`);
      mesh.removePrimitive(prim);
      prim.dispose();
    } else if (keep.has(material)) {
      tally.kept.push(`${material} (${tris(prim).toLocaleString()})`);
    } else {
      tally.halved.push(material);
    }
  }
}

// Simplify what is left to simplify, primitive by primitive, in the same two passes
// `shrink-glb.mjs` runs, since meshoptimizer is greedy and stops short in one. The kept
// primitives are simply skipped — not lifted out of their mesh and put back, which is
// what this used to do: `simplify()` disposes any mesh it finds empty, so a mesh whose
// parts were *all* kept vanished with its node. The display's stand and mount plate
// were the first to go.
await doc.transform(weld());
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if (keep.has(prim.getMaterial()?.getName() ?? '')) continue;
    for (let pass = 0; pass < 2; pass += 1) {
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.005 });
    }
  }
}

// Written uncompressed: the finish Draco-encodes it, and an import that arrived
// compressed would otherwise ask for an encoder here that it does not need.
for (const extension of doc.getRoot().listExtensionsUsed()) {
  if (extension.extensionName === 'KHR_draco_mesh_compression') extension.dispose();
}

// A material nobody uses any more is pruned in the finish, and its maps with it.
const staged = path.join('tmp/parts', `${name}.parts.glb`);
fs.mkdirSync(path.dirname(staged), { recursive: true });
fs.rmSync(path.join('tmp/originals', `${name}.parts.orig.glb`), { force: true });
await io.write(staged, doc);

console.log(`dropped: ${tally.dropped.join(', ') || '—'}`);
console.log(`kept:    ${tally.kept.join(', ') || '—'}`);
console.log(`× ${ratio}: ${tally.halved.join(', ') || '—'}`);

// ── 2. the finish ────────────────────────────────────────────────────────────────────
// `shrink-glb.mjs` keeps its own backup of whatever it is given, under the staged name,
// so the real original is never confused with it.
execFileSync('node', [
  'scripts/shrink-glb.mjs', staged, sizeArg, qualityArg, ...(coarse ? ['--coarse'] : []),
], { stdio: 'inherit' });
fs.copyFileSync(staged, file);
fs.rmSync(staged, { force: true });
fs.rmSync(path.join('tmp/originals', `${name}.parts.orig.glb`), { force: true });

const before = fs.statSync(original).size;
const after = fs.statSync(file).size;
const kb = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(2)} MB` : `${Math.round(b / 1024)} KB`);
console.log(`${file}: ${kb(before)} → ${kb(after)}  (${(before / after).toFixed(1)}× smaller; original kept as ${original})`);
