import { audioBytes } from './preload.js';
import { LOW } from './quality.js';

/**
 * The sound of the loading cube's layer turns: six recorded turns of a real cube —
 * from SpaceJoe's "Rubik Cube Sounds" pack on Freesound, CC0 — cut into one sprite,
 * `SLOT` seconds a turn (`ffmpeg`: each trimmed of its lead-in, padded to the slot,
 * concatenated and loudness-levelled). A move plays a random turn, never the same
 * one twice running, a touch faster or slower each time.
 *
 * The recordings are close-miked and dry, so each play is softened — a low-pass takes
 * the edge off the clack, the gain sits low, a short fade-in keeps the attack from
 * spiking — and put in a small room: a short decaying-noise impulse through a
 * convolver, mixed quietly under the dry signal, so the clack has somewhere to go.
 *
 * A browser lets nothing be heard until the page has been touched, so the context is
 * resumed on the first pointer or key anywhere and a turn before that is silent —
 * the solve keeps going, just without the sound, until something is clicked.
 */
export const CLIP_URL = 'audio/cubeTurns.mp3';
const SLOTS = 6;
const SLOT = 1.2;
const VOLUME = 0.3;
/** Where the low-pass sits, in Hz — only the very top, where the mic's edge is. */
const SOFTEN_HZ = 7000;
const FADE_IN = 0.008;
/** The turns play as recorded, give or take: speeding them up made them a toy. */
const RATE = 1;
const RATE_SPREAD = 0.04;
/**
 * The room: how long its tail is, in seconds, how dark it is (the impulse is
 * low-passed here, in Hz — a bare noise tail rings like a tin box) and how much of
 * it is heard.
 */
const ROOM_SECONDS = 0.7;
const ROOM_HZ = 1800;
const ROOM_MIX = 0.16;

const Context = window.AudioContext || window.webkitAudioContext;

let context = null;
let buffer = null;
let room = null;
let lastSlot = -1;

/**
 * A small room's impulse: stereo noise dying away exponentially, run through a
 * one-pole low-pass so the tail is warm rather than hissy, with the first few
 * milliseconds left out so the dry clack arrives before its room does.
 */
function roomImpulse() {
  const rate = context.sampleRate;
  const length = Math.floor(rate * ROOM_SECONDS);
  const predelay = Math.floor(rate * 0.012);
  const impulse = context.createBuffer(2, length, rate);
  const k = Math.exp((-2 * Math.PI * ROOM_HZ) / rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    let smooth = 0;
    for (let i = predelay; i < length; i += 1) {
      const t = (i - predelay) / (length - predelay);
      smooth = k * smooth + (1 - k) * (Math.random() * 2 - 1);
      data[i] = smooth * Math.exp(-5 * t);
    }
  }
  return impulse;
}

function open() {
  if (context || !Context) return;
  context = new Context();
  audioBytes(CLIP_URL)
    .then((data) => context.decodeAudioData(data))
    .then((decoded) => { buffer = decoded; })
    .catch(() => {});
  // The room is a convolution per play — cheap, but a weak device is spared it.
  if (!LOW) {
    room = context.createConvolver();
    room.buffer = roomImpulse();
    const wet = context.createGain();
    wet.gain.value = ROOM_MIX;
    room.connect(wet).connect(context.destination);
  }
  const wake = () => {
    if (context?.state === 'suspended') context.resume().catch(() => {});
  };
  wake();
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake, { passive: true });
  open.close = () => {
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  };
}

export const cubeSound = {
  /** One layer turn. Silent until the page has been touched. */
  turn() {
    open();
    if (!context || !buffer || context.state !== 'running') return;
    const now = context.currentTime;
    let slot;
    do slot = Math.floor(Math.random() * SLOTS); while (slot === lastSlot);
    lastSlot = slot;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = RATE * (1 + (Math.random() * 2 - 1) * RATE_SPREAD);
    const soften = context.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = SOFTEN_HZ;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(VOLUME * (0.85 + Math.random() * 0.15), now + FADE_IN);
    source.connect(soften).connect(gain);
    gain.connect(context.destination);
    if (room) gain.connect(room);
    source.start(now, slot * SLOT, SLOT);
  },

  /** Lets the context go, once the loading screen is gone. */
  stop() {
    open.close?.();
    context?.close().catch(() => {});
    context = null;
    buffer = null;
    room = null;
  },
};
