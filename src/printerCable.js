import { addMainsCable } from './mainsCable.js';

/**
 * The 3D printer's mains lead: a plug in a free socket on the near floor strip, up the
 * back of the desk behind its back edge, and over the lip into the machine's back panel.
 *
 * Nothing new is imported for it — `mainsCable.js` already lifts the moulded plug and
 * the appliance connector out of `powerCable.glb` and draws the flex with
 * `buildCable()`, so this module is only the run.
 *
 * The printer's own GLB is a single mesh with no inlet node, so the appliance end is
 * simply pushed into the back of the shell, the way the Mac Pro's head is.
 *
 * Both ends are hand-dressed, like the Mac Pro's: the plug sits at the angle its socket
 * on the strip holds it at, and the appliance end comes into the printer's back panel
 * across the run rather than along it, so neither is a direction the route itself gives.
 *
 * The route is absolute, like the room's other cords: move the printer or the strip and
 * it stays where it is. The fix is to re-dress it in edit mode and paste the readout's
 * list back here, not to nudge these numbers by hand.
 */

const NAME = 'Printer_power';

/**
 * The run in world centimetres, plug end first, dressed by hand in edit mode and copied
 * out of its readout. Out of the near strip beside the Mac Pro, across the tiles under
 * the desk, then up behind its back edge — the desk top ends at z ~ -131.5, so
 * everything below y = 85 is hidden from the room — and over the lip into the printer.
 */
const ROUTE = [
  [135.57, 10.95, -93.33],
  [135.03, 14.06, -93.75],
  [133.72, 14.65, -95.79],
  [130.91, 10.83, -100.01],
  [127.20, 6.28, -105.12],
  [123.42, 5.60, -111.10],
  [119.65, 6.22, -117.08],
  [113.67, 12.30, -128.74],
  [113.33, 14.56, -130.00],
  [113.12, 20.00, -131.28],
  [113.60, 32.00, -132.40],
  [114.60, 46.00, -133.00],
  [115.80, 60.00, -133.20],
  [115.36, 72.00, -133.10],
  [113.17, 82.00, -132.60],
  [111.18, 86.02, -131.30],
  [109.66, 87.08, -129.50],
  [109.17, 87.95, -127.50],
  [108.49, 89.30, -123.20],
  [108.09, 89.63, -120.45],
  [108.39, 89.77, -115.08],
];

/**
 * Where each connector was left, in the readout's own terms: world centimetres, degrees
 * in its `YXZ` order, and the scale the part is drawn at.
 */
const PLUG_TRANSFORM = {
  position: [135.2, 10.1, -93.4],
  rotation: [-1.1, -57.7, -1.8],
  scale: [1, 1, 1],
};

const HEAD_TRANSFORM = {
  position: [108.3, 89.6, -118.0],
  rotation: [88.8, -139.1, 40.5],
  scale: [1, 1, 1],
};

/** Adds the lead. Its route is world-space, so it needs nothing but somewhere to hang. */
export async function addPrinterCable(parent) {
  return addMainsCable({
    parent,
    name: NAME,
    route: ROUTE,
    ends: [PLUG_TRANSFORM, HEAD_TRANSFORM],
  });
}
