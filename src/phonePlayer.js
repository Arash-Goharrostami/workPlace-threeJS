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

/** Ink on a lit cream card: dark glyphs, drawn on the canvases themselves. */
const INK = '#26241f';
const INK_DIM = 'rgba(38, 36, 31, 0.55)';

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
  // Opaque, and the one part of the card that writes depth. Everything laid on it is a
  // transparent panel, and transparent panels are sorted by distance — at a third of a
  // millimetre apart that sort is a coin toss, and a translucent card that lands *after*
  // the title paints over it. Solid, it is drawn in the opaque pass and the panels above
  // it simply pass the depth test.
  const cardMat = keep(new THREE.MeshStandardMaterial({
    name: 'iphone_player_card', color: 0x0b0e12, roughness: 0.5, metalness: 0,
    emissive: 0xe8e1d2, emissiveIntensity: 0.95,
  }));
  slab(group, CARD_W, CARD_L, 0.0002, 0.0045, cardMat, 'iphone-player-card')
    .position.set(0, Y.card, CARD_Z);

  // ---- artwork, top left -------------------------------------------------
  const ART = 0.0115;
  const artX = LEFT - ART / 2;
  const artZ = TOP - PAD - ART / 2;
  const art = canvasPanel(group, ART, ART, 512, 512, 'iphone-player-art');
  art.mesh.position.set(artX, Y.art, artZ);

  // ---- device line, title, artist ----------------------------------------
  // One column to the right of the artwork, ending short of the AirPlay disc.
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

  // ---- AirPlay, top right ------------------------------------------------
  const airplay = canvasPanel(group, 0.0072, 0.0072, 256, 256, 'iphone-player-airplay');
  airplay.mesh.position.set(RIGHT - 0.0036, Y.art, artZ);
  drawAirPlay(airplay);

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
  drawSkip(prev, -1);

  const play = canvasPanel(group, 0.0115, 0.0115, 256, 256, 'iphone-player-play');
  play.mesh.position.set(0, Y.art, TRANSPORT_Z);

  const next = canvasPanel(group, 0.0105, 0.0105, 256, 256, 'iphone-player-next');
  next.mesh.position.set(-0.0125, Y.art, TRANSPORT_Z);
  drawSkip(next, 1);

  // ---- volume ------------------------------------------------------------
  const VOLUME_Z = TRANSPORT_Z - 0.0115;
  const quiet = canvasPanel(group, 0.0058, 0.0058, 256, 256, 'iphone-player-volume-down');
  quiet.mesh.position.set(0.0248, Y.art, VOLUME_Z);
  drawSpeaker(quiet, 1);

  const loud = canvasPanel(group, 0.0062, 0.0062, 256, 256, 'iphone-player-volume-up');
  loud.mesh.position.set(-0.0248, Y.art, VOLUME_Z);
  drawSpeaker(loud, 3);

  const volume = bar(group, {
    name: 'iphone-player-volume', width: 0.039, z: VOLUME_Z, Y,
    knobColor: 0xffffff, knobR: 0.0013,
  });

  // ---- what the behaviour layer drives -----------------------------------
  let playing = false;
  drawPlayGlyph(play, playing);

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
      ['iphone-player-airplay', airplay.mesh],
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
      drawPlayGlyph(play, playing);
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
    name: `${name}_track`, color: 0x0b0e12, roughness: 0.5, metalness: 0,
    emissive: 0x4a463d, emissiveIntensity: 0.5,
  }));
  const fillMat = keep(new THREE.MeshStandardMaterial({
    name: `${name}_fill`, color: 0x0b0e12, roughness: 0.5, metalness: 0,
    emissive: 0x1c1a17, emissiveIntensity: 0.35,
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

  const r = w * 0.16;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();

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

/** ▶ or ❚❚, the one glyph on the card that changes with the state rather than the track. */
function drawPlayGlyph({ ctx, canvas, tex }, playing) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = INK;
  if (playing) {
    const bw = w * 0.15, gap = w * 0.1, top = h * 0.2, bh = h * 0.6;
    ctx.fillRect(w / 2 - gap / 2 - bw, top, bw, bh);
    ctx.fillRect(w / 2 + gap / 2, top, bw, bh);
  } else {
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.2);
    ctx.lineTo(w * 0.34, h * 0.8);
    ctx.lineTo(w * 0.76, h * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  tex.needsUpdate = true;
}

/** ⏪ / ⏩: two triangles pointing the way `dir` does (-1 back, 1 on). */
function drawSkip({ ctx, canvas, tex }, dir) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = INK;
  const tri = (cx) => {
    const half = w * 0.17;
    ctx.beginPath();
    ctx.moveTo(cx - dir * half, h * 0.24);
    ctx.lineTo(cx - dir * half, h * 0.76);
    ctx.lineTo(cx + dir * half, h * 0.5);
    ctx.closePath();
    ctx.fill();
  };
  tri(w * 0.5 - dir * w * 0.16);
  tri(w * 0.5 + dir * w * 0.16);
  tex.needsUpdate = true;
}

/** A speaker with `waves` arcs beside it — one for the quiet end, three for the loud. */
function drawSpeaker({ ctx, canvas, tex }, waves) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = w * 0.055;
  ctx.lineCap = 'round';

  const bx = w * 0.16;
  ctx.beginPath();
  ctx.moveTo(bx, h * 0.4);
  ctx.lineTo(bx + w * 0.1, h * 0.4);
  ctx.lineTo(bx + w * 0.26, h * 0.2);
  ctx.lineTo(bx + w * 0.26, h * 0.8);
  ctx.lineTo(bx + w * 0.1, h * 0.6);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < waves; i += 1) {
    ctx.beginPath();
    ctx.arc(bx + w * 0.26, h * 0.5, w * (0.16 + i * 0.13), -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
  }
  tex.needsUpdate = true;
}

/** The AirPlay disc: a grey button with the triangle and its arcs cut into it. */
function drawAirPlay({ ctx, canvas, tex }) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);

  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.47, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(60, 57, 50, 0.55)';
  ctx.fill();

  ctx.strokeStyle = '#f4f0e6';
  ctx.lineWidth = w * 0.05;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.62, w * (0.13 + i * 0.11), -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.5);
  ctx.lineTo(w * 0.68, h * 0.78);
  ctx.lineTo(w * 0.32, h * 0.78);
  ctx.closePath();
  ctx.fillStyle = '#f4f0e6';
  ctx.fill();
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
