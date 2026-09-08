import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { materialsOf } from './materials.js';

/**
 * The floor socket, standing on the desk's right-hand arm. Run
 * `npm run convert -- SOCKET__DE_PISO` to (re-)import the model.
 *
 * Unlike the Apple models, nothing about this source is ready to use. It is a
 * Sketchfab import of the kind the chair swap warns about — a hundredfold scale and
 * two stacked turns between the file's root and its meshes — and on top of that:
 *
 *   - its back box is modelled a short way off the body rather than seated in it
 *   - its origin is nowhere near the object, which sits some 1400 units off it
 *   - it is tipped on its side, and far too big for a desk
 *
 * So the module takes it apart in that order: close the gap, stand it up, centre the
 * object on its own origin, then size and seat it. Each step is measured off the model
 * as it actually arrives rather than typed in, so re-exporting the source — which
 * would move every one of those numbers — changes nothing here.
 */

const MODEL_URL = 'models/SOCKET__DE_PISO.glb';

/** The material the back box wears. The source names its parts in Spanish. */
const BOX_MATERIAL = 'CAJA';

/** How wide the faceplate ends up, in this scene's centimetres. */
const PLATE_WIDTH = 12;

/**
 * Where the socket ends up, all measured from the desk's own box so it follows the
 * desk rather than sitting at fixed coordinates. Authored by dragging it in `?debug`.
 *
 * It is a *recessed* socket, so it is sunk into the desk rather than stood on it:
 * `SINK` puts its centre below the top, leaving the flange proud of the surface and
 * the open lid standing above it, the way a flush-mounted one sits in a real desk.
 */
const RIGHT_INSET = 85.7;
const BACK_MARGIN = 15.6;
const SINK = 2.6;

/** Loads the socket, repairs it and sinks it into the desk top. */
export async function addFloorSocket(parent, deskBox) {
  if (!deskBox) return null;

  const gltf = await loadGLB(MODEL_URL);
  const inner = gltf.scene;

  // A group of its own, so the repairs below have something to be measured against
  // that is not already carrying the import's turns and scale.
  const socket = new THREE.Group();
  socket.name = 'Floor_socket';
  socket.add(inner);

  socket.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // Parented before measuring: every step below reads a world-space box, and one taken
  // while the model is still detached would be in the wrong frame.
  parent.add(socket);
  socket.position.set(0, 0, 0);
  socket.updateMatrixWorld(true);

  const seam = seatBackBox(inner);
  if (seam) console.info(`[socket] closed a ${seam.gap.toFixed(2)}-unit gap on ${seam.axis}`);

  // After the turn, not before it: a box's centre is not its rotated box's centre, so
  // centring first would leave the origin off by a fraction of the socket's height.
  standUpright(socket, inner);
  centreOnOrigin(socket, inner);
  sizeToPlate(socket);
  sinkIntoDesk(socket, deskBox);

  return socket;
}

/**
 * Slides the back box until it meets the body.
 *
 * The two are siblings under one container, so their geometry boxes are directly
 * comparable once each is put through its own local matrix — no world transform
 * involved, which is what makes this safe to do before the model is straightened.
 *
 * The axis is found rather than assumed: the box and the body overlap on two of the
 * three, and the odd one out — the only axis where the two boxes do not meet — is the
 * one the gap is on.
 */
function seatBackBox(inner) {
  const boxParts = [];
  const bodyParts = [];

  inner.traverse((node) => {
    if (!node.isMesh) return;
    const isBox = materialsOf(node).some((material) => material?.name === BOX_MATERIAL);
    (isBox ? boxParts : bodyParts).push(node);
  });

  if (!boxParts.length || !bodyParts.length) {
    console.warn(`[socket] no "${BOX_MATERIAL}" part to seat`);
    return null;
  }

  const boxBounds = localBounds(boxParts);
  const bodyBounds = localBounds(bodyParts);

  // The separating axis is the one whose extents do not overlap; on the other two the
  // box sits inside the body's footprint and the overlap is positive.
  let axis = null;
  let gap = 0;
  for (const key of ['x', 'y', 'z']) {
    const overlap =
      Math.min(boxBounds.max[key], bodyBounds.max[key]) -
      Math.max(boxBounds.min[key], bodyBounds.min[key]);
    if (overlap < 0 && overlap < gap) {
      axis = key;
      gap = overlap;
    }
  }
  if (!axis) return null;

  // Toward the body, whichever side of it the box was left on.
  const direction = boxBounds.max[axis] < bodyBounds.min[axis] ? 1 : -1;
  for (const part of boxParts) part.position[axis] += -gap * direction;
  inner.updateMatrixWorld(true);

  return { axis, gap: -gap };
}

/** The union of some sibling meshes' boxes, in the frame their parent sits in. */
function localBounds(parts) {
  const bounds = new THREE.Box3();
  const one = new THREE.Box3();
  for (const part of parts) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    bounds.union(one.copy(part.geometry.boundingBox).applyMatrix4(part.matrix));
  }
  return bounds;
}

/**
 * Moves the model inside its group until the group's origin is the object's own
 * centre, so the socket scales about itself and the editor's gizmo lands on it rather
 * than at a point some 1400 units away.
 *
 * The delta is world-space and the group is already turned by this point, so it is
 * converted through the group rather than added straight on — `worldToLocal` maps
 * points, and subtracting the mapped origin is what turns it back into a vector.
 */
function centreOnOrigin(socket, inner) {
  const centre = new THREE.Box3().setFromObject(inner).getCenter(new THREE.Vector3());
  const delta = socket.getWorldPosition(new THREE.Vector3()).sub(centre);

  const origin = socket.worldToLocal(new THREE.Vector3());
  inner.position.add(socket.worldToLocal(delta).sub(origin));
  socket.updateMatrixWorld(true);
}

/**
 * Stands the socket up, faceplate to the sky.
 *
 * The source models the socket along its own +Z — the plate at z = 0 and the back box
 * running away behind it — so the turn that uprights it is whatever takes that axis to
 * world up. Read off the container's live orientation rather than written out as an
 * angle, because the import's two turns are exactly the sort of thing a re-export
 * changes.
 */
function standUpright(socket, inner) {
  const container = firstMesh(inner)?.parent;
  if (!container) return;

  const plateNormal = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(container.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();

  socket.quaternion.setFromUnitVectors(plateNormal, new THREE.Vector3(0, 1, 0));
  socket.updateMatrixWorld(true);
}

function firstMesh(object) {
  let found = null;
  object.traverse((node) => {
    if (!found && node.isMesh) found = node;
  });
  return found;
}

/** Scales the socket so its faceplate measures `PLATE_WIDTH` across. */
function sizeToPlate(socket) {
  const size = new THREE.Box3().setFromObject(socket).getSize(new THREE.Vector3());
  const plate = Math.max(size.x, size.z);
  if (plate <= 0) return;

  socket.scale.setScalar((PLATE_WIDTH / plate) * socket.scale.x);
  socket.updateMatrixWorld(true);
}

/**
 * Sets the socket into the desk's back right-hand quarter.
 *
 * Its origin is its own centre by this point, which is what the three offsets are
 * measured to — so unlike the props that stand *on* the desk there is no box to take
 * here, and sinking it is just a matter of putting that centre below the top.
 */
function sinkIntoDesk(socket, deskBox) {
  const target = new THREE.Vector3(
    deskBox.max.x - RIGHT_INSET,
    deskBox.max.y - SINK,
    deskBox.min.z + BACK_MARGIN
  );

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(socket.getWorldPosition(new THREE.Vector3()));
  const parent = socket.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  socket.position.add(parent.worldToLocal(delta).sub(origin));
  socket.updateMatrixWorld(true);
}
