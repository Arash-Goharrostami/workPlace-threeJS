import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * The two Apple Pro Display XDRs: the main one on the monitor riser, and a second
 * standing beside it, portrait, on a position set by hand. Run `npm run apple` to
 * (re-)import the model and its Draco decoder.
 *
 * One module for both, the way `deskApple.js` owns four products: they are the same
 * display, and split apart they would repeat the scale, the shadow flags and the
 * seating twice over.
 *
 * Like the MacBook, the source is authored in metres, Y-up, standing on y = 0 and
 * centred on its stand's footprint — so it only needs scaling and seating.
 *
 * The second one then turns portrait, and only its panel does: the screen and its shell
 * roll a quarter turn about the mount's centre while the stand and the mount plate stay
 * square, so the plate's bolts keep facing the stand they bolt to. That is possible
 * because the plate is a node of its own in the GLB — `scripts/split-display-mount.py`
 * is what cut it out — so nothing here has to cut geometry or hold a seam together.
 */

/**
 * `npm run shrink proDisplayXdr 512 85 0.35` took it from 4.65 MB to 895 KB.
 *
 * Its geometry arrived Draco-compressed already, so the usual compression step had
 * nothing left to take and the saving had to come from elsewhere: the eleven maps were
 * PNGs — two of them 470 KB and 384 KB at only 512x512 — which re-encode to JPEG for a
 * tenth of that, and the mesh was then decimated from 253k triangles to 90k.
 *
 * The `panel` and `xdr_mount` nodes `PANEL` and `MOUNT` look up by name survive all of
 * it, as does the mount split that `scripts/split-display-mount.py` produced.
 */
const MODEL_URL = 'models/proDisplayXdr.glb';

/** Metres (the model's units) to this scene's centimetres. */
const SCALE = 100;

/**
 * Where the main display stands, in world centimetres — set by hand in edit mode and
 * copied out of its readout.
 *
 * This is the one knob for the whole cluster: the riser is built under this point
 * (`addDeskAccessories` in `deskAccessories.js`) and the ScreenBar hangs off the display
 * itself (`screenbar.js`), so moving the monitor is moving these two numbers. Height is
 * not among them — that still comes off the riser's top face.
 */
export const MAIN_DISPLAY_ANCHOR = { x: -4.0, z: -115.5 };

/** The screen and its shell, the one part of the display that turns. */
export const PANEL = 'panel';

/** The mount plate, whose centre the panel turns about — it sits on the screen's axis. */
const MOUNT = 'xdr_mount';

/**
 * Where the second display ended up, in world centimetres and degrees — set by hand in
 * edit mode and copied out of its readout. Absolute rather than measured off the desk:
 * it was walked well clear of the right-hand corner it first stood in, so a corner is
 * no longer what places it. Scale is the loader's, so only these two are kept.
 */
const SIDE_TRANSFORM = {
  // y is the desk surface: the riser no longer reaches under this one, so it stands
  // on the desk itself rather than on the plate.
  position: [-63.9, 85.4, -107.7],
  rotationY: 20,
};

/** Loads the main display and stands it on the riser's top surface. */
export async function addProDisplay(parent, riser) {
  if (!riser) return null;

  const display = await loadDisplay(parent, 'Pro_Display_XDR');
  standOnRiser(display, riser);

  return display;
}

/** Loads the second display, turns its panel portrait and sets it where it was left. */
export async function addSideDisplay(parent) {
  const display = await loadDisplay(parent, 'Pro_Display_XDR_2');

  // Before the yaw: the portrait turn takes the screen's axis to be world Z, which it
  // only is while the display still faces straight forward.
  turnPanelPortrait(display);
  placeSideDisplay(display);

  return display;
}

/** Puts the second display on its hand-set world position and yaw. */
function placeSideDisplay(display) {
  const parent = display.parent;

  display.rotation.set(0, THREE.MathUtils.degToRad(SIDE_TRANSFORM.rotationY), 0, 'YXZ');
  display.position.copy(
    parent.worldToLocal(new THREE.Vector3().fromArray(SIDE_TRANSFORM.position))
  );
  display.updateMatrixWorld(true);
}

/** Loads one display, scales it to the scene and repairs its stand's shading. */
async function loadDisplay(parent, name) {
  const gltf = await loadGLB(MODEL_URL);

  const display = gltf.scene;
  display.name = name;
  display.scale.setScalar(SCALE);
  display.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // Parented before measuring: the model root carries an offset, so a box taken
  // while the display is still detached would be in the wrong frame.
  parent.add(display);
  display.position.set(0, 0, 0);
  display.updateMatrixWorld(true);

  return display;
}

/** Sits the display's foot on the riser's top face, at MAIN_DISPLAY_ANCHOR. */
function standOnRiser(display, riser) {
  riser.updateMatrixWorld(true);

  const top = riser.getObjectByName('riser top');
  if (!top) return;

  // Height off the riser, position across the desk from the anchor.
  const box = new THREE.Box3().setFromObject(display);
  const target = top.getWorldPosition(new THREE.Vector3());
  target.x = MAIN_DISPLAY_ANCHOR.x;
  target.z = MAIN_DISPLAY_ANCHOR.z;

  const anchor = new THREE.Vector3(
    box.getCenter(new THREE.Vector3()).x,
    box.min.y,
    box.getCenter(new THREE.Vector3()).z
  );

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(anchor);
  const parent = display.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  display.position.copy(parent.worldToLocal(delta).sub(origin));
  display.updateMatrixWorld(true);
}

/**
 * Rolls the panel a quarter turn into portrait, leaving the stand and the joint alone.
 *
 * The display faces straight forward with no yaw of its own, so the axis through the
 * screen is world Z and turning about it stands the panel on its short edge. The turn
 * pivots on the mount rather than on the display's origin, which sits down at the
 * stand's foot: turning about that would swing the screen away sideways instead of
 * rotating it where it stands.
 *
 * The joint stays behind: `xdr_mount` — the arm's plate — and `xdr_recess`, the recess
 * it seats into, are both nodes of their own, so the turn never reaches them. That is
 * right for both. The plate slots in one way up whichever way the screen faces, and the
 * recess it mates with has to keep facing it. `scripts/split-display-mount.py` is what
 * cuts them out; the recess's rim is a circle on the axis the panel turns about, so the
 * hole it leaves in the shell reads the same at any angle.
 */
function turnPanelPortrait(display) {
  const panel = display.getObjectByName(PANEL);
  if (!panel) {
    console.warn(`[display] no "${PANEL}" node to turn portrait`);
    return;
  }

  const pivot = mountCentre(display);
  const turn = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    THREE.MathUtils.degToRad(90)
  );

  // T(pivot) · R · T(-pivot), left-multiplied onto where the panel already is: one
  // world-space turn about the pivot, so nothing has to be shifted back afterwards.
  const about = new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn))
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));

  restoreWorld(panel, about.multiply(panel.matrixWorld));
}

/** Where the mount plate sits, in world space — the point the panel turns about. */
function mountCentre(display) {
  const mount = display.getObjectByName(MOUNT);
  return new THREE.Box3().setFromObject(mount ?? display).getCenter(new THREE.Vector3());
}

/** Puts an object onto a world matrix, through whatever its parent does to it. */
function restoreWorld(object, world) {
  const local = object.parent.matrixWorld.clone().invert().multiply(world);
  local.decompose(object.position, object.quaternion, object.scale);
  object.updateMatrixWorld(true);
}

