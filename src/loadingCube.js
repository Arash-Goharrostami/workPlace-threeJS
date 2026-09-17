import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadGLB } from './gltfLoader.js';
import { cubeSound } from './cubeSound.js';

/**
 * The mirror cube in the middle of the loading screen: scrambled the moment it is in,
 * then solved in step with the load — the last move lands as the room finishes, and
 * `solved` is what the welcome card waits on. Turned by hand meanwhile.
 *
 * A scene of its own, on the overlay's canvas, so it needs nothing of the room's: the
 * cube is chrome, and the same `RoomEnvironment` the room lights itself by is all it
 * has to reflect. It is its own entry (`loading.js`, the first module script in
 * `index.html`), so it runs as soon as three.js and the loader are in rather than
 * waiting on the rest of `main.js`'s graph; the model itself is fetched ahead of the
 * scripts through the `<link rel="preload">` there — which is why it was shrunk to
 * 85 KB (`npm run shrink rubiksCube 128 70 0.5`; the maps are a near-uniform silver,
 * so 128² loses nothing at this size). Starts on import; `overlay.js` imports the same
 * module, so there is one instance.
 */
const MODEL_URL = 'models/rubiksCube.glb';
/** How much of the canvas the cube's bounding sphere fills. */
const FILL = 0.8;
/** Radians of turn per pixel of drag. */
const DRAG_RATE = 0.008;
/** How fast a flick's spin dies away — the share of it left after a second. */
const INERTIA = 0.05;
/** A spin slower than this, in rad/s, is taken as stopped. */
const STILL = 0.005;
const MAX_PIXEL_RATIO = 1.5;

/**
 * `SCRAMBLE` random outer-layer turns, applied before the first frame is drawn — the
 * cube appears already mixed. Then the same turns undone in reverse, `MOVE_MS` +
 * `GAP_MS` each, let through by two gates: the load's progress — the props being
 * placed, the bar's second phase — and a clock: the solve takes at least
 * `SOLVE_MIN_MS`, so on a fast connection there is still something to watch. 12 moves
 * at 330 ms fit that floor exactly.
 */
const SCRAMBLE = 12;
const MOVE_MS = 260;
const GAP_MS = 70;
const SOLVE_MIN_MS = 4000;
/** The cube is chrome in the source; this takes the edge off the mirror. */
const ROUGHNESS_MIN = 0.45;
const ENV_INTENSITY = 0.7;
/**
 * The black body (`Base`, one instance per piece) is the same chrome as the stickers
 * in the source, which reads as glossy plastic; matte, with less of the room in it.
 */
const BODY_MATERIAL = 'Base';
const BODY_ROUGHNESS = 0.8;
const BODY_ENV_INTENSITY = 0.3;
/**
 * A piece's layer on each axis is the sign of its centre in the cube's own space —
 * a mirror cube's cuts are off-centre, but its core sits at the origin and each
 * slab's pieces share one centre coordinate (x: −0.86 | 0 | 1.16, and so on), so
 * anything further than this from zero is an outer layer.
 */
const LAYER_MIN = 0.3;
const AXES = ['x', 'y', 'z'];
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Starts the cube on `canvas`. Returns `{ setProgress, solved, stop }`: `setProgress`
 * takes the load's fraction (0–1, never taken backwards), `solved` resolves once the
 * last move has landed — or at once if the cube cannot be shown or turned, so the
 * card is never held up by it — and `stop()` ends the loop, drops the listeners and
 * releases the renderer.
 */
function startLoadingCube(canvas) {
  let markSolved;
  const solved = new Promise((resolve) => { markSolved = resolve; });
  const inert = { setProgress() {}, solved, restedAfterSolve: () => solved, leave: () => solved, stop() {} };
  if (!canvas) { markSolved(); return inert; }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    markSolved();
    return inert;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  // The canvas is sized by its stylesheet (`vmin`), so the renderer follows it.
  const fit = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  fit();
  window.addEventListener('resize', fit);

  let cube = null;
  let frame = 0;
  let last = performance.now();
  let stopped = false;

  // The drag: pixels moved turn the cube about the screen's axes; the last velocity
  // carries on after release and dies away, so a flick spins it and it settles.
  let drag = null;
  const spin = { x: 0, y: 0 };
  const onDown = (event) => {
    if (!cube) return;
    drag = { x: event.clientX, y: event.clientY, at: performance.now() };
    spin.x = 0;
    spin.y = 0;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  };
  const onMove = (event) => {
    if (!drag || !cube) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const now = performance.now();
    const dt = Math.max(1, now - drag.at) / 1000;
    cube.rotation.y += dx * DRAG_RATE;
    cube.rotation.x += dy * DRAG_RATE;
    spin.y = (dx * DRAG_RATE) / dt;
    spin.x = (dy * DRAG_RATE) / dt;
    drag = { x: event.clientX, y: event.clientY, at: now };
  };
  const onUp = (event) => {
    if (!drag) return;
    // A hold with no movement over the last stretch is a stop, not a flick.
    if (performance.now() - drag.at > 80) { spin.x = 0; spin.y = 0; }
    drag = null;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // The layer turns. `pieces` carry a logical cell in {−1, 0, 1}³ that each turn
  // rotates along with them, so the next turn finds the right pieces without measuring
  // anything; `pivot` is the group a layer is swung on, at the core.
  let body = null;
  let pivot = null;
  let pieces = [];
  let turning = null;
  const turn = ({ axis, layer, dir }, ms) => new Promise((resolve) => {
    const moved = pieces.filter((piece) => piece.cell[axis] === layer);
    for (const piece of moved) pivot.attach(piece.node);
    turning = { axis, dir, moved, ms, start: performance.now(), resolve };
    cubeSound.turn(ms);
  });
  // The end of a turn: the layer square on, its pieces handed back to the body and
  // their cells turned with them.
  const settle = (axis, dir, moved) => {
    pivot.rotation[axis] = dir * Math.PI / 2;
    pivot.updateMatrixWorld(true);
    for (const piece of moved) {
      body.attach(piece.node);
      // The cell turns with the piece: a quarter turn about an axis swaps the other two.
      const c = piece.cell;
      if (axis === 'x') [c.y, c.z] = [-dir * c.z, dir * c.y];
      else if (axis === 'y') [c.x, c.z] = [dir * c.z, -dir * c.x];
      else [c.x, c.y] = [-dir * c.y, dir * c.x];
    }
    pivot.rotation.set(0, 0, 0);
  };
  const finishTurn = () => {
    const { axis, dir, moved, resolve } = turning;
    settle(axis, dir, moved);
    turning = null;
    resolve();
  };
  /** A turn with no animation — how the scramble is put on before anything is drawn. */
  const snap = ({ axis, layer, dir }) => {
    const moved = pieces.filter((piece) => piece.cell[axis] === layer);
    for (const piece of moved) pivot.attach(piece.node);
    settle(axis, dir, moved);
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const randomMove = (previous) => {
    let axis;
    do axis = AXES[Math.floor(Math.random() * 3)]; while (axis === previous);
    return { axis, layer: Math.random() < 0.5 ? -1 : 1, dir: Math.random() < 0.5 ? -1 : 1 };
  };
  let progress = 0;
  let solvedAt = 0;
  /**
   * The undo, one move at a time as the two gates allow: as far as the load has come,
   * and no faster than the floor. With everything in, the rest plays out back to back.
   */
  const solve = async (undo) => {
    const started = performance.now();
    let done = 0;
    while (done < undo.length) {
      if (stopped) return;
      const clock = (performance.now() - started) / SOLVE_MIN_MS;
      const allowed = Math.floor(undo.length * Math.min(progress, clock));
      if (done < allowed) {
        await turn(undo[done], MOVE_MS);
        done += 1;
        await wait(GAP_MS);
      } else {
        await wait(50);
      }
    }
    solvedAt = performance.now();
    markSolved();
  };

  const tick = (now) => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!cube) return;
    if (turning) {
      const t = Math.min(1, (now - turning.start) / turning.ms);
      pivot.rotation[turning.axis] = turning.dir * ease(t) * Math.PI / 2;
      if (t === 1) finishTurn();
    }
    if (!drag && (Math.abs(spin.x) > STILL || Math.abs(spin.y) > STILL)) {
      cube.rotation.x += spin.x * dt;
      cube.rotation.y += spin.y * dt;
      const k = INERTIA ** dt;
      spin.x *= k;
      spin.y *= k;
    }
    renderer.render(scene, camera);
  };

  loadGLB(MODEL_URL).then((gltf) => {
    if (stopped) return;
    const model = gltf.scene;
    // The pieces and their cells, measured while the model is still untransformed so
    // that world space is the model's own. `Mirror_Cube` holds the core at its origin
    // and one child per piece.
    body = model.getObjectByName('Mirror_Cube');
    if (body) {
      model.updateMatrixWorld(true);
      pieces = body.children
        .filter((node) => node.name.startsWith('Piece_'))
        .map((node) => {
          const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
          body.worldToLocal(centre);
          const cell = {};
          for (const axis of AXES) cell[axis] = Math.abs(centre[axis]) > LAYER_MIN ? Math.sign(centre[axis]) : 0;
          return { node, cell };
        });
      pivot = new THREE.Group();
      body.add(pivot);
    } else {
      console.warn('[loading cube] no Mirror_Cube node — the cube will not turn');
      markSolved();
    }
    model.traverse((node) => {
      const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      for (const material of materials) {
        const isBody = material.name === BODY_MATERIAL;
        const roughnessMin = isBody ? BODY_ROUGHNESS : ROUGHNESS_MIN;
        if ('roughness' in material) material.roughness = Math.max(material.roughness, roughnessMin);
        if ('envMapIntensity' in material) material.envMapIntensity = isBody ? BODY_ENV_INTENSITY : ENV_INTENSITY;
      }
    });
    // Centred on its own middle and sized off its bounding sphere, so it fills the
    // canvas the same however the source happened to be placed and scaled. The offset
    // sits on the model and the turn on the group above it, so it turns about its
    // middle rather than wobbling about the source's origin.
    const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
    model.position.sub(sphere.center);
    const visible = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const holder = new THREE.Group();
    holder.add(model);
    holder.scale.setScalar((visible * FILL) / sphere.radius);
    // Off square to start, so the first frame already shows three faces.
    holder.rotation.set(0.6, 0.8, 0);
    scene.add(holder);
    cube = holder;
    // Drawn once at rest, then the rise: the class on the next frame so it transitions.
    requestAnimationFrame(() => { if (!stopped) canvas.classList.add('in'); });
    if (body) {
      // Mixed before the first frame, then the same moves back.
      const moves = [];
      for (let i = 0; i < SCRAMBLE; i += 1) moves.push(randomMove(moves[i - 1]?.axis));
      for (const move of moves) snap(move);
      solve(moves.slice().reverse().map((m) => ({ ...m, dir: -m.dir })));
    }
  }).catch((error) => {
    console.warn('[loading cube] not shown:', error?.message ?? error);
    markSolved();
  });

  frame = requestAnimationFrame(tick);

  const setProgress = (fraction) => {
    progress = Math.max(progress, Math.min(1, fraction));
  };
  /** The exit — sinks and fades the way it came — resolved once it has played out. */
  const leave = () => new Promise((resolve) => {
    if (!canvas.classList.contains('in')) { resolve(); return; }
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    canvas.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 700);
    canvas.classList.remove('in');
  });
  /** Resolves once the cube is solved and at least `ms` have passed since it was. */
  const restedAfterSolve = async (ms) => {
    await solved;
    if (!solvedAt) return;
    await wait(Math.max(0, ms - (performance.now() - solvedAt)));
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    markSolved();
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', fit);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    cubeSound.stop();
    pmrem.dispose();
    scene.traverse((node) => {
      node.geometry?.dispose();
      const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      for (const material of materials) {
        for (const value of Object.values(material)) value?.isTexture && value.dispose();
        material.dispose();
      }
    });
    renderer.dispose();
  };
  return { setProgress, solved, restedAfterSolve, leave, stop };
}

export const loadingCube = startLoadingCube(document.getElementById('loading-cube'));
