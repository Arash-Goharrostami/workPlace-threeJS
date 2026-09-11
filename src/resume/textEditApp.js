import { blocks, INK, INK_DIM, INK_FAINT, ACCENT, LINE, FONT, SCALE } from './screen.js';
import { menuBarHeight, drawMenuBar, startClock } from '../desktop.js';

/**
 * A section drawn as **TextEdit** instead of as one long page: the document's own
 * window — title bar, format toolbar, ruler — with the copy set in the body under it.
 *
 * The sibling of `notesApp.js`, and deliberately built to the same shape: `screen.js`
 * drives either through the same handful of methods, so a section becomes a window by
 * naming one in `content.js` and nothing else moves. The copy is the section's own
 * blocks from `content.js`, rendered through `blocks()` in `screen.js` — the same
 * renderers the page uses, so nothing is written twice.
 *
 * Nothing in it is clickable. TextEdit has no list to pick from, so `hitTest()` is
 * always null and a click on this screen falls through to the camera, which is what
 * `screen.js:click()` does with a window that does not take one.
 *
 * Everything is drawn with canvas paths — the traffic lights, the toolbar's popups and
 * marks, the ruler's tabs — so no icon file lands in `public/`.
 *
 * Like the Notes window, the macOS menu bar is painted onto this same canvas rather
 * than hung on a plane in front of it; see the head of `desktop.js` for why.
 */

/** What the title bar says is open. The section is the document. */
const FILENAME = 'summary.rtf';

/**
 * Where the window's own edges sit. The top is the menu bar's own depth plus a hair of
 * gap, read from `desktop.js` rather than measured; the bottom is a thin margin. Both
 * match the Notes window, so the two screens in the room are plainly the same Mac.
 */
const insetTop = (W, H) => menuBarHeight(W, H) + H * 0.004;
const INSET_BOTTOM = 0.008;

/**
 * The window's three chrome bands, in multiples of the menu bar's depth rather than as
 * fractions of the window. macOS sets all four in points, so they hold their ratio to
 * each other whatever the glass is — which is the whole reason the bar is measured off
 * the short edge; see `menuBarHeight()`.
 */
const TITLE = 1.25;
const TOOLBAR = 1.5;
const RULER = 0.72;

/** The window's own greys — TextEdit in dark mode, a shade off the page's ground. */
const CHROME = '#282a30';
const TOOLBAR_BG = '#2e3138';
const RULER_BG = '#26282e';
const PAGE_BG = '#1c1e23';
const CONTROL = '#3a3d45';

/** The traffic lights, in their order across the corner. */
const LIGHTS = ['#ff5f57', '#febc2e', '#28c840'];

/**
 * Builds the window over `view`, the canvas the section's plane already shows.
 *
 * Returns what `screen.js` drives it with. Nothing here touches three.js — this module
 * knows about a 2D canvas and a UV, and no more than that.
 */
export function createTextEditApp(section, view) {
  /** How far down the document is, and the laid-out page it is scrolled through. */
  let scroll = 0;
  let laid = null;
  /** Filled by `render()`: the body's own geometry, read by `scroll()`. */
  let body = { x: 0, y: 0, w: 0, h: 0, span: 0 };

  const app = {
    /**
     * Redraws and pushes the result to the screen. Filled in by `screen.js`, which owns
     * the texture; a no-op here so the clock can call it either way.
     */
    repaint() {
      this.render();
    },

    /** Draws the whole window. Cheap enough to run per interaction — it is one frame. */
    render() {
      const ctx = view.getContext('2d');
      const W = view.width;
      const H = view.height;

      // The whole canvas, the menu bar's strip included — it is drawn onto this one at
      // the end of the frame.
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      const top = insetTop(W, H);
      const bottom = H * (1 - INSET_BOTTOM);
      const height = bottom - top;

      const bar = menuBarHeight(W, H);
      const titleH = bar * TITLE;
      const toolH = bar * TOOLBAR;
      const rulerH = bar * RULER;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, top, W, height, height * 0.012);
      ctx.clip();

      ctx.fillStyle = PAGE_BG;
      ctx.fillRect(0, top, W, height);

      body = {
        x: 0,
        y: top + titleH + toolH + rulerH,
        w: W,
        h: height - titleH - toolH - rulerH,
        span: 0,
      };
      drawBody(ctx);

      drawTitleBar(ctx, W, top, titleH);
      drawToolbar(ctx, W, top + titleH, toolH);
      drawRuler(ctx, W, top + titleH + toolH, rulerH);
      ctx.restore();

      // The menu bar last, on this same canvas rather than on a plane of its own: that
      // is what keeps it square with the window under it and stops it running out over
      // the bezel, and it inherits the section plane's flat, unlit material.
      drawMenuBar(ctx, W, H, 'TextEdit');
    },

    /**
     * Scrolls the document. Returns whether there was anywhere to go, so `index.js` can
     * leave the wheel to the camera on a document that already fits. The UV is ignored
     * — unlike the Notes window there is only one column here.
     */
    scroll(delta) {
      if (!body.span) return false;
      const was = scroll;
      scroll = Math.min(body.span, Math.max(0, was + delta));
      if (scroll !== was) app.render();
      return true;
    },

    /** Back to the top — a section is opened at its beginning, not where it was left. */
    rewind() {
      scroll = 0;
      app.render();
    },

    /** Nothing in a document is a target, so nothing is ever hit. */
    hitTest() {
      return null;
    },

    /** Neither of these has anything to change; both say so, and cost no redraw. */
    select() {
      return false;
    },

    setHover() {
      return false;
    },
  };

  /* ------------------------------------------------------------------ document */

  /** The document, blitted into the body from its own full-length layout. */
  function drawBody(ctx) {
    const page = layout();
    // Floored, for the reason `notesApp.js` floors it: the body's height is fractional
    // and the canvas's is not, so a document that fits exactly would otherwise report a
    // span of half a pixel and swallow a wheel that belongs to the camera.
    const span = Math.max(0, Math.floor(page.height - body.h));
    body.span = span;
    const at = Math.min(scroll, span);

    ctx.save();
    ctx.beginPath();
    ctx.rect(body.x, body.y, body.w, body.h);
    ctx.clip();
    ctx.drawImage(page, 0, at, body.w, body.h, body.x, body.y, body.w, body.h);
    rail(ctx, body.x + body.w, body.y, body.h, span, at, page.height, body.w);
    ctx.restore();
  }

  /**
   * The document laid out full-length onto a canvas of its own, and kept.
   *
   * Measured then drawn, like `draw()` in `screen.js` and for the same reason: the
   * height has to be known before the canvas exists, and sizing a canvas wipes it.
   */
  function layout() {
    const W = Math.floor(body.w);
    if (laid && laid.width === W) return laid;

    const u = W * (section.screenScale ?? 1);
    const pad = u * SCALE.pad;

    const measure = document.createElement('canvas').getContext('2d');
    measure.textBaseline = 'top';
    const height = Math.max(
      Math.floor(body.h),
      Math.ceil(paint(measure, pad, u, W, false) + pad)
    );

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PAGE_BG;
    ctx.fillRect(0, 0, W, height);
    ctx.textBaseline = 'top';
    paint(ctx, pad, u, W, true);

    laid = canvas;
    return canvas;
  }

  /**
   * The document's own copy: the section's title as the line it opens on, then its
   * blocks. Measured and drawn by the same call, the way every renderer in `screen.js`
   * is, so the two passes cannot drift.
   */
  function paint(ctx, pad, u, W, on) {
    let y = pad * 0.9;

    ctx.font = `600 ${u * SCALE.title}px ${FONT}`;
    if (on) {
      ctx.fillStyle = INK;
      ctx.fillText(section.title, pad, y);
    }
    y += u * SCALE.title * 1.5;

    return blocks(ctx, section.blocks, pad, y, W, u, on);
  }

  /* --------------------------------------------------------------------- chrome */

  /** The title bar: the traffic lights, and what is open beside them. */
  function drawTitleBar(ctx, W, top, h) {
    ctx.fillStyle = CHROME;
    ctx.fillRect(0, top, W, h);

    const mid = top + h / 2;
    const r = h * 0.155;
    LIGHTS.forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(h * 0.7 + i * r * 3.1, mid, r, 0, Math.PI * 2);
      ctx.fill();
    });

    // The document mark and its name, left of centre the way TextEdit sets them —
    // beside the lights rather than over the middle of the bar.
    const x = h * 2.6;
    glyphDoc(ctx, x, mid, h * 0.42);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `600 ${h * 0.34}px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(FILENAME, x + h * 0.45, mid);
    ctx.textBaseline = 'top';
  }

  /**
   * The format toolbar. Laid out left to right in one pass, each control returning how
   * wide it was — so a control's width is decided where it is drawn and the row cannot
   * fall out of step with itself.
   */
  function drawToolbar(ctx, W, top, h) {
    ctx.fillStyle = TOOLBAR_BG;
    ctx.fillRect(0, top, W, h);
    ctx.fillStyle = LINE;
    ctx.fillRect(0, top + h - Math.max(1, h * 0.03), W, Math.max(1, h * 0.03));

    const mid = top + h / 2;
    const size = h * 0.62;
    const gap = h * 0.2;
    let x = h * 0.7;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // The paragraph-style popup, then the four type buttons as one segmented run.
    x += popup(ctx, x, mid, size * 1.9, size, '¶', true) + gap;
    for (const [i, mark] of ['B', 'I', 'U', 'S'].entries()) {
      button(ctx, x + i * size, mid, size, size, mark, i);
    }
    x += size * 4 + gap;

    // The fill swatch and the struck A that sets the type's colour.
    ctx.fillStyle = '#ffffff';
    round(ctx, x, mid - size * 0.36, size * 0.72, size * 0.72, size * 0.16);
    ctx.fill();
    x += size * 0.72 + gap * 0.8;
    glyphStruckA(ctx, x + size * 0.3, mid, size * 0.5);
    x += size * 0.9 + gap;

    // The three type popups: face, weight, size.
    x += popup(ctx, x, mid, size * 3.4, size, 'Helvetica') + gap * 0.6;
    x += popup(ctx, x, mid, size * 2.9, size, 'Regular') + gap * 0.6;
    x += popup(ctx, x, mid, size * 2.2, size, '12') + gap;

    // Alignment, with the first one lit: the document is set flush left.
    for (let i = 0; i < 4; i += 1) {
      button(ctx, x + i * size, mid, size, size, null, i, i === 0);
      glyphAlign(ctx, x + i * size + size / 2, mid, size * 0.44, i);
    }
    x += size * 4 + gap;

    x += popup(ctx, x, mid, size * 2.4, size, '≡') + gap * 0.6;
    x += popup(ctx, x, mid, size * 2.2, size, '1.0') + gap;

    glyphPen(ctx, x + size * 0.4, mid, size * 0.5);
    x += size;
    ctx.strokeStyle = INK_DIM;
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.beginPath();
    ctx.arc(x + size * 0.4, mid, size * 0.26, 0, Math.PI * 2);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  /** The ruler: the tab marks, the numbered scale, and the indent marker at the end. */
  function drawRuler(ctx, W, top, h) {
    ctx.fillStyle = RULER_BG;
    ctx.fillRect(0, top, W, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.fillStyle = INK_FAINT;
    ctx.lineWidth = Math.max(1, h * 0.04);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `400 ${h * 0.34}px ${FONT}`;

    // Two per inch, as TextEdit's scale runs, numbered on the even marks — but only as
    // many as the glass has room for: 62 of them across the portrait panel put the
    // numbers shoulder to shoulder.
    const STEPS = Math.max(16, Math.min(62, Math.floor(W / (h * 0.95))));
    const step = W / (STEPS + 1);
    for (let i = 0; i <= STEPS; i += 1) {
      const x = step * (i + 0.4);
      const tall = i % 2 === 0;
      ctx.beginPath();
      ctx.moveTo(x, top + h * (tall ? 0.58 : 0.68));
      ctx.lineTo(x, top + h * 0.86);
      ctx.stroke();
      if (tall) ctx.fillText(String(i), x + h * 0.08, top + h * 0.42);
    }

    // The default tab stops down the first stretch of the ruler, and the right indent.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (let i = 1; i <= Math.min(12, Math.floor(STEPS / 4)); i += 1) {
      const x = step * (i + 0.4);
      ctx.beginPath();
      ctx.moveTo(x, top + h * 0.14);
      ctx.lineTo(x + h * 0.16, top + h * 0.3);
      ctx.lineTo(x, top + h * 0.46);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(W - h * 0.5, top + h * 0.12);
    ctx.lineTo(W - h * 0.16, top + h * 0.12);
    ctx.lineTo(W - h * 0.33, top + h * 0.44);
    ctx.closePath();
    ctx.fill();

    ctx.textBaseline = 'top';
  }

  app.render();
  // The bar's clock. `repaint()` is the hook `screen.js` fills in with the one thing
  // this module has no business knowing about — flagging the texture.
  startClock(() => app.repaint());
  return app;
}

/* ------------------------------------------------------------------- furniture */

/** A popup button: a rounded field, its label, and the chevrons at its right end. */
function popup(ctx, x, mid, w, h, label, lit = false) {
  ctx.fillStyle = lit ? '#4b4f59' : CONTROL;
  round(ctx, x, mid - h * 0.36, w, h * 0.72, h * 0.14);
  ctx.fill();

  ctx.fillStyle = INK;
  ctx.font = `400 ${h * 0.42}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(label, x + h * 0.24, mid);

  chevrons(ctx, x + w - h * 0.26, mid, h * 0.14);
  ctx.textAlign = 'center';
  return w;
}

/** One cell of a segmented run. `i` places it, so only the ends are rounded. */
function button(ctx, x, mid, w, h, label, i, lit = false) {
  ctx.fillStyle = lit ? ACCENT : CONTROL;
  ctx.beginPath();
  ctx.rect(x, mid - h * 0.36, w, h * 0.72);
  ctx.fill();
  if (label) {
    ctx.fillStyle = lit ? '#ffffff' : INK;
    ctx.font = `${label === 'B' ? '700' : '400'} ${h * 0.44}px ${FONT}`;
    ctx.save();
    if (label === 'I') {
      ctx.translate(x + w / 2, mid);
      ctx.transform(1, 0, -0.22, 1, 0, 0);
      ctx.fillText(label, 0, 0);
    } else {
      ctx.fillText(label, x + w / 2, mid);
    }
    ctx.restore();
    // U and S carry their own rule, the way the buttons show them.
    if (label === 'U' || label === 'S') {
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, h * 0.04);
      const y = label === 'U' ? mid + h * 0.2 : mid;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.32, y);
      ctx.lineTo(x + w * 0.68, y);
      ctx.stroke();
    }
  }
  // The hairline between cells, on every one but the first.
  if (i > 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(x, mid - h * 0.36, Math.max(1, h * 0.02), h * 0.72);
  }
}

/** The lines of one alignment mark: flush left, centred, flush right, justified. */
function glyphAlign(ctx, x, mid, h, kind) {
  ctx.strokeStyle = kind === 0 ? '#ffffff' : INK;
  ctx.lineWidth = Math.max(1, h * 0.16);
  ctx.lineCap = 'round';
  for (let row = 0; row < 4; row += 1) {
    // The short rows are the ones the mark is about; which end they sit at is the mark.
    const short = row % 2 === 1 && kind !== 3;
    const w = short ? h * 0.7 : h;
    let left = x - h / 2;
    if (short && kind === 1) left = x - w / 2;
    if (short && kind === 2) left = x + h / 2 - w;
    const y = mid - h * 0.42 + row * h * 0.28;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + w, y);
    ctx.stroke();
  }
}

/** The two chevrons of a popup, stacked. */
function chevrons(ctx, x, mid, s) {
  ctx.strokeStyle = INK_DIM;
  ctx.lineWidth = Math.max(1, s * 0.34);
  ctx.lineCap = 'round';
  // Up then down, each with its point away from the middle of the button.
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.6, mid + dir * s * 0.35);
    ctx.lineTo(x, mid + dir * s * 0.95);
    ctx.lineTo(x + s * 0.6, mid + dir * s * 0.35);
    ctx.stroke();
  }
}

/** The document mark in the title bar: a page with its corner turned. */
function glyphDoc(ctx, x, mid, h) {
  const w = h * 0.76;
  ctx.fillStyle = INK_DIM;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, mid - h / 2);
  ctx.lineTo(x + w * 0.16, mid - h / 2);
  ctx.lineTo(x + w / 2, mid - h * 0.16);
  ctx.lineTo(x + w / 2, mid + h / 2);
  ctx.lineTo(x - w / 2, mid + h / 2);
  ctx.closePath();
  ctx.fill();
}

/** The struck A that opens the colour panel. */
function glyphStruckA(ctx, x, mid, h) {
  ctx.fillStyle = INK;
  ctx.font = `600 ${h}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('A', x, mid);
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = Math.max(1, h * 0.1);
  ctx.beginPath();
  ctx.moveTo(x - h * 0.42, mid + h * 0.42);
  ctx.lineTo(x + h * 0.42, mid - h * 0.42);
  ctx.stroke();
}

/** The pen that sets the highlight. */
function glyphPen(ctx, x, mid, h) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, h * 0.14);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - h * 0.4, mid + h * 0.4);
  ctx.lineTo(x + h * 0.35, mid - h * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - h * 0.45, mid + h * 0.45);
  ctx.lineTo(x - h * 0.2, mid + h * 0.45);
  ctx.stroke();
}

/** A rounded rectangle as a fresh path, ready to be filled or stroked. */
function round(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** The scroll rail, the same one the Notes window draws down its columns. */
function rail(ctx, right, top, height, span, at, full, columnW) {
  if (!span) return;
  const w = columnW * 0.005;
  const x = right - w * 3;
  const h = height * (height / full);
  ctx.fillStyle = 'rgba(255, 255, 255, .06)';
  ctx.fillRect(x, top, w, height);
  ctx.fillStyle = ACCENT;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x, top + (height - h) * (at / span), w, h);
  ctx.globalAlpha = 1;
}
