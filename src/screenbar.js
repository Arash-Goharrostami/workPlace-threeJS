import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A BenQ ScreenBar Halo hooked over the top edge of the main Pro Display XDR. Run
 * `npm run convert BenQ_Screenbar_Halo` to (re-)import the model.
 *
 * The source shipped six 2048x2048 maps, and 6.2 MB of those 13.7 were the two
 * metallic/roughness PNGs alone — surface noise on a matte aluminium bar.
 *
 *     npm run shrink -- benqScreenbar 512 \
 *         --only Caps,Hinge,Lamp,LEDs,Reflector,Sensor,Sheet,Solid,Tube
 *
 * resampled them all to 512 and Draco-compressed the meshes, taking the file from
 * 13.7 MB to 273 KB. The two normal maps fell to 8 KB and 4 KB, which is the giveaway
 * that they were near-flat to begin with.
 *
 * The nine prefixes are how one node is dropped: `--only` keeps what it names, and the
 * list is every part but `Wire` — a short moulded cable stub that hung off the bar and
 * ran nowhere. Re-importing the model brings it back, so the flag has to come with it.
 */

const MODEL_URL = 'models/benqScreenbar.glb';

/**
 * How it was left, in degrees and the scale it was stretched to — set by hand in edit
 * mode and copied out of its readout, the rotation in that readout's own `YXZ` order.
 *
 * The position is not among them: the bar hangs off the display by `OFFSET` below, so
 * moving the monitor carries the lamp with it. Re-dressing it in edit mode means
 * subtracting the display's world position from the readout before pasting it back.
 */
const TRANSFORM = {
  rotation: [0, -0.1, 0],
  scale: [1.108, 1.269, 1.335],
};

/** Where the bar sits relative to the display's own origin, in world centimetres. */
const OFFSET = new THREE.Vector3(0, 58.7, 5.2);

/** Loads the bar and hooks it over the display's top edge. */
export async function addScreenbar(parent, display) {
  if (!display) return null;

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
  display.updateMatrixWorld(true);
  const target = display.getWorldPosition(new THREE.Vector3()).add(OFFSET);
  bar.position.copy(parent.worldToLocal(target));
  bar.updateMatrixWorld(true);

  return bar;
}
