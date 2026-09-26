import * as THREE from 'three';

/**
 * Click the Apple Pencil and it shifts a little on the desk, turned a touch — the way a
 * pencil knocked by a hand never lies quite where it was. Silent.
 *
 * As with the mouse (`mouseClick.js`), every nudge is picked about where it was first put
 * down, never about where the last one left it, so however many clicks it stays within
 * `REACH` and `TURN` of home. Each one also moves it at least `MIN_STEP` and `MIN_TURN`
 * from where it is, so a click always shows.
 */

/** Same as `picking.js`: a press and release further apart than this is an orbit drag. */
const CLICK_SLOP = 4;

/** How far from home a nudge may put it, in world centimetres, either way on each axis. */
const REACH = 0.4;
/** How far from its home angle it may turn, either way. */
const TURN = THREE.MathUtils.degToRad(3);
/** The least a nudge moves and turns it from where it lies now. */
const MIN_STEP = 0.2;
const MIN_TURN = THREE.MathUtils.degToRad(1);
/** How long a nudge takes. */
const MOVE_S = 0.3;
/** Tries at a far-enough target before settling for the last one. */
const TRIES = 20;

const ease = (t) => t * t * (3 - 2 * t);
const spread = (limit) => (Math.random() * 2 - 1) * limit;

export function setupPencilNudge({ camera, canvas, pencil, onMoved }) {
  if (!pencil) return;
  // It turns about its own middle, not its origin: the model's origin sits off the
  // pencil, and a few degrees about it swung the whole thing across the desk. `arm` is
  // from that middle to the origin at the home angle, in the parent's space.
  pencil.updateMatrixWorld(true);
  const middle = pencil.parent.worldToLocal(
    new THREE.Box3().setFromObject(pencil).getCenter(new THREE.Vector3())
  );
  const home = { yaw: pencil.rotation.y };
  const arm = pencil.position.clone().sub(middle);
  const up = new THREE.Vector3(0, 1, 0);
  /** Where the origin has to be for the middle at `middle + offset`, turned to `yaw`. */
  const place = (offset, yaw) => {
    pencil.position.copy(middle).add(offset)
      .add(arm.clone().applyAxisAngle(up, yaw - home.yaw));
    pencil.rotation.y = yaw;
  };
  let state = { offset: new THREE.Vector3(), yaw: home.yaw };

  let move = 0;
  const nudge = () => {
    // Offsets are in the parent's space, so world centimetres are taken through its scale.
    const scale = pencil.parent.getWorldScale(new THREE.Vector3()).x || 1;
    const from = { offset: state.offset.clone(), yaw: state.yaw };

    let offset;
    let yaw;
    for (let i = 0; i < TRIES; i += 1) {
      offset = new THREE.Vector3(spread(REACH), 0, spread(REACH)).divideScalar(scale);
      yaw = home.yaw + spread(TURN);
      if (offset.distanceTo(from.offset) * scale >= MIN_STEP && Math.abs(yaw - from.yaw) >= MIN_TURN) break;
    }

    const id = ++move;
    const start = performance.now();
    const frame = (now) => {
      // A newer click has taken over from wherever this one had got to.
      if (id !== move) return;
      const t = Math.min(1, (now - start) / 1000 / MOVE_S);
      const k = ease(t);
      state = {
        offset: from.offset.clone().lerp(offset, k),
        yaw: from.yaw + (yaw - from.yaw) * k,
      };
      place(state.offset, state.yaw);
      if (t < 1) requestAnimationFrame(frame);
      // The shadow map is drawn once and cached (see `environment.js`).
      else onMoved?.();
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
    return raycaster.intersectObject(pencil, true).length > 0;
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
    if (!hits(event)) return;
    nudge();
  });
}
