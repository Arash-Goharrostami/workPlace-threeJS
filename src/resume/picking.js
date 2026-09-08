import * as THREE from 'three';
import { materialsOf } from '../materials.js';

/**
 * Makes the props themselves clickable, not just their labels.
 *
 * Hovering a readable prop lifts its emissive so it glows out of the room's dark
 * palette, and clicking it opens that section.
 *
 * The *glow* is recomputed once per rendered frame off the last pointer position, so a
 * fast sweep across the desk costs one cast, not thirty. The *click* casts again on
 * release rather than trusting that frame's answer: the two are only the same when a
 * frame has been drawn in between, which is not guaranteed on a backgrounded tab, on a
 * throttled one, or when press and release fall inside a single frame.
 *
 * A click here means a press and release in roughly the same place: orbiting the room
 * is a drag on the same canvas, and letting go of a drag over a prop must not open it.
 */

/** How far the pointer may travel between press and release and still count as a click. */
const CLICK_SLOP = 4;

/** Emissive added on hover, and the tint it is added in. */
const HOVER_INTENSITY = 0.35;
const HOVER_COLOR = 0x6ea8fe;

export function setupPicking({ anchors, camera, canvas, onOpen, onHover }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const targets = Object.entries(anchors).map(([key, anchor]) => ({ key, object: anchor.object }));

  let hovered = null;
  let inside = false;
  let pressed = null;
  let enabled = true;

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
    if (!enabled || !from) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_SLOP) return;

    // Cast from where the pointer actually is now. `hovered` is a frame's worth of
    // stale, and on a click that lands between two frames it is still null.
    track(event);
    const key = cast();
    if (key) onOpen(key);
  });

  /** Recasts from the last pointer position and moves the glow if it landed elsewhere. */
  const update = () => {
    const key = enabled && inside ? cast() : null;
    if (key === hovered) return;

    if (hovered) paint(anchors[hovered].object, false);
    hovered = key;
    if (hovered) paint(anchors[hovered].object, true);

    canvas.style.cursor = hovered ? 'pointer' : '';
    onHover(hovered);
  };

  function cast() {
    raycaster.setFromCamera(pointer, camera);
    // Every readable prop at once, so the nearest wins outright — casting against the
    // whole room and then walking up would let the desk in front of a prop swallow it.
    const hit = raycaster.intersectObjects(
      targets.map((t) => t.object),
      true
    )[0];
    if (!hit) return null;
    return targets.find((t) => contains(t.object, hit.object))?.key ?? null;
  }

  /**
   * While a section is open the props are no longer live: the room is being read, not
   * browsed, and a stray glow behind the sidebar only distracts.
   */
  const setEnabled = (value) => {
    enabled = value;
    if (!value && hovered) {
      paint(anchors[hovered].object, false);
      hovered = null;
      canvas.style.cursor = '';
      onHover(null);
    }
  };

  return { update, setEnabled, get hovered() { return hovered; } };
}

/** Whether `node` sits anywhere under `root`. */
function contains(root, node) {
  for (let o = node; o; o = o.parent) {
    if (o === root) return true;
  }
  return false;
}

/**
 * Lifts or restores a prop's emissive. The original values are stashed on the
 * material the first time it is touched, so restoring is exact even for the props
 * whose modules authored an emissive of their own (a lit screen, say).
 */
function paint(object, on) {
  object.traverse((node) => {
    if (!node.isMesh) return;
    for (const material of materialsOf(node)) {
      if (!material?.emissive) continue;
      if (!material.userData.hoverBase) {
        material.userData.hoverBase = {
          color: material.emissive.clone(),
          intensity: material.emissiveIntensity ?? 1,
        };
      }
      const base = material.userData.hoverBase;
      if (on) {
        material.emissive.setHex(HOVER_COLOR);
        material.emissiveIntensity = HOVER_INTENSITY;
      } else {
        material.emissive.copy(base.color);
        material.emissiveIntensity = base.intensity;
      }
    }
  });
}
