import Stats from 'three/addons/libs/stats.module.js';
import { materialsOf } from './materials.js';

/**
 * Wires the checkboxes in index.html. Returns a `stats` handle the render loop
 * ticks each frame (null-safe when the readout is hidden).
 */
export function setupDebugPanel({ scene, controls, grid }) {
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

  bind('opt-grid', (on) => { grid.visible = on; });
  bind('opt-rotate', (on) => { controls.autoRotate = on; });
  bind('opt-stats', (on) => { stats.dom.hidden = !on; });

  return stats;
}

function bind(id, handler) {
  const input = document.getElementById(id);
  input.addEventListener('change', () => handler(input.checked));
  handler(input.checked);
}
