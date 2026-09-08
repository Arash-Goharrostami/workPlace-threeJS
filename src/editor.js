import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { setupCableEditor } from './cableEditor.js';

/**
 * Edit mode: pick a prop in the scene, drag it into place, then copy a readout of
 * where it ended up. The readout's `moved` / `turned` lines are deltas from where the
 * code originally put the prop, which is what maps onto a module's own constants —
 * `standX` in `deskAccessories.js`, `OUTLET_X` in `wallOutlet.js`, and so on.
 *
 * Cords are picked the same way but handled differently: a cable carries its own
 * route (see `cable.js`), so selecting one puts a handle on each of its points and the
 * gizmo drags those, and the readout prints the route as source lines instead of a
 * position. `Focus` frames whatever is selected, for the props that are small enough
 * to be hard to orbit around by hand.
 *
 * Nothing here writes to the scene's source. Edits last until the page reloads; the
 * copied text is how an arrangement is kept.
 */

/** How much of the framed object's size is left as margin when `Focus` flies to it. */
const FOCUS_MARGIN = 2.2;

/** Snapping, held on shift: round centimetres, five degrees and five per cent. */
const TRANSLATE_SNAP = 1;
const ROTATE_SNAP = THREE.MathUtils.degToRad(5);
const SCALE_SNAP = 0.05;

/** A drag that moves the pointer further than this is not also a selection click. */
const CLICK_SLOP = 4;

/**
 * The room itself and the desk it is furnished around: fixed, and never picked. They
 * are what everything else is measured against — `deskAccessories.js`, `guitar.js`,
 * `macPro.js` and the rest all place their props off the desk's or a wall's live
 * bounds — so dragging one would silently move half the scene on the next reload.
 * `scene` is the room GLB's own root, and so covers the walls, ceiling and window.
 */
const FIXED = new Set([
  'scene', 'walls', 'wall1', 'wall2', 'floor', 'ceiling', 'window',
  'Desk_replacement', 'Desk_corner_patch',
]);

/**
 * Wires the gizmo, the picker and the readout. Called once the room and its props
 * have loaded — the editor picks from what is in the scene, so it cannot be built
 * alongside the debug panel.
 */
export function setupEditor({ scene, camera, renderer, controls, model, environment }) {
  const gizmo = new TransformControls(camera, renderer.domElement);
  // Since three r169 the controls are not an Object3D; the helper is what is drawn.
  const helper = gizmo.getHelper();
  helper.visible = false;
  scene.add(helper);

  const cables = setupCableEditor(scene);
  const readout = buildReadout({
    // With a handle in hand it is the cord that is worth framing, not the ball.
    onFocus: () => focusOn(cables.owns(selected) ? cables.cable : selected),
    onReset: () => reset(selected),
  });
  const raycaster = new THREE.Raycaster();
  const origins = new Map();
  let selected = null;
  let enabled = false;
  let pressed = null;

  gizmo.addEventListener('dragging-changed', (event) => {
    // The two controls read the same pointer, so only one may listen at a time.
    controls.enabled = !event.value;
    if (!event.value) environment.refreshShadows();
  });
  gizmo.addEventListener('objectChange', () => {
    // A handle drag is a change to the cord, not to the handle: redraw the tube, then
    // report the route rather than the ball's own position.
    if (cables.owns(selected)) {
      cables.rebuild();
      readout.route(cables.cable, cables.points());
      return;
    }
    readout.update(selected, origins.get(selected));
  });

  function select(object) {
    selected = object;
    if (!object) {
      gizmo.detach();
      helper.visible = false;
      cables.detach();
      readout.clear();
      return;
    }

    // A cord: hand it its handles and wait for one of those to be picked. The cable
    // itself is never dragged — moving the whole tube would leave its route behind.
    if (object.userData.cable) {
      gizmo.detach();
      helper.visible = false;
      cables.attach(object);
      readout.route(object, cables.points());
      return;
    }

    if (cables.owns(object)) {
      cables.highlight(object);
      gizmo.setMode('translate');
      gizmo.attach(object);
      helper.visible = true;
      readout.route(cables.cable, cables.points());
      return;
    }

    cables.detach();

    // Recorded on first sight, so the delta is always measured against where the code
    // put the prop rather than against the previous drag.
    if (!origins.has(object)) origins.set(object, snapshot(object));

    gizmo.attach(object);
    helper.visible = true;
    readout.update(object, origins.get(object));
  }

  /**
   * Puts a prop back where the code put it — the snapshot taken when it was first
   * picked. A cord has no such origin (its route is the thing that moved), so its
   * handles are left alone.
   */
  function reset(object) {
    const origin = object && origins.get(object);
    if (!origin || cables.owns(object)) return;

    // The snapshot is world-space and the prop hangs off a parent that carries its own
    // offset, so it goes back through that parent rather than straight onto the prop.
    const parent = object.parent;
    const local = new THREE.Matrix4()
      .copy(parent.matrixWorld).invert()
      .multiply(new THREE.Matrix4().compose(
        origin.position,
        new THREE.Quaternion().setFromEuler(origin.rotation),
        origin.scale
      ));
    local.decompose(object.position, object.quaternion, object.scale);
    object.updateMatrixWorld(true);

    readout.update(object, origin);
    environment.refreshShadows();
  }

  /**
   * Swings the camera onto one object: the orbit target moves to its centre and the
   * camera pulls in along its current heading until the whole thing fits.
   */
  function focusOn(object) {
    if (!object) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const centre = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const distance = Math.max(
      (radius * FOCUS_MARGIN) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2),
      radius + camera.near + 1
    );

    const heading = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(centre);
    camera.position.copy(centre).add(heading.multiplyScalar(distance));
    controls.update();
  }

  function onPointerDown(event) {
    if (gizmo.dragging) return;
    pressed = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event) {
    if (!pressed || gizmo.dragging) return;
    const travelled = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
    pressed = null;
    if (travelled > CLICK_SLOP) return; // An orbit, not a pick.

    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    ), camera);

    // Handles first: they are drawn over the cord they belong to, and picking the
    // cord again instead of the ball under the pointer would drop the selection.
    const onHandle = raycaster.intersectObjects(cables.group.children, false)[0];
    if (onHandle) {
      select(onHandle.object);
      return;
    }

    const hit = raycaster.intersectObject(model, true)[0];
    const prop = hit ? propOf(hit.object, model) : null;
    if (prop === FIXED_HIT) {
      select(null);
      readout.fixed();
      return;
    }
    select(prop);
  }

  function onKeyDown(event) {
    if (event.key === 'Shift') {
      gizmo.setTranslationSnap(TRANSLATE_SNAP);
      gizmo.setRotationSnap(ROTATE_SNAP);
      gizmo.setScaleSnap(SCALE_SNAP);
      return;
    }
    if (event.key === 'Escape') select(null);
    if (event.key === 'g' || event.key === 'G') gizmo.setMode('translate');
    if (event.key === 'r' || event.key === 'R') gizmo.setMode('rotate');
    // A cord's point has no size, so scaling is for props only.
    if ((event.key === 's' || event.key === 'S') && !cables.owns(selected)) {
      gizmo.setMode('scale');
    }
    if (event.key === 'z' || event.key === 'Z') reset(selected);
    if (event.key === 'f' || event.key === 'F') {
      focusOn(cables.owns(selected) ? cables.cable : selected);
    }

    // The cord keys only mean anything with one of its handles in hand.
    if (!cables.owns(selected)) return;
    if (event.key === 'a' || event.key === 'A') select(cables.add(selected) ?? selected);
    if (event.key === 'x' || event.key === 'X') select(cables.remove(selected));
  }

  function onKeyUp(event) {
    if (event.key !== 'Shift') return;
    gizmo.setTranslationSnap(null);
    gizmo.setRotationSnap(null);
    gizmo.setScaleSnap(null);
  }

  function setEnabled(on) {
    if (on === enabled) return;
    enabled = on;

    const canvas = renderer.domElement;
    const listen = on ? canvas.addEventListener.bind(canvas) : canvas.removeEventListener.bind(canvas);
    listen('pointerdown', onPointerDown);
    listen('pointerup', onPointerUp);

    const keys = on ? window.addEventListener.bind(window) : window.removeEventListener.bind(window);
    keys('keydown', onKeyDown);
    keys('keyup', onKeyUp);

    gizmo.enabled = on;
    readout.show(on);
    if (!on) {
      select(null);
      controls.enabled = true;
    }
  }

  bind('opt-edit', setEnabled);

  return { setEnabled, dispose: () => setEnabled(false) };
}

/** What `propOf` hands back for anything belonging to the room or the desk. */
const FIXED_HIT = Symbol('fixed');

/**
 * The thing the code names and places: the piece directly under the room model,
 * walking up from whichever mesh the ray actually hit. The fixed set is checked
 * against that piece alone, not against every node on the way up — the imported props
 * carry their own converted hierarchies, and one of those (the Mac Pro's) has a node
 * called `scene` inside it, which used to make the whole tower unpickable.
 */
function propOf(mesh, model) {
  let prop = mesh;

  for (let node = mesh; node && node !== model; node = node.parent) {
    prop = node;
  }

  if (FIXED.has(prop.name)) return FIXED_HIT;
  return prop;
}

/** Where a prop stands right now, in world space. */
function snapshot(object) {
  object.updateMatrixWorld(true);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  object.matrixWorld.decompose(position, quaternion, scale);
  return { position, rotation: new THREE.Euler().setFromQuaternion(quaternion, 'YXZ'), scale };
}

/** The panel bottom-right: what is selected, where it is, and how far it has come. */
function buildReadout({ onFocus, onReset }) {
  const panel = document.getElementById('editor');
  const body = document.getElementById('editor-body');
  const copy = document.getElementById('editor-copy');
  const focus = document.getElementById('editor-focus');
  const reset = document.getElementById('editor-reset');
  let text = '';

  focus.addEventListener('click', onFocus);
  reset.addEventListener('click', onReset);

  const flash = (message) => {
    copy.textContent = message;
    setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
  };

  copy.addEventListener('click', () => {
    if (!text) return;
    // The async clipboard refuses when the document is not focused, which is exactly
    // the case when the page is driven from a tool rather than clicked. The old
    // execCommand path has no such rule, so it is the fallback.
    navigator.clipboard?.writeText(text).then(
      () => flash('Copied'),
      () => flash(copyViaSelection(text) ? 'Copied' : 'Select the text to copy')
    ) ?? flash(copyViaSelection(text) ? 'Copied' : 'Select the text to copy');
  });

  const empty = 'Click a prop to select it.\nG move · R turn · S size · F focus · Z reset · shift snaps · esc clears\nOn a cable: click a point · A adds · X removes';
  const locked = 'The room and the desk are fixed.\nEverything else is placed off them.';

  return {
    show(on) {
      panel.hidden = !on;
    },
    clear() {
      text = '';
      body.textContent = empty;
      copy.disabled = true;
      focus.disabled = true;
      reset.disabled = true;
    },
    fixed() {
      text = '';
      body.textContent = locked;
      copy.disabled = true;
      focus.disabled = true;
      reset.disabled = true;
    },
    /**
     * A cord's route, written as the source lines it came from — paste them straight
     * over the `points` array in the module that runs the cable.
     */
    route(cable, points) {
      if (!cable) return;
      text = [
        cable.name || '(unnamed cable)',
        `${points.length} points`,
        ...points.map((p) => `new THREE.Vector3(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}),`),
      ].join('\n');

      body.textContent = text;
      copy.disabled = false;
      focus.disabled = false;
      // A route has no origin to go back to; only props can be reset.
      reset.disabled = true;
    },
    update(object, origin) {
      if (!object || !origin) return;
      const now = snapshot(object);
      const moved = now.position.clone().sub(origin.position);
      const turned = degrees(now.rotation.y - origin.rotation.y);

      // Against the size the code gave it, which is the number a module's own scale
      // constant is written in — not the raw world scale, which means nothing on its own.
      const grown = new THREE.Vector3(
        now.scale.x / origin.scale.x,
        now.scale.y / origin.scale.y,
        now.scale.z / origin.scale.z
      );
      const uniform = Math.abs(grown.x - grown.y) < 1e-3 && Math.abs(grown.x - grown.z) < 1e-3;

      text = [
        object.name || '(unnamed)',
        `world pos   ${axes(now.position)}`,
        `world rot   ${degrees(now.rotation.x)}°, ${degrees(now.rotation.y)}°, ${degrees(now.rotation.z)}°`,
        `world scale ${factors(now.scale)}`,
        `moved       ${signed(moved.x)}, ${signed(moved.y)}, ${signed(moved.z)}`,
        `turned      ${signed(turned)}°`,
        `scaled      ×${uniform ? grown.x.toFixed(3) : factors(grown)}`,
      ].join('\n');

      body.textContent = text;
      copy.disabled = false;
      focus.disabled = false;
      reset.disabled = false;
    },
  };
}

/** Clipboard of last resort: a throwaway textarea and the pre-promise copy command. */
function copyViaSelection(text) {
  const field = document.createElement('textarea');
  field.value = text;
  field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(field);
  field.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  field.remove();
  return copied;
}

const axes = (v) => `${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}`;
const factors = (v) => `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;
const degrees = (radians) => Number(THREE.MathUtils.radToDeg(radians).toFixed(1));
const signed = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;

/** Same wiring the debug panel's own checkboxes use. */
function bind(id, handler) {
  const input = document.getElementById(id);
  input.disabled = false;
  input.addEventListener('change', () => handler(input.checked));
  handler(input.checked);
}
