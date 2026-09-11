import * as THREE from 'three';

/**
 * Makes the props themselves clickable, not just their labels.
 *
 * Hovering a readable prop rims it with light — see `outline.js`, which owns what that
 * looks like — and clicking it opens that section.
 *
 * The *rim* is recomputed once per rendered frame off the last pointer position, so a
 * fast sweep across the desk costs one cast, not thirty. The *click* casts again on
 * release rather than trusting that frame's answer: the two are only the same when a
 * frame has been drawn in between, which is not guaranteed on a backgrounded tab, on a
 * throttled one, or when press and release fall inside a single frame.
 *
 * A click here means a press and release in roughly the same place: orbiting the room
 * is a drag on the same canvas, and letting go of a drag over a prop must not open it —
 * nor, once a section is open, close it.
 */

/** How far the pointer may travel between press and release and still count as a click. */
const CLICK_SLOP = 4;

export function setupPicking({
  anchors, camera, canvas, outlines, onOpen, onHover, onDismiss, onScreenClick, onScreenHover,
}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const targets = Object.entries(anchors).map(([key, anchor]) => ({ key, object: anchor.object }));

  let hovered = null;
  let inside = false;
  let pressed = null;
  let enabled = true;
  let reading = null;
  /**
   * Where the pointer last landed on the prop being read, in that plane's UVs.
   *
   * Kept because the wheel needs it and a wheel is not a cast: `index.js` has to know
   * which column of a window the pointer is over before it can decide what to scroll,
   * and the once-a-frame cast in `update()` has already worked that out.
   */
  let screenUv = null;

  /** Puts an event's position into the -1..1 space the raycaster wants. */
  const track = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    inside = true;
  };

  canvas.addEventListener('pointermove', track);
  canvas.addEventListener('pointerleave', () => {
    inside = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    pressed = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    const from = pressed;
    pressed = null;
    if (!from) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_SLOP) return;

    // Cast from where the pointer actually is now. `hovered` is a frame's worth of
    // stale, and on a click that lands between two frames it is still null.
    track(event);

    // While a section is open the room is not browsable, but the props are still
    // reachable: another readable prop is opened outright, the way a dock button
    // does it, and a click on anything else puts the camera back.
    if (!enabled) {
      const { key, hit } = cast();
      // The one thing still live while reading: a window drawn on the prop's own
      // screen, whose rows are clicked where they are. Only for the prop being read —
      // clicking a monitor from across the room has to fly to it, not pick a row off
      // it, which is the hop below.
      if (key && key === reading && onScreenClick?.(key, hit)) return;
      if (key && key !== reading) {
        onOpen(key);
        return;
      }
      if (reading && key !== reading) onDismiss();
      return;
    }

    const { key } = cast();
    if (key) onOpen(key);
  });

  /** Recasts from the last pointer position and moves the rim if it landed elsewhere. */
  const update = () => {
    // A window on a screen being read keeps its own hover, so a row lights under the
    // pointer even though the room's rims are off.
    if (!enabled) {
      if (!reading) return;
      const { key, hit } = inside ? cast() : { key: null, hit: null };
      screenUv = key === reading ? hit.uv : null;
      // The whole hit, not just its UV: a section read off a group of props — the wall
      // frames — needs to know *which* mesh the pointer is on, which the UV cannot say.
      const onRow = onScreenHover?.(reading, key === reading ? hit : null);
      canvas.style.cursor = onRow ? 'pointer' : '';
      return;
    }

    const { key } = inside ? cast() : { key: null };
    if (key === hovered) return;

    hovered = key;
    outlines.hover(hovered ? anchors[hovered].object : null);

    canvas.style.cursor = hovered ? 'pointer' : '';
    onHover(hovered);
  };

  /**
   * The nearest readable prop under the pointer, and the intersection itself — the hit
   * carries the UV a window on that prop's screen needs to turn a click into a row.
   */
  function cast() {
    raycaster.setFromCamera(pointer, camera);
    // Every readable prop at once, so the nearest wins outright — casting against the
    // whole room and then walking up would let the desk in front of a prop swallow it.
    const hit = raycaster.intersectObjects(
      targets.map((t) => t.object),
      true
    )[0];
    if (!hit) return { key: null, hit: null };
    return { key: targets.find((t) => contains(t.object, hit.object))?.key ?? null, hit };
  }

  /**
   * While a section is open the props are no longer live: the room is being read, not
   * browsed, and a stray rim behind the sidebar only distracts. The prop being read
   * keeps its own, held lit by `index.js`.
   */
  /** Which prop is being read, so a click off it can be told from a click on it. */
  const setReading = (key) => {
    reading = key ?? null;
  };

  const setEnabled = (value) => {
    enabled = value;
    if (value) {
      onScreenHover?.(reading, null);
      screenUv = null;
    }
    if (!value && hovered) {
      outlines.hover(null);
      hovered = null;
      canvas.style.cursor = '';
      onHover(null);
    }
  };

  return {
    update,
    setEnabled,
    setReading,
    get hovered() { return hovered; },
    get screenUv() { return screenUv; },
  };
}

/** Whether `node` sits anywhere under `root`. */
function contains(root, node) {
  for (let o = node; o; o = o.parent) {
    if (o === root) return true;
  }
  return false;
}
