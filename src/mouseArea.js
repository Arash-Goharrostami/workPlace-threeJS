import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { buildFeltMat } from './deskMat.js';

/**
 * A small felt pad on the desktop with the Magic Mouse on it, ported from the
 * WorkDesk3D project's magic-mouse.js.
 *
 * Unlike everything else imported here the mouse is an OBJ, authored in millimetres,
 * Y-up, standing on y = 0 with its long axis along z.
 */

const OBJ_URL = 'models/magic-mouse.obj';

/** Metres (the mat's authored units) to this scene's centimetres. */
const SCALE = 100;

/** The pad: landscape, sized to the open desktop between the riser and the front. */
const PAD_WIDTH = 0.44;
const PAD_DEPTH = 0.31;

/**
 * Where the pad sits: X measured from the desk's centre, Z in world units. The
 * desktop's surface here runs z -130 to -52 and the riser ends at -95, so this
 * leaves a margin at both the riser and the front edge.
 */
const PAD_X = -0.2;
const PAD_Z = -68.9;

/** The pad reads darker than the keyboard mat — a tint over the same felt. */
const PAD_TINT = 0x9a9aa0;

/** Set down by hand, not aligned to the desk. */
const MOUSE_TILT = THREE.MathUtils.degToRad(-12);

/** Apple's published size, in metres — see the note on the per-axis fit below. */
const MM_LENGTH = 0.1135; // front to back, the nose at -z
const MM_WIDTH = 0.0571;  // across, at its widest
const MM_HEIGHT = 0.0216; // at the high point

/**
 * The top is glossy black — low roughness so the room actually reflects in it —
 * over the flatter anodised base the trackpad shares.
 */
const SHELL_SPEC = { color: 0x08080a, roughness: 0.1, metalness: 0.3 };
const BODY_SPEC = { color: 0x202024, roughness: 0.85, metalness: 0.05 };

/**
 * The parts worth keeping. The model has its interior modelled — a switch, a sensor,
 * a chrome ring, an inner chassis — none of which belongs at this scale. On a Magic
 * Mouse the clear acrylic top *is* the outer surface, so `glass_top` / `glass_edges`
 * are the skin (rendered opaque; there is nothing worth seeing through), with
 * `aluminium` as the base. Everything else is dropped.
 */
const SHELL_PARTS = new Set(['glass_top', 'glass_edges']);
const BASE_PARTS = new Set(['aluminium']);

/** Lays the pad on the desktop and sets the mouse on it. */
export async function addMouseArea(parent, desk) {
  if (!desk) return null;

  desk.updateMatrixWorld(true);
  const deskBox = new THREE.Box3().setFromObject(desk);
  const centre = deskBox.getCenter(new THREE.Vector3());

  const pad = buildFeltMat(PAD_WIDTH, PAD_DEPTH, PAD_TINT);
  pad.name = 'Mouse_mat';
  pad.scale.setScalar(SCALE);
  seat(parent, pad, new THREE.Vector3(centre.x + PAD_X, deskBox.max.y, PAD_Z));

  const mouse = await loadMouse();
  mouse.rotation.y = MOUSE_TILT;

  const padBox = new THREE.Box3().setFromObject(pad);
  const padCentre = padBox.getCenter(new THREE.Vector3());
  seat(parent, mouse, new THREE.Vector3(padCentre.x, padBox.max.y, padCentre.z));

  return { pad, mouse };
}

/** Loads the OBJ, keeps only the skin, and fits it to Apple's published size. */
async function loadMouse() {
  const loaded = await new OBJLoader().loadAsync(OBJ_URL);

  const shell = new THREE.MeshStandardMaterial({ name: 'mm_shell', ...SHELL_SPEC });
  const base = new THREE.MeshStandardMaterial({ name: 'mm_base', ...BODY_SPEC });
  // Authored finishes — darkenScene() must not re-tint them.
  shell.userData.keepColor = true;
  base.userData.keepColor = true;

  const root = new THREE.Group();
  root.name = 'Magic_Mouse';

  // The whole file is one `g`, so the loader hands back a single mesh carrying every
  // material at once: the split lives in `geometry.groups`, each a run of vertices
  // and the material it belongs to. The parts are therefore picked out by slicing
  // those runs, not by mesh name — and each material's runs are scattered through
  // the file, so they are gathered and concatenated into one geometry each.
  const collect = (into, source, start, count) => {
    ['position', 'normal', 'uv'].forEach((key) => {
      const attribute = source.getAttribute(key);
      if (!attribute) return;
      const { itemSize } = attribute;
      (into[key] ??= { itemSize, chunks: [] }).chunks.push(
        attribute.array.subarray(start * itemSize, (start + count) * itemSize)
      );
    });
  };

  const parts = { 'mouse shell': {}, 'mouse base': {} };
  loaded.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    child.geometry.groups.forEach(({ start, count, materialIndex }) => {
      const name = materials[materialIndex]?.name;
      const target = SHELL_PARTS.has(name)
        ? 'mouse shell'
        : BASE_PARTS.has(name) ? 'mouse base' : null;
      if (target) collect(parts[target], child.geometry, start, count);
    });
  });

  for (const [name, attributes] of Object.entries(parts)) {
    const geometry = new THREE.BufferGeometry();
    for (const [key, { itemSize, chunks }] of Object.entries(attributes)) {
      const total = chunks.reduce((n, chunk) => n + chunk.length, 0);
      const array = new Float32Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        array.set(chunk, offset);
        offset += chunk.length;
      }
      geometry.setAttribute(key, new THREE.BufferAttribute(array, itemSize));
    }
    const mesh = new THREE.Mesh(geometry, name === 'mouse base' ? base : shell);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // The model runs 1-3% over Apple's published size, and not by the same amount on
  // every axis, so it is fitted per axis rather than scaled uniformly — everything
  // else in this scene measures true. The distortion that costs is under two parts
  // in a hundred. The extra SCALE takes metres to this scene's centimetres.
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  root.scale.set(
    (MM_WIDTH / size.x) * SCALE,
    (MM_HEIGHT / size.y) * SCALE,
    (MM_LENGTH / size.z) * SCALE
  );

  return root;
}

/**
 * Rests an object's footprint centre on `target`. Parented before measuring — the
 * model root carries an offset, so a box taken while detached is in the wrong frame.
 */
function seat(parent, object, target) {
  parent.add(object);
  object.position.set(0, 0, 0);
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const anchor = box.getCenter(new THREE.Vector3());
  anchor.y = box.min.y;

  const delta = target.clone().sub(anchor);
  const origin = parent.worldToLocal(new THREE.Vector3());
  object.position.copy(parent.worldToLocal(delta).sub(origin));
  object.updateMatrixWorld(true);
}
