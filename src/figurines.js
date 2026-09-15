import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * Two Hollow Knight figurines standing on the desk: the Knight and Hornet. Run
 * `npm run convert Hornet Holow_Knight` to (re-)import them — the second source spells
 * its own name wrong, and `scripts/model-names.txt` maps it to `hollowKnight`.
 *
 * Both are Sketchfab models exported at about 3 m tall, so each is measured and scaled
 * to a figurine's height rather than trusted.
 *
 *     npm run shrink -- hollowKnight 512 85 --coarse       698 KB → 89 KB (22 k triangles)
 *     npm run shrink -- hornet 512 85 0.35 --coarse        5.01 MB → 170 KB
 *
 * Hornet arrived at 263 k triangles — a needle and a cloak do not need that on a 14 cm
 * figure — and was simplified to 41 k. That is the one lossy step in here; if her
 * silhouette ever looks chewed, re-run without the ratio (670 KB) and look again.
 * `--coarse` (12-bit Draco positions, a hundredth of a millimetre on a figurine) is
 * worth about a sixth of each file; note it has to go through npm's `--` or npm eats
 * it. Neither model's maps carry alpha, so the JPEG re-encode was safe.
 *
 * Hornet's cloak is her one textured part (`Material_006`, a 1024² bake) and it is
 * baked a dark maroon that reads almost brown on the desk. Every other material on her
 * is a plain colour. The bake is kept for its folds and remapped onto a real red at
 * load time (see `recolour` and `remapTexture`), the way `airpodsMax.js` turns the
 * space-grey pair silver — the GLB itself is untouched.
 *
 * Hornet's plinth is edited, not as shipped: Sketchfab stands her on a disc a good
 * twice her width, dressed with thread spools and needles. `npm run shrink:hornet-base
 * -- 0.7 --bare` is what she stands on now: the discs scaled in about their centre and
 * the dressing deleted, leaving her, her needle planted beside her and the bare discs —
 * 170 KB to 63 KB. Her own meshes and her height are never touched. It works from
 * `tmp/originals/hornet.base.orig.glb`, so a new factor does not compound, and moving
 * that file back is the undo; without `--bare` the dressing slides inward instead.
 *
 * One table drives both, so a third figure is one more line.
 */

/**
 * The figures, in world centimetres and degrees — set by hand in edit mode and copied
 * out of its readout, the rotation in that readout's own `YXZ` order. `height` is how
 * tall the figure stands; `position` is the point on the desk it stands on, since each
 * root is recentred on the middle of its underside. Absolute, like the room's other
 * dressed props: move the desk and they stay where they are, and re-dressing them in
 * edit mode is how they follow. (The Knight's readout said ×0.727 on a 12 cm fit —
 * that is folded into its `height`.)
 *
 * `recolour` remaps a named material's bake onto a ramp from `shadow` to `highlight`,
 * by luminance — the two colours are the knobs.
 */
const FIGURES = [
  { name: 'Hollow_Knight', url: 'models/hollowKnight.glb', height: 8.7, position: [0.2, 100.4, -107.9], rotation: [0, -18.9, 0] },
  {
    // Moved off the desk's far corner to stand beside the Knight once her plinth was
    // shrunk; the readout's ×1.029 is folded into `height`.
    name: 'Hornet', url: 'models/hornet.glb', height: 14.4, position: [-7.3, 100.0, -111.3], rotation: [0, 17.7, 0],
    // The cloak: from the bake's maroon to a proper red.
    recolour: { Material_006: { shadow: 0xb51a2a, highlight: 0xff4d5a } },
  },
];

/** A vinyl figure's finish: matte, no metal — the bakes carry the shading. */
const FINISH = { roughness: 0.6, metalness: 0 };

/** Loads both figures and stands each where it was left. One failing does not drop the other. */
export async function addFigurines(parent) {
  const placed = [];
  for (const spec of FIGURES) {
    try {
      placed.push(await addFigure(parent, spec));
    } catch (error) {
      console.warn(`[figurines] ${spec.name} failed to load:`, error);
    }
  }
  return placed;
}

async function addFigure(parent, spec) {
  const gltf = await loadGLB(spec.url);
  const figure = gltf.scene;
  figure.name = spec.name;

  const finished = new Map();
  figure.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.material = refinish(node.material, finished, spec.recolour?.[node.material.name]);
  });

  // Parented before measuring: the root carries an offset of its own, so a box taken
  // while the figure is still detached would be in the wrong frame.
  parent.add(figure);
  figure.position.set(0, 0, 0);
  figure.rotation.set(0, 0, 0);
  figure.scale.setScalar(1);
  figure.updateMatrixWorld(true);

  fitHeight(figure, spec.height);

  // Recentre on the middle of the underside, so `position` is the point it stands on.
  // The root is the loaded scene, so it is its children that shift — by the foot point
  // taken in the root's own frame.
  const box = new THREE.Box3().setFromObject(figure);
  const centre = box.getCenter(new THREE.Vector3());
  const foot = figure.worldToLocal(new THREE.Vector3(centre.x, box.min.y, centre.z));
  for (const child of figure.children) child.position.sub(foot);

  figure.rotation.set(...spec.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
  // The placement is world-space but `parent` carries an offset of its own, so it has to
  // be converted into its local space.
  figure.position.copy(parent.worldToLocal(new THREE.Vector3().fromArray(spec.position)));
  figure.updateMatrixWorld(true);

  return figure;
}

/** Scales the loaded root so it stands `height` tall, whatever the exporter left. */
function fitHeight(object, height) {
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  if (size.y > 1e-6) object.scale.setScalar(height / size.y);
  object.updateMatrixWorld(true);
}

/**
 * Clones the source material once per name with the vinyl finish above. The base
 * colour map stays — remapped onto `ramp` when one is given — and because the finish
 * is authored, `darkenScene()` is told to leave the material alone.
 */
function refinish(material, finished, ramp) {
  const known = finished.get(material.name);
  if (known) return known;

  const copy = material.clone();
  if (ramp && copy.map?.image) copy.map = remapTexture(copy.map, ramp);
  copy.roughness = FINISH.roughness;
  copy.metalness = FINISH.metalness;
  copy.userData.keepColor = true;
  copy.needsUpdate = true;
  finished.set(material.name, copy);
  return copy;
}

/**
 * The bake, remapped onto a colour ramp: every pixel's luminance (Rec. 601 weights) is
 * looked up between `shadow` and `highlight`, so the shading survives and only the hue
 * and level change. The exponent lifts the midtones well up the ramp — the maroon bake
 * sits in its shadow half (luminance around 0.43), and a straight lookup would keep
 * the cloak down by `shadow`.
 */
function remapTexture(source, { shadow, highlight }) {
  const image = source.image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;

  const from = new THREE.Color(shadow);
  const to = new THREE.Color(highlight);
  const colour = new THREE.Color();

  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    colour.copy(from).lerp(to, Math.pow(luma, 0.45));
    data[i] = colour.r * 255;
    data[i + 1] = colour.g * 255;
    data[i + 2] = colour.b * 255;
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
