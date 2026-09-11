import { CV_URL, CV_FILENAME } from './content.js';

/**
 * The CV section, read on the paper tablet itself.
 *
 * Like the wall frames and the phone, the prop *is* the section: the sheet drawn on the
 * tablet (`src/paperTablet.js`) is the whole CV on one page, so there is no sidebar to
 * build and — unlike the monitor and the laptop — nothing to scroll. What the section
 * adds is one question. A click on the page brings up a small card asking whether to
 * download the CV as a PDF; a click on the board or the clip around it is the step back
 * out to the room, the way it is for every other prop.
 *
 * Same contract as `phoneApps.js`: `hover` says whether the pointer is on something
 * clickable, `open` works the click and returns the HUD line for it (or null when it
 * landed off the page), `reset` puts the card away.
 */

/** The HUD line while the card is up. */
const VIEW = 'CV — download as PDF?';

export function setupSheetPrompt({ group }) {
  /** The page mesh, marked by `paperTablet.js` when it dresses it. */
  let sheet = null;
  group.traverse((node) => {
    if (node.isMesh && node.userData.sheet) sheet = node;
  });
  if (!sheet) console.warn('[resume] the paper tablet has no page mesh to click');

  const card = document.getElementById('ask');
  const yes = card?.querySelector('[data-yes]');
  const no = card?.querySelector('[data-no]');
  if (yes) {
    yes.href = CV_URL;
    yes.setAttribute('download', CV_FILENAME);
  }

  const show = (on) => {
    if (card) card.classList.toggle('is-open', on);
  };

  // Either answer puts the card away; *yes* is a download link, so the browser has
  // already started the file by the time the click reaches here.
  yes?.addEventListener('click', () => show(false));
  no?.addEventListener('click', () => show(false));

  const hover = (object) => Boolean(sheet) && object === sheet;

  const open = (object) => {
    if (!sheet || object !== sheet) return null;
    show(true);
    return VIEW;
  };

  const reset = () => show(false);

  return { hover, open, reset };
}
