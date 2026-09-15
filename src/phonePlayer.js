import * as THREE from 'three';

/**
 * The Now Playing card on the iPhone's screen — the iOS media widget, built the way the
 * rest of the phone is: rounded slabs and canvas-textured panels, no imported artwork.
 *
 * It occupies the empty upper half of the home screen, under the Dynamic Island; the app
 * row and the dock below it are untouched. This module owns only what the card *looks*
 * like and how it is redrawn — which track is playing, and what a tap does, belong to
 * `src/resume/phonePlayer.js`, which drives the API returned here.
 *
 * The control meshes' names are load-bearing in the same way the app tiles' are: they are
 * the only handle `resume/phonePlayer.js` has on which part of the card was tapped, and
 * `iphone-player-progress` / `iphone-player-volume` are also the planes a seek is measured
 * across. Every control is a plane rather than a solid — a raycast does not test alpha, so
 * a transparent tile is a touch target of exactly the size it is drawn at.
 *
 * Everything here is written in the phone body's own frame, where the screen's top is +z
 * and — because the body carries a half turn — the screen's *left* is +x. The `LEFT` and
 * `RIGHT` constants below are there so that has to be got right once rather than at every
 * position: a part on the screen's left has a positive x.
 */

const TEXT_FONT = '"Avenir Next", "Futura", "Helvetica Neue", Helvetica, sans-serif';

/** The card, and the margin the parts keep inside it. */
const CARD_W = 0.058;
const CARD_L = 0.046;
const CARD_Z = 0.0305;          // its middle, measured up the screen
const PAD = 0.004;

const TOP = CARD_Z + CARD_L / 2;
const LEFT = CARD_W / 2 - PAD;    // in x, and the screen's left is +x
const RIGHT = -LEFT;

/**
 * Ink on glass: white, the way iOS sets type on its Liquid Glass widgets — the card is a
 * translucent pane over the wallpaper now, and dark ink has nothing to sit on.
 */
const INK = '#f6f4ef';
const INK_DIM = 'rgba(246, 244, 239, 0.62)';

/** The glass itself and its lens edge, shared by the card and every disc on it. */
const GLASS_FILL = 'rgba(255, 255, 255, 0.28)';
const GLASS_RIM = 'rgba(255, 255, 255, 0.95)';
const GLASS_RIM_FADE = 'rgba(255, 255, 255, 0.18)';

/**
 * Builds the card into `parent` (the phone's body group) and returns the handful of
 * setters the behaviour layer needs.
 */
export function buildPhonePlayer(parent, { screenY }) {
  const group = new THREE.Group();
  group.name = 'iphone-player';
  parent.add(group);

  // Stacked in the order they are drawn, a fraction of a millimetre apart, so nothing
  // z-fights on a panel this thin.
  const Y = {
    card: screenY + 0.00010,
    art: screenY + 0.00025,
    text: screenY + 0.00035,
    knob: screenY + 0.00045,
    hit: screenY + 0.00060,
  };

  // ---- the card itself ---------------------------------------------------
  // A pane of Liquid Glass: a mostly transparent wash with a bright lens edge, drawn on
  // a canvas so the rim and the highlight can fade the way light across glass does. The
  // wallpaper reads through it; real refraction would be a render pass for a 6 cm card
  // over a plane a tenth of a millimetre behind it, and the dock fakes it the same way.
  //
  // Translucent, so it no longer writes depth — and everything laid on it is translucent
  // too, so the distance sort between them is a coin toss at a third of a millimetre
  // apart. `renderOrder` settles it below: the card first, everything on it after.
  const card = canvasPanel(group, CARD_W, CARD_L, 1024, 812, 'iphone-player-card');
  card.mesh.position.set(0, Y.card, CARD_Z);
  card.mesh.material.roughness = 0.6;
  card.mesh.material.emissiveIntensity = 0.4;
  card.mesh.material.alphaTest = 0;
  drawGlass(card, { radius: 0.08 });

  // ---- artwork, top left -------------------------------------------------
  const ART = 0.0115;
  const artX = LEFT - ART / 2;
  const artZ = TOP - PAD - ART / 2;
  const art = canvasPanel(group, ART, ART, 512, 512, 'iphone-player-art');
  art.mesh.position.set(artX, Y.art, artZ);

  // ---- device line, title, artist ----------------------------------------
  // One column to the right of the artwork, ending short of the download disc.
  const textLeft = artX - ART / 2 - 0.0035;
  const textRight = RIGHT + 0.0075;
  const textW = textLeft - textRight;
  const textX = (textLeft + textRight) / 2;

  const device = textPanel(group, textW, 1024, 200, 'iphone-player-device');
  device.mesh.position.set(textX, Y.text, artZ + 0.0037);
  device.draw('iPhone', { px: 96, weight: 500, fill: INK_DIM });

  const title = textPanel(group, textW, 1024, 220, 'iphone-player-title');
  title.mesh.position.set(textX, Y.text, artZ + 0.0002);

  const artist = textPanel(group, textW, 1024, 200, 'iphone-player-artist');
  artist.mesh.position.set(textX, Y.text, artZ - 0.0034);

  // ---- download, top right — where the widget keeps AirPlay -----------------
  const download = canvasPanel(group, 0.0072, 0.0072, 256, 256, 'iphone-player-download');
  // Inside the padding: the screen's right is -x, so *in* from RIGHT is +x.
  download.mesh.position.set(RIGHT + 0.0036, Y.art, artZ);
  drawDisc(download, ICONS.download);

  // ---- the progress bar and its times ------------------------------------
  const BAR_Z = artZ - ART / 2 - 0.0045;
  const progress = bar(group, {
    name: 'iphone-player-progress', width: CARD_W - PAD * 2, z: BAR_Z, Y,
    knobColor: 0x1c1a17, knobR: 0.00075,
  });

  const elapsed = textPanel(group, 0.016, 512, 200, 'iphone-player-elapsed');
  elapsed.mesh.position.set(LEFT - 0.008, Y.text, BAR_Z - 0.0032);
  const remaining = textPanel(group, 0.016, 512, 200, 'iphone-player-remaining');
  remaining.mesh.position.set(RIGHT + 0.008, Y.text, BAR_Z - 0.0032);

  // ---- transport ---------------------------------------------------------
  const TRANSPORT_Z = BAR_Z - 0.0100;
  const prev = canvasPanel(group, 0.0105, 0.0105, 256, 256, 'iphone-player-prev');
  prev.mesh.position.set(0.0125, Y.art, TRANSPORT_Z);
  drawDisc(prev, ICONS.prev);

  const play = canvasPanel(group, 0.0115, 0.0115, 256, 256, 'iphone-player-play');
  play.mesh.position.set(0, Y.art, TRANSPORT_Z);

  const next = canvasPanel(group, 0.0105, 0.0105, 256, 256, 'iphone-player-next');
  next.mesh.position.set(-0.0125, Y.art, TRANSPORT_Z);
  drawDisc(next, ICONS.next);

  // ---- volume ------------------------------------------------------------
  const VOLUME_Z = TRANSPORT_Z - 0.0115;
  const quiet = canvasPanel(group, 0.0058, 0.0058, 256, 256, 'iphone-player-volume-down');
  quiet.mesh.position.set(0.0248, Y.art, VOLUME_Z);
  // The speakers sit at the ends of a slider, not in a row of buttons: no disc.
  drawIcon(quiet, ICONS.quiet, { fit: 0.75 });

  const loud = canvasPanel(group, 0.0062, 0.0062, 256, 256, 'iphone-player-volume-up');
  loud.mesh.position.set(-0.0248, Y.art, VOLUME_Z);
  drawIcon(loud, ICONS.loud, { fit: 0.75 });

  const volume = bar(group, {
    name: 'iphone-player-volume', width: 0.039, z: VOLUME_Z, Y,
    knobColor: 0xffffff, knobR: 0.0013,
  });

  // The card under, everything on it over — see the note on the card.
  group.traverse((node) => {
    if (node.isMesh) node.renderOrder = node === card.mesh ? 0 : 1;
  });

  // ---- what the behaviour layer drives -----------------------------------
  let playing = false;
  drawPlayGlyph(play, playing);

  /**
   * The spinner runs on its own frame loop rather than the room's: it is up for a few
   * seconds a session at most, and the card has no other reason to be ticked. Stopping
   * it puts the play glyph back for whatever `playing` says.
   */
  let spinner = 0;
  let spinStart = 0;
  const spin = (now) => {
    drawSpinner(play, (now - spinStart) / 1000);
    spinner = requestAnimationFrame(spin);
  };

  /** The elapsed/remaining pair is a canvas each; only repaint on a whole second. */
  let shownTime = '';

  return {
    group,

    /** The meshes a tap can land on, by the name they were given. */
    controls: new Map([
      ['iphone-player-prev', prev.mesh],
      ['iphone-player-play', play.mesh],
      ['iphone-player-next', next.mesh],
      ['iphone-player-progress', progress.hit],
      ['iphone-player-volume', volume.hit],
      ['iphone-player-volume-down', quiet.mesh],
      ['iphone-player-volume-up', loud.mesh],
      ['iphone-player-download', download.mesh],
      ['iphone-player-art', art.mesh],
    ]),

    /** The bars, so a tap can be turned into a fraction along the one it landed on. */
    bars: new Map([
      ['iphone-player-progress', progress],
      ['iphone-player-volume', volume],
    ]),

    setTrack(track) {
      title.draw(track.title, { px: 110, weight: 700, fill: INK });
      artist.draw(track.artist, { px: 96, weight: 500, fill: INK });
      drawArtwork(art, track);
      shownTime = '';
    },

    setPlaying(value) {
      if (value === playing) return;
      playing = value;
      if (!spinner) drawPlayGlyph(play, playing);
    },

    /** Swaps the ▶/⏸ glyph for a turning arc while the track is buffering. */
    setLoading(value) {
      if (value === Boolean(spinner)) return;
      if (value) {
        spinStart = performance.now();
        spinner = requestAnimationFrame(spin);
      } else {
        cancelAnimationFrame(spinner);
        spinner = 0;
        drawPlayGlyph(play, playing);
      }
    },

    setProgress(current, duration) {
      const total = Number.isFinite(duration) && duration > 0 ? duration : 0;
      progress.set(total ? Math.min(current / total, 1) : 0);
      const line = `${clock(current)}|${total ? `-${clock(total - current)}` : '--:--'}`;
      if (line === shownTime) return;
      shownTime = line;
      const [left, right] = line.split('|');
      elapsed.draw(left, { px: 96, weight: 500, fill: INK_DIM, align: 'left' });
      remaining.draw(right, { px: 96, weight: 500, fill: INK_DIM, align: 'right' });
    },

    setVolume(value) {
      volume.set(clamp01(value));
    },
  };
}

/* ------------------------------------------------------------------------ */

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** m:ss, the way the phone writes it. */
function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A slider: a dark track, a filled part, a knob, and an invisible plane over the lot that
 * is what a tap actually hits — a 0.4 mm line is not a target. `set()` takes 0..1 read
 * from the screen's left, and `fractionAt()` turns a world-space hit back into one.
 */
function bar(parent, { name, width, z, Y, knobColor, knobR }) {
  const trackMat = keep(new THREE.MeshStandardMaterial({
    name: `${name}_track`, color: 0xffffff, roughness: 0.3, metalness: 0,
    emissive: 0xffffff, emissiveIntensity: 0.3,
    transparent: true, opacity: 0.35, depthWrite: false,
  }));
  const fillMat = keep(new THREE.MeshStandardMaterial({
    name: `${name}_fill`, color: 0xffffff, roughness: 0.3, metalness: 0,
    emissive: 0xffffff, emissiveIntensity: 0.9,
  }));
  const knobMat = keep(new THREE.MeshStandardMaterial({
    name: `${name}_knob`, color: 0x0b0e12, roughness: 0.35, metalness: 0,
    emissive: knobColor, emissiveIntensity: knobColor === 0xffffff ? 1.0 : 0.4,
  }));

  const H = 0.0007;
  slab(parent, width, H, 0.0002, H / 2, trackMat, `${name}-track`)
    .position.set(0, Y.art, z);

  const fill = slab(parent, width, H, 0.0002, H / 2, fillMat, `${name}-fill`);
  fill.position.set(0, Y.art + 0.00005, z);

  const knob = new THREE.Mesh(new THREE.CylinderGeometry(knobR, knobR, 0.0003, 20), knobMat);
  knob.name = `${name}-knob`;
  parent.add(knob);
  knob.position.set(0, Y.knob, z);

  // The target: a plane as tall as a fingertip, invisible but still cast against.
  const hit = new THREE.Mesh(
    flat(width + 0.002, 0.0055),
    // Fully transparent *and* alpha-tested: the first makes it invisible, the second
    // keeps it out of the shadow map, which would otherwise lay a dark rectangle across
    // the screen where nothing is drawn.
    keep(new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false, alphaTest: 1,
    }))
  );
  hit.name = name;
  hit.position.set(0, Y.hit, z);
  parent.add(hit);

  const set = (fraction) => {
    const f = clamp01(fraction);
    // The screen's left edge is +x, so the filled part grows towards -x.
    fill.scale.x = Math.max(f, 0.0001);
    fill.position.x = width / 2 - (f * width) / 2;
    knob.position.x = width / 2 - f * width;
  };
  set(0);

  /** Where along the bar a world-space point landed, 0 at its left end. */
  const fractionAt = (point) => {
    const local = hit.worldToLocal(point.clone());
    return clamp01(0.5 - local.x / width);
  };

  return { hit, set, fractionAt };
}

/** A plane lying face-up on the screen, the right way round to be read. */
function flat(w, l) {
  const geo = new THREE.PlaneGeometry(w, l);
  geo.rotateX(-Math.PI / 2);
  geo.rotateY(Math.PI);
  return geo;
}

/**
 * A face-up panel with its own canvas behind it. The glyphs are drawn dark and the map is
 * used as the alpha as well, so what is not drawn is not there — the card shows through.
 */
function canvasPanel(parent, w, l, cw, ch, name) {
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const mat = keep(new THREE.MeshStandardMaterial({
    name: `${name}_mat`, color: 0xffffff, roughness: 0.45, metalness: 0,
    emissive: 0xffffff, emissiveIntensity: 0.75,
    // The canvas's own alpha channel is what makes the tile a cut-out — deliberately
    // *not* an `alphaMap`, which the rest of the phone uses. An alphaMap is read from the
    // green channel, and these glyphs are drawn dark ink on cream: as an alphaMap they
    // would be all but transparent. The map's alpha says what was drawn regardless of
    // what colour it was drawn in.
    //
    // The alpha test is not about how it draws but about the shadow pass, so a tile that
    // is mostly cut-out casts its glyph rather than its square — `prepare()` in
    // `deskApple.js` turns shadows on for every mesh under the phone, this one included.
    map: tex, emissiveMap: tex,
    transparent: true, depthWrite: false, alphaTest: 0.02,
  }));

  const mesh = new THREE.Mesh(flat(w, l), mat);
  mesh.name = name;
  parent.add(mesh);
  return { mesh, canvas, ctx, tex };
}

/**
 * A line of text on such a panel. The canvas is 5:1 or so and the panel's height follows
 * its aspect, so the glyphs are never stretched — the same bargain `iphone15Pro.js` makes
 * with its clock.
 */
function textPanel(parent, w, cw, ch, name) {
  const panel = canvasPanel(parent, w, w * (ch / cw), cw, ch, name);
  panel.draw = (text, { px = 100, weight = 500, fill = INK, align = 'left' } = {}) => {
    const { ctx, canvas, tex } = panel;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${weight} ${px}px ${TEXT_FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fill;
    const x = align === 'left' ? 0 : align === 'right' ? canvas.width : canvas.width / 2;
    ctx.fillText(text, x, canvas.height / 2, canvas.width);
    tex.needsUpdate = true;
  };
  return panel;
}

/**
 * The cover: a wash in the track's own colours with a mark drawn on it. The mark is
 * drawn rather than set as an emoji — a canvas glyph is at the mercy of whatever font
 * the machine has, and this tile is 11 mm across, where a missing one is just a blank
 * square.
 */
function drawArtwork({ ctx, canvas, tex }, track) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);

  rounded(ctx, w, h);

  const wash = ctx.createLinearGradient(0, 0, w, h);
  wash.addColorStop(0, track.art?.[0] ?? '#f3ead8');
  wash.addColorStop(1, track.art?.[1] ?? '#a2937a');
  ctx.fillStyle = wash;
  ctx.fill();
  // The mark is drawn inside the rounded fill, so a stroke that runs wide is trimmed
  // by the corner rather than squaring it off.
  ctx.save();
  ctx.clip();

  ctx.fillStyle = 'rgba(30, 27, 22, 0.8)';
  ctx.strokeStyle = 'rgba(30, 27, 22, 0.8)';
  ctx.lineWidth = w * 0.055;
  ctx.lineCap = 'round';
  MARKS[track.mark ?? 'disc'](ctx, w, h);

  ctx.restore();
  tex.needsUpdate = true;

  // The real cover, painted over the placeholder once it arrives. A track skipped before
  // its image lands must not have that image paint over the next one's tile, so the
  // load is compared against what the tile is showing now before it draws.
  if (!track.cover) return;
  const image = cover(track.cover);
  const paint = () => {
    if (canvas.dataset.track !== track.cover) return;
    ctx.save();
    // The mark left its own path behind, so the tile's corners are traced again.
    rounded(ctx, w, h);
    ctx.clip();
    ctx.drawImage(image, 0, 0, w, h);
    ctx.restore();
    // A hairline of light round the cover, so it sits on the glass like the tiles do.
    rounded(ctx, w, h);
    rim(ctx, w, h, w * 0.012);
    tex.needsUpdate = true;
  };
  canvas.dataset.track = track.cover;
  if (image.complete && image.naturalWidth) paint();
  else image.addEventListener('load', paint, { once: true });
}

/** The tile's outline — a square with rounded corners — as the current path. */
function rounded(ctx, w, h, { radius = w * 0.16, inset = 0 } = {}) {
  const r = radius, x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
}

/** One Image per cover, however many times its track comes round. */
const covers = new Map();
function cover(url) {
  let image = covers.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    covers.set(url, image);
  }
  return image;
}

/**
 * The three covers, each a couple of paths. Which one a track wears is its own `mark`.
 */
const MARKS = {
  /** A crescent, cut by punching a second circle out of the first. */
  moon(ctx, w, h) {
    ctx.beginPath();
    ctx.arc(w * 0.52, h * 0.5, w * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(w * 0.38, h * 0.42, w * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  },
  /** A record: two rings and the label in the middle. */
  disc(ctx, w, h) {
    for (const radius of [0.3, 0.19]) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.06, 0, Math.PI * 2);
    ctx.fill();
  },
  /** Three swells, drawn as arcs of a common centre well below the tile. */
  wave(ctx, w, h) {
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(w / 2, h * 1.05, w * (0.2 + i * 0.16), -Math.PI * 0.78, -Math.PI * 0.22);
      ctx.stroke();
    }
  },
};

/**
 * The control glyphs, as the path data of the SVGs in `public/icons/` (SVG Repo, CC0),
 * all drawn on a 24-unit box. Kept as strings rather than fetched: a `Path2D` from them
 * paints straight onto a tile's canvas in the tile's own ink, with no image to wait on
 * and no white to knock out.
 */
const ICONS = {
  // caret-right-svgrepo-com.svg
  play: [
    'M8 18.75C7.88537 18.7486 7.77256 18.7212 7.67 18.67C7.54453 18.6086 7.43873 18.5133 7.36453 18.3949C7.29032 18.2765 7.25065 18.1397 7.25 18V6.00003C7.25065 5.86031 7.29032 5.72356 7.36453 5.60518C7.43873 5.4868 7.54453 5.3915 7.67 5.33003C7.79355 5.26757 7.93214 5.24102 8.07002 5.25339C8.2079 5.26576 8.33955 5.31657 8.45 5.40003L16.45 11.4C16.5431 11.4699 16.6187 11.5605 16.6708 11.6646C16.7229 11.7688 16.75 11.8836 16.75 12C16.75 12.1165 16.7229 12.2313 16.6708 12.3354C16.6187 12.4396 16.5431 12.5302 16.45 12.6L8.45 18.6C8.32052 18.6981 8.1624 18.7508 8 18.75ZM8.75 7.50003V16.5L14.75 12L8.75 7.50003Z',
  ],
  // pause-svgrepo-com.svg
  pause: [
    'M9 19.75C8.80189 19.7474 8.61263 19.6676 8.47253 19.5275C8.33244 19.3874 8.25259 19.1981 8.25 19V5C8.25 4.80109 8.32902 4.61032 8.46967 4.46967C8.61032 4.32902 8.80109 4.25 9 4.25C9.19891 4.25 9.38968 4.32902 9.53033 4.46967C9.67098 4.61032 9.75 4.80109 9.75 5V19C9.74741 19.1981 9.66756 19.3874 9.52747 19.5275C9.38737 19.6676 9.19811 19.7474 9 19.75Z',
    'M15 19.75C14.8019 19.7474 14.6126 19.6676 14.4725 19.5275C14.3324 19.3874 14.2526 19.1981 14.25 19V5C14.25 4.80109 14.329 4.61032 14.4697 4.46967C14.6103 4.32902 14.8011 4.25 15 4.25C15.1989 4.25 15.3897 4.32902 15.5303 4.46967C15.671 4.61032 15.75 4.80109 15.75 5V19C15.7474 19.1981 15.6676 19.3874 15.5275 19.5275C15.3874 19.6676 15.1981 19.7474 15 19.75Z',
  ],
  // fast-backward-svgrepo-com.svg
  prev: [
    'M20.29 4.31C20.01 4.19 19.69 4.26 19.47 4.47L12.75 11.19V5C12.75 4.7 12.57 4.42 12.29 4.31C12.01 4.19 11.69 4.26 11.47 4.47L4.75 11.19V5C4.75 4.59 4.41 4.25 4 4.25C3.59 4.25 3.25 4.59 3.25 5V19C3.25 19.41 3.59 19.75 4 19.75C4.41 19.75 4.75 19.41 4.75 19V12.81L11.47 19.53C11.61 19.67 11.8 19.75 12 19.75C12.1 19.75 12.19 19.73 12.29 19.69C12.57 19.57 12.75 19.3 12.75 19V12.81L19.47 19.53C19.61 19.67 19.8 19.75 20 19.75C20.1 19.75 20.19 19.73 20.29 19.69C20.57 19.57 20.75 19.3 20.75 19V5C20.75 4.7 20.57 4.42 20.29 4.31ZM11.25 17.19L6.06 12L11.25 6.81V17.19ZM19.25 17.19L14.06 12L19.25 6.81V17.19Z',
  ],
  // fast-forward-svgrepo-com.svg
  next: [
    'M20 4.25C19.59 4.25 19.25 4.59 19.25 5V11.19L12.53 4.47C12.32 4.26 11.99 4.19 11.71 4.31C11.43 4.43 11.25 4.7 11.25 5V11.19L4.53 4.47C4.32 4.26 3.99 4.19 3.71 4.31C3.43 4.43 3.25 4.7 3.25 5V19C3.25 19.3 3.43 19.58 3.71 19.69C3.8 19.73 3.9 19.75 4 19.75C4.2 19.75 4.39 19.67 4.53 19.53L11.25 12.81V19C11.25 19.3 11.43 19.58 11.71 19.69C11.8 19.73 11.9 19.75 12 19.75C12.2 19.75 12.39 19.67 12.53 19.53L19.25 12.81V19C19.25 19.41 19.59 19.75 20 19.75C20.41 19.75 20.75 19.41 20.75 19V5C20.75 4.59 20.41 4.25 20 4.25ZM4.75 17.19V6.81L9.94 12L4.75 17.19ZM12.75 17.19V6.81L17.94 12L12.75 17.19Z',
  ],
  // volume-down-svgrepo-com.svg
  quiet: [
    'M15 19.75C14.8304 19.7472 14.6661 19.6912 14.53 19.59L9.74 15.75H5C4.80189 15.7474 4.61263 15.6676 4.47253 15.5275C4.33244 15.3874 4.25259 15.1981 4.25 15V9C4.25259 8.80189 4.33244 8.61263 4.47253 8.47253C4.61263 8.33244 4.80189 8.25259 5 8.25H9.74L14.53 4.41C14.6406 4.32106 14.7741 4.26533 14.9151 4.24927C15.0561 4.2332 15.1988 4.25747 15.3265 4.31926C15.4543 4.38104 15.5619 4.4778 15.6369 4.5983C15.7118 4.7188 15.751 4.85809 15.75 5V19C15.7491 19.1422 15.7084 19.2814 15.6324 19.4016C15.5563 19.5218 15.4481 19.6182 15.32 19.68C15.2202 19.728 15.1107 19.7519 15 19.75ZM5.75 14.25H10C10.1699 14.2507 10.3349 14.3069 10.47 14.41L14.25 17.41V6.56L10.47 9.56C10.3349 9.6631 10.1699 9.71928 10 9.72H5.75V14.25Z',
    'M18.11 15.38C17.9481 15.3779 17.7908 15.3255 17.66 15.23C17.5812 15.1709 17.5148 15.0969 17.4646 15.0121C17.4144 14.9274 17.3815 14.8336 17.3675 14.7361C17.3536 14.6386 17.359 14.5393 17.3834 14.4439C17.4079 14.3484 17.4509 14.2588 17.51 14.18C17.9869 13.5533 18.2451 12.7875 18.2451 12C18.2451 11.2125 17.9869 10.4467 17.51 9.81999C17.4509 9.7412 17.4079 9.65154 17.3834 9.55613C17.359 9.46072 17.3536 9.36143 17.3675 9.26393C17.3815 9.16643 17.4144 9.07262 17.4646 8.98787C17.5148 8.90313 17.5812 8.82909 17.66 8.76999C17.7388 8.7109 17.8284 8.6679 17.9238 8.64346C18.0193 8.61902 18.1185 8.6136 18.2161 8.62753C18.3136 8.64146 18.4074 8.67446 18.4921 8.72464C18.5769 8.77482 18.6509 8.8412 18.71 8.92C19.3863 9.80432 19.7528 10.8867 19.7528 12C19.7528 13.1133 19.3863 14.1957 18.71 15.08C18.6391 15.172 18.5483 15.2468 18.4444 15.2988C18.3405 15.3507 18.2261 15.3785 18.11 15.38Z',
  ],
  // volume-up-svgrepo-com.svg
  loud: [
    'M13 19.75C12.8304 19.7472 12.6661 19.6912 12.53 19.59L7.74 15.75H3C2.80189 15.7474 2.61263 15.6676 2.47253 15.5275C2.33244 15.3874 2.25259 15.1981 2.25 15V9C2.25259 8.80189 2.33244 8.61263 2.47253 8.47253C2.61263 8.33244 2.80189 8.25259 3 8.25H7.74L12.53 4.41C12.6406 4.32106 12.7741 4.26533 12.9151 4.24927C13.0561 4.2332 13.1988 4.25747 13.3265 4.31926C13.4543 4.38104 13.5619 4.4778 13.6369 4.5983C13.7118 4.7188 13.751 4.85809 13.75 5V19C13.7491 19.1422 13.7084 19.2814 13.6324 19.4016C13.5563 19.5218 13.4481 19.6182 13.32 19.68C13.2202 19.728 13.1107 19.7519 13 19.75ZM3.75 14.25H8C8.16991 14.2507 8.33494 14.3069 8.47 14.41L12.25 17.41V6.56L8.47 9.56C8.33886 9.6739 8.17345 9.74076 8 9.75H3.75V14.25Z',
    'M18.46 18.07C18.2806 18.0697 18.107 18.006 17.97 17.89C17.8945 17.8258 17.8327 17.7472 17.7881 17.6587C17.7436 17.5702 17.7173 17.4736 17.7107 17.3748C17.7042 17.2759 17.7176 17.1768 17.7501 17.0832C17.7826 16.9896 17.8336 16.9035 17.9 16.83C19.0891 15.5022 19.7466 13.7824 19.7466 12C19.7466 10.2176 19.0891 8.49779 17.9 7.16998C17.8344 7.09644 17.7838 7.01069 17.7513 6.91762C17.7188 6.82455 17.7049 6.72599 17.7105 6.62756C17.7161 6.52913 17.741 6.43276 17.7838 6.34395C17.8266 6.25515 17.8865 6.17564 17.96 6.10998C18.0336 6.04432 18.1193 5.99379 18.2124 5.96127C18.3054 5.92875 18.404 5.91488 18.5024 5.92045C18.6009 5.92602 18.6972 5.95093 18.786 5.99374C18.8749 6.03656 18.9544 6.09644 19.02 6.16998C20.4578 7.76752 21.2534 9.84072 21.2534 11.99C21.2534 14.1392 20.4578 16.2124 19.02 17.81C18.9518 17.8921 18.8662 17.9581 18.7693 18.0031C18.6724 18.048 18.5668 18.0709 18.46 18.07Z',
    'M16.11 15.38C15.9481 15.3779 15.7908 15.3255 15.66 15.23C15.5009 15.1107 15.3957 14.933 15.3675 14.7361C15.3394 14.5392 15.3906 14.3391 15.51 14.18C15.9869 13.5533 16.2451 12.7875 16.2451 12C16.2451 11.2125 15.9869 10.4467 15.51 9.82C15.3906 9.66087 15.3394 9.46085 15.3675 9.26393C15.3957 9.06702 15.5009 8.88935 15.66 8.77C15.8191 8.65065 16.0191 8.59941 16.2161 8.62754C16.413 8.65567 16.5906 8.76087 16.71 8.92C17.3863 9.80433 17.7528 10.8867 17.7528 12C17.7528 13.1133 17.3863 14.1957 16.71 15.08C16.6391 15.172 16.5483 15.2468 16.4444 15.2988C16.3405 15.3507 16.2262 15.3785 16.11 15.38Z',
  ],
  // download-svgrepo-com.svg
  download: [
    'M18.22 20.75H5.78C5.43322 20.7359 5.09262 20.6535 4.77771 20.5075C4.4628 20.3616 4.17975 20.155 3.94476 19.8996C3.70977 19.6442 3.52745 19.3449 3.40824 19.019C3.28903 18.693 3.23525 18.3468 3.25 18V15C3.25 14.8011 3.32902 14.6103 3.46967 14.4697C3.61033 14.329 3.80109 14.25 4 14.25C4.19892 14.25 4.38968 14.329 4.53033 14.4697C4.67099 14.6103 4.75 14.8011 4.75 15V18C4.72419 18.2969 4.81365 18.5924 4.99984 18.8251C5.18602 19.0579 5.45465 19.21 5.75 19.25H18.22C18.5154 19.21 18.784 19.0579 18.9702 18.8251C19.1564 18.5924 19.2458 18.2969 19.22 18V15C19.22 14.8011 19.299 14.6103 19.4397 14.4697C19.5803 14.329 19.7711 14.25 19.97 14.25C20.1689 14.25 20.3597 14.329 20.5003 14.4697C20.641 14.6103 20.72 14.8011 20.72 15V18C20.75 18.6954 20.5041 19.3744 20.0359 19.8894C19.5677 20.4045 18.9151 20.7137 18.22 20.75Z',
    'M12 15.75C11.9015 15.7504 11.8038 15.7312 11.7128 15.6934C11.6218 15.6557 11.5392 15.6001 11.47 15.53L7.47 11.53C7.33752 11.3878 7.2654 11.1997 7.26882 11.0054C7.27225 10.8111 7.35096 10.6258 7.48838 10.4883C7.62579 10.3509 7.81118 10.2722 8.00548 10.2688C8.19978 10.2654 8.38782 10.3375 8.53 10.47L12 13.94L15.47 10.47C15.6122 10.3375 15.8002 10.2654 15.9945 10.2688C16.1888 10.2722 16.3742 10.3509 16.5116 10.4883C16.649 10.6258 16.7277 10.8111 16.7312 11.0054C16.7346 11.1997 16.6625 11.3878 16.53 11.53L12.53 15.53C12.4608 15.6001 12.3782 15.6557 12.2872 15.6934C12.1962 15.7312 12.0985 15.7504 12 15.75Z',
    'M12 15.75C11.8019 15.7474 11.6126 15.6676 11.4725 15.5275C11.3324 15.3874 11.2526 15.1981 11.25 15V4C11.25 3.80109 11.329 3.61032 11.4697 3.46967C11.6103 3.32902 11.8011 3.25 12 3.25C12.1989 3.25 12.3897 3.32902 12.5303 3.46967C12.671 3.61032 12.75 3.80109 12.75 4V15C12.7474 15.1981 12.6676 15.3874 12.5275 15.5275C12.3874 15.6676 12.1981 15.7474 12 15.75Z',
  ],
};

/**
 * Paints one of `ICONS` centred on a tile. `fit` is how much of the tile the 24-unit box
 * spans — under 1 leaves air around the glyph, which these tiles want: they are sized
 * as touch targets, and a glyph filling one reads as heavy on a 6 cm screen.
 */
function drawIcon({ ctx, canvas, tex }, paths, { fit = 1, fill = INK, clear = true } = {}) {
  const { width: w, height: h } = canvas;
  if (clear) ctx.clearRect(0, 0, w, h);
  const scale = (w / 24) * fit;
  ctx.save();
  ctx.translate(w / 2 - 12 * scale, h / 2 - 12 * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = fill;
  for (const d of paths) ctx.fill(new Path2D(d));
  ctx.restore();
  tex.needsUpdate = true;
}

/** ▶ / ⏸ — whichever the tap would *do*, the way a phone shows it. */
function drawPlayGlyph(panel, playing) {
  drawDisc(panel, playing ? ICONS.pause : ICONS.play);
}

/** A three-quarter arc turning once a second, on the play tile's disc. */
function drawSpinner({ ctx, canvas, tex }, seconds) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  disc(ctx, w, h);
  const from = seconds * Math.PI * 2;
  ctx.strokeStyle = INK;
  ctx.lineWidth = w * 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.26, from, from + Math.PI * 1.5);
  ctx.stroke();
  tex.needsUpdate = true;
}

/**
 * Every button on the card: a glass disc with the glyph set into it in the card's ink. `fit` is the glyph's 24-unit box as a
 * share of the tile; the disc itself fills the tile.
 */
function drawDisc(panel, paths, { fit = 0.45 } = {}) {
  const { ctx, canvas } = panel;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  disc(ctx, w, h);
  drawIcon(panel, paths, { fit, fill: INK, clear: false });
}

/** The glass disc under every glyph: the card's own wash and lens edge, round. */
function disc(ctx, w, h) {
  const r = w * 0.47;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = GLASS_FILL;
  ctx.fill();
  // A touch more light in the upper half, where a curved surface faces the sky.
  const sheen = ctx.createLinearGradient(0, h / 2 - r, 0, h / 2 + r);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  sheen.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fill();
  rim(ctx, w, h, w * 0.018);
}

/**
 * The lens edge: the current path stroked with a light that is bright at the top-left,
 * where the room's lamp would catch a glass edge, and all but gone at the bottom-right.
 */
function rim(ctx, w, h, width) {
  const edge = ctx.createLinearGradient(0, 0, w, h);
  edge.addColorStop(0, GLASS_RIM);
  edge.addColorStop(0.5, GLASS_RIM_FADE);
  edge.addColorStop(1, 'rgba(255, 255, 255, 0.55)');
  ctx.strokeStyle = edge;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * The card's pane: a rounded rect of glass wash, a highlight down from the top edge, a
 * shade up from the bottom, and the lens edge. `radius` is the corner as a share of the
 * canvas's width.
 */
function drawGlass({ ctx, canvas, tex }, { radius }) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const inset = w * 0.004;
  const path = () => rounded(ctx, w, h, { radius: w * radius, inset });
  path();
  ctx.fillStyle = GLASS_FILL;
  ctx.fill();
  const light = ctx.createLinearGradient(0, 0, 0, h);
  light.addColorStop(0, 'rgba(255, 255, 255, 0.26)');
  light.addColorStop(0.35, 'rgba(255, 255, 255, 0)');
  light.addColorStop(0.85, 'rgba(0, 0, 0, 0)');
  light.addColorStop(1, 'rgba(0, 0, 0, 0.10)');
  ctx.fillStyle = light;
  ctx.fill();
  path();
  rim(ctx, w, h, inset * 1.5);
  tex.needsUpdate = true;
}

/**
 * A rounded-rectangle slab lying flat, centred on its own origin — `iphone15Pro.js`'s
 * `slab()`, kept local so this module can be dropped in without threading helpers through.
 */
function slab(parent, w, l, t, r, mat, name) {
  const s = new THREE.Shape();
  const hw = w / 2, hl = l / 2, rr = Math.min(r, hw, hl);
  s.moveTo(-hw + rr, -hl);
  s.lineTo(hw - rr, -hl);
  s.quadraticCurveTo(hw, -hl, hw, -hl + rr);
  s.lineTo(hw, hl - rr);
  s.quadraticCurveTo(hw, hl, hw - rr, hl);
  s.lineTo(-hw + rr, hl);
  s.quadraticCurveTo(-hw, hl, -hw, hl - rr);
  s.lineTo(-hw, -hl + rr);
  s.quadraticCurveTo(-hw, -hl, -hw + rr, -hl);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 8 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -t / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

/** These colours are authored, not inherited — `darkenScene()` must not re-tint them. */
function keep(material) {
  material.userData.keepColor = true;
  return material;
}
