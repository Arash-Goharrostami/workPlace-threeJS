import * as THREE from 'three';
import { addUsbCable } from './usbCable.js';

/**
 * The ScreenBar Halo's own lead: out of the port on the back of the bar, down behind
 * the display's top edge and into a USB-C port on its back panel. A short cord — the
 * lamp is powered by the monitor it sits on, so it never reaches the desk.
 *
 * Unlike every other cord in the room, this one is written *relative to the bar*.
 * `screenbar.js` gives the bar no position of its own — it hangs off the display by an
 * offset — so an absolute route would come unstuck the moment the monitor moves, and
 * the run is short enough that it has nothing else to hold onto. The numbers below are
 * therefore world-centimetre offsets from the bar's world origin, added at load time.
 *
 * Dressing it in edit mode means subtracting the bar's world position from the readout
 * before pasting the run back here — the same arithmetic `screenbar.js` documents for
 * the bar itself.
 */

const NAME = 'Screenbar_usb_c';

/**
 * The run, plug-at-the-bar first, as offsets from the bar's origin. It leaves the
 * bar's back face, runs down the back of the panel past the port, and comes back up into
 * it — the slack loop a lead too long for the gap between the two ports falls into,
 * rather than a taut line that would read as cut to length.
 */
const ROUTE = [
  [-4.93, -2.92, -2.33],
  [-5.92, -3.14, -2.37],
  [-6.63, -3.98, -2.61],
  [-6.83, -7.79, -3.06],
  [-6.74, -11.61, -3.49],
  [-6.96, -19.49, -4.30],
  [-7.20, -25.47, -4.65],
  [-7.73, -31.46, -5.01],
  [-9.21, -32.93, -4.88],
  [-11.19, -31.81, -4.81],
  [-11.90, -21.78, -4.70],
  [-11.90, -20.31, -3.97],
  [-11.90, -20.03, -3.43],
  [-11.89, -19.99, -2.98],
];

/**
 * Both ends, offset the same way: pushed into the bar's back and into the display's
 * port rather than left to follow the run. The display end carries the quarter turn
 * the panel's ports sit at, the same one the display's own lead was dressed to.
 */
const BAR_END = {
  offset: [-3.70, -2.91, -2.30],
  rotation: [0.5, -88.9, 119.5],
  scale: [1.3, 1.3, 1.3],
};

const DISPLAY_END = {
  offset: [-11.90, -20.01, -1.10],
  rotation: [-2.5, -179.9, -90],
  scale: [1.513, 1.615, 1.615],
};

/** Adds the lead. It needs the bar itself, since every number above is relative to it. */
export async function addScreenbarCable(parent, bar) {
  if (!bar) return null;

  bar.updateMatrixWorld(true);
  const origin = bar.getWorldPosition(new THREE.Vector3());
  const at = ([x, y, z]) => [origin.x + x, origin.y + y, origin.z + z];

  return addUsbCable({
    parent,
    name: NAME,
    route: ROUTE.map(at),
    ends: [BAR_END, DISPLAY_END].map(({ offset, rotation, scale }) => ({
      position: at(offset),
      rotation,
      scale,
    })),
  });
}
