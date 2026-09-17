import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { buildCable } from './cable.js';

/**
 * The Mac Pro's mains lead: a plug in the near strip's end socket, a loop of slack
 * left on the tiles, and the appliance end up at the tower's inlet. Run
 * `npm run convert Power_cable_hight-poly` to (re-)import the connectors.
 *
 * Only the two ends come from that model — `polySurface89` is the moulded plug and
 * `polySurface90` the appliance connector. The flex between them is drawn here with
 * `buildCable()`, so the run can be dressed in edit mode like the wall cords.
 */

/**
 * Only the plug and socket are taken from this file — the run between them is drawn by
 * `buildCable()`. That turned out to be almost the whole model: 228,128 of its 240,032
 * triangles were three `curve3` meshes drawing a cable nothing loads, and
 * `npm run shrink -- powerCable 1024 85 --only polySurface89,polySurface90` dropped them,
 * taking the file from 4.86 MB to 33 KB. Both connectors keep every one of their 11,904
 * triangles, so nothing that is actually rendered changed.
 */
export const MODEL_URL = 'models/powerCable.glb';

/** The parts worth keeping out of the pack; everything else is the model's own flex. */
const PLUG_PART = 'polySurface89';
const SOCKET_PART = 'polySurface90';

/**
 * Where each end sits and how big it is, in world space: position in centimetres,
 * rotation in degrees and the scale the model itself is drawn at. Set by hand in edit
 * mode and copied out of its readout — the rotations in the readout's own `YXZ` order,
 * which is how they are put back on below.
 *
 * Absolute, like the wall cords' routes: move the strip or the tower and the lead
 * stays where it is. Re-dressing it in edit mode and pasting the numbers back here is
 * the way to follow them.
 */
const PLUG_TRANSFORM = {
  position: [131.9, 9.7, -80.8],
  rotation: [0, 116.4, 0],
  scale: [0.024, 0.024, 0.024],
};

const HEAD_TRANSFORM = {
  position: [112.8, 13.0, -95.4],
  rotation: [88.8, 88.8, -92],
  scale: [0.029, 0.025, 0.029],
};

/** The cord's own run, from the plug to the inlet — the same dressing, 23 points. */
const ROUTE = [
  [131.98, 12.76, -80.71],
  [131.45, 14.94, -80.78],
  [130.62, 15.46, -80.72],
  [129.79, 14.88, -80.66],
  [128.80, 12.32, -80.45],
  [127.98, 6.17, -78.19],
  [127.88, 5.76, -74.44],
  [127.74, 5.76, -70.94],
  [127.53, 5.76, -67.89],
  [127.21, 5.76, -65.52],
  [126.17, 5.76, -64.31],
  [124.63, 5.76, -64.38],
  [123.54, 5.76, -65.63],
  [122.72, 5.76, -68.42],
  [122.09, 5.76, -72.30],
  [120.66, 5.76, -77.15],
  [119.10, 5.76, -82.85],
  [117.44, 5.76, -89.22],
  [115.71, 5.76, -96.06],
  [113.94, 5.76, -101.70],
  [113.15, 10.03, -102.06],
  [112.81, 12.40, -100.65],
  [112.75, 13.01, -98.30],
];

/** Black rubber and black moulding — the finish the other plugs in the room wear. */
const CONNECTOR_SPEC = { color: 0x141416, roughness: 0.55, metalness: 0.1 };
const CABLE_SPEC = { color: 0x121214, roughness: 0.72, metalness: 0.05 };
const CABLE_RADIUS = 0.36;

/** Loads the two ends, sets them where they were left, and runs the flex between them. */
export async function addMacProCable(parent) {
  const gltf = await loadGLB(MODEL_URL);
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const plugModel = partOf(source, PLUG_PART);
  const socketModel = partOf(source, SOCKET_PART);
  if (!plugModel || !socketModel) return null;

  const plug = place(parent, plugModel, 'Mac_Pro_plug', PLUG_TRANSFORM);
  const head = place(parent, socketModel, 'Mac_Pro_inlet_plug', HEAD_TRANSFORM);

  const cable = buildCable({
    name: 'Mac_Pro_cable',
    points: ROUTE.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    radius: CABLE_RADIUS,
    material: new THREE.MeshStandardMaterial({ name: 'mac_pro_cable', ...CABLE_SPEC }),
    parent,
  });
  parent.add(cable);

  return { plug, head, cable };
}

/** Lifts one named part out of the pack, with the turns its parents carry baked in. */
function partOf(source, name) {
  const node = source.getObjectByName(name)
    ?? source.getObjectByName(`${name}_phong4_0`);
  if (!node) return null;

  const part = node.clone(true);
  part.position.set(0, 0, 0);
  part.quaternion.identity();
  part.scale.set(1, 1, 1);
  part.applyMatrix4(node.matrixWorld.clone());
  return part;
}

/** Scales, repaints, centres and seats one end at its authored world transform. */
function place(parent, model, name, transform) {
  const group = new THREE.Group();
  group.name = name;
  group.add(model);
  group.scale.fromArray(transform.scale);

  const paint = new THREE.MeshStandardMaterial({ name: `${name}_black`, ...CONNECTOR_SPEC });
  // An authored finish — darkenScene() must not tint it a second time.
  paint.userData.keepColor = true;
  group.traverse((node) => {
    if (!node.isMesh) return;
    node.material = paint;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // Parented before measuring: the part carries its pack's offset, so a box taken
  // while it is still detached would be in the wrong frame.
  parent.add(group);
  group.position.set(0, 0, 0);
  group.updateMatrixWorld(true);

  // The pack's own offset is still inside the part, which would leave this group's
  // origin somewhere off in the model's space — the gizmo would sit away from the
  // connector, and a turn would swing it round that far-off point. So the part is
  // shifted within the group until the group's origin is the connector's own centre,
  // which is also what the authored position below means.
  const centre = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  model.position.sub(group.worldToLocal(centre));

  // The transform is world-space and the parent carries an offset of its own.
  group.rotation.set(
    ...transform.rotation.map(THREE.MathUtils.degToRad),
    'YXZ'
  );
  group.position.copy(parent.worldToLocal(new THREE.Vector3().fromArray(transform.position)));
  group.updateMatrixWorld(true);

  return group;
}
