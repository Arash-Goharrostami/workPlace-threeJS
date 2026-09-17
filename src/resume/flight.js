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

/**
 * The one exception: the trip back to the overview. It is always the long one — from a
 * prop read up close, the phone above all, the camera has to swing from centimetres
 * over the glass back out to the whole room — and at `FLIGHT_MS` it reads as a rush.
 */
export const RETURN_MS = 2600;

/** Zero velocity *and* zero acceleration at both ends — a plain cubic still lurches. */
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** How far the camera may swing left/right of an open prop's own viewing angle. */
const OPEN_AZIMUTH = THREE.MathUtils.degToRad(50);

/**
 * How far the view drifts with the pointer, as a fraction of the viewport — whenever
 * the room is up, browsing it or reading a section. Enough to be felt with a mouse —
 * the room leans with the reader — but still a lens shift, not a second way to orbit.
 * A finger never drives it (see the pointermove handler in `index.js`): on a phone it
 * would sway under every scroll. Held off in the wide shot of the whole room, too.
 */
const DRIFT = 0.1;

/**
 * How lazily the view follows the pointer, in seconds — the time constant of the
 * ease, so it settles in about three times this. It is what stops the room snapping
 * back to centre the instant the mouse leaves the window.
 */
const DRIFT_EASE = 0.35;

/**
 * A flight is a straight line unless its two ends sit on headings about the room more
 * than `ARC_FROM` apart — the wide shot orbits all the way round, so a trip down to the
 * desk can start behind the back wall, and a straight line from there goes through
 * the concrete. Such a flight is flown as an arc instead: it swings round the room at
 * its starting distance before closing in, and rises by up to `ARC_LIFT` (degrees of
 * polar, so smaller is higher) at the midpoint so it clears the wall's top as well.
 */
const ARC_FROM = THREE.MathUtils.degToRad(60);
const ARC_LIFT = THREE.MathUtils.degToRad(25);
/** The share of an arc flown before the distance and height start to close on the end. */
const ARC_HOLD = 0.35;

/**
 * How close the wheel may come in the wide shot, as a share of that shot's own
 * distance. The room's floor (`dolly.min`) is sized for orbiting inside the room;
 * from outside it lets the camera through a wall. The wide fit is about 2.4× the
 * room's bounding radius, so this still stops outside every wall.
 */
const WIDE_DOLLY_IN = 0.55;

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
  // Where the room sits when nothing is open: whatever `loadModel` framed it to, until
  // the opening flight (`fly`) lands somewhere else and makes that the overview.
  let overview = {
    cam: camera.position.clone(),
    tgt: controls.target.clone(),
    view: 'View — full room',
  };
  let overviewAzimuth = controls.getAzimuthalAngle();
  // The wide shot the room loaded at, kept once the intro has moved the overview off
  // it: a click on empty room from the overview goes back up to it.
  const wide = { cam: overview.cam.clone(), tgt: overview.tgt.clone(), view: overview.view };
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
  /** Where the pointer is, -1..1 — the drift's target — and `lean`, where the view has eased to. */
  let drift = { x: 0, y: 0 };
  const lean = { x: 0, y: 0 };
  let lastTick = performance.now();
  /**
   * Whether the camera is in (or bound for) the wide shot, where the drift is held off —
   * and `strength`, how much of it is on right now, eased between 0 there and 1
   * elsewhere so the lean fades in and out with the flight rather than switching.
   */
  let wideView = true;
  let strength = 0;
  /** How close the lean and strength have to be to their targets to count as still. */
  const SETTLED = 0.002;

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
    // No lean in the wide shot: the whole room is a still picture there.
    const amount = DRIFT * strength;
    const x = voff + lean.x * w * amount;
    const y = lean.y * h * amount;
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
   * Builds the flight from where the camera is now to `camTo`/`tgtTo`, and decides
   * whether it is a line or an arc (see `ARC_FROM`): the spherical coordinates of both
   * ends about their targets, the azimuth delta wrapped to the short way round.
   */
  const startFlight = ({ camTo, tgtTo, voffTo, duration }) => {
    const camFrom = camera.position.clone();
    const tgtFrom = controls.target.clone();
    const from = new THREE.Spherical().setFromVector3(camFrom.clone().sub(tgtFrom));
    const end = new THREE.Spherical().setFromVector3(camTo.clone().sub(tgtTo));
    let delta = end.theta - from.theta;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    flight = {
      camFrom, tgtFrom, camTo, tgtTo,
      voffFrom: voff, voffTo,
      start: performance.now(),
      duration,
      arc: Math.abs(delta) > ARC_FROM ? { from, end, delta } : null,
    };
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

    startFlight({ camTo, tgtTo, voffTo, duration: anchor ? FLIGHT_MS : RETURN_MS });
    open = anchor ?? null;
    openDist = anchor ? camTo.distanceTo(tgtTo) : 0;
    wideView = false;
    return target.view;
  };

  /**
   * Flies to a free view — the opening trip to the desk — with nothing open, and makes
   * it the overview: from here on "back" returns to it rather than to the wide shot the
   * room loaded at, and the no-open orbit band is centred on its heading. The lens stays
   * centred, so it is a place to orbit from, not a prop to read.
   */
  const fly = (cam, tgt, view) => {
    overview = { cam: cam.clone(), tgt: tgt.clone(), view };
    overviewAzimuth = Math.atan2(cam.x - tgt.x, cam.z - tgt.z);
    // The overview is as far out as the wheel goes from now on: the wide shot is
    // reached by a click, not by zooming out to it.
    dolly.max = cam.distanceTo(tgt);
    wideView = false;
    startFlight({ camTo: cam.clone(), tgtTo: tgt.clone(), voffTo: 0, duration: FLIGHT_MS });
    open = null;
    openDist = 0;
  };

  /** Back up to the wide shot, with nothing open; the overview stays where it is. */
  const toWide = () => {
    startFlight({ camTo: wide.cam.clone(), tgtTo: wide.tgt.clone(), voffTo: 0, duration: FLIGHT_MS });
    open = null;
    openDist = 0;
    wideView = true;
    return wide.view;
  };

  /**
   * Whether the camera is sitting at the overview — within a couple of percent of its
   * distance, so a nudge of the orbit still counts and a real move away does not.
   */
  const atOverview = () => {
    if (flight) return false;
    const slack = overview.cam.distanceTo(overview.tgt) * 0.02;
    return camera.position.distanceTo(overview.cam) <= slack
      && controls.target.distanceTo(overview.tgt) <= slack;
  };

  /** Advances the flight and re-clamps orbiting. Called once per frame. */
  const update = () => {
    // The lean glides toward the pointer rather than jumping to it — frame-rate
    // independent, so it feels the same at 30 and at 120.
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;
    const k = 1 - Math.exp(-dt / DRIFT_EASE);
    lean.x += (drift.x - lean.x) * k;
    lean.y += (drift.y - lean.y) * k;
    strength += ((wideView ? 0 : 1) - strength) * k;

    if (flight) {
      const t = Math.min(1, (performance.now() - flight.start) / flight.duration);
      const e = ease(t);
      controls.target.lerpVectors(flight.tgtFrom, flight.tgtTo, e);
      if (flight.arc) {
        // Round, not through: the heading sweeps over the whole flight, while the
        // distance and height hold for `ARC_HOLD` of it and only then close on the
        // end, so the swing happens out at the wide radius; a lift peaking midway
        // takes the pass over the wall's top as well.
        const { from, end, delta } = flight.arc;
        const e2 = ease(THREE.MathUtils.clamp((t - ARC_HOLD) / (1 - ARC_HOLD), 0, 1));
        const radius = from.radius + (end.radius - from.radius) * e2;
        const polar = from.phi + (end.phi - from.phi) * e2 - ARC_LIFT * Math.sin(Math.PI * t);
        camera.position
          .setFromSphericalCoords(radius, Math.max(0.05, polar), from.theta + delta * e)
          .add(controls.target);
      } else {
        camera.position.lerpVectors(flight.camFrom, flight.camTo, e);
      }
      voff = flight.voffFrom + (flight.voffTo - flight.voffFrom) * e;
      applyOffset();
      if (t >= 1) flight = null;
    } else {
      // Still applied with no flight running: the pointer moves between flights, and
      // that is when the drift is actually seen.
      applyOffset();
    }

    // Free rein mid-flight — clamping a trip in progress would stop it short of the
    // prop it is travelling to, or, worse, shove it at the start: the trip back from
    // the phone begins nearer and steeper than the room's own limits allow, and with
    // those in force `controls.update()` throws the camera out to them on the first
    // frame before the flight has moved at all. The landing clamps below take over
    // the moment it lands.
    if (flight) {
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI;
      controls.minDistance = 0;
      controls.maxDistance = Infinity;
    } else if (open) {
      // Drag up looks down on the prop — the camera rises over it, not under it.
      controls.rotateSpeed = 1;
      const centre = Math.atan2(open.cam.x - open.tgt.x, open.cam.z - open.tgt.z);
      controls.minAzimuthAngle = centre - OPEN_AZIMUTH;
      controls.maxAzimuthAngle = centre + OPEN_AZIMUTH;

      // The same clamp about the other axis, measured off the anchor's own height:
      // how far the prop stands above or below the camera is part of how it is framed.
      const rise = new THREE.Vector3().subVectors(open.cam, open.tgt);
      const level = Math.acos(THREE.MathUtils.clamp(rise.y / rise.length(), -1, 1));
      // Not clipped by the room's ceiling: the band is measured off the anchor's own
      // angle, and the phone is read from nearly straight above — well past that
      // ceiling — so clipping left it no band at all and no way to tilt. The floor
      // still holds, so the camera cannot sink under the desk.
      controls.minPolarAngle = Math.max(0, level - OPEN_POLAR);
      controls.maxPolarAngle = Math.min(polar.max, level + OPEN_POLAR);

      // The wheel steps away from the prop and back, not out into the room. Capped
      // at the wide shot's own distance rather than the desk view's: the mural on the
      // outer wall is framed from further off than the desk is, and the desk cap
      // pulled the camera into it the moment the flight landed.
      controls.minDistance = nearLimit();
      controls.maxDistance = Math.min(wide.cam.distanceTo(wide.tgt), openDist * OPEN_DOLLY.out);
    } else if (wideView) {
      const wideDist = wide.cam.distanceTo(wide.tgt);
      // From outside, a drag reads as turning the room in the hand, so the wide shot
      // keeps the stock sense; the desk view alone is inverted (see `main.js`).
      controls.rotateSpeed = 1;
      // The wide shot of the whole room orbits freely, all the way round.
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      controls.minPolarAngle = polar.min;
      controls.maxPolarAngle = polar.max;
      // Stopped short of the walls, not at the room's own floor (see `WIDE_DOLLY_IN`).
      controls.minDistance = Math.max(dolly.min, wideDist * WIDE_DOLLY_IN);
      // The wide shot sits beyond the overview's zoom-out; while the camera is up
      // there the cap is lifted to it, or the landing would pull it straight back in.
      controls.maxDistance = Math.max(dolly.max, wideDist);
    } else {
      controls.rotateSpeed = -1;
      controls.minAzimuthAngle = overviewAzimuth - OVERVIEW_AZIMUTH;
      controls.maxAzimuthAngle = overviewAzimuth + OVERVIEW_AZIMUTH;
      controls.minPolarAngle = polar.min;
      controls.maxPolarAngle = polar.max;
      controls.minDistance = dolly.min;
      controls.maxDistance = dolly.max;
    }
  };

  return {
    /**
     * Closes the room's zoom-out at wherever the camera is now — from here on, with
     * nothing open, the wheel only goes closer — and, given `minPolar` in radians,
     * how high the orbit may climb. `main.js` calls it the moment the opening descent
     * lands: the home view is as far out as the room ever gets, and the descent itself,
     * which starts higher than that, is not clamped on its way in.
     */
    lockZoomOut(minPolar = polar.min) {
      dolly.max = controls.getDistance();
      polar.min = minPolar;
      if (!flight && !open) {
        controls.maxDistance = dolly.max;
        controls.minPolarAngle = polar.min;
      }
    },
    to,
    fly,
    toWide,
    update,
    applyOffset,
    setDrift,
    get flying() { return flight !== null; },
    // Whether the view is still changing on its own — a flight in progress, or the
    // lean and its strength not yet settled on their targets. The render loop drops
    // to its idle rate once this is false (see `main.js`).
    get moving() {
      return flight !== null
        || Math.abs(drift.x - lean.x) > SETTLED || Math.abs(drift.y - lean.y) > SETTLED
        || Math.abs((wideView ? 0 : 1) - strength) > SETTLED;
    },
    get overviewLabel() { return overview.view; },
    get atOverview() { return atOverview(); },
    /** Whether the room is resting at (or flying to) the wide shot rather than the desk. */
    get wideView() { return wideView; },
  };
}
