import { materialsOf } from './materials.js';

/** 0 = unchanged, 1 = black. How far each material's colour is pulled down. */
const DARKEN = 0.62;

/** Textured materials (the desk) — its map is a bright laminate, so tint it hard. */
const MAP_DARKEN = 0.85;

/**
 * The desk material converts out at metalness 1, so it mirrors the bright room
 * environment no matter how dark its albedo is. Capping metalness lets the tint show.
 */
const MAP_MAX_METALNESS = 0.2;

/** Extra roughness added so the darker surfaces don't read as glossy plastic. */
const ROUGHNESS_BOOST = 0.12;

/**
 * Pulls the room's near-white materials down to mid/dark grey. Textured materials
 * (the desk) are tinted more gently so their maps keep their detail. Materials are
 * shared across many meshes here, so each one is only touched once.
 */
export function darkenScene(root) {
  const seen = new Set();

  root.traverse((node) => {
    if (!node.isMesh) return;
    for (const mat of materialsOf(node)) {
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      // Materials authored for a specific look (the desk's walnut and iron) opt out.
      if (mat.userData?.keepColor) continue;
      // The desk's corner patch has no map but must match the desk, not the room.
      const deskLike = mat.map || mat.userData?.deskLike;
      mat.color?.multiplyScalar(1 - (deskLike ? MAP_DARKEN : DARKEN));
      if (typeof mat.roughness === 'number') {
        mat.roughness = Math.min(1, mat.roughness + ROUGHNESS_BOOST);
      }
      if (deskLike && typeof mat.metalness === 'number') {
        mat.metalness = Math.min(mat.metalness, MAP_MAX_METALNESS);
      }
    }
  });
}
