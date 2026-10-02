/**
 * The anisotropy text textures are given. Set from the renderer once it exists
 * (`main.js`), so a canvas seen at an angle — the wall, the paper on the desk — uses
 * everything the GPU offers (usually 16×) instead of a fixed 8×, which is what kept
 * the chalk and the CV soft from across the room.
 */
let max = 8;

export function setMaxAnisotropy(renderer) {
  max = renderer.capabilities.getMaxAnisotropy() || 8;
}

export const maxAnisotropy = () => max;
