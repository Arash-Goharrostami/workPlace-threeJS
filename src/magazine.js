import * as THREE from 'three';

/**
 * The open book on the desk's left (`Set_OpenBook_2`, see `booksSet.js`) as a car
 * magazine: click it and a page turns. Three spreads, back and forth: the right-hand
 * page turns over until the last spread, then the left-hand one turns back until the
 * first, and forward again from there.
 *
 * The book is one solid mesh, so its own pages cannot move. Paper sheets are laid over
 * them instead — children of the book's mesh node, so they are in the source's own
 * frame and follow wherever the book is dressed. In that frame the book lies along x
 * (spine at `SPINE_X`), its pages run ±y, and up is −z. The pages are not flat: each
 * bulges up toward the spine and dips into the gutter, and `LEFT`/`RIGHT` are that
 * profile, read off the mesh's top edge, as [x, height] with height = −z. The sheets
 * follow it at `LIFT` above, so the book's own print never shows through.
 *
 * The turn is heard as well as seen: `public/audio/pageTurn.mp3` is freesound's "big
 * paper" (103397, from the freesound_community account), the original in
 * `tmp/books/`. Its first 0.45 s were near-silent, so it is cut to start there and end
 * at 1.7 s, faded, mono at 64 kbps — the rustle then falls inside the 0.9 s turn, 10 KB
 * against 60. Like the guitar it answers a click, so it plays whatever the sound
 * button says.
 *
 * The page images are built by `npm run magazine` (`scripts/magazine-pages.mjs`), which
 * also credits the photos.
 *
 * A turn forward: the right sheet already shows the next spread's right page, and a
 * third, turning sheet — this spread's right page on its face, the next one's left on
 * its back — swings over the spine onto the left. A turn back is the same sheet run the
 * other way: the left sheet already shows the previous spread's left page, and the
 * turning one, this spread's left page on its back and the previous right on its face,
 * swings from the left over onto the right. Its shape is worked out each frame from arc
 * length, so the paper never stretches: every step along it heads at the turn's angle,
 * less a lag that grows toward the free edge, which is the curl. The bulge of the page
 * it leaves and the page it lands on is blended in at either end and fades out mid-air.
 */

const SPREADS = [1, 2, 3].map((n) => ({
  left: `textures/magazine/spread${n}-left.jpg`,
  right: `textures/magazine/spread${n}-right.jpg`,
}));

const BOOK_NODE = 'Set_OpenBook_2';
const MESH_NODE = 'Open_Book_2_Book_Mat_0';

/** The spine, in the source's frame: where the two pages meet, and its height. */
const SPINE_X = 52.343;
const SPINE_H = 0.263;
/** The left page's profile from its outer edge in to the spine, as [x, height]. */
const LEFT = [
  [32.98, 0.512], [34.446, 0.502], [36.121, 0.534], [38.153, 0.665], [40.278, 0.952],
  [42.217, 1.435], [43.954, 1.993], [45.519, 2.491], [46.937, 2.883], [48.237, 3.132],
  [49.434, 3.187], [50.533, 3.001], [51.438, 2.586], [52.057, 1.983], [SPINE_X, SPINE_H],
];
/** The right page's profile from the spine out to its edge. */
const RIGHT = [
  [SPINE_X, SPINE_H], [52.421, 0.416], [52.592, 0.675], [52.952, 1.088], [53.558, 1.591],
  [54.433, 2.056], [55.565, 2.348], [56.837, 2.438], [58.132, 2.332], [59.392, 2.094],
  [60.607, 1.787], [61.99, 1.427], [63.728, 1.03], [65.634, 0.721], [67.489, 0.612],
  [69.232, 0.622], [70.837, 0.67], [72.365, 0.746],
];
const LEFT_LEN = SPINE_X - LEFT[0][0];
const RIGHT_LEN = RIGHT[RIGHT.length - 1][0] - SPINE_X;
/** Half the page's height, a little in from the book's own edge. */
const HALF_H = 13.55;

/** How far the sheets sit above the book's page, and the turning one above them. */
const LIFT = 0.06;
const TURN_LIFT = 0.1;
/** Columns along a sheet — enough for the gutter's dip and the curl to read round. */
const SEGMENTS = 48;

const TURN_S = 0.9;
/** How far the free edge lags the spine mid-turn, in radians — the curl. */
const CURL = 0.9;

/** Same as `picking.js`: a press and release further apart than this is an orbit drag. */
const CLICK_SLOP = 4;

const ease = (t) => t * t * (3 - 2 * t);

const PAGE_SOUND = 'audio/pageTurn.mp3';
/** The page sound's overall level. */
const VOLUME = 0.6;

/**
 * A page-turn sound player on its own audio context, which is made — and the clip
 * fetched and decoded — on the first turn: a click, so the browser lets it start. Each
 * play runs a few per cent faster or slower, so a run of turns does not sound like one
 * sample repeated.
 */
function makePageSound() {
  let context = null;
  let master = null;
  let clip = null;

  const ensure = () => {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
      master = context.createGain();
      master.gain.value = VOLUME;
      master.connect(context.destination);
      clip = fetch(PAGE_SOUND)
        .then((response) => response.arrayBuffer())
        .then((data) => context.decodeAudioData(data));
    }
    if (context.state === 'suspended') context.resume();
    return clip;
  };

  return async () => {
    const buffer = await ensure();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.05;
    source.connect(master);
    source.start();
    source.onended = () => source.disconnect();
  };
}

/** The profile's height at `x`, linear between its samples. */
function heightAt(profile, x) {
  if (x <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    const [x1, h1] = profile[i];
    if (x <= x1) {
      const [x0, h0] = profile[i - 1];
      return h0 + ((h1 - h0) * (x - x0)) / (x1 - x0);
    }
  }
  return profile[profile.length - 1][1];
}

/**
 * A sheet of `SEGMENTS` columns by one row, its UVs laid out once: u across the page
 * from its outer-left edge, v = 1 at the page's top (−y, away from the chair). Positions
 * are filled by `shapeSheet` from `shape(s)` → [x, height], s being 0…1 across.
 */
function makeSheet() {
  const geometry = new THREE.BufferGeometry();
  const count = (SEGMENTS + 1) * 2;
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const uv = new Float32Array(count * 2);
  const index = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = i / SEGMENTS;
    // Vertex 2i is the page's top edge (−y), 2i + 1 its bottom (+y).
    uv.set([s, 1, s, 0], i * 4);
    if (i < SEGMENTS) {
      const a = i * 2, b = a + 2, c = a + 1, d = a + 3;
      // Wound so the face points up (−z) while x runs with s.
      index.push(a, c, b, c, d, b);
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

function shapeSheet(geometry, shape) {
  const pos = geometry.attributes.position;
  for (let i = 0; i <= SEGMENTS; i++) {
    const [x, h] = shape(i / SEGMENTS);
    pos.setXYZ(i * 2, x, -HALF_H, -h);
    pos.setXYZ(i * 2 + 1, x, HALF_H, -h);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

/**
 * Where the turning sheet is, `s` of the way from the spine to its free edge, at `t` of
 * a turn in direction `dir` (1 forward, −1 back). `theta` is the sheet's angle over the
 * spine, 0 lying on the right and π on the left; the free edge always trails the way
 * the sheet is going.
 */
function turnShape(t, dir) {
  const theta = Math.PI * ease(dir > 0 ? t : 1 - t);
  const len = RIGHT_LEN + (LEFT_LEN - RIGHT_LEN) * (theta / Math.PI);
  const ds = len / SEGMENTS;
  const lag = CURL * Math.sin(theta);
  // Each page's own bulge over the straight line out from the spine, faded out as the
  // sheet lifts off it and in as it lands.
  const fromW = Math.max(0, Math.cos(theta));
  const toW = Math.max(0, -Math.cos(theta));

  const points = [];
  let x = SPINE_X;
  let h = SPINE_H;
  for (let i = 0; i <= SEGMENTS; i++) {
    const d = i * ds;
    const bulge = fromW * (heightAt(RIGHT, SPINE_X + d) - SPINE_H)
      + toW * (heightAt(LEFT, SPINE_X - d) - SPINE_H);
    points.push([x, h + bulge + TURN_LIFT]);
    const phi = theta - dir * lag * ((i + 0.5) / SEGMENTS) ** 1.5;
    x += Math.cos(phi) * ds;
    h += Math.sin(phi) * ds;
  }
  // The sheet's u runs outer-left → right, which on a right page is spine → edge.
  return (s) => points[Math.round(s * SEGMENTS)];
}

export function setupMagazine({ camera, canvas, model }) {
  const book = model?.getObjectByName(BOOK_NODE);
  const mesh = book?.getObjectByName(MESH_NODE);
  if (!mesh) {
    console.warn(`[magazine] no "${BOOK_NODE}" in the room — magazine skipped`);
    return null;
  }

  const loader = new THREE.TextureLoader();
  const load = (url, mirrored = false) => {
    const texture = loader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    if (mirrored) {
      // The turning sheet's back is seen from the other side, so its u runs backwards.
      texture.wrapS = THREE.RepeatWrapping;
      texture.repeat.x = -1;
      texture.offset.x = 1;
    }
    return texture;
  };
  const pages = SPREADS.map(({ left, right }) => ({ left: load(left), right: load(right), back: load(left, true) }));

  const paper = (map, side = THREE.FrontSide) => {
    const material = new THREE.MeshStandardMaterial({ map, side, roughness: 0.6, metalness: 0 });
    material.userData.keepColor = true;
    return material;
  };
  const sheet = (geometry, material) => {
    const m = new THREE.Mesh(geometry, material);
    m.receiveShadow = true;
    mesh.add(m);
    return m;
  };

  const leftGeo = makeSheet();
  shapeSheet(leftGeo, (s) => {
    const x = LEFT[0][0] + s * LEFT_LEN;
    return [x, heightAt(LEFT, x) + LIFT];
  });
  const rightGeo = makeSheet();
  shapeSheet(rightGeo, (s) => {
    const x = SPINE_X + s * RIGHT_LEN;
    return [x, heightAt(RIGHT, x) + LIFT];
  });
  const turnGeo = makeSheet();

  let current = 0;
  const left = sheet(leftGeo, paper(pages[0].left));
  const right = sheet(rightGeo, paper(pages[0].right));
  const turnFront = sheet(turnGeo, paper(pages[0].right));
  const turnBack = sheet(turnGeo, paper(pages[1].back, THREE.BackSide));
  turnFront.visible = turnBack.visible = false;

  const pageSound = makePageSound();
  let turning = false;
  /** 1 while turning forward, −1 while turning back; flips at either end. */
  let dir = 1;
  const turn = () => {
    if (turning) return;
    turning = true;
    const d = dir;
    const next = current + d;
    // The turning sheet's face is always a right page and its back a left one: going
    // forward it carries this spread's right away, going back it brings the previous
    // spread's right in. The sheet it uncovers shows the new spread straight away; the
    // one it covers changes when it lands.
    const [face, back] = d > 0 ? [current, next] : [next, current];
    turnFront.material.map = pages[face].right;
    turnBack.material.map = pages[back].back;
    const [uncovered, covered] = d > 0 ? [right, left] : [left, right];
    uncovered.material.map = d > 0 ? pages[next].right : pages[next].left;
    for (const m of [turnFront, turnBack, uncovered]) m.material.needsUpdate = true;
    shapeSheet(turnGeo, turnShape(0, d));
    turnFront.visible = turnBack.visible = true;
    pageSound().catch((error) => console.warn('[magazine] page sound failed', error));

    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / 1000 / TURN_S);
      shapeSheet(turnGeo, turnShape(t, d));
      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }
      covered.material.map = d > 0 ? pages[next].left : pages[next].right;
      covered.material.needsUpdate = true;
      turnFront.visible = turnBack.visible = false;
      current = next;
      if (current === SPREADS.length - 1) dir = -1;
      else if (current === 0) dir = 1;
      turning = false;
    };
    requestAnimationFrame(frame);
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hits = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(book, true).length > 0;
  };

  let pressed = null;
  canvas.addEventListener('pointerdown', (event) => {
    pressed = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    const from = pressed;
    pressed = null;
    if (!from) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_SLOP) return;
    if (hits(event)) turn();
  });

  return turn;
}
