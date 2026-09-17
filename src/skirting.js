import * as THREE from 'three';

/**
 * The skirting board along the foot of the window wall. The room model files it
 * under `window` as `pCube48`, and as authored it runs about a centimetre past the
 * wall at both ends — past the free end into the open room, and out through the back
 * wall at the corner — so from outside it reads as a stray grey block. It also
 * shares `GreyMaterial` with the chair and the rest of the shell.
 *
 * So it is trimmed to the wall — the free end flush with the wall's own, the corner
 * end at the back wall's inside face, since the wall itself runs on through the
 * corner — and given a wood of its own.
 */

const SKIRTING = 'pCube48';
const WALL = 'wall2';
const BACK_WALL = 'wall1';

/** A light, warm oak. The material is authored, so `darkenScene()` leaves it alone. */
const WOOD = { color: 0xb08a5a, roughness: 0.7, metalness: 0 };

/**
 * Trims the board to the wall and dresses it. Call it after `extendBackWall()`, so
 * the ends it trims to are the walls' final ones; `backWall` is the wall that
 * function returned, or the model's by name.
 */
export function dressSkirting(model, backWall = model.getObjectByName(BACK_WALL)) {
  const board = model.getObjectByName(SKIRTING);
  const wall = model.getObjectByName(WALL);
  if (!board || !wall) return null;

  board.updateMatrixWorld(true);
  const boardBox = boxOf(board);
  const wallBox = boxOf(wall);

  // The board runs along the wall's long axis; the wall's own extent on it is the span
  // to fit — except at the corner, where the wall runs on through the back wall's
  // thickness and the board must stop at the back wall's inside face, or the last
  // stretch of it stands outside the room. Scaled about the board's origin, then slid
  // so its ends land where they should.
  const axis = wallBox.max.x - wallBox.min.x >= wallBox.max.z - wallBox.min.z ? 'x' : 'z';
  const span = { min: wallBox.min[axis], max: wallBox.max[axis] };
  const backBox = boxOf(backWall);
  if (backBox) {
    // The back wall sits at one end of this axis; the board stops at the face of it
    // that looks into the room.
    const centre = (span.min + span.max) / 2;
    if (backBox.max[axis] < centre) span.min = Math.max(span.min, backBox.max[axis]);
    else span.max = Math.min(span.max, backBox.min[axis]);
  }
  const boardSpan = boardBox.max[axis] - boardBox.min[axis];
  const wallSpan = span.max - span.min;
  if (boardSpan > 0 && wallSpan > 0) {
    board.scale[localAxisFor(board, axis)] *= wallSpan / boardSpan;
    board.updateMatrixWorld(true);

    const scaled = boxOf(board);
    const shift = new THREE.Vector3();
    shift[axis] = span.min - scaled.min[axis];
    board.position.add(toParentSpace(board.parent, shift));
    board.updateMatrixWorld(true);
  }

  const wood = new THREE.MeshStandardMaterial({ name: 'skirting_wood', ...WOOD });
  wood.userData.keepColor = true;
  board.traverse((node) => {
    if (node.isMesh) node.material = wood;
  });

  return board;
}

/** Which of the object's own axes points along the given world axis. */
function localAxisFor(object, worldAxis) {
  const rotation = new THREE.Matrix4().extractRotation(object.matrixWorld);
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

function boxOf(object) {
  return new THREE.Box3().setFromObject(object);
}
