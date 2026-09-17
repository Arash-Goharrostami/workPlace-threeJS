import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { PANEL } from './proDisplay.js';
import { loadFace } from './resume/screen.js';

/**
 * Two sticky notes stuck to the main display's bezel, each with a line in handwriting.
 * Run `npm run convert low_poly_sticky_notes` to (re-)import the model.
 *
 * The Sketchfab source (CC-BY, "low poly sticky notes" by 6amsunset) is two curled
 * squares of 32 triangles each, no maps and no UVs — 4 KB as a GLB, so it is not put
 * through the shrink pass. Both are used, alternately, so the notes do not all curl
 * the same way. Each is lying flat, face up, about 17.5 m across at the exporter's
 * scale; it is measured and scaled to a real 3-inch note.
 *
 * The writing is a canvas per note in Caveat, the hand the resume screen already
 * loads from `public/fonts/`, mapped with a planar UV set laid over the square — the
 * mesh has none of its own. The colour is the material's; the canvas is the paper.
 *
 * Placed against the panel's front face, by fractions of it rather than in world
 * centimetres, so the notes ride with the display wherever `MAIN_DISPLAY_ANCHOR` puts
 * it — until one is dressed in edit mode, when its readout goes in as an absolute
 * `position`/`rotation` and wins. Each note sits directly under the room model, not in
 * a group of its own: the editor picks the piece directly under the model, so a group
 * would move both at once.
 */

export const MODEL_URL = 'models/stickyNotes.glb';

/** A real 3-inch note, in this scene's centimetres. */
const NOTE_SIZE = 7.6;

/**
 * The notes. `anchor` is where the note's centre sits on the panel's front face, as
 * fractions across (0 left, 1 right) and up (0 bottom, 1 top); `tilt` is the roll in
 * degrees, so they look stuck on by hand rather than set by a machine.
 *
 * A note dressed in edit mode carries `position` and `rotation` instead — world
 * centimetres and degrees, the rotation in the readout's own `YXZ` order — and those
 * take precedence over `anchor`/`tilt`.
 */
const NOTES = [
  { text: 'English class\nSun & Wed', colour: 0xfff176, position: [8.2, 114.8, -107.6], rotation: [87, 90, 86] },
  { text: 'Remember:\n18 March!', colour: 0xfff176, position: [-0.4, 114.6, -107.4], rotation: [88.3, 90, 89] },
];

/** How far the note stands off the glass, so it never z-fights with it. */
const STANDOFF = 0.15;

const INK = '#2b2b33';
const FACE = 'Caveat';

/** Loads the shapes, writes each note and sticks it to the display. */
export async function addStickyNotes(parent, display) {
  if (!display) return null;
  const panel = display.getObjectByName(PANEL);
  if (!panel) {
    console.warn(`[sticky notes] display has no "${PANEL}" node — nothing to stick to`);
    return null;
  }

  const [gltf] = await Promise.all([loadGLB(MODEL_URL), loadFace(FACE)]);
  const shapes = [];
  gltf.scene.traverse((node) => {
    if (node.isMesh) shapes.push(node);
  });
  if (!shapes.length) throw new Error('no meshes in the sticky notes model');

  // The panel's picture is the biggest face of its box; the notes go on the +z side,
  // which is the one that faces the chair.
  const face = new THREE.Box3().setFromObject(panel);

  return NOTES.map((spec, i) => {
    const note = makeNote(shapes[i % shapes.length], spec);
    note.name = `Sticky_note_${i + 1}`;
    parent.add(note);

    let at;
    if (spec.position) {
      at = new THREE.Vector3().fromArray(spec.position);
      note.rotation.set(...spec.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
    } else {
      const [u, v] = spec.anchor;
      at = new THREE.Vector3(
        THREE.MathUtils.lerp(face.min.x, face.max.x, u),
        THREE.MathUtils.lerp(face.min.y, face.max.y, v),
        face.max.z + STANDOFF
      );
      // Pitched up off the flat so its face looks down the room, then rolled by hand.
      note.rotation.set(Math.PI / 2, 0, THREE.MathUtils.degToRad(spec.tilt), 'YXZ');
    }
    // The placement is world-space but `parent` carries an offset of its own, so it
    // has to be converted into its local space.
    note.position.copy(parent.worldToLocal(at));
    note.updateMatrixWorld(true);
    return note;
  });
}

/**
 * One note: the shape re-centred on the middle of its back, scaled to NOTE_SIZE, given
 * a planar UV set and the paper drawn for it.
 */
function makeNote(shape, spec) {
  const geometry = shape.geometry.clone();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());

  // Origin to the centre of the underside, and the exporter's scale to a real note.
  const centre = box.getCenter(new THREE.Vector3());
  geometry.translate(-centre.x, -box.min.y, -centre.z);
  const scale = NOTE_SIZE / Math.max(size.x, size.z);
  geometry.scale(scale, scale, scale);

  // The mesh comes without UVs: lay the paper over the square, top of the page at the
  // far (−z) edge — which after the pitch is the top of the note.
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  const half = (NOTE_SIZE / 2);
  for (let i = 0; i < position.count; i += 1) {
    uv[2 * i] = (position.getX(i) + half) / NOTE_SIZE;
    uv[2 * i + 1] = 1 - (position.getZ(i) + half) / NOTE_SIZE;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    name: 'sticky_note',
    color: spec.colour,
    map: paper(spec.text),
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  material.userData.keepColor = true;

  const note = new THREE.Mesh(geometry, material);
  note.castShadow = true;
  note.receiveShadow = true;
  return note;
}

/**
 * The paper: white, so the material's colour is the note's, with the text written on
 * it in ink. Multi-line, centred, and turned a degree or two off square so the hand
 * reads as a hand.
 */
function paper(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const lines = text.split('\n');
  const size = lines.length > 2 ? 88 : 104;
  ctx.font = `600 ${size}px ${FACE}, "Bradley Hand", "Segoe Script", cursive`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(THREE.MathUtils.degToRad(-2));
  const leading = size * 1.15;
  const top = -((lines.length - 1) * leading) / 2;
  lines.forEach((line, i) => ctx.fillText(line, 0, top + i * leading));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
