import { addUsbCable } from './usbCable.js';

/**
 * Two loose USB-C leads lying on the desk in front of the 3D printer: the iPhone's
 * charging lead and the AirPods Max's. Neither is plugged into anything — they are the
 * spares that live on a desk — so nothing else in the room is touched by them.
 *
 * `usbCable.js` puts a Type-C plug on each end. Both leads have been dressed in edit
 * mode, so their ends carry their own pose rather than being aimed along the run — the
 * two meet at x≈62, z≈-113 with one plug lying on the other.
 *
 * Absolute, like the other cords' routes: dress them in edit mode and paste the readout
 * back here.
 */

const IPHONE_NAME = 'iPhone_charger';
const AIRPODS_NAME = 'AirPods_charger';

/**
 * The iPhone lead, in world centimetres: from its plug near the desk's left, back along
 * the desk to where it meets the AirPods lead.
 */
const IPHONE_ROUTE = [
  [62.09, 87.08, -112.29],
  [61.96, 87.88, -110.40],
  [61.33, 88.15, -108.44],
  [60.55, 87.80, -106.47],
  [57.47, 86.00, -101.83],
  [36.38, 85.69, -114.76],
  [32.30, 85.77, -115.03],
  [28.21, 85.86, -111.84],
  [27.16, 85.90, -106.32],
  [30.79, 85.94, -102.22],
  [31.85, 85.95, -98.60],
  [29.30, 85.96, -94.97],
  [23.93, 85.97, -94.28],
  [18.56, 85.98, -91.30],
  [15.31, 86.00, -88.97],
  [12.05, 86.02, -87.89],
  [8.11, 87.94, -87.61],
  [5.32, 89.86, -88.84],
  [4.25, 90.23, -89.63],
  [3.40, 90.25, -90.44],
];

/** Both iPhone ends, as edit mode reported them. */
const IPHONE_ENDS = [
  {
    position: [62.1, 86.7, -113.1],
    rotation: [-27, -1, 0.3],
    scale: [1, 1, 1],
  },
  {
    position: [2.6, 90.1, -91.4],
    rotation: [-5.6, 40.4, -87.4],
    scale: [1.145, 1.145, 1.145],
  },
];

/**
 * The AirPods lead: a loop out toward the desk's front edge and back, ending on top of
 * the iPhone lead's plug.
 */
const AIRPODS_ROUTE = [
  [55.16, 85.61, -70.07],
  [55.64, 85.65, -66.37],
  [56.41, 85.70, -62.67],
  [57.55, 85.70, -59.69],
  [58.74, 85.70, -57.84],
  [60.40, 85.70, -56.72],
  [62.26, 85.70, -56.29],
  [64.32, 85.70, -57.03],
  [65.88, 85.71, -59.06],
  [66.64, 85.71, -61.64],
  [67.05, 85.71, -66.26],
  [66.52, 85.72, -78.08],
  [66.28, 85.73, -80.60],
  [66.27, 85.73, -83.12],
  [67.20, 85.74, -88.16],
  [75.25, 85.73, -98.23],
  [78.95, 85.72, -103.27],
  [80.00, 85.72, -108.31],
  [79.74, 85.70, -112.56],
  [77.68, 85.69, -116.81],
  [75.41, 85.66, -118.37],
  [73.14, 85.63, -117.19],
  [72.23, 85.58, -111.04],
  [71.47, 85.56, -107.37],
  [70.53, 85.54, -105.74],
  [68.34, 85.53, -104.05],
  [65.03, 86.09, -104.41],
  [62.77, 88.49, -108.32],
  [62.31, 88.81, -109.85],
  [62.01, 88.47, -111.38],
  [62.05, 87.67, -113.12],
];

/** Both AirPods ends, as edit mode reported them. */
const AIRPODS_ENDS = [
  {
    position: [55.0, 85.6, -71.0],
    rotation: [0, 8.1, 0],
    scale: [1, 1, 1],
  },
  {
    position: [62.1, 87.5, -113.5],
    rotation: [-27, -2.3, -179.9],
    scale: [1, 1, 1],
  },
];

/** Adds both leads. Their routes and ends are authored, so they need nothing but somewhere to hang. */
export async function addChargerCables(parent) {
  const iphone = await addUsbCable({
    parent, name: IPHONE_NAME, route: IPHONE_ROUTE, ends: IPHONE_ENDS,
  });
  const airpods = await addUsbCable({
    parent, name: AIRPODS_NAME, route: AIRPODS_ROUTE, ends: AIRPODS_ENDS,
  });
  return { iphone, airpods };
}
