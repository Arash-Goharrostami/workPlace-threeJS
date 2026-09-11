import * as THREE from 'three';
import { MAIN_DISPLAY_ANCHOR } from './proDisplay.js';

/**
 * A HomePod mini in space grey, standing on the monitor riser beside the display.
 *
 * Built in code rather than imported, like `iphone15Pro.js` and for the same reason:
 * the product is a truncated sphere wrapped in acoustic mesh with a lit glass cap, and
 * that is a lathe and two canvases — nothing a downloaded model would tell us that
 * Apple's own published dimensions do not.
 *
 * Those dimensions are 84.3 mm tall by 97.9 mm across, which is 8.43 x 9.79 in this
 * scene's centimetres. **The silhouette falls out of the pair**: a sphere of that
 * diameter cut flat top and bottom to that height leaves a cap of radius
 *
 *     √(R² − (H/2)²) = √(4.895² − 4.215²) ≈ 2.49
 *
 * — a top face just under 5 cm across, which is what the real one has. So the profile is
 * derived from the two numbers rather than eyeballed, and correcting either corrects the
 * whole shape.
 *
 * Every material here is marked `keepColor`, because `darkenScene()` would otherwise
 * tint the fabric and, worse, the lit touch panel — the same guard the iPhone carries.
 */

/** Apple's published size, in this scene's centimetres. */
export const HOMEPOD_W = 9.79;
export const HOMEPOD_H = 8.43;

const R = HOMEPOD_W / 2;
const HALF_H = HOMEPOD_H / 2;

/** Where the sphere is cut: the radius of the flat the top and the bottom are left with. */
const CAP_R = Math.sqrt(R * R - HALF_H * HALF_H);

/** The silicone foot at the bottom, which the fabric stops short of. */
const FOOT_H = 0.25;

/**
 * How far the touch panel sinks below the top face. It spans the whole of the cut — the
 * panel is not a coaster laid on the top, it *is* the top, and anything less than the
 * full cap radius leaves a ring of open shell to see down through.
 */
const DISH_DROP = 0.12;
const DISH_R = CAP_R;

/** Segments around the lathe and up its profile — a speaker this round shows facets. */
const AROUND = 72;
const ALONG = 48;

/** The space grey the mesh fabric is woven in, and the thread that catches the light. */
const FABRIC = '#3a3a3e';
const THREAD = '#4d4d53';
const SHADE = '#2a2a2e';

/**
 * How many times the weave repeats around the body and up it. The pair is not free: the
 * body is ~30.7 cm around and ~9.6 cm over the arc, so a ratio near 3.2 keeps the threads
 * square rather than stretching them into stripes up the sides.
 *
 * Coarser than the real cloth on purpose. At life size the mesh is under a millimetre and
 * lands inside a pixel from anywhere but nose-to-the-glass, where it turns to noise; this
 * is the density that still reads as woven at the distance the room is actually seen from.
 */
const WEAVE = { around: 16, along: 5 };

export function buildHomePodMini() {
  const root = new THREE.Group();
  root.name = 'homepod-mini';

  const weave = weaveTexture();

  const M = {
    // The acoustic mesh: the weave as both the colour and the bump that keeps it from
    // reading as a printed picture of cloth.
    //
    // **Not** as the roughness map as well, however tempting the one canvas is. A
    // roughness map is read off its green channel and *multiplies* the material's own
    // value, so a dark grey picture of fabric asks for roughness 0.95 x 0.23 — and the
    // speaker came back as a polished glass ball with the room reflected in it.
    fabric: keep(new THREE.MeshStandardMaterial({
      name: 'homepod_mesh', color: 0xffffff, roughness: 0.95, metalness: 0,
      map: weave.map, bumpMap: weave.map, bumpScale: 0.05,
    })),
    // The moulded base it stands on: matte, unreflective, a shade darker than the mesh.
    foot: keep(new THREE.MeshStandardMaterial({
      name: 'homepod_foot', color: 0x232326, roughness: 0.9, metalness: 0,
    })),
    // The recessed touch panel, under glass. Nearly black and nearly smooth, so it picks
    // up the room as a highlight rather than as a picture.
    glass: keep(new THREE.MeshStandardMaterial({
      name: 'homepod_touch_glass', color: 0x0b0c0e, roughness: 0.14, metalness: 0.05,
    })),
  };

  // ---- the body ----------------------------------------------------------
  // The sphere's own arc, sampled between the two cuts. The fabric stops on the foot at
  // the bottom and turns over the rim at the top, which is where the panel sits.
  const profile = [];
  for (let i = 0; i <= ALONG; i += 1) {
    const y = FOOT_H + (HOMEPOD_H - FOOT_H) * (i / ALONG);
    profile.push(new THREE.Vector2(radiusAt(y), y));
  }
  const body = add(new THREE.LatheGeometry(profile, AROUND), M.fabric, 'homepod-body', root);
  body.geometry.computeVertexNormals();

  // ---- the foot ----------------------------------------------------------
  // A short taper rather than a disc: the underside of a sphere cut flat is a cone
  // section, and squaring it off would leave a step the mesh never has.
  const foot = add(
    new THREE.CylinderGeometry(radiusAt(FOOT_H), CAP_R, FOOT_H, AROUND, 1, false),
    M.foot, 'homepod-foot', root
  );
  foot.position.y = FOOT_H / 2;

  // ---- the touch panel ---------------------------------------------------
  // Dished, not flat: the glass sinks towards the middle, which is what catches the
  // light as a ring on the real one. A lathe again, over the shallow arc.
  //
  // Wound from the rim **inwards**, which is what points its normals up. A lathe's
  // normals follow the direction the profile is walked, and the first pass walked this
  // one outwards: the cap came out facing into the speaker, so from above it was culled
  // and you looked straight down through the open shell at the display's stand behind it.
  const dish = [];
  const DISH_STEPS = 16;
  for (let i = DISH_STEPS; i >= 0; i -= 1) {
    const t = i / DISH_STEPS;
    dish.push(new THREE.Vector2(DISH_R * t, -DISH_DROP * (1 - t * t)));
  }
  const panel = add(new THREE.LatheGeometry(dish, AROUND), M.glass, 'homepod-touch', root);
  panel.position.y = HOMEPOD_H;
  panel.geometry.computeVertexNormals();

  // The `+` and `−` and the faint idle glow, drawn to a canvas and hung flat just over
  // the glass — the same way `iphone15Pro.js` hangs its clock and its app labels, and for
  // the same reason: there is no font in the scene to extrude, and a lathe's UVs run
  // around and along, which would smear a glyph into a ring.
  const glyphs = glyphTexture();
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(DISH_R * 0.98, AROUND),
    keep(new THREE.MeshStandardMaterial({
      name: 'homepod_touch_glyphs', color: 0x000000, roughness: 0.3, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: 0.5,
      map: glyphs, emissiveMap: glyphs, alphaMap: glyphs,
      transparent: true, depthWrite: false,
    }))
  );
  face.name = 'homepod-touch-glyphs';
  face.rotation.x = -Math.PI / 2;
  // Just clear of the dish's deepest point, so it never fights the glass for the pixel.
  face.position.y = HOMEPOD_H - DISH_DROP * 0.35;
  face.renderOrder = 1;
  root.add(face);

  // ---- where the lead comes out ------------------------------------------
  // An empty rather than a number in `homePodCable.js`: the cord is measured off this,
  // so moving the exit moves the run with it. Same convention as the riser's `riser top`.
  const exit = new THREE.Object3D();
  exit.name = 'cable exit';
  exit.position.set(0, FOOT_H * 0.4, -CAP_R * 0.55);
  root.add(exit);

  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  return root;
}

/** The sphere's radius at a height above the base — the whole shape, in one line. */
function radiusAt(y) {
  const from = y - HALF_H;
  return Math.sqrt(Math.max(0, R * R - from * from));
}

/**
 * The acoustic mesh, drawn once and tiled.
 *
 * Seamless by construction: the threads are drawn on a grid that divides the canvas
 * exactly, so the right edge continues into the left. Warp and weft are drawn in two
 * passes with the crossings darkened, which is what stops a plain grid reading as
 * graph paper rather than as cloth.
 */
function weaveTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');

  c.fillStyle = SHADE;
  c.fillRect(0, 0, size, size);

  const cells = 16;
  const pitch = size / cells;

  // The threads themselves: a soft bar across the middle of each cell, both ways.
  c.lineWidth = pitch * 0.62;
  c.lineCap = 'butt';
  for (let i = 0; i < cells; i += 1) {
    const at = (i + 0.5) * pitch;
    c.strokeStyle = FABRIC;
    c.beginPath();
    c.moveTo(0, at);
    c.lineTo(size, at);
    c.stroke();
    c.beginPath();
    c.moveTo(at, 0);
    c.lineTo(at, size);
    c.stroke();
  }

  // The over-and-under: every other crossing gets the lit thread on top, so the weave
  // alternates instead of lying in one plane.
  c.lineWidth = pitch * 0.34;
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      const x = (col + 0.5) * pitch;
      const y = (row + 0.5) * pitch;
      c.strokeStyle = THREAD;
      c.beginPath();
      if ((row + col) % 2 === 0) {
        c.moveTo(x - pitch * 0.4, y);
        c.lineTo(x + pitch * 0.4, y);
      } else {
        c.moveTo(x, y - pitch * 0.4);
        c.lineTo(x, y + pitch * 0.4);
      }
      c.stroke();
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(WEAVE.around, WEAVE.along);
  map.anisotropy = 8;
  return { map };
}

/**
 * The touch surface: a faint sheen in the middle and the two volume glyphs.
 *
 * Kept dim on purpose. The real panel only lights the `+` and `−` while something is
 * playing, and a speaker sitting idle on a riser with a glowing face would read as a
 * lamp — so this is the sheen you can see across the desk, not the thing you look at.
 */
function glyphTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  const mid = size / 2;

  // The sheen, brightest just off centre and gone well before the rim.
  const glow = c.createRadialGradient(mid, mid, 0, mid, mid, size * 0.46);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  glow.addColorStop(0.55, 'rgba(255, 255, 255, 0.05)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, size, size);

  // `+` above and `−` below, as they sit on the real panel.
  const arm = size * 0.075;
  const offset = size * 0.27;
  c.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  c.lineWidth = size * 0.022;
  c.lineCap = 'round';

  c.beginPath();
  c.moveTo(mid - arm, mid - offset);
  c.lineTo(mid + arm, mid - offset);
  c.moveTo(mid, mid - offset - arm);
  c.lineTo(mid, mid - offset + arm);
  c.stroke();

  c.beginPath();
  c.moveTo(mid - arm, mid + offset);
  c.lineTo(mid + arm, mid + offset);
  c.stroke();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

/** These colours are authored, not inherited — darkenScene() must not re-tint them. */
function keep(material) {
  material.userData.keepColor = true;
  return material;
}

function add(geometry, material, name, parent) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

/**
 * Where they stand on the riser, as offsets from the display's own anchor — so they
 * follow the display rather than sitting at fixed coordinates, the way `deskApple.js`
 * lays out its four. +z is towards the front of the desk.
 *
 * Two of them, mirrored about the display: a pair of minis either side of a monitor is
 * how they are actually used, and the riser plate is symmetrical, so the second is the
 * first negated rather than a second set of numbers to keep in step.
 *
 * The plate is 62 x 28 and the display's foot takes the middle of it, which leaves both
 * ends free: at this offset each speaker's 9.79 across clears the foot and the plate's
 * own edge. Dialled in edit mode — nudge one there and paste the readout back.
 */
const PLACEMENTS = [
  { x: 21.5, z: 5.5 },
  { x: -21.5, z: 5.5 },
];

/**
 * Builds the pair and sits them on the riser's top face. Synchronous — nothing here is
 * loaded — but it still needs the riser, which is what says how high the plate is.
 *
 * Returns them in the order above, which is also the order their names run in: the room
 * has more than one now, so `HomePod_mini` alone would no longer say which.
 */
export function addHomePodMini(parent, riser) {
  if (!riser) return [];
  riser.updateMatrixWorld(true);

  const top = riser.getObjectByName('riser top');
  if (!top) {
    console.warn('[homepod] the riser has no `riser top` marker to stand on');
    return [];
  }

  return PLACEMENTS.map((placement, i) => {
    const speaker = buildHomePodMini();
    speaker.name = i === 0 ? 'HomePod_mini' : `HomePod_mini_${i + 1}`;

    // Parented before measuring: the room's root carries an offset of its own, so a box
    // taken while the speaker is still detached would be in the wrong frame.
    parent.add(speaker);
    speaker.position.set(0, 0, 0);
    speaker.updateMatrixWorld(true);

    const target = top.getWorldPosition(new THREE.Vector3());
    target.x = MAIN_DISPLAY_ANCHOR.x + placement.x;
    target.z = MAIN_DISPLAY_ANCHOR.z + placement.z;

    // The group is authored standing on y = 0 and centred on its own axis, so its origin
    // *is* the point that lands on the plate — no box needed.
    speaker.position.copy(parent.worldToLocal(target));
    speaker.updateMatrixWorld(true);

    return speaker;
  });
}
