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

/**
 * How far the view drifts with the pointer while a section is open, as a fraction of
 * the viewport. Small on purpose: it is meant to read as the room breathing, not as a
 * second way to move the camera.
 */
const DRIFT = 0.022;

/** …and of the room's default angle, when nothing is open. */
const OVERVIEW_AZIMUTH = THREE.MathUtils.degToRad(75);

/**
 * How far the camera may rise or fall from an open prop's own viewing height. A screen
 * is read from in front of it: left free, the orbit drops under the laptop's lid and
 * the section is read across the keyboard.
 */
const OPEN_POLAR = THREE.MathUtils.degToRad(12);

/**
 * How far in and out of the framed distance the wheel may dolly while a section is
 * open, as multipliers on it. A step either way — enough to take in the prop's
 * surroundings or lean into its screen, and nowhere near enough to end up back
 * across the room, which is what the room's own zoom range would allow.
 */
const OPEN_DOLLY = { in: 0.7, out: 1.35 };

export function setupFlight({ camera, controls, canvas }) {
  // Where the room sits when nothing is open: whatever `loadModel` framed it to.
  const overview = {
    cam: camera.position.clone(),
    tgt: controls.target.clone(),
    view: 'View — full room',
  };
  const overviewAzimuth = controls.getAzimuthalAngle();
  // Whatever the room was set up with, to be put back the moment nothing is open.
  const polar = { min: controls.minPolarAngle, max: controls.maxPolarAngle };
  // …and the room's zoom range, which an open prop narrows to a step either side of
  // however close the flight brought the camera.
  const dolly = { min: controls.minDistance, max: controls.maxDistance };

  let flight = null;
  let voff = 0;
  let open = null;
  /** The distance the current flight settles at, which the open dolly range is sized from. */
  let openDist = 0;

  /**
   * How close the camera may get. The room's own floor is sized off the whole room (see
   * `loadModel.js`) and is right for orbiting it — but a prop the camera has deliberately
   * flown down onto can be framed nearer than that, and the iPhone is: it fits the
   * viewport at about two thirds of the room's floor. Left at the room's value,
   * `OrbitControls` clamps the camera back out on the frame after the flight lands and
   * the prop is framed small, which is not what the anchor asked for.
   */
  const nearLimit = () =>
    (openDist ? Math.min(dolly.min, openDist * OPEN_DOLLY.in) : dolly.min);
  let drift = { x: 0, y: 0 };

  /**
   * Re-applies the sideways lens shift that keeps the prop clear of the sidebar, plus
   * the pointer's own drift on top of it.
   *
   * Both are lens, not camera: shifting the frustum leaves `controls` in charge of
   * where the camera actually is, so nothing here has to be undone before the user
   * orbits, and a drift cannot slowly walk the camera out of the room.
   */
  const applyOffset = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const x = voff + drift.x * w * DRIFT;
    const y = drift.y * h * DRIFT;
    if (x || y) camera.setViewOffset(w, h, x, y, w, h);
    else camera.clearViewOffset();
  };

  /**
   * How far the pointer has moved across the viewport, -1 to 1 on each axis. Held at
   * zero unless a section is open: the room itself is orbited, not nudged.
   */
  const setDrift = (x, y) => {
    drift = { x, y };
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
    openDist = anchor ? camTo.distanceTo(tgtTo) : 0;
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
    } else {
      // Still applied with no flight running: the pointer moves between flights, and
      // that is when the drift is actually seen.
      applyOffset();
    }

    // Free rein mid-flight — clamping a trip in progress would stop it short of the
    // prop it is travelling to.
    if (flight) {
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      controls.minPolarAngle = polar.min;
      controls.maxPolarAngle = polar.max;
      controls.minDistance = nearLimit();
      controls.maxDistance = dolly.max;
    } else if (open) {
      const centre = Math.atan2(open.cam.x - open.tgt.x, open.cam.z - open.tgt.z);
      controls.minAzimuthAngle = centre - OPEN_AZIMUTH;
      controls.maxAzimuthAngle = centre + OPEN_AZIMUTH;

      // The same clamp about the other axis, measured off the anchor's own height:
      // how far the prop stands above or below the camera is part of how it is framed.
      const rise = new THREE.Vector3().subVectors(open.cam, open.tgt);
      const level = Math.acos(THREE.MathUtils.clamp(rise.y / rise.length(), -1, 1));
      controls.minPolarAngle = Math.max(polar.min, level - OPEN_POLAR);
      controls.maxPolarAngle = Math.min(polar.max, level + OPEN_POLAR);

      // The wheel steps away from the prop and back, not out into the room.
      controls.minDistance = nearLimit();
      controls.maxDistance = Math.min(dolly.max, openDist * OPEN_DOLLY.out);
    } else {
      controls.minAzimuthAngle = overviewAzimuth - OVERVIEW_AZIMUTH;
      controls.maxAzimuthAngle = overviewAzimuth + OVERVIEW_AZIMUTH;
      controls.minPolarAngle = polar.min;
      controls.maxPolarAngle = polar.max;
      controls.minDistance = dolly.min;
      controls.maxDistance = dolly.max;
    }
  };

  return { to, update, applyOffset, setDrift, get flying() { return flight !== null; } };
}
