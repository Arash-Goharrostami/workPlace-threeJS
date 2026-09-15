import { blocks, INK, INK_DIM, INK_FAINT, ACCENT, LINE, FONT, SCALE } from './screen.js';
import { menuBarHeight, drawMenuBar, startClock } from '../desktop.js';
import { FLIGHT_MS, RETURN_MS } from './flight.js';

/**
 * A section drawn as **Notes.app** instead of as one long page: a sidebar down the left
 * with a row per item, and the pane on the right showing whichever is selected. Rows are
 * clicked on the monitor itself — `picking.js` casts against the plane and hands the UV
 * to `hitTest()` here.
 *
 * It is the same copy either way. The notes are derived from the section's own blocks in
 * `content.js` — a `timeline` item becomes a note, a `cards` item becomes a note, a
 * `heading` starts a new group — so nothing has to be written twice, and adding a role
 * adds a row without touching this file. The pane then renders that one note's blocks
 * through `blocks()` in `screen.js`, so a role reads in the window exactly as it read on
 * the page: the same dates, chips and bullets, from the same renderers.
 *
 * Everything is drawn with canvas paths — the traffic lights, the toolbar glyphs, the
 * folder marks — so no icon file lands in `public/`.
 *
 * Each column scrolls on its own: the wheel moves whichever the pointer is over, so a
 * long list and a long note never have to take turns.
 *
 * The window is full-bleed but not quite edge-to-edge: `src/desktop.js` puts the menu
 * bar across the top of this panel, and `insetTop()` is what keeps the title bar out from
 * under it — its height, read from that module rather than measured by hand.
 */

/**
 * Where the window's own edges sit, as fractions of the canvas height.
 *
 * The top is the menu bar's own height plus a hair of gap. It can be taken straight
 * from `desktop.js` because both planes are now seated on the same rectangle — the
 * glass `screenFace()` measures off the panel's front facets — so a fraction of that
 * canvas is the same distance as a fraction of this one. The bottom is a thin margin,
 * only the panel's own edge to clear.
 */
/** The menu bar's own depth plus a hair of gap, in canvas pixels. */
const insetTop = (W, H) => menuBarHeight(W, H) + H * 0.004;
const INSET_BOTTOM = 0.008;

/** How much of the window's width the sidebar takes. */
const SIDEBAR = 0.285;

/** The title bar's height, as a fraction of the window's — thin, as Notes has it. */
const BAR = 0.062;

/** One sidebar row's height, the same share of the window however many notes there are. */
const ROW = 0.115;

/** The window's own greys — Notes in dark mode, a shade off the page's ground. */
const CHROME = '#282a30';
const SIDEBAR_BG = '#212329';
const PANE_BG = '#1c1e23';
const SELECTED = 'rgba(255, 255, 255, 0.10)';
const HOVERED = 'rgba(255, 255, 255, 0.045)';

/** The traffic lights, in their order across the corner. */
const LIGHTS = ['#ff5f57', '#febc2e', '#28c840'];

/**
 * On a phone the window leaves full-screen. The panel is a wide 16:9 that a portrait
 * viewport fits by width, which left the whole window a thin strip; so on a narrow
 * screen it is drawn instead as a portrait window standing in the middle of the display
 * — as tall as the panel allows and this share of its width — with no sidebar and the
 * whole section flowing down it as one column. `anchors.js` frames that window rather
 * than the panel (see `narrowWidth` there), so on a phone it fills the screen.
 */
export const NARROW_WINDOW = 0.36;

/** The same breakpoint `screen.js` sets its type by. */
const NARROW = window.matchMedia('(max-width: 760px)');

/** How much larger the phone column's type is set, as a share of its (narrower) width. */
const NARROW_TYPE = 1.6;

/** The one pane the phone layout lays out: the whole section, under this key. */
const ALL = '*all';

/** The flight's own ease, so the window shrinks in step with the camera coming in. */
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Builds the window over `view`, the canvas the section's plane already shows.
 *
 * Returns the handful of things `screen.js` drives it with. Nothing here touches three.js
 * — this module knows about a 2D canvas and a UV, and no more than that.
 */
export function createNotesApp(section, view) {
  const notes = toNotes(section);
  /** Laid-out panes, one per note, built the first time that note is opened. */
  const laid = new Map();

  let selected = notes[0]?.id ?? null;
  let hovered = null;
  /** How far down the open note is, and how far down the list — one scroll each. */
  let scroll = 0;
  let sideScroll = 0;
  /** Filled by `render()`: where each row landed, so a UV can be turned back into one. */
  let rows = [];
  /** Also filled by `render()`, and read by `scroll()` — each column's own geometry. */
  let pane = { x: 0, y: 0, w: 0, h: 0, span: 0 };
  let side = { x: 0, y: 0, w: 0, h: 0, span: 0 };
  /**
   * The phone layout — see `NARROW_WINDOW`. Switched by `index.js` when the section is
   * opened on a narrow screen and back when it closes, so the display shows the
   * full-screen window while the room is browsed and shrinks it the moment it is read.
   */
  let compact = false;
  /**
   * The change between the two, in flight: from and to are the layout's progress (0 is
   * full-screen, 1 the phone window), timed off the flight so the window shrinks as
   * the camera comes in (`FLIGHT_MS`) and grows back as it leaves (`RETURN_MS`). Null
   * when settled.
   */
  let anim = null;

  /** How far toward the phone window the layout is right now, eased: 0 to 1. */
  const progress = () => {
    if (!anim) return compact ? 1 : 0;
    const t = Math.min(1, (performance.now() - anim.start) / anim.duration);
    return anim.from + (anim.to - anim.from) * ease(t);
  };

  const app = {
    notes,

    get selected() {
      return selected;
    },

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
      const barH = height * BAR;
      // Full-bleed with a sidebar, or — on a phone — a portrait window in the middle of
      // the display with none, or anywhere between the two while the change is in
      // flight. See `NARROW_WINDOW`.
      const e = progress();
      const narrow = e > 0;
      const winW = W - (W - W * NARROW_WINDOW) * e;
      const left = (W - winW) / 2;
      const sideW = W * SIDEBAR * (1 - e);

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(left, top, winW, height, height * 0.028);
      ctx.clip();

      ctx.fillStyle = SIDEBAR_BG;
      ctx.fillRect(left, top, sideW, height);
      ctx.fillStyle = PANE_BG;
      ctx.fillRect(left + sideW, top, winW - sideW, height);

      pane = { x: left + sideW, y: top + barH, w: winW - sideW, h: height - barH, span: 0 };
      side = { x: left, y: top + barH, w: sideW, h: height - barH, span: 0 };
      drawPane(ctx, e);
      // The list is drawn all the way down — it narrows with its column — but only a
      // settled full-screen window has rows to click.
      if (sideW > 0) drawSidebar(ctx);
      if (narrow) rows = [];
      drawTitleBar(ctx, left, winW, top, barH, sideW, e);

      // The seam between the two columns, drawn last so neither fill covers it; it goes
      // with the sidebar.
      if (sideW > 0) {
        ctx.fillStyle = LINE;
        ctx.globalAlpha = 1 - e;
        ctx.fillRect(left + sideW, top, Math.max(1, W * 0.0006), height);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // The menu bar last, on this same canvas rather than on a plane of its own: that
      // is what keeps it square with the window under it and stops it running out over
      // the bezel, and it inherits the section plane's flat, unlit material.
      drawMenuBar(ctx, W, H);
    },

    /**
     * Scrolls whichever column the pointer is over — the list on the left, the open note
     * on the right. Returns whether there was anywhere to go, so `index.js` can leave
     * the wheel to the camera over a column that already fits.
     *
     * With no `uv` it is the note that moves: that is the wheel arriving before the
     * pointer has been cast onto the plane, and the note is what someone reading is
     * most likely reaching for.
     */
    scroll(delta, uv) {
      const overSidebar = uv && side.w ? uv.x * view.width < side.x + side.w : false;
      const span = overSidebar ? side.span : pane.span;
      if (!span) return false;

      const was = overSidebar ? sideScroll : scroll;
      const now = Math.min(span, Math.max(0, was + delta));
      if (overSidebar) sideScroll = now;
      else scroll = now;
      if (now !== was) app.render();
      return true;
    },

    /**
     * Full-screen with a sidebar, or the phone's portrait window — reached over the
     * matching flight's duration, from wherever the layout is now. Re-lays the panes.
     */
    setCompact(on) {
      if (on === compact) return;
      anim = {
        from: progress(),
        to: on ? 1 : 0,
        start: performance.now(),
        duration: on ? FLIGHT_MS : RETURN_MS,
      };
      compact = on;
      laid.clear();
      scroll = 0;
      sideScroll = 0;

      // Frame by frame until it lands, through `repaint` so the texture is flagged too.
      const started = anim;
      const tick = () => {
        if (anim !== started) return;
        const done = performance.now() - anim.start >= anim.duration;
        if (done) anim = null;
        app.repaint();
        if (!done) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },

    /** Back to the first note, at its top — where opening the section should land. */
    rewind() {
      const wasSelected = selected;
      selected = notes[0]?.id ?? null;
      hovered = null;
      scroll = 0;
      sideScroll = 0;
      app.render();
    },

    /**
     * Which row a point on the plane fell in, or null for the pane and the chrome.
     * `uv` is three.js's: origin bottom-left, so v is flipped to canvas pixels.
     */
    hitTest(uv) {
      if (!uv || !side.w) return null;
      const x = uv.x * view.width;
      const y = (1 - uv.y) * view.height;
      // Inside the column first: a row scrolled up under the title bar is still in
      // `rows`, and without this it could be clicked straight through the chrome.
      if (x < side.x || x > side.x + side.w || y < side.y || y > side.y + side.h) return null;
      return rows.find((row) => y >= row.y && y <= row.y + row.h)?.id ?? null;
    },

    /** Opens a note. Returns whether anything changed, so a no-op costs no redraw. */
    select(id) {
      if (!id || id === selected) return false;
      selected = id;
      scroll = 0;
      app.render();
      return true;
    },

    /** Lights a row under the pointer. Same contract as `select`. */
    setHover(id) {
      if (id === hovered) return false;
      hovered = id;
      app.render();
      return true;
    },
  };

  /**
   * The list of notes, with their groups' headers folded in as they come.
   *
   * A row is a fixed share of the window rather than a share of what is left over, so
   * the type stays the size it was drawn at however many notes there are — the list
   * scrolls when they stop fitting, which is what the column is clipped for.
   */
  function drawSidebar(ctx) {
    rows = [];

    const { x: left, y: top, w, h } = side;
    const u = w;
    const pad = u * 0.075;
    const rowH = view.height * ROW;
    const gap = rowH * 0.2;
    // A group header is a label over a rule, and the three gaps around it are set
    // rather than derived: the air *above* the label is what says the list has moved
    // on, so it is the largest of them, and the rule sits close under its own label
    // rather than floating between the two groups.
    const ABOVE = rowH * 0.34;
    const LABEL = rowH * 0.32;
    const BELOW = rowH * 0.14;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, w, h);
    ctx.clip();

    ctx.textBaseline = 'top';
    let y = top + pad * 0.4 - sideScroll;
    let group = null;

    for (const note of notes) {
      if (note.group !== group) {
        group = note.group;
        // The break above, except at the very top of the list — there is nothing there
        // to be separated from.
        if (group !== notes[0].group) y += ABOVE;

        ctx.font = `700 ${rowH * 0.25}px ${FONT}`;
        ctx.fillStyle = INK;
        ctx.fillText(group, left + pad, y);
        y += LABEL;

        ctx.fillStyle = LINE;
        ctx.fillRect(left + pad, y, w - pad * 2, Math.max(1, u * 0.003));
        y += BELOW;
      }

      // Kept whatever the scroll is: `hitTest()` reads these, and a row above or below
      // the column is one the pointer cannot be over anyway — it clips to `side`.
      rows.push({ id: note.id, x: left, y, w, h: rowH });

      if (note.id === selected || note.id === hovered) {
        ctx.beginPath();
        ctx.roundRect(left + pad * 0.4, y, w - pad * 0.8, rowH, rowH * 0.14);
        ctx.fillStyle = note.id === selected ? SELECTED : HOVERED;
        ctx.fill();
      }

      let ty = y + rowH * 0.18;
      ctx.font = `600 ${rowH * 0.2}px ${FONT}`;
      ctx.fillStyle = INK;
      ctx.fillText(clip(ctx, note.title, w - pad * 2), left + pad, ty);
      ty += rowH * 0.28;

      // The date in full ink and the snippet dimmed behind it, on one line — Notes puts
      // when it was written before what it says.
      ctx.font = `400 ${rowH * 0.17}px ${FONT}`;
      const date = `${note.date}  `;
      ctx.fillStyle = INK;
      ctx.fillText(date, left + pad, ty);
      const dateW = ctx.measureText(date).width;
      ctx.fillStyle = INK_FAINT;
      ctx.fillText(clip(ctx, note.snippet, w - pad * 2 - dateW), left + pad + dateW, ty);
      ty += rowH * 0.25;

      // The folder line, the way Notes names the one a note lives in.
      const mark = rowH * 0.145;
      folderMark(ctx, left + pad, ty + mark * 0.45, mark);
      ctx.font = `400 ${rowH * 0.155}px ${FONT}`;
      ctx.fillStyle = INK_FAINT;
      ctx.fillText(note.group, left + pad + mark * 1.5, ty);

      y += rowH + gap;
    }

    // How far the list runs past the column, measured off where it actually ended —
    // the headers make it something no count of rows would give.
    side.span = Math.max(0, Math.floor(y + sideScroll + pad * 0.4 - (top + h)));
    sideScroll = Math.min(sideScroll, side.span);
    rail(ctx, left + w, top, h, side.span, sideScroll, h + side.span, w);

    ctx.restore();
  }

  /**
   * The open note, blitted into the pane from its own full-length layout.
   *
   * Laid out at the width the pane will have once the layout settles and drawn scaled
   * to the width it has now — so while the window is changing shape the text zooms with
   * it rather than re-flowing every frame, and once settled the scale is exactly one.
   */
  function drawPane(ctx, e) {
    // The phone column is the whole section, headings and all; the desktop pane is the
    // note the sidebar has selected.
    const note = compact
      ? { id: ALL, blocks: section.blocks }
      : notes.find((n) => n.id === selected);
    if (!note) return;

    const W = view.width;
    const settledW = compact ? W * NARROW_WINDOW : W - W * SIDEBAR;
    const page = layout(note, settledW);
    const scale = pane.w / page.width;
    // Floored, because the pane's height is fractional and the canvas's is not: a note
    // that fits exactly leaves a span of half a pixel, and `scroll()` would then report
    // the note as scrollable for ever and swallow a wheel that belongs to the camera.
    const span = anim ? 0 : Math.max(0, Math.floor(page.height * scale - pane.h));
    pane.span = span;
    laid.get(note.id).span = span;
    const at = Math.min(scroll, span);

    ctx.save();
    ctx.beginPath();
    ctx.rect(pane.x, pane.y, pane.w, pane.h);
    ctx.clip();
    const srcH = pane.h / scale;
    ctx.drawImage(page, 0, at / scale, page.width, srcH, pane.x, pane.y, pane.w, pane.h);

    if (!anim) rail(ctx, pane.x + pane.w, pane.y, pane.h, span, at, page.height, pane.w);
    ctx.restore();
  }

  /**
   * One note's pane, laid out full-length onto a canvas of its own and kept.
   *
   * Measured then drawn, like `draw()` in `screen.js` and for the same reason: the
   * height has to be known before the canvas exists, and sizing a canvas wipes it.
   */
  function layout(note, width) {
    const W = Math.floor(width);
    const cached = laid.get(note.id);
    if (cached && cached.width === W) return cached;

    // Type is sized off the pane, not off the panel: the column is under three quarters
    // of the screen, and copy set for the full width lands in it too large. The phone
    // column is narrower still and read filling the viewport, so it gets a bigger share.
    const u = W * (section.screenScale ?? 1) * (note.id === ALL ? NARROW_TYPE : 1.25);
    const pad = u * SCALE.pad;

    const measure = document.createElement('canvas').getContext('2d');
    measure.textBaseline = 'top';
    const height = Math.max(
      Math.floor(pane.h),
      Math.ceil(blocks(measure, note.blocks, pad, pad * 0.8, W, u, false) + pad)
    );

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PANE_BG;
    ctx.fillRect(0, 0, W, height);
    ctx.textBaseline = 'top';
    blocks(ctx, note.blocks, pad, pad * 0.8, W, u, true);

    canvas.span = 0;
    laid.set(note.id, canvas);
    return canvas;
  }

  /** The window's title bar: traffic lights, what is open, and the toolbar glyphs. */
  function drawTitleBar(ctx, left, W, top, h, sideW, e = 0) {
    ctx.fillStyle = CHROME;
    ctx.fillRect(left, top, W, h);
    ctx.fillStyle = LINE;
    ctx.fillRect(left, top + h - Math.max(1, h * 0.014), W, Math.max(1, h * 0.014));

    const mid = top + h / 2;
    const r = h * 0.115;
    LIGHTS.forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(left + h * 0.52 + i * r * 3.1, mid, r, 0, Math.PI * 2);
      ctx.fill();
    });

    // What the sidebar is showing, over the sidebar — the count included, as Notes has
    // it, because it is the one number that says how much there is to read.
    const x = left + h * 2.6;
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${h * 0.3}px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(section.title, x, mid - h * 0.16);
    ctx.font = `400 ${h * 0.25}px ${FONT}`;
    ctx.fillStyle = INK_FAINT;
    ctx.fillText(`${notes.length} notes`, x, mid + h * 0.2);
    ctx.textBaseline = 'top';

    // The toolbar, over the pane: the format and checklist marks on the left of it, the
    // share mark out at the right end. The phone window has no room for the first two,
    // and they fade as it becomes one.
    if (sideW > 0) {
      ctx.globalAlpha = 1 - e;
      glyphAa(ctx, left + sideW + h * 0.7, mid, h * 0.3);
      glyphList(ctx, left + sideW + h * 1.6, mid, h * 0.3);
      ctx.globalAlpha = 1;
    }
    glyphShare(ctx, left + W - h * 0.9, mid, h * 0.34);
  }

  app.render();
  // Crossing the breakpoint changes the window's shape and the column's width, and a
  // pane is laid out once at a width — so every kept one goes, and the next draw
  // re-lays it. `screen.js` repaints the screen itself on the same change.
  NARROW.addEventListener('change', () => {
    laid.clear();
    scroll = 0;
    sideScroll = 0;
  });
  // The bar's clock. `repaint()` is the hook `screen.js` fills in with the one thing
  // this module has no business knowing about — flagging the texture — and stays a
  // no-op until it does.
  startClock(() => app.repaint());
  return app;
}

/**
 * A scroll rail down the inside of a column's right edge, drawn only when there is
 * somewhere to go — on a column that fits, a rail is furniture. The same shape `blit()`
 * in `screen.js` puts down the page, shared here by both columns.
 */
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

/* --------------------------------------------------------------------- notes */

/**
 * The section's blocks as a list of notes.
 *
 * A `heading` opens a new group and a `footnote` closes into a note of its own, so the
 * whole section survives the change of shape: nothing in `content.js` is left undrawn
 * just because it was not a role.
 */
function toNotes(section) {
  const out = [];
  let group = section.eyebrow ?? 'Notes';

  for (const block of section.blocks) {
    if (block.kind === 'heading') {
      group = block.text;
    } else if (block.kind === 'timeline') {
      for (const item of block.items) {
        out.push({
          id: `role-${out.length}`,
          group,
          title: item.role,
          date: item.date,
          snippet: item.org ?? item.points?.[0] ?? '',
          blocks: [{ kind: 'timeline', items: [item] }],
        });
      }
    } else if (block.kind === 'cards') {
      for (const item of block.items) {
        out.push({
          id: `card-${out.length}`,
          group,
          title: item.title,
          date: item.meta ?? 'Project',
          snippet: item.desc ?? '',
          blocks: [{ kind: 'cards', items: [item] }],
        });
      }
    } else if (block.kind === 'footnote') {
      // Its own note rather than a footer repeated under all seven: the line is worth
      // saying once, and a note is what this window has to say it in.
      out.push({
        id: `note-${out.length}`,
        group: 'More',
        title: 'Also',
        date: 'Other work',
        snippet: block.text,
        blocks: [{ kind: 'intro', text: block.text }],
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------- glyphs */

/** Trims a string to the width it has, with an ellipsis when it did not fit. */
function clip(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** The small folder under a sidebar row, naming the group the note is in. */
function folderMark(ctx, x, y, s) {
  ctx.save();
  ctx.strokeStyle = INK_FAINT;
  ctx.lineWidth = Math.max(1, s * 0.13);
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.62);
  ctx.lineTo(x, y - s * 0.18);
  ctx.lineTo(x + s * 0.34, y - s * 0.18);
  ctx.lineTo(x + s * 0.46, y + s * 0.02);
  ctx.lineTo(x + s, y + s * 0.02);
  ctx.lineTo(x + s, y + s * 0.62);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** The format button: a large A beside a small one. */
function glyphAa(ctx, x, y, s) {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK_DIM;
  ctx.font = `500 ${s * 1.25}px ${FONT}`;
  ctx.fillText('A', x, y);
  const w = ctx.measureText('A').width;
  ctx.font = `500 ${s * 0.85}px ${FONT}`;
  ctx.fillText('a', x + w * 1.1, y + s * 0.16);
  ctx.restore();
}

/** The checklist button: two ticked rules. */
function glyphList(ctx, x, y, s) {
  ctx.save();
  ctx.strokeStyle = INK_DIM;
  ctx.lineWidth = Math.max(1, s * 0.16);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const row of [-s * 0.45, s * 0.45]) {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.6, y + row - s * 0.12);
    ctx.lineTo(x - s * 0.38, y + row + s * 0.16);
    ctx.lineTo(x + s * 0.02, y + row - s * 0.34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.28, y + row);
    ctx.lineTo(x + s * 0.9, y + row);
    ctx.stroke();
  }
  ctx.restore();
}

/** The share button: a box with an arrow leaving the top of it. */
function glyphShare(ctx, x, y, s) {
  ctx.save();
  ctx.strokeStyle = INK_DIM;
  ctx.lineWidth = Math.max(1, s * 0.14);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.42, y - s * 0.06);
  ctx.lineTo(x - s * 0.42, y + s * 0.62);
  ctx.lineTo(x + s * 0.42, y + s * 0.62);
  ctx.lineTo(x + s * 0.42, y - s * 0.06);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.34);
  ctx.lineTo(x, y - s * 0.66);
  ctx.moveTo(x - s * 0.26, y - s * 0.38);
  ctx.lineTo(x, y - s * 0.66);
  ctx.lineTo(x + s * 0.26, y - s * 0.38);
  ctx.stroke();
  ctx.restore();
}
