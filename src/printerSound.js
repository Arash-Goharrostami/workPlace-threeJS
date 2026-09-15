import * as THREE from 'three';
import { audioBytes } from './preload.js';

/**
 * The printer's motors, heard from where it stands, and read back as a loudness curve
 * that `printerJob.js` drives the carriage with — so the head runs while the steppers
 * whine and rests in the gaps, rather than two loops that agree by luck.
 *
 * The clip is a stepper recording (freesound 71289, "3d printer close"), 35 s with a
 * fade at each end. It is cut to its steady middle, brought up 10 dB, and made a loop by
 * crossfading its last second and a half into its first — so the join is inside the
 * clip, under the motors, and the file's end is the same sound as its start:
 *
 *     ffmpeg -i <original> -filter_complex \
 *       "[0:a]atrim=3.5:31.0,asetpts=PTS-STARTPTS,volume=10dB[a];
 *        [0:a]atrim=2.0:3.5,asetpts=PTS-STARTPTS,volume=10dB[b];
 *        [a][b]acrossfade=d=1.5:c1=tri:c2=tri[out]" \
 *       -map "[out]" -ac 1 -b:a 96k -map_metadata -1 -id3v2_version 0 -write_xing 1 \
 *       public/audio/printer.mp3
 *
 * 27.5 s and 331 KB against 1.1 MB. The original is in `tmp/originals/audio/`.
 *
 * Nothing is created until `start()`: a context made before a gesture starts suspended
 * and Safari never lets it out (`guitarStrum.js` waits the same way), and the clip is
 * not fetched by anyone who never clicks. The sound is positional — a listener on the
 * camera, the source on the printer — so it is a murmur across the room and present at
 * the desk.
 */

export const CLIP_URL = 'audio/printer.mp3';

/** Overall level, and how it falls off: full within `REF_DISTANCE` cm, then inverse. */
const VOLUME = 1.1;
const REF_DISTANCE = 90;
const ROLLOFF = 1.4;

/**
 * The level while the camera is down on a prop — a section open, the phone or the
 * frames filling the view — and how long the fade there and back takes. A murmur, not
 * silence: the printer is still running behind whatever is being read.
 */
const DUCKED_VOLUME = VOLUME * 0.25;
const DUCK_SECONDS = 0.6;

/** The envelope's resolution and how much it is smoothed, both in seconds. */
const BIN_SECONDS = 0.05;
const SMOOTH_SECONDS = 0.12;

/**
 * The envelope is stretched between these two percentiles of itself rather than
 * between silence and its peak: a stepper's whine never drops far — the recording sits
 * between a quarter and a half of its peak nearly throughout — so against the peak the
 * head would barely change pace. Against its own quiet and loud moments it does.
 */
const QUIET_PERCENTILE = 0.1;
const LOUD_PERCENTILE = 0.9;

/**
 * Wires the sound to `printer`, silent until `start()`. Returns `{ start, level,
 * setMuted, setDucked }`: `level()` is the clip's loudness at the moment being heard,
 * 0–1, or `null` until the clip is playing — and it goes on reporting while muted or
 * ducked, so the head keeps working and only the sound changes. `setDucked(on)` fades
 * the motors down to `DUCKED_VOLUME` while a prop is being read and back up after;
 * `setMuted(on)` cuts them outright. Either pressed before the clip has decoded is
 * remembered and applied when it does.
 */
export function setupPrinterSound(printer) {
  let sound = null;
  let envelope = null;
  let startedAt = 0;
  let duration = 0;
  let muted = false;
  let ducked = false;

  /** The level the two switches add up to. */
  const target = () => (muted ? 0 : ducked ? DUCKED_VOLUME : VOLUME);

  const start = (camera) => {
    if (sound || !camera) return;

    const listener = new THREE.AudioListener();
    camera.add(listener);

    sound = new THREE.PositionalAudio(listener);
    sound.setRefDistance(REF_DISTANCE);
    sound.setRolloffFactor(ROLLOFF);
    sound.setVolume(target());
    sound.setLoop(true);
    printer.add(sound);

    const context = listener.context;
    if (context.state === 'suspended') context.resume();

    // Fetched under the loading bar (see `preload.js`), so this is only the decode.
    audioBytes(CLIP_URL)
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        envelope = buildEnvelope(buffer);
        duration = buffer.duration;
        sound.setBuffer(buffer);
        sound.play();
        startedAt = context.currentTime;
      })
      .catch((error) => {
        console.warn('[printer sound] failed to load:', error);
      });
  };

  const level = () => {
    if (!envelope || !sound.isPlaying) return null;
    const t = (sound.context.currentTime - startedAt) % duration;
    const bin = Math.min(envelope.length - 1, Math.floor(t / BIN_SECONDS));
    return envelope[bin];
  };

  const setMuted = (on) => {
    muted = Boolean(on);
    if (!sound) return;
    // A fade still running would talk over the value set here, so it is dropped first.
    sound.gain.gain.cancelScheduledValues(sound.context.currentTime);
    sound.setVolume(target());
  };

  const setDucked = (on) => {
    ducked = Boolean(on);
    if (!sound || muted) return;
    // Eased there rather than stepped: a cut in a steady whine is heard as a click.
    const gain = sound.gain.gain;
    gain.cancelScheduledValues(sound.context.currentTime);
    gain.setTargetAtTime(target(), sound.context.currentTime, DUCK_SECONDS / 3);
  };

  return { start, level, setMuted, setDucked };
}

/**
 * RMS loudness per bin, smoothed and stretched so the clip's own quiet moments read 0
 * and its loud ones 1. RMS rather than peak: a stepper's whine is steady and its level
 * is what says "moving", where a peak would jump on every tick.
 */
function buildEnvelope(buffer) {
  const data = buffer.getChannelData(0);
  const binSize = Math.floor(buffer.sampleRate * BIN_SECONDS);
  const bins = Math.ceil(data.length / binSize);
  const raw = new Float32Array(bins);

  for (let b = 0; b < bins; b++) {
    const start = b * binSize;
    const end = Math.min(data.length, start + binSize);
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[i] * data[i];
    raw[b] = Math.sqrt(sum / (end - start));
  }

  // A running average over the smoothing window, wrapped, so the loop's join is as
  // smooth as the rest.
  const reach = Math.max(1, Math.round(SMOOTH_SECONDS / BIN_SECONDS / 2));
  const smooth = new Float32Array(bins);
  for (let b = 0; b < bins; b++) {
    let sum = 0;
    for (let k = -reach; k <= reach; k++) sum += raw[(b + k + bins) % bins];
    smooth[b] = sum / (2 * reach + 1);
  }

  const sorted = Float32Array.from(smooth).sort();
  const quiet = sorted[Math.floor(QUIET_PERCENTILE * (bins - 1))];
  const loud = sorted[Math.floor(LOUD_PERCENTILE * (bins - 1))];
  const span = loud - quiet || 1;
  for (let b = 0; b < bins; b++) {
    smooth[b] = THREE.MathUtils.clamp((smooth[b] - quiet) / span, 0, 1);
  }

  return smooth;
}
