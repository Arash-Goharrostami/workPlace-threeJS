import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * The stack of three filament rolls standing on the floor in front of the desk.
 *
 * It arrives inside `3D_Printer.usdz` as one node of the printer's own scene, and is cut
 * out of it into a model of its own:
 *
 *     cp tmp/originals/printer3d.orig.glb public/models/filamentSpools.glb
 *     npm run shrink -- filamentSpools 512 85 --only Filament_Spool_Stack
 *
 * 6.32 MB to 132 KB. Two files rather than one so the rolls are a prop in their own
 * right — a direct child of the room, which is what makes edit mode pick them on their
 * own and move them without dragging the printer along. `printer.js` cuts the same
 * original the other way and documents its half.
 *
 * The maps go to 512 rather than the printer's 1024: the stack shares the printer's
 * material, so it carries its own copy of that atlas, and it is a 22 cm prop against the
 * machine's 70. Reverting is `mv tmp/originals/printer3d.orig.glb` — the two models come
 * from that one file, so it is the backup for both.
 *
 * Like the printer, the source is authored in centimetres, Y-up and standing on y = 0,
 * so it only needs seating.
 */

const MODEL_URL = 'models/filamentSpools.glb';

/**
 * Where the stack stands, in world centimetres — set by hand in edit mode and copied out
 * of its readout. The rolls came off the desk and onto the tiles in front of it: the free
 * arm was never wide enough for the machine and the stack both, and on the floor they
 * read as the spare filament they are rather than as clutter beside the printer.
 *
 * Absolute, like the room's other hand-placed props: move the printer or the desk and the
 * rolls stay put. Re-dressing them in edit mode and pasting the numbers back here is the
 * way to follow them. The model's origin sits at the base of the stack, so the y is the
 * floor it stands on.
 */
const TRANSFORM = {
  position: [116.5, 12.9, -48.3],
  rotation: [0, 0, 0],
};

/** Loads the rolls and stands them where they were left on the floor. */
export async function addFilamentSpools(parent) {
  const gltf = await loadGLB(MODEL_URL);

  const spools = gltf.scene;
  spools.name = 'Filament_spools';
  spools.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  parent.add(spools);

  // The transform is world-space and the parent carries an offset of its own.
  spools.rotation.set(...TRANSFORM.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
  spools.position.copy(
    parent.worldToLocal(new THREE.Vector3().fromArray(TRANSFORM.position))
  );
  spools.updateMatrixWorld(true);

  return spools;
}
