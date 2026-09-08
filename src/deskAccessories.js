import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Two desk pieces modelled from the reference photo: a monitor riser (black steel
 * plate on wooden dowel legs) and a laptop stand (base plate, dowel column, angled
 * bracket with felt pads).
 *
 * The room's units run about one per centimetre — the desk is 246 wide and its top
 * sits 80 above the floor — so every dimension below is in centimetres.
 */

// ---- Monitor riser ----------------------------------------------------------
const RISER = {
  width: 105,
  depth: 28,
  plate: 1,
  lipHeight: 1.5,
  // Taller legs raise the riser; their radius stays put so they don't thicken with it.
  legHeight: 13,
  legRadius: 2.2,
  // Legs pulled well in from the corners, so the top overhangs them at both ends.
  legInsetX: 14,
  legInsetZ: 5,
};

/** How far the stand is swung in towards the chair, away from square to the desk. */
const STAND_YAW = THREE.MathUtils.degToRad(-18);

// ---- Laptop stand -----------------------------------------------------------
// Sized around a 16-inch MacBook Pro: 35.6 wide by 24.8 deep, so the shelf clears
// its width and spans its depth between the two supports.
const STAND = {
  baseWidth: 22,
  baseDepth: 22,
  basePlate: 0.5,
  postHeight: 13,
  postRadius: 2.0,
  shelfWidth: 30,
  // Floored by the laptop's own run — LAPTOP_BASE_DEPTH · cos θ ≈ 23.3 — because the
  // lip has to land at the machine's front edge. This leaves margin and no more.
  shelfDepth: 23.8,
  shelfPlate: 0.5,
  // Square L: horizontal shelf, vertical back. A tilt can be dialled back in here
  // without restructuring the bracket.
  shelfTilt: THREE.MathUtils.degToRad(0),
  backHeight: 8.5,
  // Kept low: it only has to catch the MacBook's thin front edge, and it does not
  // feed the slope, which comes from backHeight and the machine's depth.
  frontLip: 1.8,
  topReturn: 2.5, // short fold forward at the top of the back wall
  feltThickness: 0.4,
  feltDepth: 3,
};

/** Base depth of the machine the stand is built around — a 16-inch MacBook Pro. */
export const LAPTOP_BASE_DEPTH = 24.81;

/**
 * The slope the machine takes on this stand. It bridges two contacts: its rear
 * underside on the back wall's fold, `backHeight` above the shelf, and its front
 * edge down in the corner where the front lip meets the shelf — resting on the
 * shelf itself, not on top of the lip. Its own base is the hypotenuse between them,
 * so the angle falls straight out of the machine's depth:
 *
 *     sin θ = backHeight / LAPTOP_BASE_DEPTH
 *
 * The same θ tilts the fold (parallel to the underside it supports) and the front
 * lip (perpendicular to the base, so the front edge nests into the corner). The
 * shelf depth then only has to clear the run, `LAPTOP_BASE_DEPTH · cos θ` ≈ 23.3.
 */
export const STAND_SLOPE = Math.asin(
  Math.min(STAND.backHeight / LAPTOP_BASE_DEPTH, 1)
);

/** Matte black powder-coated steel — the body of both pieces, and the blind's brackets. */
export function steelMaterial() {
  return keep(new THREE.MeshStandardMaterial({
    name: 'accessory_steel', color: 0x1c1c1e, roughness: 0.55, metalness: 0.35,
  }));
}

/**
 * Walnut for the turned dowels — grained on a canvas the way the WorkDesk3D project
 * does its tabletop, rather than a flat colour.
 */
function beechMaterial() {
  const material = new THREE.MeshStandardMaterial({
    name: 'accessory_walnut',
    map: makeWalnutTexture(),
    color: 0x8a6a4e,
    roughness: 0.72,
    metalness: 0.03,
  });
  material.userData.keepColor = true;
  return material;
}

/**
 * A dark brown board with fine streaks and a few darker growth lines. The streaks
 * run down the canvas's Y, which on a cylinder is its length — so the grain follows
 * the dowel rather than banding around it.
 */
function makeWalnutTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4b3423';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 900; i += 1) {
    const x = Math.random() * canvas.width;
    const dark = Math.random() < 0.18;
    ctx.strokeStyle = dark ? 'rgba(26, 15, 8, 0.55)' : 'rgba(108, 78, 51, 0.3)';
    ctx.lineWidth = dark ? 0.8 + Math.random() : 0.4 + Math.random() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    // A shallow wave, so the streaks aren't dead straight.
    const amplitude = 3 + Math.random() * 9;
    const phase = Math.random() * Math.PI * 2;
    for (let y = 0; y <= canvas.height; y += 16) {
      ctx.lineTo(x + Math.sin(phase + (y / canvas.height) * Math.PI * 2) * amplitude, y);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Dark speckled felt on the surfaces a laptop rests against. */
function feltMaterial() {
  return keep(new THREE.MeshStandardMaterial({
    name: 'accessory_felt', color: 0x35353a, roughness: 1, metalness: 0,
  }));
}

/** These colours are authored, not inherited — darkenScene() must not re-tint them. */
function keep(material) {
  material.userData.keepColor = true;
  return material;
}

/**
 * Builds both pieces and rests them on the desk: the riser centred along the back of
 * the desk's long run, the stand off to one side of it.
 *
 * Returns { riser, stand } so their transforms stay easy to adjust.
 */
export function addDeskAccessories(parent, deskBox) {
  if (!deskBox) return null;

  const surfaceY = deskBox.max.y;
  const backZ = deskBox.min.z;
  const centerX = (deskBox.min.x + deskBox.max.x) / 2;

  // deskBox is world-space but `parent` carries its own offset, so the placements
  // have to be converted into its local space or the pieces float off the surface.
  parent.updateMatrixWorld(true);
  const place = (object, x, y, z) =>
    object.position.copy(parent.worldToLocal(new THREE.Vector3(x, y, z)));

  // Where each piece sits along the desk, measured from its centre.
  const riserX = -50;
  const standX = 20;

  /** How far in front of the desk's back edge the stand's base plate sits. */
  const standFrontGap = 31;

  const riser = buildMonitorRiser();
  place(riser, centerX + riserX, surfaceY, backZ + RISER.depth / 2 + 2);

  const stand = buildLaptopStand();
  // Angled in towards the seat rather than square to the desk, the way a machine
  // off to one side actually gets turned.
  stand.rotation.y = STAND_YAW;
  place(stand, centerX + standX, surfaceY, backZ + STAND.baseDepth / 2 + standFrontGap);

  for (const group of [riser, stand]) {
    group.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });
    parent.add(group);
  }

  return { riser, stand };
}

/**
 * Monitor riser: a long plate with an upturned back lip, standing on four dowels
 * set well in from its corners. Built with y = 0 at the feet, so the group can be
 * dropped straight onto the desk surface.
 */
export function buildMonitorRiser() {
  const group = new THREE.Group();
  group.name = 'Monitor_riser';
  const steel = steelMaterial();
  const beech = beechMaterial();

  const plateY = RISER.legHeight + RISER.plate / 2;
  add(group, box(RISER.width, RISER.plate, RISER.depth), steel, [0, plateY, 0], 'riser top plate');

  // Lip along the back edge, standing proud of the plate.
  add(
    group,
    box(RISER.width, RISER.lipHeight, RISER.plate),
    steel,
    [0, plateY + (RISER.plate + RISER.lipHeight) / 2, -(RISER.depth - RISER.plate) / 2],
    'riser back lip'
  );

  // Dowel legs, inset from the corners as in the photo.
  const legX = RISER.width / 2 - RISER.legInsetX;
  const legZ = RISER.depth / 2 - RISER.legInsetZ;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(RISER.legRadius, RISER.legRadius, RISER.legHeight, 48),
      beech
    );
    leg.position.set(sx * legX, RISER.legHeight / 2, sz * legZ);
    leg.name = 'riser leg';
    group.add(leg);
  }

  // Where anything standing on the riser lands, measured rather than re-derived.
  addMarker(group, 'riser top', [0, RISER.legHeight + RISER.plate, 0]);

  return group;
}

/**
 * Laptop stand: square base plate, dowel column, and a tilted shelf with a raised
 * back wall. Felt pads sit where the laptop touches. y = 0 at the base's underside.
 */
export function buildLaptopStand() {
  const group = new THREE.Group();
  group.name = 'Laptop_stand';
  const steel = steelMaterial();
  const beech = beechMaterial();
  const felt = feltMaterial();

  add(group, box(STAND.baseWidth, STAND.basePlate, STAND.baseDepth), steel,
      [0, STAND.basePlate / 2, 0], 'stand base plate');

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(STAND.postRadius, STAND.postRadius, STAND.postHeight, 48),
    beech
  );
  post.position.set(0, STAND.basePlate + STAND.postHeight / 2, 0);
  post.name = 'stand post';
  group.add(post);

  // The bracket is tilted as a unit, so the shelf and its folds stay square to each
  // other the way a folded sheet does.
  const bracket = new THREE.Group();
  bracket.name = 'stand bracket';
  bracket.position.y = STAND.basePlate + STAND.postHeight;
  bracket.rotation.x = -STAND.shelfTilt;
  group.add(bracket);

  const sheet = new THREE.Mesh(foldedSheetGeometry(), steel);
  sheet.name = 'stand sheet';
  bracket.add(sheet);

  const t = STAND.shelfPlate;
  const shelfTopY = t;
  const lipInnerZ = STAND.shelfDepth / 2 - t;

  // Empty markers at the two contact points, so macbook.js can measure where the
  // machine lands instead of re-deriving it from constants.
  addMarker(bracket, 'seat front', [0, shelfTopY, lipInnerZ]);
  addMarker(bracket, 'seat back', [0, shelfTopY + STAND.backHeight, -STAND.shelfDepth / 2]);

  // Felt where the machine touches: down the lip's inner face, and under the fold.
  const lipHinge = new THREE.Group();
  lipHinge.position.set(0, shelfTopY, lipInnerZ);
  lipHinge.rotation.x = STAND_SLOPE;
  bracket.add(lipHinge);
  add(lipHinge, box(STAND.shelfWidth - 2, STAND.frontLip * 0.8, STAND.feltThickness), felt,
      [0, STAND.frontLip * 0.4, -STAND.feltThickness / 2], 'stand felt (front lip)');

  const foldHinge = new THREE.Group();
  foldHinge.position.set(0, shelfTopY + STAND.backHeight, -STAND.shelfDepth / 2 + t);
  foldHinge.rotation.x = STAND_SLOPE;
  bracket.add(foldHinge);
  add(foldHinge, box(STAND.shelfWidth - 2, STAND.feltThickness, STAND.topReturn * 0.8), felt,
      [0, STAND.feltThickness / 2, STAND.topReturn * 0.4], 'stand felt (top return)');

  return group;
}

/** Radius of the rounded corners on the bracket's profile. */
const SHEET_CORNER = 0.35;

/**
 * The bracket as a single folded sheet: one continuous strip running from the fold
 * at the top of the back wall, down the wall, along the shelf and up the front lip.
 *
 * Built as a side profile in the Z/Y plane and extruded across the stand's width, so
 * it is one mesh rather than four boxes butted together — the folds are real corners
 * with no seams.
 */
function foldedSheetGeometry() {
  const t = STAND.shelfPlate;
  const halfDepth = STAND.shelfDepth / 2;

  // Centreline of the strip, walked fold tip → wall → shelf → lip tip. The two folds
  // open by STAND_SLOPE, the same angle the laptop lies at.
  const wallZ = -halfDepth + t / 2;
  const wallTop = new THREE.Vector2(wallZ, t / 2 + STAND.backHeight);
  const shelfY = t / 2;
  const lipBase = new THREE.Vector2(halfDepth - t / 2, shelfY);

  const centreline = [
    // fold tip, angling down toward the front off the wall's top
    wallTop.clone().add(
      new THREE.Vector2(Math.cos(STAND_SLOPE), -Math.sin(STAND_SLOPE)).multiplyScalar(STAND.topReturn)
    ),
    wallTop,
    new THREE.Vector2(wallZ, shelfY),
    lipBase,
    // lip tip, leaning out over the front edge
    lipBase.clone().add(
      new THREE.Vector2(Math.sin(STAND_SLOPE), Math.cos(STAND_SLOPE)).multiplyScalar(STAND.frontLip)
    ),
  ];

  const outline = offsetStrip(centreline, t / 2);
  const shape = roundedShape(outline, SHEET_CORNER);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: STAND.shelfWidth,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 2,
    curveSegments: 6,
  });

  // The profile is authored in Z/Y and extrudes along +Z, so it has to be turned to
  // put the extrusion across X. The turn must be *negative*: rotateY(+90°) maps
  // z → −x and x → z, which mirrors the profile front-to-back and stands the fold at
  // the front. rotateY(−90°) keeps the profile's Z pointing the way it was authored.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(STAND.shelfWidth / 2, 0, 0);
  return geometry;
}

/**
 * Turns a centreline into the closed outline of a strip of `half`-thickness, mitring
 * each interior joint so the folds meet cleanly instead of leaving a notch. Returns
 * the points anticlockwise: one side out, the other back.
 */
function offsetStrip(points, half) {
  const side = (sign) => points.map((point, i) => {
    const before = points[i - 1];
    const after = points[i + 1];

    // Segment normals either side of this point; at the ends there is only one.
    const normals = [];
    if (before) normals.push(normalOf(before, point));
    if (after) normals.push(normalOf(point, after));

    const bisector = normals
      .reduce((sum, n) => sum.add(n), new THREE.Vector2())
      .normalize();

    // Mitre length grows as the joint gets sharper; without it the offset corner
    // falls short of where the two offset segments actually cross.
    const scale = normals.length === 2
      ? 1 / Math.max(bisector.dot(normals[0]), 0.25)
      : 1;

    return point.clone().addScaledVector(bisector, sign * half * scale);
  });

  return [...side(1), ...side(-1).reverse()];
}

/** Unit normal (left of travel) of the segment a → b. */
function normalOf(a, b) {
  const d = b.clone().sub(a).normalize();
  return new THREE.Vector2(-d.y, d.x);
}

/** A closed Shape through `points`, with each corner cut back into a small arc. */
function roundedShape(points, radius) {
  const shape = new THREE.Shape();

  points.forEach((point, i) => {
    const previous = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];

    // Keep the arc inside both neighbouring edges, however short they are.
    const r = Math.min(
      radius,
      point.distanceTo(previous) / 2.05,
      point.distanceTo(next) / 2.05
    );
    const from = point.clone().lerp(previous, r / (point.distanceTo(previous) || 1));
    const to = point.clone().lerp(next, r / (point.distanceTo(next) || 1));

    if (i === 0) shape.moveTo(from.x, from.y);
    else shape.lineTo(from.x, from.y);
    shape.quadraticCurveTo(point.x, point.y, to.x, to.y);
  });

  shape.closePath();
  return shape;
}

/** An empty marker: a reference point that travels with the group but draws nothing. */
function addMarker(parent, name, [x, y, z]) {
  const marker = new THREE.Object3D();
  marker.name = name;
  marker.position.set(x, y, z);
  parent.add(marker);
  return marker;
}

/** Corner radius on every plate. Held under half the thinnest part (0.4 felt). */
const CORNER_RADIUS = 0.18;

/**
 * Every part goes through here, so rounding it rounds the whole set — the riser as
 * well as the stand. The radius is clamped per box because RoundedBoxGeometry folds
 * in on itself once the radius passes half of the smallest dimension.
 */
function box(width, height, depth) {
  const radius = Math.min(CORNER_RADIUS, Math.min(width, height, depth) / 2 - 1e-3);
  return new RoundedBoxGeometry(width, height, depth, 2, radius);
}

function add(parent, geometry, material, [x, y, z], name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
