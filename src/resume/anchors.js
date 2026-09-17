import * as THREE from 'three';
import { screenFace } from './screen.js';
import { NARROW_WINDOW } from './notesApp.js';

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
 * | `fit`      | `'screen'` frames the prop's lit panel, `'face'` an upright flat prop, `'flat'` one lying on the desk |
 * | `dir`      | optional world-space direction from the prop to the camera       |
 * | `lift`     | optional extra camera height, in units of the prop's own height  |
 * | `narrowWidth` | optional: on a narrow screen, the share of the panel's width to frame — for a window drawn smaller than its screen there |
 * | `narrowDistance` | optional: the `distance` used instead on a narrow screen           |
 */

/** The breakpoint the screens change their layout on; the framing follows it. */
const NARROW = window.matchMedia('(max-width: 760px)');
const ANCHORS = {
  skills: {
    prop: 'MacBook_Pro_16',
    label: 'Stack',
    view: 'Detail — MacBook Pro',
    // Read off the laptop's own screen (see `screen.js`), so the lid's panel is what
    // is framed rather than the whole machine — the keyboard half is half the
    // bounding box and none of the text. `lift` goes with it: the raised camera was
    // there to look down *at* the laptop, which is the wrong angle for reading it.
    fit: 'screen',
    // Looser than the portrait display's: the lid is a wide panel read at an angle, so
    // the fitted distance alone put its corners past the edges of the viewport.
    distance: 1.5,
    // On a phone the fit is width-bound and that margin leaves the lid small: closer.
    narrowDistance: 1.05,
    lift: 0,
  },
  experience: {
    prop: 'Pro_Display_XDR',
    label: 'Experience',
    view: 'Detail — Pro Display XDR',
    // Read off the display itself (see `screen.js`) — the roles and the personal work
    // are one page on the room's main screen, so the panel is what is framed rather
    // than the prop, whose box takes in the stand and leaves the text small.
    fit: 'screen',
    distance: 1.12,
    lift: 0,
    // On a phone the Notes window stands in the middle of the display at a fraction of
    // its width (see `notesApp.js`), and it is the window that is framed, not the panel.
    narrowWidth: NARROW_WINDOW,
  },
  resume: {
    // The paper tablet on the desk *is* the CV — one A4 sheet drawn from the same copy
    // (`paperTablet.js`) — so the section flies to it rather than to the printer it
    // used to stand in for.
    prop: 'Paper_tablet',
    label: 'CV',
    view: 'Detail — paper tablet',
    // Read straight down, as a sheet on a desk is: any lean puts perspective into the
    // page and it reads as a trapezoid. The tilt left is just enough to pin the
    // camera's roll — so the clip, at the back of the desk, is the top of the viewport —
    // and `flat` fits the sheet's own length and width rather than its thickness.
    fit: 'flat',
    distance: 1,
    dir: [0, 1, 0.02],
    lift: 0,
  },
  blog: {
    prop: 'iPad_Pro',
    label: 'Writing',
    view: 'Detail — iPad Pro',
    // Read off the tablet's own glass (see `slabFace` in `screen.js`): the posts are
    // painted on it, so the glass is what fills the viewport, not the desk around it.
    // No `dir`: a flat screen's is derived — over the glass, leaning toward the reader.
    fit: 'screen',
    distance: 1.15,
    lift: 0,
  },
  contact: {
    prop: 'iPhone_15_Pro',
    label: 'Contact',
    view: 'Detail — iPhone',
    // Read off the phone's own screen, so the glass fills the viewport rather than
    // sitting small on the desk: the app icons on it are what this section is (see
    // `phoneApps.js`), and they have to be big enough to aim at — and to tap.
    fit: 'screen',
    distance: 1.08,
    // The phone lies face-up, so it is read from above. The tilt off vertical is small
    // but deliberate: straight down leaves the camera's roll — which way up the phone
    // reads on screen — to rounding error against the world's up vector.
    dir: [-0.023, 1, 0.227],
    lift: 0,
  },
  about: {
    prop: 'Pro_Display_XDR_2',
    label: 'About',
    view: 'Detail — portrait display',
    // Read off the screen itself (see `screen.js`), so the panel is what is framed —
    // not the prop, whose bounding sphere takes in the stand and the bezel and leaves
    // the text small in the middle. The derived direction would put the camera behind
    // the office chair, which stands between this display and the middle of the room.
    fit: 'screen',
    distance: 1.12,
    dir: [0.62, 0.16, 1],
    lift: 0,
  },
  education: {
    // The composition on the back wall, which carries the LPIC-3 print (see
    // `wallFrames.js`) — the certificates are the section, so the frames read for it in
    // a way the watch on the desk never did.
    prop: 'Wall_frames',
    label: 'Education & References',
    view: 'Detail — wall frames',
    // Framed as the flat rectangle it is, so the composition fills the viewport — and
    // fits on width by itself on a phone, since the fit divides by the camera's aspect.
    fit: 'face',
    distance: 1,
    // No `dir`: the group hangs upright on the back wall, so the derived direction —
    // outward from the middle of the room — is already face-on to it.
    lift: 0,
  },
  story: {
    // The chalk mural on the *outer* face of the back wall (`wallStory.js`): found from
    // the wide shot, when the camera swings round behind the room, and read there.
    prop: 'Wall_story',
    label: 'About this place',
    view: 'Detail — the back wall',
    fit: 'face',
    // Looser than the frames: chalk on a wall wants some concrete round it, and the
    // fitted distance alone put the title and the signature against the edges.
    distance: 1.35,
    // On a phone the fit is width-bound and the mural is set to fill the wall's face,
    // so only the frame's own margin is left round it.
    narrowDistance: 1.0,
    // The one prop the inward line cannot reach: it faces away from the room, so the
    // camera stands outside, off the wall's -z face, looking back at the concrete.
    dir: [0, 0, -1],
    lift: 0,
  },
};

/** How much room is left around a framed prop; 1 would touch the viewport edges. */
const FRAME_MARGIN = 1.15;

/** A prop nearer the camera than this is being framed too tightly to orbit around. */
const MIN_DISTANCE = 0.35;

/** The middle of the room, which every anchor's viewing direction is derived from. */
export function roomCenterOf(model) {
  return new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
}

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
  const roomCenter = roomCenterOf(model);

  const resolved = {};
  for (const [key, spec] of Object.entries(ANCHORS)) {
    const object = findProp(model, spec.prop);
    if (!object) {
      console.warn(`[resume] no prop named "${spec.prop}" — dropping the ${key} section`);
      continue;
    }
    resolved[key] = frameAnchor(object, spec, roomCenter, camera);
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

/**
 * Works out where the camera flies to, from the prop's own bounding box. Exported
 * because the wall frames build an anchor per print at click time (see
 * `wallFrameFocus.js`), and those have to be fitted by the same maths as the anchors
 * in this table rather than by a second copy of it that drifts.
 */
/**
 * How far a flat screen's camera leans off straight-down, toward the reader — in units
 * of the screen's own normal. Enough to fix which way is up; not so much that the page
 * reads as a trapezoid.
 */
const FLAT_LEAN = 0.25;

export function frameAnchor(object, spec, roomCenter, camera) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1e-3);

  // A prop is framed by its bounding sphere, which is right for something looked *at*.
  // A screen is read, so it is framed as the flat rectangle it is: fitted to the
  // viewport's own shape, which is what decides whether its width or its height is
  // the tight one. `distance` is then the margin left around it.
  // `screen` reads the prop's own lit panel; `face` takes the flat rectangle the box
  // already describes, for something that *is* a flat rectangle — a picture on a wall.
  // Either way the prop is framed as the rectangle it is read as rather than by its
  // bounding sphere, whose radius carries the diagonal and leaves it small in view.
  const face =
    spec.fit === 'screen'
      ? screenFace(object)
      : spec.fit === 'face'
        ? boxFace(size)
        : spec.fit === 'flat'
          ? flatFace(size)
          : null;
  // A window drawn narrower than its screen on a phone is what is read there, so it is
  // what is fitted. It stands centred, so the centre holds.
  if (face && spec.narrowWidth && NARROW.matches) face.width *= spec.narrowWidth;
  // Inward from the prop toward the middle of the room: the only side of a prop
  // standing against a wall that the camera can actually get to. Taken the other way
  // round it put the camera through the back wall for everything on the desk, which is
  // most of the room — the section opened onto the outside face of the concrete.
  // A screen lying flat — the tablet — is the one prop the inward line cannot frame:
  // its picture faces up, so the camera goes over it instead, leaning a little toward
  // the reader's side (the picture's bottom) so its roll is pinned and the page sits
  // upright on screen. A `dir` in the table still overrides either.
  const flatScreen = face && Math.abs(face.normal?.y ?? 0) > 0.9;
  const dir = spec.dir
    ? new THREE.Vector3(...spec.dir).normalize()
    : flatScreen
      ? face.normal.clone().addScaledVector(face.up, -FLAT_LEAN)
      : new THREE.Vector3(roomCenter.x - center.x, 0, roomCenter.z - center.z);
  // A prop sitting dead centre gives a zero-length vector; fall back to the room's
  // default three-quarter view rather than dividing by zero.
  if (dir.lengthSq() < 1e-6) dir.set(1, 0.55, 1);
  dir.normalize();

  const fov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 1;

  const fitHeight = face
    ? face.height / 2 / Math.tan(fov / 2)
    : radius / Math.sin(fov / 2);
  const fitWidth = face
    ? face.width / 2 / (Math.tan(fov / 2) * aspect)
    : radius / Math.sin(Math.atan(Math.tan(fov / 2) * aspect));
  const margin =
    NARROW.matches && spec.narrowDistance != null ? spec.narrowDistance : spec.distance ?? 1;
  const distance = Math.max(
    MIN_DISTANCE,
    Math.max(fitHeight, fitWidth) * (spec.fit === 'screen' ? 1 : FRAME_MARGIN) * margin
  );

  const tgt = face?.centre ? face.centre.clone() : center;
  const cam = tgt.clone().addScaledVector(dir, distance);
  cam.y += size.y * (spec.lift ?? 0);

  return { object, label: spec.label, view: spec.view, cam, tgt };
}

/**
 * Re-fits every anchor in place — same objects, new `cam`/`tgt` — for when the framing
 * has to change after load: the fit divides by the camera's aspect and honours
 * `narrowWidth`, and both turn on the breakpoint. In place, so every reference the
 * resume holds to an anchor stays good.
 */
export function reframeAnchors(anchors, model, camera) {
  const roomCenter = roomCenterOf(model);
  for (const [key, anchor] of Object.entries(anchors)) {
    Object.assign(anchor, frameAnchor(anchor.object, ANCHORS[key], roomCenter, camera));
  }
}

/**
 * A bounding box read as the upright rectangle the prop presents, for the wall-hung
 * things this mode is for: height is the box's own height and width is whichever
 * ground axis is not its thickness. The thickness is dropped rather than fitted — a
 * print on a wall is millimetres deep, and keeping it would put the diagonal back into
 * the fit, which is the bounding-sphere framing this mode exists to avoid.
 *
 * `centre` is null: unlike a screen's face, this rectangle is the box, so `frameAnchor`
 * keeps aiming at the box's own centre.
 */
function boxFace(size) {
  return { width: Math.max(size.x, size.z), height: size.y, centre: null };
}

/**
 * The same, for something lying flat on the desk and read from above — the paper
 * tablet. There the box's height is its thickness, and the rectangle the camera fits
 * is the footprint: the long ground axis runs up the viewport and the short one across
 * it, which is how a portrait page is read.
 */
function flatFace(size) {
  return {
    width: Math.min(size.x, size.z),
    height: Math.max(size.x, size.z),
    centre: null,
  };
}
