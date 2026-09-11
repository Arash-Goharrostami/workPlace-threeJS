import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { materialsOf } from './materials.js';

/**
 * Swaps the room's low-poly `Chair01_Chair` for the black mesh-back office chair.
 * Run `npm run convert -- Black_Computer_Chair_-_Mesh_Back_Support` to (re-)import it.
 *
 * The desks are replaced the same way (see `replaceDesks.js`), but a chair is one
 * object and needs no stretching: it is scaled uniformly, turned to face the desk and
 * set on the floor where the old chair stood. It keeps the old chair's *name*, because
 * `carpet.js` centres the rug on it by name.
 */

/**
 * `npm run shrink -- officeChair 512 85` took it from 4.97 MB to 495 KB with the mesh
 * untouched — all 136,606 triangles — because the weight was two 2048x2048 maps, one of
 * them a 1.1 MB PNG.
 *
 * That PNG is the mesh back: RGBA behind a BLEND material, a real cutout rather than a
 * flat texture, so it stays PNG. It is also the one thing here worth looking at, since a
 * fine repeating weave is what suffers most from being resampled to 512. At 1024 it costs
 * 743 KB.
 */
const MODEL_URL = 'models/officeChair.glb';

/** The chair baked into Workplace.glb, which this replaces. */
const OLD_CHAIR_NAME = 'Chair01_Chair';

/**
 * Real-world sizes, in metres, used to scale the model into the room. The scene's own
 * unit is derived from the desk rather than assumed: the desk is the one object here
 * whose height is a known standard, so measuring against it survives a re-scaled room.
 */
const DESK_HEIGHT_M = 0.75;
const CHAIR_HEIGHT_M = 1.15;

/**
 * Extra yaw, in radians, on top of the turn that points the chair at the guitar. The
 * model is authored Y-up, standing on its castors and facing +z, so nothing else needs
 * straightening — this is the knob to reach for if a re-import lands it facing sideways.
 */
const EXTRA_ROTATION_Y = 0;

/**
 * How far the chair is rolled back off the rug's centre, along the line away from the
 * desk — the chair is pushed back from the work surface rather than tucked under it.
 * Clamped to the rug below, so raising this can only ever move the chair as far as the
 * rug's back edge.
 */
const PULL_BACK = 34;

/** Rug left showing behind the castors when the pull-back is clamped. */
const RUG_MARGIN = 4;

/**
 * Hand placement, in world x/z, on top of the derived spot below — the same knob
 * `carpet.js` keeps for the rug. The derived spot centres the chair on the rug; this
 * slides it along the rug's long axis to where it is actually wanted. Applied before
 * the rug clamp, so it can never push the castors off the pile.
 */
const NUDGE = new THREE.Vector2(66.5, -18.6);

/**
 * Removes the original chair and drops the new one into its place. Returns the new
 * chair, or null if either the old chair or the floor is missing.
 */
export async function replaceChair(model, deskBox, carpet, guitar) {
  const oldChair = model.getObjectByName(OLD_CHAIR_NAME);
  const floor = model.getObjectByName('floor');
  if (!oldChair || !floor || !deskBox) return null;

  const oldBox = new THREE.Box3().setFromObject(oldChair);
  const floorY = new THREE.Box3().setFromObject(floor).max.y;

  oldChair.removeFromParent();
  disposeSubtree(oldChair);

  const gltf = await loadGLB(MODEL_URL);
  const chair = gltf.scene;
  chair.name = OLD_CHAIR_NAME;

  chair.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    for (const mat of materialsOf(node)) {
      if (mat?.map) mat.map.anisotropy = 8;
    }
  });

  // Parented to the room's root, not to the old chair's container: that container is a
  // nested Sketchfab import carrying its own 90° turn and 4.8x scale, which would lay
  // the chair on its back. The desk and the guitar hang off the root for the same
  // reason. Done before measuring, so every box below is in the same (world) frame as
  // the old chair's.
  model.add(chair);
  chair.position.set(0, 0, 0);
  chair.updateMatrixWorld(true);

  // `precise` on every measurement of the chair: it is turned to face the desk, and the
  // cheap path unions rotated bounding *boxes*, which reads several centimetres taller
  // than the model — enough to leave it hanging above the floor.
  const rawHeight = new THREE.Box3().setFromObject(chair, true).getSize(new THREE.Vector3()).y;
  const unitsPerMetre = (deskBox.max.y - floorY) / DESK_HEIGHT_M;
  if (rawHeight > 0 && unitsPerMetre > 0) {
    chair.scale.setScalar((CHAIR_HEIGHT_M * unitsPerMetre) / rawHeight);
  }

  // Away from the desk: the direction the chair is rolled back along.
  const toDesk = deskBox.getCenter(new THREE.Vector3()).sub(oldBox.getCenter(new THREE.Vector3()));
  toDesk.y = 0;

  // Placed before it is turned, so the aim below is taken from where the chair actually
  // ends up on the rug rather than from the spot the old one occupied — those are tens
  // of centimetres apart, which is degrees of error in the direction it looks.
  standOnFloor(chair, oldBox, floorY, toDesk, carpet);

  // Turn the model's +z onto the line from the chair to the guitar, so the seat faces
  // it across the room. The desk is the fallback if the guitar never loaded, so the
  // chair is never left pointing in an arbitrary direction.
  const target = guitar ? new THREE.Box3().setFromObject(guitar).getCenter(new THREE.Vector3()) : null;
  const from = new THREE.Box3().setFromObject(chair, true).getCenter(new THREE.Vector3());
  const facing = target ? target.sub(from) : toDesk.clone();
  facing.y = 0;
  chair.rotation.y = Math.atan2(facing.x, facing.z) + EXTRA_ROTATION_Y;
  chair.updateMatrixWorld(true);

  // Again now that it is turned: the yaw changes the footprint the rug clamp and the
  // floor contact are measured from.
  standOnFloor(chair, oldBox, floorY, toDesk, carpet);

  return chair;
}

/**
 * Sets the castors on the floor's top face, standing on the rug and rolled back off its
 * centre by `PULL_BACK`, away from the desk. Falls back to the old chair's spot if no
 * rug was laid.
 */
function standOnFloor(chair, oldBox, floorY, toDesk, carpet) {
  const back = toDesk.lengthSq() > 0
    ? toDesk.clone().normalize().multiplyScalar(-PULL_BACK)
    : new THREE.Vector3();

  // The delta below is an absolute position, not a nudge, so this has to start from a
  // zeroed transform — it is called twice, once before the chair is turned and once
  // after, and the second pass would otherwise snap it back to the parent's origin.
  chair.position.set(0, 0, 0);
  chair.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(chair, true);
  const center = box.getCenter(new THREE.Vector3());

  const rug = carpet ? new THREE.Box3().setFromObject(carpet) : null;
  const from = rug ? rug.getCenter(new THREE.Vector3()) : oldBox.getCenter(new THREE.Vector3());

  const spot = new THREE.Vector2(from.x + back.x + NUDGE.x, from.z + back.z + NUDGE.y);
  if (rug) keepOnRug(spot, rug, box);

  const target = new THREE.Vector3(spot.x, floorY, spot.y);
  const anchor = new THREE.Vector3(center.x, box.min.y, center.z);

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(anchor);
  const parent = chair.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  chair.position.copy(parent.worldToLocal(delta).sub(origin));
  chair.updateMatrixWorld(true);
}

/**
 * Pulls a candidate spot back inside the rug, so a generous `PULL_BACK` walks the chair
 * to the rug's edge rather than off it. Works on the chair's own footprint, not its
 * centre, so it is the castors that stay on the pile.
 */
function keepOnRug(spot, rug, chairBox) {
  const half = new THREE.Vector2(
    (chairBox.max.x - chairBox.min.x) / 2 + RUG_MARGIN,
    (chairBox.max.z - chairBox.min.z) / 2 + RUG_MARGIN
  );

  for (const [axis, key] of [['x', 'x'], ['y', 'z']]) {
    const min = rug.min[key] + half[axis];
    const max = rug.max[key] - half[axis];
    // A rug narrower than the chair would invert the range; centre on it instead.
    spot[axis] = min > max
      ? (rug.min[key] + rug.max[key]) / 2
      : THREE.MathUtils.clamp(spot[axis], min, max);
  }
}

// Geometry only: materials in this scene are shared across many meshes, so disposing
// them here would blank out objects that are staying.
function disposeSubtree(root) {
  root.traverse((node) => {
    if (node.isMesh) node.geometry?.dispose();
  });
}
