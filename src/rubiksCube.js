import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { cubeSound } from './cubeSound.js';

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

/**
 * Click the cube and its top layer takes a quarter turn, always the same way, so four
 * clicks bring it back to solved. The pieces are found as `loadingCube.js` finds them —
 * a cell in {−1, 0, 1}³ from each `Piece_`'s centre in the body's space — and the top
 * is whichever body axis points nearest world up, on the side that faces it. A turn
 * plays one of the loading screen's recorded turns (`cubeSound.js`).
 */
const TURN_MS = 260;
/** Same as `picking.js`: a press and release further apart than this is an orbit drag. */
const CLICK_SLOP = 4;
/** A piece further than this from the core on an axis is in an outer layer (as `loadingCube.js`). */
const LAYER_MIN = 0.3;
const AXES = ['x', 'y', 'z'];
const ease = (t) => t * t * (3 - 2 * t);

export function setupRubiksClick({ camera, canvas, cube, onMoved }) {
  const body = cube?.getObjectByName('Mirror_Cube');
  if (!body) return;

  cube.updateMatrixWorld(true);
  const pieces = body.children
    .filter((node) => node.name.startsWith('Piece_'))
    .map((node) => {
      const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
      body.worldToLocal(centre);
      const cell = {};
      for (const axis of AXES) cell[axis] = Math.abs(centre[axis]) > LAYER_MIN ? Math.sign(centre[axis]) : 0;
      return { node, cell };
    });
  const pivot = new THREE.Group();
  body.add(pivot);

  // World up in the body's own frame: its largest component names the top layer.
  const up = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion()).invert());
  const axis = AXES.reduce((best, a) => (Math.abs(up[a]) > Math.abs(up[best]) ? a : best));
  const layer = Math.sign(up[axis]);
  // Clockwise seen from above: a negative turn about the axis that points up.
  const dir = -layer;

  let turning = false;
  const turn = () => {
    turning = true;
    const moved = pieces.filter((piece) => piece.cell[axis] === layer);
    for (const piece of moved) pivot.attach(piece.node);
    cubeSound.ready().then(() => cubeSound.turn());
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / TURN_MS);
      pivot.rotation[axis] = dir * (Math.PI / 2) * ease(t);
      if (t < 1) return requestAnimationFrame(frame);
      pivot.updateMatrixWorld(true);
      for (const piece of moved) {
        body.attach(piece.node);
        const c = piece.cell;
        if (axis === 'x') [c.y, c.z] = [-dir * c.z, dir * c.y];
        else if (axis === 'y') [c.x, c.z] = [dir * c.z, -dir * c.x];
        else [c.x, c.y] = [-dir * c.y, dir * c.x];
      }
      pivot.rotation.set(0, 0, 0);
      turning = false;
      // The shadow map is drawn once and cached (see `environment.js`).
      onMoved?.();
    };
    requestAnimationFrame(frame);
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hits = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(cube, true).length > 0;
  };

  let pressed = null;
  canvas.addEventListener('pointerdown', (event) => {
    pressed = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    const from = pressed;
    pressed = null;
    if (!from || turning) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_SLOP) return;
    if (!hits(event)) return;
    turn();
  });
}
