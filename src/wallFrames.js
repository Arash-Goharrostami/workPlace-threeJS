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
 *     im.convert('RGB').resize((768, 768), Image.LANCZOS).transpose(Image.TRANSVERSE)
 *
 * from `tmp/originals/LPIC-3.pdf`, rasterised first with `sips -s format png -Z 1600` —
 * 63 KB as a q82 JPEG. The PDF stays out of `public/`, which is copied wholesale into
 * `dist/`. Another frame taken from this pack will want its own UVs read the same way
 * rather than this same turn assumed.
 */
const PRINTS = {
  _3010_2: 'textures/frames/lpic3.jpg',
};

/**
 * Pictures hung *in* a frame rather than reprinted onto one — see `hang()`. Two of the
 * group's frames have no picture plane of their own: what shows through each is a
 * region of `_1648_2`, one big quote sheet that runs behind the top-middle frame, the
 * frame to its right and the bottom-right one. Swapping that texture would change all
 * three at once, so each of these gets a sheet of its own, laid over its opening.
 *
 * Openings are measured in the model's own units. The bottom-right one is the inner
 * edge of its `Papier_blanc` mat, read off the mat's vertices; the top-middle one is
 * the sheet's own top-left corner and the pack's standard 11.1 × 15.04 print. Both
 * sit a little proud of the surface they cover (the mat's front is at z = -6.56, the
 * quote sheet's at -6.60) and behind the frame's lip at -6.28.
 *
 * `mat`, when given, draws a mat of that colour round the page, `margin` of the
 * opening's height deep above and below it (the sides take what the page's shape
 * leaves). Without it the page is centred on white. `urls` instead of `url` stacks
 * several pages down the opening, the same gap between them as round them.
 *
 * `under` names the mesh the sheet is parented to — it shares that mesh's frame, so
 * the coordinates above are used as they are. `material` is the name the sheet's
 * material carries, which `wallFrameFocus.js` captions by.
 */
const HUNG = [
  {
    under: 'Papier_blanc',
    url: 'textures/frames/recommendation.jpg',
    // The whole of the frame's opening — the mat's *outer* edge — not the mat's own
    // window: the letter set inside that window was a small page in a big frame. The
    // pack's dark grey mat is covered too, and a lighter one drawn in its place.
    opening: { x: [68.7, 83.74], y: [6.89, 25.86], z: -6.5 },
    mat: { color: '#a9adb5', margin: 0.045 },
    material: 'recommendation',
  },
  {
    // The big centre frame, which came with the eucalyptus: the two W3Schools
    // certificates, one above the other, on a mat. Landscape pages in a portrait
    // frame, so they are sized to the height with the mat taking up the sides.
    under: '_393_2',
    urls: ['textures/frames/w3-js.jpg', 'textures/frames/w3-ts.jpg'],
    opening: { x: [46.5, 65.48], y: [6.37, 33.22], z: -6.5 },
    mat: { color: '#a9adb5', margin: 0.03 },
    material: 'certificates',
  },
  {
    under: '_1648_2',
    url: 'textures/frames/degree.jpg',
    opening: { x: [54.35, 65.45], y: [36.77, 51.81], z: -6.5 },
    material: 'degree',
  },
];

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
  for (const spec of HUNG) hang(frames, spec);
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

/**
 * Lays one of the `HUNG` pictures over its frame's opening. The sheet is a child of
 * the mesh named in `under`, so it is placed in that mesh's coordinates and follows
 * whatever the group's fit and hang do afterwards.
 *
 * A4 is a touch narrower than these openings, so the image is drawn onto a canvas of
 * the opening's shape with white either side, rather than stretched to it — the margin
 * reads as a mat and the page keeps its proportions.
 */
function hang(frames, spec) {
  let under = null;
  frames.traverse((node) => {
    if (!under && node.isMesh && node.material?.name === spec.under) under = node;
  });
  if (!under) {
    console.warn(`[wall frames] no material named ${spec.under} to hang ${spec.material} on`);
    return;
  }

  const { x, y, z } = spec.opening;
  const width = x[1] - x[0];
  const height = y[1] - y[0];

  const canvas = document.createElement('canvas');
  canvas.height = 1400;
  canvas.width = Math.round(canvas.height * (width / height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = spec.mat?.color ?? '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const urls = spec.urls ?? [spec.url];
  const loader = new THREE.ImageLoader();
  Promise.all(urls.map((url) => loader.loadAsync(url))).then((images) => {
    const margin = canvas.height * (spec.mat?.margin ?? 0);
    // One scale for the lot, so the pages come out the same size: whichever of the
    // column's width or its height is the tight fit.
    const ratios = images.map((image) => image.width / image.height);
    const stackH = images.length; // in units of one page's height
    const stackW = Math.max(...ratios); // widest page, in the same units
    const scale = Math.min(
      (canvas.height - margin * (images.length + 1)) / stackH,
      (canvas.width - margin * 2) / stackW
    );
    let y = (canvas.height - (scale * stackH + margin * (images.length - 1))) / 2;
    images.forEach((image, i) => {
      const h = scale;
      const w = h * ratios[i];
      ctx.drawImage(image, (canvas.width - w) / 2, y, w, h);
      y += h + margin;
    });
    texture.needsUpdate = true;
  }).catch((error) => {
    console.warn(`[wall frames] failed to load ${spec.material}:`, error);
  });

  const material = new THREE.MeshStandardMaterial({
    name: spec.material,
    map: texture,
    roughness: 0.9,
    metalness: 0,
  });
  // Printed, not tinted — `darkenScene()` must leave the page white, as with `reprint`.
  material.userData.keepColor = true;

  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  sheet.name = `Wall_frames_${spec.material}`;
  sheet.position.set((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, z);
  sheet.receiveShadow = true;
  under.add(sheet);
}

/** Scales the group down until it spans `TARGET_WIDTH`, keeping its proportions. */
function fitWidth(frames) {
  const width = new THREE.Box3().setFromObject(frames).getSize(new THREE.Vector3()).x;
  if (!width) return;

  frames.scale.multiplyScalar(TARGET_WIDTH / width);
  frames.updateMatrixWorld(true);
}
