import { typePrompt } from './typingPrompt.js';
import { dropIn, jiggle } from './droplet.js';
import { PROFILE } from './resume/content.js';
import { audioObjectUrl } from './preload.js';
import { loadingCube } from './loadingCube.js';

const el = document.getElementById('overlay');
const text = document.getElementById('overlay-text');
const bar = document.getElementById('bar');
const track = document.getElementById('bar-track');
const welcome = document.getElementById('welcome');
const welcomeName = document.getElementById('welcome-name');
const welcomeStart = document.getElementById('welcome-start');

/**
 * The chime Start plays — `tmp/originals/audio/startup.mp3`, levelled and made mono:
 *     ffmpeg -i <original> -af loudnorm=I=-16 -ac 1 -b:a 96k -map_metadata -1 \
 *       -id3v2_version 0 -write_xing 1 public/audio/startup.mp3
 * Played from the click itself, so no browser has a reason to refuse it.
 */
export const STARTUP_URL = 'audio/startup.mp3';
const STARTUP_VOLUME = 0.45;
/** Over its last seconds the chime fades to nothing rather than stopping short. */
const STARTUP_FADE_SECONDS = 4;

/** Plays the chime, fading it out towards the end. */
function playStartup() {
  const chime = new Audio(audioObjectUrl(STARTUP_URL));
  chime.volume = STARTUP_VOLUME;
  chime.addEventListener('timeupdate', () => {
    const left = chime.duration - chime.currentTime;
    if (Number.isFinite(left) && left < STARTUP_FADE_SECONDS) {
      chime.volume = STARTUP_VOLUME * Math.max(left / STARTUP_FADE_SECONDS, 0);
    }
  });
  chime.play().catch(() => {});
}

/** How many of the last props go in after the cube has been solved. */
const CUBE_TAIL = 3;
/** The least the solved cube rests before the card, however fast those props were. */
const CUBE_REST_MS = 1000;

export const ui = {
  /** The bar and, in words, how much is in and how much is still to come. */
  progress(fraction, loadedBytes, totalBytes) {
    // First call: the scripts are in, so the inline counter in `index.html` can stop and
    // the bar can start filling rather than sweeping.
    window.__scriptsDone?.();
    track.classList.remove('indeterminate');
    const pct = Math.round(fraction * 100);
    bar.style.width = `${pct}%`;
    if (totalBytes) {
      const mb = (n) => (n / 1e6).toFixed(1);
      text.textContent = `Loading room… ${mb(loadedBytes)} of ${mb(totalBytes)} MB · ${pct}%`;
    } else {
      text.textContent = `Loading room… ${pct}%`;
    }
  },
  /** The second phase: the bar counts props placed rather than bytes, `label` the one in hand. */
  objects(done, total, label) {
    bar.style.width = `${Math.round((done / total) * 100)}%`;
    // The cube's solve keeps step with this phase alone — the props going in — and
    // lands with the last few still to come, so their placing is its moment of rest.
    loadingCube.setProgress(done / Math.max(1, total - CUBE_TAIL));
    text.textContent = label
      ? `Placing ${label}… ${done} of ${total} objects`
      : `Placed ${total} objects`;
  },
  progressText(message) {
    text.textContent = message;
  },
  hide() {
    bar.style.width = '100%';
    el.classList.add('hidden');
  },
  /**
   * Once the room is in: keeps the solid backdrop and puts up a card that says whose
   * portfolio this is, with Start. Resolves on Start, having faded itself out — and
   * that click is the gesture the browser wants before anything may make a sound.
   */
  async welcome() {
    // `loadModel` hides the overlay just before this; back on at once, since the cube
    // still has its last moves to make and the room must not show through meanwhile.
    el.classList.remove('hidden');
    loadingCube.setProgress(1);
    await loadingCube.restedAfterSolve(CUBE_REST_MS);
    // Down and away, and only then the card up from where it was.
    await loadingCube.leave();
    loadingCube.stop();
    welcomeName.textContent = PROFILE.name;
    welcome.hidden = false;
    welcome.classList.add('opening');
    el.classList.add('welcome');
    requestAnimationFrame(() => requestAnimationFrame(() => welcome.classList.remove('opening')));
    return new Promise((resolve) => {
      welcomeStart.addEventListener('click', () => {
        playStartup();
        ui.hide();
        resolve();
      }, { once: true });
    });
  },
  /**
   * Turns the overlay into a "click anywhere to begin" — see-through, so the room shows
   * behind it — and resolves on the first click, having hidden itself.
   */
  begin() {
    // A finger taps; a mouse clicks. Pointer type, not screen width, is what tells.
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const message = touch ? 'Tap anywhere to begin' : 'Click anywhere to begin';
    // Glass only now: under the loading screen's solid backdrop it would be a plain box.
    text.classList.add('glass');
    text.classList.remove('grown');
    el.classList.remove('welcome');
    el.classList.add('begin');
    el.classList.remove('hidden');
    // The pill arrives as a droplet (see `droplet.js`): a point in the middle of the
    // screen that swells into a circle — a circle only, the pill's own height across.
    // The line is then typed into it (see `typingPrompt.js`), widening it as it goes,
    // and once the line is in the pill swells to its resting size. Only then — the
    // last key struck, the swell settled — is the room open to a click: the overlay
    // marks itself `ready`, the sheen starts sweeping the pill, and the pointer is
    // listened to. Until that moment a click is nobody's; the overlay covers the room,
    // so the camera cannot be dragged either.
    let ready = false;
    text.textContent = '\u00a0';
    const height = text.offsetHeight;
    text.textContent = '';
    // Held at the disc's size while empty: released, the pill would dip to its empty
    // height and no width for the beat before the first letter lands.
    text.style.minWidth = `${height}px`;
    text.style.minHeight = `${height}px`;
    dropIn(text, { width: height, height, origin: 'center', overshoot: false }).then(() => {
      const prompt = typePrompt(text, message);
      prompt.done.then(() => {
        text.style.minWidth = '';
        text.style.minHeight = '';
        text.classList.add('grown');
        text.addEventListener('transitionend', () => {
          ready = true;
          el.classList.add('ready');
        }, { once: true });
      });
    });
    // `body.begin`, set by main.js at startup, is what hides the resume's own chrome; the
    // click is what lifts it.
    return new Promise((resolve) => {
      const onDown = () => {
        if (!ready) return;
        el.removeEventListener('pointerdown', onDown);
        jiggle(text);
        el.classList.remove('ready');
        document.body.classList.remove('begin');
        ui.hide();
        resolve();
      };
      el.addEventListener('pointerdown', onDown);
    });
  },
  /**
   * Puts the message up in place of whatever the overlay was showing — the bar, the
   * welcome card or the see-through "tap to begin" — so a failure after any of them is
   * read, not lost behind them.
   */
  error(message) {
    loadingCube.stop();
    el.classList.remove('hidden', 'welcome', 'begin', 'ready');
    el.classList.add('error');
    welcome.hidden = true;
    text.classList.remove('glass', 'grown');
    text.style.minWidth = '';
    text.style.minHeight = '';
    text.textContent = message;
  },
};
