import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { materialsOf } from './materials.js';
import { fillDeskCorner } from './fillDeskCorner.js';
import { applyDeskMaterials } from './deskMaterials.js';

const MODEL_URL = 'models/Desk.glb';

/** The two desks in Workplace.glb that get swapped out. */
const OLD_DESK_NAMES = ['Table01_Desk01', 'Table01_Table01'];

/** Manual nudges, in the parent model's units — tweak here if the fit needs it. */
const OFFSET = new THREE.Vector3(0, 0, 0);
const EXTRA_ROTATION_Y = 0;

/**
 * Gap left between the desk and the room. The original desks were authored flush
 * against the walls, so their combined footprint is the room's usable area — an
 * inset of it is a real gap from the walls and the window in the right-hand wall.
 */
const WALL_CLEARANCE = 6;

/**
 * How far the desk extends past the old footprint on its two open sides — the free
 * floor, not the walls. Growing symmetrically is what pushed it through the walls
 * before, so the wall-facing sides keep their clearance and only these two move.
 */
const ROOM_GROWTH = 25;

/**
 * Removes the original desks from `model` and drops the new Desk model into the
 * space they occupied: rotated onto the combined footprint's long axis, then
 * stretched per axis to fill that footprint exactly, with its top surface kept at
 * the old desk height so everything that stood on them still rests on it.
 *
 * Returns { desk, coverage, orphans } where `coverage` is the fraction of the old
 * footprint area the new desk covers and `orphans` names props left with no desk
 * underneath.
 */
export async function replaceDesks(model) {
  const oldDesks = OLD_DESK_NAMES.map((name) => model.getObjectByName(name)).filter(Boolean);
  if (oldDesks.length === 0) return null;

  const oldBox = new THREE.Box3();
  for (const desk of oldDesks) oldBox.union(new THREE.Box3().setFromObject(desk));

  const props = collectProps(oldDesks, oldBox);

  for (const desk of oldDesks) {
    desk.removeFromParent();
    disposeSubtree(desk);
  }

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const desk = gltf.scene;
  desk.name = 'Desk_replacement';

  // Parented up front so every box below is measured in the same (world) frame as
  // the old desks'. Measuring it detached would leave the model root's own offset
  // out of one side of the sum and bury the desk in the wall.
  model.add(desk);
  desk.position.set(0, 0, 0);
  desk.updateMatrixWorld(true);

  desk.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    for (const mat of materialsOf(node)) {
      if (mat?.map) mat.map.anisotropy = 8;
    }
  });

  // Fit against the room-safe footprint, not the raw union, so the desk clears the
  // walls; Y is left at the true union height to preserve the work-surface level.
  const safeBox = roomSafeFootprint(oldBox, model);

  const oldSize = safeBox.getSize(new THREE.Vector3());
  oldSize.y = oldBox.max.y - oldBox.min.y;
  const rawSize = new THREE.Box3().setFromObject(desk).getSize(new THREE.Vector3());

  // Align the desk's own long horizontal axis with the footprint's long axis.
  const quarterTurn = rawSize.x >= rawSize.z !== oldSize.x >= oldSize.z;
  desk.rotation.y = (quarterTurn ? Math.PI / 2 : 0) + EXTRA_ROTATION_Y;

  // Non-uniform stretch: fill the old footprint exactly on X/Z, and match the old
  // height on Y so the work surface stays where everything is resting. Distorts
  // the desk's proportions, which is the deliberate trade for full coverage.
  desk.scale.set(1, 1, 1);
  desk.updateMatrixWorld(true);
  const turnedSize = new THREE.Box3().setFromObject(desk).getSize(new THREE.Vector3());
  const fit = new THREE.Vector3(
    oldSize.x / turnedSize.x,
    oldSize.y / turnedSize.y,
    oldSize.z / turnedSize.z
  );
  // `fit` is in world axes; a quarter turn swaps which local axis feeds which.
  desk.scale.set(quarterTurn ? fit.z : fit.x, fit.y, quarterTurn ? fit.x : fit.z);

  // Position from the post-transform bounds: centre horizontally, match the top.
  desk.updateMatrixWorld(true);
  const placed = new THREE.Box3().setFromObject(desk);
  const placedCenter = placed.getCenter(new THREE.Vector3());
  const oldCenter = safeBox.getCenter(new THREE.Vector3());
  desk.position.set(
    oldCenter.x - placedCenter.x + OFFSET.x,
    oldBox.max.y - placed.max.y + OFFSET.y,
    oldCenter.z - placedCenter.z + OFFSET.z
  );

  desk.updateMatrixWorld(true);

  // The model's outer corner is chamfered; square it off so the L looks complete.
  fillDeskCorner(desk);

  // Walnut top over iron legs, matching the desk in the WorkDesk3D project.
  applyDeskMaterials(desk);

  const finalBox = new THREE.Box3().setFromObject(desk);
  return {
    desk,
    box: finalBox,
    coverage: footprintCoverage(oldBox, finalBox),
    orphans: props.filter((p) => !coversPoint(finalBox, p.center)).map((p) => p.name),
  };
}

/**
 * The footprint the desk should fill: the old union pulled back by `WALL_CLEARANCE`
 * on the two sides that face walls, and pushed out by `ROOM_GROWTH` on the two open
 * sides. Which is which is measured against the room's wall geometry rather than
 * hard-coded, so the fit survives a differently-oriented room.
 */
function roomSafeFootprint(oldBox, model) {
  const box = oldBox.clone();
  const walls = model.getObjectByName('walls');
  const wallsBox = walls ? new THREE.Box3().setFromObject(walls) : null;

  for (const axis of ['x', 'z']) {
    // Distance from each side of the footprint out to the room's outer shell; the
    // nearer side is the one backing onto a wall.
    const minGap = wallsBox ? Math.abs(oldBox.min[axis] - wallsBox.min[axis]) : 0;
    const maxGap = wallsBox ? Math.abs(wallsBox.max[axis] - oldBox.max[axis]) : 0;

    if (minGap <= maxGap) {
      box.min[axis] += WALL_CLEARANCE;
      box.max[axis] += ROOM_GROWTH;
    } else {
      box.min[axis] -= ROOM_GROWTH;
      box.max[axis] -= WALL_CLEARANCE;
    }
  }

  return box;
}

/**
 * Siblings of the desks that rest on top of them — anything whose base sits at or
 * above the old work surface. Floor-standing items and walls are ignored.
 */
function collectProps(oldDesks, oldBox) {
  const excluded = new Set(oldDesks);
  const surfaceY = oldBox.max.y - (oldBox.max.y - oldBox.min.y) * 0.15;
  const props = [];

  for (const child of oldDesks[0].parent.children) {
    if (excluded.has(child)) continue;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty() || box.min.y < surfaceY) continue;
    props.push({ name: child.name, center: box.getCenter(new THREE.Vector3()), box });
  }
  return props;
}

/** Fraction of the old footprint's area that the new desk's footprint overlaps. */
function footprintCoverage(oldBox, newBox) {
  const overlapX = Math.max(0, Math.min(oldBox.max.x, newBox.max.x) - Math.max(oldBox.min.x, newBox.min.x));
  const overlapZ = Math.max(0, Math.min(oldBox.max.z, newBox.max.z) - Math.max(oldBox.min.z, newBox.min.z));
  const oldArea = (oldBox.max.x - oldBox.min.x) * (oldBox.max.z - oldBox.min.z);
  return oldArea > 0 ? (overlapX * overlapZ) / oldArea : 0;
}

function coversPoint(box, point) {
  return point.x >= box.min.x && point.x <= box.max.x && point.z >= box.min.z && point.z <= box.max.z;
}

// Geometry only: materials in this scene are shared across many meshes, so
// disposing them here would blank out objects that are staying.
function disposeSubtree(root) {
  root.traverse((node) => {
    if (node.isMesh) node.geometry?.dispose();
  });
}
