import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';
import { drawPortfolioPage } from './resume/portfolioPage.js';

/**
 * An e-ink paper tablet lying on the desk's right-hand side, between the Apple pieces
 * and the printer, showing the CV on one sheet of A4. Run `npm run convert Paper_Tablet` to
 * (re-)import the model.
 *
 * The Sketchfab source is two meshes: the slab (`Material`, with normal and roughness
 * maps) and the page on it (`Material_002`, a 256×512 photograph of a sample IEEE paper).
 * The page is what this prop is for, so its map is thrown away at load time and replaced
 * with the sheet `resume/portfolioPage.js` draws — the same copy the screens and the
 * sidebar are built from, condensed to a page. That makes the material name
 * load-bearing: the shrink pass runs `dedup --materials false` for exactly this reason.
 *
 *     npm run shrink paperTablet 512 85
 *
 * took it from 2.44 MB to 176 KB. The slab's maps went 1024² → 512² — it is a 20 cm
 * prop — and the page's own base colour is still in the file, unused, because the
 * resampler has no way to know it is replaced; at 26 KB it is not worth a strip pass.
 *
 * The source stands the board *upright* — its node chain nets out to a quarter-turn
 * about x, so the slab arrives thin along z and tall along y, like a clipboard hung on a
 * wall. The −90° pitch in `TRANSFORM` lays it down, and it is applied before anything is
 * measured. That matters for the scale as well: a fit taken on the upright board read
 * its thickness as its width and blew it up to the size of a door.
 *
 * The page's UVs want the canvas the browser way up (`flipY` on): with it off the text
 * came out mirrored top-to-bottom.
 */

export const MODEL_URL = 'models/paperTablet.glb';

/** The material on the page mesh, as the converter spells it (`Material.002` in the source). */
const PAGE_MATERIAL = 'Material_002';

/**
 * How wide the slab reads on the desk, in centimetres. The source arrives at 27 × 39 at
 * its own scale, so it is measured and scaled to this rather than trusted. It started at
 * a reMarkable's 18.7 and was scaled up ×1.38 in edit mode — on this desk the smaller
 * board read as a notepad, and the page on it was too small to make out.
 */
const TABLET_WIDTH = 25.8;

/**
 * Where the tablet lies, in world centimetres and degrees — set by hand in edit mode and
 * copied out of its readout, the rotation in that readout's own `YXZ` order. The −90° on
 * x is what lays the upright source flat (clip towards the back of the desk); the y is
 * the yaw it was put down at. Absolute, like the room's other dressed props: move the
 * desk and it stays where it is, and re-dressing it in edit mode is how it follows.
 */
const TRANSFORM = {
  position: [80.9, 85.5, -66.4],
  rotation: [-90, -11, 0],
};

/** The paper's finish: matte, no shine — it is e-ink, not glass. */
const PAGE_FINISH = { roughness: 0.85, metalness: 0 };

/** Loads the tablet, dresses its page and lays it where it was left on the desk. */
export async function addPaperTablet(parent) {
  const gltf = await loadGLB(MODEL_URL);
  const tablet = gltf.scene;
  tablet.name = 'Paper_tablet';

  let page = null;
  tablet.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (node.material?.name === PAGE_MATERIAL) page = node;
  });

  if (page) {
    page.material = pageMaterial(page.material);
    // By intent rather than by the converter's spelling: `resume/sheetPrompt.js` is what
    // looks for the page, to make a click on it ask for the PDF.
    page.userData.sheet = true;
  } else {
    console.warn(`[paper tablet] no mesh carries "${PAGE_MATERIAL}" — the page keeps its sample text`);
  }

  // Parented and laid flat before measuring: the model root carries a chain of
  // rotations and scales, so a box taken while it is still detached would be in the
  // wrong frame.
  parent.add(tablet);
  tablet.position.set(0, 0, 0);
  tablet.rotation.set(...TRANSFORM.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
  tablet.updateMatrixWorld(true);

  fitToSize(tablet);

  // The placement is world-space but `parent` carries an offset of its own, so it has to
  // be converted into its local space.
  tablet.position.copy(
    parent.worldToLocal(new THREE.Vector3().fromArray(TRANSFORM.position))
  );
  tablet.updateMatrixWorld(true);

  return tablet;
}

/**
 * The page material: the source's, with the photograph of a sample paper replaced by the
 * drawn CV. The roughness map goes with it — a flat matte is all paper needs — and the
 * result is marked `keepColor` so `darkenScene()` leaves the sheet white.
 */
function pageMaterial(source) {
  const canvas = drawPortfolioPage();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // The page's UVs read a browser-oriented canvas correctly; leaving glTF's `flipY = false`
  // on this material mirrored the text top-to-bottom.
  texture.flipY = true;
  texture.anisotropy = 8;

  const material = source.clone();
  material.map = texture;
  material.roughnessMap = null;
  material.metalnessMap = null;
  material.roughness = PAGE_FINISH.roughness;
  material.metalness = PAGE_FINISH.metalness;
  material.color.set(0xffffff);
  material.userData.keepColor = true;
  material.needsUpdate = true;
  return material;
}

/**
 * Scales the tablet so the slab reads TABLET_WIDTH across. Measured on its world box
 * after TRANSFORM has laid it flat, so the shorter horizontal extent is its width and not
 * its thickness.
 */
function fitToSize(tablet) {
  const box = new THREE.Box3().setFromObject(tablet);
  const size = box.getSize(new THREE.Vector3());
  const across = Math.min(size.x, size.z);
  if (across > 0) tablet.scale.multiplyScalar(TABLET_WIDTH / across);
  tablet.updateMatrixWorld(true);
}

