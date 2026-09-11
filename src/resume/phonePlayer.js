/**
 * What the phone's Now Playing card actually does.
 *
 * The card itself is built in `src/phonePlayer.js` and left on the phone root as
 * `userData.player`; this module holds the audio and turns a tap on one of its controls
 * into a transport command. It answers `hover` and `open` in the same shape
 * `phoneApps.js` does, and is reached through it — `index.js` sends every click on the
 * phone to `phoneApps.js`, which hands the ones that landed on the card over here.
 *
 * One `<audio>` element for the lot rather than one per track: only one plays at a time,
 * and swapping `src` is what a phone does when you skip. Nothing ever autoplays — every
 * path to `play()` starts at a click, which is the only thing browsers will honour.
 *
 * The three tracks are Kevin MacLeod's, under CC BY 4.0 (see the README); they live in
 * `public/audio/` re-encoded at 96 kbps, which is about a third of the download for music
 * coming out of a 7 cm phone.
 */

const TRACKS = [
  {
    file: 'audio/almostNew.mp3',
    title: 'almost new',
    artist: 'kevin macleod',
    mark: 'moon',
    art: ['#f4ead6', '#b39a6f'],
  },
  {
    file: 'audio/lobbyTime.mp3',
    title: 'lobby time',
    artist: 'kevin macleod',
    mark: 'disc',
    art: ['#ece7da', '#99a08b'],
  },
  {
    file: 'audio/coolVibes.mp3',
    title: 'cool vibes',
    artist: 'kevin macleod',
    mark: 'wave',
    art: ['#e2e9e1', '#8dae9d'],
  },
];

/** Where the volume starts, and what a tap on one of the speaker glyphs moves it by. */
const START_VOLUME = 0.6;
const VOLUME_STEP = 0.1;

/** Past this many seconds, ⏪ restarts the track instead of stepping back to the one before. */
const RESTART_AFTER = 3;

/** How far a control lifts off the glass under the pointer — the app icons' own lift. */
const LIFT = 0.0012;

export function setupPhonePlayer(card) {
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = START_VOLUME;
  card.setVolume(START_VOLUME);

  let index = 0;
  /** Whether the *user* has started playback, so a skip carries on rather than stopping. */
  let wanted = false;

  const load = (next, autoplay) => {
    index = (next + TRACKS.length) % TRACKS.length;
    const track = TRACKS[index];
    card.setTrack(track);
    audio.src = track.file;
    card.setProgress(0, 0);
    if (autoplay) start();
    else card.setPlaying(false);
  };

  const start = () => {
    wanted = true;
    // A rejected play is not a failure worth throwing over — a tab that has never been
    // clicked simply stays paused, and the glyph has to say so.
    audio.play().then(
      () => card.setPlaying(true),
      () => { wanted = false; card.setPlaying(false); }
    );
  };

  const pause = () => {
    wanted = false;
    audio.pause();
    card.setPlaying(false);
  };

  audio.addEventListener('timeupdate', () => card.setProgress(audio.currentTime, audio.duration));
  audio.addEventListener('loadedmetadata', () => card.setProgress(audio.currentTime, audio.duration));
  audio.addEventListener('ended', () => load(index + 1, wanted));

  load(0, false);

  const setVolume = (value) => {
    audio.volume = Math.max(0, Math.min(1, value));
    card.setVolume(audio.volume);
    return `Now playing — volume ${Math.round(audio.volume * 100)}%`;
  };

  /** The control mesh a hit belongs to, or null when the tap missed the card. */
  const controlFor = (object) => {
    for (let node = object; node; node = node.parent) {
      if (node.name && card.controls.has(node.name)) return node;
      if (node === card.group) break;
    }
    return null;
  };

  let lifted = null;
  const restY = new Map();

  const hover = (object) => {
    const control = object && controlFor(object);
    if (control === lifted) return Boolean(control);
    if (lifted) lifted.position.y = restY.get(lifted);
    lifted = control ?? null;
    if (lifted) {
      if (!restY.has(lifted)) restY.set(lifted, lifted.position.y);
      lifted.position.y = restY.get(lifted) + LIFT;
    }
    return Boolean(control);
  };

  const reset = () => hover(null);

  /**
   * Acts on a tap. Returns the line for the HUD, or null when the tap landed off the card
   * — which is what lets `phoneApps.js` carry on and try the app tiles with it.
   */
  const open = (object, hit) => {
    const control = object && controlFor(object);
    if (!control) return null;
    const track = TRACKS[index];
    const playingLine = `Now playing — ${track.title}, ${track.artist}`;

    switch (control.name) {
      case 'iphone-player-play':
      case 'iphone-player-art':
        if (audio.paused) start();
        else pause();
        return audio.paused ? `Paused — ${track.title}` : playingLine;

      case 'iphone-player-next':
        load(index + 1, wanted);
        return `Now playing — ${TRACKS[index].title}, ${TRACKS[index].artist}`;

      case 'iphone-player-prev':
        // The phone's own rule: back once to the top of this track, back again to the
        // one before it.
        if (audio.currentTime > RESTART_AFTER) {
          audio.currentTime = 0;
          return playingLine;
        }
        load(index - 1, wanted);
        return `Now playing — ${TRACKS[index].title}, ${TRACKS[index].artist}`;

      case 'iphone-player-progress': {
        const bar = card.bars.get(control.name);
        if (!hit?.point || !Number.isFinite(audio.duration)) return playingLine;
        audio.currentTime = bar.fractionAt(hit.point) * audio.duration;
        card.setProgress(audio.currentTime, audio.duration);
        return playingLine;
      }

      case 'iphone-player-volume': {
        const bar = card.bars.get(control.name);
        if (!hit?.point) return playingLine;
        return setVolume(bar.fractionAt(hit.point));
      }

      case 'iphone-player-volume-down':
        return setVolume(audio.volume - VOLUME_STEP);

      case 'iphone-player-volume-up':
        return setVolume(audio.volume + VOLUME_STEP);

      // The AirPlay button is drawn because the widget has one; there is nothing in a
      // browser to hand the audio to, so it says as much rather than doing nothing.
      case 'iphone-player-airplay':
        return 'AirPlay — no other device in the room';

      default:
        return playingLine;
    }
  };

  return { hover, reset, open };
}
