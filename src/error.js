import { startLoadingCube } from './loadingCube.js';
import { dropIn, jiggle } from './droplet.js';

/**
 * The entry for `error.html`: the loading screen's cube, scrambled and then given up
 * on — six moves back and the seventh left hanging (see `giveUp` in `loadingCube.js`).
 * The turns click as on the loading screen — once the browser lets audio through.
 *
 * The copy waits for the stall. Once the layer has come to rest, and a beat after,
 * the lines rise in (the stylesheet staggers them) and the way back arrives as the
 * begin pill does — a point in its own middle that swells into a glass disc and is
 * drawn out into the button (`dropIn`). If the cube cannot be shown, `stalled`
 * resolves at once and the same arrival simply plays straight away.
 *
 * The status is the one thing filled in here, if the page was opened as
 * `error.html?code=404` — a static host serves one error document for every code, so
 * it is usually absent.
 */
const BEAT_MS = 350;

const cube = startLoadingCube(document.getElementById('error-cube'), { giveUp: 6 });

const code = new URLSearchParams(location.search).get('code');
if (code && /^\d{3}$/.test(code)) {
  document.getElementById('code').textContent = `HTTP ${code}`;
}

cube.stalled.then(() => new Promise((resolve) => setTimeout(resolve, BEAT_MS))).then(() => {
  document.getElementById('copy').classList.add('in');

  const back = document.getElementById('back');
  const label = back.querySelector('span');
  // Measured at rest, glass on, before anything is animated: `dropIn` animates the
  // width, so it has to be told what the pill ends up as.
  back.classList.add('glass');
  const { width, height } = back.getBoundingClientRect();
  // The element's own opacity is what shows once the animation is cancelled at the
  // end, so it is set before the drop; while it plays, the keyframes win.
  back.style.opacity = '1';
  dropIn(back, {
    width, height, origin: 'center', label, delay: 500, duration: 1000,
  });
  back.addEventListener('pointerdown', () => jiggle(back));
});
