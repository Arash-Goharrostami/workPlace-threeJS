import { typePrompt } from './typingPrompt.js';
import { PROFILE } from './resume/content.js';
import { audioObjectUrl } from './preload.js';

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
  welcome() {
    welcomeName.textContent = PROFILE.name;
    welcome.hidden = false;
    welcome.classList.add('opening');
    el.classList.add('welcome');
    el.classList.remove('hidden');
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
    text.textContent = '';
    text.classList.add('glass', 'opening');
    el.classList.remove('welcome');
    el.classList.add('begin');
    el.classList.remove('hidden');
    // A small pill blooms, the line is typed into it (see `typingPrompt.js`), widening
    // it as it goes, and once the line is in the pill swells to its resting size.
    let prompt = null;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      text.classList.remove('opening');
      text.addEventListener('transitionend', () => {
        prompt = typePrompt(text, message);
        prompt.done.then(() => text.classList.add('grown'));
      }, { once: true });
    }));
    // `body.begin`, set by main.js at startup, is what hides the resume's own chrome; the
    // click is what lifts it.
    return new Promise((resolve) => {
      el.addEventListener('pointerdown', () => {
        // A click mid-sentence finishes it; the room is what was asked for.
        if (prompt) prompt.cancel();
        else text.textContent = message;
        text.classList.remove('opening');
        text.classList.add('grown');
        document.body.classList.remove('begin');
        ui.hide();
        resolve();
      }, { once: true });
    });
  },
  /**
   * Puts the message up in place of whatever the overlay was showing — the bar, the
   * welcome card or the see-through "tap to begin" — so a failure after any of them is
   * read, not lost behind them.
   */
  error(message) {
    el.classList.remove('hidden', 'welcome', 'begin');
    el.classList.add('error');
    welcome.hidden = true;
    text.classList.remove('glass', 'opening', 'grown');
    text.textContent = message;
  },
};
