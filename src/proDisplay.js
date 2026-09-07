import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * The Apple Pro Display XDR from the WorkDesk3D project, standing on the monitor
 * riser. Run `npm run apple` to (re-)import the model and its Draco decoder.
 *
 * Like the MacBook, the source is authored in metres, Y-up, standing on y = 0 and
 * centred on its stand's footprint — so it only needs scaling and seating.
 */

const MODEL_URL = 'models/pro-display-xdr.glb';

/** Metres (the model's units) to this scene's centimetres. */
const SCALE = 100;

/**
 * Nudges across and along the riser. The display sits off its centre, slid along
 * the riser towards the laptop rather than squarely in the middle of it.
 */
const OFFSET = new THREE.Vector2(18, 0);

/**
 * The stand's shell, by its name in the source asset — the exporter left the mesh
 * names obfuscated, and the GLB is vendored under `public/models`, so the name is as
 * stable as the file itself.
 */
const STAND_SHELL = 'GkERnwlKXemCPLQ006_2';

/** Loads the display and stands it on the riser's top surface. */
export async function addProDisplay(parent, riser) {
  if (!riser) return null;

  const gltf = await loadGLB(MODEL_URL);

  const display = gltf.scene;
  display.name = 'Pro_Display_XDR';
  display.scale.setScalar(SCALE);
  display.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // Parented before measuring: the model root carries an offset, so a box taken
  // while the display is still detached would be in the wrong frame.
  parent.add(display);
  display.position.set(0, 0, 0);
  display.updateMatrixWorld(true);

  fixStandShading(display);
  standOnRiser(display, riser);

  return display;
}

/**
 * Repairs the stand's shading. Its shell is one big fan triangulation and ships with
 * authored normals that fan out with it, which from behind reads as four bright
 * shards radiating from the cable opening. The geometry itself is sound — only the
 * normals are wrong — so they are recomputed from the faces, which leaves the front
 * as it was and makes the back match it.
 */
function fixStandShading(display) {
  const shell = display.getObjectByName(STAND_SHELL);
  if (shell) shell.geometry.computeVertexNormals();
}

/** Sits the display's foot on the riser's top face, centred on it. */
function standOnRiser(display, riser) {
  riser.updateMatrixWorld(true);

  const top = riser.getObjectByName('riser top');
  if (!top) return;

  const box = new THREE.Box3().setFromObject(display);
  const target = top.getWorldPosition(new THREE.Vector3());
  target.x += OFFSET.x;
  target.z += OFFSET.y;

  const anchor = new THREE.Vector3(
    box.getCenter(new THREE.Vector3()).x,
    box.min.y,
    box.getCenter(new THREE.Vector3()).z
  );

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(anchor);
  const parent = display.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  display.position.copy(parent.worldToLocal(delta).sub(origin));
  display.updateMatrixWorld(true);
}
