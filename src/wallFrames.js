import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * A composition of picture frames hung on the blank back wall, over the stretch to the
 * right of the displays. Run `npm run convert Composition_of_frames_for_wall_decoration`
 * to (re-)import the model.
 *
 * Eight framed prints and their mounts, thin in z and already standing upright facing
 * +z — the same way the back wall's inner face does — so like the outlet it needs no
 * turn of its own, only lifting off the model root's transform when it is re-parented.
 *
 * The source is authored as a whole wall of art, 3 m across and 3 m tall, which is the
 * room's entire wall height. It is scaled to `TARGET_WIDTH` below rather than used at
 * that size: at 1:1 it would run floor to ceiling and swallow the desk.
 */

/**
 * `npm run shrink -- wallFrames 256 85` took it from 537 KB to 74 KB. Nearly all of that
 * was pictures: the geometry is only 3,850 vertices, while seven 512² prints came to
 * 537 KB of JPEG. They go to 256² — the composition hangs across the room from the
 * camera and no single frame is more than about 30 cm on screen, so the prints stay
 * readable as pictures without paying for detail nothing can resolve.
 */
const MODEL_URL = 'models/wallFrames.glb';

/**
 * Prints swapped for something of this room's own, as `material name -> texture url`.
 *
 * **The material names are load-bearing**, like the mouse's skins and the floor socket's
 * back box: each print in the pack wears its own material, and that name is the only
 * handle on which frame is which — the nodes are all called `Material2.00n`. The
 * compression pass keeps them because `shrink-glb.mjs` runs `dedup --materials false`;
 * a re-import that renames them will make `reprint()` warn.
 *
 * `_3010_2` is the landscape frame in the top-left of the group, which came with a
 * eucalyptus branch on it.
 *
 * The print is squashed to a square and turned on the way in, both deliberate. The frame's
 * UVs do not map the texture straight onto the opening: reading them off the quad, `u`
 * runs up the wall and `v` runs across it to the left, so the image arrives rotated a
 * quarter turn *and* mirrored. That pair is a reflection about the anti-diagonal, which
 * is one PIL call to undo, and the square keeps the proportions once the 31.6 x 23.4 cm
 * opening stretches it back:
 *
 *     im.convert('RGB').resize((512, 512), Image.LANCZOS).transpose(Image.TRANSVERSE)
 *
 * from the original at `tmp/originals/LPIC-300.png` — 271 KB to 34 KB. The original stays
 * out of `public/`, which is copied wholesale into `dist/`. Another frame taken from this
 * pack will want its own UVs read the same way rather than this same turn assumed.
 */
const PRINTS = {
  _3010_2: 'textures/frames/lpic3.jpg',
};

/** The pack's single sheet of glazing over the whole group — see `unglaze()`. */
const GLAZING = 'Glass';

/** How wide the composition hangs, in centimetres — the source's own 3 m scaled down. */
const TARGET_WIDTH = 110;

/**
 * Where it hangs, in world centimetres — set by hand in edit mode and copied out of its
 * readout. To the right of the displays and above the laptop, rather than centred over
 * the desk: the wall behind the monitors is the one stretch of it that is already busy.
 *
 * This is the group's own origin at `TARGET_WIDTH`, not the middle of the frames — the
 * model carries an offset of its own, so changing that width moves the composition as
 * well as resizing it, and it has to be re-dressed after.
 *
 * Absolute, like the room's other hand-placed props: move the desk or the wall and the
 * frames stay put.
 */
const TRANSFORM = {
  position: [36.3, 165.1, -140.9],
  rotation: [0, 0, 0],
};

/** Loads the composition and hangs it where it was left on the back wall. */
export async function addWallFrames(parent) {
  const gltf = await loadGLB(MODEL_URL);

  const frames = gltf.scene;
  frames.name = 'Wall_frames';
  frames.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // Parented before measuring: the model root carries an offset and a scale of its own,
  // so a box taken while the frames are still detached would be in the wrong frame.
  parent.add(frames);
  frames.position.set(0, 0, 0);
  frames.updateMatrixWorld(true);

  unglaze(frames);
  reprint(frames);
  fitWidth(frames);

  // The transform is world-space and the parent carries an offset of its own.
  frames.rotation.set(...TRANSFORM.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
  frames.position.copy(
    parent.worldToLocal(new THREE.Vector3().fromArray(TRANSFORM.position))
  );
  frames.updateMatrixWorld(true);

  return frames;
}

/**
 * Takes the glazing off. The pack covers the whole composition with one black sheet at
 * 15% opacity — a film rather than glass, since it carries no reflection of its own — and
 * all it does here is dim every print by that much. There is no per-frame glass to keep:
 * it is a single mesh over the lot.
 */
function unglaze(frames) {
  const glass = [];
  frames.traverse((node) => {
    if (node.isMesh && node.material?.name === GLAZING) glass.push(node);
  });

  for (const pane of glass) pane.removeFromParent();
}

/**
 * Hangs a different picture in the frames named in `PRINTS`. The replacement is set up
 * the way `GLTFLoader` sets up the map it displaces — sRGB, and `flipY` off, since glTF
 * UVs have their origin at the top — so it lands the right way up.
 *
 * It also opts the print out of `darkenScene()`. That pass pulls every mapped material
 * down to 15% of its colour, which is right for the pack's own washed-out art and wrong
 * for a certificate: it is meant to be read, and at that tint its paper went darker than
 * the concrete behind it.
 */
function reprint(frames) {
  const loader = new THREE.TextureLoader();
  const wanted = new Set(Object.keys(PRINTS));

  frames.traverse((node) => {
    const material = node.isMesh ? node.material : null;
    const url = material && PRINTS[material.name];
    if (!url) return;

    wanted.delete(material.name);

    const texture = loader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    if (material.map) {
      texture.wrapS = material.map.wrapS;
      texture.wrapT = material.map.wrapT;
      texture.channel = material.map.channel;
      material.map.dispose();
    }

    material.map = texture;
    // An authored finish — darkenScene() must not tint it with the pack's own prints.
    material.userData.keepColor = true;
    material.needsUpdate = true;
  });

  // A name that went missing is a re-import that renamed its materials, not a no-op.
  for (const name of wanted) {
    console.warn(`[wall frames] no material named ${name} to reprint`);
  }
}

/** Scales the group down until it spans `TARGET_WIDTH`, keeping its proportions. */
function fitWidth(frames) {
  const width = new THREE.Box3().setFromObject(frames).getSize(new THREE.Vector3()).x;
  if (!width) return;

  frames.scale.multiplyScalar(TARGET_WIDTH / width);
  frames.updateMatrixWorld(true);
}
