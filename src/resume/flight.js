import * as THREE from 'three';

/**
 * The camera's travel between the room overview and a prop.
 *
 * Flights are timed rather than distance-proportional: every trip takes the same
 * `FLIGHT_MS` whichever prop it is going to, so the room never snaps across a short
 * hop or crawls across a long one. The sidebar's slide-in is timed off the same
 * constant (see `panels.js`), which is why it is exported.
 */
export const FLIGHT_MS = 1700;

/** Zero velocity *and* zero acceleration at both ends — a plain cubic still lurches. */
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** How far the camera may swing left/right of an open prop's own viewing angle. */
const OPEN_AZIMUTH = THREE.MathUtils.degToRad(50);

/** …and of the room's default angle, when nothing is open. */
const OVERVIEW_AZIMUTH = THREE.MathUtils.degToRad(75);

export function setupFlight({ camera, controls, canvas }) {
  // Where the room sits when nothing is open: whatever `loadModel` framed it to.
  const overview = {
    cam: camera.position.clone(),
    tgt: controls.target.clone(),
    view: 'View — full room',
  };
  const overviewAzimuth = controls.getAzimuthalAngle();

  let flight = null;
  let voff = 0;
  let open = null;

  /** Re-applies the sideways lens shift that keeps the prop clear of the sidebar. */
  const applyOffset = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (voff) camera.setViewOffset(w, h, voff, 0, w, h);
    else camera.clearViewOffset();
  };

  /**
   * Flies to `anchor`, or back to the overview when passed nothing. `panelWidth` is
   * how much of the viewport the open sidebar covers: the camera stays on the prop's
   * own axis and the *lens* shifts instead, so the prop lands in the free half
   * without the framing going oblique.
   */
  const to = (anchor, panelWidth = 0) => {
    const target = anchor ?? overview;
    const camTo = target.cam.clone();
    const tgtTo = target.tgt.clone();

    const vw = Math.max(1, canvas.clientWidth);
    let voffTo = 0;
    if (anchor && panelWidth > 0) {
      voffTo = Math.min(panelWidth / 2, vw * 0.3);
      // The panel eats width, so pull back by the same ratio or the prop is cropped.
      const free = Math.max(1, vw - panelWidth);
      const pullback = Math.min(1.85, Math.max(1, vw / free));
      camTo.sub(tgtTo).multiplyScalar(pullback).add(tgtTo);
    }

    flight = {
      camFrom: camera.position.clone(),
      tgtFrom: controls.target.clone(),
      camTo,
      tgtTo,
      voffFrom: voff,
      voffTo,
      start: performance.now(),
    };
    open = anchor ?? null;
    return target.view;
  };

  /** Advances the flight and re-clamps orbiting. Called once per frame. */
  const update = () => {
    if (flight) {
      const t = Math.min(1, (performance.now() - flight.start) / FLIGHT_MS);
      const e = ease(t);
      camera.position.lerpVectors(flight.camFrom, flight.camTo, e);
      controls.target.lerpVectors(flight.tgtFrom, flight.tgtTo, e);
      voff = flight.voffFrom + (flight.voffTo - flight.voffFrom) * e;
      applyOffset();
      if (t >= 1) flight = null;
    }

    // Free rein mid-flight — clamping a trip in progress would stop it short of the
    // prop it is travelling to.
    if (flight) {
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
    } else if (open) {
      const centre = Math.atan2(open.cam.x - open.tgt.x, open.cam.z - open.tgt.z);
      controls.minAzimuthAngle = centre - OPEN_AZIMUTH;
      controls.maxAzimuthAngle = centre + OPEN_AZIMUTH;
    } else {
      controls.minAzimuthAngle = overviewAzimuth - OVERVIEW_AZIMUTH;
      controls.maxAzimuthAngle = overviewAzimuth + OVERVIEW_AZIMUTH;
    }
  };

  return { to, update, applyOffset, get flying() { return flight !== null; } };
}
