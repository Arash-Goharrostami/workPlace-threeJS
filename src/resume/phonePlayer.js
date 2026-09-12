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
 * The three tracks live in `public/audio/` re-encoded at 96 kbps with their tags stripped
 * — about 40% of what they arrived as, and inaudibly different coming out of a 7 cm phone.
 * The originals are in `tmp/originals/audio/`; the title and artist on each card are what
 * the file's own tags said, and the cover is the art those tags carried, pulled out to
 * `public/audio/covers/` at 256² so it shows before the track itself is fetched. The
 * `mark` and `art` pair is what the tile shows until it arrives, or if it never does.
 * `filename` is what the download button saves the track as — the on-card lowercase is
 * a style, not a name for a file.
 *
 * Nothing is fetched until ▶ is tapped (`preload = 'metadata'`), so the first press on a
 * track is a download. The card shows that: `setLoading` swaps the glyph for a spinner
 * from the moment the browser starts waiting on data until sound is actually coming out,
 * so a tap that takes three seconds to answer reads as *loading*, not *ignored*.
 */

const TRACKS = [
  {
    file: 'audio/noSurprises.mp3',
    cover: 'audio/covers/noSurprises.jpg',
    filename: "No Surprises - Juliana Chahayed.mp3",
    title: 'no surprises',
    artist: 'juliana chahayed',
    mark: 'moon',
    art: ['#f4ead6', '#b39a6f'],
  },
  {
    file: 'audio/youreAllIWant.mp3',
    cover: 'audio/covers/youreAllIWant.jpg',
    filename: "You're All I Want - Cigarettes After Sex.mp3",
    title: "you're all i want",
    artist: 'cigarettes after sex',
    mark: 'disc',
    art: ['#ece7da', '#99a08b'],
  },
  {
    file: 'audio/iDontKnowYouAnymore.mp3',
    cover: 'audio/covers/iDontKnowYouAnymore.jpg',
    filename: "i don't know you anymore - sombr.mp3",
    title: "i don't know you anymore",
    artist: 'sombr',
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

  // The spinner is up whenever playback is wanted and the element is starved: from the
  // `play()` that starts a fetch, through any mid-track stall, until `playing` — the
  // one event that means sound is out. A pause or a failed load takes it down too.
  const starved = () => wanted && (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
  const relay = () => card.setLoading(starved());
  for (const type of ['loadstart', 'waiting', 'stalled', 'playing', 'canplay', 'pause', 'error', 'emptied']) {
    audio.addEventListener(type, relay);
  }

  const start = () => {
    wanted = true;
    // A rejected play is not a failure worth throwing over — a tab that has never been
    // clicked simply stays paused, and the glyph has to say so.
    card.setLoading(starved());
    audio.play().then(
      () => card.setPlaying(true),
      () => { wanted = false; card.setPlaying(false); card.setLoading(false); }
    );
  };

  const pause = () => {
    wanted = false;
    audio.pause();
    card.setPlaying(false);
    card.setLoading(false);
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
        if (!wanted) return `Paused — ${track.title}`;
        return starved() ? `Loading — ${track.title}` : playingLine;

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

      // Where the widget keeps AirPlay: there is no other device in a browser to hand
      // the audio to, so the button saves the track instead — a download link clicked
      // for the user, the same way the CV goes out (`sheetPrompt.js`).
      case 'iphone-player-download': {
        const link = document.createElement('a');
        link.href = track.file;
        link.setAttribute('download', track.filename);
        document.body.append(link);
        link.click();
        link.remove();
        return `Downloading — ${track.title}`;
      }

      default:
        return playingLine;
    }
  };

  return { hover, reset, open };
}
