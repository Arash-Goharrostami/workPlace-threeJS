import { setupClickSound } from './clickSound.js';

/**
 * Click the Blender mug and it rings, as if tapped. It is sound only: the mug stays where it was put.
 *
 * The sound is `public/audio/mugHit.mp3`, freesound_community's "mug hit" (81050) cut to
 * its 0.05–0.30 s (the rest was silence), mono at 64 kbps; the original is in `tmp/books/`.
 */
export function setupMugClick({ camera, canvas, mug }) {
  setupClickSound({ camera, canvas, objects: [mug], url: 'audio/mugHit.mp3', volume: 0.3, pitchSpread: 0.04 });
}
