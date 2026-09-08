import { addUsbCable } from './usbCable.js';
import { addMainsCable } from './mainsCable.js';

/**
 * The Pro Display's two leads: mains from the wall outlet, and USB-C from the Mac Pro.
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
  [-7.27, 100.91, -129.63],
  [-6.79, 117.17, -125.33],
  [-7.51, 122.58, -123.90],
  [-12.49, 130.38, -118.90],
  [-19.29, 137.63, -114.97],
  [-19.94, 138.04, -114.24],
  [-20.17, 138.27, -113.51],
  [-20.16, 138.26, -112.04],
];

/**
 * The mains lead, dressed the same way: from the strip on the floor, up behind the
 * desk and into the display's inlet.
 */
const POWER_ROUTE = [
  [133.14, 12.93, -85.00],
  [132.49, 17.11, -85.62],
  [131.79, 18.32, -87.37],
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
  [-2.96, 106.07, -131.26],
  [-6.21, 119.25, -124.81],
  [-14.63, 137.57, -116.94],
  [-14.87, 138.07, -113.73],
];

const POWER_ENDS = [
  {
    position: [133.0, 10.1, -85.1],
    rotation: [-1.9, -63.2, -1.4],
    scale: [1.091, 1.020, 1.188],
  },
  {
    position: [-14.9, 138.0, -112.2],
    rotation: [-89.1, 138.3, -140],
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
    position: [-20.2, 138.1, -111.6],
    rotation: [-2.5, -179.9, -90],
    scale: [1.554, 1.554, 1.554],
  },
];

/** Adds both leads. Both carry their own numbers, so they need only a parent. */
export async function addDisplayCables(parent) {
  const [power, usb] = await Promise.all([
    addMainsCable({ parent, name: 'Display_power', route: POWER_ROUTE, ends: POWER_ENDS }),
    addUsbCable({ parent, name: 'Display_usb_c', route: USB_ROUTE, ends: USB_ENDS }),
  ]);

  return { power, usb };
}
