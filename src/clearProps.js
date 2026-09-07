/**
 * Empties the workspace: everything on and under the desk goes, along with the
 * water cooler outside, leaving the desk, the chair and the room itself.
 */

/** The only prop groups that survive. Everything else in the container is removed. */
const KEEP = new Set(['Chair01_Chair', 'walls', 'window']);

/** Found by name, the way the desks are — the chair anchors the prop container. */
const ANCHOR = 'Chair01_Chair';

/** Returns the names of the groups it removed. */
export function clearProps(model) {
  const container = model.getObjectByName(ANCHOR)?.parent;
  if (!container) return [];

  const removed = [];
  for (const child of [...container.children]) {
    if (KEEP.has(child.name)) continue;
    child.removeFromParent();
    disposeGeometry(child);
    removed.push(child.name);
  }

  return removed;
}

// Geometry only: materials are shared across the whole room, so disposing them here
// would blank out the surfaces that are staying.
function disposeGeometry(root) {
  root.traverse((node) => {
    if (node.isMesh) node.geometry?.dispose();
  });
}
