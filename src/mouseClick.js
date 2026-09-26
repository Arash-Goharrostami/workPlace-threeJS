import * as THREE from 'three';

/**
 * Click the Magic Mouse and it clicks — and shifts a little on its pad, turned a touch,
 * the way a mouse left under a hand never sits quite where it was.
 *
 * Every nudge is picked about where the mouse was put down (`userData.home`, set by
 * `mouseArea.js`), not about where the last one left it: however many clicks, it stays
 * within `REACH` and `TURN` of home, well inside the pad.
 *
 * Like the guitar it is not one of the resume's anchors, so it listens on the canvas
 * itself and casts against the mouse alone. The sound is `public/audio/mouseClick.mp3`,
 * soundreality's "computer mouse click" (478758) cut to its 0.08–0.45 s — the rest was
 * silence — mono at 64 kbps; the original is in `tmp/books/`.
 */

const CLICK_SOUND = 'audio/mouseClick.mp3';
const VOLUME = 0.3;

/** Same as `picking.js`: a press and release further apart than this is an orbit drag. */
const CLICK_SLOP = 4;

/** How far from home a nudge may put it, in world centimetres, either way on each axis. */
const REACH = 1.5;
/** How far from its home angle it may turn, either way. */
const TURN = THREE.MathUtils.degToRad(15);
/** How long a nudge takes. */
const MOVE_S = 0.25;

const ease = (t) => t * t * (3 - 2 * t);
const spread = (limit) => (Math.random() * 2 - 1) * limit;

export function setupMouseClick({ camera, canvas, mouse, onMoved }) {
  const home = mouse?.userData.home;
  if (!home) return null;

  let context = null;
  let master = null;
  let clip = null;
  const click = async () => {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
      master = context.createGain();
      master.gain.value = VOLUME;
      master.connect(context.destination);
      clip = fetch(CLICK_SOUND)
        .then((response) => response.arrayBuffer())
        .then((data) => context.decodeAudioData(data));
    }
    if (context.state === 'suspended') context.resume();
    const source = context.createBufferSource();
    source.buffer = await clip;
    source.playbackRate.value = 1 + spread(0.04);
    source.connect(master);
    source.start();
    source.onended = () => source.disconnect();
  };

  let move = 0;
  const nudge = () => {
    // `home` is in the parent's space, so world centimetres are taken through its scale.
    const scale = mouse.parent.getWorldScale(new THREE.Vector3()).x || 1;
    const from = { position: mouse.position.clone(), yaw: mouse.rotation.y };
    const to = {
      position: home.position.clone().add(new THREE.Vector3(spread(REACH), 0, spread(REACH)).divideScalar(scale)),
      yaw: home.yaw + spread(TURN),
    };
    const id = ++move;
    const start = performance.now();
    const frame = (now) => {
      // A newer click has taken over from wherever this one had got to.
      if (id !== move) return;
      const t = Math.min(1, (now - start) / 1000 / MOVE_S);
      const k = ease(t);
      mouse.position.lerpVectors(from.position, to.position, k);
      mouse.rotation.y = from.yaw + (to.yaw - from.yaw) * k;
      if (t < 1) requestAnimationFrame(frame);
      // The shadow map is drawn once and cached (see `environment.js`), so it is redrawn
      // where the mouse came to rest.
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
    return raycaster.intersectObject(mouse, true).length > 0;
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
    click().catch((error) => console.warn('[mouse] click sound failed', error));
    nudge();
  });

  return nudge;
}
