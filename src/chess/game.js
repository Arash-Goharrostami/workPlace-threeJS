import * as THREE from 'three';
import { Chess } from 'chess.js';
import { readBoard } from './board.js';
import { createEngine, LEVELS } from './engine.js';

/**
 * A game of chess on the desk, against the room.
 *
 * The visitor is white, always; the room — Stockfish, held back to a beginner's level
 * unless the card says otherwise (`engine.js`) — is black. Rules are chess.js's; this
 * module is the board between the two: it turns clicks on pieces and squares into
 * moves, and moves back into pieces sliding across the board.
 *
 * Same contract as `phoneApps.js` and `sheetPrompt.js`, since the set is a section read
 * on its prop: `hover(mesh)` says whether a click there would do something, `open(mesh,
 * hit)` takes the click, `reset()` is the section closing. Two more that the others do
 * not need: `enter()` when the camera comes down to the board, and `update(dt)` /
 * `busy()` for the pieces in motion, since the room draws at an idle rate unless
 * something says it is moving.
 *
 * Pieces are never told where to go one at a time. After every move the board is
 * *reconciled*: chess.js says what stands where, each piece is matched to a square (or
 * to a slot beside the board, if it has been taken), and any piece not already there
 * glides over. The moved piece, a castling rook, a captured piece leaving, a pawn
 * promoted into a taken queen — every case is the same diff.
 *
 * The position is kept in `localStorage`, so a game left mid-way is on the board when
 * the room is opened again.
 */

const STORAGE_FEN = 'chess.fen';
const STORAGE_LEVEL = 'chess.level';

/** How long a piece takes to cross the board, in seconds, and how high it lifts. */
const MOVE_SECONDS = 0.45;
/** In units of the square pitch. */
const MOVE_LIFT = 0.6;
/** A taken piece waits for its captor to land before it leaves. */
const CAPTURE_DELAY = 0.3;
/** How high, as a share of the pitch, a selected piece is held up off its square. */
const SELECT_LIFT = 0.3;
/** The room's pause before answering, in seconds — a beat, not a reflex. */
const THINK_PAUSE = [0.4, 1.0];

/**
 * The tiles laid on squares: glass slabs the size of most of a square, with a rim.
 * One colour per meaning — the square under the pointer, the squares a piece can go
 * to, an enemy it can take, and the king while in check — in the order they win when
 * a square means two things at once (later wins).
 */
const TILE_SIZE = 0.86;
const TILE_CORNER = 0.16;
const TILE_RIM = 0.07;
const TILE_OPACITY = 0.45;
const RIM_OPACITY = 0.9;
/** The slow breath on the glass: how much and how often, in seconds. */
const TILE_PULSE = 0.08;
const TILE_PULSE_SECONDS = 2.2;
const ROLES = ['hover', 'move', 'capture', 'check'];
const TILE_COLORS = {
  hover: 0xffd23f,
  move: 0x4aa8ff,
  capture: 0x3ddc84,
  check: 0xff4b4b,
};

/** How far off its slot, as a share of a square, a taken piece is dropped. */
const PARK_SCATTER = 0.22;

/** The status card's lines. */
const STATUS = {
  yours: 'Your move — you play white',
  thinking: 'The room is thinking…',
  check: 'Check — your move',
  win: 'Checkmate — you win',
  lose: 'Checkmate — the room wins',
  draw: 'Draw',
};

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function setupChess({ group }) {
  const board = readBoard(group);
  const { table, pitch, pieces } = board;
  const engine = createEngine();

  const stored = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const store = (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* private mode, or full */ }
  };

  const chess = new Chess();
  const savedFen = stored(STORAGE_FEN);
  if (savedFen) {
    try { chess.load(savedFen); } catch { chess.reset(); }
  }
  engine.setLevel(Number(stored(STORAGE_LEVEL)) || 1);

  // Where a piece's foot sits on the board — the pieces all share it — and the y of
  // the tiles, just clear of the wood.
  const footY = pieces[0].group.position.y;
  const tileY = footY + pitch * 0.02;

  /* ---- the tiles on the squares ------------------------------------------------- */

  const half = pitch * TILE_SIZE / 2;
  const roundedSquare = (h, r) => {
    const shape = new THREE.Shape();
    shape.moveTo(-h + r, -h);
    shape.lineTo(h - r, -h);
    shape.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(h, h - r);
    shape.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-h + r, h);
    shape.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-h, -h + r);
    shape.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
    return shape;
  };
  const outer = roundedSquare(half, half * TILE_CORNER * 2);
  const inner = roundedSquare(half * (1 - TILE_RIM), half * (1 - TILE_RIM) * TILE_CORNER * 2);
  const fillGeometry = new THREE.ShapeGeometry(outer, 12);
  const rimShape = roundedSquare(half, half * TILE_CORNER * 2);
  rimShape.holes.push(inner);
  const rimGeometry = new THREE.ShapeGeometry(rimShape, 12);
  // Shapes are drawn in the XY plane; the board is XZ.
  fillGeometry.rotateX(-Math.PI / 2);
  rimGeometry.rotateX(-Math.PI / 2);

  const materials = {};
  for (const role of ROLES) {
    const fill = new THREE.MeshPhysicalMaterial({
      color: TILE_COLORS[role],
      transparent: true,
      opacity: TILE_OPACITY,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      transmission: 0.35,
      ior: 1.4,
      thickness: pitch * 0.05,
      depthWrite: false,
    });
    const rim = new THREE.MeshBasicMaterial({
      color: new THREE.Color(TILE_COLORS[role]).offsetHSL(0, 0, 0.12),
      transparent: true,
      opacity: RIM_OPACITY,
      depthWrite: false,
    });
    fill.userData.keepColor = true;
    rim.userData.keepColor = true;
    materials[role] = { fill, rim };
  }

  /** @type {{group: THREE.Group, fill: THREE.Mesh, rim: THREE.Mesh}[]} */
  const tiles = [];
  const tileFor = (i) => {
    while (tiles.length <= i) {
      const group = new THREE.Group();
      group.name = 'Chess_tile';
      const fill = new THREE.Mesh(fillGeometry, materials.move.fill);
      const rim = new THREE.Mesh(rimGeometry, materials.move.rim);
      // The rim sits a hair above the fill so the two never fight for the pixel.
      rim.position.y = pitch * 0.004;
      // The square is on the meshes, since a ray lands on a mesh, not its group.
      fill.userData.square = null;
      rim.userData.square = null;
      group.add(fill, rim);
      group.visible = false;
      table.add(group);
      tiles.push({ group, fill, rim });
    }
    return tiles[i];
  };

  /** Lays one tile per square in `roles` (square → role) and hides the rest. */
  const layTiles = (roles) => {
    let i = 0;
    for (const [square, role] of roles) {
      const tile = tileFor(i++);
      board.squareToLocal(square, tile.group.position);
      tile.group.position.y = tileY;
      tile.fill.material = materials[role].fill;
      tile.rim.material = materials[role].rim;
      tile.fill.userData.square = square;
      tile.rim.userData.square = square;
      tile.group.visible = true;
    }
    for (; i < tiles.length; i++) {
      tiles[i].group.visible = false;
      tiles[i].fill.userData.square = null;
      tiles[i].rim.userData.square = null;
    }
  };

  let pulse = 0;
  const breathe = (dt) => {
    if (!tiles.some((tile) => tile.group.visible)) return;
    pulse += dt;
    const lift = Math.sin((pulse / TILE_PULSE_SECONDS) * Math.PI * 2) * TILE_PULSE;
    for (const role of ROLES) materials[role].fill.opacity = TILE_OPACITY + lift;
  };

  /* ---- pieces in motion --------------------------------------------------------- */

  /** @type {{group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, lift: number, delay: number, t: number}[]} */
  const tweens = [];
  const glide = (piece, to, { lift = 0, delay = 0, spin = 0 } = {}) => {
    // A piece already on its way is re-aimed, not doubled.
    const i = tweens.findIndex((tw) => tw.group === piece.group);
    if (i >= 0) tweens.splice(i, 1);
    tweens.push({
      group: piece.group,
      from: piece.group.position.clone(),
      to: to.clone(),
      fromSpin: piece.group.rotation.y,
      spin,
      lift,
      delay,
      t: 0,
    });
  };
  const settle = () => {
    for (const tw of tweens) {
      tw.group.position.copy(tw.to);
      tw.group.rotation.y = tw.spin;
    }
    tweens.length = 0;
  };

  const update = (dt) => {
    breathe(dt);
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const t = Math.min(1, Math.max(0, (tw.t - tw.delay) / MOVE_SECONDS));
      const e = ease(t);
      tw.group.position.lerpVectors(tw.from, tw.to, e);
      tw.group.position.y += Math.sin(t * Math.PI) * tw.lift;
      tw.group.rotation.y = tw.fromSpin + (tw.spin - tw.fromSpin) * e;
      if (t >= 1) tweens.splice(i, 1);
    }
  };

  /* ---- reconciling the pieces with the position -------------------------------- */

  /**
   * Slots beside the board for taken pieces: white's on black's right, black's on
   * white's right, two rows deep, in the order they were taken.
   */
  const parked = { w: [], b: [] };
  /**
   * A number in 0–1 that is always the same for a slot, so the pile lies the same way
   * after a reload as it did before — nobody set it straight in between.
   */
  const jitter = (color, i, salt) => {
    let h = (color === 'w' ? 7 : 13) * 2654435761 + i * 40503 + salt * 65599;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const slotFor = (color, i) => {
    // The captor's side: a black piece taken is parked on white's right. Two rows,
    // each piece dropped a little off its spot and turned however it landed.
    const forward = board.whiteForward.clone().multiplyScalar(color === 'b' ? 1 : -1);
    const right = forward.clone().cross(new THREE.Vector3(0, 1, 0));
    const row = i % 2;
    const k = Math.floor(i / 2);
    const position = board.centre.clone()
      .addScaledVector(right, board.boardHalf + pitch * (0.7 + row * 0.8) + (jitter(color, i, 1) - 0.5) * 2 * pitch * PARK_SCATTER)
      .addScaledVector(forward, (k - 3.5) * pitch * 0.8 + (jitter(color, i, 2) - 0.5) * 2 * pitch * PARK_SCATTER)
      .setY(footY - board.boardThickness);
    return { position, spin: jitter(color, i, 3) * Math.PI * 2 };
  };

  /**
   * Matches every piece to the square chess.js says it is on, or to a slot beside the
   * board, and glides whichever are not there yet. `animate: false` snaps them, for a
   * game restored on load.
   */
  const reconcile = ({ animate = true } = {}) => {
    const wanted = new Map();
    for (const row of chess.board()) {
      for (const cell of row) if (cell) wanted.set(cell.square, cell);
    }
    const free = new Set(pieces);
    const placed = new Map();

    // Anything standing on a square that still wants it stays.
    for (const piece of pieces) {
      const cell = piece.square && wanted.get(piece.square);
      if (cell && cell.color === piece.color && cell.type === piece.kind) {
        placed.set(piece.square, piece);
        free.delete(piece);
      }
    }
    // The rest of the squares take, in order of preference: a loose piece of the
    // right kind still on the board (the one that just moved), one of the right kind
    // from beside the board (a promotion into a taken queen), and finally a piece of
    // that colour standing on the square already, which is what a promoted pawn is
    // when no queen has been taken — it keeps its shape and plays as the queen it now
    // is. Any other loose piece of the colour is the last resort, for a position
    // restored from storage that the set cannot spell exactly.
    const take = (pick) => {
      for (const piece of free) {
        if (pick(piece)) {
          free.delete(piece);
          return piece;
        }
      }
      return null;
    };
    for (const [square, cell] of wanted) {
      if (placed.has(square)) continue;
      const piece =
        take((p) => p.color === cell.color && p.kind === cell.type && p.square) ??
        take((p) => p.color === cell.color && p.kind === cell.type) ??
        take((p) => p.color === cell.color && p.square === square) ??
        take((p) => p.color === cell.color && p.square) ??
        take((p) => p.color === cell.color);
      if (!piece) {
        console.warn(`[chess] no piece left for ${cell.color}${cell.type} on ${square}`);
        continue;
      }
      placed.set(square, piece);
    }

    let captured = false;
    for (const [square, piece] of placed) {
      const moved = piece.square !== square;
      const wasParked = !piece.square;
      piece.square = square;
      if (wasParked) {
        const list = parked[piece.color];
        const i = list.indexOf(piece);
        if (i >= 0) list.splice(i, 1);
      }
      if (moved) {
        const to = board.squareToLocal(square).setY(footY);
        if (animate) glide(piece, to, { lift: pitch * MOVE_LIFT, spin: 0 });
        else {
          piece.group.position.copy(to);
          piece.group.rotation.y = 0;
        }
      }
    }
    // Whatever is left has been taken. A piece taken this move leaves after its captor
    // lands; one already beside the board keeps its slot.
    for (const piece of free) {
      const list = parked[piece.color];
      if (list.includes(piece)) continue;
      piece.square = null;
      list.push(piece);
      captured = true;
      const { position, spin } = slotFor(piece.color, list.length - 1);
      if (animate) glide(piece, position, { lift: pitch * MOVE_LIFT * 0.5, delay: CAPTURE_DELAY, spin });
      else {
        piece.group.position.copy(position);
        piece.group.rotation.y = spin;
      }
    }
    return captured;
  };

  // A restored game: every piece straight to where it belongs before anyone looks.
  reconcile({ animate: false });

  /* ---- the card ----------------------------------------------------------------- */

  const card = document.getElementById('chess');
  const statusEl = card?.querySelector('[data-status]');
  const levelEl = card?.querySelector('[data-level]');
  const newBtn = card?.querySelector('[data-new]');
  if (levelEl) {
    levelEl.innerHTML = LEVELS.map((_, i) => `<option value="${i + 1}">Level ${i + 1}</option>`).join('');
    levelEl.value = String(engine.level);
    levelEl.addEventListener('change', () => {
      engine.setLevel(Number(levelEl.value));
      store(STORAGE_LEVEL, String(engine.level));
    });
  }
  newBtn?.addEventListener('click', () => newGame());
  const showCard = (on) => card?.classList.toggle('is-open', on);
  const setStatus = (text) => {
    if (statusEl) statusEl.textContent = text;
  };

  const status = () => {
    if (chess.isCheckmate()) return chess.turn() === 'w' ? STATUS.lose : STATUS.win;
    if (chess.isGameOver()) return STATUS.draw;
    if (chess.turn() === 'b') return STATUS.thinking;
    return chess.isCheck() ? STATUS.check : STATUS.yours;
  };

  /* ---- play --------------------------------------------------------------------- */

  let selected = null;
  /** The legal destinations of `selected`, by square. */
  let targets = new Map();
  let thinking = false;
  /** Bumped on New game, so a reply still on its way for the old game is dropped. */
  let gameId = 0;

  /** The white piece under the pointer, if any. */
  let hovered = null;

  /**
   * Lays the tiles for everything the board has to say right now: the king in check,
   * the selection's captures and moves, the square under the pointer. Later roles in
   * `ROLES` win a square that means two things.
   */
  const paint = () => {
    const roles = new Map();
    const say = (square, role) => {
      if (!square) return;
      const held = roles.get(square);
      if (!held || ROLES.indexOf(role) > ROLES.indexOf(held)) roles.set(square, role);
    };
    if (hovered?.square && yourTurn()) say(hovered.square, 'hover');
    for (const [square, move] of targets) say(square, move.captured ? 'capture' : 'move');
    if (chess.isCheck()) {
      const king = pieces.find((p) => p.kind === 'k' && p.color === chess.turn() && p.square);
      say(king?.square, 'check');
    }
    layTiles(roles);
  };

  const select = (piece) => {
    deselect();
    if (!piece) return;
    selected = piece;
    piece.group.position.y = footY + pitch * SELECT_LIFT;
    targets = new Map(chess.moves({ square: piece.square, verbose: true }).map((m) => [m.to, m]));
    paint();
  };
  const deselect = () => {
    if (selected && !tweens.some((tw) => tw.group === selected.group)) {
      selected.group.position.y = footY;
    }
    selected = null;
    targets = new Map();
    paint();
  };

  const finish = () => {
    store(STORAGE_FEN, chess.fen());
    setStatus(status());
    paint();
  };

  const play = (move) => {
    try {
      chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
    } catch (error) {
      console.warn('[chess] refused move', move, error);
      return false;
    }
    deselect();
    reconcile();
    finish();
    if (!chess.isGameOver() && chess.turn() === 'b') reply();
    return true;
  };

  const reply = async () => {
    const id = gameId;
    thinking = true;
    const pause = THINK_PAUSE[0] + Math.random() * (THINK_PAUSE[1] - THINK_PAUSE[0]);
    const [uci] = await Promise.all([
      engine.bestMove(chess.fen()),
      new Promise((resolve) => setTimeout(resolve, pause * 1000)),
    ]);
    if (id !== gameId) return;
    thinking = false;
    if (!uci) return;
    play({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  };

  const newGame = () => {
    gameId += 1;
    engine.stop();
    thinking = false;
    deselect();
    settle();
    chess.reset();
    reconcile();
    finish();
  };

  /** The piece a mesh belongs to, if any. */
  const pieceOf = (object) => {
    for (let node = object; node; node = node.parent) {
      const piece = pieces.find((p) => p.group === node);
      if (piece) return piece;
      if (node === table) break;
    }
    return null;
  };

  const yourTurn = () => !thinking && !chess.isGameOver() && chess.turn() === 'w';

  /** The square a click on the board landed on, from the hit point. */
  const squareUnder = (hit) => board.localToSquare(table.worldToLocal(hit.point.clone()));

  const hover = (object) => {
    const piece = object ? pieceOf(object) : null;
    const own = piece?.color === 'w' && piece.square ? piece : null;
    if (own !== hovered) {
      hovered = own;
      paint();
    }
    if (!object || !yourTurn()) return false;
    if (object.userData.square) return true;
    if (own) return true;
    return Boolean(piece?.square && targets.has(piece.square));
  };

  /**
   * A click on the set. Returns true whenever it landed on the set at all — a
   * misclick on the board is not a step back out to the room; the desk around it is.
   */
  const open = (object, hit) => {
    if (!object) return false;
    if (!yourTurn()) return true;
    const piece = pieceOf(object);
    // A lit square, a piece standing on one (a capture), or the board under one.
    const square = object.userData.square
      ?? piece?.square
      ?? (object === board.boardMesh && hit ? squareUnder(hit) : null);
    if (selected && square && targets.has(square)) {
      play(targets.get(square));
      return true;
    }
    if (piece?.color === 'w' && piece.square) {
      if (piece === selected) deselect();
      else select(piece);
      return true;
    }
    deselect();
    return true;
  };

  const enter = () => {
    engine.warm();
    showCard(true);
    setStatus(status());
    paint();
    // Opened onto black's move — the tab was closed while the room was thinking.
    if (!thinking && !chess.isGameOver() && chess.turn() === 'b') reply();
  };

  const reset = () => {
    hovered = null;
    deselect();
    showCard(false);
  };

  const busy = () => tweens.length > 0 || thinking;

  return { hover, open, enter, reset, update, busy };
}
