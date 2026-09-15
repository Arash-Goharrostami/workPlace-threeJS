import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * The rug from the WorkDesk3D project, laid on the floor under the chair. Run
 * `npm run apple` to (re-)import the model.
 *
 * Authored in metres, lying on y = 0 and centred on its own footprint, 240 x 170 cm
 * with the long side along x — which is parallel to this desk, so it needs no turn.
 */

const MODEL_URL = 'models/carpet.glb';

/** Metres (the model's units) to this scene's centimetres. */
const SCALE = 100;

/**
 * How much of its authored size the rug is laid at — 90% of 240 x 170, so about
 * 216 x 153 cm.
 *
 * Note what this costs: the desk's forward arm reaches z 67 for x >= 80, so any rug
 * wider than about 130 and centred on the chair keeps a corner under that arm however
 * far forward it is pulled. At 55% it cleared the desk entirely; at 90% it does not,
 * and its right-hand corner runs beneath the arm. That is the deliberate trade for a
 * rug that reads at a believable size.
 *
 * Kept separate from SCALE so the metres → centimetres conversion stays legible.
 */
const FIT = 0.9;

/**
 * How much of the pattern's own colour is kept. 0 leaves it fully grey. The map is
 * only faintly tinted to begin with — measured average luma 123, swatches like
 * (99,105,105) and (117,103,104) — but that faint colour is what makes the pale
 * squares read as cream and yellow against a room of concrete.
 */
const SATURATION = 0;

/**
 * The knee that pulls the light squares down without taking the dark ones with them.
 * Values above KNEE_FROM (of 1) are compressed by KNEE_SLOPE; everything below is left
 * alone. This is the knob for "only the pale squares are wrong" — TINT is the one for
 * "the whole rug is the wrong level".
 */
const KNEE_FROM = 0.45;
const KNEE_SLOPE = 0.45;

/** Clear floor left between the desk's front edge and the rug's back edge. */
const DESK_GAP = 4;

/**
 * Hand placement, on top of the derived spot below: left, and a little back toward
 * the desk. Applied last, so it is what actually decides where the rug lands — in
 * particular the -z component pushes the back edge past the clearance DESK_GAP gives,
 * and the rug's back strip does slide under the desk again.
 */
const NUDGE = new THREE.Vector2(-49, -23);

/**
 * A slight turn off the room's axis, set by hand in edit mode — a rug laid by a person
 * is never quite square to the desk. Applied after it is laid, so it turns in place and
 * leaves the position NUDGE settled on alone.
 */
const YAW = THREE.MathUtils.degToRad(-2.4);

/**
 * The overall level, multiplied into the base map — 1 would be the rug as its
 * conversion left it. The source project explains the number: the pattern arrived
 * averaging 208 out of 255, near enough paper, and needed pulling down hard for a room
 * lit by one lamp. This room is darker still, so this is the first knob to reach for
 * if the rug reads as a bright patch on the floor.
 */
const TINT = 0.6;

/** Lays the rug on the floor, centred under the chair. */
export async function addCarpet(parent, chair, floor, desk) {
  if (!chair || !floor || !desk) return null;

  const gltf = await loadGLB(MODEL_URL);

  const carpet = gltf.scene;
  carpet.name = 'Carpet';
  carpet.scale.setScalar(SCALE * FIT);
  carpet.traverse((node) => {
    if (!node.isMesh) return;
    // Flat on the floor: it has nothing to cast onto but itself, and a shadow from a
    // 1 cm pile lying on the ground is z-fighting rather than shading.
    node.castShadow = false;
    node.receiveShadow = true;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      restyleMap(material);
      material.color.setScalar(TINT);
      // Wool, not the plastic the exporter's 0.6 suggests.
      material.roughness = 0.95;
      material.metalness = 0;
      // The level above is authored — darkenScene() must not tint it a second time.
      material.userData.keepColor = true;
    }
  });

  // Parented before measuring: the model root carries an offset, so a box taken while
  // the rug is still detached would be in the wrong frame.
  parent.add(carpet);
  carpet.position.set(0, 0, 0);
  carpet.updateMatrixWorld(true);

  layOnFloor(carpet, chair, floor, desk);
  carpet.rotation.y = YAW;
  carpet.updateMatrixWorld(true);

  return carpet;
}

/**
 * Rests the rug on the floor, centred on the chair across the room and set just in
 * front of the desk, so no part of it slides under the desk.
 */
function layOnFloor(carpet, chair, floor, desk) {
  const floorY = new THREE.Box3().setFromObject(floor).max.y;
  const chairBox = new THREE.Box3().setFromObject(chair);
  const chairCentre = chairBox.getCenter(new THREE.Vector3());
  const deskFront = deskFrontEdgeNear(desk, chairBox.min.x, chairBox.max.x);

  const box = new THREE.Box3().setFromObject(carpet);
  const centre = box.getCenter(new THREE.Vector3());
  const depth = box.max.z - box.min.z;

  const target = new THREE.Vector3(
    chairCentre.x + NUDGE.x,
    floorY,
    deskFront + DESK_GAP + depth / 2 + NUDGE.y
  );
  const anchor = new THREE.Vector3(centre.x, box.min.y, centre.z);

  // Both are world-space; the parent carries its own offset, so convert the delta.
  const delta = target.sub(anchor);
  const parent = carpet.parent;
  const origin = parent.worldToLocal(new THREE.Vector3());
  carpet.position.copy(parent.worldToLocal(delta).sub(origin));
  carpet.updateMatrixWorld(true);
}

/**
 * The desk's front edge where the chair is. The desk is an L, so its bounding box is
 * the wrong tool here — that box's max.z belongs to the forward arm off to the right,
 * not to the run the chair is pulled up to. So this walks the desk's own vertices
 * inside the chair's x band and takes the furthest forward.
 */
function deskFrontEdgeNear(desk, xMin, xMax) {
  desk.updateWorldMatrix(true, true);

  const vertex = new THREE.Vector3();
  let front = -Infinity;

  desk.traverse((node) => {
    if (!node.isMesh) return;
    const position = node.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      node.localToWorld(vertex);
      if (vertex.x < xMin || vertex.x > xMax) continue;
      if (vertex.z > front) front = vertex.z;
    }
  });

  return Number.isFinite(front) ? front : new THREE.Box3().setFromObject(desk).max.z;
}

/**
 * Redraws the rug's base map: the colour pulled out of it, and its light squares
 * compressed down towards its dark ones.
 *
 * This has to happen on the map rather than on `material.color`, because a colour
 * multiply scales every square by the same factor and so cannot change how the pale
 * squares sit against the dark ones — which is the whole point.
 *
 * Safe to replace in place: this GLB is loaded once, so nothing else shares the map.
 */
function restyleMap(material) {
  const source = material.map;
  const image = source?.image;
  if (!image?.width) return;

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const luma = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    for (let c = 0; c < 3; c++) {
      const grey = luma + (px[i + c] - luma) * SATURATION;
      px[i + c] = knee(grey / 255) * 255;
    }
  }
  ctx.putImageData(data, 0, 0);

  const restyled = new THREE.CanvasTexture(canvas);
  // A CanvasTexture inherits none of the source's sampling state, and glTF textures
  // are flipY false while this defaults to true — miss that and the rug comes back
  // mirrored.
  restyled.flipY = source.flipY;
  restyled.wrapS = source.wrapS;
  restyled.wrapT = source.wrapT;
  restyled.channel = source.channel;
  restyled.colorSpace = THREE.SRGBColorSpace;
  restyled.anisotropy = 8;

  material.map = restyled;
  material.needsUpdate = true;
  source.dispose();
}

/** Compresses the top of the range towards the bottom, leaving the darks alone. */
function knee(value) {
  if (value <= KNEE_FROM) return value;
  return KNEE_FROM + (value - KNEE_FROM) * KNEE_SLOPE;
}
