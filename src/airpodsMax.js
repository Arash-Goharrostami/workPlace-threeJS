import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A pair of AirPods Max lying on the desk, in silver. Run
 * `npm run convert AirPods_Max` to (re-)import the model.
 *
 * Two things the source needs before it can go down: it is exported about 1.6× life
 * size, and it is baked as the space-grey pair — a dark blue-grey texture that no
 * material tint can lift to silver, so the bake itself is re-tinted (see `silverTexture`).
 */

const MODEL_URL = 'models/AirPods_Max.glb';

/** A real pair, ear cup to ear cup. What the import is scaled to fit. */
const REAL_WIDTH = 16.84;

/**
 * Where the pair ended up, in world centimetres and degrees — set by hand in edit mode
 * and copied out of its readout, the rotation in that readout's own `YXZ` order. Absolute,
 * like the room's other dressed props: move the desk and it stays where it is, and
 * re-dressing it in edit mode is how it follows.
 *
 * The scale is not written down — `fitWidth()` derives it from the model's own measured
 * width, which is where the readout's ×0.625 comes from in the first place.
 */
const TRANSFORM = {
  position: [65.5, 89.3, -66.8],
  rotation: [-82.4, -142.7, 176.7],
};

/** The silver the bake is remapped onto: shadow, and the aluminium at full light. */
const SILVER = { shadow: 0x3a3a3c, highlight: 0xe3e4e6 };

/** Loads the pair, turns it silver and sets it where it was left. */
export async function addAirPodsMax(parent) {
  const gltf = await loadGLB(MODEL_URL);
  const headphones = gltf.scene;
  headphones.name = 'AirPods_Max';

  headphones.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.material = resilver(node.material);
  });

  // Parented before measuring: the root carries an offset of its own, so a box taken
  // while the pair is still detached would be in the wrong frame.
  parent.add(headphones);
  headphones.position.set(0, 0, 0);
  headphones.rotation.set(0, 0, 0);
  headphones.scale.setScalar(1);
  headphones.updateMatrixWorld(true);

  fitWidth(headphones, REAL_WIDTH);

  headphones.rotation.set(...TRANSFORM.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
  // The placement is world-space but `parent` carries an offset of its own, so it has to
  // be converted into its local space.
  headphones.position.copy(
    parent.worldToLocal(new THREE.Vector3().fromArray(TRANSFORM.position))
  );
  headphones.updateMatrixWorld(true);

  return headphones;
}

/** Scales the loaded root so it measures `width` across, whatever the exporter left. */
function fitWidth(object, width) {
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  const widest = Math.max(size.x, size.z);
  if (widest > 1e-6) object.scale.setScalar(width / widest);
  object.updateMatrixWorld(true);
}

/**
 * Repaints the material silver. The bake's own shading is what makes the mesh, the
 * cushions and the crease read, so it is kept and only remapped: every pixel's luminance
 * is looked up along a silver ramp instead of the blue-grey the space-grey pair was baked
 * in. The normal and roughness maps are untouched.
 */
function resilver(material) {
  const copy = material.clone();
  if (copy.map?.image) {
    copy.map = silverTexture(copy.map);
  }
  copy.color.setScalar(1);
  // The exporter flags the material BLEND, but the bake's alpha is only the atlas's empty
  // margin — no real cutout anywhere on the model. Rendered blended, the cushions and the
  // mesh canopy sort against each other per draw rather than per pixel, which is what made
  // them look like they were dissolving. Opaque, they depth-sort properly.
  copy.transparent = false;
  copy.alphaTest = 0;
  copy.depthWrite = true;
  // Anodised aluminium: a little more metal than the bake's own map suggests, which was
  // authored for a darker finish.
  copy.metalness = Math.max(copy.metalness ?? 0, 0.45);
  copy.userData.keepColor = true;
  copy.needsUpdate = true;
  return copy;
}

/**
 * The baked base colour, remapped onto `SILVER`. The bake is dark and blue — around RGB
 * 52, 60, 73 on average — so a tint could only take it further down; the level has to be
 * rebuilt rather than multiplied.
 *
 * Luminance is taken with the usual Rec. 601 weights, then raised a little (the exponent)
 * so the midtones land where an aluminium shell sits rather than in the shadow half.
 */
function silverTexture(source) {
  const image = source.image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;

  const shadow = new THREE.Color(SILVER.shadow);
  const highlight = new THREE.Color(SILVER.highlight);
  const ramp = new THREE.Color();

  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    ramp.copy(shadow).lerp(highlight, Math.pow(luma, 0.55));
    data[i] = ramp.r * 255;
    data[i + 1] = ramp.g * 255;
    data[i + 2] = ramp.b * 255;
    // Alpha is discarded with the blending: see `resilver()`.
    data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  // The source's own sampling — its wrap, flip and UV transform — has to carry over, or
  // the remapped bake lands on the model differently from the one it replaces.
  texture.colorSpace = source.colorSpace;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.flipY = source.flipY;
  texture.channel = source.channel;
  texture.offset.copy(source.offset);
  texture.repeat.copy(source.repeat);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
