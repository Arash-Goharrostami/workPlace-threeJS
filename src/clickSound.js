import * as THREE from 'three';

/**
 * Click one of `objects` and it plays `url` — a sound and nothing else. Clicked again
 * before the sound has ended, it starts over rather than piling a second copy on top.
 *
 * Like the other props with a click of their own, it listens on the canvas itself and
 * casts against its objects alone.
 */

/** Same as `picking.js`: a press and release further apart than this is an orbit drag. */
const CLICK_SLOP = 4;

const spread = (limit) => (Math.random() * 2 - 1) * limit;

export function setupClickSound({ camera, canvas, objects, url, volume = 0.3, pitchSpread = 0 }) {
  const targets = objects.filter(Boolean);
  if (!targets.length) return;

  let context = null;
  let master = null;
  let clip = null;
  let playing = null;
  const play = async () => {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
      master = context.createGain();
      master.gain.value = volume;
      master.connect(context.destination);
      clip = fetch(url)
        .then((response) => response.arrayBuffer())
        .then((data) => context.decodeAudioData(data));
    }
    if (context.state === 'suspended') context.resume();
    const buffer = await clip;
    playing?.stop();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1 + spread(pitchSpread);
    source.connect(master);
    source.start();
    playing = source;
    source.onended = () => {
      source.disconnect();
      if (playing === source) playing = null;
    };
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
    return raycaster.intersectObjects(targets, true).length > 0;
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
    play().catch((error) => console.warn(`[click sound] ${url} failed`, error));
  });
}
