import * as THREE from 'three';
import { buildCable } from './cable.js';
import { loadGLB } from './gltfLoader.js';

/**
 * Two power strips on the floor under the desk's right-hand return, each corded up
 * to one of the wall outlet's two sockets. Run
 * `npm run convert Power_Plug_-Outlet_-Adapter__Connector_Strip` to (re-)import.
 *
 * The pack is a whole tray of parts — adapters, plugs, loose outlets — of which only
 * `connector_strip` is wanted. It is authored in this scene's centimetres, lying flat
 * with its length along +x, so placing one is a yaw and a spot on the floor.
 */

/**
 * `npm run shrink -- powerStrip 1024 85 --only connector_strip,power_plug_2` took it from
 * 521 KB to 47 KB. The source is a pack — USB ports, adapters, wall outlets and four plug
 * variants — and this module loads two of them, so two thirds of its triangles drew parts
 * nothing asks for. `PART` and `PLUG_PART` below are the names that decide what survives.
 */
export const MODEL_URL = 'models/powerStrip.glb';
const PART = 'connector_strip';

/** The black plug from the same pack, put in the wall socket at the cable's far end. */
const PLUG_PART = 'power_plug_2';

/**
 * The plug is modelled lying down: its pins run along -y and its body, with the cord
 * gland on the end, along +x. Standing it in a wall facing +z means sending the pins
 * to -z and the body straight down, which is two turns at once — so it is given as
 * the basis it should end up in rather than as a pair of Euler angles.
 */
const PLUG_BASIS = [
  new THREE.Vector3(0, -1, 0), // the body, and the cord with it, hangs down
  new THREE.Vector3(0, 0, 1),  // so the pins, along -y, go into the plate
  new THREE.Vector3(-1, 0, 0),
];

/**
 * How the plug sits once it is in: a shade lower than the socket's own middle, and
 * further into the plate, so the pins are buried and the body rests where a plug
 * actually hangs rather than floating off the face.
 */
const PLUG_SEAT = new THREE.Vector3(0, -2.1, -2.2);

/** The strip's shell, repainted from its stock light grey. */
const STRIP_PAINT = { white: { color: 0x141416, roughness: 0.45, metalness: 0.15 } };

/**
 * Where each strip lies: the centre of its footprint in world x/z, and the heading
 * its length runs along. Both sit against the wall behind the Mac Pro, the second
 * turned to run out towards the room.
 */
const STRIPS = [
  { x: 121.4, z: -130.2, yaw: THREE.MathUtils.degToRad(-8) },
  { x: 134.8, z: -91.7, yaw: THREE.MathUtils.degToRad(75) },
];

/** The outlet's two sockets, as heights up its plate — top one first. */
const SOCKET_HEIGHTS = [0.72, 0.28];

/** How far the cable stands off the wall and the floor as it runs. */
const CABLE_RADIUS = 0.36;

/** Black rubber flex — matte, so it reads as cable next to the aluminium. */
const CABLE_SPEC = { color: 0x121214, roughness: 0.72, metalness: 0.05 };

/**
 * The route each cord actually runs, in world centimetres, `[x, y, z]` per point and
 * in order from the plug to the strip. Dressed by hand in edit mode and copied out of
 * its readout, which is why these are plain numbers rather than something derived from
 * the outlet and the strips.
 *
 * The cost of that: they are absolute. Move the outlet, a strip or a plug and the
 * cords stay where they are — the fix is to re-dress them in edit mode and paste the
 * new lists back here, not to nudge the numbers by hand.
 */
const ROUTES = [
  // Power_strip_cable_1 — the upper socket, down to the strip against the wall.
  [
    [144.01, 43.08, -138.59],
    [143.74, 37.41, -137.44],
    [141.90, 25.50, -137.37],
    [139.20, 12.41, -136.97],
    [138.92, 8.93, -136.76],
    [139.51, 7.58, -136.67],
    [141.32, 5.76, -137.87],
    [143.21, 5.76, -136.43],
    [144.26, 5.76, -133.88],
    [144.34, 5.76, -131.17],
    [143.49, 5.76, -128.63],
    [141.82, 5.76, -126.58],
    [139.57, 5.76, -125.26],
    [137.04, 5.76, -124.81],
    [134.54, 5.76, -125.28],
    [132.40, 5.76, -126.57],
    [130.87, 5.76, -128.50],
    [130.12, 5.76, -130.81],
    [130.23, 5.76, -133.20],
    [131.15, 5.76, -135.36],
    [132.75, 5.76, -137.05],
    [134.80, 5.76, -138.05],
    [137.03, 5.76, -138.26],
    [139.17, 5.76, -137.69],
    [140.94, 5.76, -136.43],
    [142.14, 5.76, -134.65],
    [142.63, 5.76, -132.61],
    [142.11, 5.76, -130.56],
    [139.79, 6.34, -128.42],
    [135.29, 7.40, -128.17],
  ],
  // Power_strip_cable_2 — the lower socket, coiled out towards the room.
  [
    [143.92, 37.15, -138.76],
    [144.02, 32.02, -138.05],
    [145.05, 21.85, -137.37],
    [146.40, 9.27, -136.97],
    [146.76, 6.61, -135.58],
    [147.00, 5.76, -132.42],
    [147.81, 5.76, -127.88],
    [149.22, 5.76, -123.99],
    [149.84, 5.76, -121.43],
    [149.89, 5.76, -118.72],
    [149.00, 5.76, -116.19],
    [147.30, 5.76, -114.16],
    [145.04, 5.76, -112.87],
    [142.50, 5.76, -112.47],
    [140.01, 5.76, -112.97],
    [137.89, 5.76, -114.29],
    [136.38, 5.76, -116.24],
    [135.67, 5.76, -118.56],
    [135.81, 5.76, -120.94],
    [136.76, 5.76, -123.10],
    [138.38, 5.76, -124.76],
    [140.45, 5.76, -125.73],
    [142.68, 5.76, -125.91],
    [144.81, 5.76, -125.31],
    [146.56, 5.76, -124.02],
    [147.73, 5.76, -122.23],
    [148.20, 5.76, -120.18],
    [147.91, 5.76, -118.13],
    [140.11, 5.94, -110.37],
    [138.33, 7.49, -104.82],
  ],
];

/** Loads both strips, lays them on the floor and runs a cable from each. */
export async function addPowerStrips(parent, floor, outlet) {
  if (!floor || !outlet) return null;

  const gltf = await loadGLB(MODEL_URL);
  const source = gltf.scene.getObjectByName(PART);
  const plugSource = gltf.scene.getObjectByName(PLUG_PART);
  if (!source || !plugSource) return null;

  // The part sits under a chain of nodes the USD → glTF conversion left rotated, and
  // lifting it out on its own would drop that turn — so it is baked in here, once.
  gltf.scene.updateMatrixWorld(true);
  const baked = source.matrixWorld.clone();
  const plugBaked = plugSource.matrixWorld.clone();

  const floorY = new THREE.Box3().setFromObject(floor).max.y;
  const sockets = socketPoints(outlet);
  const placed = [];

  STRIPS.forEach((spec, index) => {
    // The model's own transform lives on the inner copy; the group is what this
    // scene then turns and sets down.
    const model = lift(source, baked);
    repaint(model, STRIP_PAINT);

    const strip = new THREE.Group();
    strip.add(model);
    strip.name = `Power_strip_${index + 1}`;
    strip.rotation.y = spec.yaw;
    strip.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });

    // Parented before measuring: the model root carries an offset of its own, so a
    // box taken while the strip is still detached would be in the wrong frame.
    parent.add(strip);
    strip.position.set(0, 0, 0);
    strip.updateMatrixWorld(true);

    layOnFloor(strip, spec, floorY);

    // The plug is seated for its own sake now: the cord's route is authored, so the
    // gland it returns is what that route's first point was measured against.
    standInSocket(parent, lift(plugSource, plugBaked), sockets[index], index);
    parent.add(runCable(parent, index));
    placed.push(strip);
  });

  return placed;
}

/**
 * Lifts one part out of the pack. It sits under a chain of nodes the USD → glTF
 * conversion left rotated, and taking it on its own would drop that turn, so the
 * baked world matrix is put back on the copy.
 */
function lift(source, baked) {
  const model = source.clone(true);
  model.position.set(0, 0, 0);
  model.quaternion.identity();
  model.scale.set(1, 1, 1);
  model.applyMatrix4(baked);
  return model;
}

/** Swaps named materials for the given specs, one instance per spec. */
function repaint(root, specs) {
  const paints = Object.fromEntries(
    Object.entries(specs).map(([from, spec]) => [
      from, new THREE.MeshStandardMaterial({ name: `strip_${from}`, ...spec }),
    ])
  );

  root.traverse((node) => {
    if (!node.isMesh) return;
    const swap = (material) => (material && paints[material.name]) || material;
    node.material = Array.isArray(node.material)
      ? node.material.map(swap)
      : swap(node.material);
  });
}

/**
 * Stands a plug in one socket, pins into the plate. Returns where its cord leaves the
 * back of it, which is where that strip's cable starts.
 */
function standInSocket(parent, model, socket, index) {
  const plug = new THREE.Group();
  plug.add(model);
  plug.name = `Wall_plug_${index + 1}`;
  plug.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...PLUG_BASIS));
  plug.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  parent.add(plug);
  plug.position.set(0, 0, 0);
  plug.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(plug);
  const centre = box.getCenter(new THREE.Vector3());

  // Pins buried in the plate: the plug's near face lands on the socket itself.
  const target = socket.clone().add(PLUG_SEAT);
  const anchor = new THREE.Vector3(centre.x, centre.y, box.min.z);

  const delta = target.sub(anchor);
  const origin = parent.worldToLocal(new THREE.Vector3());
  plug.position.copy(parent.worldToLocal(delta).sub(origin));
  plug.updateMatrixWorld(true);

  // Where the cord leaves the gland: the bottom of the hanging body at its free end,
  // the ribbed tail pointing away from the plate — not the middle of the body, which
  // left the flex hanging alongside the plug rather than growing out of it.
  const seated = new THREE.Box3().setFromObject(plug);
  const seatedCentre = seated.getCenter(new THREE.Vector3());
  return new THREE.Vector3(
    seatedCentre.x,
    seated.min.y + CABLE_RADIUS,
    seated.max.z - CABLE_RADIUS
  );
}

/**
 * The two points a plug goes into, on the front face of the outlet's plate. Read off
 * the outlet's own bounds so they follow it if it is moved along the wall.
 */
function socketPoints(outlet) {
  const box = new THREE.Box3().setFromObject(outlet);
  const centre = box.getCenter(new THREE.Vector3());

  return SOCKET_HEIGHTS.map((height) => new THREE.Vector3(
    centre.x,
    THREE.MathUtils.lerp(box.min.y, box.max.y, height),
    box.max.z
  ));
}

/** Sets the strip's underside on the floor, centred on its spot. */
function layOnFloor(strip, spec, floorY) {
  const box = new THREE.Box3().setFromObject(strip);
  const centre = box.getCenter(new THREE.Vector3());

  const target = new THREE.Vector3(spec.x, floorY, spec.z);
  const anchor = new THREE.Vector3(centre.x, box.min.y, centre.z);

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(anchor);
  const parent = strip.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  strip.position.copy(parent.worldToLocal(delta).sub(origin));
  strip.updateMatrixWorld(true);
}

/**
 * Draws one cord along its authored route. The shape of the run — out of the plug,
 * down the wall, coiled on the floor and into the strip — lives in `ROUTES`; this is
 * only what turns it into a tube.
 */
function runCable(parent, index) {
  // `buildCable` keeps the route on the mesh, which is what lets edit mode drag the
  // cord's own points rather than shove the whole tube about.
  return buildCable({
    name: `Power_strip_cable_${index + 1}`,
    points: ROUTES[index].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    radius: CABLE_RADIUS,
    material: new THREE.MeshStandardMaterial({ name: `strip_cable_${index + 1}`, ...CABLE_SPEC }),
    parent,
  });
}

