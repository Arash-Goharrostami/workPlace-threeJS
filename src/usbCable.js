import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { buildCable } from './cable.js';

/**
 * USB-C leads: a Type-C plug at each end and a flex drawn between them. Run
 * `npm run convert USB-C_Charging_Cable_Type-C__Type-C` to (re-)import the model.
 *
 * One lead per call, so the room can have as many as it needs — this is the part that
 * knows what a USB-C cable *is*; where any particular one runs belongs to the module
 * that asks for it.
 *
 * Only the connector assembly is taken from the model. Its own moulded flex is left
 * behind: a cable drawn with `buildCable()` follows a route that can be dressed in
 * edit mode and pasted back into the source, which a baked mesh cannot.
 */

/**
 * `npm run shrink -- usbCable 1024 85 --only Cube_002_8` took it from 269 KB to 15 KB.
 * Only the connector is taken from this file — the cord is drawn by `buildCable()` — and
 * it was 3,092 of the pack's 13,352 triangles, the rest being the cable and a second,
 * unused connector. `CONNECTOR_PART` below is the name that decides what survives, and it
 * names a parent node rather than a mesh: its four meshes hang off it as `Object_4`
 * onwards.
 */
const MODEL_URL = 'models/usbCable.glb';

/**
 * The connector assembly in the pack — moulding, strain relief and the metal tongue.
 * The pack holds two identical ones; either does, and both ends of every lead are
 * clones of it.
 */
const CONNECTOR_PART = 'Cube_002_8';

/**
 * A real Type-C plug with its strain relief, in centimetres. The model arrives in its
 * own units, so the assembly is fitted by measurement rather than by a scale factor.
 */
const CONNECTOR_LENGTH = 2.4;

/**
 * Exported because a plug seated on someone else's run has to know how long it is: the
 * tip goes half a plug past the last point of the cord, or the flex meets its middle
 * instead of its gland. `tip()` below does exactly that for the runs this module owns.
 */
export const TYPE_C_LENGTH = CONNECTOR_LENGTH;

/** A charging lead is thinner than a mains cord — about 3 mm across. */
const CABLE_RADIUS = 0.16;

/**
 * White jacket and white moulding, the way Apple's own leads come — a shade under
 * paper so it still reads as plastic in a room lit by one lamp, and matte, because a
 * charging lead has no gloss to it.
 */
const CABLE_SPEC = { color: 0xe8e8e4, roughness: 0.75, metalness: 0.02 };
const CONNECTOR_SPEC = { color: 0xf0f0ec, roughness: 0.6, metalness: 0.04 };

/**
 * The pack, loaded once however many leads are asked for. Kept as the promise rather
 * than the result so two calls in flight at the same time still share one load.
 */
let pack = null;

/**
 * Builds one lead: `route` is the world-space run the flex takes, and a Type-C plug is
 * set on each of its two ends — the way the model itself is built, a connector at both
 * tips of one cord.
 *
 * The plugs are not placed independently of the route: each is put at its end of the
 * run and aimed along it, tongue outwards, so it always meets the flex however the
 * route is later dressed. Moving a route's first or last point in edit mode is
 * therefore how a plug is moved.
 */
export async function addUsbCable({ parent, name, route, ends = [] }) {
  const connector = await connectorPart();
  if (!connector) return null;

  const points = route.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  if (points.length < 2) return null;

  // An end is aimed along the run unless it has been dressed by hand — a plug pushed
  // into a real socket sits at an angle the cord's direction does not give.
  const seat = (which, authored) => (authored ? fixed(authored) : tip(points, which));
  const endA = place(parent, connector.clone(true), `${name}_end_a`, seat('start', ends[0]));
  const endB = place(parent, connector.clone(true), `${name}_end_b`, seat('end', ends[1]));

  const cable = buildCable({
    name: `${name}_cable`,
    points,
    radius: CABLE_RADIUS,
    material: new THREE.MeshStandardMaterial({ name: `${name}_flex`, ...CABLE_SPEC }),
    parent,
  });
  parent.add(cable);

  return { endA, endB, cable };
}

/**
 * One Type-C plug on its own, for the ends that belong to no run of ours — a lead
 * disappearing behind the desk, a spare left lying on the top. `forward` is the way
 * its tongue points; the cord would leave the opposite way.
 *
 * `finish` overrides the white moulding for a lead that is not one of Apple's white
 * ones: the HomePod mini's is captive and comes in the speaker's own colour, and a
 * paper-white plug on the end of a space-grey braid reads as the wrong cable.
 *
 * `rotation` and `scale` are the other half of `ends` on a lead, offered here too: a plug
 * pushed into a real socket sits at an angle and a depth the cord's own direction does
 * not give, and once one has been dressed in edit mode the readout has all three. Give
 * them and `forward` is ignored — they say everything it would have derived.
 */
export async function addTypeCPlug({
  parent, name, position, forward = [1, 0, 0], rotation, scale, finish,
}) {
  const connector = await connectorPart();
  if (!connector) return null;

  const seat = rotation
    ? fixed({ position, rotation, scale })
    : {
      position: new THREE.Vector3().fromArray(position),
      forward: new THREE.Vector3().fromArray(forward).normalize(),
    };

  return place(parent, connector.clone(true), name, { ...seat, finish });
}

/**
 * Where one plug sits and which way it faces: at its end of the run, pointing away
 * from the cord — the tongue goes into the socket, the cord leaves the back — and set
 * forward by half its own length so the flex meets its gland rather than its middle.
 */
function tip(points, which) {
  const [at, next] = which === 'start'
    ? [points[0], points[1]]
    : [points[points.length - 1], points[points.length - 2]];

  const forward = at.clone().sub(next).normalize();
  return {
    position: at.clone().addScaledVector(forward, CONNECTOR_LENGTH / 2),
    forward,
  };
}

/**
 * The connector on its own, scaled to life size and standing at the origin, pointing
 * along +x — the tongue leads, the cord leaves at the back.
 */
async function connectorPart() {
  pack ??= loadGLB(MODEL_URL);
  const gltf = await pack;
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const node = source.getObjectByName(CONNECTOR_PART);
  if (!node) return null;

  // Lifted with the turns its parents carry baked in: the conversion leaves a chain of
  // rotated nodes above it, and taking it on its own would drop them.
  const part = node.clone(true);
  part.position.set(0, 0, 0);
  part.quaternion.identity();
  part.scale.set(1, 1, 1);
  part.applyMatrix4(node.matrixWorld.clone());

  // Multiplied into the scale the baked matrix left on it, not written over it: the
  // pack is authored about forty times life size, and replacing that factor rather
  // than compounding with it shrank the plug to a speck.
  const size = new THREE.Box3().setFromObject(part).getSize(new THREE.Vector3());
  part.scale.multiplyScalar(CONNECTOR_LENGTH / Math.max(size.x, size.y, size.z));
  return part;
}

/**
 * A hand-dressed end, as edit mode reports it: world position, rotation in degrees in
 * the readout's own `YXZ` order, and the scale it was resized to.
 */
function fixed({ position, rotation, scale }) {
  return {
    position: new THREE.Vector3().fromArray(position),
    rotation: new THREE.Euler(...rotation.map(THREE.MathUtils.degToRad), 'YXZ'),
    scale,
  };
}

/** Repaints one end, centres it on its own middle and sets it where it belongs. */
function place(parent, model, name, { position, forward, rotation, scale, finish }) {
  const group = new THREE.Group();
  group.name = name;
  group.add(model);
  if (scale) group.scale.fromArray(scale);

  const paint = new THREE.MeshStandardMaterial({
    name: `${name}_shell`,
    ...(finish ?? CONNECTOR_SPEC),
  });
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
  // the model's space — the gizmo would sit away from the plug and a turn would swing
  // it round that far-off point. Shifted here until the origin is the plug's own
  // centre, which is what the transform's position then means.
  const centre = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  model.position.sub(group.worldToLocal(centre));

  // The connector is modelled pointing along +x, so a derived end is turned from that
  // onto the direction the run leaves in; a dressed one carries its own angles.
  if (rotation) group.rotation.copy(rotation);
  else group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), forward);
  group.position.copy(parent.worldToLocal(position.clone()));
  group.updateMatrixWorld(true);

  return group;
}
