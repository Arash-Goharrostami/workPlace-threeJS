import * as THREE from 'three';

/**
 * The Apple Watch's face: dark on the desk, and lit with the time for a few seconds
 * when the Contact section opens — a wrist raise, as it were, for the phone beside it.
 *
 * The model's `Screen` primitive carries no UVs, so the face is drawn by giving that
 * mesh a planar set built from its own bounding box and painting a canvas onto it as
 * the emissive map. That keeps the model's rounded outline for free; a plane laid over
 * the glass would have to reproduce it.
 *
 * What is drawn follows Apple's own press shot of the SE: a black ground, the time in
 * tall thin red rounded digits, and three small red complications under it.
 */

/** How long the face stays lit once woken, and the fade at either end. */
const WAKE_MS = 5000;
const FADE_MS = 250;

/** Canvas size — the screen is a few centimetres across, so this is plenty. */
const CW = 512;

const RED = '#ff3b30';
const RED_DIM = 'rgba(255, 59, 48, 0.22)';

/**
 * Which way up the digits read along the band. The band's axis is found from the
 * model; this is only the sign. Flip if the time reads upside down in the scene.
 */
const UP_SIGN = 1;
/** …and across the case: the face came out mirrored with the raw axis, so it is flipped. */
const RIGHT_SIGN = -1;

/**
 * Finds the screen mesh under `root`, gives it UVs and a lit material, and returns
 * the control that wakes it. Null when the model has no `Screen` material.
 */
export function dressWatchFace(root) {
  const screen = meshWithMaterial(root, 'Screen');
  const glass = meshWithMaterial(root, 'Black_glass');
  if (!screen || !glass) {
    console.warn('[watch] no "Screen"/"Black_glass" materials on the watch to draw the face on');
    return null;
  }

  const { width, height } = projectUvs(screen, glass, root);

  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = Math.round(CW * (height / width));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const material = new THREE.MeshStandardMaterial({
    name: 'watch_Screen',
    color: 0x000000,
    roughness: 0.35,
    metalness: 0,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 0,
  });
  // An authored colour — darkenScene() must not tint it again.
  material.userData.keepColor = true;

  if (Array.isArray(screen.material)) {
    screen.material = screen.material.map((m) => (m && m.name === 'Screen' ? material : m));
  } else {
    screen.material = material;
  }

  drawFace(canvas, new Date());
  texture.needsUpdate = true;

  // The fade runs on its own frame loop: it is up for five seconds a session at most.
  let frame = 0;
  let sleepTimer = 0;
  const fade = (to) => {
    cancelAnimationFrame(frame);
    const from = material.emissiveIntensity;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / FADE_MS);
      material.emissiveIntensity = from + (to - from) * t;
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };

  const face = {
    /** Lights the face with the current time; it goes dark again `WAKE_MS` later. */
    wake() {
      drawFace(canvas, new Date());
      texture.needsUpdate = true;
      fade(1);
      clearTimeout(sleepTimer);
      sleepTimer = setTimeout(() => fade(0), WAKE_MS);
    },
    sleep() {
      clearTimeout(sleepTimer);
      fade(0);
    },
  };

  root.userData.face = face;
  return face;
}

/** The first mesh under `root` carrying a material of the given name. */
function meshWithMaterial(root, name) {
  let found = null;
  root.traverse((node) => {
    if (found || !node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (materials.some((m) => m && m.name === name)) found = node;
  });
  return found;
}

/**
 * Writes a planar UV set onto the screen mesh and returns the face's extent in the
 * mesh's own units.
 *
 * The `Screen` primitive is not the flat face: it is the dark body of the whole case,
 * and its own box is a good deal wider than what shows. What shows is the window the
 * cover glass cuts in the bezel, so the projection is sized from the glass's box and
 * the screen's vertices are mapped against that — whatever falls outside the window is
 * under the bezel, and the clamped canvas edge (black) is what it gets.
 *
 * The glass is flat, so its box is thin along the normal and wide along the other two
 * axes: those two are the face. Of them, the one the whole watch is longest along is
 * the band's, and the band runs top-to-bottom of the face.
 */
function projectUvs(screen, glass, root) {
  const geometry = screen.geometry;
  const position = geometry.attributes.position;

  const box = boxOfDrawn(glass.geometry);
  const size = box.getSize(new THREE.Vector3());

  const axes = ['x', 'y', 'z'];
  const normalAxis = axes.reduce((a, b) => (size[a] < size[b] ? a : b));
  const face = axes.filter((a) => a !== normalAxis);

  // The band's axis, measured on the whole watch in the same local frame as the screen.
  const whole = new THREE.Box3();
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.computeBoundingBox();
    whole.union(node.geometry.boundingBox);
  });
  const wholeSize = whole.getSize(new THREE.Vector3());
  const upAxis = wholeSize[face[0]] >= wholeSize[face[1]] ? face[0] : face[1];
  const rightAxis = face[0] === upAxis ? face[1] : face[0];

  const uv = new Float32Array(position.count * 2);
  const w = size[rightAxis] || 1;
  const h = size[upAxis] || 1;
  for (const i of usedVertices(geometry)) {
    const r = (position[`get${rightAxis.toUpperCase()}`](i) - box.min[rightAxis]) / w;
    const u = (position[`get${upAxis.toUpperCase()}`](i) - box.min[upAxis]) / h;
    uv[i * 2] = RIGHT_SIGN > 0 ? r : 1 - r;
    uv[i * 2 + 1] = UP_SIGN > 0 ? u : 1 - u;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  return { width: w, height: h };
}

/** The bounding box of the vertices a geometry's index list actually draws. */
function boxOfDrawn(geometry) {
  const position = geometry.attributes.position;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const i of usedVertices(geometry)) box.expandByPoint(v.fromBufferAttribute(position, i));
  return box;
}

/** The distinct vertex indices a geometry's index list refers to — or all of them, unindexed. */
function usedVertices(geometry) {
  const index = geometry.index;
  if (!index) return Array.from({ length: geometry.attributes.position.count }, (_, i) => i);
  const set = new Set();
  for (let i = 0; i < index.count; i++) set.add(index.getX(i));
  return [...set];
}

/** Paints the face: the time in tall red digits, three complications under it. */
function drawFace(canvas, date) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // The digits are drawn as strokes rather than set in a typeface: the reference face
  // is a thin, rounded, seven-segment-like design no system font gets close to.
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');

  // Proportions measured off the reference, all against the width: the screen is
  // taller than it is wide, so the width is what the digit row has to fit inside.
  // Fuller than the press shot, which leaves a wide margin: this is read across a
  // room, not held up to the eye.
  const digitW = W * 0.165;
  const digitH = W * 0.6;
  const stroke = W * 0.055;
  const gap = W * 0.035;
  const colonW = W * 0.07;
  const total = digitW * 4 + gap * 3 + colonW + gap;
  let x = (W - total) / 2;
  const top = H * 0.12;

  ctx.strokeStyle = RED;
  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const ch of hh) {
    drawDigit(ctx, ch, x, top, digitW, digitH, stroke);
    x += digitW + gap;
  }
  ctx.fillStyle = RED;
  const cx = x + colonW / 2;
  ctx.beginPath();
  ctx.arc(cx, top + digitH * 0.32, stroke * 0.55, 0, Math.PI * 2);
  ctx.arc(cx, top + digitH * 0.68, stroke * 0.55, 0, Math.PI * 2);
  ctx.fill();
  x += colonW + gap;
  for (const ch of mm) {
    drawDigit(ctx, ch, x, top, digitW, digitH, stroke);
    x += digitW + gap;
  }

  // Three complications in a row: workout, activity rings, heart rate.
  const r = W * 0.145;
  const cy = H * 0.8;
  const centres = [W * 0.19, W * 0.5, W * 0.81];
  for (const c of centres) {
    ctx.fillStyle = RED_DIM;
    ctx.beginPath();
    ctx.arc(c, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  drawRunner(ctx, centres[0], cy, r);
  drawRings(ctx, centres[1], cy, r);
  drawHeart(ctx, centres[2], cy, r, date);
}

/**
 * One digit as rounded strokes on a 7-segment layout, with the box's corners eased so
 * the 0, 6, 8 and 9 read as the loops the reference draws them as.
 */
function drawDigit(ctx, ch, x, y, w, h, stroke) {
  const inset = stroke / 2;
  const l = x + inset;
  const r = x + w - inset;
  const t = y + inset;
  const b = y + h - inset;
  const m = (t + b) / 2;
  const rad = w * 0.36;

  ctx.beginPath();
  if (ch === '0') {
    roundedLoop(ctx, l, t, r, b, rad);
  } else if (ch === '1') {
    ctx.moveTo(r, t);
    ctx.lineTo(r, b);
  } else if (ch === '7') {
    ctx.moveTo(l, t);
    ctx.lineTo(r, t);
    ctx.lineTo(r, b);
  } else if (ch === '8') {
    roundedLoop(ctx, l, t, r, b, rad);
    ctx.moveTo(l, m);
    ctx.lineTo(r, m);
  } else if (ch === '6') {
    ctx.moveTo(r, t);
    ctx.lineTo(l + rad, t);
    ctx.arcTo(l, t, l, t + rad, rad);
    ctx.lineTo(l, b - rad);
    ctx.arcTo(l, b, l + rad, b, rad);
    ctx.lineTo(r - rad, b);
    ctx.arcTo(r, b, r, b - rad, rad);
    ctx.lineTo(r, m + rad);
    ctx.arcTo(r, m, r - rad, m, rad);
    ctx.lineTo(l, m);
  } else if (ch === '9') {
    ctx.moveTo(l, b);
    ctx.lineTo(r - rad, b);
    ctx.arcTo(r, b, r, b - rad, rad);
    ctx.lineTo(r, t + rad);
    ctx.arcTo(r, t, r - rad, t, rad);
    ctx.lineTo(l + rad, t);
    ctx.arcTo(l, t, l, t + rad, rad);
    ctx.lineTo(l, m - rad);
    ctx.arcTo(l, m, l + rad, m, rad);
    ctx.lineTo(r, m);
  } else if (ch === '2') {
    ctx.moveTo(l, t + rad);
    ctx.arcTo(l, t, l + rad, t, rad);
    ctx.lineTo(r - rad, t);
    ctx.arcTo(r, t, r, t + rad, rad);
    ctx.lineTo(r, m - rad);
    ctx.arcTo(r, m, r - rad, m, rad);
    ctx.lineTo(l + rad, m);
    ctx.arcTo(l, m, l, m + rad, rad);
    ctx.lineTo(l, b);
    ctx.lineTo(r, b);
  } else if (ch === '3') {
    ctx.moveTo(l, t);
    ctx.lineTo(r - rad, t);
    ctx.arcTo(r, t, r, t + rad, rad);
    ctx.lineTo(r, b - rad);
    ctx.arcTo(r, b, r - rad, b, rad);
    ctx.lineTo(l, b);
    ctx.moveTo(l + w * 0.2, m);
    ctx.lineTo(r, m);
  } else if (ch === '4') {
    ctx.moveTo(l, t);
    ctx.lineTo(l, m);
    ctx.lineTo(r, m);
    ctx.moveTo(r, t);
    ctx.lineTo(r, b);
  } else if (ch === '5') {
    ctx.moveTo(r, t);
    ctx.lineTo(l, t);
    ctx.lineTo(l, m - rad);
    ctx.arcTo(l, m, l + rad, m, rad);
    ctx.lineTo(r - rad, m);
    ctx.arcTo(r, m, r, m + rad, rad);
    ctx.lineTo(r, b - rad);
    ctx.arcTo(r, b, r - rad, b, rad);
    ctx.lineTo(l, b);
  }
  ctx.stroke();
}

function roundedLoop(ctx, l, t, r, b, rad) {
  ctx.moveTo(l + rad, t);
  ctx.lineTo(r - rad, t);
  ctx.arcTo(r, t, r, t + rad, rad);
  ctx.lineTo(r, b - rad);
  ctx.arcTo(r, b, r - rad, b, rad);
  ctx.lineTo(l + rad, b);
  ctx.arcTo(l, b, l, b - rad, rad);
  ctx.lineTo(l, t + rad);
  ctx.arcTo(l, t, l + rad, t, rad);
  ctx.closePath();
}

/** A running figure, as a few thick strokes. */
function drawRunner(ctx, cx, cy, r) {
  const s = r * 0.055;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = s * 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Head.
  ctx.beginPath();
  ctx.arc(s * 3, -s * 8, s * 2.2, 0, Math.PI * 2);
  ctx.fill();
  // Torso.
  ctx.beginPath();
  ctx.moveTo(s * 1.5, -s * 4);
  ctx.lineTo(-s * 1, s * 2);
  // Arms.
  ctx.moveTo(s * 1.5, -s * 4);
  ctx.lineTo(s * 6, -s * 1);
  ctx.moveTo(s * 0.5, -s * 2);
  ctx.lineTo(-s * 4, -s * 5);
  // Legs.
  ctx.moveTo(-s * 1, s * 2);
  ctx.lineTo(s * 4, s * 5);
  ctx.lineTo(s * 3, s * 9);
  ctx.moveTo(-s * 1, s * 2);
  ctx.lineTo(-s * 5, s * 5);
  ctx.lineTo(-s * 7, s * 9);
  ctx.stroke();
  ctx.restore();
}

/** The three activity rings, each part-way round. */
function drawRings(ctx, cx, cy, r) {
  const width = r * 0.16;
  const radii = [r * 0.72, r * 0.5, r * 0.28];
  const sweep = [0.78, 0.6, 0.45];
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  radii.forEach((radius, i) => {
    ctx.strokeStyle = RED_DIM;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = RED;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sweep[i]);
    ctx.stroke();
  });
}

/** A heart-rate gauge: an open arc with the current beat in the middle and the day's range under it. */
function drawHeart(ctx, cx, cy, r, date) {
  const width = r * 0.14;
  const start = Math.PI * 0.75;
  const end = Math.PI * 2.25;
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = RED_DIM;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.74, start, end);
  ctx.stroke();
  ctx.strokeStyle = RED;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.74, start, start + (end - start) * 0.55);
  ctx.stroke();

  // The reading drifts with the minute, so it is not the same number every time.
  const bpm = 52 + (date.getMinutes() % 7);
  ctx.fillStyle = RED;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${Math.round(r * 0.62)}px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillText(String(bpm), cx, cy - r * 0.02);
  ctx.font = `500 ${Math.round(r * 0.3)}px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillText('49', cx - r * 0.42, cy + r * 0.62);
  ctx.fillText('57', cx + r * 0.42, cy + r * 0.62);
}
