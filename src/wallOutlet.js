import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A mains outlet on the blank back wall, behind the desk's right-hand return and
 * beside the Mac Pro, from the free "wall outlets and switches" pack. Run
 * `npm run convert Free_Wall_outlets_and_switches_pack` to (re-)import the model.
 *
 * The pack holds a light switch and an outlet in one scene; only the outlet is
 * kept. It is authored in this scene's centimetres and already stands upright
 * facing +z — the same way the blank back wall faces — so it needs no turn of its
 * own, only lifting off the model root's own transform when it is re-parented.
 */

const MODEL_URL = 'models/Free_Wall_outlets_and_switches_pack.glb';
const PART = 'Wall_outlet_007';

/** Where on the wall it sits: X in world units, Y above the floor's top face. */
const OUTLET_X = 144;
const OUTLET_HEIGHT = 38;

/**
 * How far the plate stands off the concrete. The model carries its back box as well
 * as the faceplate — 4.2 cm of depth — so it is sunk into the wall until only a
 * plate's worth is left showing.
 */
const PLATE_PROUD = 1.2;

/**
 * Loads the pack and mounts the outlet on the back wall's inner face. Placed
 * against the wall the scene actually has rather than at fixed coordinates, so it
 * stays put if `extendBackWall` moves the wall's ends.
 */
export async function addWallOutlet(parent, wall, floor) {
  if (!wall || !floor) return null;

  const gltf = await loadGLB(MODEL_URL);
  const outlet = gltf.scene.getObjectByName(PART);
  if (!outlet) return null;

  outlet.name = 'Wall_outlet';
  outlet.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // Parented before measuring: the model root carries an offset of its own, so a
  // box taken while the outlet is still detached would be in the wrong frame.
  parent.add(outlet);
  outlet.position.set(0, 0, 0);
  outlet.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  outlet.updateMatrixWorld(true);

  mountOnWall(outlet, wall, floor);

  return outlet;
}

/** Sets the plate's back against the wall's room-facing side. */
function mountOnWall(outlet, wall, floor) {
  const wallBox = new THREE.Box3().setFromObject(wall);
  const floorY = new THREE.Box3().setFromObject(floor).max.y;

  const box = new THREE.Box3().setFromObject(outlet);
  const centre = box.getCenter(new THREE.Vector3());

  const target = new THREE.Vector3(
    OUTLET_X,
    floorY + OUTLET_HEIGHT,
    wallBox.max.z + PLATE_PROUD
  );
  const anchor = new THREE.Vector3(centre.x, centre.y, box.max.z);

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(anchor);
  const parent = outlet.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  outlet.position.copy(parent.worldToLocal(delta).sub(origin));
  outlet.updateMatrixWorld(true);
}
