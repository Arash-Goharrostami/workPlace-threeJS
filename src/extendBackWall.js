import * as THREE from 'three';

/** How far past the desk's end the wall would run at full extension. */
const WALL_OVERHANG = 15;

/**
 * Fraction of that full extension actually applied. 1 backs the desk completely,
 * 0 leaves the wall as the model authored it; 0.5 meets it half way.
 */
const EXTENSION_RATIO = 0.5;

/** Children of the `walls` group that are not walls. */
const NON_WALLS = new Set(['floor', 'ceiling']);

/**
 * Stretches the windowless back wall along its length so the desk sits entirely in
 * front of it. The desk was widened into the open floor and now overhangs the wall's
 * free end; the end where the two walls meet is held in place.
 *
 * Returns the wall that was stretched, or null when nothing needed doing.
 */
export function extendBackWall(model, deskBox) {
  const walls = model.getObjectByName('walls');
  const windowBox = boxOf(model.getObjectByName('window'));
  if (!walls || !deskBox) return null;

  const { blank: wall, side } = pickWalls(walls, windowBox);
  if (!wall) return null;

  const box = boxOf(wall);
  const axis = box.max.x - box.min.x >= box.max.z - box.min.z ? 'x' : 'z';

  // The end that meets the other wall is whichever is nearer the room's own extent;
  // that end is pinned and the opposite, free end is the one that travels. It is
  // pinned to the side wall's *inner* face rather than to where the model left it: as
  // authored the wall stops half a centimetre short of the side wall, which from
  // outside the corner reads as a slot between the two. Butting it against the side
  // wall closes that. (It was once run on through to the side wall's outer face, "one
  // solid block" — but two boxes sharing the corner have their outer, end and top
  // faces coplanar there, and the corner flickered between the two greys.)
  const wallsBox = boxOf(walls);
  const sideBox = boxOf(side);
  const freeEndIsMin = box.min[axis] - wallsBox.min[axis] > wallsBox.max[axis] - box.max[axis];
  const anchor = sideBox
    ? (freeEndIsMin ? sideBox.min[axis] : sideBox.max[axis])
    : (freeEndIsMin ? wallsBox.max[axis] : wallsBox.min[axis]);
  const freeEnd = freeEndIsMin ? box.min[axis] : box.max[axis];
  const fullTarget = freeEndIsMin
    ? deskBox.min[axis] - WALL_OVERHANG
    : deskBox.max[axis] + WALL_OVERHANG;
  const target = THREE.MathUtils.lerp(freeEnd, fullTarget, EXTENSION_RATIO);

  const currentSpan = box.max[axis] - box.min[axis];
  const newSpan = Math.abs(anchor - target);
  if (newSpan <= currentSpan) return null; // Already long enough — never shrink it.

  // The USD → glTF conversion leaves the wall's local axes rotated relative to the
  // world, so scaling `axis` directly would stretch the wrong dimension.
  wall.scale[localAxisFor(wall, axis)] *= newSpan / currentSpan;
  wall.updateMatrixWorld(true);

  // Scaling happens about the wall's own origin, so slide it until the anchored end
  // lands on the side wall's outer face.
  const scaled = boxOf(wall);
  const shift = new THREE.Vector3();
  shift[axis] = anchor - (freeEndIsMin ? scaled.max[axis] : scaled.min[axis]);
  wall.position.add(toParentSpace(wall.parent, shift));
  wall.updateMatrixWorld(true);

  return wall;
}

/** Which of the wall's own axes points along the given world axis. */
function localAxisFor(wall, worldAxis) {
  const rotation = new THREE.Matrix4().extractRotation(wall.matrixWorld);
  const names = ['x', 'y', 'z'];
  let best = names[0];
  let bestAlignment = -1;

  names.forEach((name, index) => {
    const direction = new THREE.Vector3(+(index === 0), +(index === 1), +(index === 2))
      .applyMatrix4(rotation);
    const alignment = Math.abs(direction[worldAxis]);
    if (alignment > bestAlignment) {
      bestAlignment = alignment;
      best = name;
    }
  });

  return best;
}

/** A world-space displacement expressed in `parent`'s local space. */
function toParentSpace(parent, worldDelta) {
  if (!parent) return worldDelta.clone();
  const origin = parent.worldToLocal(new THREE.Vector3());
  return parent.worldToLocal(worldDelta.clone()).sub(origin);
}

/**
 * The blank wall and the side wall it meets. The window's bounding box is long enough
 * to clip both walls, so a plain intersection test picks neither — the wall that
 * overlaps it *most* is the one the window belongs to (the side wall), and the blank
 * wall is whichever other one overlaps least.
 */
function pickWalls(walls, windowBox) {
  const candidates = walls.children.filter((child) => !NON_WALLS.has(child.name));
  if (candidates.length < 2 || !windowBox) return { blank: candidates[0] ?? null, side: candidates[1] ?? null };

  const ranked = candidates
    .map((child) => ({ child, overlap: overlapVolume(boxOf(child), windowBox) }))
    .sort((a, b) => a.overlap - b.overlap);
  return { blank: ranked[0].child, side: ranked[ranked.length - 1].child };
}

function overlapVolume(a, b) {
  const span = (axis) => Math.max(0, Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]));
  return span('x') * span('y') * span('z');
}

function boxOf(object) {
  return object ? new THREE.Box3().setFromObject(object) : null;
}
