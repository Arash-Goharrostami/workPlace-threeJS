import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A Blender-branded coffee mug standing on the left of the desk, in front of the side
 * display, with hot coffee in it. Run `npm run convert Blender_Mug_for_Blender` to
 * (re-)import it; `scripts/model-names.txt` maps that source to `blenderMug`.
 *
 * The Sketchfab source is one mesh of 9.7 k triangles with a base colour, a normal map
 * and a metallic/roughness map, every one of them 2048² for something 10 cm tall. The
 * metal/rough map was stripped out (`npm run strip`, see `scripts/strip-glb-image.mjs`)
 * — a glazed mug's finish is the two constants in `FINISH` — and the rest went through
 *
 *     npm run shrink -- blenderMug 256 70 0.5 --coarse       2.70 MB → 20 KB
 *
 * That is 256² maps at q70 and 2.4 k triangles (the ratio is applied twice, so 0.5 lands
 * at a quarter), which a smooth cylinder seen from a metre away carries fine; if the rim
 * ever reads faceted, re-run with 0.7. `tmp/originals/blenderMug.orig.glb` is the
 * stripped file the shrink starts from and `blenderMug.full.glb` the untouched source.
 *
 * The exporter's scale chain (a ×100 node under two quarter-turns) lands the mug at about
 * true size, upright, with the body's axis through the root's origin, the base at local
 * y = 0 and the rim at y ≈ 10 — measured once with gltf-transform, which is what places
 * the coffee. It is still scaled to a mug's height rather than trusted.
 *
 * The coffee is a disc a little below the rim, and the steam is three sprites of a soft
 * procedural wisp that rise, drift, swell and fade on staggered loops. They are children
 * of the mug so they ride with it and edit mode still picks the whole mug; they are ticked
 * from the coffee's `onBeforeRender`, which fires every frame without the render loop
 * knowing about them.
 */

export const MODEL_URL = 'models/blenderMug.glb';

/** How tall the mug stands, in this scene's centimetres. */
const HEIGHT = 9.5;

/**
 * Where the mug ended up, in world centimetres and degrees — `position` is the point on
 * the desk it stands on, since the root is recentred on the middle of its underside, and
 * the rotation is in the editor readout's own `YXZ` order. Absolute, like the room's other
 * dressed props: move the desk and it stays where it is, and re-dressing it in edit mode
 * is how it follows.
 */
const TRANSFORM = {
  position: [-38.1, 85.4, -84.3],
  rotation: [0, -14, 0],
};

/** A glazed ceramic: the maps carry the print, the finish is a mug's — matte-ish, no metal. */
const FINISH = { roughness: 0.65, metalness: 0 };

/**
 * The coffee, in the mug's own pre-scale units (the exporter's centimetres): the inner
 * wall is 4.0 across at the rim, and the surface sits 1.5 below it.
 */
const COFFEE = { radius: 3.9, height: 8.5, colour: 0x2a1408 };

/**
 * The steam: each wisp starts on the coffee, rises `rise`, drifts sideways on a sine of
 * `sway`, grows from `size` to `size × grow` and fades out over `period` seconds, offset
 * by `phase` so the three never move in step.
 */
const STEAM = {
  count: 3,
  rise: 7,
  sway: 1.2,
  size: 3,
  grow: 2.2,
  period: 3.2,
  opacity: 0.35,
};

/** Loads the mug, fills it and stands it where it was left, on the left of the desk. */
export async function addBlenderMug(parent) {
  const gltf = await loadGLB(MODEL_URL);
  const mug = gltf.scene;
  mug.name = 'Blender_mug';

  const finished = new Map();
  mug.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.material = refinish(node.material, finished);
  });

  // Parented before measuring: the exporter's rotations and ×100 sit on nodes of their
  // own, so a box taken while the mug is still detached would be in the wrong frame.
  parent.add(mug);
  mug.position.set(0, 0, 0);
  mug.rotation.set(0, 0, 0);
  mug.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(mug);
  const size = box.getSize(new THREE.Vector3());
  const scale = HEIGHT / size.y;
  mug.scale.setScalar(scale);

  // Recentre on the middle of the underside, so `position` is the spot it stands on.
  // The box is world-space and the mug sits on the parent's origin, so the parent's own
  // offset comes off before the offset is scaled with the model.
  const foot = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2)
    .sub(mug.getWorldPosition(new THREE.Vector3()))
    .multiplyScalar(scale);

  mug.rotation.set(...TRANSFORM.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
  // The placement is world-space but `parent` carries an offset of its own, so it has to
  // be converted into its local space; the foot offset turns with the mug.
  const at = parent.worldToLocal(new THREE.Vector3().fromArray(TRANSFORM.position));
  mug.position.copy(at).sub(foot.applyEuler(mug.rotation));

  mug.add(addCoffee());
  mug.updateMatrixWorld(true);

  return mug;
}

/**
 * Clones the source material with a mug's finish, once per material, and marks it so
 * `darkenScene()` leaves the print alone. The rough/metal maps are gone from the file;
 * nulling the slots says so.
 */
function refinish(material, finished) {
  if (finished.has(material)) return finished.get(material);
  const copy = material.clone();
  copy.roughnessMap = null;
  copy.metalnessMap = null;
  copy.roughness = FINISH.roughness;
  copy.metalness = FINISH.metalness;
  copy.userData.keepColor = true;
  finished.set(material, copy);
  return copy;
}

/**
 * The coffee: a dark, near-mirror disc laid flat below the rim — a liquid is the one
 * shiny thing on this mug — with the steam parented to it and ticked from its render.
 */
function addCoffee() {
  const material = new THREE.MeshStandardMaterial({
    name: 'coffee',
    color: COFFEE.colour,
    roughness: 0.15,
    metalness: 0,
  });
  material.userData.keepColor = true;

  const coffee = new THREE.Mesh(new THREE.CircleGeometry(COFFEE.radius, 48), material);
  coffee.name = 'Coffee';
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = COFFEE.height;
  coffee.receiveShadow = true;

  const wisps = addSteam(coffee);
  const start = performance.now();
  coffee.onBeforeRender = () => {
    const t = (performance.now() - start) / 1000;
    wisps.forEach((wisp, i) => tickWisp(wisp, t, i));
  };

  return coffee;
}

/** The wisps, parented to the coffee — which lies flat, so "up" is its local +z. */
function addSteam(coffee) {
  const map = wispTexture();
  return Array.from({ length: STEAM.count }, (_, i) => {
    const material = new THREE.SpriteMaterial({
      name: 'steam',
      map,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    material.userData.keepColor = true;
    const wisp = new THREE.Sprite(material);
    wisp.name = `Steam_${i + 1}`;
    coffee.add(wisp);
    return wisp;
  });
}

/**
 * One wisp at time `t`: a loop of `period` seconds, phased by index, that rises from the
 * surface, sways sideways, swells and fades in then out, so there is no visible reset.
 */
function tickWisp(wisp, t, i) {
  const phase = (i / STEAM.count) * STEAM.period;
  const u = ((t + phase) % STEAM.period) / STEAM.period;
  const ease = 1 - (1 - u) * (1 - u);
  // The coffee lies flat, so its local +z is the mug's up and x/y the surface.
  wisp.position.set(
    Math.sin(u * Math.PI * 2 + i * 2.1) * STEAM.sway,
    Math.cos(u * Math.PI * 1.5 + i) * STEAM.sway * 0.5,
    0.5 + ease * STEAM.rise
  );
  const s = STEAM.size * (1 + (STEAM.grow - 1) * ease);
  wisp.scale.set(s, s * 1.4, 1);
  wisp.material.opacity = STEAM.opacity * Math.sin(u * Math.PI);
  wisp.material.rotation = (i - 1) * 0.4 + u * 0.6;
}

/** A soft wisp: white fading out radially, stretched a little and broken up so it is not a plain blob. */
function wispTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  // Three soft blobs along a gentle curve read as a curl of vapour rather than a dot.
  for (const [x, y, r, a] of [[64, 88, 34, 0.9], [52, 58, 28, 0.7], [70, 34, 22, 0.5]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
