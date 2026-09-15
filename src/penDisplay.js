import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A pen display — a drawing monitor on its tilt stand, with its stylus — standing on
 * the desk's right-hand side. Run `npm run convert Lenovo_laptop` to
 * (re-)import it: the Sketchfab source is named for the laptop it came with, and
 * `scripts/model-names.txt` maps it to `penDisplay`.
 *
 * That laptop is the reason this is a parts cut rather than a plain shrink. The source
 * is four things under one root — `Laptop_10`, `tablet_13` (the display on its stand,
 * with `pen_holder_12` and, inside that, `pen_11`), and the leads `hdmi_20` and
 * `wires_001_21` — and its material names run across them (`silver` is on the laptop,
 * the stand and the holder alike), so it is cut by node:
 *
 *     npm run shrink:parts -- penDisplay --only tablet_13,pen_11
 *         --drop-nodes pen_holder_12 --keep screen --ratio 0.25 1024 80 --coarse
 *
 * 15.35 MB → 207 KB, 20 k triangles. The laptop, the holder and both leads are gone —
 * the leads ran to the laptop, and with it gone had nowhere to go — the screen face is
 * at full detail, and everything else — the stand mechanism above all, 120 k triangles
 * of hinge nobody sees from the front — at a quarter. Four of the ten maps went with
 * the laptop.
 *
 * What is loaded is one scene, but it is stood on the desk as two props — `Pen_display`,
 * the display on its stand, and `Pen_stylus` — each directly under the room with a spot
 * of its own in `PARTS`, so edit mode picks, moves and reads out each one on its own,
 * the way it does the books. The stylus sat in the holder's groove, so left in the
 * source's arrangement it would float; on its own it can be laid where the desk wants
 * it.
 *
 * The source is in millimetres and is measured and scaled to `WIDTH` rather than
 * trusted, like the room's other props; both take the same scale.
 */

const MODEL_URL = 'models/penDisplay.glb';

/**
 * The screen's map, with the picture the room wants on it. The source's `screen`
 * material is an atlas — the picture is one island in its top-left corner, the rest of
 * the sheet dresses the bezel and stand — so the map is not replaced but re-drawn:
 * `scripts/pen-display-screen.py` pastes a screenshot (`tmp/blender-interface.jpeg`, a
 * Blender window, its white strip along the top cropped off) into that island and
 * writes the whole sheet out at 2048² so the picture keeps some sharpness on a 50 cm
 * screen. The island runs across the screen's axes the odd way round — u up the
 * screen, v along it, from the viewer's right — which is a flip about the anti-diagonal
 * the script does. The GLB itself is untouched: the map is swapped at load time, on
 * both the base colour and the emissive slot the source lights the screen with.
 */
const SCREEN_TEXTURE = 'textures/penDisplay/screen.jpg';
/** The screen's material, as the converter spells it. */
const SCREEN_MATERIAL = 'screen';

/** The screen face's node, the mesh `WIDTH` is measured across. */
const SCREEN_NODE = 'Object_13';

/**
 * How wide the display reads on the desk, in centimetres, measured across the screen
 * and its bezel — every part scales with it. The source is a 13-inch class board; this
 * stands it at a 22-inch class one, the size the right of the desk was empty for.
 */
const WIDTH = 45;

/**
 * The props, each by the source node it is lifted out under, and where it stands, in
 * world centimetres and degrees — set by hand in edit mode and copied out of its
 * readout, the rotation in that readout's own `YXZ` order. `position` is the point on
 * the desk the part stands on, since each is recentred on the middle of its underside.
 * `scale` is on top of the shared `WIDTH` fit — the display's readout said ×1.128 once
 * it was in place, and the stylus was left alone. Absolute, like the room's other
 * dressed props: move the desk and they stay where they are, and re-dressing them in
 * edit mode is how they follow.
 */
const PARTS = [
  { name: 'Pen_display', node: 'tablet_13', position: [96.3, 73.3, -20.7], rotation: [0, -158.7, 0], scale: 1.128 },
  { name: 'Pen_stylus', node: 'pen_11', position: [79.8, 85.3, -7.1], rotation: [-0.5, 20, -0.2] },
];

/** Loads the display, splits it into its props and stands each where it was left. Returns them. */
export async function addPenDisplay(parent) {
  const gltf = await loadGLB(MODEL_URL);
  const source = gltf.scene;

  const screen = new THREE.TextureLoader().load(SCREEN_TEXTURE);
  screen.colorSpace = THREE.SRGBColorSpace;
  // Drawn in the atlas's own orientation, which is a glTF texture's: not the browser's.
  screen.flipY = false;
  screen.anisotropy = 8;

  source.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (node.material?.name === SCREEN_MATERIAL) {
      const material = node.material.clone();
      material.map = screen;
      material.emissiveMap = screen;
      material.needsUpdate = true;
      node.material = material;
    }
  });

  // Measured in the source's own frame, at identity under the parent, before anything
  // is lifted out — both props share the one scale.
  parent.add(source);
  source.position.set(0, 0, 0);
  source.rotation.set(0, 0, 0);
  source.scale.setScalar(1);
  source.updateMatrixWorld(true);
  const scale = fitScale(source, WIDTH);

  // Every node is looked up before any is lifted: the stylus's node sits *inside* the
  // display's, so lifting the display first carries the stylus off with it and leaves
  // nothing under the source to find — which is exactly what happened.
  const found = PARTS.map((spec) => ({ spec, node: source.getObjectByName(spec.node) }));
  const lifted = [];
  for (const { spec, node } of found) {
    if (!node) {
      console.warn(`[pen display] no node named ${spec.node} for ${spec.name}`);
      continue;
    }
    const prop = new THREE.Group();
    prop.name = spec.name;
    parent.add(prop);
    // `attach` keeps the node where the source had it, so the prop is measured in place.
    prop.attach(node);
    lifted.push({ spec, prop, node });
  }

  for (const { spec, prop, node } of lifted) {
    // The scale is the prop's own, and its node shifts under it by the foot point taken
    // in the prop's frame, so `position` is the point it stands on.
    prop.scale.setScalar(scale * (spec.scale ?? 1));
    prop.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(prop);
    const centre = box.getCenter(new THREE.Vector3());
    const foot = prop.worldToLocal(new THREE.Vector3(centre.x, box.min.y, centre.z));
    node.position.sub(foot);

    prop.rotation.set(...spec.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
    // The placement is world-space but `parent` carries an offset of its own.
    prop.position.copy(parent.worldToLocal(new THREE.Vector3().fromArray(spec.position)));
    prop.updateMatrixWorld(true);
  }

  // The emptied source hierarchy goes; the two props are what is left standing.
  source.removeFromParent();

  return lifted.map(({ prop }) => prop);
}

/** The uniform scale that makes the display's board measure `width` across, whatever the exporter left. */
function fitScale(object, width) {
  // The board is measured on its own — the stand behind it is deeper than it is wide,
  // and the screen mesh is the one face the width is defined by.
  const board = new THREE.Box3()
    .setFromObject(object.getObjectByName(SCREEN_NODE) ?? object)
    .getSize(new THREE.Vector3());
  const across = Math.max(board.x, board.z);
  return across > 1e-6 ? width / across : 1;
}
