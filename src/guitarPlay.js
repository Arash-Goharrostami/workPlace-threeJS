import * as THREE from 'three';

/**
 * The guitar up close, played.
 *
 * `resume/index.js` flies the camera down onto the guitar and hands it over here; from
 * then until the way out, the pointer is the picking hand. The orbit is locked for the
 * whole visit — a drag is a strum, not a turn of the room.
 *
 * The strings are the model's own: the six are found in its `Strings` mesh (see
 * `findStrings`) and each is projected to the screen as the line it is drawn as. The
 * pointer plucks a string the moment it crosses that line — a mouse just passing over
 * the strings, or a finger dragged across them — so sweeping over all six is a strum,
 * in whichever direction and at whatever speed the hand moves. A tap on a string plucks
 * that one; a tap elsewhere on the guitar strums the chord; a tap off it leaves.
 *
 * Left alone, each string rings at its own open note. The chord bar — the glass buttons
 * along the bottom, or the keys 1–7 — holds a chord on the neck instead, and pressing
 * it again lets go. Space strums, Escape leaves.
 */

/** Same as `picking.js`: a press and release further apart than this is a drag. */
const CLICK_SLOP = 4;

/** The strings' material, as the model spells it — load-bearing, like `SOUNDBOARD`. */
const STRINGS = 'Strings';

/**
 * Where along the neck each string is sampled, in the model's own units (metres, on the
 * long axis). Each string is one straight tube with vertices only at its two ends, so
 * those are the only places to find them: at the bridge saddle and at the nut, short of
 * the windings round the tuners past 0.35.
 */
const SAMPLE_A = [-0.29, -0.25];
const SAMPLE_B = [0.3, 0.33];
/** …and how far each string runs, bridge saddle to nut. */
const SPAN = [-0.285, 0.325];

/** How close to a string, in pixels, a tap has to land to pluck it. */
const TAP_REACH = 14;
/**
 * The soundboard's material, as the model spells it. **Load-bearing**: the close-up is
 * aimed along this mesh's face and the strings are laid over it.
 */
const SOUNDBOARD = 'Sounboard';

/** Room left around the soundboard in the close-up, as a multiplier on a tight fit. */
const VIEW_MARGIN = 1.25;

/** The soundboard mesh of `guitar`, or the whole guitar when the name has gone. */
function soundboardOf(guitar) {
  let found = null;
  guitar.traverse((node) => {
    if (!found && node.isMesh && node.material?.name === SOUNDBOARD) found = node;
  });
  if (!found) console.warn(`[guitar] no "${SOUNDBOARD}" material — framing the whole guitar`);
  return found ?? guitar;
}

/**
 * The close-up: the camera straight in front of the soundboard, along its own normal,
 * so the guitar is seen face on — the stand turns it towards the desk and leans it
 * back, and the room-centre line every other anchor uses caught it from the side.
 * Fitted to the body alone, not the neck and stand, so the strings are big enough to
 * play. Same `{ cam, tgt, view }` shape as an anchor from `anchors.js`.
 */
export function guitarView(guitar, camera) {
  const board = soundboardOf(guitar);
  guitar.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(board);
  const tgt = box.getCenter(new THREE.Vector3());

  // Authored lying in its own x/z plane with the face towards -y (see `guitar.js`,
  // whose node rotation stands it up); the mesh's world matrix carries it round.
  const normal = new THREE.Vector3(0, -1, 0).transformDirection(board.matrixWorld);
  // Whichever way the face points, look at it from the side the room is on.
  if (normal.dot(new THREE.Vector3().subVectors(camera.position, tgt)) < 0) normal.negate();

  // The board's own extent, not its world box's: long side up the view, short across.
  const geometry = board.geometry;
  let height = 50, width = 40;
  if (geometry) {
    geometry.computeBoundingBox();
    const local = geometry.boundingBox.getSize(new THREE.Vector3());
    const scale = new THREE.Vector3().setFromMatrixScale(board.matrixWorld);
    height = local.z * scale.z;
    width = local.x * scale.x;
  }
  const half = THREE.MathUtils.degToRad(camera.fov) / 2;
  const distance = Math.max(
    height / 2 / Math.tan(half),
    width / 2 / (Math.tan(half) * camera.aspect)
  ) * VIEW_MARGIN;

  return { cam: tgt.clone().addScaledVector(normal, distance), tgt, view: 'Guitar' };
}

export function setupGuitarPlay({ camera, canvas, guitar, sound, onRequest, onExit }) {
  if (!guitar) return null;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const point = new THREE.Vector3();

  let active = false;
  /** The chord the neck is held in, or null for the open strings. */
  let chord = null;
  let pressed = null;
  /** Where the pointer was at the last move, in client pixels, or null. */
  let last = null;

  const strings = findStrings(guitar);
  const bar = buildChordBar();

  /** Each string as a line on screen, `{ i, ax, ay, bx, by }` in client pixels. */
  const project = () => {
    const rect = canvas.getBoundingClientRect();
    const toScreen = (v) => {
      point.copy(v).project(camera);
      return [rect.left + (point.x + 1) / 2 * rect.width, rect.top + (1 - point.y) / 2 * rect.height];
    };
    return strings.lines.map(({ i, a, b }) => {
      const [ax, ay] = toScreen(point.copy(a).applyMatrix4(strings.mesh.matrixWorld));
      const [bx, by] = toScreen(point.copy(b).applyMatrix4(strings.mesh.matrixWorld));
      return { i, ax, ay, bx, by };
    });
  };

  /** Plucks every string the pointer's move from `from` to `to` crossed, in the order it met them. */
  const sweep = (from, to) => {
    const crossed = [];
    for (const line of project()) {
      const t = crossing(from.x, from.y, to.x, to.y, line);
      if (t !== null) crossed.push({ i: line.i, t });
    }
    crossed.sort((p, q) => p.t - q.t);
    // A whole sweep inside one event still sounds as a sweep, not a block chord.
    crossed.forEach(({ i }, n) => sound.pluck(i, chord, n * 0.012));
    return crossed.length > 0;
  };

  /** The string nearest a point, within `TAP_REACH`, or null. */
  const stringAt = (x, y) => {
    let best = null;
    let bestDistance = TAP_REACH;
    for (const line of project()) {
      const d = distanceToSegment(x, y, line);
      if (d < bestDistance) { best = line.i; bestDistance = d; }
    }
    return best;
  };

  const hitsGuitar = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(guitar, true).length > 0;
  };

  const setChord = (name) => {
    chord = name;
    for (const button of bar.buttons) {
      const on = button.dataset.chord === name;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
    }
  };

  canvas.addEventListener('pointerdown', (event) => {
    pressed = { x: event.clientX, y: event.clientY };
    if (!active) return;
    last = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!active || !strings.lines.length) return;
    const now = { x: event.clientX, y: event.clientY };
    // A mouse plays by passing over the strings, pressed or not; a finger is only
    // on the glass while it is down.
    if (last && (event.pointerType !== 'touch' || pressed)) sweep(last, now);
    last = now;
    canvas.style.cursor = stringAt(now.x, now.y) !== null ? 'grab' : '';
  });
  canvas.addEventListener('pointerleave', () => { last = null; });

  canvas.addEventListener('pointerup', (event) => {
    const from = pressed;
    pressed = null;
    if (event.pointerType === 'touch') last = null;
    if (!from) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_SLOP) return;
    if (!active) {
      if (hitsGuitar(event)) onRequest?.();
      return;
    }
    const string = stringAt(event.clientX, event.clientY);
    if (string !== null) sound.pluck(string, chord);
    else if (hitsGuitar(event)) sound.strum(chord);
    else onExit?.();
  });

  window.addEventListener('keydown', (event) => {
    if (!active || event.metaKey || event.ctrlKey || event.altKey) return;
    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && index >= 0 && index < sound.chords.length) {
      const name = sound.chords[index];
      setChord(name === chord ? null : name);
    } else if (event.key === ' ') {
      event.preventDefault();
      sound.strum(chord, event.shiftKey);
    } else if (event.key === 'Escape') {
      onExit?.();
    }
  });

  bar.element.addEventListener('click', (event) => {
    const name = event.target.closest('[data-chord]')?.dataset.chord;
    if (!name) return;
    // A switch, not a sound: the chord is held on the neck and the strings play it. A
    // second press on the held chord lets go of it, back to the open strings.
    setChord(name === chord ? null : name);
  });

  setChord(chord);

  return {
    get active() { return active; },
    enter() {
      active = true;
      bar.element.hidden = false;
    },
    exit() {
      active = false;
      pressed = null;
      last = null;
      bar.element.hidden = true;
      canvas.style.cursor = '';
    },
  };

  /** The chord buttons along the bottom — `#chord-bar` in index.html. */
  function buildChordBar() {
    const element = document.getElementById('chord-bar');
    const buttons = sound.chords.map((name, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chord';
      button.dataset.chord = name;
      button.title = `${name} (${i + 1})`;
      button.textContent = name;
      element.append(button);
      return button;
    });
    element.classList.add('glass');
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', 'Chord');
    element.hidden = true;
    return { element, buttons };
  }
}

/**
 * The six strings of the guitar's `Strings` mesh, each as a straight line in that
 * mesh's own space from the bridge saddle to the nut, numbered 0 = low E.
 *
 * The mesh is every string as one tube soup, so they are told apart by where their
 * vertices sit across the neck: at the bridge and at the nut, the vertices fall into
 * six clusters split by the five widest gaps across. Pairing the two ends' clusters in
 * order gives each string's line — they fan out from nut to bridge. Low E is at -x:
 * the pickguard sits at +x, and a pickguard is always on the treble side.
 */
function findStrings(guitar) {
  let mesh = null;
  guitar.traverse((node) => {
    if (!mesh && node.isMesh && node.material?.name === STRINGS) mesh = node;
  });
  const none = { mesh: guitar, lines: [] };
  if (!mesh) {
    console.warn(`[guitar] no "${STRINGS}" material — the strings cannot be played`);
    return none;
  }

  const position = mesh.geometry.attributes.position;
  const bandA = [];
  const bandB = [];
  for (let k = 0; k < position.count; k++) {
    const z = position.getZ(k);
    const v = { x: position.getX(k), y: position.getY(k) };
    if (z >= SAMPLE_A[0] && z <= SAMPLE_A[1]) bandA.push(v);
    else if (z >= SAMPLE_B[0] && z <= SAMPLE_B[1]) bandB.push(v);
  }
  const a = clusters(bandA);
  const b = clusters(bandB);
  if (!a || !b) {
    console.warn('[guitar] could not tell the six strings apart — the strings cannot be played');
    return none;
  }

  const zA = (SAMPLE_A[0] + SAMPLE_A[1]) / 2;
  const zB = (SAMPLE_B[0] + SAMPLE_B[1]) / 2;
  const lines = a.map((ca, n) => {
    const cb = b[n];
    // Extended from the two samples out to the string's real ends.
    const at = (z) => {
      const t = (z - zA) / (zB - zA);
      return new THREE.Vector3(ca.x + (cb.x - ca.x) * t, ca.y + (cb.y - ca.y) * t, z);
    };
    return { i: n, a: at(SPAN[0]), b: at(SPAN[1]) };
  });
  return { mesh, lines };
}

/** Six clusters across x, each `{ x, y }`, or null when there are not six. */
function clusters(points) {
  if (points.length < 12) return null;
  points.sort((p, q) => p.x - q.x);
  const gaps = [];
  for (let k = 1; k < points.length; k++) gaps.push({ k, size: points[k].x - points[k - 1].x });
  const cuts = gaps.sort((p, q) => q.size - p.size).slice(0, 5).map((g) => g.k).sort((p, q) => p - q);
  const groups = [];
  let from = 0;
  for (const cut of [...cuts, points.length]) {
    const group = points.slice(from, cut);
    from = cut;
    if (!group.length) return null;
    groups.push({
      x: group.reduce((sum, p) => sum + p.x, 0) / group.length,
      y: group.reduce((sum, p) => sum + p.y, 0) / group.length,
    });
  }
  return groups;
}

/**
 * Where along the move p→q it crosses the string's screen segment, as 0..1, or null
 * when it does not.
 */
function crossing(px, py, qx, qy, { ax, ay, bx, by }) {
  const rx = qx - px, ry = qy - py;
  const sx = bx - ax, sy = by - ay;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((ax - px) * sy - (ay - py) * sx) / denominator;
  const u = ((ax - px) * ry - (ay - py) * rx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** The distance in pixels from a point to the string's screen segment. */
function distanceToSegment(x, y, { ax, ay, bx, by }) {
  const sx = bx - ax, sy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * sx + (y - ay) * sy) / (sx * sx + sy * sy || 1)));
  return Math.hypot(x - (ax + sx * t), y - (ay + sy * t));
}
