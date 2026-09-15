/**
 * Shrinks the plinth under the Hornet figurine without touching Hornet herself.
 *
 *     npm run shrink:hornet-base -- [factor] [--bare]        default 0.7
 *
 * The Sketchfab model stands her on a wide three-disc base (`Platform_base`,
 * `Platform_I`, `Platform_R`) dressed with thread spools, a needle stand and an upright
 * needle out near its rim. Scaling the whole figure down would shrink her with it, and
 * scaling the discs alone would leave the dressing floating off the edge — so the discs
 * are scaled in the model's XZ plane about the base's own centre (their thickness is
 * kept) and the dressing slides inward by the same factor, its size untouched — or,
 * with `--bare`, is deleted outright, leaving her alone on the discs with her needle
 * planted beside her (which slides inward like the rest, but stays). The
 * base's centre stays where it was, so the foot point `figurines.js` recentres on, and
 * with it her spot on the desk, does not move; her height is untouched, so neither
 * does the 14 cm fit.
 *
 * Always starts from `tmp/originals/hornet.base.orig.glb`, the file as `npm run shrink`
 * left it, so re-running with another factor does not compound. Reverting is
 * `mv tmp/originals/hornet.base.orig.glb public/models/hornet.glb`. Written back with the
 * same 12/8/10-bit Draco quantization `shrink --coarse` used.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { Matrix4, Vector3 } from 'three';

const MODEL = 'public/models/hornet.glb';
const ORIGINAL = 'tmp/originals/hornet.base.orig.glb';

/** The discs, scaled in place. */
const PLATFORMS = ['Platform_base', 'Platform_I', 'Platform_R'];
/**
 * Her needle, planted upright beside her: the shaft and the eye at its top. It stands
 * on the disc, so it slides inward with the base — but it is hers, so `--bare` keeps
 * it.
 */
const NEEDLE = ['Cylinder_001', 'Torus', 'Torus_003'];
/**
 * The dressing standing on the discs — thread spools, a wound bobbin and the loose
 * thread (`BezierCurve`) — moved inward, or deleted by `--bare`. Hornet is everything
 * else.
 */
const DRESSING = [
  'BezierCurve', 'Cylinder', 'Cylinder_004', 'Cylinder_005', 'Cylinder_006',
  'Cylinder_007', 'Cylinder_008', 'Thredes_1', 'Thredes_2', 'Thredes_og',
];

const args = process.argv.slice(2);
const bare = args.includes('--bare');
const factor = Number(args.find((arg) => !arg.startsWith('--')) ?? 0.7);
if (!(factor > 0 && factor <= 1)) {
  console.error('factor must be between 0 and 1');
  process.exit(1);
}

if (!fs.existsSync(ORIGINAL)) {
  fs.mkdirSync(path.dirname(ORIGINAL), { recursive: true });
  fs.copyFileSync(MODEL, ORIGINAL);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(ORIGINAL);

const nodes = new Map(doc.getRoot().listNodes().map((node) => [node.getName(), node]));
const byName = (name) => {
  const node = nodes.get(name);
  if (!node) throw new Error(`no node named ${name}`);
  return node;
};

/** World-space AABB of the meshes under `node`. */
function worldBounds(node) {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const v = new Vector3();
  node.traverse((child) => {
    const mesh = child.getMesh();
    if (!mesh) return;
    const world = new Matrix4().fromArray(child.getWorldMatrix());
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      const el = [0, 0, 0];
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, el);
        v.fromArray(el).applyMatrix4(world);
        min.min(v);
        max.max(v);
      }
    }
  });
  return { min, max };
}

// The base's centre in world XZ — the fixed point of the whole edit.
const base = worldBounds(byName('Platform_base'));
const centre = new Vector3().addVectors(base.min, base.max).multiplyScalar(0.5);
const shrink = (p) => {
  p.x = centre.x + (p.x - centre.x) * factor;
  p.z = centre.z + (p.z - centre.z) * factor;
  return p;
};

// The discs: every vertex taken to world space, pulled toward the centre in XZ, and put
// back — so it holds whatever rotation the node carries.
for (const name of PLATFORMS) {
  byName(name).traverse((child) => {
    const mesh = child.getMesh();
    if (!mesh) return;
    const world = new Matrix4().fromArray(child.getWorldMatrix());
    const back = world.clone().invert();
    const v = new Vector3();
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      const el = [0, 0, 0];
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, el);
        shrink(v.fromArray(el).applyMatrix4(world)).applyMatrix4(back);
        position.setElement(i, v.toArray());
      }
    }
  });
}

// The dressing: deleted, or its origin moved the same way in its parent's frame. A
// mesh or material nothing uses any more is left for Draco to skip; there is no
// texture on any of them to prune.
for (const name of [...NEEDLE, ...DRESSING]) {
  const node = byName(name);
  if (bare && !NEEDLE.includes(name)) {
    for (const child of node.listChildren()) child.getMesh()?.dispose();
    node.getMesh()?.dispose();
    node.dispose();
    continue;
  }
  const parent = node.getParentNode();
  const parentWorld = new Matrix4().fromArray(parent.getWorldMatrix());
  const origin = new Vector3().fromArray(node.getTranslation()).applyMatrix4(parentWorld);
  shrink(origin).applyMatrix4(parentWorld.clone().invert());
  node.setTranslation(origin.toArray());
}

// Disposing a mesh leaves its accessors behind, and orphaned data is still written —
// the bare file came out four times the size before this. Attributes are kept, as in
// `shrink-glb.mjs`: nothing in the file referencing one does not mean the scene won't.
await doc.transform(
  prune({ keepAttributes: true, keepLeaves: true }),
  draco({ method: 'edgebreaker', quantizePosition: 12, quantizeNormal: 8, quantizeTexcoord: 10 })
);
await io.write(MODEL, doc);

const after = worldBounds(byName('Platform_base'));
const span = (b) => `${(b.max.x - b.min.x).toFixed(0)} × ${(b.max.z - b.min.z).toFixed(0)}`;
console.log(`base ${span(base)} → ${span(after)} (× ${factor})${bare ? ', dressing removed' : ''}`);
console.log(`${MODEL}: ${(fs.statSync(MODEL).size / 1024).toFixed(0)} KB`);
