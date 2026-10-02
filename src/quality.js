/**
 * What the device can afford, decided once at start, and a loop that lowers the
 * resolution if it turns out to have been decided wrong.
 *
 * `TIER` is 'low', 'mid' or 'high'. A touch screen was the only signal before, which
 * put a new iPhone with a five-year-old Android and an old Intel laptop with a
 * desktop GPU. The tier reads what the browser will say — cores, memory, whether
 * the pointer is coarse, whether motion is to be reduced — and the GPU's name where
 * `WEBGL_debug_renderer_info` gives it, which is what catches the phone GPUs and the
 * integrated laptop chips that make the room stutter. `?quality=low|mid|high` on the
 * URL overrides it, for trying each on a machine that is not.
 *
 * `adaptiveResolution()` is the safety net under the guess: for a stretch after the
 * room lands, it averages the frame time, and while that is over budget it steps the
 * pixel ratio down — never back up — until the frame fits. Resolution is the one
 * thing that can be turned down after the fact without anything being rebuilt.
 */
const OVERRIDE = new URLSearchParams(window.location.search).get('quality');

/** GPUs the room is known to be heavy for, matched against the renderer string. */
const WEAK_GPU = /Mali-[GT]?[0-9]{2}\b|Mali-4|Mali-T[6-8]|Adreno \(TM\) [3-5][0-9]{2}|Adreno [3-5][0-9]{2}|PowerVR|Intel\(R\) (HD|UHD) Graphics [0-9]{3}\b|Intel Iris\b(?! Xe)|Apple A(?:[7-9]|1[0-1])\b|SwiftShader|llvmpipe/i;

/**
 * Phone and tablet GPUs that carry the room at full quality — Apple A14 on (iPhone 12
 * and later), Apple M-series, Adreno 6xx/7xx/8xx, Mali-G7x and later, Xclipse. A touch
 * screen used to put every phone in 'mid', an iPhone 16 included, which halved the
 * pixels on a 3× screen and left the resume unreadable.
 */
const STRONG_GPU = /Apple (A1[4-9]|A[2-9][0-9]|M[0-9])\b|Apple GPU|Adreno \(TM\) [6-8][0-9]{2}|Adreno [6-8][0-9]{2}|Mali-G(7[1-9]|[89][0-9]|[0-9]{3})|Immortalis|Xclipse/i;

function gpuName() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  } catch {
    return '';
  }
}

function decide() {
  if (OVERRIDE === 'low' || OVERRIDE === 'mid' || OVERRIDE === 'high') return OVERRIDE;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = navigator.deviceMemory ?? 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gpu = gpuName();
  const weakGpu = WEAK_GPU.test(gpu);
  if (weakGpu || cores <= 2 || memory <= 2 || reduced) return 'low';
  if (coarse && STRONG_GPU.test(gpu) && cores >= 4) return 'high';
  if (coarse || cores <= 4 || memory <= 4) return 'mid';
  return 'high';
}

export const TIER = decide();
export const LOW = TIER === 'low';

/**
 * The renderer's settings per tier: pixel ratio cap, MSAA, shadow map size, and
 * `text` — how much larger the text canvases (screens, wall, CV) are drawn. Text is
 * what the room is read for, so it is the last thing a tier gives up.
 */
export const QUALITY = {
  low: { pixelRatio: 1, antialias: false, shadowMap: 512, text: 1 },
  mid: { pixelRatio: 1.5, antialias: false, shadowMap: 1024, text: 1.5 },
  high: { pixelRatio: 2, antialias: true, shadowMap: 2048, text: 2 },
}[TIER];

export const TEXT_SCALE = QUALITY.text;

/** Frame budget the adaptive loop holds to, in ms (~42 fps), and the steps it takes. */
const BUDGET_MS = 24;
const STEPS = [1.75, 1.5, 1.25, 1, 0.8, 0.65];
/** A high-density screen is not taken below 1×: under it every glyph turns to mush. */
const FLOOR = window.devicePixelRatio >= 2 ? 1 : 0.65;
/** The pixel ratio cap while a prop is open for reading. */
const READING_RATIO = 3;
/** How long the loop watches after `start()`, and how many frames each verdict needs. */
const WATCH_MS = 8000;
const SAMPLE = 45;

/**
 * Returns `{ start, frame }`: `start()` opens the watch (called once the room is in
 * and the descent is over — a loading frame is not a fair sample), `frame(ms)` takes
 * each rendered frame's time. `apply(ratio)` is called with a lower pixel ratio when
 * the average frame runs over budget; the window then begins again at the new size.
 */
export function adaptiveResolution(renderer, apply) {
  let ratio = Math.min(window.devicePixelRatio, QUALITY.pixelRatio);
  let reading = false;
  let watching = false;
  let until = 0;
  let sum = 0;
  let count = 0;
  return {
    start() {
      watching = true;
      until = performance.now() + WATCH_MS;
      sum = 0;
      count = 0;
    },
    /**
     * Reading mode: while a prop is open the camera is nearly still and what is on
     * screen is text, so the frame is drawn at the screen's own density (up to 3×) and
     * the watch stands aside; leaving puts back the ratio the room was running at.
     */
    reading(on) {
      if (on === reading) return;
      reading = on;
      apply(on ? Math.max(ratio, Math.min(window.devicePixelRatio, READING_RATIO)) : ratio);
    },
    frame(ms) {
      if (!watching || reading) return;
      if (performance.now() > until) { watching = false; return; }
      sum += ms;
      count += 1;
      if (count < SAMPLE) return;
      const average = sum / count;
      sum = 0;
      count = 0;
      if (average <= BUDGET_MS) return;
      const next = STEPS.find((step) => step < ratio - 1e-6 && step >= FLOOR);
      if (next === undefined) { watching = false; return; }
      ratio = next;
      console.info(`[quality] frame ${average.toFixed(1)} ms — pixel ratio down to ${ratio}`);
      apply(ratio);
      until = performance.now() + WATCH_MS;
    },
  };
}
