import * as THREE from 'three';

/**
 * Which prop stands in for which section, and how the camera looks at it.
 *
 * Unlike the wireframe room this is modelled on, nothing here is a hardcoded
 * coordinate: every prop in this scene is *placed* by its own module off the desk's
 * or a wall's live bounds, so a hand-typed camera position would drift the first time
 * a desk constant changed. Instead each anchor names a prop and is resolved against
 * that prop's world bounding box at load time — see `buildAnchors`.
 *
 * The viewing direction is derived the same way: props sit around the edges of the
 * room, so standing between the room's centre and the prop and looking outward frames
 * anything against a wall or on the desk. `dir` overrides that for the few props where
 * it does not (something in the middle of the room, or one better seen from above).
 *
 * | field      | meaning                                                          |
 * | ---------- | ---------------------------------------------------------------- |
 * | `prop`     | `Object3D.name` of the prop, as set by its own module            |
 * | `label`    | the section's name, shown in the dock and the HUD                |
 * | `view`     | the HUD line while the section is open                           |
 * | `distance` | multiplier on the fitted distance (1 = the prop just fills view) |
 * | `dir`      | optional world-space direction from the prop to the camera       |
 * | `lift`     | optional extra camera height, in units of the prop's own height  |
 */
const ANCHORS = {
  skills: {
    prop: 'MacBook_Pro_16',
    label: 'Stack',
    view: 'Detail — MacBook Pro',
    distance: 2.4,
    lift: 0.6,
  },
  experience: {
    prop: 'Pro_Display_XDR',
    label: 'Experience',
    view: 'Detail — Pro Display XDR',
    distance: 1.9,
    lift: 0.15,
  },
  projects: {
    prop: 'Mac_Pro',
    label: 'Projects',
    view: 'Detail — Mac Pro',
    distance: 2.6,
    lift: 0.5,
  },
  resume: {
    prop: '3D_printer',
    label: 'CV',
    view: 'Detail — 3D printer',
    distance: 2.4,
    lift: 0.35,
  },
  blog: {
    prop: 'iPad_Pro',
    label: 'Writing',
    view: 'Detail — iPad Pro',
    distance: 3.2,
    // Nearly flat on the desk, so it is read from above rather than edge-on.
    dir: [0.35, 1, 0.35],
    lift: 0,
  },
  contact: {
    prop: 'iPhone_15_Pro',
    label: 'Contact',
    view: 'Detail — iPhone, top-down',
    distance: 3.4,
    dir: [0.25, 1, 0.25],
    lift: 0,
  },
  about: {
    prop: 'Guitar_on_stand',
    label: 'About',
    view: 'Detail — guitar',
    distance: 1.8,
    lift: 0.1,
  },
  testimonials: {
    prop: 'AirPods_Max',
    label: 'References',
    view: 'Detail — AirPods Max',
    distance: 3.6,
    lift: 0.5,
  },
  education: {
    prop: 'Apple_Watch_SE',
    label: 'Education',
    view: 'Detail — Apple Watch',
    distance: 4.5,
    dir: [0.3, 1, 0.3],
    lift: 0,
  },
};

/** How much room is left around a framed prop; 1 would touch the viewport edges. */
const FRAME_MARGIN = 1.15;

/** A prop nearer the camera than this is being framed too tightly to orbit around. */
const MIN_DISTANCE = 0.35;

/**
 * Resolves every anchor against the props the scene actually ended up with.
 *
 * Each prop module loads asynchronously and swallows its own failures (see
 * `loadModel.js`), so any one of them can legitimately be missing — an anchor whose
 * prop did not load is dropped rather than throwing, and the room simply has one
 * fewer readable prop.
 *
 * @returns {Object<string, {object, label, view, cam: THREE.Vector3, tgt: THREE.Vector3}>}
 */
export function buildAnchors(model, camera) {
  const roomBox = new THREE.Box3().setFromObject(model);
  const roomCenter = roomBox.getCenter(new THREE.Vector3());

  const resolved = {};
  for (const [key, spec] of Object.entries(ANCHORS)) {
    const object = findProp(model, spec.prop);
    if (!object) {
      console.warn(`[resume] no prop named "${spec.prop}" — dropping the ${key} section`);
      continue;
    }
    resolved[key] = frame(object, spec, roomCenter, camera);
  }
  return resolved;
}

/** The section keys, in the order they should appear in the dock. */
export const SECTION_ORDER = Object.keys(ANCHORS);

/**
 * Finds a prop by name, tolerating the loaders that append a suffix to keep names
 * unique (`deskApple.js` names its three models straight, but a GLB re-import can
 * arrive as `iPad_Pro_1`). An exact hit always wins over a prefix one.
 */
function findProp(model, name) {
  const exact = model.getObjectByName(name);
  if (exact) return exact;

  let prefixed = null;
  model.traverse((node) => {
    if (!prefixed && node.name.startsWith(name)) prefixed = node;
  });
  return prefixed;
}

/** Works out where the camera flies to, from the prop's own bounding box. */
function frame(object, spec, roomCenter, camera) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1e-3);

  // Inward from the prop toward the middle of the room: the only side of a prop
  // standing against a wall that the camera can actually get to.
  const dir = spec.dir
    ? new THREE.Vector3(...spec.dir).normalize()
    : new THREE.Vector3(center.x - roomCenter.x, 0, center.z - roomCenter.z);
  // A prop sitting dead centre gives a zero-length vector; fall back to the room's
  // default three-quarter view rather than dividing by zero.
  if (dir.lengthSq() < 1e-6) dir.set(1, 0.55, 1);
  dir.normalize();

  const fov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 1;
  const fitHeight = radius / Math.sin(fov / 2);
  const fitWidth = radius / Math.sin(Math.atan(Math.tan(fov / 2) * aspect));
  const distance = Math.max(
    MIN_DISTANCE,
    Math.max(fitHeight, fitWidth) * FRAME_MARGIN * (spec.distance ?? 1)
  );

  const cam = center.clone().addScaledVector(dir, distance);
  cam.y += size.y * (spec.lift ?? 0);

  return { object, label: spec.label, view: spec.view, cam, tgt: center };
}
