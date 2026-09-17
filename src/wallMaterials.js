import * as THREE from 'three';

/**
 * The room's walls, dressed in the bare concrete from
 * `tmp/Gallery_bare_concrete_wall.usdz`. Run `npm run wall` to refresh the image
 * file from the usdz.
 *
 * Two things the model forces on us: the walls share `GreyMaterial` with the chair
 * and the rest of the shell, so the material is replaced rather than mutated; and
 * the wall meshes carry no UVs at all, so the mapping is projected here.
 */

const TEXTURE_FILE = 'textures/wall/Concrete_baseColor.webp';

/** Children of the `walls` group that are not walls. */
const NON_WALLS = new Set(['floor', 'ceiling']);

/**
 * Scene units the concrete image spans, on both axes. Picked so the panel reads at
 * roughly its real size — a little under three metres — beside the desk.
 */
const CONCRETE_TEXTURE_SPAN = 280;

/**
 * The colour the concrete is tinted to. The map multiplies this, so a dark slate-navy
 * both darkens the walls and gives them their cold cast in one step. Set here rather
 * than in `darkenScene.js` because the material opts out of that pass: with a map it
 * would otherwise take the much harder tint meant for the desk's laminate.
 */
const WALL_TINT = 0x56627e;

/**
 * The same tint, lifted for the faces the key light cannot reach. The key sits outside
 * the room at +x/+z (see `environment.js`): it falls on the back wall's inside face-on
 * and never touches the side wall's, nor the back wall's outer face — so with one
 * colour those read a step darker than the faces beside them. Brightening the tint on
 * exactly those faces makes the walls match, inside and out, without moving the key
 * and every shadow with it. It used to go to the whole side wall by name, which
 * matched the inside and then, from outside the corner, made *its* outer face — the
 * one the key hits full on — a step lighter than the back wall's.
 */
const SHADE_TINT = 0x7a8aab;

/**
 * Where the key shines from — `environment.js` puts it at the room's centre plus
 * (r, 1.4r, r). A face whose normal leans this way is lit.
 */
const KEY_DIR = new THREE.Vector3(1, 1.4, 1).normalize();

const loader = new THREE.TextureLoader();

/**
 * Puts the concrete on every wall of the room. Call it after `extendBackWall()` —
 * that scales one wall, and the UVs here are projected from world positions, so a
 * later stretch would smear the grain across that wall.
 */
export function applyWallMaterials(model) {
  const walls = model.getObjectByName('walls');
  if (!walls) return null;

  const concrete = makeConcreteMaterial();
  const shade = concrete.clone();
  shade.name = 'room_concrete_shade';
  shade.color.setHex(SHADE_TINT);

  for (const child of walls.children) {
    if (NON_WALLS.has(child.name)) continue;
    child.updateMatrixWorld(true);
    child.traverse((node) => {
      if (!node.isMesh) return;
      addWallUVs(node);
      splitByLight(node);
      node.material = [concrete, shade];
    });
  }

  return concrete;
}

/**
 * Sorts the mesh's triangles into two draw groups by whether the key can reach them:
 * material 0 for faces leaning toward `KEY_DIR`, 1 for the rest. The triangle order
 * is what changes — the index is rewritten as one run of lit faces then one of unlit —
 * so the vertices, UVs and normals stay as they are.
 */
function splitByLight(mesh) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex()?.array
    ?? Uint32Array.from({ length: position.count }, (_, i) => i);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const lit = [];
  const unlit = [];
  for (let i = 0; i + 2 < index.length; i += 3) {
    a.fromBufferAttribute(position, index[i]);
    b.fromBufferAttribute(position, index[i + 1]);
    c.fromBufferAttribute(position, index[i + 2]);
    const normal = c.sub(b).cross(a.sub(b)).applyMatrix3(normalMatrix);
    (normal.dot(KEY_DIR) > 0 ? lit : unlit).push(index[i], index[i + 1], index[i + 2]);
  }

  geometry.setIndex([...lit, ...unlit]);
  geometry.clearGroups();
  geometry.addGroup(0, lit.length, 0);
  geometry.addGroup(lit.length, unlit.length, 1);
}

function makeConcreteMaterial() {
  const map = loader.load(TEXTURE_FILE);
  map.colorSpace = THREE.SRGBColorSpace;
  // The crop is not seamless; mirroring folds each tile against the last so the
  // repeats meet without a visible edge.
  map.wrapS = THREE.MirroredRepeatWrapping;
  map.wrapT = THREE.MirroredRepeatWrapping;
  map.anisotropy = 8;

  const material = new THREE.MeshStandardMaterial({
    name: 'room_concrete',
    map,
    roughness: 0.95,
    metalness: 0,
  });
  material.color.setHex(WALL_TINT);
  material.userData.keepColor = true;
  return material;
}

/**
 * Projects the concrete onto a wall face-on: the mesh's thin axis is dropped and the
 * other two world axes become u and v.
 */
function addWallUVs(mesh) {
  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  // The thin axis is the wall's thickness; u runs along its length, v up its height.
  const uAxis = size.x <= size.z ? 'z' : 'x';
  projectPlanarUVs(mesh, { uAxis, vAxis: 'y', span: CONCRETE_TEXTURE_SPAN });
}

/**
 * Writes a world-space planar mapping over the mesh's `uv`, using two world axes and
 * a fixed span in scene units — so the grain stays the same size whatever the surface
 * measures, rather than stretching to fit it. `channels` names the UV sets to fill;
 * three reads `aoMap` from `uv1`, so a material with AO needs both.
 */
export function projectPlanarUVs(mesh, { uAxis, vAxis, span, channels = ['uv'] }) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const box = new THREE.Box3().setFromObject(mesh);

  const vertex = new THREE.Vector3();
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    uv[i * 2] = (vertex[uAxis] - box.min[uAxis]) / span;
    uv[i * 2 + 1] = (vertex[vAxis] - box.min[vAxis]) / span;
  }

  for (const channel of channels) {
    geometry.setAttribute(channel, new THREE.BufferAttribute(uv, 2));
  }
}
