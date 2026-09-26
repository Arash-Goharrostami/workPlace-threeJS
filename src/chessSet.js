import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A wooden chess set standing on the desk, pieces in their opening ranks. Run
 * `npm run convert Chess_Set` to (re-)import it and
 * `npm run shrink -- chessSet 512 75 0.08 --size Chess_board_baseColor=2048` to bring it
 * back to 1.2 MB — the source is 1.55 M triangles and 50 MB, authored for a turntable,
 * and eight per cent of that is still 48 K triangles for a 30 cm prop. The board's colour
 * alone stays at 2048: the camera comes down onto it to play, and at 512 the squares
 * went soft.
 *
 * Every piece is a mesh of its own and the names survive the shrink, which the game
 * will lean on: `Piece_01_*` are the pawns, `_02_` rooks, `_03_` knights, `_04_` bishops
 * (three meshes each), `_05_` queens and `_06_` kings; the colour is in the material
 * name, `White_player_001` or `Black_Player_001`, and the board is `Chess_board`. So
 * nothing here merges geometry or renames materials — the set stays a tree of pieces.
 *
 * The source is far larger than life (the exporter's ×100), so it is scaled to
 * `BOARD_SIZE` across; its origin stays where the exporter put it, so the editor's
 * readout is exactly what `TRANSFORM` holds.
 */
export const MODEL_URL = 'models/chessSet.glb';
/** A small desk set: under half a tournament board. */
const BOARD_SIZE = 31.7;

/**
 * Where its origin sits, in world centimetres and degrees — set by hand in edit mode
 * and copied out of its readout, the rotation in that readout's own `YXZ` order.
 * Absolute, like the room's other dressed props: move the desk and it stays where it
 * is, and re-dressing it in edit mode is how it follows.
 */
const TRANSFORM = {
  position: [98.5, 85.4, 28.4],
  rotation: [0, 85.7, 0],
};

/**
 * The light side of the set, lifted a step. The source paints the white pieces a
 * muddy cream and the light squares much the same, and under the room's light both
 * read as grey against the black. The pieces' material gets its base colour scaled;
 * the squares live in the board's one texture together with the dark ones and the
 * border, so that map is re-drawn with only its brighter pixels — those above
 * `SQUARE_THRESHOLD` in luminance, which the dark squares and the border are not —
 * multiplied up. Both are marked `keepColor` so `darkenScene()` leaves the lift alone.
 */
const WHITE_MATERIAL = 'White_player_001';
const BOARD_MATERIAL = 'Chess_board';
const PIECE_BRIGHTEN = 1.25;
const SQUARE_BRIGHTEN = 1.2;
/** Luminance, 0–1, above which a pixel of the board's map is a light square. */
const SQUARE_THRESHOLD = 0.4;

/** Loads the set and stands it where it was left, on the right-hand end of the desk. */
export async function addChessSet(parent) {
  const gltf = await loadGLB(MODEL_URL);
  const set = gltf.scene;
  set.name = 'Chess_set';

  const refinished = new Map();
  set.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (node.material.name === WHITE_MATERIAL || node.material.name === BOARD_MATERIAL) {
      if (!refinished.has(node.material)) refinished.set(node.material, lighten(node.material));
      node.material = refinished.get(node.material);
    }
  });

  // Parented before measuring: the exporter's rotation and ×100 sit on nodes of their
  // own, so a box taken while the set is still detached would be in the wrong frame.
  parent.add(set);
  set.position.set(0, 0, 0);
  set.rotation.set(0, 0, 0);
  set.updateMatrixWorld(true);

  const size = new THREE.Box3().setFromObject(set).getSize(new THREE.Vector3());
  set.scale.setScalar(BOARD_SIZE / Math.max(size.x, size.z));

  set.rotation.set(...TRANSFORM.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
  // The placement is world-space but `parent` carries an offset of its own, so it has to
  // be converted into its local space.
  set.position.copy(parent.worldToLocal(new THREE.Vector3().fromArray(TRANSFORM.position)));
  set.updateMatrixWorld(true);

  return set;
}

/** One copy of a light-side material, lifted as described above. */
function lighten(material) {
  const copy = material.clone();
  copy.userData.keepColor = true;
  if (copy.name === WHITE_MATERIAL) {
    copy.color.multiplyScalar(PIECE_BRIGHTEN);
  } else if (copy.map?.image) {
    copy.map = lightenSquares(copy.map);
  }
  return copy;
}

/** The board's map with its light squares brightened; the dark ones and the border as they were. */
function lightenSquares(map) {
  const { image } = map;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = pixels;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    if (luminance < SQUARE_THRESHOLD) continue;
    data[i] = Math.min(255, data[i] * SQUARE_BRIGHTEN);
    data[i + 1] = Math.min(255, data[i + 1] * SQUARE_BRIGHTEN);
    data[i + 2] = Math.min(255, data[i + 2] * SQUARE_BRIGHTEN);
  }
  ctx.putImageData(pixels, 0, 0);

  const lifted = new THREE.CanvasTexture(canvas);
  lifted.colorSpace = map.colorSpace;
  lifted.flipY = map.flipY;
  lifted.wrapS = map.wrapS;
  lifted.wrapT = map.wrapT;
  lifted.repeat.copy(map.repeat);
  lifted.offset.copy(map.offset);
  lifted.channel = map.channel;
  // The board is played on up close and at a slant, where plain mipmapping smears the
  // far squares; the room's other textures take 8 as well (see `loadModel.js`).
  lifted.anisotropy = 8;
  return lifted;
}
