import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { buildIphone15Pro } from './iphone15Pro.js';
import { dressWatchFace } from './watchFace.js';

/**
 * The four Apple products laid out on the desk in front of the display: an iPad Pro
 * and an iPhone behind, an Apple Watch and a Pencil in front of them.
 *
 * One module rather than four: they share a surface, a scale and a layout, and split
 * apart they would repeat the same seating code four times over. Three come from the
 * WorkDesk3D project as GLBs; the iPhone is built in code — see `iphone15Pro.js`.
 *
 * All four are authored in metres, lying flat on y = 0 and centred on their own
 * footprints, so like the other imports they need scaling and seating and no turn.
 */

/** Metres (the models' units) to this scene's centimetres. */
const SCALE = 100;

/**
 * Where each piece sits, as an offset from the display's own centre — so the group
 * follows the display rather than sitting at fixed coordinates. +z is towards the
 * front of the desk.
 *
 * The free desk in front of the riser runs about x −95…0, z −93…−40, which these two
 * rows fit inside: the iPad and phone at the back, the watch and pencil ahead of them.
 */
const LAYOUT = {
  ipad: { x: -11.1, z: 48.7 },
  iphone: { x: 45.8, z: 52.9 },
  watch: { x: 52.2, z: 49.8 },
  pencil: { x: 3.4, z: 54 },
};

/**
 * How far each piece is turned off the desk's axis, in degrees. The watch and the
 * Pencil were laid across the desk rather than along it, the iPad turned with them and
 * the phone just knocked off square. Applied after seating, so a turn moves nothing.
 */
const YAW = {
  ipad: 104.7,
  iphone: -8.7,
  watch: 95.6,
  pencil: 96,
};

/**
 * The watch arrives as the silver-and-white model. Its source module repaints it, and
 * so does this one: `aluminium` is the case, the button and the crown, `White` the
 * band's two halves. Everything else it carries — screen, glass, steel — is already
 * dark or metal and stays.
 *
 * The case takes the same anodised black the Magic Mouse and Trackpad wear; the band
 * is a touch lighter and completely unmetallic, because a sport band is rubber and
 * should not borrow a metal's roughness.
 */
const WATCH_REPAINT = {
  aluminium: { color: 0x202024, roughness: 0.85, metalness: 0.05 },
  White: { color: 0x18181a, roughness: 0.8, metalness: 0 },
};

export const MODELS = {
  ipad: 'models/ipadPro.glb',
  pencil: 'models/applePencil.glb',
  watch: 'models/appleWatchSe.glb',
};

/** Loads all four and lays them on the desk top in front of the display. */
export async function addDeskApple(parent, deskBox, display) {
  if (!deskBox || !display) return null;

  const anchor = new THREE.Box3().setFromObject(display).getCenter(new THREE.Vector3());
  const surfaceY = deskBox.max.y;

  const [ipad, pencil, watch] = await Promise.all([
    loadGLB(MODELS.ipad),
    loadGLB(MODELS.pencil),
    loadGLB(MODELS.watch),
  ]);

  const placed = {
    ipad: prepare(ipad.scene, 'iPad_Pro'),
    pencil: prepare(pencil.scene, 'Apple_Pencil'),
    watch: repaint(prepare(watch.scene, 'Apple_Watch_SE'), WATCH_REPAINT),
    // Built in code, and already at this scene's units — so it is the one that must
    // not be scaled again.
    iphone: prepare(buildIphone15Pro(), 'iPhone_15_Pro', SCALE),
  };
  // The face lights up when the Contact section opens — see `resume/index.js`.
  dressWatchFace(placed.watch);

  for (const [key, object] of Object.entries(placed)) {
    // Parented before measuring: each root carries an offset, so a box taken while
    // the object is still detached would be in the wrong frame.
    parent.add(object);
    object.position.set(0, 0, 0);
    object.updateMatrixWorld(true);
    restOnDesk(object, surfaceY, anchor.x + LAYOUT[key].x, anchor.z + LAYOUT[key].z);
    if (YAW[key]) {
      object.rotation.y = THREE.MathUtils.degToRad(YAW[key]);
      object.updateMatrixWorld(true);
    }
  }

  return placed;
}

/** Scales a loaded root to this scene and turns its shadows on. */
function prepare(object, name, scale = SCALE) {
  object.name = name;
  object.scale.setScalar(scale);
  object.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return object;
}

/**
 * Swaps named materials for new ones. One material per spec, shared by every mesh
 * that used the original, rather than one per mesh.
 */
function repaint(object, specs) {
  const paints = Object.fromEntries(
    Object.entries(specs).map(([from, spec]) => {
      const material = new THREE.MeshStandardMaterial({ name: `watch_${from}`, ...spec });
      // An authored colour — darkenScene() must not tint it again.
      material.userData.keepColor = true;
      return [from, material];
    })
  );

  object.traverse((node) => {
    if (!node.isMesh) return;
    const swap = (material) => (material && paints[material.name]) || material;
    node.material = Array.isArray(node.material)
      ? node.material.map(swap)
      : swap(node.material);
  });

  return object;
}

/** Sets one piece's underside on the desk top, centred on the given spot. */
function restOnDesk(object, surfaceY, x, z) {
  const box = new THREE.Box3().setFromObject(object);
  const centre = box.getCenter(new THREE.Vector3());

  const target = new THREE.Vector3(x, surfaceY, z);
  const anchor = new THREE.Vector3(centre.x, box.min.y, centre.z);

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(anchor);
  const parent = object.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  object.position.copy(parent.worldToLocal(delta).sub(origin));
  object.updateMatrixWorld(true);
}
