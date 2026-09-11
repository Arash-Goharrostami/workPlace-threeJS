import * as THREE from 'three';
import { buildCable } from './cable.js';
import { addTypeCPlug } from './usbCable.js';

/**
 * The two HomePod minis' leads: each one off the riser plate, along the back of the desk
 * and up into the back of the Pro Display XDR, where its Type-C plug is seated.
 *
 * Split from `homePodMini.js` for the reason `screenbarCable.js` and `printerCable.js`
 * are split from their props: the speaker is one thing and its run is another.
 *
 * **The routes are authored, not derived.** The first pass measured them off live bounds
 * — the speaker's own exit, the riser's box, the desk top — which is the right way to get
 * a cord that *lands* on a surface and not the way to get one that *goes* somewhere.
 * These two climb the back of the display and plug in, and no amount of measuring finds
 * that route; it was dressed in edit mode and pasted back, the way the room's other runs
 * are. So they are absolute, like `airpodsMax.js`'s transform: move the desk and they stay
 * where they are, and re-dressing them is how they follow.
 *
 * Each still begins exactly on its speaker's `cable exit` marker, which is the one point
 * that has to move when a speaker is nudged along the plate.
 */

/** A braided USB-C lead is about 3 mm across, so 1.5 mm of radius in this scene's cm. */
const RADIUS = 0.15;

/** Dark braid: not black, and rough enough that it never picks up a highlight. */
const BRAID = { color: 0x1b1c1f, roughness: 0.92, metalness: 0.04 };

/** The plug's moulding: the braid's colour lifted a little, the way a moulding sits. */
const SHELL = { color: 0x2a2b2f, roughness: 0.6, metalness: 0.05 };

/**
 * Each run, by the speaker it leaves — world centimetres, first point on that speaker's
 * underside and last at the display's back panel.
 */
const ROUTES = {
  HomePod_mini: [
    [17.50, 99.52, -111.37],
    [18.90, 99.57, -112.37],
    [21.72, 99.53, -118.22],
    [21.01, 99.60, -124.08],
    [5.09, 101.43, -125.43],
    [-1.19, 107.92, -126.78],
    [-2.60, 114.18, -126.88],
    [-4.01, 120.45, -125.70],
    [-5.10, 123.81, -124.19],
    [-5.75, 126.46, -122.67],
    [-10.94, 131.21, -120.22],
    [-16.59, 135.96, -117.77],
    [-20.27, 138.02, -114.40],
    [-20.50, 138.03, -112.57],
  ],
  HomePod_mini_2: [
    [-25.50, 99.52, -111.37],
    [-24.10, 99.57, -112.37],
    [-24.53, 99.57, -121.62],
    [-20.84, 99.61, -124.04],
    [-18.57, 99.54, -124.68],
    [-15.05, 100.38, -124.50],
    [-6.05, 124.17, -124.05],
    [-6.54, 127.90, -122.01],
    [-9.86, 131.64, -121.33],
    [-17.82, 137.29, -116.44],
    [-18.72, 137.96, -114.56],
    [-18.93, 138.16, -112.28],
  ],
};

/**
 * Where each plug ends up, as edit mode reports it: world position, rotation in degrees
 * in the readout's own `YXZ` order, and the scale it was resized to.
 *
 * Dressed rather than derived, and here it matters more than it does for the cord. A plug
 * aimed along the last leg of its run points wherever that run happens to arrive; a plug
 * in a socket points into the socket — and these two reach the same panel off two
 * different climbs.
 */
const PLUGS = {
  HomePod_mini: {
    position: [-20.5, 138.1, -111.5],
    rotation: [0.5, -180, 90.9],
    scale: [1.603, 1.603, 1.603],
  },
  HomePod_mini_2: {
    position: [-18.9, 138.1, -111.4],
    rotation: [-2, 179.9, 90.6],
    scale: [1.62, 1.62, 1.62],
  },
};

/**
 * Runs one speaker's lead and seats its plug. Everything is named off the speaker, so the
 * pair's two cords and two plugs cannot collide.
 */
export async function addHomePodCable(parent, speaker) {
  if (!speaker) return null;

  const route = ROUTES[speaker.name];
  const seat = PLUGS[speaker.name];
  if (!route || !seat) {
    console.warn(`[homepod cable] no run authored for "${speaker.name}"`);
    return null;
  }

  const cable = buildCable({
    name: `${speaker.name}_cable`,
    points: route.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    radius: RADIUS,
    material: keep(new THREE.MeshStandardMaterial({ name: `${speaker.name}_braid`, ...BRAID })),
    parent,
  });
  parent.add(cable);

  const plug = await addTypeCPlug({
    parent,
    name: `${speaker.name}_plug`,
    ...seat,
    finish: SHELL,
  });

  return { cable, plug };
}

/** An authored colour — darkenScene() must not tint it again. */
function keep(material) {
  material.userData.keepColor = true;
  return material;
}
