import * as THREE from 'three';

/**
 * Click the guitar and it strums a chord — and, outside `?debug`, the camera flies in
 * to it and it can be played (see `guitarPlay.js`).
 *
 * The guitar is not one of the resume's anchors — there is no section behind it — so it
 * is not wired through `resume/picking.js`. It also has to answer in every state of the
 * room: while a section is open (when picking is switched off), and in `?debug`, where
 * there is no picking at all. So it listens on the canvas itself and casts against the
 * guitar alone; nothing else in the room can swallow or be swallowed by that click.
 *
 * The strings are real: six recordings of a steel-string acoustic, one per open string,
 * from tonejs-instruments (Nicholaus Brosowsky, CC-BY 3.0). A chord plays each string's
 * recording sped up to its fret — never more than four frets, which the ear does not
 * catch — low to high a few tens of milliseconds apart, the way a hand crosses them.
 *
 * The originals ring for 5–13 s each; `public/audio/guitar/` carries the first 2.5 s,
 * faded, mono at 64 kbps — 20 KB a string. The full-length files are in
 * `tmp/originals/guitar/`.
 */

/** Same as `picking.js`: a press and release further apart than this is an orbit drag. */
const CLICK_SLOP = 4;

/** Seconds between one string and the next in a strum. */
const STRUM_GAP = 0.03;

/** The six open strings, low to high, and the recording of each. */
const STRINGS = [
  'audio/guitar/e2.mp3',
  'audio/guitar/a2.mp3',
  'audio/guitar/d3.mp3',
  'audio/guitar/g3.mp3',
  'audio/guitar/b3.mp3',
  'audio/guitar/e4.mp3',
];

/**
 * Open chords as fret numbers per string, low E to high e; `null` is a string that is
 * not played in that chord.
 */
const CHORDS = {
  E:  [0, 2, 2, 1, 0, 0],
  Am: [null, 0, 2, 2, 1, 0],
  D:  [null, null, 0, 2, 3, 2],
  G:  [3, 2, 0, 0, 0, 3],
  C:  [null, 3, 2, 0, 1, 0],
  Em: [0, 2, 2, 0, 0, 0],
  A:  [null, 0, 2, 2, 2, 0],
};

const CHORD_NAMES = Object.keys(CHORDS);

/** No hand on the neck: every string rings at its own note. */
const OPEN = [0, 0, 0, 0, 0, 0];

/**
 * The guitar's voice, with nothing to do with clicks: six strings and the chords they
 * make. Shared by the click-to-strum below and the close-up in `guitarPlay.js`, so the
 * samples are fetched and decoded once whichever of the two touches the guitar first.
 */
export function createGuitarSound() {
  // Created on the first sound, not at load: a context made before any gesture starts
  // suspended, and Safari never lets it out. The samples are fetched and decoded then
  // too — 120 KB nobody who never touches the guitar has to download.
  let context = null;
  let master = null;
  let buffers = null;
  let lastChord = null;

  const ensureContext = () => {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
      master = context.createGain();
      master.gain.value = 0.8;
      master.connect(context.destination);
      buffers = Promise.all(STRINGS.map((url) =>
        fetch(url)
          .then((response) => response.arrayBuffer())
          .then((data) => context.decodeAudioData(data))
      ));
    }
    if (context.state === 'suspended') context.resume();
    return buffers;
  };

  /** Sounds string `i` (0 = low E) at `fret`, `delay` seconds from now. */
  const play = (strings, i, fret, velocity, delay) => {
    const source = context.createBufferSource();
    source.buffer = strings[i];
    // A fret is a semitone; the recording is the open string.
    source.playbackRate.value = 2 ** (fret / 12);

    const gain = context.createGain();
    gain.gain.value = velocity;
    source.connect(gain);
    gain.connect(master);
    source.start(context.currentTime + 0.01 + delay);
    source.onended = () => gain.disconnect();
  };

  /**
   * Strums `name` — a random chord other than the last when left out — low to high,
   * or high to low when `up`. Returns the chord's name.
   */
  const strum = async (name = null, up = false) => {
    const strings = await ensureContext();

    if (!name) {
      name = lastChord;
      while (name === lastChord) {
        name = CHORD_NAMES[Math.floor(Math.random() * CHORD_NAMES.length)];
      }
    }
    lastChord = name;

    // A little swing to each strum: how hard, and how quickly the hand crosses.
    const velocity = 0.75 + Math.random() * 0.25;
    const gap = STRUM_GAP * (0.7 + Math.random() * 0.6);

    const frets = CHORDS[name] ?? OPEN;
    const order = up ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];
    let step = 0;
    for (const i of order) {
      if (frets[i] == null) continue;
      play(strings, i, frets[i], velocity, step * gap);
      step += 1;
    }
    return name;
  };

  /**
   * Plucks string `i` as `chord` frets it, `delay` seconds from now — its own open note
 * when there is no chord. A string the chord leaves out is muted —
   * crossing it makes no sound, as a fretting hand's damped string would not.
   */
  const pluck = async (i, chord, delay = 0) => {
    const fret = chord ? CHORDS[chord]?.[i] : 0;
    if (fret == null) return;
    const strings = await ensureContext();
    play(strings, i, fret, 0.7 + Math.random() * 0.2, delay);
  };

  return { strum, pluck, chords: CHORD_NAMES };
}

/**
 * Makes `guitar` strum a random chord when clicked, whenever `enabled()` says so — not
 * while the close-up in `guitarPlay.js` has the guitar, which plays it its own way.
 * Returns the strum itself, so it can be fired from elsewhere — the console, say — as
 * `strum()`.
 */
export function setupGuitarStrum({ camera, canvas, guitar, sound, enabled = () => true }) {
  if (!guitar) return null;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const strum = () => sound.strum();

  const hits = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(guitar, true).length > 0;
  };

  let pressed = null;
  canvas.addEventListener('pointerdown', (event) => {
    pressed = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    const from = pressed;
    pressed = null;
    if (!from || !enabled()) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_SLOP) return;
    if (hits(event)) strum();
  });

  return strum;
}
