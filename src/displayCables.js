import { addUsbCable } from './usbCable.js';
import { addMainsCable } from './mainsCable.js';

/**
 * The displays' four leads: mains and USB-C for the main one, and the same pair for the
 * portrait display beside it.
 *
 * Both runs, and the mains lead's two connectors, are authored below: dressed by hand
 * in edit mode and copied out of its readout. Absolute, like the other cords — move
 * the display or the tower and they stay where they are.
 */

/**
 * The USB-C lead, dressed by hand and copied out of edit mode's readout: the run in
 * world centimetres from the tower's port up the back of the room to the display, and
 * the transform each plug was left at.
 *
 * Absolute, like the other dressed cords: move the display or the tower and it stays
 * where it is — re-dress it and paste the new numbers back here.
 */
const USB_ROUTE = [
  [110.63, 38.01, -95.74],
  [110.40, 37.86, -97.76],
  [110.12, 36.06, -98.85],
  [109.55, 22.05, -101.02],
  [108.44, 21.79, -101.71],
  [107.32, 25.48, -102.40],
  [106.21, 45.96, -103.10],
  [105.09, 66.44, -103.79],
  [100.64, 67.65, -106.17],
  [87.02, 71.26, -114.32],
  [73.40, 77.07, -122.08],
  [56.65, 76.68, -125.16],
  [35.30, 76.09, -120.71],
  [-2.14, 75.19, -119.90],
  [-10.05, 79.64, -131.85],
  [-7.75, 84.66, -132.65],
  [-4.87, 100.91, -129.63],
  [-3.96, 117.17, -125.04],
  [-4.32, 122.58, -123.67],
  [-6.49, 126.02, -121.25],
  [-11.57, 130.38, -118.90],
  [-17.27, 137.63, -114.97],
  [-17.46, 138.04, -114.24],
  [-17.53, 138.21, -113.51],
  [-17.39, 138.19, -112.04],
];

/**
 * The mains lead, dressed the same way: from the strip on the floor, up behind the
 * desk and into the display's inlet.
 */
const POWER_ROUTE = [
  [133.14, 12.93, -85.00],
  [132.49, 15.37, -85.62],
  [131.79, 16.16, -87.37],
  [120.66, 6.28, -101.56],
  [112.01, 7.85, -106.77],
  [105.09, 36.63, -109.37],
  [104.96, 66.29, -111.98],
  [100.42, 69.11, -113.38],
  [94.68, 70.97, -115.14],
  [88.92, 72.85, -116.50],
  [73.67, 77.71, -121.03],
  [69.39, 77.66, -122.02],
  [65.12, 76.97, -123.01],
  [54.96, 75.90, -124.99],
  [36.30, 76.73, -116.62],
  [-3.74, 76.61, -116.95],
  [-5.37, 79.44, -131.76],
  [-2.96, 106.07, -129.50],
  [-4.20, 119.25, -125.00],
  [-7.28, 128.41, -120.88],
  [-11.77, 137.57, -116.94],
  [-12.13, 138.07, -113.73],
];

const POWER_ENDS = [
  {
    position: [133.0, 10.1, -85.1],
    rotation: [-1.9, -63.2, -1.4],
    scale: [1.091, 1.020, 1.188],
  },
  {
    position: [-12.0, 138.0, -112.2],
    rotation: [-89.1, 138.3, -140],
    scale: [1.257, 1.257, 1.257],
  },
];

/**
 * The portrait display's mains lead — the same cord as `POWER_ROUTE`, copied: the plug
 * moved one socket along the strip, the trunk behind the desk dropped a little so the
 * two cords lie beside each other rather than through one another, and a new tail that
 * carries on left along the desk and up the back of the second display.
 *
 * Dressed by hand in edit mode like the others, and pasted back from its readout.
 */
const SIDE_POWER_ROUTE = [
  [134.30, 12.93, -89.30],
  [134.24, 15.52, -89.92],
  [131.79, 15.67, -91.67],
  [120.66, 6.22, -102.76],
  [116.34, 5.67, -105.37],
  [112.01, 8.07, -107.97],
  [105.09, 35.83, -110.57],
  [104.96, 65.49, -113.18],
  [104.42, 67.14, -113.88],
  [101.96, 68.16, -114.58],
  [94.68, 70.17, -116.34],
  [88.92, 72.05, -117.70],
  [73.67, 77.37, -122.23],
  [69.39, 77.42, -123.85],
  [65.12, 76.17, -124.70],
  [54.96, 75.25, -126.19],
  [36.30, 76.81, -117.82],
  [-3.74, 77.37, -118.15],
  [-25.00, 77.76, -125.96],
  [-45.00, 80.42, -131.99],
  [-58.00, 86.02, -131.51],
  [-66.00, 95.00, -120.99],
  [-66.33, 108.53, -115.39],
  [-65.70, 112.57, -112.99],
  [-64.55, 115.53, -109.43],
  [-62.70, 115.99, -104.82],
];

/** Its two ends: the next hole along the strip, and the second display's inlet. */
const SIDE_POWER_ENDS = [
  {
    position: [134.2, 10.1, -89.3],
    rotation: [-1.9, -63.2, -1.4],
    scale: [1.091, 1.020, 1.188],
  },
  {
    position: [-62.5, 116.1, -104.7],
    rotation: [-89.1, 160.9, -140],
    scale: [1.257, 1.257, 1.257],
  },
];

const USB_ENDS = [
  {
    position: [110.5, 38.1, -94.9],
    rotation: [1.4, 178.3, 0.6],
    scale: [1.324, 1.324, 1.324],
  },
  {
    position: [-17.5, 138.1, -111.6],
    rotation: [-2.5, -179.9, -90],
    scale: [1.554, 1.554, 1.554],
  },
];

/**
 * The portrait display's USB-C lead: out of the port next to the first display's on the
 * tower's back, down and along the same trunk as its mains cord — offset a little so the
 * thin white lead lies beside the black one rather than inside it — and up to the second
 * display's port.
 *
 * Dressed by hand in edit mode like the others, and pasted back from its readout.
 */
const SIDE_USB_ROUTE = [
  [112.02, 38.07, -95.74],
  [112.14, 37.86, -97.76],
  [111.80, 36.06, -98.85],
  [108.59, 27.72, -101.74],
  [106.86, 27.74, -102.29],
  [105.94, 29.25, -102.40],
  [105.16, 45.96, -103.10],
  [104.70, 66.48, -104.79],
  [101.82, 67.46, -106.52],
  [85.75, 71.05, -116.70],
  [73.67, 77.00, -123.09],
  [69.39, 77.55, -124.66],
  [65.12, 75.72, -124.99],
  [54.96, 74.79, -125.19],
  [36.30, 75.81, -119.79],
  [-3.74, 75.78, -120.07],
  [-25.00, 76.76, -124.96],
  [-45.00, 79.42, -130.99],
  [-55.68, 83.40, -132.25],
  [-61.74, 86.75, -130.51],
  [-66.00, 94.00, -119.99],
  [-67.54, 102.66, -116.59],
  [-67.56, 104.45, -116.19],
  [-67.40, 106.24, -115.79],
  [-66.96, 107.70, -115.09],
  [-66.64, 108.30, -114.39],
  [-65.55, 109.39, -111.99],
  [-63.63, 110.61, -107.00],
  [-62.79, 110.63, -104.50],
];

/** Its two plugs: the free port along from the first lead's, and the second display's. */
const SIDE_USB_ENDS = [
  {
    position: [112.0, 38.1, -94.9],
    rotation: [1.4, 178.3, 0.6],
    scale: [1.324, 1.324, 1.324],
  },
  {
    position: [-62.5, 110.6, -104.1],
    rotation: [-1.2, -159.5, 0.7],
    scale: [1.554, 1.554, 1.554],
  },
];

/** Adds all four leads. Each carries its own numbers, so they need only a parent. */
export async function addDisplayCables(parent) {
  const [power, usb, sidePower, sideUsb] = await Promise.all([
    addMainsCable({ parent, name: 'Display_power', route: POWER_ROUTE, ends: POWER_ENDS }),
    addUsbCable({ parent, name: 'Display_usb_c', route: USB_ROUTE, ends: USB_ENDS }),
    addMainsCable({
      parent,
      name: 'Side_display_power',
      route: SIDE_POWER_ROUTE,
      ends: SIDE_POWER_ENDS,
    }),
    addUsbCable({
      parent,
      name: 'Side_display_usb_c',
      route: SIDE_USB_ROUTE,
      ends: SIDE_USB_ENDS,
    }),
  ]);

  return { power, usb, sidePower, sideUsb };
}
