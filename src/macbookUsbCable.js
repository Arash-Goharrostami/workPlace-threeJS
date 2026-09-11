import { addUsbCable } from './usbCable.js';

/**
 * The USB-C lead from the MacBook down to the Mac Pro: out of the laptop, down the
 * back of the desk and up into the tower's port panel.
 *
 * Only the run is given here — `usbCable.js` puts a Type-C plug on each of its ends
 * and aims it along the run, so moving the first or last point is how an end is moved.
 */

const NAME = 'MacBook_usb_c';

/**
 * The run itself, in world centimetres, plug end first. Dressed by hand in edit mode
 * and copied out of its readout.
 *
 * Absolute, like the other cords' routes: move the laptop or the tower and the lead
 * stays where it is — re-dress it in edit mode and paste the new list back here.
 */
const ROUTE = [
  [29.14, 106.67, -102.37],
  [28.28, 106.62, -102.60],
  [27.56, 106.04, -103.25],
  [27.37, 104.87, -104.09],
  [27.75, 103.70, -104.93],
  [30.68, 99.87, -106.67],
  [33.75, 95.95, -108.04],
  [46.39, 86.28, -114.33],
  [54.55, 85.80, -129.70],
  [56.22, 85.19, -132.02],
  [59.59, 80.40, -131.68],
  [68.53, 77.44, -122.96],
  [74.58, 77.00, -121.35],
  [93.02, 69.28, -110.20],
  [102.05, 67.49, -104.10],
  [105.01, 66.40, -101.46],
  [107.00, 49.71, -100.01],
  [108.00, 11.55, -99.96],
  [109.00, 11.59, -98.55],
  [109.00, 35.38, -98.14],
  [109.00, 37.74, -97.36],
  [108.98, 38.08, -95.99],
];

/**
 * Both ends, dressed by hand: each pushed into its port at its own angle and set a
 * little larger than the model's own size, rather than left to follow the run.
 */
const LAPTOP_END = {
  position: [30.1, 106.7, -102.0],
  rotation: [0.9, -107.4, 159.8],
  scale: [1.337, 1.337, 1.337],
};

const TOWER_END = {
  position: [109.0, 38.1, -95.0],
  rotation: [2.4, 177.9, 1.5],
  scale: [1.251, 1.496, 1.251],
};

/** Adds the lead. Its route is authored, so it needs nothing but somewhere to hang. */
export async function addMacbookUsbCable(parent) {
  return addUsbCable({ parent, name: NAME, route: ROUTE, ends: [LAPTOP_END, TOWER_END] });
}
