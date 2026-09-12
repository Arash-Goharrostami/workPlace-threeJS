import * as THREE from 'three';
import { projectPlanarUVs } from './wallMaterials.js';

/**
 * The room's floor: the ceramic tiles from the WorkDesk3D project, baked there by
 * its `tools/convert-floor-tiles.py`. Run `npm run floor` to re-copy them.
 *
 * Read that converter before changing anything here. The part that matters: the
 * sheet already tiles seamlessly and its joints live in the normal map and in the
 * occlusion folded into the colour — there is no AO map, and nothing here should be
 * drawing grout of its own.
 *
 * Two obstacles the model poses, the same the walls did: the floor shares
 * `GreyMaterial` with the chair and the shell, so its material is replaced rather
 * than mutated, and its mesh has no UVs, so the mapping is projected here.
 */

const TEXTURE_DIR = 'textures/floor-tiles/';

/**
 * A tile's real size in metres, and how many the baked sheet holds along an edge.
 * The sheet is scanned at 0.60 m, but laid at that size the tiles read far too large
 * for this room — 0.30 m is the size the floor is wanted at.
 */
const TILE_SIZE = 0.3;
const TILES_PER_SHEET = 8;

/** This scene's scale: the desk's 1.8 m board spans 180 units (`deskMaterials.js`). */
const UNITS_PER_METRE = 100;

/** So one wrap of the sheet covers 2.4 m — 240 units here. */
const SHEET_SPAN = TILE_SIZE * TILES_PER_SHEET * UNITS_PER_METRE;

/**
 * The floor's own tint. The rest of the room goes through `darkenScene.js`; this
 * material opts out of that and sets its level here, a little under the baked map so
 * the tiles do not glare against the dark concrete walls.
 */
const TINT = 0.15;

const loader = new THREE.TextureLoader();

/** Lays the tiles across the room's floor. */
export function applyFloorMaterial(model) {
  const floor = model.getObjectByName('floor');
  if (!floor) return null;

  const tiles = makeTileMaterial();
  floor.updateMatrixWorld(true);

  floor.traverse((node) => {
    if (!node.isMesh) return;
    projectPlanarUVs(node, { uAxis: 'x', vAxis: 'z', span: SHEET_SPAN });
    node.material = tiles;
  });

  return tiles;
}

function makeTileMaterial() {
  const material = new THREE.MeshStandardMaterial({
    name: 'room_floor_tiles',
    map: texture('floor-tiles-color.webp', { srgb: true }),
    roughnessMap: texture('floor-tiles-roughness.webp'),
    normalMap: texture('floor-tiles-normal.webp'),
    roughness: 1,
    metalness: 0,
  });
  material.color.multiplyScalar(TINT);
  material.userData.keepColor = true;
  return material;
}

/** One map. Only the colour is colour data; roughness and normal must stay linear. */
function texture(file, { srgb = false } = {}) {
  const map = loader.load(TEXTURE_DIR + file);
  map.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return map;
}
