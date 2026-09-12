import * as THREE from 'three';
import { frameAnchor, roomCenterOf } from './anchors.js';

/**
 * The wall frames read one print at a time.
 *
 * Education is not a section with a sidebar beside it — the prints on the back wall
 * *are* the section (see `anchors.js`), so the only thing left to do once the camera is
 * there is to let a single frame be looked at closely. Clicking a print flies to it;
 * clicking again steps back out to the whole composition. `index.js` owns that
 * sequencing; this module owns which prints exist, where the camera goes for each, and
 * what the HUD says about them.
 *
 * Every anchor here is built through `frameAnchor()`, the same helper the section table
 * uses, so a print is fitted by exactly the maths that fits a prop — including the
 * `face` mode that frames a flat rectangle rather than its bounding sphere, which is
 * what fills the viewport with a picture instead of with the wall around it.
 */

/**
 * The frame bodies, by material name — everything else under the group is a print. The
 * pack hangs its pictures on `Gold_14k` mounts and one unnamed `material` backing board,
 * and both are solid boxes rather than the flat planes the pictures are.
 *
 * **Material names are load-bearing here**, exactly as they are in `wallFrames.js`: the
 * meshes are all called `Material200n`, so the material is the only handle on which one
 * is which. A re-import that renames them will drop every print, which `collect()` warns
 * about rather than failing silently.
 */
const FRAME_BODIES = new Set(['Gold_14k', 'material']);

/**
 * What the HUD says while a print is being read, by material name. `_3010_2` is the
 * frame `wallFrames.js` reprints with the LPIC-3 certificate and `recommendation` the
 * letter it hangs in the bottom-right frame, `degree` the B.Sc. in the top-middle one;
 * the rest are still the
 * pack's own art, and fall back to the section's own line until they carry a
 * certificate of their own.
 */
const CAPTIONS = {
  _3010_2: 'LPIC-3 — Linux Professional Institute',
  recommendation: 'Letter of recommendation — Pejvak data khazar',
  degree: 'B.Sc. Computer Engineering — Islamic Azad University',
  certificates: 'W3Schools — JavaScript & TypeScript certifications',
};

/** How thin a mesh has to be, against its own width, to count as a picture plane. */
const FLATNESS = 0.05;

export function setupWallFrames({ group, model, camera, outlines }) {
  const roomCenter = roomCenterOf(model);
  const prints = collect(group);

  // Built once, at the aspect the page loaded at — the same bargain every anchor in
  // `anchors.js` makes.
  const anchors = new Map();
  for (const print of prints) {
    anchors.set(print, {
      ...frameAnchor(print, { view: captionOf(print), fit: 'face', distance: 1 }, roomCenter, camera),
      label: 'Education',
    });
  }

  /**
   * The anchor for whichever print `object` belongs to, or null for a click that landed
   * on a mount, on the backing board, or off the composition entirely. The raycast hits
   * the mesh itself, which for these is the print, but a click is walked up anyway so a
   * re-import that splits a picture into parts still resolves.
   */
  const anchorFor = (object) => {
    for (let node = object; node; node = node.parent) {
      const anchor = anchors.get(node);
      if (anchor) return anchor;
      if (node === group) break;
    }
    return null;
  };

  /**
   * Rims the print under the pointer. Returns whether there is one, which is what tells
   * `picking.js` to show a pointer cursor — with no other chrome on screen, that rim is
   * the whole of the affordance saying the frames are individually clickable.
   */
  const hover = (object) => {
    const print = object && findPrint(object);
    outlines.hover(print ?? null);
    return Boolean(print);
  };

  const reset = () => outlines.hover(null);

  function findPrint(object) {
    for (let node = object; node; node = node.parent) {
      if (anchors.has(node)) return node;
      if (node === group) break;
    }
    return null;
  }

  return { anchorFor, hover, reset, get count() { return prints.length; } };
}

/**
 * The picture planes under the group: flat enough to be a picture rather than a box,
 * and not one of the two frame bodies.
 */
function collect(group) {
  const prints = [];
  group.traverse((node) => {
    if (!node.isMesh || FRAME_BODIES.has(node.material?.name)) return;
    const size = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3());
    const [longest, , thinnest] = size.toArray().sort((a, b) => b - a);
    if (longest > 0 && thinnest <= longest * FLATNESS) prints.push(node);
  });

  if (!prints.length) {
    console.warn('[wall frames] no prints found to focus — were the materials renamed?');
  }
  return prints;
}

function captionOf(print) {
  return CAPTIONS[print.material?.name] ?? 'Detail — wall frames';
}
