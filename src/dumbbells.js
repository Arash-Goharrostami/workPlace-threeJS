import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A pair of dumbbells on the floor in front of the guitar. Run `npm run convert
 * Dumbbells` to (re-)import the model.
 *
 * The Sketchfab source is 174 k triangles and 16.75 MB as converted — two materials,
 * `Base` and `Disks`, each with 2048² base colour, normal and a 3.8 MB
 * metallic/roughness map. None of it is wanted: the base colours are flat greys with a
 * little grime (RGB 113 and 71 on average), the normals are knurling that is noise
 * from across a room, and the metal maps carry exactly the gleam the pair is asked
 * *not* to have. So every material is replaced at load time (`MATERIALS` below) and
 * the file is shrunk with its maps dropped:
 *
 *     npm run shrink -- dumbbells 512 85 0.45 --no-textures --coarse
 *
 * 16.75 MB → 78 KB, 17 k triangles. The ratio is the lossy step — note the shrink's
 * two simplify passes compound, so 0.45 lands nearer 0.1 — and 0.3 left the disks
 * visibly faceted. Material names are load-bearing: that is what `MATERIALS` is keyed
 * on, and why the shrink keeps them (`dedup --materials false`).
 */

const MODEL_URL = 'models/dumbbells.glb';

/**
 * How wide the pair reads, along its longer side — what the import is scaled to. It
 * started at 36, a real pair of 5 kg dumbbells, and was scaled ×1.099 in edit mode.
 */
const REAL_WIDTH = 39.6;

/** How far in front of the guitar's stand the pair lies, in centimetres. */
const GUITAR_GAP = 25;

/**
 * Where the pair ended up, once dressed in edit mode — world centimetres and degrees,
 * the rotation in the readout's own `YXZ` order. Left `null`, the pair is set in front
 * of the guitar by `standBeforeGuitar` instead, and follows it; paste a readout here
 * and it stays put like the room's other dressed props.
 */
const TRANSFORM = {
  position: [100.9, 2.8, 88.9],
  rotation: [0, -30.1, 0],
};

/**
 * What each of the source's materials becomes, by name: painted iron for the bar and
 * handles, rubber for the discs. Matte through and through — no metal, rough as
 * rubber — and authored, so `darkenScene()` is told to leave them alone.
 */
const MATERIALS = {
  Base: { colour: 0x6e6e6e },
  Disks: { colour: 0x3f3f3f },
};
const FINISH = { roughness: 0.95, metalness: 0 };

/** Loads the pair, dulls it and lays it on the floor in front of the guitar. */
export async function addDumbbells(parent, guitar, floor) {
  const gltf = await loadGLB(MODEL_URL);
  const pair = gltf.scene;
  pair.name = 'Dumbbells';

  const finished = new Map();
  pair.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.material = matte(node.material.name, finished);
  });

  // Parented before measuring: the root carries an offset of its own, so a box taken
  // while the pair is still detached would be in the wrong frame.
  parent.add(pair);
  pair.position.set(0, 0, 0);
  pair.rotation.set(0, 0, 0);
  pair.scale.setScalar(1);
  pair.updateMatrixWorld(true);

  fitWidth(pair, REAL_WIDTH);

  // Recentre on the middle of the underside, so a position is the point it lies on.
  const box = new THREE.Box3().setFromObject(pair);
  const centre = box.getCenter(new THREE.Vector3());
  const foot = pair.worldToLocal(new THREE.Vector3(centre.x, box.min.y, centre.z));
  for (const child of pair.children) child.position.sub(foot);
  pair.updateMatrixWorld(true);

  if (TRANSFORM) {
    pair.rotation.set(...TRANSFORM.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
    pair.position.copy(parent.worldToLocal(new THREE.Vector3().fromArray(TRANSFORM.position)));
  } else if (guitar && floor) {
    standBeforeGuitar(pair, guitar, floor);
  } else {
    console.warn('[dumbbells] no guitar or floor to place against — left at the origin');
  }
  pair.updateMatrixWorld(true);

  return pair;
}

/** Lays the pair on the floor's top face, GUITAR_GAP in front of the guitar's box. */
function standBeforeGuitar(pair, guitar, floor) {
  const floorY = new THREE.Box3().setFromObject(floor).max.y;
  // `precise`, for the same reason `guitar.js` measures itself that way: the stand's
  // inner nodes carry rotations, and the cheap box reaches past the guitar itself.
  const stand = new THREE.Box3().setFromObject(guitar, true);
  const centre = stand.getCenter(new THREE.Vector3());

  // The placement is world-space but `parent` carries an offset of its own, so it has to
  // be converted into its local space.
  pair.position.copy(
    pair.parent.worldToLocal(new THREE.Vector3(centre.x, floorY, stand.max.z + GUITAR_GAP))
  );
}

/** Scales the loaded root so it measures `width` across, whatever the exporter left. */
function fitWidth(object, width) {
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  const widest = Math.max(size.x, size.z);
  if (widest > 1e-6) object.scale.setScalar(width / widest);
  object.updateMatrixWorld(true);
}

/**
 * The matte replacement for a source material, one per name. A name not in the table
 * gets the bar's grey and a warning, so a re-import that renames something shows up in
 * the console rather than as a missing part.
 */
function matte(name, finished) {
  const known = finished.get(name);
  if (known) return known;

  const spec = MATERIALS[name];
  if (!spec) console.warn(`[dumbbells] no material for "${name}" — using the bar's grey`);
  const material = new THREE.MeshStandardMaterial({
    name: `dumbbell_${name}`,
    color: (spec ?? MATERIALS.Base).colour,
    roughness: FINISH.roughness,
    metalness: FINISH.metalness,
    envMapIntensity: 0.3,
  });
  material.userData.keepColor = true;
  finished.set(name, material);
  return material;
}
