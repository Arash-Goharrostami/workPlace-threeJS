import { addUsbCable } from './usbCable.js';

/**
 * Two loose USB-C leads lying on the desk in front of the 3D printer: the iPhone's
 * charging lead and the AirPods Max's. Neither is plugged into anything — they are the
 * spares that live on a desk — so nothing else in the room is touched by them.
 *
 * Only the runs are given here — `usbCable.js` puts a Type-C plug on each end and aims
 * it along the run, so moving a first or last point is how an end is moved.
 *
 * Absolute, like the other cords' routes, and a first pass: dress them in edit mode and
 * paste the readout back here.
 */

const IPHONE_NAME = 'iPhone_charger';
const AIRPODS_NAME = 'AirPods_charger';

/** Height of a lead's centreline lying on the desk top: the top plus its radius. */
const ON_DESK = 89.76;

/** The iPhone lead, in world centimetres, plug end first: a lazy S across the arm. */
const IPHONE_ROUTE = [
  [113.0, ON_DESK, -80.0],
  [117.0, ON_DESK, -77.0],
  [121.5, ON_DESK, -76.5],
  [126.0, ON_DESK, -78.5],
  [130.5, ON_DESK, -81.0],
  [135.0, ON_DESK, -80.0],
  [138.5, ON_DESK, -77.5],
];

/** The AirPods lead, a little nearer the desk's front edge and crossing the first. */
const AIRPODS_ROUTE = [
  [116.0, ON_DESK, -70.0],
  [120.0, ON_DESK, -72.5],
  [124.5, ON_DESK, -75.5],
  [129.0, ON_DESK, -74.0],
  [133.0, ON_DESK, -70.5],
  [136.5, ON_DESK, -68.0],
  [140.0, ON_DESK, -68.5],
];

/** Adds both leads. Their routes are authored, so they need nothing but somewhere to hang. */
export async function addChargerCables(parent) {
  const iphone = await addUsbCable({ parent, name: IPHONE_NAME, route: IPHONE_ROUTE });
  const airpods = await addUsbCable({ parent, name: AIRPODS_NAME, route: AIRPODS_ROUTE });
  return { iphone, airpods };
}
