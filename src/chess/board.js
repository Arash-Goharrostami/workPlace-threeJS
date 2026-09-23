import * as THREE from 'three';

/**
 * The chess set read as a board: which mesh is which piece, and where the squares are.
 *
 * Nothing here is typed in from the model. The set arrives with its 32 pieces standing
 * in their opening ranks, and that *is* the measurement: the two back ranks are a
 * known seven squares apart, so are the rooks on either end of one, and the white king
 * stands on e1 with his queen on d1, which says which way the files run. From those
 * the square pitch, the board's centre and its orientation all fall out, and a
 * re-import that shifts or rescales the set is still read correctly.
 *
 * Pieces are told apart by mesh name — `Piece_04_002_Black_Player_001_0.001` — where
 * the digits after `Piece_` say what it is (see `KINDS`), the material name says whose
 * it is, and a `.00N` suffix marks a piece split over several meshes (the bishops are
 * three). Each piece becomes one `THREE.Group` holding its meshes, so the game moves
 * pieces, not meshes.
 *
 * Every piece and the board are re-parented under one `table` group with an identity
 * transform straight under the set — `attach`, so nothing moves — which gives every
 * later position one frame to be written in: the set's own, in the model's units.
 */

/** What each `Piece_NN` number is, in chess.js's letters. */
const KINDS = { '01': 'p', '02': 'r', '03': 'n', '04': 'b', '05': 'q', '06': 'k' };

const FILES = 'abcdefgh';

/**
 * Reads the set. Returns the board's geometry and the pieces, each as
 * `{ group, kind, color, square }` with `square` its starting square.
 */
export function readBoard(set) {
  const table = new THREE.Group();
  table.name = 'Chess_table';
  set.add(table);
  set.updateMatrixWorld(true);

  // Meshes gathered per piece before anything is re-parented: `traverse` over a tree
  // being edited skips children.
  const byPiece = new Map();
  let boardMesh = null;
  set.traverse((node) => {
    if (!node.isMesh) return;
    if (node.name.startsWith('Chess_board')) {
      boardMesh = node;
      return;
    }
    const match = /^Piece_(\d\d)(?:_(\d+))?_(White|Black)_/i.exec(node.name);
    if (!match) return;
    const id = `${match[1]}_${match[2] ?? '000'}_${match[3].toLowerCase()}`;
    if (!byPiece.has(id)) byPiece.set(id, { kind: KINDS[match[1]], color: match[3][0].toLowerCase(), meshes: [] });
    byPiece.get(id).meshes.push(node);
  });
  if (!boardMesh) throw new Error('the chess set has no board mesh');
  table.attach(boardMesh);

  const box = new THREE.Box3();
  const pieces = [];
  for (const { kind, color, meshes } of byPiece.values()) {
    if (!kind) continue;
    box.makeEmpty();
    for (const mesh of meshes) box.expandByObject(mesh);
    // The group stands at the piece's foot, so a piece's position is its square.
    const foot = box.getCenter(new THREE.Vector3());
    foot.y = box.min.y;
    const group = new THREE.Group();
    group.name = `${color}_${kind}`;
    group.position.copy(table.worldToLocal(foot));
    table.add(group);
    for (const mesh of meshes) group.attach(mesh);
    pieces.push({ group, kind, color, square: null });
  }
  if (pieces.length !== 32) console.warn(`[chess] read ${pieces.length} pieces, not 32`);

  // The four occupied ranks, told apart along z by the gaps between them: the back
  // ranks are seven squares apart, so half a square is the line between the scatter
  // within a rank and the step to the next.
  const zs = pieces.map((p) => p.group.position.z).sort((a, b) => a - b);
  const span = zs[zs.length - 1] - zs[0];
  const rows = [[zs[0]]];
  for (let i = 1; i < zs.length; i++) {
    if (zs[i] - zs[i - 1] > span / 14) rows.push([]);
    rows[rows.length - 1].push(zs[i]);
  }
  if (rows.length !== 4) throw new Error(`[chess] expected four ranks of pieces, found ${rows.length}`);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const rowZ = rows.map(mean);

  // Seven squares between the back ranks, and seven between the rooks of each rank.
  const pitchZ = (rowZ[3] - rowZ[0]) / 7;
  const rowPitchX = rows.map((row) => {
    const xs = pieces
      .filter((p) => row.includes(p.group.position.z))
      .map((p) => p.group.position.x);
    return (Math.max(...xs) - Math.min(...xs)) / 7;
  });
  const pitch = (pitchZ + mean(rowPitchX)) / 2;

  const centre = new THREE.Vector3(
    mean(pieces.map((p) => p.group.position.x)),
    0,
    mean(pieces.map((p) => p.group.position.z))
  );

  // Which end is white's: the colour of whatever stands on the low-z back rank.
  const nearest = (z) => pieces.reduce((a, b) =>
    Math.abs(b.group.position.z - z) < Math.abs(a.group.position.z - z) ? b : a);
  const lowIsWhite = nearest(rowZ[0]).color === 'w';
  /** +1 when rank 1 → 8 runs with +z, −1 against it. */
  const dirZ = lowIsWhite ? 1 : -1;
  // …and which way the files run: the white king is a file past his queen.
  const king = pieces.find((p) => p.color === 'w' && p.kind === 'k');
  const queen = pieces.find((p) => p.color === 'w' && p.kind === 'q');
  /** +1 when file a → h runs with +x, −1 against it. */
  const dirX = Math.sign(king.group.position.x - queen.group.position.x) || 1;

  const squareToLocal = (square, out = new THREE.Vector3()) => {
    const f = FILES.indexOf(square[0]);
    const r = Number(square[1]) - 1;
    return out.set(
      centre.x + (f - 3.5) * pitch * dirX,
      0,
      centre.z + (r - 3.5) * pitch * dirZ
    );
  };

  /** The square under a point in the table's frame, or null off the playing area. */
  const localToSquare = (v) => {
    const f = Math.round(3.5 + (v.x - centre.x) / (pitch * dirX));
    const r = Math.round(3.5 + (v.z - centre.z) / (pitch * dirZ));
    if (f < 0 || f > 7 || r < 0 || r > 7) return null;
    return `${FILES[f]}${r + 1}`;
  };

  // Every piece is snapped to the square it stands nearest: the modeller placed them
  // by eye, a couple of units out here and there, and the game moves them by square.
  for (const piece of pieces) {
    piece.square = localToSquare(piece.group.position);
    const spot = squareToLocal(piece.square);
    piece.group.position.x = spot.x;
    piece.group.position.z = spot.z;
  }

  // The board's own extent, for parking taken pieces beside it, and its thickness, so
  // a piece parked on the desk stands as low as the desk rather than floating at the
  // board's top.
  boardMesh.geometry.computeBoundingBox();
  // Its own matrix is the one into the table's frame, now that it hangs off the table.
  boardMesh.updateMatrix();
  const boardBox = boardMesh.geometry.boundingBox.clone().applyMatrix4(boardMesh.matrix);
  const boardHalf = Math.max(boardBox.max.x - boardBox.min.x, boardBox.max.z - boardBox.min.z) / 2;
  const boardThickness = boardBox.max.y - boardBox.min.y;

  return {
    table,
    boardMesh,
    pieces,
    pitch,
    centre,
    boardHalf,
    boardThickness,
    /** Unit vector, in the table's frame, pointing from white's side toward black's. */
    whiteForward: new THREE.Vector3(0, 0, dirZ),
    /** Unit vector pointing from the a-file toward the h-file. */
    fileAxis: new THREE.Vector3(dirX, 0, 0),
    squareToLocal,
    localToSquare,
  };
}
