/**
 * macOS's menu bar, drawn onto whatever canvas the Pro Display XDR is showing.
 *
 * It is not a plane of its own. It used to be one — a transparent, emissive plane hung
 * in front of the section's — and every way that read wrong came from the separation:
 * the strip was shaded by the room's lights while the window under it was not, it
 * blended with what was behind it instead of covering it, and being seated on the
 * panel's whole front face it ran out over the bezel the section's black page hid.
 *
 * So the bar is painted straight onto the section's canvas by `notesApp.js`, which
 * reserves `menuBarHeight()` of it and seats its window against the underside. That
 * canvas hangs off a `MeshBasicMaterial` with `toneMapped: false`, so the chrome is
 * opaque, flat, and lit by nothing — the way a screen that is switched on reads.
 *
 * Nothing is loaded: every glyph is drawn with canvas paths, so this adds no files to
 * `public/` and never touches the model pipeline. Nothing here touches three.js either
 * — this module knows about a 2D context and its size, and no more than that.
 */

/** The face the desktop is set in, matching the one the iPhone's screen uses. */
const FONT = '"Avenir Next", "Helvetica Neue", Helvetica, sans-serif';

/**
 * The menu bar's height in canvas pixels, off the **shorter** edge of the glass.
 *
 * macOS's bar is a fixed number of points however large or tall the display is, so a
 * fraction of the height alone is wrong the moment a screen is not landscape: on the
 * portrait display it made a bar half again too deep, whose menus ran into the clock.
 * The short edge is the one that tracks how big the screen reads.
 *
 * Exported because both window modules seat themselves directly under the bar and have
 * no other way to know where that is.
 */
export function menuBarHeight(W, H) {
  return Math.round(Math.min(W, H) * 0.033);
}

/**
 * The menu bar: the Apple mark and `app`'s menus on the left, Control
 * Centre and the machine's own clock on the right, over solid black.
 *
 * No battery and no charge reading: this is a desk display driven by a Mac Pro, and a
 * machine on mains shows neither.
 *
 * Solid rather than the frosted strip it used to be: the screen behind it is a
 * near-black page in Notes' own dark mode, and that is what macOS's bar reads as there
 * — a black band with no seam under it, which is also how the reference shot reads.
 */
export function drawMenuBar(c, W, H, app = 'Notes') {
  const barH = menuBarHeight(W, H);
  const text = Math.round(barH * 0.5);

  c.save();
  c.fillStyle = '#000000';
  c.fillRect(0, 0, W, barH);

  c.fillStyle = '#ffffff';
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  const mid = barH / 2;

  const PAD = Math.round(W * 0.011);
  let x = PAD;

  drawAppleMark(c, x, mid, barH * 0.54);
  x += barH * 0.62;

  // The frontmost app is set in semibold, its menus in regular — the one weight
  // difference macOS puts in the bar. Whichever window is under this bar names it: the
  // XDR runs Notes, the portrait display TextEdit.
  c.font = `600 ${text}px ${FONT}`;
  c.fillText(app, x, mid);
  x += c.measureText(app).width + text * 1.15;

  c.font = `400 ${text}px ${FONT}`;
  for (const item of ['File', 'Edit', 'Format', 'View', 'Window', 'Help']) {
    c.fillText(item, x, mid);
    x += c.measureText(item).width + text * 1.15;
  }

  // The right-hand end is laid out from the edge inwards, so the clock's width — which
  // changes with the date — never shifts the glyphs beside it.
  let right = W - PAD;

  c.textAlign = 'right';
  c.font = `400 ${text}px ${FONT}`;
  c.fillText(clockText(), right, mid);
  right -= c.measureText(clockText()).width + text * 1.5;

  drawControlCentre(c, right, mid, barH * 0.4);
  c.restore();
}

/** The date and time, the way the menu bar reads it: `Thu Sep 10  10:37`. */
function clockText() {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'short' });
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `${day} ${date}  ${time}`;
}

/** The Apple mark, drawn as a path — the glyph is not in any font we can count on. */
function drawAppleMark(c, x, y, h) {
  const s = h / 100;
  c.save();
  c.translate(x, y - h / 2);
  c.scale(s, s);
  c.fillStyle = '#ffffff';

  // The body: two lobes meeting at a dimple under the leaf.
  c.beginPath();
  c.moveTo(50, 28);
  c.bezierCurveTo(60, 18, 78, 20, 84, 34);
  c.bezierCurveTo(72, 41, 71, 58, 85, 66);
  c.bezierCurveTo(80, 82, 68, 96, 57, 94);
  c.bezierCurveTo(52, 92, 48, 92, 43, 94);
  c.bezierCurveTo(30, 98, 14, 78, 14, 58);
  c.bezierCurveTo(14, 36, 30, 22, 44, 26);
  c.closePath();
  c.fill();

  // The leaf.
  c.beginPath();
  c.moveTo(54, 22);
  c.bezierCurveTo(54, 10, 63, 2, 72, 0);
  c.bezierCurveTo(73, 11, 66, 21, 54, 22);
  c.closePath();
  c.fill();
  c.restore();
}

/** Control Centre: the two stacked sliders of its own icon. */
function drawControlCentre(c, right, y, h) {
  c.save();
  c.strokeStyle = '#ffffff';
  c.lineWidth = h * 0.18;
  c.lineCap = 'round';
  const w = h * 0.92;
  for (const [row, knob] of [[-h * 0.26, 0.66], [h * 0.26, 0.34]]) {
    c.beginPath();
    c.moveTo(right - w, y + row);
    c.lineTo(right, y + row);
    c.stroke();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(right - w + w * knob, y + row, h * 0.2, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/**
 * Repaints on the minute. Checked once a second but only drawn when the string the bar
 * would show has actually changed — the same guard `iphone15Pro.js` puts on its clock,
 * and it matters more here, where a repaint is a four-megapixel canvas.
 */
export function startClock(paint) {
  let shown = clockText();
  setInterval(() => {
    const now = clockText();
    if (now === shown) return;
    shown = now;
    paint();
  }, 1000);
}
