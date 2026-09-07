import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * The enclosed 3D printer from the WorkDesk3D project, standing on the desk's free
 * right-hand arm. Run `npm run apple` to (re-)import the model.
 *
 * Like the MacBook and the display, the source is authored in metres, Y-up, standing
 * on y = 0 and centred on its own footprint — so it only needs scaling and seating.
 * It is half a metre square and 70 cm tall.
 */

const MODEL_URL = 'models/3d-printer.glb';

/** Metres (the model's units) to this scene's centimetres. */
const SCALE = 100;

/** Gap left between the laptop stand and the printer's near side. */
const SIDE_CLEARANCE = 6;

/** Gap left between the desk's back edge and the printer's back. */
const BACK_MARGIN = 8;

/** Loads the printer and stands it on the desk, clear of the laptop stand. */
export async function addPrinter(parent, deskBox, stand) {
  if (!deskBox) return null;

  const gltf = await loadGLB(MODEL_URL);

  const printer = gltf.scene;
  printer.name = '3D_printer';
  printer.scale.setScalar(SCALE);
  printer.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // Parented before measuring: the model root carries an offset, so a box taken
  // while the printer is still detached would be in the wrong frame.
  parent.add(printer);
  printer.position.set(0, 0, 0);
  printer.updateMatrixWorld(true);

  standOnDesk(printer, deskBox, stand);

  return printer;
}

/**
 * Centres the printer across the desk top's free right-hand arm and sets it back
 * against the desk's back edge. The arm is measured live — it runs from the laptop
 * stand's outer edge to the desk's own — so the printer follows if either moves.
 */
function standOnDesk(printer, deskBox, stand) {
  const standBox = stand ? new THREE.Box3().setFromObject(stand) : null;
  const armMinX = standBox ? standBox.max.x + SIDE_CLEARANCE : deskBox.min.x;

  const box = new THREE.Box3().setFromObject(printer);
  const size = box.getSize(new THREE.Vector3());

  const target = new THREE.Vector3(
    (armMinX + deskBox.max.x) / 2,
    deskBox.max.y,
    deskBox.min.z + BACK_MARGIN + size.z / 2
  );

  const center = box.getCenter(new THREE.Vector3());
  const anchor = new THREE.Vector3(center.x, box.min.y, center.z);

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(anchor);
  const parent = printer.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  printer.position.copy(parent.worldToLocal(delta).sub(origin));
  printer.updateMatrixWorld(true);
}
