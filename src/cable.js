import * as THREE from 'three';

/**
 * A cord drawn as a tube along a spline, and the handle the editor needs to redraw it.
 *
 * The points are world-space — every module that runs a cable measures its route off
 * live bounds, not off the parent's frame — so the finished mesh has the parent's
 * matrix undone rather than the curve being converted point by point.
 */

/** Segments along the run and around it. Enough that no bend reads as faceted. */
const TUBULAR_SEGMENTS = 420;
const RADIAL_SEGMENTS = 12;

/**
 * Centripetal, not uniform: with points as unevenly spaced as a cord's a uniform
 * spline overshoots between them, which is what pushed the first wall cord through
 * the floor.
 */
const CURVE_TYPE = 'centripetal';

/**
 * Builds the cord. `userData.cable` carries its own recipe, so the editor can move a
 * point and ask for the same tube back rather than reimplementing this.
 */
export function buildCable({ name, points, radius, material, parent }) {
  const cable = new THREE.Mesh(tube(points, radius), material);
  cable.name = name;
  cable.castShadow = true;
  cable.receiveShadow = true;

  // The curve is in world units; the parent carries its own offset, so undo it on the
  // mesh — the geometry stays world-space, which is what lets a rebuild reuse it.
  cable.applyMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert());

  cable.userData.cable = {
    radius,
    points: points.map((point) => point.clone()),
    /** Redraws the tube through `next`, in the same world space as the first run. */
    rebuild(next) {
      this.points = next.map((point) => point.clone());
      cable.geometry.dispose();
      // World space, like the first build: the parent's offset is carried by the
      // mesh's own matrix, so converting the geometry too would apply it twice.
      cable.geometry = tube(this.points, this.radius);
      return cable;
    },
  };

  return cable;
}

function tube(points, radius) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points, false, CURVE_TYPE),
    TUBULAR_SEGMENTS, radius, RADIAL_SEGMENTS, false
  );
}
