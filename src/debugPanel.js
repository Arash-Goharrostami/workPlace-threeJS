import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { materialsOf } from './materials.js';
import { HOME_VIEW } from './homeView.js';

/**
 * The room's shell, taken out together by the "Hide walls" box so the desk can be
 * looked at from behind. The floor stays — take it away and every prop is left
 * floating.
 *
 * Taken out, not just made invisible: the pieces are detached from the scene while the
 * box is ticked and put back where they were when it is unticked. An invisible wall is
 * still in the graph — it is picked by edit mode's raycasts and still shows up in
 * anything that measures the room — and the whole point of the box is that the room is
 * not there.
 *
 * `walls` is the group the wall meshes live in; the rest are the pieces fixed to a
 * wall, which would otherwise hang in mid-air, plus the patch that fills the corner
 * between the desk and the wall.
 */
const SHELL_GROUP = 'walls';
const SHELL_KEEP = new Set(['floor']);
const SHELL_PROPS = [
  'window', 'Window_blind', 'Blind_brackets', 'Wall_outlet', 'Desk_corner_patch',
];

/**
 * Wires the checkboxes in index.html. Returns a `stats` handle the render loop
 * ticks each frame (null-safe when the readout is hidden).
 */
export function setupDebugPanel({ scene, camera, controls, environment }) {
  const stats = new Stats();
  stats.dom.style.cssText = 'position:static;opacity:1;cursor:default';
  document.getElementById('stats-slot').appendChild(stats.dom);
  stats.dom.hidden = true;

  bind('opt-wireframe', (on) => {
    scene.traverse((node) => {
      if (!node.isMesh) return;
      for (const mat of materialsOf(node)) {
        if (mat && 'wireframe' in mat) mat.wireframe = on;
      }
    });
  });

  bind('opt-grid', (on) => { environment.grid.visible = on; });

  // What was taken out, and the parent each piece has to go back to.
  const shelved = [];

  bind('opt-walls', (hide) => {
    if (hide) {
      // Collected per toggle, not once at wire-up: this panel is built before
      // `loadModel` has put the room in the scene, so there is nothing to find yet.
      const walls = scene.getObjectByName(SHELL_GROUP);
      const pieces = [
        ...(walls?.children ?? []).filter((child) => !SHELL_KEEP.has(child.name)),
        ...SHELL_PROPS.map((name) => scene.getObjectByName(name)).filter(Boolean),
      ];

      for (const piece of pieces) {
        // A piece can be reached twice — a wall-mounted prop parented under `walls` —
        // and shelving it twice would lose the parent it belongs to.
        if (shelved.some((entry) => entry.piece === piece)) continue;
        shelved.push({ piece, parent: piece.parent });
        piece.removeFromParent();
      }
    } else {
      for (const { piece, parent } of shelved.splice(0)) parent.add(piece);
    }

    // The shadow map is cached, so the room would otherwise keep casting after it has
    // gone — and keep its hole in the light after it is back.
    environment.refreshShadows();
  });

  bind('opt-rotate', (on) => { controls.autoRotate = on; });
  bind('opt-stats', (on) => { stats.dom.hidden = !on; });

  wireCopyView({ camera, controls });

  return stats;
}

/**
 * `Copy view` — the room's opening shot, authored by orbiting to it.
 *
 * It reads the angles straight back off the controls in the same convention
 * `homeView.js` writes them in, and copies the whole `HOME_VIEW` block ready to paste
 * over the one in that file. `zoom` and `height` are recovered by dividing out what
 * the auto-fit worked out, so they stay meaningful if the room's bounds ever change.
 */
function wireCopyView({ camera, controls }) {
  const button = document.getElementById('opt-copy-view');
  if (!button) return;

  button.addEventListener('click', async () => {
    const text = describeView(camera, controls);
    try {
      await navigator.clipboard.writeText(text);
      flash(button, 'Copied');
    } catch {
      // Clipboard access needs a secure context; the console is the fallback.
      console.info(text);
      flash(button, 'In console');
    }
  });
}

/** The current view, as the `HOME_VIEW` literal that would reproduce it. */
function describeView(camera, controls) {
  const distance = camera.position.distanceTo(controls.target);
  const azimuth = THREE.MathUtils.radToDeg(controls.getAzimuthalAngle());
  const polar = THREE.MathUtils.radToDeg(controls.getPolarAngle());

  // The fitted distance this view is a multiple of — the same formula `homeView.js`
  // uses, so dividing by it recovers the `zoom` that would put the camera back here.
  const scene = controls.object.parent;
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1e-3);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 1;
  const fit = Math.max(
    radius / Math.sin(fov / 2),
    radius / Math.sin(Math.atan(Math.tan(fov / 2) * aspect))
  );

  const round = (n) => Number(n.toFixed(2));
  const view = {
    azimuth: round(azimuth),
    polar: round(polar),
    zoom: round(distance / fit),
    height: round(size.y ? (controls.target.y - box.min.y) / size.y : HOME_VIEW.height),
  };

  return [
    'export const HOME_VIEW = {',
    `  azimuth: ${view.azimuth},`,
    `  polar: ${view.polar},`,
    `  zoom: ${view.zoom},`,
    `  height: ${view.height},`,
    '};',
  ].join('\n');
}

/** Says what happened on the button itself, then puts its label back. */
function flash(button, message) {
  const label = button.textContent;
  button.textContent = message;
  setTimeout(() => { button.textContent = label; }, 1200);
}

function bind(id, handler) {
  const input = document.getElementById(id);
  input.addEventListener('change', () => handler(input.checked));
  handler(input.checked);
}
