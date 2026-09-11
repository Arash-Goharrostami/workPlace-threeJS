import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * The BenQ ScreenBar Halo's puck remote, sitting on the desk to the right of the mat.
 * Run `npm run convert BenQ_Screenbar_Halo_Remote` to (re-)import it.
 *
 * The source arrives at true size in this scene's centimetres — about 7.5 across and 2
 * tall — so it only has to be seated, not scaled.
 *
 * Its 12.8 MB metallic/roughness PNG was stripped out of the GLB (see
 * `scripts/strip-glb-image.mjs`, run through `npm run strip`); the roughness it carried
 * is given back below as constants, which is all a plastic puck needs.
 *
 * The base colour it kept was a 4096x4096 JPEG, for something 7.5 across; `npm run shrink
 * benqScreenbarRemote 512` resampled it to 512 and Draco-compressed the three
 * meshes, taking the file from 1.44 MB to 65 KB. Nothing here had to change for it — the
 * shared loader in `gltfLoader.js` already carries the Draco decoder, and the node names
 * `FINISH` keys off came through the compression untouched.
 */

const MODEL_URL = 'models/benqScreenbarRemote.glb';

/**
 * Where the puck ended up, in world centimetres and degrees — set by hand in edit mode and
 * copied out of its readout, the rotation in that readout's own `YXZ` order. Absolute,
 * like the room's other dressed props: move the desk and it stays where it is, and
 * re-dressing it in edit mode is how it follows.
 */
const TRANSFORM = {
  position: [24.7, 85.4, -87.4],
  rotation: [0, -14, 0],
};

/**
 * The finishes the stripped map used to carry. The dial ring is the one part with any
 * shine to it; the body and the top plate are matte.
 */
const FINISH = {
  Remote_ring_Remote_0: { roughness: 0.35, metalness: 0.45 },
  default: { roughness: 0.65, metalness: 0.05 },
};

/** Loads the remote and sets it where it was left, on the desk beside the mat. */
export async function addScreenbarRemote(parent) {
  const gltf = await loadGLB(MODEL_URL);
  const remote = gltf.scene;
  remote.name = 'Screenbar_remote';

  remote.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.material = refinish(node.material, FINISH[node.name] ?? FINISH.default);
  });

  remote.rotation.set(...TRANSFORM.rotation.map(THREE.MathUtils.degToRad), 'YXZ');

  parent.add(remote);
  // The placement is world-space but `parent` carries an offset of its own, so it has to
  // be converted into its local space.
  remote.position.copy(
    parent.worldToLocal(new THREE.Vector3().fromArray(TRANSFORM.position))
  );
  remote.updateMatrixWorld(true);

  return remote;
}

/**
 * Clones the source material with the finish the stripped map used to supply. The
 * base colour texture stays; only the roughness and metalness are authored — and
 * because they are, `darkenScene()` is told to leave the material alone.
 */
function refinish(material, spec) {
  const copy = material.clone();
  copy.roughnessMap = null;
  copy.metalnessMap = null;
  copy.roughness = spec.roughness;
  copy.metalness = spec.metalness;
  copy.userData.keepColor = true;
  return copy;
}
