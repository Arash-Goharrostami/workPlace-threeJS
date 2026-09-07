import * as THREE from 'three';

/**
 * The felt desk mat the keyboard sits on, ported from WorkDesk3D's
 * js/objects/desk-mat.js — 90 x 30 cm and 3 mm thick, in charcoal.
 *
 * Geometrically it is a rounded slab; all the work is in the material. Felt has to
 * look like matted fibre or it reads as a grey rectangle, so the surface is drawn to
 * a canvas — broad soft clouds first, then thousands of very short strokes at random
 * angles — and that one drawing does three jobs: colour, roughness and a little bump.
 *
 * The source is authored in metres. This scene runs in centimetres, so the build is
 * left exactly as written and the finished group is scaled by SCALE; rewriting the
 * constants, UV maths and texture repeats into centimetres would only invite drift.
 */

const MAT_WIDTH = 0.90; // across the desk
const MAT_DEPTH = 0.30; // front to back
export const MAT_H = 0.003; // what a felt pad actually is

const CORNER_R = 0.012;

/** Metres (the port's units) to this scene's centimetres. */
const SCALE = 100;

/**
 * How many times the fibre drawing tiles across the mat. One tile covers a 40 cm
 * square, big enough that the cloudiness never visibly repeats.
 */
const TILE = 0.40;
const CANVAS_PX = 1024;

/** Gap left between the mat's front edge and the tray's, in scene units. */
const FRONT_GAP = 4;

/** Nudges across and along the tray, in scene units. */
const OFFSET = new THREE.Vector2(0, 0);

/** Only faces this flat count as the tray's surface. */
const HORIZONTAL = 0.9;

/** Height bin used when hunting for the tray, in scene units. */
const TRAY_BIN = 1;

/** How far below the desktop to look for it. */
const TRAY_SEARCH_DEPTH = 30;

/**
 * ...and how far below it the tray must at least be. Without this the search finds
 * the frame right under the desktop, which is flat and upward-facing but has no
 * clearance to put anything on.
 */
const TRAY_MIN_CLEARANCE = 10;

/** Lays the mat on the desk's keyboard tray, centred on it. */
export function addDeskMat(parent, desk) {
  if (!desk) return null;

  const tray = findKeyboardTray(desk);
  if (!tray) return null;

  const mat = buildFeltMat(MAT_WIDTH, MAT_DEPTH);
  mat.name = 'Desk_mat';
  mat.scale.setScalar(SCALE);

  // Parented before measuring: the model root carries an offset, so a box taken
  // while the mat is still detached would be in the wrong frame.
  parent.add(mat);
  mat.position.set(0, 0, 0);
  mat.updateMatrixWorld(true);

  // Centred across the tray, but anchored by its *front* edge so it sits up near
  // the tray's lip — where hands reach it — rather than centred and out of reach.
  const box = new THREE.Box3().setFromObject(mat);
  const centre = tray.box.getCenter(new THREE.Vector3());
  const target = new THREE.Vector3(
    centre.x + OFFSET.x,
    tray.topY,
    tray.box.max.z - FRONT_GAP + OFFSET.y
  );
  const anchor = new THREE.Vector3(
    box.getCenter(new THREE.Vector3()).x,
    box.min.y,
    box.max.z
  );

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(anchor);
  const origin = parent.worldToLocal(new THREE.Vector3());
  mat.position.copy(parent.worldToLocal(delta).sub(origin));
  mat.updateMatrixWorld(true);

  return mat;
}

/**
 * The tray is the largest flat, upward-facing surface in the space below the
 * desktop — found by binning those faces by height and taking the biggest cluster,
 * rather than hard-coding a level that a different desk model would not share.
 */
function findKeyboardTray(desk) {
  desk.updateMatrixWorld(true);

  const deskTop = new THREE.Box3().setFromObject(desk).max.y;
  const clusters = new Map();

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  desk.traverse((node) => {
    if (!node.isMesh) return;
    const position = node.geometry.attributes.position;
    const index = node.geometry.getIndex();
    const count = index ? index.count : position.count;
    const at = (i) => (index ? index.getX(i) : i);

    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(position, at(i)).applyMatrix4(node.matrixWorld);
      b.fromBufferAttribute(position, at(i + 1)).applyMatrix4(node.matrixWorld);
      c.fromBufferAttribute(position, at(i + 2)).applyMatrix4(node.matrixWorld);

      const y = (a.y + b.y + c.y) / 3;
      if (y > deskTop - TRAY_MIN_CLEARANCE || y < deskTop - TRAY_SEARCH_DEPTH) continue;

      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac);
      const area = normal.length() / 2;
      if (area < 1e-6 || normal.y / (area * 2) < HORIZONTAL) continue;

      const key = Math.round(y / TRAY_BIN);
      const cluster = clusters.get(key) ?? { area: 0, box: new THREE.Box3(), y };
      cluster.area += area;
      cluster.box.expandByPoint(a);
      cluster.box.expandByPoint(b);
      cluster.box.expandByPoint(c);
      clusters.set(key, cluster);
    }
  });

  let best = null;
  for (const cluster of clusters.values()) {
    if (!best || cluster.area > best.area) best = cluster;
  }

  return best ? { topY: best.box.max.y, box: best.box } : null;
}

/**
 * The three felt drawings, made once. Each is 46,000 strokes, so a second mat draws
 * its own textures from these same canvases rather than painting them again — only
 * the tiling differs between mats.
 */
let canvases = null;

/**
 * Builds a felt mat of the given size, at the authored (metre) scale. `tint`
 * multiplies the felt's own colour, so a second mat can read darker than the first
 * without redrawing its textures.
 */
export function buildFeltMat(width, depth, tint = 0xffffff) {
  const root = new THREE.Group();
  root.name = 'Felt_mat';

  // The felt, drawn once at two scales. The fibres alone are not enough: past a
  // hand's reach they average out and the mat goes back to flat grey. What reads as
  // felt across a room is the cloudiness — the centimetre-scale variation in how
  // densely the fibres are pressed — so that goes down first, and the fibres over it.
  //
  // `ink` picks a fibre's colour from a random 0..1 and `haze` a cloud's, so the same
  // pattern can be drawn in charcoal for colour and in greyscale for roughness and
  // bump. The three then line up exactly: a fibre that catches the light is the same
  // fibre that stands proud.
  function drawFelt(ink, haze, background) {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_PX;
    canvas.height = CANVAS_PX;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Drawn wrapped — every blob painted in all four neighbouring positions too —
    // so the tile joins itself seamlessly.
    for (let i = 0; i < 90; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const r = canvas.width * (0.04 + Math.random() * 0.09);
      const tone = haze(Math.random());
      [-1, 0, 1].forEach((ox) => {
        [-1, 0, 1].forEach((oy) => {
          const cx = x + ox * canvas.width;
          const cy = y + oy * canvas.height;
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          gradient.addColorStop(0, tone);
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        });
      });
    }

    // Short, straight, every-which-way: pressed fibre, not a weave. Drawn well past
    // the edges so the tiling has no seam to give itself away.
    ctx.lineCap = 'round';
    for (let i = 0; i < 46000; i += 1) {
      const x = -8 + Math.random() * (canvas.width + 16);
      const y = -8 + Math.random() * (canvas.height + 16);
      const angle = Math.random() * Math.PI * 2;
      const len = 2 + Math.random() * 6;
      ctx.strokeStyle = ink(Math.random());
      ctx.lineWidth = 0.6 + Math.random() * 0.9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
    return canvas;
  }

  function texture(canvas, srgb) {
    const tex = new THREE.CanvasTexture(canvas);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.repeat.set(width / TILE, depth / TILE);
    return tex;
  }

  canvases ??= {
    // Charcoal, the fibres running a little lighter and darker than their ground.
    colour: drawFelt(
      (r) => (r < 0.5
        ? `rgba(86, 88, 93, ${0.25 + r * 0.5})`
        : `rgba(24, 25, 28, ${0.2 + (r - 0.5) * 0.6})`),
      (r) => (r < 0.5 ? 'rgba(94, 96, 101, 0.16)' : 'rgba(20, 21, 24, 0.16)'),
      '#3a3c40',
    ),
    // The same fibres as roughness, so the sheen breaks up instead of sitting flat.
    roughness: drawFelt(
      (r) => (r < 0.5 ? 'rgba(190, 190, 190, 0.4)' : 'rgba(255, 255, 255, 0.35)'),
      (r) => (r < 0.5 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(170, 170, 170, 0.2)'),
      '#e8e8e8',
    ),
    // And as height, for the fuzz.
    bump: drawFelt(
      (r) => (r < 0.5 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)'),
      (r) => (r < 0.5 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.14)'),
      '#808080',
    ),
  };

  const colour = texture(canvases.colour, true);
  const roughness = texture(canvases.roughness, false);
  const bump = texture(canvases.bump, false);

  const feltMaterial = new THREE.MeshStandardMaterial({
    name: 'mat_felt',
    color: tint,
    map: colour,
    roughnessMap: roughness,
    bumpMap: bump,
    bumpScale: 0.35,
    roughness: 0.95,
    metalness: 0,
  });
  // An authored charcoal — darkenScene() must not tint it further.
  feltMaterial.userData.keepColor = true;

  function roundedRectPath(path, w, d, r) {
    const hw = w / 2;
    const hd = d / 2;
    const rr = Math.min(r, hw, hd);
    path.moveTo(-hw + rr, -hd);
    path.lineTo(hw - rr, -hd);
    path.quadraticCurveTo(hw, -hd, hw, -hd + rr);
    path.lineTo(hw, hd - rr);
    path.quadraticCurveTo(hw, hd, hw - rr, hd);
    path.lineTo(-hw + rr, hd);
    path.quadraticCurveTo(-hw, hd, -hw, hd - rr);
    path.lineTo(-hw, -hd + rr);
    path.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
    return path;
  }

  // One slab, bevelled top and bottom — a cut felt edge is slightly compressed and
  // soft, never a sharp 90° corner.
  const BEV = 0.0004;
  const shape = roundedRectPath(
    new THREE.Shape(), width - BEV * 2, depth - BEV * 2, CORNER_R - BEV
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: MAT_H - BEV * 2,
    bevelEnabled: true,
    bevelThickness: BEV,
    bevelSize: BEV,
    bevelSegments: 2,
    curveSegments: 12,
  });
  // The shape is cut in (x, y) and extruded along +z; lay it down so the extrusion
  // becomes the mat's thickness. The bevel hangs BEV below the extrusion's own start,
  // so lifting by exactly that puts the underside on the ground.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, BEV, 0);

  // ExtrudeGeometry's UVs run in metres, so the fibres would come out at the wrong
  // scale and tile unevenly. Replace them with a plain 0..1 across the mat, which the
  // texture's own `repeat` then divides up.
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = (position.getX(i) + width / 2) / width;
    uv[i * 2 + 1] = (position.getZ(i) + depth / 2) / depth;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  const mesh = new THREE.Mesh(geometry, feltMaterial);
  mesh.name = 'felt mat';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  root.add(mesh);

  return root;
}
