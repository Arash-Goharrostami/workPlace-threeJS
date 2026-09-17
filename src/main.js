import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setupEnvironment } from './environment.js';
import { TIER, LOW, QUALITY, adaptiveResolution } from './quality.js';
import { loadModel } from './loadModel.js';
import { setupResume } from './resume/index.js';
import { HOME_VIEW, introView, placeView } from './homeView.js';
import { setupGuitarStrum } from './guitarStrum.js';
import { ui } from './overlay.js';

// The room has two modes. By default it is a resume: the props themselves are the
// interface, and clicking one opens a section. `?debug` swaps that for the authoring tools — the
// wireframe/grid panel and the drag-a-prop editor the scene was arranged with. Those are
// pulled in with `import()` below, so Vite keeps them (and TransformControls, Stats) in a
// chunk of their own that the resume never downloads.
const DEBUG = new URLSearchParams(window.location.search).has('debug');
/**
 * How far the orbit may tilt outside debug mode, in degrees of polar angle — 90 is eye
 * level, smaller is higher up. Both views the room rests at must fit between them: the
 * desk view (`INTRO_VIEW`, ~83°) and the wide shot a click on empty room goes back up
 * to (`HOME_VIEW`, 61°). A floor under the desk view clamps the camera off it the
 * moment the opening flight lands, and from there the click cannot find its way out.
 */
const LOWEST_POLAR = 96;
const HIGHEST_POLAR = 35;
document.body.classList.toggle('is-debug', DEBUG);
// The resume's chrome stays hidden from the first frame until the opening click (see
// `ui.begin()`); added here rather than after the load, or it flashes during the fade.
document.body.classList.toggle('begin', !DEBUG);

// A failure that reaches the page is written onto the overlay rather than only the
// console — on a phone there is no console to read, and a dark page says nothing.
// Only the first is shown; whatever follows is a consequence of it.
let reported = false;
function report(message) {
  if (reported) return;
  reported = true;
  console.error('[workplace]', message);
  ui.error(message);
}
window.addEventListener('error', (e) => report(`Something broke: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason?.message ?? String(e.reason);
  report(`Something failed to load: ${reason}`);
});

// Asked for before the renderer is made, so a device without WebGL (or one whose GPU is
// blocklisted by its browser) gets told, instead of three throwing into the dark.
const probe = document.createElement('canvas');
if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) {
  throw new Error('This browser or device cannot run WebGL, which the room needs to draw.');
}

// The viewport can report 0 while the page is still hidden (e.g. an embedded
// preview pane), which would poison camera.aspect with NaN — always clamp to 1.
const viewportSize = () => ({
  width: Math.max(1, window.innerWidth),
  height: Math.max(1, window.innerHeight),
});

// The frame is the tab's whole cost, so it is kept as small as it can be without
// showing: a 1.5× cap instead of a Retina 2× is 44% fewer pixels a frame, and at that
// density the pixel ratio already hides the edges MSAA was paying for — it is only
// switched on for the low-DPR screens that would otherwise show them. Both come from
// the device's tier (`quality.js`): a weak one starts at 1× with no MSAA at all.
console.info(`[quality] tier ${TIER}`);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: QUALITY.antialias && window.devicePixelRatio < 1.5,
    powerPreference: 'high-performance',
  });
} catch (error) {
  throw new Error(`The graphics context could not be created — ${error.message}`);
}
// A phone short on memory drops the context instead of erroring; three resumes if the
// browser hands it back, but the user should know why the room went black meanwhile.
renderer.domElement.addEventListener('webglcontextlost', () => {
  report('The device ran out of graphics memory and the room went dark. Reload to try again.');
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.pixelRatio));
renderer.setSize(viewportSize().width, viewportSize().height);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
// PCFSoft samples the map many times a pixel; on a phone the plain PCF filter is the
// difference between a steady frame and a stutter, and the softness is lost on its screen.
renderer.shadowMap.type = TIER === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, viewportSize().width / viewportSize().height, 0.1, 1000);
camera.position.set(6, 4, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotateSpeed = 0.8;
// The desk view's drag sense, mouse and touch alike. The wide shot and an open prop
// set their own each frame — see the per-state clamp in `resume/flight.js`.
controls.rotateSpeed = -1;

const environment = setupEnvironment(scene, renderer);
let stats = null;
if (DEBUG) {
  import('./debugPanel.js').then(({ setupDebugPanel }) => {
    stats = setupDebugPanel({ scene, camera, controls, environment });
  });
}

// The shadow map is cached (see environment.js), so it is drawn once the room and
// every prop it loads have settled — all of which the promise waits on.
// Both the editor and the resume's anchors are built from the props the scene
// actually ended up with, so neither can be set up before the load resolves.
let resume = null;
loadModel({ scene, camera, controls, environment, ui }).then((model) => {
  environment.refreshShadows();
  if (!model) return;
  // In both modes: the guitar answers a click whatever else the room is doing.
  setupGuitarStrum({ camera, canvas: renderer.domElement, guitar: model.getObjectByName('Guitar_on_stand') });
  printer = model.getObjectByName('3D_printer');
  // The printer's motors need a gesture before a browser lets them be heard.
  const startPrinter = () => printer?.userData.startSound?.(camera);
  if (DEBUG) {
    import('./editor.js').then(({ setupEditor }) => {
      setupEditor({ scene, camera, renderer, controls, model, environment });
    });
    renderer.domElement.addEventListener('pointerdown', startPrinter, { once: true });
  } else {
    // The orbit does not go below this — the camera never sinks under the desk's
    // level. Set before the flight is built, since it keeps these limits as the room's
    // own and puts them back whenever nothing is open. Debug mode has no floor.
    controls.maxPolarAngle = THREE.MathUtils.degToRad(LOWEST_POLAR);
    // The view stays on what the flight framed: a shift-drag or a two-finger drag would
    // slide the target off it, and only edit mode has a reason to.
    controls.enablePan = false;
    // Set up first, so the flight's overview is the wide view the room loaded at; the
    // opening click then flies down to the desk, and "back" still returns to the room.
    resume = setupResume({
      scene, camera, renderer, controls, model,
      onSound: (muted) => printer?.userData.setSoundMuted?.(muted),
      // Down on a prop, the printer drops to a murmur; back in the room it comes up.
      onFocus: (down) => printer?.userData.setSoundDucked?.(down),
    });
    // Parked high over the room while the welcome card is up, so that Start reveals the
    // camera sinking to the home view, with the prompt opening while it still settles.
    parkAbove(environment.bounds);
    ui.welcome().then(() => {
      descent = startDescent(environment.bounds);
      // The descent is the first stretch drawn at full rate: the watch on the frame
      // time opens with it.
      resolution.start();
      setTimeout(() => {
        // Worked out on the click, not at load, so a phone turned meanwhile gets its own framing.
        ui.begin().then(() => {
          startPrinter();
          resume.intro(placeView(environment.bounds, camera, introView()));
        });
      }, PROMPT_AT);
    });
  }
});

/**
 * The opening descent: from `HIGH_VIEW` down to `HOME_VIEW` over `DESCENT_SECONDS`. The
 * start is pulled well back and only a little above the home angle, so the ride in is a
 * long approach rather than a drop from overhead.
 */
const HIGH_VIEW = { ...HOME_VIEW, polar: 48, zoom: 1.9 };
const DESCENT_SECONDS = 3.4;
/** When, in ms from the descent's start, the begin prompt opens. */
const PROMPT_AT = 1600;
const smoothstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Puts the camera up at `HIGH_VIEW`, controls off so a drag cannot move it from there. */
function parkAbove(box) {
  const { position, target } = placeView(box, camera, HIGH_VIEW);
  camera.position.copy(position);
  controls.target.copy(target);
  controls.enabled = false;
}

/**
 * Returns an `update()` that eases the camera from where it is down to `HOME_VIEW`
 * over `DESCENT_SECONDS`, then hands the controls back.
 */
function startDescent(box) {
  const from = { position: camera.position.clone(), target: controls.target.clone() };
  const to = placeView(box, camera, HOME_VIEW);
  const startedAt = performance.now();
  return {
    update() {
      const t = Math.min((performance.now() - startedAt) / 1000 / DESCENT_SECONDS, 1);
      const e = smoothstep(t);
      camera.position.lerpVectors(from.position, to.position, e);
      controls.target.lerpVectors(from.target, to.target, e);
      if (t === 1) {
        controls.enabled = true;
        descent = null;
        // Landed on the home view: from here the wheel only goes closer and the orbit
        // no higher than `HIGHEST_POLAR`. Locked now and not before, since the room's
        // limits are applied every frame and either cap set earlier would have hauled
        // the camera off its descent, which starts above and beyond both.
        resume?.lockZoomOut(THREE.MathUtils.degToRad(HIGHEST_POLAR));
      }
    },
  };
}

function handleResize() {
  const { width, height } = viewportSize();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener('resize', handleResize);
// The safety net under the tier: the pixel ratio steps down while frames run long.
const resolution = adaptiveResolution(renderer, (ratio) => {
  renderer.setPixelRatio(ratio);
  handleResize();
});
// Catches the case where the page is laid out after the first frame.
new ResizeObserver(handleResize).observe(document.body);

// Frame time for the props that move on their own — the printer's job, for now.
const clock = new THREE.Clock();
let printer = null;
let descent = null;

// Frame pacing. The scene is never still — the printer's carriage runs and the view
// leans with the pointer — so it cannot render on demand, but it need not render at the
// display's full rate either. Idle, it draws at `IDLE_FPS`; while something is actually
// moving the camera (a drag, a flight, the opening descent, a recent pointer) it goes
// back to every frame. `dt` is still the real clock delta, so nothing moves slower.
const IDLE_FPS = LOW ? 15 : 30;
const IDLE_INTERVAL = 1000 / IDLE_FPS;
/** How long after the last pointer move the full rate is held, in ms. */
const ACTIVE_HOLD = 1000;
let lastFrameAt = 0;
let activeUntil = 0;
let dragging = false;
const touch = () => { activeUntil = performance.now() + ACTIVE_HOLD; };
renderer.domElement.addEventListener('pointermove', touch, { passive: true });
renderer.domElement.addEventListener('wheel', touch, { passive: true });
controls.addEventListener('start', () => { dragging = true; });
controls.addEventListener('end', () => { dragging = false; touch(); });

// The intro blurb steps aside while the room is being orbited — down and out on the
// first move, back once the camera has been still for `INTRO_RETURN_MS`: on a phone
// as the droplet it first arrived as, on a desktop back up the way it went. Only the
// user's own orbiting counts: a flight or the descent also moves the camera through
// `controls.update()`, but the card is not its to hide.
const INTRO_RETURN_MS = 2500;
// The first name's width in its own ems, for the surname's slide up beside it (see
// `body.orbiting` in index.html). A ratio, so it holds mid-transition too; taken once
// the font is in, and again if the viewport changes the size it is set at.
const measureName = () => {
  const first = document.querySelector('#intro h1 .first');
  if (!first) return;
  const em = first.getBoundingClientRect().width / parseFloat(getComputedStyle(first).fontSize);
  document.getElementById('intro').style.setProperty('--first-em', em.toFixed(3));
};
document.fonts?.ready.then(measureName) ?? measureName();
window.addEventListener('resize', measureName);
let introReturn = 0;
controls.addEventListener('change', () => {
  if (!controls.enabled || descent !== null || (resume?.isFlying() ?? false)) return;
  if (!document.body.classList.contains('orbiting')) {
    document.body.classList.add('orbiting');
    resume?.blurb.dismiss();
  }
  clearTimeout(introReturn);
  introReturn = setTimeout(() => {
    document.body.classList.remove('orbiting');
    resume?.blurb.reopen();
  }, INTRO_RETURN_MS);
});
const isActive = (now) =>
  dragging || now < activeUntil || descent !== null || (resume?.isFlying() ?? false);

// Nothing is drawn while the tab is hidden, and the clock is reset on the way back so
// the printer does not get handed the whole absence as one step.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) clock.getDelta();
});

renderer.setAnimationLoop(() => {
  if (document.hidden) return;
  const now = performance.now();
  const active = isActive(now);
  if (!active && now - lastFrameAt < IDLE_INTERVAL) return;
  // Only a frame drawn hard on the last is a measure of what one costs.
  if (active && now - lastFrameAt < 100) resolution.frame(now - lastFrameAt);
  lastFrameAt = now;
  const dt = Math.min(clock.getDelta(), 0.1);
  printer?.userData.update?.(dt);
  // Before `controls.update()`: a flight writes the camera position that the damping
  // in `controls` then settles.
  descent?.update();
  resume?.update();
  controls.update();
  renderer.render(scene, camera);
  stats?.update();
});

// Handy for debugging from the browser console. `resume` is filled in once the room
// has loaded, and stays null in `?debug` mode.
window.__viewer = { renderer, scene, camera, controls, get resume() { return resume; } };
