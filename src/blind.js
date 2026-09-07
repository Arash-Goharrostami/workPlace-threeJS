import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { steelMaterial } from './deskAccessories.js';

/**
 * The roller blind from `tmp/Blind_curtain.usdz`, hung in the room's window. Run
 * `npm run convert -- Blind_curtain` to rebuild the GLB from the usdz.
 *
 * A blind has to *cover* an opening rather than stand on a surface, so unlike the
 * other props this one is fitted: measured after loading, turned to face the room,
 * and scaled to the window it finds. Nothing about the model's own size or
 * orientation is assumed — the converter's output is whatever Blender made of the
 * source, so it is all read back off the loaded bounds.
 */

const MODEL_URL = 'models/Blind_curtain.glb';

/**
 * How far inside the glazing the blind is held, all round. The window's frame
 * members are about 4 units thick, so this lands the blind in the reveal rather than
 * lapped over the frame.
 */
const REVEAL_INSET = 4;

/** Gap between the blind's back and the wall it is fixed to — the brackets' reach. */
const STANDOFF = 3;

/**
 * How much wider than the opening the blind hangs. A blind laps its reveal rather
 * than dying exactly on it; still applied uniformly, because this model must not be
 * stretched (see `fitToOpening`).
 */
const OVERSIZE = 1.15;

/**
 * How far above the window's head the headrail's top is mounted. Enough to clear the
 * head entirely, so the blind is fixed to the wall rather than sitting in the glass.
 */
const HEAD_RISE = 22;

/**
 * The blind's own colours. The source model is white gloss throughout, which reads
 * far too bright against this room — the fabric goes to a deep grey and everything
 * else (headrail, end caps, roller) to near black, matching the brackets.
 *
 * Keyed by the material names the converted GLB carries: `Tejido` is the fabric,
 * `Blanco_brillo` the white-gloss hardware.
 */
const PAINT = {
  Tejido: { color: 0x585d66, roughness: 0.95, metalness: 0 },
  Blanco_brillo: { color: 0x141416, roughness: 0.5, metalness: 0.3 },
};

/** The two arms carrying the roller: a plate on the wall and the arm out to it. */
const BRACKET = {
  thickness: 2.4,
  height: 7,
  // Set in from the headrail's ends so the arms land under it, not past it.
  inset: 6,
};

/** Loads the blind and fits it to the window opening. */
export async function addBlind(model) {
  const win = model.getObjectByName('window');
  if (!win) return null;

  const opening = openingOf(win);
  if (!opening) return null;

  // The blind is fixed to the wall above the head, so that wall — not the frame — is
  // what everything below is measured against.
  const wallFace = mountWallFaceOf(model, win);
  if (wallFace === null) return null;

  const gltf = await loadGLB(MODEL_URL);

  const blind = gltf.scene;
  blind.name = 'Window_blind';
  blind.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    paint(node);
  });

  // Parented before measuring: the model root carries an offset, so a box taken
  // while the blind is still detached would be in the wrong frame.
  model.add(blind);
  blind.position.set(0, 0, 0);
  blind.updateMatrixWorld(true);

  faceTheRoom(blind);
  fitToOpening(blind, opening, win, wallFace);
  mountBrackets(blind, model, wallFace);

  return blind;
}

/**
 * The window's glazed opening. Its largest child by face area is the pane that fills
 * the frame; the opening is that pane pulled in by the frame's own thickness.
 */
function openingOf(win) {
  let pane = null;
  for (const child of win.children) {
    const box = new THREE.Box3().setFromObject(child);
    const size = box.getSize(new THREE.Vector3());
    const area = size.y * size.z;
    if (!pane || area > pane.area) pane = { box, area };
  }
  if (!pane) return null;

  const box = pane.box.clone();
  box.min.add(new THREE.Vector3(0, REVEAL_INSET, REVEAL_INSET));
  box.max.sub(new THREE.Vector3(0, REVEAL_INSET, REVEAL_INSET));
  return box;
}

/**
 * The room-side face of the wall the window sits in — the surface the blind is fixed
 * to. The wall is found by overlap with the window rather than by name, the way the
 * rest of the room's geometry is located.
 *
 * Containment is the wrong test here: the window group carries a sill board that runs
 * wider than the wall itself, so the window's box is not inside the wall's.
 */
function mountWallFaceOf(model, win) {
  const walls = model.getObjectByName('walls');
  if (!walls) return null;

  const winBox = new THREE.Box3().setFromObject(win);
  let best = null;
  for (const child of walls.children) {
    if (child.name === 'floor' || child.name === 'ceiling') continue;
    const box = new THREE.Box3().setFromObject(child);
    const overlap = overlapVolume(box, winBox);
    if (!best || overlap > best.overlap) best = { box, overlap };
  }
  if (!best || best.overlap <= 0) return null;

  // Of the wall's two faces, the room's is whichever is nearer the window's own
  // room-side edge.
  const { min, max } = best.box;
  return Math.abs(min.x - winBox.min.x) <= Math.abs(max.x - winBox.min.x) ? min.x : max.x;
}

function overlapVolume(a, b) {
  const span = (axis) =>
    Math.max(0, Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]));
  return span('x') * span('y') * span('z');
}

/**
 * Turns the blind so its width runs along z, across this window. The converted model
 * may come out either way round, so the decision is made from its measured bounds:
 * whichever horizontal axis is longer is its width.
 */
function faceTheRoom(blind) {
  const size = new THREE.Box3().setFromObject(blind).getSize(new THREE.Vector3());
  if (size.x <= size.z) return;
  blind.rotation.y = Math.PI / 2;
  blind.updateMatrixWorld(true);
}

/**
 * Scales the blind to the opening's width and hangs it from the head, held off the
 * glass.
 *
 * The scale is **uniform**: the model keeps its own proportions and hangs at its
 * authored drop. Fitting the height to the window as well is what a first pass did,
 * and it stretched the blind more than five times against its width — the model is
 * authored rolled up, so forcing it down the full opening distorts it badly.
 *
 * A quarter turn about y maps local x onto world z, so driving the scale off the
 * width gives the same result whichever way `faceTheRoom` left it.
 */
function fitToOpening(blind, opening, win, wallFace) {
  const current = new THREE.Box3().setFromObject(blind).getSize(new THREE.Vector3());
  const wanted = opening.getSize(new THREE.Vector3());

  const width = (wanted.z / Math.max(current.z, 1e-6)) * OVERSIZE;
  blind.scale.setScalar(width);
  blind.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(blind);
  const center = box.getCenter(new THREE.Vector3());

  // Mounted on the wall above the window's head, centred across the opening, and
  // stood off that wall into the room — the room is its low-x side.
  const head = opening.max.y;
  const target = new THREE.Vector3(
    wallFace - STANDOFF,
    head + HEAD_RISE,
    opening.getCenter(new THREE.Vector3()).z
  );
  const anchor = new THREE.Vector3(box.max.x, box.max.y, center.z);

  const delta = target.sub(anchor);
  const parent = blind.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  blind.position.copy(parent.worldToLocal(delta).sub(origin));
  blind.updateMatrixWorld(true);
}

/**
 * The two arms that carry the roller: a plate flat on the wall and an arm reaching out
 * to the blind's back. Built here rather than loaded — it is four boxes, and the
 * source model ships no mounting hardware of its own.
 */
function mountBrackets(blind, model, wallFace) {
  const box = new THREE.Box3().setFromObject(blind);
  const steel = steelMaterial();
  const reach = wallFace - box.max.x;
  if (reach <= 0) return null;

  const group = new THREE.Group();
  group.name = 'Blind_brackets';

  // At the roller's own height, so the arms read as carrying its weight.
  const y = box.max.y - BRACKET.height;

  for (const side of [-1, 1]) {
    const z = side * (box.max.z - BRACKET.inset - BRACKET.thickness / 2);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(reach, BRACKET.height, BRACKET.thickness),
      steel
    );
    arm.position.set(box.max.x + reach / 2, y, z);
    arm.castShadow = true;
    arm.receiveShadow = true;
    group.add(arm);

    // A wider plate where the arm meets the wall, as a fixing would have.
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(BRACKET.thickness, BRACKET.height * 1.6, BRACKET.thickness * 2.5),
      steel
    );
    plate.position.set(wallFace - BRACKET.thickness / 2, y, z);
    plate.castShadow = true;
    plate.receiveShadow = true;
    group.add(plate);
  }

  model.add(group);
  // The arms above are positioned in world coordinates, but the model they hang off
  // carries its own offset — so the group sits at where the world origin lands in the
  // model's own space, which cancels that offset exactly.
  group.position.copy(model.worldToLocal(new THREE.Vector3()));
  group.updateMatrixWorld(true);

  return group;
}

/**
 * Repaints the model's white-gloss materials to the room's palette. Safe to mutate in
 * place: this GLB is loaded once, so nothing else shares these materials.
 *
 * `keepColor` opts them out of `darkenScene()` — the colours here are authored, and
 * that pass would tint them a second time.
 */
function paint(mesh) {
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    const spec = PAINT[material?.name];
    if (!spec) continue;
    material.color.setHex(spec.color);
    material.roughness = spec.roughness;
    material.metalness = spec.metalness;
    material.userData.keepColor = true;
  }
}
