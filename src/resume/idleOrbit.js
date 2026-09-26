import * as THREE from 'three';

/**
 * The idle pan: on any screen, once the camera has sat at the room overview
 * untouched for `idleMs`, it eases into a slow right-then-left sweep between
 * the overview's orbit limits — right a little past the limit, left exactly
 * to it — pausing at each end, forever, until the user touches the screen
 * again — a click, drag or wheel; not a hover. `centre`/`halfBand` are callbacks
 * rather than plain numbers because
 * `flight.js`'s `overviewAzimuth` is reassigned every time `fly()` runs.
 *
 * Applies its own turn directly to `camera.position` (there is no
 * `controls.setAzimuthalAngle` in this three version), so `flight.js` calls
 * `step()` itself and leaves the azimuth unclamped throughout — clamping it
 * would let `OrbitControls` snap the camera into range in a single frame the
 * moment the pan arms, which is exactly the jump this is trying not to make
 * when the camera was left turned well outside the pan's own band.
 *
 * Each leg also eases the tilt back to `defaultPolar()`: a drag up or down
 * before the pan (re)arms leaves the view tilted, and the pan is as much a
 * "back to how it was" as a sweep.
 */

/** Zero velocity *and* zero acceleration at both ends — the project's usual ease. */
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
/** `ease` integrated from 0 to `u`: the distance a ramp has covered, as a fraction of
 *  `CRUISE * RAMP_S`, `u` of the way through it. Reaches one half at `u = 1`. */
const easeIntegral = (u) => u * u * u * u * (u * (u - 3) + 2.5);

/** Cruising speed, in radians/s — slow enough to read as ambience, not a spin. */
const CRUISE = THREE.MathUtils.degToRad(3);
/** Seconds spent ramping up to (or down from) `CRUISE` at each end of a leg. */
const RAMP_S = 2.5;
/** Distance, in radians, one full ramp covers — `ease` averages to one half, so a
 *  ramp from rest to `CRUISE` over `RAMP_S` travels half what cruising would. */
const RAMP_DIST = 0.5 * CRUISE * RAMP_S;
/** `ease`'s peak slope — a short leg that never reaches `CRUISE` is timed so its top
 *  speed is exactly `CRUISE`. */
const EASE_PEAK = 1.875;
/** The stand-still beat at each end before reversing. */
const PAUSE_MS = 600;

const _v = new THREE.Vector3();
const _sph = new THREE.Spherical();

export function setupIdleOrbit({ camera, controls, idleMs, enabled, centre, halfBand, overshoot, defaultPolar }) {
  let phase = 'idle';
  let dir = 1;
  let theta = 0;
  let legElapsed = 0;
  /** The current leg, fixed at its start: where it left from, which way it runs,
   *  how far and for how long. The camera's place on it is a function of
   *  `legElapsed` alone, so the leg ends on its target exactly — no final snap. */
  let legFrom = 0;
  let legSign = 1;
  let legDist = 0;
  let legT = 0;
  let pauseUntil = 0;
  let lastPokeAt = performance.now();
  /** Whether `step()` actually wrote the camera this tick — see `active` below. */
  let moved = false;
  /** The tilt this leg eases away from, back toward `defaultPolar()` — captured
   *  fresh at the start of each leg, so a drag that tilted the view is undone the
   *  moment the pan next starts, at the same pace as the azimuth ramp-out. */
  let polarFrom = 0;

  const stop = () => {
    phase = 'idle';
  };

  const poke = () => {
    stop();
    lastPokeAt = performance.now();
  };

  /** Unwraps `controls`'s current azimuth to the branch nearest `about`. */
  const unwrap = (about) => {
    const raw = controls.getAzimuthalAngle();
    return raw + Math.round((about - raw) / (2 * Math.PI)) * 2 * Math.PI;
  };

  /** The camera's current tilt (polar angle), read fresh off its position. */
  const currentPolar = () =>
    _sph.setFromVector3(_v.subVectors(camera.position, controls.target)).phi;

  /** Writes `theta`, easing `phi` from `polarFrom` toward `defaultPolar()` over the
   *  same `outEase` the azimuth ramp-out uses, so a tilt undoes itself at the pan's
   *  own opening pace rather than snapping. */
  const writeTheta = (outEase) => {
    _sph.setFromVector3(_v.subVectors(camera.position, controls.target));
    _sph.theta = theta;
    _sph.phi = polarFrom + (defaultPolar() - polarFrom) * outEase;
    camera.position.setFromSphericalCoords(_sph.radius, _sph.phi, _sph.theta).add(controls.target);
  };

  /** Plans a leg from the current `theta` to this direction's edge. A leg long
   *  enough ramps up, cruises and ramps down; a shorter one is a single `ease`. */
  const startLeg = () => {
    const target = dir > 0 ? centre() + halfBand() + overshoot() : centre() - halfBand();
    const d = target - theta;
    legFrom = theta;
    legSign = Math.sign(d) || 1;
    legDist = Math.abs(d);
    legT = legDist >= 2 * RAMP_DIST
      ? 2 * RAMP_S + (legDist - 2 * RAMP_DIST) / CRUISE
      : EASE_PEAK * legDist / CRUISE;
    polarFrom = currentPolar();
    legElapsed = 0;
    phase = 'run';
  };

  /** Distance covered along the current leg after `t` seconds. */
  const legPos = (t) => {
    if (t >= legT) return legDist;
    if (legDist < 2 * RAMP_DIST) return legDist * ease(t / legT);
    if (t < RAMP_S) return CRUISE * RAMP_S * easeIntegral(t / RAMP_S);
    if (t > legT - RAMP_S) return legDist - CRUISE * RAMP_S * easeIntegral((legT - t) / RAMP_S);
    return RAMP_DIST + CRUISE * (t - RAMP_S);
  };

  const step = (dt, allowed) => {
    moved = false;
    if (!enabled()) return;
    if (!allowed) {
      if (phase !== 'idle') stop();
      lastPokeAt = performance.now();
      return;
    }

    const now = performance.now();

    if (phase === 'idle') {
      if (now - lastPokeAt < idleMs) return;
      theta = unwrap(centre());
      // Whichever edge is nearer becomes this leg's target — the shorter way in when
      // the camera was left turned outside the band (behind the room, say). The leg
      // then runs toward it from either side, since `startLeg` takes its own sign.
      const toRight = centre() + halfBand() + overshoot() - theta;
      const toLeft = theta - (centre() - halfBand());
      dir = toRight <= toLeft ? 1 : -1;
      startLeg();
    } else if (phase === 'pause') {
      if (now < pauseUntil) return;
      dir = -dir;
      startLeg();
    }

    if (phase === 'run') {
      legElapsed += dt;
      theta = legFrom + legSign * legPos(legElapsed);
      // The tilt eases home over the leg's own ramp-out, or over the whole leg when
      // that is shorter, so it is always back at `defaultPolar()` by the end.
      writeTheta(ease(Math.min(1, legElapsed / Math.min(RAMP_S, legT || 1))));
      moved = true;
      if (legElapsed >= legT) {
        phase = 'pause';
        pauseUntil = now + PAUSE_MS;
      }
    }
  };

  return {
    poke,
    step,
    /** Whether this tick actually wrote the camera — including the single frame a
     *  leg lands on its target, which flips `phase` to `pause` in the same tick.
     *  `main.js`'s intro-card handler excludes the pan by this, not by phase, or
     *  that landing frame's own `change` event would slip through the one frame it
     *  checks a moment too late and flicker the card open and shut. */
    get active() { return moved; },
  };
}
