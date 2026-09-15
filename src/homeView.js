import * as THREE from 'three';

/**
 * Where the camera stands when the room first appears, and what "back to the room"
 * returns to.
 *
 * Angles rather than a position: the room is recentred and auto-fitted at load (see
 * `frameCamera` in `loadModel.js`), so a typed-in XYZ would be wrong the moment the
 * desk got wider or a prop pushed the bounds out. These four numbers are read against
 * whatever the fit worked out, so the framing holds.
 *
 * To retune: run the room with `?debug`, orbit to the view you want, and press
 * `Copy view` in the debug panel — it copies this block, filled in.
 */
export const HOME_VIEW = {
  /**
   * Degrees around the room. -45 is the open corner: the guitar and the desk's back
   * wall on the left, the window on the right. The other three diagonals put the
   * camera outside a wall, looking at the back of it.
   */
  azimuth: -45,
  /** Degrees down from straight overhead. 90 is eye level with the floor. */
  polar: 61,
  /** Multiplier on the fitted distance. Above 1 pulls back and leaves margin. */
  zoom: 1.08,
  /** Fraction of the room's height the orbit target sits at. 0.5 is the middle. */
  height: 0.5,
};

/**
 * Where the opening click flies to: eye level at the desk, straight on. The room
 * loads at `HOME_VIEW` behind a "click anywhere to begin" — that wide shot is only the
 * backdrop — and the click sends the camera here (see `main.js`), which is then the
 * home that "back" and a closed section return to. Same four numbers as `HOME_VIEW`,
 * retuned the same way — orbit there with `?debug` and press Copy view.
 */
export const INTRO_VIEW = {
  azimuth: -8.27,
  polar: 82.76,
  zoom: 0.19,
  height: 0.5,
};

/**
 * The same shot for a phone held upright: pulled back and lifted a little, so the whole
 * desk and everything on it fits a tall, narrow frame that the landscape framing crops.
 */
export const INTRO_VIEW_NARROW = {
  azimuth: -4.2,
  polar: 73.04,
  zoom: 0.29,
  height: 0.5,
};

/** The breakpoint the resume's own layout turns on (its sidebar becomes a sheet). */
export const NARROW = window.matchMedia('(max-width: 760px)');

/** The desk view for the screen at hand — read when it is needed, not at load. */
export function introView() {
  return NARROW.matches ? INTRO_VIEW_NARROW : INTRO_VIEW;
}

/**
 * Places the camera at `HOME_VIEW` around `box`, and points the orbit controls at it.
 * Returns the distance it settled on, which is what the controls' zoom limits are
 * sized from.
 */
export function applyHomeView(box, camera, controls, view = HOME_VIEW) {
  const { position, target, distance, radius } = placeView(box, camera, view);

  camera.position.copy(position);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  controls.target.copy(target);
  controls.update();

  return { distance, radius };
}

/**
 * Works out where `view` puts the camera around `box` without moving it — what a flight
 * needs as its destination. `radius` is the box's, `distance` the camera's from `target`.
 */
export function placeView(box, camera, view) {
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1e-3);

  // The distance at which the whole box just fits, on whichever axis is tighter.
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 1;
  const fitHeight = radius / Math.sin(fov / 2);
  const fitWidth = radius / Math.sin(Math.atan(Math.tan(fov / 2) * aspect));
  const distance = Math.max(fitHeight, fitWidth) * view.zoom;

  const target = centre.clone();
  target.y = box.min.y + size.y * view.height;

  // Spherical, in the same convention `OrbitControls.getAzimuthalAngle()` reports, so
  // the numbers the debug panel copies out go straight back into `HOME_VIEW`.
  const offset = new THREE.Vector3().setFromSphericalCoords(
    distance,
    THREE.MathUtils.degToRad(view.polar),
    THREE.MathUtils.degToRad(view.azimuth)
  );

  return { position: target.clone().add(offset), target, distance, radius };
}
