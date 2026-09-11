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

const TEXTURE_FILE = 'textures/wall/Concrete_baseColor.jpg';

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
const WALL_TINT = 0x454f66;

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

  for (const child of walls.children) {
    if (NON_WALLS.has(child.name)) continue;
    child.updateMatrixWorld(true);
    child.traverse((node) => {
      if (!node.isMesh) return;
      addWallUVs(node);
      node.material = concrete;
    });
  }

  return concrete;
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
