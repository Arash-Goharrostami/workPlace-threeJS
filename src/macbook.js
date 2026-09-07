import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { STAND_SLOPE } from './deskAccessories.js';

/**
 * The 16-inch MacBook Pro from the WorkDesk3D project, resting on the laptop stand.
 * Run `npm run macbook` to (re-)import the model and its Draco decoder.
 *
 * The source is authored in metres, Y-up, standing on y = 0 and centred on its base;
 * this scene works in centimetres, so it only needs scaling and seating.
 */

const MODEL_URL = 'models/macbook-pro-16.glb';

/** Metres (the model's units) to this scene's centimetres. */
const SCALE = 100;

/**
 * Nudges across the shelf and along the slope. The seating centres the machine on
 * its own base bounds, which sit off the shelf's centre line — a few centimetres
 * across squares it up on the stand.
 */
const OFFSET = new THREE.Vector2(4, 0);

/**
 * Height, in model metres, that separates the base from the lid. The machine is
 * modelled open, so its full bounding box reaches up and back behind the deck —
 * seating has to be measured off the base alone. Same threshold the source project
 * uses to label the two halves.
 */
const LID_Y = 0.03;

/**
 * Loads the machine, tilts it to the stand's own solved slope and seats it so its
 * base lands on both supports. Everything is measured off the loaded bounds and the
 * stand's live geometry, so it stays seated if the stand's constants change.
 */
export async function addMacbook(parent, stand) {
  if (!stand) return null;

  const gltf = await loadGLB(MODEL_URL);

  const macbook = gltf.scene;
  macbook.name = 'MacBook_Pro_16';
  macbook.scale.setScalar(SCALE);
  macbook.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // Parent it before measuring: the model root carries an offset, so a box taken
  // while the machine is still detached would be in the wrong frame.
  parent.add(macbook);
  macbook.position.set(0, 0, 0);
  macbook.rotation.set(0, 0, 0);
  macbook.updateMatrixWorld(true);

  const base = baseMeshes(macbook);

  // Slope down toward the front, matching the angle the stand's supports impose.
  macbook.rotation.x = STAND_SLOPE;
  macbook.updateMatrixWorld(true);

  seatOnStand(macbook, base, stand);
  swingWithStand(macbook, stand);

  return macbook;
}

/**
 * Turns the machine to match the stand's own swing. The seating above is axis-aligned
 * — it measures front and side off world-space boxes — so the yaw is applied after the
 * fact, as a rotation of the seated machine about the stand's post.
 */
function swingWithStand(macbook, stand) {
  const yaw = stand.rotation.y;
  if (!yaw) return;

  // A point, not a displacement — and the room root carries no turn of its own, so
  // the world's Y is also the parent's.
  const pivot = macbook.parent.worldToLocal(stand.getWorldPosition(new THREE.Vector3()));
  const axis = new THREE.Vector3(0, 1, 0);

  macbook.position.sub(pivot).applyAxisAngle(axis, yaw).add(pivot);
  macbook.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, yaw));
  macbook.updateMatrixWorld(true);
}

/** The meshes making up the base, taken while the machine still sits level. */
function baseMeshes(macbook) {
  const cut = new THREE.Box3().setFromObject(macbook).min.y + LID_Y * SCALE;
  const meshes = [];

  macbook.traverse((node) => {
    if (!node.isMesh) return;
    if (new THREE.Box3().setFromObject(node).max.y <= cut) meshes.push(node);
  });

  return meshes.length ? meshes : null;
}

function boundsOf(meshes, fallback) {
  const box = new THREE.Box3();
  if (!meshes) return box.setFromObject(fallback);
  for (const mesh of meshes) box.union(new THREE.Box3().setFromObject(mesh));
  return box;
}

/**
 * Seats the tilted machine: centred across the stand, with its base's front-bottom
 * edge down in the corner where the front lip meets the shelf. Because the slope is
 * derived from this machine's own depth, landing that corner puts the rear underside
 * exactly on the back fold.
 */
function seatOnStand(macbook, base, stand) {
  stand.updateMatrixWorld(true);

  // The bracket is one extruded sheet, so the contact points come from markers
  // placed inside it rather than from named sub-parts.
  const seat = stand.getObjectByName('seat front');
  if (!seat) return;

  const box = boundsOf(base, macbook);
  const target = seat.getWorldPosition(new THREE.Vector3());
  target.x += OFFSET.x;
  target.z += OFFSET.y;

  // Tilted nose-down, the base's lowest point *is* its front edge, so one corner
  // anchors both the height and the depth.
  const anchor = new THREE.Vector3(
    box.getCenter(new THREE.Vector3()).x,
    box.min.y,
    box.max.z
  );

  // Both are world-space; the parent carries its own offset, so convert the delta.
  macbook.position.copy(toParentSpace(macbook.parent, target.sub(anchor)));
  macbook.updateMatrixWorld(true);
}

/** A world-space displacement expressed in `parent`'s local space. */
function toParentSpace(parent, worldDelta) {
  const origin = parent.worldToLocal(new THREE.Vector3());
  return parent.worldToLocal(worldDelta.clone()).sub(origin);
}
