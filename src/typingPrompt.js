/**
 * Types a line into an element as though it were being written this moment, to the
 * sound of a keyboard — the letters set the rhythm and every one of them strikes a
 * key, so there are exactly as many clicks as characters.
 *
 * The keys come from a MacBook keyboard recording (pixabay 586600, "macbook notebook
 * keyboard typing"). Eight strokes that stand alone in it are cut out, 140 ms each with
 * a short fade, and laid end to end in 200 ms slots to make one sprite:
 *
 *     ffmpeg -i <original> -filter_complex "
 *       [0:a]atrim=1.45:1.59,asetpts=PTS-STARTPTS,afade=t=out:st=0.11:d=0.03,apad=whole_dur=0.2[k0];
 *       … the same for 8.265, 9.26, 12.31, 17.125, 31.63, 37.685, 42.86 …
 *       [k0]…[k7]concat=n=8:v=0:a=1,loudnorm=I=-16[out]" \
 *       -map "[out]" -ac 1 -ar 48000 -b:a 96k -map_metadata -1 -id3v2_version 0 \
 *       -write_xing 1 public/audio/typing.mp3
 *
 * 1.6 s and 20 KB against 1.8 MB. The original is in `tmp/originals/audio/`.
 *
 * Each character plays one slot, chosen at random and nudged a little in pitch and level,
 * so twenty-three keys do not sound like one sample on a loop.
 *
 * The prompt is shown before the first click, which is exactly when a browser may refuse
 * to make a sound: an AudioContext made now starts suspended unless the page has already
 * been touched. So the sound is attempted, not relied on — refused, the letters run on
 * the same timetable and the room is merely quieter.
 */

import { audioBytes } from './preload.js';

export const CLIP_URL = 'audio/typing.mp3';

/** The sprite: `KEYS` strokes, one every `SLOT` seconds, each `KEY_LENGTH` long. */
const KEYS = 8;
const SLOT = 0.2;
const KEY_LENGTH = 0.14;

/** How loud a key is, 0–1, before the small per-key variation. Kept soft: it is a prompt, not a typist beside you. */
const VOLUME = 0.45;

/** Typing pace in ms: a key every `BASE` give or take `JITTER`, a breath after a space. */
const BASE = 85;
const JITTER = 35;
const SPACE_PAUSE = 60;

/** When each character of `message` lands, in ms from the start. */
function timetable(message) {
  const times = [];
  let t = 120;
  for (const ch of message) {
    times.push(t);
    t += BASE + (Math.random() * 2 - 1) * JITTER + (ch === ' ' ? SPACE_PAUSE : 0);
  }
  return times;
}

/**
 * Types `message` into `el`. Returns `{ done, cancel }`: `done` resolves when the last
 * letter is in; `cancel()` completes the line at once, for a click that arrives
 * mid-sentence.
 */
export function typePrompt(el, message) {
  const keyboard = openKeyboard();

  el.textContent = '';

  const times = timetable(message);
  const startedAt = performance.now();
  let typed = 0;
  let frame = 0;
  let finished = null;
  const done = new Promise((resolve) => { finished = resolve; });

  const show = (n) => { el.textContent = message.slice(0, n); };

  const tick = () => {
    const t = performance.now() - startedAt;
    while (typed < message.length && t >= times[typed]) {
      typed += 1;
      keyboard.strike();
    }
    show(typed);
    if (typed < message.length) frame = requestAnimationFrame(tick);
    else finished();
  };

  frame = requestAnimationFrame(tick);

  return {
    done,
    cancel() {
      cancelAnimationFrame(frame);
      keyboard.close();
      el.textContent = message;
      finished();
    },
  };
}

/**
 * The sprite, decoded and ready to strike from. `strike()` plays one key, or nothing if
 * the context is still suspended or the clip has not arrived; `close()` lets it all go.
 */
function openKeyboard() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return { strike() {}, close() {} };
  const context = new Context();
  let buffer = null;
  audioBytes(CLIP_URL)
    .then((data) => context.decodeAudioData(data))
    .then((decoded) => { buffer = decoded; })
    .catch(() => {});
  // A page that has been touched lets the context run; one that has not leaves it
  // suspended, and `resume()` is a request the browser is free to ignore.
  if (context.state === 'suspended') context.resume().catch(() => {});

  return {
    strike() {
      if (!buffer || context.state !== 'running') return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.04;
      const gain = context.createGain();
      gain.gain.value = VOLUME * (0.8 + Math.random() * 0.2);
      // A gentle low-pass takes the click's edge off; the thud of the key stays.
      const soften = context.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 5000;
      source.connect(soften).connect(gain).connect(context.destination);
      source.start(0, Math.floor(Math.random() * KEYS) * SLOT, KEY_LENGTH);
    },
    close() {
      context.close().catch(() => {});
    },
  };
}
