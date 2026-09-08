import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A BenQ ScreenBar Halo hooked over the top of the MacBook's lid. Run
 * `npm run convert BenQ_Screenbar_Halo` to (re-)import the model.
 */

const MODEL_URL = 'models/BenQ_Screenbar_Halo.glb';

/**
 * Where it ended up, in world centimetres and degrees, with the scale it was stretched
 * to — set by hand in edit mode and copied out of its readout, the rotation in that
 * readout's own `YXZ` order.
 *
 * Absolute, like the room's dressed cords: move the laptop and the bar stays where it
 * is. Re-dressing it in edit mode and pasting the numbers back here is how it follows.
 */
const TRANSFORM = {
  position: [-6.5, 158.1, -110.3],
  rotation: [0, -0.1, 0],
  scale: [1.108, 1.269, 1.335],
};

/** Loads the bar and sets it where it was left. */
export async function addScreenbar(parent) {
  const gltf = await loadGLB(MODEL_URL);

  const bar = gltf.scene;
  bar.name = 'BenQ_ScreenBar_Halo';
  bar.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // The scale is the world one the readout reports, which is also the local one: the
  // room root carries an offset but no scale of its own.
  bar.scale.fromArray(TRANSFORM.scale);
  bar.rotation.set(...TRANSFORM.rotation.map(THREE.MathUtils.degToRad), 'YXZ');

  parent.add(bar);
  bar.position.copy(
    parent.worldToLocal(new THREE.Vector3().fromArray(TRANSFORM.position))
  );
  bar.updateMatrixWorld(true);

  return bar;
}
