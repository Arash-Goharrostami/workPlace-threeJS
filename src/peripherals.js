import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * The Magic Keyboard and Magic Trackpad from the WorkDesk3D project, laid on the
 * felt mat. Run `npm run apple` to (re-)import them and the Draco decoder.
 *
 * Both are authored in metres, Y-up, standing on y = 0 and centred on their own
 * footprint, so they need only scaling and seating.
 */

/**
 * `npm run shrink -- magicKeyboard 1024 85` took the keyboard from 642 KB to 57 KB: its
 * keycaps were a single 4096x4096 JPEG, 543 KB of the 642, on something seen from a metre
 * away. The mesh was already small and is untouched. The trackpad has no textures at all,
 * so `npm run shrink -- magicTrackpad 512 85` only recompressed its geometry, 191 KB
 * to 95 KB.
 */
const KEYBOARD_URL = 'models/magicKeyboard.glb';
const TRACKPAD_URL = 'models/magicTrackpad.glb';

/** Metres (the models' units) to this scene's centimetres. */
const SCALE = 100;

/** How far in from the mat's ends each device sits. */
const EDGE_MARGIN = 7;

/** A few degrees off square, so neither reads as aligned to the desk. */
const KEYBOARD_TILT = THREE.MathUtils.degToRad(2.8);
const TRACKPAD_TILT = THREE.MathUtils.degToRad(-9);

/**
 * Nudges from the seating above, in x and z — where each was actually left. The
 * keyboard's is a shade under its measured move because the seating aligns the near
 * end of its footprint, and the tilt swings that end out by a few millimetres.
 */
const KEYBOARD_OFFSET = new THREE.Vector2(3.8, 2.7);
const TRACKPAD_OFFSET = new THREE.Vector2(-9.2, -0.3);

/**
 * The space black finish, ported from the source project's space-black.js: the
 * near-black glass the hand touches, and the darker, flatter anodised body under it.
 * The trackpad's GLB arrives white, so without this it lands on the mat as a white
 * slab. Keyed by the material names the asset carries.
 */
const TRACKPAD_REPAINT = {
  White: { color: 0x3c3c40, roughness: 0.55, metalness: 0.2 },
  steel_001: { color: 0x202024, roughness: 0.85, metalness: 0.05 },
};

/** Loads both devices and rests them on the mat, keyboard left, trackpad right. */
export async function addPeripherals(parent, mat) {
  if (!mat) return null;

  const [keyboardGltf, trackpadGltf] = await Promise.all([
    loadGLB(KEYBOARD_URL),
    loadGLB(TRACKPAD_URL),
  ]);

  const keyboard = prepare(keyboardGltf.scene, 'Magic_Keyboard');
  const trackpad = prepare(trackpadGltf.scene, 'Magic_Trackpad');
  repaint(trackpad, TRACKPAD_REPAINT);

  keyboard.rotation.y = KEYBOARD_TILT;
  trackpad.rotation.y = TRACKPAD_TILT;

  mat.updateMatrixWorld(true);
  const matBox = new THREE.Box3().setFromObject(mat);
  const surfaceY = matBox.max.y;
  const centreZ = matBox.getCenter(new THREE.Vector3()).z;

  placeOn(parent, keyboard, matBox.min.x + EDGE_MARGIN + KEYBOARD_OFFSET.x,
          surfaceY, centreZ + KEYBOARD_OFFSET.y, 'min');
  placeOn(parent, trackpad, matBox.max.x - EDGE_MARGIN + TRACKPAD_OFFSET.x,
          surfaceY, centreZ + TRACKPAD_OFFSET.y, 'max');

  return { keyboard, trackpad };
}

function prepare(scene, name) {
  scene.name = name;
  scene.scale.setScalar(SCALE);
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return scene;
}

/** Swaps named materials for the given specs, one instance per spec. */
function repaint(root, specs) {
  const paints = Object.fromEntries(
    Object.entries(specs).map(([from, spec]) => [
      from, new THREE.MeshStandardMaterial({ name: `trackpad_${from}`, ...spec }),
    ])
  );

  root.traverse((node) => {
    if (!node.isMesh) return;
    const swap = (material) => (material && paints[material.name]) || material;
    node.material = Array.isArray(node.material)
      ? node.material.map(swap)
      : swap(node.material);
  });
}

/**
 * Sits `object` on the surface, aligning the given end of its footprint to `edgeX`.
 * Parented before measuring — the model root carries an offset, so a box taken while
 * the object is still detached would be in the wrong frame.
 */
function placeOn(parent, object, edgeX, surfaceY, centreZ, align) {
  parent.add(object);
  object.position.set(0, 0, 0);
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const anchor = new THREE.Vector3(
    align === 'min' ? box.min.x : box.max.x,
    box.min.y,
    box.getCenter(new THREE.Vector3()).z
  );
  const delta = new THREE.Vector3(edgeX, surfaceY, centreZ).sub(anchor);

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const origin = parent.worldToLocal(new THREE.Vector3());
  object.position.copy(parent.worldToLocal(delta).sub(origin));
  object.updateMatrixWorld(true);
}
