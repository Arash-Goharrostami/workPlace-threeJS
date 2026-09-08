import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * The acoustic guitar and its stand from the WorkDesk3D project, standing on the
 * floor off the desk's left end. Run `npm run apple` to (re-)import the model.
 *
 * Guitar and stand are one object there, not two — so there is nothing to keep lined
 * up here. Like the other imported props it is authored in metres, Y-up, standing on
 * y = 0 and centred on its own footprint: 1.15 m tall on a 33 x 30 cm base.
 */

const MODEL_URL = 'models/guitar-on-stand.glb';

/** Metres (the model's units) to this scene's centimetres. */
const SCALE = 100;

/**
 * Clear floor between the desk's left end and the stand. Measured against the desk
 * box the swap hands over, which is the desk *before* its corner patch widens it —
 * so this is smaller than the gap that actually appears on screen.
 */
const SIDE_GAP = 27.5;

/**
 * How far in front of the desk's back edge the stand sits. Both gaps are read off the
 * stand's footprint centre, which the turn below swings a little, so they are a
 * fraction under the distance the stand looks to have moved.
 */
const FRONT_GAP = 38.3;

/** Turned off square, so it leans towards the desk rather than facing straight out. */
const STAND_YAW = THREE.MathUtils.degToRad(-21.9);

/**
 * Loads the guitar and stands it on the floor beside the desk. Placed relative to the
 * desk rather than at fixed coordinates, so it keeps its spot if the desk moves.
 */
export async function addGuitar(parent, deskBox, floor) {
  if (!deskBox || !floor) return null;

  const gltf = await loadGLB(MODEL_URL);

  const guitar = gltf.scene;
  guitar.name = 'Guitar_on_stand';
  guitar.scale.setScalar(SCALE);
  guitar.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // The soundboard faces +z as authored — into the room rather than at the back wall
  // — and this swings it round a little further towards the desk.
  guitar.rotation.y = STAND_YAW;

  // Parented before measuring: the model root carries an offset, so a box taken while
  // the guitar is still detached would be in the wrong frame.
  parent.add(guitar);
  guitar.position.set(0, 0, 0);
  guitar.updateMatrixWorld(true);

  standOnFloor(guitar, deskBox, floor);

  return guitar;
}

/** Sets the stand's feet on the floor's top face, out beyond the desk's left end. */
function standOnFloor(guitar, deskBox, floor) {
  const floorY = new THREE.Box3().setFromObject(floor).max.y;

  // `precise`: the model's inner nodes carry their own rotations, and the cheap path
  // unions their transformed bounding *boxes*, which reach several centimetres below
  // the guitar itself. Dropping that phantom minimum onto the floor left the stand
  // hanging in the air.
  const box = new THREE.Box3().setFromObject(guitar, true);
  const center = box.getCenter(new THREE.Vector3());

  const target = new THREE.Vector3(
    deskBox.min.x - SIDE_GAP,
    floorY,
    deskBox.min.z + FRONT_GAP
  );
  const anchor = new THREE.Vector3(center.x, box.min.y, center.z);

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(anchor);
  const parent = guitar.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  guitar.position.copy(parent.worldToLocal(delta).sub(origin));
  guitar.updateMatrixWorld(true);
}
