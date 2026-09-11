import * as THREE from 'three';
import { buildPhonePlayer } from './phonePlayer.js';

/**
 * The iPhone 15 Pro, ported from the WorkDesk3D project — the one prop here built in
 * code rather than loaded from a file. Apple's published dimensions, 146.6 x 70.6 x
 * 8.25 mm, lying face-up with its long axis along z.
 *
 * Three things changed in the port, all forced by this project:
 *
 * - its images live under `textures/iphone/` here, so the paths come from TEXTURE_DIR
 *   rather than being page-root-relative;
 * - it imports `three` directly instead of taking it as an argument;
 * - every material it builds is marked `keepColor`, because `darkenScene()` would
 *   otherwise tint the titanium and, worse, the lit screen.
 *
 * It is also the only thing in this scene that repaints on a timer: the status-bar
 * clock is redrawn when the minute actually rolls over.
 *
 * Run `npm run apple` to (re-)copy the wallpaper and the icon art.
 */

/** Where `npm run apple` puts the wallpaper and the icons. */
const TEXTURE_DIR = 'textures/iphone/';

export const IPHONE_W = 0.0706;    // across the phone
export const IPHONE_H = 0.1466;    // along it
export const IPHONE_D = 0.00825;   // and its thickness, the body alone
const CORNER_R = 0.0095;           // the rounded corners of the band
const BEZEL = 0.0018;              // the 15 Pro's thin, even bezel
const BUMP_H = 0.0015;             // how far the camera plateau stands proud
const BUMP = 0.0355;               // and how big it is, square

// Face-up, the phone rests on its camera plateau, not on its back — so the
// body sits a plateau's height off the ground and nothing sinks through it.
export const IPHONE_LIFT = BUMP_H;
export const IPHONE_TOTAL_D = IPHONE_D + BUMP_H;

// The face everything drawn on the screen uses — geometric rather than the
// system default.
const TEXT_FONT = '"Avenir Next", "Futura", "Helvetica Neue", Helvetica, sans-serif';

export function buildIphone15Pro() {
  const root = new THREE.Group();
  root.name = 'iphone-15-pro';

  const M = {
    titanium: new THREE.MeshStandardMaterial({ name: 'iphone_titanium', color: 0x8c8781, roughness: 0.38, metalness: 0.85 }),
    backGlass: new THREE.MeshStandardMaterial({ name: 'iphone_back_glass', color: 0x6f6b66, roughness: 0.62, metalness: 0.25 }),
    screen: new THREE.MeshStandardMaterial({ name: 'iphone_screen_glass', color: 0x08090b, roughness: 0.07, metalness: 0.1 }),
    island: new THREE.MeshStandardMaterial({ name: 'iphone_dynamic_island', color: 0x000000, roughness: 0.3, metalness: 0 }),
    lensRing: new THREE.MeshStandardMaterial({ name: 'iphone_lens_ring', color: 0x9a958e, roughness: 0.3, metalness: 0.9 }),
    lensGlass: new THREE.MeshStandardMaterial({ name: 'iphone_lens_glass', color: 0x0a0d12, roughness: 0.06, metalness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ name: 'iphone_dark_trim', color: 0x141517, roughness: 0.5, metalness: 0.2 }),
    flash: new THREE.MeshStandardMaterial({ name: 'iphone_flash', color: 0xd8c9a8, roughness: 0.35, metalness: 0.1 }),
    // The screen on, showing the wallpaper from assets/. It is set as the
    // emissive map as well as the colour map, so the picture lights itself
    // instead of going dark wherever the scene lights don't reach.
    display: new THREE.MeshStandardMaterial({
      name: 'iphone_display_on', color: 0x000000, roughness: 0.15, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: 0.42,
    }),
    // The dock: heavily frosted glass over the wallpaper — the picture is only
    // a suggestion of colour through it, not a view of it. Cloudier and
    // greyer than a tinted pane: the opacity does most of the work, and the
    // emissive is kept low so it stays a milky panel rather than a lit one.
    dock: new THREE.MeshStandardMaterial({
      name: 'iphone_dock', color: 0x8b98a8, roughness: 0.75, metalness: 0.04,
      emissive: 0x39424f, emissiveIntensity: 0.35,
      transparent: true, opacity: 0.78, depthWrite: false,
    }),
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

  // ---- the titanium band, the full thickness -----------------------------
  // One brushed piece rather than the Jolla's frame-plus-swappable-cover: on
  // this phone there is no seam to show, the band runs from the front glass
  // right round to the back.
  slab(IPHONE_W, IPHONE_H, IPHONE_D, CORNER_R, M.titanium, 'iphone-frame', body)
    .position.y = IPHONE_D / 2;

  // The matte back glass, inset inside the band, and the front glass, inset a
  // little more. Both panes are given real thickness rather than a hairline,
  // so they read as glass from the side and their wireframe twins show an
  // edge, and each stands PROUD of the band — the screen a touch above the
  // frame's top edge, the back glass the same below its bottom one — so the
  // glass catches the light instead of disappearing into the titanium.
  const BACK_T = 0.0016;
  const GLASS_T = 0.0016;
  const PROUD = 0.0004;
  slab(IPHONE_W - 0.0012, IPHONE_H - 0.0012, BACK_T, CORNER_R - 0.0006,
    M.backGlass, 'iphone-back', body).position.y = BACK_T / 2 - PROUD;

  const glass = slab(IPHONE_W - 0.003, IPHONE_H - 0.003, GLASS_T, CORNER_R - 0.0015,
    M.screen, 'iphone-screen', body);
  glass.position.y = IPHONE_D - GLASS_T / 2 + PROUD;

  // ---- the lit display ---------------------------------------------------
  const DISPLAY_W = IPHONE_W - 0.003 - BEZEL * 2;
  const DISPLAY_L = IPHONE_H - 0.003 - BEZEL * 2;
  const display = slab(DISPLAY_W, DISPLAY_L, 0.0003, CORNER_R - 0.0025,
    M.display, 'iphone-display', body);
  display.position.y = IPHONE_D + PROUD + 0.00015;

  // The wallpaper. An extruded shape's UVs are its own coordinates in meters,
  // so the texture has to be scaled down to the panel's size and re-centred to
  // land on it once, right way up, instead of tiling.
  const wallpaper = new THREE.TextureLoader().load(TEXTURE_DIR + 'PhoneWallpaper.jpg');
  wallpaper.colorSpace = THREE.SRGBColorSpace;
  wallpaper.wrapS = THREE.ClampToEdgeWrapping;
  wallpaper.wrapT = THREE.ClampToEdgeWrapping;
  // The centre stays at the origin: three.js subtracts it from the raw UVs
  // *before* the repeat scales them, and these UVs are in meters, so a 0.5
  // centre would shift the image half a meter across a 7 cm panel. Scaling
  // about the origin and then offsetting by a half is what actually lands the
  // whole picture on the screen.
  wallpaper.center.set(0, 0);
  wallpaper.repeat.set(1 / DISPLAY_W, 1 / DISPLAY_L);
  wallpaper.offset.set(0.5, 0.5);
  // The shape's y becomes -z when the slab is laid down, so the image arrives
  // end-for-end; a half turn puts the top of the picture at the top of the
  // phone.
  wallpaper.rotation = Math.PI;
  M.display.map = wallpaper;
  M.display.emissiveMap = wallpaper;
  M.display.needsUpdate = true;

  // ---- the dock, along the bottom of the panel ---------------------------
  const DOCK_L = 0.0164;                 // the bar's depth, front to back
  const DOCK_INSET = 0.0028;             // and how far it sits off the bottom
  const ICON = 0.0108;
  const ICON_GAP = 0.0036;
  const SCREEN_Y = IPHONE_D + PROUD + 0.0004;

  const DOCK_R = 0.0034;                 // a soft rounding, not a full pill
  const dock = slab(ICON * 4 + ICON_GAP * 5, DOCK_L, 0.0002, DOCK_R,
    M.dock, 'iphone-dock', body);
  const dockZ = -(DISPLAY_L / 2) + DOCK_INSET + DOCK_L / 2;
  dock.position.set(0, SCREEN_Y, dockZ);

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
      // tile and offset by a half — the same trap as the wallpaper above.
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
  // About 11 mm down from the phone's top edge, where it actually sits.
  const ISLAND_Z = IPHONE_H / 2 - 0.011;
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
    c.shadowBlur = px * 0.32;
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

  // ---- camera plateau, on the back (pointing down, face-up) --------------
  const plateau = slab(BUMP, BUMP, BUMP_H, 0.009, M.backGlass,
    'iphone-camera-plateau', body);
  plateau.position.set(-(IPHONE_W / 2 - BUMP / 2 - 0.005), -BUMP_H / 2,
    IPHONE_H / 2 - BUMP / 2 - 0.005);

  // The three lenses in their triangle on the plateau, each a titanium ring
  // around dark glass, standing proud of it.
  const LENS = [
    { name: 'main', x: -0.0105, z: 0.0105, r: 0.0072 },
    { name: 'ultrawide', x: -0.0105, z: -0.0105, r: 0.0072 },
    { name: 'telephoto', x: 0.0105, z: 0.0105, r: 0.0072 },
  ];
  LENS.forEach(({ name, x, z, r }) => {
    const ring = add(new THREE.CylinderGeometry(r, r, 0.0016, 24), M.lensRing,
      `iphone-lens-${name}`, body);
    ring.position.set(plateau.position.x + x, -BUMP_H - 0.0008,
      plateau.position.z + z);
    const lensGlass = add(new THREE.CylinderGeometry(r - 0.0018, r - 0.0018, 0.0018, 24),
      M.lensGlass, `iphone-lens-${name}-glass`, body);
    lensGlass.position.set(ring.position.x, -BUMP_H - 0.0012, ring.position.z);
  });

  // The flash and the LiDAR scanner, on the plateau's free corner.
  const flash = add(new THREE.CylinderGeometry(0.0028, 0.0028, 0.0006, 16), M.flash,
    'iphone-flash', body);
  flash.position.set(plateau.position.x + 0.0105, -BUMP_H - 0.0003,
    plateau.position.z - 0.0045);
  const lidar = add(new THREE.CylinderGeometry(0.0022, 0.0022, 0.0006, 16), M.dark,
    'iphone-lidar', body);
  lidar.position.set(plateau.position.x + 0.0105, -BUMP_H - 0.0003,
    plateau.position.z - 0.0135);

  // ---- side buttons ------------------------------------------------------
  // Each is a shallow bar standing just proud of the band. The Action button
  // and the volume pair are on the left, the power button on the right.
  const button = (name, side, z, len) => {
    const b = add(new THREE.BoxGeometry(0.0012, 0.0032, len), M.titanium,
      `iphone-button-${name}`, body);
    b.position.set(side * (IPHONE_W / 2 + 0.0004), IPHONE_D / 2, z);
    return b;
  };
  button('action', -1, IPHONE_H / 2 - 0.031, 0.0085);
  button('volume-up', -1, IPHONE_H / 2 - 0.048, 0.0125);
  button('volume-down', -1, IPHONE_H / 2 - 0.065, 0.0125);
  button('power', 1, IPHONE_H / 2 - 0.052, 0.0245);

  // ---- USB-C, centred on the bottom edge ---------------------------------
  // The real port is a stadium: its short ends are half-circles, not corners.
  // slab() rounds a shape lying flat, and this one stands up in the phone's
  // end, so the rounded rectangle is drawn here in the x-y plane and extruded
  // straight into the body along z — radius half the height, which is what
  // turns the ends into semicircles rather than just softening them.
  const USB_W = 0.0092, USB_H = 0.0028, USB_DEPTH = 0.0018;
  const usbShape = new THREE.Shape();
  const uhw = USB_W / 2, uhh = USB_H / 2, ur = uhh;
  usbShape.moveTo(-uhw + ur, -uhh);
  usbShape.lineTo(uhw - ur, -uhh);
  usbShape.quadraticCurveTo(uhw, -uhh, uhw, 0);
  usbShape.quadraticCurveTo(uhw, uhh, uhw - ur, uhh);
  usbShape.lineTo(-uhw + ur, uhh);
  usbShape.quadraticCurveTo(-uhw, uhh, -uhw, 0);
  usbShape.quadraticCurveTo(-uhw, -uhh, -uhw + ur, -uhh);
  usbShape.closePath();
  const usbGeo = new THREE.ExtrudeGeometry(usbShape, {
    depth: USB_DEPTH, bevelEnabled: false, curveSegments: 8,
  });
  // Extruded along +z from the shape's plane; pull it back half its depth so
  // the port is centred on its own origin like every other part here.
  usbGeo.translate(0, 0, -USB_DEPTH / 2);
  const usb = add(usbGeo, M.dark, 'iphone-usb-c', body);
  usb.position.set(0, IPHONE_D / 2, -(IPHONE_H / 2 - 0.0006));

  return root;
}

/** These colours are authored, not inherited — darkenScene() must not re-tint them. */
function keep(material) {
  material.userData.keepColor = true;
  return material;
}
