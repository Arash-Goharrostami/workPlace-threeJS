import * as THREE from 'three';
import { loadFace } from './resume/screen.js';

/**
 * The story of the site, written on the *outer* face of the back wall — the side the
 * camera sees when it swings round behind the room. That face points away from the
 * key light and is close to black, so the text is not painted into the concrete but
 * hung on it as a mural: a canvas-drawn plane with an unlit material, so it reads at
 * any light level and from any angle the wall does.
 *
 * It is written in chalk: Caveat, the handwriting face the notes pad already ships,
 * laid down in several faintly offset passes so the pressure varies, then speckled
 * with holes so the strokes skip the way chalk does on rough concrete.
 *
 * The words are the constants below; the layout wraps them to the plane on its own.
 */

const TITLE = 'About this place';

const STORY = [
  'This site is a portfolio of my skills — and of the things I enjoy. I had been ' +
    'thinking about it for over a year. The first versions used simple models; then I ' +
    'decided the room should show my interests alongside my work, hoping it helps me ' +
    'reach the goals I’m after.',
  'It took about a year in total. I was working full-time, so it was built in the ' +
    'gaps — collecting references, coding several versions, and starting over from ' +
    'scratch when I wasn’t happy. The version you’re standing in took three to four ' +
    'months. All the code and model work is my own; whenever I saw a piece I liked, I ' +
    'rebuilt it to make it lighter and better.',
  'I hope you’ve enjoyed it.',
];

const SIGNATURE = 'Arash Goharrostami — Full-Stack Developer';
const DATE = '15 September 2026';

/** The wall it hangs on. Its outer face is the one pointing -z. */
const WALL = 'wall1';

/** How wide the mural is, in this scene's centimetres, and where its top sits. */
const WIDTH = 230;
const TOP_HEIGHT = 235;

/** How far off the concrete the plane floats, so it never z-fights the wall. */
const STANDOFF = 0.3;

/** Chalk: an off-white for the words, a dustier one for the date and the rule. */
const INK = '#b9b4a9';
const INK_SOFT = '#948f85';

/** The handwriting, with the system stack behind it in case the file never arrives. */
const FACE = 'Caveat';
const FONT = `"${FACE}", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;

/**
 * The chalk itself. `PASSES` strokes per glyph, each nudged up to `JITTER` canvas
 * pixels and at `PRESSURE` alpha, build up an uneven body; `SPECKLE` is the share of
 * the canvas covered by the holes punched out afterwards, in dots of up to
 * `SPECKLE_SIZE` pixels. `WOBBLE` tilts each line by up to that many degrees and lets
 * its baseline drift, so nothing sits ruler-straight.
 */
const PASSES = 4;
const JITTER = 1.6;
const PRESSURE = 0.45;
const SPECKLE = 0.0012;
const SPECKLE_SIZE = 3.2;
const WOBBLE = 0.6;

/** Canvas pixels across the mural's width; the height follows the text. */
const CANVAS_WIDTH = 2048;

/** Draws the mural and hangs it on the back wall's outer face. */
export async function addWallStory(model) {
  const wall = model.getObjectByName(WALL);
  if (!wall) return null;

  await loadFace(FACE);
  const { canvas, aspect } = drawStory();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const material = new THREE.MeshBasicMaterial({
    name: 'wall_story',
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  material.userData.keepColor = true;

  const height = WIDTH / aspect;
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, height), material);
  mural.name = 'Wall_story';
  // A plane faces +z; the outer face points -z, so turn it to read from outside.
  mural.rotation.y = Math.PI;

  const wallBox = new THREE.Box3().setFromObject(wall);
  const floorY = new THREE.Box3().setFromObject(model.getObjectByName('floor') ?? wall).max.y;
  const world = new THREE.Vector3(
    (wallBox.min.x + wallBox.max.x) / 2,
    floorY + TOP_HEIGHT - height / 2,
    wallBox.min.z - STANDOFF
  );

  model.add(mural);
  mural.position.copy(model.worldToLocal(world));
  mural.quaternion.premultiply(model.getWorldQuaternion(new THREE.Quaternion()).invert());
  mural.updateMatrixWorld(true);

  return mural;
}

/**
 * Lays the text out on a canvas: title, the paragraphs, a rule, then the sign-off and
 * date. Measured in two passes — once to learn the height, once to draw — so the
 * canvas is exactly as tall as the words and the plane's aspect follows.
 */
function drawStory() {
  const width = CANVAS_WIDTH;
  const margin = width * 0.06;
  const column = width - margin * 2;
  // Caveat runs small for its em, so everything is a step larger than print would be.
  const titleSize = width * 0.068;
  const bodySize = width * 0.034;
  const smallSize = width * 0.03;
  const lineHeight = bodySize * 1.25;
  const paragraphGap = bodySize * 0.7;
  const random = mulberry32(7);

  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `400 ${bodySize}px ${FONT}`;
  const paragraphs = STORY.map((text) => wrap(measure, text, column));

  let height = margin + titleSize * 1.3;
  height += bodySize * 0.8;
  for (const lines of paragraphs) height += lines.length * lineHeight + paragraphGap;
  height += smallSize * 1.2; // the rule and its breathing room
  height += smallSize * 1.5 * 2; // signature and date
  height += margin;
  height = Math.round(height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.textBaseline = 'alphabetic';

  let y = margin + titleSize;
  ctx.font = `700 ${titleSize}px ${FONT}`;
  chalkText(ctx, TITLE, margin, y, INK, random);
  y += titleSize * 0.3 + bodySize * 0.8;

  ctx.font = `400 ${bodySize}px ${FONT}`;
  for (const lines of paragraphs) {
    for (const line of lines) {
      y += lineHeight;
      chalkText(ctx, line, margin, y, INK, random);
    }
    y += paragraphGap;
  }

  y += smallSize * 0.4;
  chalkRule(ctx, margin, y, column * 0.18, Math.max(2, width * 0.002), INK_SOFT, random);
  y += smallSize * 0.8;

  ctx.font = `600 ${smallSize}px ${FONT}`;
  y += smallSize * 1.5;
  chalkText(ctx, SIGNATURE, margin, y, INK, random);
  ctx.font = `400 ${smallSize}px ${FONT}`;
  y += smallSize * 1.5;
  chalkText(ctx, DATE, margin, y, INK_SOFT, random);

  speckle(ctx, width, height, random);

  return { canvas, aspect: width / height };
}

/**
 * One line of chalk: the text laid down `PASSES` times, each pass shifted a hair and
 * only part-opaque, on a baseline tilted and lifted a little at random.
 */
function chalkText(ctx, text, x, y, colour, random) {
  const tilt = THREE.MathUtils.degToRad((random() * 2 - 1) * WOBBLE);
  const drift = (random() * 2 - 1) * JITTER * 2;

  ctx.save();
  ctx.translate(x, y + drift);
  ctx.rotate(tilt);
  ctx.fillStyle = colour;
  ctx.globalAlpha = PRESSURE;
  for (let pass = 0; pass < PASSES; pass++) {
    const dx = (random() * 2 - 1) * JITTER;
    const dy = (random() * 2 - 1) * JITTER;
    ctx.fillText(text, dx, dy);
  }
  ctx.restore();
}

/** A short underline drawn by hand: a few segments that wander off the straight. */
function chalkRule(ctx, x, y, length, weight, colour, random) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  ctx.globalAlpha = PRESSURE;
  for (let pass = 0; pass < PASSES - 1; pass++) {
    ctx.lineWidth = weight * (0.7 + random() * 0.6);
    ctx.beginPath();
    ctx.moveTo(x, y + (random() * 2 - 1) * JITTER);
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      ctx.lineTo(x + (length * i) / steps, y + (random() * 2 - 1) * JITTER * 2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Punches small holes out of whatever has been drawn, so the strokes break up the way
 * chalk skips across the grain. Clearing rather than painting: the background is
 * transparent, so only the lettering can lose anything.
 */
function speckle(ctx, width, height, random) {
  const count = Math.round(width * height * SPECKLE);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (let i = 0; i < count; i++) {
    const r = SPECKLE_SIZE * (0.3 + random() * 0.7);
    ctx.globalAlpha = 0.5 + random() * 0.5;
    ctx.beginPath();
    ctx.arc(random() * width, random() * height, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A small seeded PRNG, so the chalk falls the same way on every load. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Greedy word wrap against the context's current font. */
function wrap(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}
