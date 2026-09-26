import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { buildPhonePlayer, glassPanel } from './phonePlayer.js';

/**
 * The iPhone 15 Pro Max on the desk. The body (titanium band, back glass, camera
 * plateau, buttons, port) is the imported `iphone15ProMax.glb`; the lit screen on top
 * of it is still built in code, because it is live: a clock that follows the machine's,
 * app tiles the resume taps and the Now Playing card.
 *
 * Everything drawn on the screen is marked `keepColor`, and so is every material the
 * model brings, because `darkenScene()` would otherwise tint the titanium and, worse,
 * the lit screen.
 *
 * The wallpaper is the model's own. Run `npm run apple` to (re-)copy the icon art.
 */

/** Where `npm run apple` puts the icons. */
const TEXTURE_DIR = 'textures/iphone/';

export const MODEL_URL = 'models/iphone15ProMax.glb';

// The model is authored in centimetres, lying on its back with its length along +y
// (top end up), its screen facing −z. The numbers below are measured off it.
const MODEL_SCALE = 0.01;
const MODEL_BACK_Z = 0.413;        // the back glass
const MODEL_SCREEN = { w: 7.128, l: 15.403 };   // the model's own display panel
const MODEL_ISLAND_Y = 7.21;       // the Dynamic Island's centre
// The display's material, the phone's own wallpaper: node names do not survive the
// shrink, material names do.
const MODEL_DISPLAY_MATERIAL = 'pIJKfZsazmcpEiU';
const MODEL_COVER_GLASS = 'zFdeDaGNRwzccye';

export const IPHONE_W = 0.0768;    // across the phone
export const IPHONE_H = 0.1595;    // along it
export const IPHONE_D = 0.0103;    // back glass to screen glass
const CORNER_R = 0.0095;           // the rounded corners of the screen
const BUMP_H = 0.0020;             // how far the camera plateau stands proud

// Face-up, the phone rests on its camera plateau, not on its back — so the
// body sits a plateau's height off the ground and nothing sinks through it.
export const IPHONE_LIFT = BUMP_H;
export const IPHONE_TOTAL_D = IPHONE_D + BUMP_H;

// The face everything drawn on the screen uses — geometric rather than the
// system default.
const TEXT_FONT = '"Avenir Next", "Futura", "Helvetica Neue", Helvetica, sans-serif';

export async function buildIphone15Pro() {
  const root = new THREE.Group();
  root.name = 'iphone-15-pro-max';
  const gltf = await loadGLB(MODEL_URL);

  const M = {
    island: new THREE.MeshStandardMaterial({ name: 'iphone_dynamic_island', color: 0x000000, roughness: 0.3, metalness: 0 }),
    lensGlass: new THREE.MeshStandardMaterial({ name: 'iphone_lens_glass', color: 0x0a0d12, roughness: 0.06, metalness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ name: 'iphone_dark_trim', color: 0x141517, roughness: 0.5, metalness: 0.2 }),
    // The page indicator's dots: the same self-lit white the status bar's
    // glyphs use, and a dimmed one for the pages you are not on.
    pageDot: new THREE.MeshStandardMaterial({
      name: 'iphone_page_dot', color: 0x0b0e12, roughness: 0.35, metalness: 0,
      emissive: 0xf2f6fb, emissiveIntensity: 1.0,
    }),
    pageDotDim: new THREE.MeshStandardMaterial({
      name: 'iphone_page_dot_dim', color: 0x0b0e12, roughness: 0.35, metalness: 0,
      emissive: 0x5b6470, emissiveIntensity: 0.7,
    }),
    // The status bar's glyphs: white-ish and self-lit, like the rest of the UI.
    status: new THREE.MeshStandardMaterial({
      name: 'iphone_status', color: 0x0b0e12, roughness: 0.35, metalness: 0,
      emissive: 0xdfe7f0, emissiveIntensity: 0.9,
    }),
    // The empty part of the battery: the same glyph colour, dimmed right down.
    statusDim: new THREE.MeshStandardMaterial({
      name: 'iphone_status_dim', color: 0x0b0e12, roughness: 0.35, metalness: 0,
      emissive: 0x33404f, emissiveIntensity: 0.7,
    }),
  };

  // Everything here is an authored colour or a lit panel; darkenScene() must not
  // tint any of it.
  Object.values(M).forEach(keep);

  const add = (geo, mat, name, parent = root) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    parent.add(m);
    return m;
  };

  // A rounded-rectangle slab lying flat: `w` across (x), `l` along (z), `t`
  // thick (y), plan corners radiused by `r`, centred on its own origin. Same
  // ExtrudeGeometry trick the other objects use.
  function slab(w, l, t, r, mat, name, parent = root) {
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
    // The extrusion runs along +z and rotating it down puts the slab at
    // y = 0..t; pull it back half its thickness so it is centred.
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -t / 2, 0);
    return add(geo, mat, name, parent);
  }

  // The body sits on the camera plateau; everything below is written in the
  // phone's own coordinates, y = 0 at the back glass.
  const body = new THREE.Group();
  body.position.y = IPHONE_LIFT;
  // The parts below are all written with the phone's top end at +z, which is
  // the side the default camera sits on — so from it the phone read upside
  // down, dock at the top of the view and camera at the bottom. A half turn
  // here points the top end away from the camera and leaves every part's own
  // arithmetic alone.
  body.rotation.y = Math.PI;
  root.add(body);

  // ---- the imported body -------------------------------------------------
  // Turned a quarter about x so its top end runs along +z and its screen faces up,
  // then lifted so the back glass lands on y = 0 like the rest of this frame.
  const model = gltf.scene;
  model.name = 'iphone-model';
  model.scale.setScalar(MODEL_SCALE);
  model.rotation.x = Math.PI / 2;
  model.position.y = MODEL_BACK_Z * MODEL_SCALE;
  model.traverse((node) => {
    if (!node.isMesh) return;
    [].concat(node.material).forEach(keep);
    // The screen's cover glass is see-through and glossy: it carried the lamp
    // across the display as a white blob. The display under it is the surface.
    if (node.material.name === MODEL_COVER_GLASS) node.visible = false;
    // The model's own display is the wallpaper: the phone's default, lit by
    // its emissive map so it does not go dark where the room's lights miss it.
    if (node.material.name === MODEL_DISPLAY_MATERIAL) {
      node.material.roughness = 0.9;
      node.material.metalness = 0;
      node.material.emissive.set(0xffffff);
      node.material.emissiveIntensity = 0.7;
    }
  });
  body.add(model);

  // The face of the screen glass: everything drawn on the display stacks up from it.
  const SCREEN_TOP = IPHONE_D;

  // The screen's drawable area; the wallpaper under it is the model's own.
  const DISPLAY_W = MODEL_SCREEN.w * MODEL_SCALE;
  const DISPLAY_L = MODEL_SCREEN.l * MODEL_SCALE;

  // ---- the dock, along the bottom of the panel ---------------------------
  const DOCK_L = 0.0164;                 // the bar's depth, front to back
  const DOCK_INSET = 0.0028;             // and how far it sits off the bottom
  const ICON = 0.0108;
  // The Pro Max home screen's grid: four columns of 64 pt icons across 440 pt,
  // about 34 pt apart.
  const ICON_GAP = 0.0055;
  const SCREEN_Y = SCREEN_TOP + 0.0004;

  const DOCK_R = 0.0034;                 // a soft rounding, not a full pill
  const DOCK_W = ICON * 4 + ICON_GAP * 3 + 0.006;
  const dockZ = -(DISPLAY_L / 2) + DOCK_INSET + DOCK_L / 2;
  // Liquid Glass, drawn by the same pane the Now Playing card is. Transparent like
  // the icons on it, so it is drawn first and they after.
  const dock = glassPanel(body, DOCK_W, DOCK_L, DOCK_R / DOCK_W, 'iphone-dock').mesh;
  dock.position.set(0, SCREEN_Y - 0.0001, dockZ);
  dock.renderOrder = 0;

  // ---- the page indicator, just above the dock ---------------------------
  // iOS's row of dots, one per home screen page, the current page's dot lit
  // and the rest dimmed. This phone has a single page — the one on screen —
  // so the row is one lit dot, and PAGES is all it takes to add more.
  const PAGES = 1;
  const CURRENT_PAGE = 0;
  const DOT_R = 0.00042;
  const DOT_GAP = 0.0016;              // centre to centre
  const dotsZ = dockZ + DOCK_L / 2 + 0.0032;
  for (let i = 0; i < PAGES; i += 1) {
    const dot = add(new THREE.CylinderGeometry(DOT_R, DOT_R, 0.0002, 16),
      i === CURRENT_PAGE ? M.pageDot : M.pageDotDim,
      `iphone-page-dot-${i + 1}`, body);
    dot.position.set((i - (PAGES - 1) / 2) * DOT_GAP, SCREEN_Y + 0.0001, dotsZ);
  }

  // The artwork in assets/icons/, in the order it reads on screen from the
  // left. The body carries a half turn, so the row runs back to front against
  // the model's own x — index 1 is the rightmost tile, which is why this list
  // is the on-screen order reversed.
  const ICON_ART = [
    'Phone_iOS.png',
    'Message_iOS.png',
    'Telegram_iOS.png',
    'Instagram_iOS.png',
  ].reverse();

  // Some of the files carry transparent padding around the artwork, which
  // leaves those tiles looking smaller than the rest. Rather than trimming the
  // files, each one is measured on load and cropped to the box its opaque
  // pixels actually occupy — so any icon dropped in here fills its tile,
  // padded or not.
  function loadIconTexture(url, mat) {
    const img = new Image();
    img.onload = () => {
      const full = document.createElement('canvas');
      full.width = img.width;
      full.height = img.height;
      const fc = full.getContext('2d');
      fc.drawImage(img, 0, 0);
      const { data } = fc.getImageData(0, 0, img.width, img.height);

      let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
      for (let y = 0; y < img.height; y += 1) {
        for (let x = 0; x < img.width; x += 1) {
          if (data[(y * img.width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      // A fully opaque file has nothing to trim; use it whole.
      if (maxX < 0) { minX = 0; minY = 0; maxX = img.width - 1; maxY = img.height - 1; }

      const w = maxX - minX + 1, h = maxY - minY + 1;
      const cropped = document.createElement('canvas');
      cropped.width = w;
      cropped.height = h;
      cropped.getContext('2d').drawImage(full, minX, minY, w, h, 0, 0, w, h);

      const tex = new THREE.CanvasTexture(cropped);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      // Extruded UVs are the shape's own meters, so the art is scaled to the
      // tile and offset by a half, or it lands half a meter off the tile.
      tex.center.set(0, 0);
      tex.repeat.set(1 / ICON, 1 / ICON);
      tex.offset.set(0.5, 0.5);
      tex.rotation = Math.PI;

      mat.map = tex;
      mat.emissiveMap = tex;
      mat.needsUpdate = true;
    };
    img.src = url;
  }

  ICON_ART.forEach((url, i) => {
    const mat = keep(new THREE.MeshStandardMaterial({
      name: `iphone_icon_${i + 1}`, color: 0x000000, roughness: 0.35, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: 0.95, transparent: true,
    }));
    loadIconTexture(TEXTURE_DIR + url, mat);
    // Centred as a row: four tiles and the gaps between them, laid out from
    // the middle so the dock stays symmetric whatever the sizes above are.
    const x = (i - 1.5) * (ICON + ICON_GAP);
    const icon = slab(ICON, ICON, 0.0002, 0.0028, mat, `iphone-dock-icon-${i + 1}`, body);
    icon.position.set(x, SCREEN_Y + 0.0001, dockZ);
    icon.renderOrder = 1;
  });

  // ---- the Dynamic Island ------------------------------------------------
  // A pill floating on the lit panel, clear of the bezel — the 15 Pro's whole
  // tell, and where the Jolla has a notch cut into the top edge of its screen.
  // It is a thin rounded slab rather than a capsule solid: a capsule reads as
  // a dome from any angle off straight down. Its corner radius is half its
  // depth, which is what makes the ends properly round.
  const ISLAND_W = 0.0254;
  const ISLAND_L = 0.0078;
  const ISLAND_TOP_Y = SCREEN_Y;
  const island = slab(ISLAND_W, ISLAND_L, 0.0004, ISLAND_L / 2, M.island,
    'iphone-dynamic-island', body);
  // Right over the model's own island.
  const ISLAND_Z = MODEL_ISLAND_Y * MODEL_SCALE;
  island.position.set(0, ISLAND_TOP_Y, ISLAND_Z);

  // The front camera in one end of the pill and the Face ID dot in the other,
  // both sunk just below its face so they read as holes in it.
  const frontCam = add(new THREE.CylinderGeometry(0.0016, 0.0016, 0.0004, 20),
    M.lensGlass, 'iphone-front-camera', body);
  frontCam.position.set(0.0076, ISLAND_TOP_Y + 0.0002, ISLAND_Z);
  const faceId = add(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0004, 16),
    M.dark, 'iphone-face-id', body);
  faceId.position.set(-0.0074, ISLAND_TOP_Y + 0.0002, ISLAND_Z);

  // ---- home screen row, on the wallpaper itself --------------------------
  // Four more apps sitting straight on the background — no dock behind them —
  // each with its name underneath. Same tile size and spacing as the dock, so
  // the two rows line up with each other.
  const HOME_APPS = [
    { file: 'Github_iOS.png', label: 'GitHub' },
    { file: 'Gmail_iOS.png', label: 'Gmail' },
    { file: 'Linkedin_iOS.png', label: 'LinkedIn' },
    { file: 'Whatsapp_iOS.png', label: 'WhatsApp' },
  ].reverse();   // on-screen order reversed, as the dock's list is

  // Just above the dock.
  const HOME_Z = dockZ + 0.026;
  const LABEL_W = ICON * 1.7;

  // The names: centred under their tile, drawn to a canvas like the clock is,
  // with the same shadow so they hold up over a bright patch of wallpaper.
  function labelPanel(text, x, z, name) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const c = canvas.getContext('2d');
    const px = 58;
    c.font = `500 ${px}px ${TEXT_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    const draw = () => c.fillText(text, canvas.width / 2, canvas.height / 2);
    c.shadowColor = 'rgba(0, 0, 0, 0.85)';
    c.shadowBlur = px * 0.22;
    draw();
    draw();
    c.shadowBlur = 0;
    draw();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = keep(new THREE.MeshStandardMaterial({
      name: `iphone_${name}`, color: 0x000000, roughness: 0.4, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: 1.0,
      map: tex, emissiveMap: tex, alphaMap: tex,
      transparent: true, depthWrite: false,
    }));
    // The panel's height follows the canvas's aspect, so the text is never
    // stretched (see the clock).
    const geo = new THREE.PlaneGeometry(LABEL_W, LABEL_W * (canvas.height / canvas.width));
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI);
    const mesh = add(geo, mat, name, body);
    mesh.position.set(x, SCREEN_Y + 0.0002, z);
    return mesh;
  }

  HOME_APPS.forEach(({ file, label }, i) => {
    const mat = keep(new THREE.MeshStandardMaterial({
      name: `iphone_home_icon_${i + 1}`, color: 0x000000, roughness: 0.35, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: 0.95, transparent: true,
    }));
    loadIconTexture(TEXTURE_DIR + file, mat);
    const x = (i - 1.5) * (ICON + ICON_GAP);
    const icon = slab(ICON, ICON, 0.0002, 0.0028, mat,
      `iphone-home-icon-${i + 1}`, body);
    icon.position.set(x, SCREEN_Y + 0.0001, HOME_Z);
    labelPanel(label, x, HOME_Z - ICON / 2 - 0.0022, `iphone-home-label-${i + 1}`);
  });

  // ---- the status bar clock ----------------------------------------------
  // Drawn to a canvas and mapped onto a flat panel — the same trick the walnut
  // grain in js/objects/laptop-stand.js and the chair's mesh weave use, since
  // there is no font in the scene to extrude. The canvas is redrawn in place
  // on a timer, so the phone shows the machine's own clock rather than a
  // baked-in time.
  const clockText = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };
  // Text drawn to a canvas is hung off one edge of its panel, TEXT_SIDE
  // picking which.
  // How far the panel's outer edge sits off the screen's: small, so the clock
  // sits well out towards the corner rather than crowding the island.
  const TEXT_INSET = 0.0012;
  const TEXT_SIDE = 1;            // -1 puts the block back on the other side

  // `align` is the glyphs' place inside the panel: the status-bar clock is
  // centred in its short panel so it sits square in the strip beside the
  // island, where a left-hung line would drift towards the screen's edge.
  function textPanel(px, weight, w, z, name, read, align = 'left') {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 512;
    const c = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;

    const paint = () => {
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.font = `${weight} ${px}px ${TEXT_FONT}`;
      c.textAlign = align;
      c.textBaseline = 'middle';
      // A drop shadow cast down and to the right, then a soft halo right under
      // the glyphs: the wallpaper behind them is busy and bright in places, and
      // white on white is hard to read. The text is drawn once per shadow and
      // then once clean on top, so the shadows stay behind the letters.
      c.fillStyle = '#ffffff';
      const text = read();
      const drawX = align === 'center' ? canvas.width / 2 : 24;
      const draw = () => c.fillText(text, drawX, canvas.height / 2);

      c.shadowColor = 'rgba(0, 0, 0, 0.85)';
      c.shadowBlur = px * 0.2;
      c.shadowOffsetX = px * 0.07;
      c.shadowOffsetY = px * 0.085;
      draw();
      // The offset shadow twice over: canvas caps a single pass at the
      // shadow's own alpha, so drawing it again is what actually deepens it.
      draw();

      c.shadowOffsetX = 0;
      c.shadowOffsetY = 0;
      c.shadowColor = 'rgba(0, 0, 0, 0.85)';
      c.shadowBlur = px * 0.38;
      draw();
      draw();

      c.shadowBlur = 0;
      draw();
      tex.needsUpdate = true;
    };
    paint();

    const mat = keep(new THREE.MeshStandardMaterial({
      name: `iphone_${name}`, color: 0x000000, roughness: 0.4, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: 1.0,
      map: tex, emissiveMap: tex, alphaMap: tex,
      transparent: true, depthWrite: false,
    }));
    // The panel's height follows the canvas's own aspect rather than being
    // given: the glyphs are stretched by exactly the mismatch between the two.
    const geo = new THREE.PlaneGeometry(w, w * (canvas.height / canvas.width));
    // Laid flat the panel arrives turned end-for-end; a half turn about the
    // vertical puts the text back the right way round. It is a rotation, not a
    // mirror, so the glyphs stay readable rather than coming out backwards.
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI);
    const mesh = add(geo, mat, name, body);
    mesh.position.set(TEXT_SIDE * (DISPLAY_W / 2 - TEXT_INSET - w / 2),
      SCREEN_Y + 0.0002, z);
    return paint;
  }

  // The time lives in the status bar, in the strip of screen left of the
  // Dynamic Island — the corner iOS puts it in — so it is a short, small panel
  // on the island's own baseline rather than the big lock-screen block. Its
  // width is what sizes the glyphs: the canvas aspect fixes the panel's height
  // to a quarter of it, so a narrower panel is a smaller clock.
  const CLOCK_W = 0.021;
  const repaintClock = textPanel(300, 600, CLOCK_W, ISLAND_Z,
    'iphone-clock', clockText, 'center');
  // Checked once a second but only redrawn when the time it would draw has
  // actually changed — so the minute rolls over within a second of the real
  // one, without repainting a big canvas every tick.
  let shownClock = clockText();
  setInterval(() => {
    const nowClock = clockText();
    if (nowClock !== shownClock) {
      shownClock = nowClock;
      repaintClock();
    }
  }, 1000);

  // ---- status bar, in the panel's top corner -----------------------------
  // Signal bars and a battery, on the strip of screen beside the island. The
  // row is laid out right-to-left and then flipped across the panel by MIRROR,
  // so which corner it lives in is one sign rather than a rewrite, and its
  // whole size is the one STATUS_S factor.
  const STATUS_S = 0.7;                          // everything scaled down
  const MIRROR = -1;                             // 1 puts it back on the right
  const STATUS_Y = SCREEN_Y + 0.0001;
  const STATUS_EDGE = DISPLAY_W / 2 - 0.003;     // inset from the panel's edge
  const STATUS_BASE = ISLAND_Z - 0.0015;         // the glyphs' common baseline

  // The battery: a dim shell with a lit fill inside it and a cap on the end.
  const BATT_W = 0.0074 * STATUS_S, BATT_L = 0.0036 * STATUS_S;
  const battShell = slab(BATT_W, BATT_L, 0.0002, 0.0005, M.statusDim,
    'iphone-status-battery', body);
  const battX = STATUS_EDGE - BATT_W / 2;
  battShell.position.set(MIRROR * battX, STATUS_Y, STATUS_BASE + BATT_L / 2);

  const FILL = 0.62;                             // how full it is drawn
  const fillTrack = BATT_W - 0.0008;
  const fill = slab(fillTrack * FILL, BATT_L - 0.0008, 0.0002, 0.00025,
    M.status, 'iphone-status-battery-fill', body);
  // Filling from the left end, so the empty part is at the cap end.
  fill.position.set(MIRROR * (battX - fillTrack * (1 - FILL) / 2),
    STATUS_Y + 0.0001, STATUS_BASE + BATT_L / 2);

  const cap = add(new THREE.BoxGeometry(0.0005, 0.0002, 0.001), M.statusDim,
    'iphone-status-battery-cap', body);
  cap.position.set(MIRROR * (battX + BATT_W / 2 + 0.00025), STATUS_Y,
    STATUS_BASE + BATT_L / 2);

  // Four signal bars stepping up beside the battery, on the same baseline so
  // their tops make the staircase.
  const BAR_W = 0.0008 * STATUS_S, BAR_GAP = 0.0005 * STATUS_S;
  const BAR_L = [0.0012, 0.0018, 0.0024, 0.003].map((l) => l * STATUS_S);
  const barsRight = battX - BATT_W / 2 - 0.0018;
  BAR_L.forEach((len, i) => {
    // The tallest bar is the one nearest the battery.
    const x = barsRight - (BAR_L.length - 1 - i) * (BAR_W + BAR_GAP);
    const bar = slab(BAR_W, len, 0.0002, 0.0002, M.status,
      `iphone-status-signal-${i + 1}`, body);
    bar.position.set(MIRROR * x, STATUS_Y, STATUS_BASE + len / 2);
  });

  // ---- the Now Playing card ---------------------------------------------
  // The iOS media widget, filling the empty screen between the island and the app row.
  // Its parts are in `phonePlayer.js`; what it plays is in `resume/phonePlayer.js`, which
  // finds the card through the handle left on the root here.
  root.userData.player = buildPhonePlayer(body, { screenY: SCREEN_Y });

  return root;
}

/** These colours are authored, not inherited — darkenScene() must not re-tint them. */
function keep(material) {
  material.userData.keepColor = true;
  return material;
}
