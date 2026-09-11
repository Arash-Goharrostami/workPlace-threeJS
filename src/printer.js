import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * The open-frame 3D printer standing on the desk's free right-hand arm — a gantry, a
 * heated bed, a spool on the crossbar and a stack of spare filament beside it. Run
 * `npm run convert 3D_Printer` to (re-)import the model.
 *
 * It replaced the low-poly `3d-printer` that `npm run apple` fetched — one 5,886-triangle
 * mesh that read as a box on the desk. The Sketchfab source is the same machine modelled
 * properly: a separate shell, spool stack and spools, and 2048² maps instead of the
 * baked-down set.
 *
 *     npm run shrink -- printer3d 1024 85 --only _D_Printer,Filament_Spools
 *
 * took it from 6.32 MB to 404 KB. The `--only` list is the machine and the roll on its
 * crossbar, and it leaves two things behind. One is the rest of the source's scene — a
 * device shell and three printed firearm parts posed beside the machine, which belong to
 * whoever staged the render and not to this desk; dropping them takes the second material
 * and its three maps with it, which is most of that saving. The other is
 * `Filament_Spool_Stack`, the three rolls on the desk: `filamentSpools.js` cuts the same
 * original the other way and serves them as a model of their own, so that they are a prop
 * edit mode can pick and move without the printer. Re-importing brings all of it back, so
 * the flag has to come with it.
 *
 * The geometry is untouched: no simplify ratio, since detail is the whole point of the
 * swap.
 *
 * Like the MacBook and the display, the source is Y-up, standing on y = 0 and centred on
 * its own footprint — so it only needs seating. It is 70 cm wide, 50 cm deep and 70 cm
 * tall, a little broader than the box it replaced.
 */

const MODEL_URL = 'models/printer3d.glb';

/**
 * The source is authored in centimetres, which is this scene's own unit — unlike the
 * Apple models beside it, which arrive in metres. It came in at 70 units tall and that
 * is the 70 cm it should be, so there is nothing to convert.
 */
const SCALE = 1;

/** Gap left between the laptop stand and the printer's near side. */
const SIDE_CLEARANCE = 6;

/** Gap left between the desk's back edge and the printer's back. */
const BACK_MARGIN = 8;

/**
 * Room kept clear on the printer's left for the filament stack — its 22 cm plus the gap
 * `filamentSpools.js` leaves. The machine is centred on what is left rather than on the
 * whole arm: the arm is about 79 cm and the two props together need 74, so centring the
 * printer alone would slide it left and stand the rolls over the laptop stand.
 */
const SPOOLS_ALLOWANCE = 24;

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
 * Centres the printer across the desk top's free right-hand arm, less the room the
 * filament stack needs beside it, and sets it back against the desk's back edge. The arm
 * is measured live — it runs from the laptop stand's outer edge to the desk's own — so
 * the printer follows if either moves.
 */
function standOnDesk(printer, deskBox, stand) {
  const standBox = stand ? new THREE.Box3().setFromObject(stand) : null;
  const armMinX = standBox ? standBox.max.x + SIDE_CLEARANCE : deskBox.min.x;

  const box = new THREE.Box3().setFromObject(printer);
  const size = box.getSize(new THREE.Vector3());

  const target = new THREE.Vector3(
    (armMinX + SPOOLS_ALLOWANCE + deskBox.max.x) / 2,
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
