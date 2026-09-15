import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { buildCable } from './cable.js';

/**
 * Mains leads: a moulded plug at one end of a run, an appliance connector at the other
 * and a flex drawn between them. The counterpart of `usbCable.js`, and built the same
 * way, so a room can have as many as it needs — where a particular one runs belongs to
 * the module that asks for it.
 *
 * Only the two connectors come from the pack. Its own moulded flex is left behind: a
 * cable drawn with `buildCable()` follows a route that can be dressed in edit mode and
 * pasted back into the source, which a baked mesh cannot.
 */

const MODEL_URL = 'models/powerCable.glb';

/** The plug that goes in the wall, and the appliance end that goes in the machine. */
const PLUG_PART = 'polySurface89';
const SOCKET_PART = 'polySurface90';

/** A moulded plug's length with its strain relief, in centimetres. */
const PLUG_LENGTH = 6.2;

/** As thick as the strips' own cords. */
const CABLE_RADIUS = 0.36;

/** Black rubber and black moulding, matte. */
const CABLE_SPEC = { color: 0x121214, roughness: 0.72, metalness: 0.05 };
const CONNECTOR_SPEC = { color: 0x141416, roughness: 0.55, metalness: 0.1 };

/** The pack, loaded once however many leads are asked for. */
let pack = null;

/**
 * Builds one lead. `route` is the world-space run, plug end first; `ends` optionally
 * carries a hand-dressed `{ position, rotation, scale }` for either end — a plug in a
 * real socket sits at an angle the run's own direction does not give. `color` swaps the
 * black for another colour on flex and connectors alike; given, it is taken as authored
 * and `darkenScene()` leaves it, where the default black is left to the room-wide tint.
 */
export async function addMainsCable({ parent, name, route, ends = [], color }) {
  const [plugPart, socketPart] = await Promise.all([
    connectorPart(PLUG_PART),
    connectorPart(SOCKET_PART),
  ]);
  if (!plugPart || !socketPart) return null;

  const points = route.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  if (points.length < 2) return null;

  const seat = (which, authored) => (authored ? fixed(authored) : tip(points, which));
  const endA = place(parent, plugPart, `${name}_plug`, seat('start', ends[0]), color);
  const endB = place(parent, socketPart, `${name}_head`, seat('end', ends[1]), color);

  const flex = new THREE.MeshStandardMaterial({ name: `${name}_flex`, ...CABLE_SPEC });
  if (color !== undefined) {
    flex.color.set(color);
    flex.userData.keepColor = true;
  }
  const cable = buildCable({
    name: `${name}_cable`,
    points,
    radius: CABLE_RADIUS,
    material: flex,
    parent,
  });
  parent.add(cable);

  return { endA, endB, cable };
}

/** One connector on its own, scaled to life size and pointing along +x. */
async function connectorPart(partName) {
  pack ??= loadGLB(MODEL_URL);
  const gltf = await pack;
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const node = source.getObjectByName(partName)
    ?? source.getObjectByName(`${partName}_phong4_0`);
  if (!node) return null;

  // Lifted with the turns its parents carry baked in: the conversion leaves a chain of
  // rotated nodes above it, and taking it on its own would drop them.
  const part = node.clone(true);
  part.position.set(0, 0, 0);
  part.quaternion.identity();
  part.scale.set(1, 1, 1);
  part.applyMatrix4(node.matrixWorld.clone());

  // Multiplied into the scale the baked matrix left on it, not written over it — the
  // pack is authored many times life size, and replacing that factor shrinks the
  // connector to a speck.
  const size = new THREE.Box3().setFromObject(part).getSize(new THREE.Vector3());
  part.scale.multiplyScalar(PLUG_LENGTH / Math.max(size.x, size.y, size.z));
  return part;
}

/**
 * Where one end sits and which way it faces: at its end of the run, pointing away from
 * the cord — the pins go into the socket, the cord leaves the back — and set forward
 * by half its own length so the flex meets its gland rather than its middle.
 */
function tip(points, which) {
  const [at, next] = which === 'start'
    ? [points[0], points[1]]
    : [points[points.length - 1], points[points.length - 2]];

  const forward = at.clone().sub(next).normalize();
  return {
    position: at.clone().addScaledVector(forward, PLUG_LENGTH / 2),
    forward,
  };
}

/** A hand-dressed end, as edit mode reports it — degrees, in the readout's own order. */
function fixed({ position, rotation, scale }) {
  return {
    position: new THREE.Vector3().fromArray(position),
    rotation: new THREE.Euler(...rotation.map(THREE.MathUtils.degToRad), 'YXZ'),
    scale,
  };
}

/** Repaints one end, centres it on its own middle and sets it where it belongs. */
function place(parent, model, name, { position, forward, rotation, scale }, color) {
  const group = new THREE.Group();
  group.name = name;
  group.add(model.clone(true));
  if (scale) group.scale.fromArray(scale);

  const paint = new THREE.MeshStandardMaterial({ name: `${name}_shell`, ...CONNECTOR_SPEC });
  if (color !== undefined) paint.color.set(color);
  // An authored finish — darkenScene() must not tint it a second time.
  paint.userData.keepColor = true;
  group.traverse((node) => {
    if (!node.isMesh) return;
    node.material = paint;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // Parented before measuring: the part carries the pack's own offset, so a box taken
  // while it is still detached would be in the wrong frame.
  parent.add(group);
  group.position.set(0, 0, 0);
  group.updateMatrixWorld(true);

  // That offset is still inside the part, which would leave the group's origin off in
  // the model's space — the gizmo would sit away from the connector and a turn would
  // swing it round that far-off point.
  const centre = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  group.children[0].position.sub(group.worldToLocal(centre));

  if (rotation) group.rotation.copy(rotation);
  else group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), forward);
  group.position.copy(parent.worldToLocal(position.clone()));
  group.updateMatrixWorld(true);

  return group;
}
