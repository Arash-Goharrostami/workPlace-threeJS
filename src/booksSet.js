import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A second set of books on the desk's right: four closed ones among the pile, and one
 * lying open in front of it.
 * Run `npm run convert Books_Set_1` to (re-)import the model, then
 * `npm run shrink booksSet1 1024 75` — the source is six meshes sharing one 2048²
 * cover map that was 1.0 MB of a 1.1 MB file; at 1024² and Draco'd it is 196 KB.
 *
 * The Sketchfab source is one node per book (`Book_1`…`Book_4`, `Open_Book_1`,
 * `Open_Book_2`), each carrying a single mesh, all on the one `Book_Mat` material. Like
 * `books.js`, the set is pulled apart at load time: each entry lifts its node out into
 * a group of its own, so the books are independent props — dress one in edit mode and
 * the others stay put. The closed books stand upright in the source, cover facing ±x;
 * the 90° roll in their entries lays them face up. The open ones already lie flat and
 * only need a yaw. Rotations are applied before anything is measured.
 */

export const MODEL_URL = 'models/booksSet1.glb';

/**
 * The five books used, in world centimetres and degrees, rotation in the editor readout's
 * `YXZ` order. Absolute, like the room's other dressed props: move the desk and they
 * stay where they are, and re-dressing them in edit mode is how they follow.
 *
 * `node` is the book's node in the source; `across` is the shorter of its two
 * horizontal extents once laid flat — a closed book's cover width, an open one's page
 * height — since the source is not to scale and each is measured and fitted rather
 * than trusted. `scale`, when present, is the editor's own per-axis scale on top of
 * that fit. An entry with `stackOn` sits on the named book instead of the desk: its
 * `position` y is ignored and taken from that book's top.
 */
const BOOKS = [
  // Two closed books stacked beside the IELTS pile, with Legendary on top of them.
  { name: 'Set_Book_1', node: 'Book_1', across: 16, position: [135.0, 86.8, -45.7], rotation: [0, -179.7, 90], scale: [0.875, 0.875, 0.875] },
  { name: 'Set_Book_2', node: 'Book_2', across: 15, stackOn: 'Set_Book_1', position: [136.3, 0, -45.5], rotation: [0, 4.7, 90], scale: [0.908, 0.908, 0.908] },
  { name: 'Set_Book_3', node: 'Book_3', across: 17, position: [132.0, 85.5, -44.9], rotation: [0, -171.3, 90] },
  // Under Daisy Darker.
  { name: 'Set_Book_4', node: 'Book_4', across: 16, position: [134.1, 85.5, -23.9], rotation: [0, 164.6, 90] },
  // The one open book, lying in front of the pile.
  { name: 'Set_OpenBook_2', node: 'Open_Book_2', across: 20, position: [94.8, 85.5, 25.8], rotation: [0, -96.4, 0], scale: [1.189, 1.067, 1.196] },
];

/** The covers' finish: matte print — no shine, and none of the source's constant maps. */
const FINISH = { roughness: 0.85, metalness: 0 };

/** Loads the set, splits the books out of it and lays each where it was left. */
export async function addBooksSet(parent) {
  const gltf = await loadGLB(MODEL_URL);
  const finished = new Map();
  const books = new Map();

  for (const spec of BOOKS) {
    if (!gltf.scene.getObjectByName(spec.node)) {
      console.warn(`[book set] no node "${spec.node}" in ${MODEL_URL} — ${spec.name} skipped`);
      continue;
    }
    // Entries are in order, so a book stacked on another comes after it.
    const under = spec.stackOn ? books.get(spec.stackOn) : null;
    if (spec.stackOn && !under) {
      console.warn(`[book set] ${spec.name} stacks on "${spec.stackOn}", which is not placed — skipped`);
      continue;
    }
    books.set(spec.name, placeBook(parent, isolate(gltf.scene, spec.node, finished), spec, under));
  }

  return [...books.values()];
}

/**
 * A copy of the loaded scene with every book but `keep` cut out of it. The copy shares
 * geometry with the source, so five of them cost five sets of nodes, not five meshes —
 * and the source's node chain (`Sketchfab_model/…/RootNode/…`) stays intact, which is
 * what keeps the book's own transform right.
 */
function isolate(scene, keep, finished) {
  const copy = scene.clone();
  const stale = [];
  copy.traverse((node) => {
    if (/^(Open_)?Book_\d+$/.test(node.name) && node.name !== keep) stale.push(node);
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
 * carries a chain of rotations, so a box taken while it is still detached would be in
 * the wrong frame.
 */
function placeBook(parent, copy, spec, under = null) {
  const book = new THREE.Group();
  book.name = spec.name;
  book.add(copy);

  const [pitch, yaw, roll] = spec.rotation.map(THREE.MathUtils.degToRad);
  parent.add(book);
  book.position.set(0, 0, 0);
  // Laid flat but not yet yawed, so the box below is the book's own extents rather
  // than the diagonal of a turned one.
  book.rotation.set(pitch, 0, roll, 'YXZ');
  book.updateMatrixWorld(true);

  // Scale so the shorter horizontal extent reads `across`.
  let box = new THREE.Box3().setFromObject(book);
  const size = box.getSize(new THREE.Vector3());
  const shorter = Math.min(size.x, size.z);
  if (shorter > 0) copy.scale.multiplyScalar(spec.across / shorter);
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
 * colour map stays; the metallic/roughness maps go. And because it is authored,
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
