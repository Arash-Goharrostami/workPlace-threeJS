import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A Mac Pro tower on the floor beside the open box under the desk's right-hand
 * return. Run `npm run convert Mac_Pro` to (re-)import the model.
 *
 * The source is authored in this scene's centimetres at true size — 45 x 53.2 x 21.9,
 * a real tower's depth, height and width — but laid out with its depth along X, so it
 * needs a quarter turn to face the room.
 *
 * `npm run shrink -- macPro 256 80 0.10 --coarse` took it from 10.2 MB to 418 KB. Unlike
 * the ScreenBar, the weight here was geometry, so it is the one model so far that needed
 * decimating: 252k triangles down to 37k, over the same 137 primitives (the simplifier's
 * error bound stops it short of the 0.10 asked for). The tower stands on the floor under
 * the desk, small on screen, so 256² maps and 12-bit positions cost it nothing visible.
 * The exporter had also left sixteen 1x1 placeholder PNGs behind; those are gone.
 *
 * The three BLEND-mode panels keep their alpha, which is the thing to look at first if
 * the tower ever renders wrong — the front lattice is a cut-out texture, not geometry, so
 * losing the alpha shows up as a solid face rather than as a missing one.
 */

const MODEL_URL = 'models/macPro.glb';

/** Turns the machine's front from -x round to +z, out towards the room. */
const FACE_ROOM = Math.PI / 2;

/**
 * A point known to be inside the box under the desk, used to feel out its panels.
 * Anywhere in the open volume does; this is roughly its middle.
 */
const PROBE = new THREE.Vector3(75, 30, -85);

/** Clear floor between the box's outer wall and the tower. */
const SIDE_GAP = 5;

/** How far forward of the box's own middle the tower stands, out towards the room. */
const FORWARD = 10;

/** Loads the tower and stands it on the floor alongside the box. */
export async function addMacPro(parent, desk, floor) {
  if (!desk || !floor) return null;

  const box = measureBox(desk);
  if (!box) return null;

  const gltf = await loadGLB(MODEL_URL);

  const tower = gltf.scene;
  tower.name = 'Mac_Pro';
  tower.rotation.y = FACE_ROOM;
  tower.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // Parented before measuring: the model root carries an offset of its own, so a box
  // taken while the tower is still detached would be in the wrong frame.
  parent.add(tower);
  tower.position.set(0, 0, 0);
  tower.updateMatrixWorld(true);

  standBeside(tower, box, floor);

  return tower;
}

/**
 * Feels out the box under the desk by casting along each axis from a point inside it,
 * then once more from outside to find the far side of its right-hand panel. Measured
 * rather than written down so the placement survives a re-fitted desk.
 */
function measureBox(desk) {
  const caster = new THREE.Raycaster();
  const hit = (from, direction) => {
    caster.set(from, direction);
    return caster.intersectObject(desk, true)[0] ?? null;
  };

  const inside = hit(PROBE, new THREE.Vector3(1, 0, 0));
  if (!inside) return null;

  // Back at the same panel from well outside it: its first hit is the outer face.
  const outside = hit(
    new THREE.Vector3(inside.point.x + 50, PROBE.y, PROBE.z),
    new THREE.Vector3(-1, 0, 0)
  );

  return { outerX: (outside ?? inside).point.x, centreZ: PROBE.z + FORWARD };
}

/** Sets the tower's feet on the floor, its left side clear of the box's outer wall. */
function standBeside(tower, box, floor) {
  const floorY = new THREE.Box3().setFromObject(floor).max.y;

  const bounds = new THREE.Box3().setFromObject(tower);
  const centre = bounds.getCenter(new THREE.Vector3());

  const target = new THREE.Vector3(
    box.outerX + SIDE_GAP + (bounds.max.x - bounds.min.x) / 2,
    floorY,
    box.centreZ
  );
  const anchor = new THREE.Vector3(centre.x, bounds.min.y, centre.z);

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(anchor);
  const parent = tower.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  tower.position.copy(parent.worldToLocal(delta).sub(origin));
  tower.updateMatrixWorld(true);
}
