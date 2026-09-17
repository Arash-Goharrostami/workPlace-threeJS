import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A silver mirror cube standing on the desk. The same file the loading screen turns
 * (`loadingCube.js`), so it is already in the cache by the time the room asks for it;
 * here it just stands, solved. Run `npm run convert Standard_Mirror_Rubiks_Cube_Silver`
 * to (re-)import it, and `npm run shrink rubiksCube 128 70 0.5` to bring it back to
 * 85 KB — its maps are a near-uniform silver, so 128² is all they need.
 *
 * The source is 300 on a side (the exporter's ×100), so it is scaled to a real
 * puzzle's `SIZE`; its origin stays where the exporter put it, a little above the foot,
 * so the editor's readout is exactly what `TRANSFORM` holds.
 */
const MODEL_URL = 'models/rubiksCube.glb';
/** A standard cube is 57 mm across. */
const SIZE = 5.7;

/**
 * Where its origin sits, in world centimetres and degrees — set by hand in edit mode
 * and copied out of its readout, the rotation in that readout's own `YXZ` order.
 * Absolute, like the room's other dressed props: move the desk and it stays where it
 * is, and re-dressing it in edit mode is how it follows.
 */
const TRANSFORM = {
  position: [-26.5, 89.4, -88.2],
  rotation: [0, 76.9, 0],
};

/** The source is chrome; this takes the edge off the mirror, as on the loading screen. */
const ROUGHNESS_MIN = 0.45;
const ENV_INTENSITY = 0.7;

/** Loads the cube and stands it where it was left, on the left of the desk by the mug. */
export async function addRubiksCube(parent) {
  const gltf = await loadGLB(MODEL_URL);
  const cube = gltf.scene;
  cube.name = 'Rubiks_cube';

  const finished = new Map();
  cube.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.material = refinish(node.material, finished);
  });

  // Parented before measuring: the exporter's rotation and ×100 sit on nodes of their
  // own, so a box taken while the cube is still detached would be in the wrong frame.
  parent.add(cube);
  cube.position.set(0, 0, 0);
  cube.rotation.set(0, 0, 0);
  cube.updateMatrixWorld(true);

  const size = new THREE.Box3().setFromObject(cube).getSize(new THREE.Vector3());
  cube.scale.setScalar(SIZE / size.x);

  cube.rotation.set(...TRANSFORM.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
  // The placement is world-space but `parent` carries an offset of its own, so it has to
  // be converted into its local space.
  cube.position.copy(parent.worldToLocal(new THREE.Vector3().fromArray(TRANSFORM.position)));
  cube.updateMatrixWorld(true);

  return cube;
}

/**
 * Clones the source material once per material with the mirror dulled a step, and marks
 * it so `darkenScene()` leaves the chrome alone.
 */
function refinish(material, finished) {
  if (finished.has(material)) return finished.get(material);
  const copy = material.clone();
  if ('roughness' in copy) copy.roughness = Math.max(copy.roughness, ROUGHNESS_MIN);
  if ('envMapIntensity' in copy) copy.envMapIntensity = ENV_INTENSITY;
  copy.userData.keepColor = true;
  finished.set(material, copy);
  return copy;
}
