import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * Six books on the desk's right-hand side, past the paper tablet: a stack of three
 * Cambridge IELTS Academic 19s, and Python Programming, Legendary and Daisy Darker
 * lying loose beside it. Run `npm run convert Random_Books` to (re-)import the model.
 *
 * The Sketchfab source is a pile of twelve books, one node per book (`Buku1`…`Buku12`,
 * Indonesian for "book"), each a cover mesh (`BookCoverN`) over a paper block
 * (`BookPaper`). Four shapes are kept and the rest cut out of the file:
 *
 *     npm run shrink:parts -- books --drop <the other eight BookCoverN> \
 *         --keep BookPaper,BookCover2,BookCover4,BookCover10,BookCover12 512 85
 *
 * The covers themselves are not the source's: `scripts/book-covers.py` composes each
 * one from a jpg of the real book in tmp/3DObjects/ (front fitted to the mesh's front
 * region, spine and back in the cover's own colour) and `scripts/bake-book-covers.mjs`
 * writes them into the GLB in place of the originals, as WebP (`EXT_texture_webp`,
 * which GLTFLoader reads natively) — 6.3 MB down to 190 KB. Which
 * material carries which book is in `book-covers.py`; the mesh names here only say
 * which *shape* a book has. The other eight paper blocks are still in the file — the
 * cut works by material and they share `BookPaper` — but at 24 triangles each they are
 * not worth a pass of their own, and nothing below ever picks them up.
 *
 * The pile is pulled apart at load time: each entry lifts its node out into a group of
 * its own and gets its own place, so the six are independent props — dress one in edit
 * mode and the others stay put. A node may be used more than once (the IELTS stack is
 * the same shape three times). The source stands the books *upright*, front cover
 * facing −z; the +90° pitch in each entry lays them face up, and the 180° in the yaw
 * turns the top of the cover away from the chair. Both are applied before anything is
 * measured.
 */

const MODEL_URL = 'models/books.glb';

/**
 * The six books, in world centimetres and degrees — set by hand in edit mode and
 * copied out of its readout, the rotation in that readout's own `YXZ` order. The +90°
 * on x is what lays the upright source face up; the y is the yaw each was put down at,
 * 180 being "top of the cover away from the chair". Absolute, like the room's other
 * dressed props: move the desk and they stay where they are, and re-dressing them in
 * edit mode is how they follow.
 *
 * `node` is the shape's node in the source, `width` how wide the cover reads on the
 * desk — the source is about twice life size, so each is measured and scaled rather
 * than trusted. `scale`, when present, is the editor's own per-axis scale on top of that
 * fit, straight from the readout. An entry with `stackOn` sits on top of the named book
 * instead of on the desk: its `position` y is ignored and taken from that book's top.
 */
const BOOKS = [
  // Cambridge IELTS Academic 19, three copies in a stack — all at the size the bottom
  // one was dressed to.
  { name: 'IELTS_1', node: 'Buku4', width: 19, position: [136.1, 85.5, -6.1], rotation: [90, 90.2, 0], scale: [0.606, 0.612, 0.404] },
  { name: 'IELTS_2', node: 'Buku4', width: 19, stackOn: 'IELTS_1', position: [136.6, 0, -6.4], rotation: [90, 94, 0], scale: [0.606, 0.612, 0.404] },
  { name: 'IELTS_3', node: 'Buku4', width: 19, stackOn: 'IELTS_2', position: [135.7, 0, -5.7], rotation: [90, 88.3, 0], scale: [0.606, 0.612, 0.404] },
  // Python Programming – Beginners Guide.
  { name: 'Book_Python', node: 'Buku2', width: 15, position: [71.5, 67.3, -59.4], rotation: [90, 164.5, 0] },
  // Legendary (Stephanie Garber), on top of the book set's Set_Book_2 stack.
  { name: 'Book_Legendary', node: 'Buku10', width: 15, position: [135.6, 93.4, -44.3], rotation: [89.2, 87.6, -23], scale: [0.616, 0.577, 1.709] },
  // Daisy Darker (Alice Feeney), on top of the book set's Set_Book_4.
  { name: 'Book_DaisyDarker', node: 'Buku12', width: 14, position: [134.6, 87.2, -23.0], rotation: [90, 78.7, 0], scale: [0.820, 0.830, 0.842] },
];

/** The covers' finish: matte print — no shine, and none of the source's constant maps. */
const FINISH = { roughness: 0.85, metalness: 0 };

/** Loads the pile, splits the six books out of it and lays each where it was left. */
export async function addBooks(parent) {
  const gltf = await loadGLB(MODEL_URL);
  const finished = new Map();
  const books = new Map();

  for (const spec of BOOKS) {
    if (!gltf.scene.getObjectByName(spec.node)) {
      console.warn(`[books] no node "${spec.node}" in ${MODEL_URL} — ${spec.name} skipped`);
      continue;
    }
    // Entries are in order, so a book stacked on another comes after it.
    const under = spec.stackOn ? books.get(spec.stackOn) : null;
    if (spec.stackOn && !under) {
      console.warn(`[books] ${spec.name} stacks on "${spec.stackOn}", which is not placed — skipped`);
      continue;
    }
    books.set(spec.name, placeBook(parent, isolate(gltf.scene, spec.node, finished), spec, under));
  }

  return [...books.values()];
}

/**
 * A copy of the loaded scene with every book but `keep` cut out of it. The copy shares
 * geometry with the source, so three of them cost three sets of nodes, not three
 * meshes — and the source's node chain (`Sketchfab_model/Root/…`) stays intact, which
 * is what keeps the book's own transform right.
 */
function isolate(scene, keep, finished) {
  const copy = scene.clone();
  const stale = [];
  copy.traverse((node) => {
    if (/^Buku\d+$/.test(node.name) && node.name !== keep) stale.push(node);
  });
  for (const node of stale) node.removeFromParent();

  copy.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.material = refinish(node.material, finished);
  });
  return copy;
}

/**
 * Wraps one isolated book in a group whose origin is the centre of its underside, so
 * that `spec.position` is the point it rests on — the desk, or the top of `under` when
 * it is stacked. The group is parented and laid flat before measuring: the model root
 * carries a chain of rotations and scales, so a box taken while it is still detached
 * would be in the wrong frame.
 */
function placeBook(parent, copy, spec, under = null) {
  const book = new THREE.Group();
  book.name = spec.name;
  book.add(copy);

  const [pitch, yaw, roll] = spec.rotation.map(THREE.MathUtils.degToRad);
  parent.add(book);
  book.position.set(0, 0, 0);
  // Pitched but not yet yawed, so the box below is the book's own width by its
  // height rather than the diagonal of a turned one.
  book.rotation.set(pitch, 0, 0, 'YXZ');
  book.updateMatrixWorld(true);

  // Scale so the cover reads `width` across: after the pitch the two horizontal
  // extents are its width and its height, and the shorter is the width.
  let box = new THREE.Box3().setFromObject(book);
  const size = box.getSize(new THREE.Vector3());
  const across = Math.min(size.x, size.z);
  if (across > 0) copy.scale.multiplyScalar(spec.width / across);
  book.rotation.set(pitch, yaw, roll, 'YXZ');
  book.updateMatrixWorld(true);

  // Recentre: shift the copy inside the group so the group's origin sits under the
  // middle of the book's bottom face. Measured in the group's own frame, so the shift
  // holds whatever yaw the book is put down at.
  box = new THREE.Box3().setFromObject(book);
  const centre = box.getCenter(new THREE.Vector3());
  const bottom = new THREE.Vector3(centre.x, box.min.y, centre.z);
  copy.position.sub(book.worldToLocal(bottom.clone()));
  // The editor's scale, if the book was resized there. Applied about the group's
  // origin — the underside's centre — so the book stays on its point.
  if (spec.scale) book.scale.fromArray(spec.scale);
  book.updateMatrixWorld(true);

  // The placement is world-space but `parent` carries an offset of its own, so it has to
  // be converted into its local space.
  const at = new THREE.Vector3().fromArray(spec.position);
  if (under) at.y = new THREE.Box3().setFromObject(under).max.y;
  book.position.copy(parent.worldToLocal(at));
  book.updateMatrixWorld(true);

  return book;
}

/**
 * Clones the source material once per name with the print finish above. The base
 * colour map stays; the metallic/roughness maps go — the source's are single-value
 * images, so constants say the same thing for nothing. And because they are authored,
 * `darkenScene()` is told to leave the material alone.
 */
function refinish(material, finished) {
  const known = finished.get(material.name);
  if (known) return known;

  const copy = material.clone();
  copy.roughnessMap = null;
  copy.metalnessMap = null;
  copy.roughness = FINISH.roughness;
  copy.metalness = FINISH.metalness;
  copy.userData.keepColor = true;
  copy.needsUpdate = true;
  finished.set(material.name, copy);
  return copy;
}
