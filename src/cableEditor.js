import * as THREE from 'three';

/**
 * The cable half of edit mode: a handle on each of a cord's control points, dragged
 * with the same gizmo the props use. Moving a middle handle bends the run, moving an
 * end one lengthens or shortens it, and `A` / `X` add and drop points.
 *
 * The handles live in world space, directly under the scene, so a drag reads straight
 * off their positions — the cord's own points are world-space too (see `cable.js`).
 */

/** Handle size, in scene centimetres, and the ball's own look. */
const HANDLE_RADIUS = 1.1;
const HANDLE_COLOR = 0x4ea1ff;
const HANDLE_PICKED = 0xffc65c;

/** How far a new point is set beyond the run when `A` is pressed at the last handle. */
const APPEND_STEP = 6;

export function setupCableEditor(scene) {
  const group = new THREE.Group();
  group.name = 'Cable_handles';
  scene.add(group);

  const geometry = new THREE.SphereGeometry(HANDLE_RADIUS, 16, 12);
  const idle = new THREE.MeshBasicMaterial({ color: HANDLE_COLOR });
  const picked = new THREE.MeshBasicMaterial({ color: HANDLE_PICKED });

  let cable = null;

  function clear() {
    for (const handle of [...group.children]) group.remove(handle);
  }

  return {
    group,
    get cable() { return cable; },

    /** Puts a handle on every point of `next`, and takes over from any previous cord. */
    attach(next) {
      clear();
      cable = next ?? null;
      if (!cable) return;
      for (const point of cable.userData.cable.points) addHandle(point);
    },

    detach() {
      clear();
      cable = null;
    },

    /** True when the object is one of this editor's handles. */
    owns(object) {
      return object?.parent === group;
    },

    highlight(handle) {
      for (const child of group.children) child.material = child === handle ? picked : idle;
    },

    /** Redraws the cord through the handles as they now stand. */
    rebuild() {
      if (!cable) return;
      cable.userData.cable.rebuild(group.children.map((handle) => handle.position));
    },

    /** The route as it stands, for the readout. */
    points() {
      return cable ? cable.userData.cable.points : [];
    },

    /**
     * Adds a point after `handle` — half way to the next one, or a step further along
     * the run when it is the last. Returns the new handle so it can be selected.
     */
    add(handle) {
      if (!cable) return null;
      const index = group.children.indexOf(handle);
      if (index < 0) return null;

      const here = handle.position;
      const next = group.children[index + 1];
      const previous = group.children[index - 1];
      const point = next
        ? here.clone().lerp(next.position, 0.5)
        : here.clone().add(
          previous
            ? here.clone().sub(previous.position).setLength(APPEND_STEP)
            : new THREE.Vector3(0, -APPEND_STEP, 0)
        );

      // `add` puts it at the end; the run's order is the spline's order, so it is
      // moved into place in the children list.
      const added = addHandle(point);
      group.children.pop();
      group.children.splice(index + 1, 0, added);
      this.rebuild();
      return added;
    },

    /**
     * Drops `handle`. A spline needs two points, so the last pair are kept. Returns
     * the handle that should take the selection.
     */
    remove(handle) {
      if (!cable || group.children.length <= 2) return handle;
      const index = group.children.indexOf(handle);
      if (index < 0) return handle;

      group.remove(handle);
      this.rebuild();
      return group.children[Math.min(index, group.children.length - 1)] ?? null;
    },
  };

  function addHandle(point) {
    const handle = new THREE.Mesh(geometry, idle);
    handle.position.copy(point);
    // A gizmo of its own is drawn over it; the ball itself needs no shading pass.
    handle.castShadow = false;
    handle.receiveShadow = false;
    group.add(handle);
    return handle;
  }
}
