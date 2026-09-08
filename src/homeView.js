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
 * Places the camera at `HOME_VIEW` around `box`, and points the orbit controls at it.
 * Returns the distance it settled on, which is what the controls' zoom limits are
 * sized from.
 */
export function applyHomeView(box, camera, controls, view = HOME_VIEW) {
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

  camera.position.copy(target).add(offset);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  controls.target.copy(target);
  controls.update();

  return { distance, radius };
}
