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
 *
 * It is hung as one composition and then taken apart inside its group: each frame is
 * cut out of the pack's merged meshes (`FRAMES`, `gather()`) into a `Wall_frame_<label>`
 * directly under `Wall_frames`, so edit mode can pick any one of them up on its own
 * while the resume still finds the composition by its one name.
 */

/**
 * `npm run shrink -- wallFrames 256 85` took it from 537 KB to 74 KB. Nearly all of that
 * was pictures: the geometry is only 3,850 vertices, while seven 512² prints came to
 * 537 KB of JPEG. They go to 256² — the composition hangs across the room from the
 * camera and no single frame is more than about 30 cm on screen, so the prints stay
 * readable as pictures without paying for detail nothing can resolve.
 */
export const MODEL_URL = 'models/wallFrames.glb';

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
 *
 * `draw`, instead of `url`/`urls`, paints the sheet in code — for a page that is
 * text rather than a picture, and so needs no file under `public/`.
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
  {
    // The right column's upper frame, which came with a black-and-white photo: held
    // for the IELTS certificate, with a note saying so, until the exam is taken. The
    // opening is the photo quad's own bounds, read off its vertices.
    under: '_1532_2',
    opening: { x: [68.84, 79.94], y: [29.92, 44.96], z: -6.5 },
    mat: { color: '#a9adb5', margin: 0.04 },
    material: 'ielts',
    draw: placeholder({
      title: 'IELTS Academic',
      status: 'Certificate coming soon',
      note: ['This frame is reserved — the certificate', 'will be uploaded here once the exam is taken.'],
    }),
  },
];


/** The pack's single sheet of glazing over the whole group — see `unglaze()`. */
const GLAZING = 'Glass';

/**
 * The seven frames, each cut out of the pack to be a prop of its own — see `gather()`.
 *
 * The pack is one composition: its borders are two merged meshes over every frame
 * (`Gold_14k` is the lip, `material` the back), and `_1648_2` is one mesh that is
 * really two quads. Hung as one thing, edit mode could only ever pick up the lot. So
 * each frame's share of every mesh is carved out by `region`, a box in the meshes'
 * own units that takes every triangle whose centroid falls inside it. The regions are
 * the borders' own connected components, read off the geometry with half a unit's
 * air round each — every picture quad and hung sheet sits inside exactly one.
 *
 * `label` names the resulting part, `Wall_frame_<label>`. `landscape` turns a
 * portrait frame a quarter clockwise, `at` being where its centre then goes in the
 * same units, and `draw` paints a placeholder page into it (see `placeholder`): the
 * two left-column prints, the moons and the singer, are held for freeCodeCamp
 * certificates still being earned. Turned, each is ≈ 15.7 wide, so they reach further
 * left than the portrait ones did; their right edges stay on the column's, the
 * upper's top at the LPIC frame's bottom (y ≈ 34) and the lower's bottom at the
 * group's (y ≈ 0).
 */
const FRAMES = [
  { label: 'lpic3', region: { x: [35.3, 52.1], y: [36.0, 48.8] } },
  { label: 'degree', region: { x: [53.5, 66.3], y: [35.9, 52.7] } },
  { label: 'ielts', region: { x: [68.0, 80.8], y: [29.1, 45.8] } },
  { label: 'certificates', region: { x: [45.6, 66.3], y: [5.5, 34.1] } },
  { label: 'recommendation', region: { x: [67.8, 84.6], y: [6.0, 26.7] } },
  {
    label: 'python',
    region: { x: [31.3, 44.1], y: [17.3, 34.0] },
    landscape: true,
    at: [36.2, 28],
    draw: placeholder({
      title: 'Python Programming',
      status: 'Certificate in progress',
      note: ['freeCodeCamp.org — course under way;', 'the certificate will be uploaded here on completion.'],
    }),
  },
  {
    label: 'databases',
    region: { x: [31.3, 44.1], y: [-0.5, 16.2] },
    landscape: true,
    at: [36.2, 6],
    draw: placeholder({
      title: 'Relational Databases',
      status: 'Certificate in progress',
      note: ['freeCodeCamp.org — course under way;', 'the certificate will be uploaded here on completion.'],
    }),
  },
];

/**
 * Where a frame ended up once dressed on its own in edit mode — world centimetres and
 * degrees, the rotation in the readout's own `YXZ` order, keyed by `label`. A frame
 * listed here is set there after the composition is hung; the rest stay where the
 * composition puts them. Scale is not overridden — `TARGET_WIDTH` stays the one size.
 * (World-space, like every other readout, even though the frame lives inside the
 * group: it is converted on the way in.)
 */
const FRAME_TRANSFORMS = {
  python: { position: [-7.8, 214.7, -140.9], rotation: [0, 0, -90] },
  databases: { position: [-8.2, 185.3, -140.9], rotation: [0, 0, -90] },
};

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
  position: [36.3, 160.1, -140.9],
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
  const groups = FRAMES.map((spec) => gather(frames, spec)).filter(Boolean);
  fitWidth(frames);

  // The transform is world-space and the parent carries an offset of its own.
  frames.rotation.set(...TRANSFORM.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
  frames.position.copy(
    parent.worldToLocal(new THREE.Vector3().fromArray(TRANSFORM.position))
  );
  frames.updateMatrixWorld(true);

  // Now that the composition is hung, each frame comes up to sit directly under the
  // group — `attach` keeps it where the composition put it — and the pack's emptied
  // inner node goes. The group itself stays: the resume's Education section anchors
  // to `Wall_frames` and hovers its prints by walking it, so it has to remain one
  // prop. `editParts` is what tells edit mode to pick a frame inside it rather than
  // the lot.
  const shell = groups[0]?.parent;
  for (const group of groups) {
    frames.attach(group);
    const dressed = FRAME_TRANSFORMS[group.userData.label];
    if (dressed) {
      group.rotation.set(...dressed.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
      group.position.copy(frames.worldToLocal(new THREE.Vector3().fromArray(dressed.position)));
      group.updateMatrixWorld(true);
    }
  }
  if (shell && shell !== frames) shell.removeFromParent();
  frames.userData.editParts = true;

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

  if (spec.draw) {
    spec.draw(ctx, canvas, canvas.height * (spec.mat?.margin ?? 0));
    texture.needsUpdate = true;
  } else {
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
  }

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

/**
 * A page for a frame that is waiting for its certificate: white inside the mat, a
 * dashed rule round it, and `title`, `status` and the `note` lines centred down it in
 * the resume's own face. Returns a `draw(ctx, canvas, margin)` for `hang()` and
 * `gather()`; `margin` is the mat's depth in pixels, where the page starts.
 */
function placeholder({ title, status, note }) {
  return (ctx, canvas, margin) => {
    const page = {
      x: margin,
      y: margin,
      w: canvas.width - margin * 2,
      h: canvas.height - margin * 2,
    };
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(page.x, page.y, page.w, page.h);

    const inset = Math.min(page.w, page.h) * 0.06;
    ctx.strokeStyle = '#b8bcc6';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(page.x + inset, page.y + inset, page.w - inset * 2, page.h - inset * 2);
    ctx.setLineDash([]);

    const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Sized off the page's width, but capped by its height so a landscape page does
    // not run its lines off the top and bottom.
    const size = Math.min(page.w * 0.085, page.h * 0.11);
    ctx.fillStyle = '#2b2f3a';
    ctx.font = `600 ${size}px ${font}`;
    ctx.fillText(title, cx, cy - size * 1.6);

    ctx.strokeStyle = '#2b2f3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - page.w * 0.18, cy - size * 0.6);
    ctx.lineTo(cx + page.w * 0.18, cy - size * 0.6);
    ctx.stroke();

    const statusSize = size * 0.6;
    ctx.font = `500 ${statusSize}px ${font}`;
    ctx.fillText(status, cx, cy + statusSize * 0.4);

    const noteSize = size * 0.36;
    ctx.fillStyle = '#7d8595';
    ctx.font = `400 ${noteSize}px ${font}`;
    note.forEach((line, i) => {
      ctx.fillText(line, cx, cy + statusSize * 1.6 + i * noteSize * 1.4);
    });
  };
}

/**
 * Cuts one frame out of the pack: every mesh's share of `spec.region` — borders,
 * picture quad, sheet — carved out and gathered under a group pivoted on the
 * region's centre. Hung sheets ride along: they are children of the quad they lie
 * over, placed in the same units, so a child whose position falls in the region moves
 * to the carved piece. A `landscape` frame is then turned a quarter clockwise, moved
 * to `at`, and given `spec.draw`'s page, painted the other way round so it reads
 * upright on the wall. Returns the group, or null if nothing fell in the region.
 */
function gather(frames, spec) {
  const meshes = [];
  frames.traverse((node) => {
    if (node.isMesh && !node.userData.gathered) meshes.push(node);
  });

  const parts = [];
  let quad = null;
  let holder = null;
  for (const mesh of meshes) {
    const piece = carve(mesh, spec.region);
    if (!piece) continue;
    holder ??= mesh.parent;
    if (mesh.parent !== holder) {
      console.warn(`[wall frames] ${spec.label}: ${mesh.name} sits in another node — left behind`);
      piece.removeFromParent();
      continue;
    }
    // A hung sheet, or anything else under the source: over to the piece if it lies in
    // the region, since it is positioned in the same units.
    for (const child of [...mesh.children]) {
      if (inside(child.position, spec.region)) piece.add(child);
    }
    piece.userData.gathered = true;
    parts.push(piece);
    // The frame's picture: the one carved mesh with a picture-sized map and no
    // children of its own hanging over it, taken as the quad a placeholder goes on.
    if (spec.draw && !quad && piece.material?.map && piece.children.length === 0
      && !['Gold_14k', 'material'].includes(piece.material.name)) {
      quad = piece;
    }
  }
  if (!parts.length) {
    console.warn(`[wall frames] nothing in the pack falls in ${spec.label}'s region`);
    return null;
  }

  const { x, y } = spec.region;
  const group = new THREE.Group();
  group.name = `Wall_frame_${spec.label}`;
  group.userData.label = spec.label;
  // Pivot on the middle of the frame, at the picture's depth, so a turn is about its
  // centre; `attach` keeps each part where it is while it changes hands.
  holder.add(group);
  group.position.set((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, -6.69);
  group.updateMatrixWorld(true);
  for (const part of parts) group.attach(part);

  if (spec.landscape) {
    group.rotation.z = -Math.PI / 2;
    group.position.x = spec.at[0];
    group.position.y = spec.at[1];
    group.updateMatrixWorld(true);
    if (quad) {
      placeholderPrint(quad, spec.draw);
    } else {
      console.warn(`[wall frames] ${spec.label}: no picture quad found for its placeholder`);
    }
  }

  return group;
}

/** Sets a geometry's bounding box and sphere from the vertices its index refers to. */
function boundByIndex(geometry) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 1) {
    box.expandByPoint(v.fromBufferAttribute(position, index.getX(i)));
  }
  geometry.boundingBox = box;
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  geometry.boundingSphere = sphere;
}

/** Whether a point (in the region's units) lies inside `region`'s box. */
function inside(point, region) {
  return point.x >= region.x[0] && point.x <= region.x[1]
    && point.y >= region.y[0] && point.y <= region.y[1];
}

/**
 * Splits the triangles whose centroid lies inside `region` out of `mesh` into a mesh
 * of their own, sharing its attributes and material, and leaves the rest behind.
 * Returns the new mesh — or `mesh` itself when all of it fell inside — or null if
 * none of it did.
 */
function carve(mesh, region) {
  const geometry = mesh.geometry;
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  if (!index || !position) return null;

  const inside = [];
  const outside = [];
  for (let t = 0; t < index.count; t += 3) {
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < 3; k += 1) {
      const v = index.getX(t + k);
      cx += position.getX(v) / 3;
      cy += position.getY(v) / 3;
    }
    const hit = cx >= region.x[0] && cx <= region.x[1] && cy >= region.y[0] && cy <= region.y[1];
    (hit ? inside : outside).push(index.getX(t), index.getX(t + 1), index.getX(t + 2));
  }
  if (!inside.length) return null;
  // Everything in: the mesh itself is the piece, and nothing is left behind.
  if (!outside.length) return mesh;

  const piece = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    piece.setAttribute(name, geometry.getAttribute(name));
  }
  piece.setIndex(inside);
  geometry.setIndex(outside);
  // Both still carry the whole pack's positions, and three.js bounds a geometry by its
  // positions, not by what its index draws — so a turned frame would report a box the
  // size of the composition, swung about its pivot, and push the camera's fit and
  // `fitWidth` well off. Bound each by the triangles it actually draws.
  boundByIndex(piece);
  boundByIndex(geometry);

  const carved = new THREE.Mesh(piece, mesh.material);
  carved.name = `${mesh.name}_carved`;
  carved.castShadow = mesh.castShadow;
  carved.receiveShadow = mesh.receiveShadow;
  mesh.parent.add(carved);
  return carved;
}

/**
 * Paints `draw`'s page into a turned frame's quad so it reads upright on the wall.
 *
 * The page is drawn the way it will be seen — landscape, the quad's height by its
 * width — and then *transposed* onto the quad's own portrait canvas. That one swap of
 * axes is the two turns folded together: the frame's quarter turn clockwise, and the
 * top-to-bottom flip the quad's UVs give a texture (glTF's origin is at the top,
 * `flipY` off). The canvas keeps the source map's sampling so it lands where the
 * print did.
 */
function placeholderPrint(quad, draw) {
  const source = quad.material.map;
  if (!source) return;

  quad.geometry.computeBoundingBox();
  const size = quad.geometry.boundingBox.getSize(new THREE.Vector3());

  // As seen: landscape.
  const page = document.createElement('canvas');
  page.height = 512;
  page.width = Math.round(512 * (size.y / size.x));
  const pctx = page.getContext('2d');
  pctx.fillStyle = '#a9adb5';
  pctx.fillRect(0, 0, page.width, page.height);
  draw(pctx, page, page.height * 0.06);

  // As stored: the page's (u, v) lands at (v, u).
  const canvas = document.createElement('canvas');
  canvas.width = page.height;
  canvas.height = page.width;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(0, 1, 1, 0, 0, 0);
  ctx.drawImage(page, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = source.colorSpace;
  texture.flipY = source.flipY;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.channel = source.channel;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  const material = quad.material.clone();
  material.map = texture;
  // Printed, not tinted — `darkenScene()` must leave the page white, as with `hang`.
  material.userData.keepColor = true;
  material.needsUpdate = true;
  quad.material = material;
  source.dispose();
}

/** Scales the group down until it spans `TARGET_WIDTH`, keeping its proportions. */
function fitWidth(frames) {
  const width = new THREE.Box3().setFromObject(frames).getSize(new THREE.Vector3()).x;
  if (!width) return;

  frames.scale.multiplyScalar(TARGET_WIDTH / width);
  frames.updateMatrixWorld(true);
}
