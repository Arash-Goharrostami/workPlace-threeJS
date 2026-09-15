import { INK, INK_DIM, INK_FAINT, ACCENT, LINE, FONT, loadIcon, glass } from './screen.js';
import { menuBarHeight, drawMenuBar, startClock } from '../desktop.js';

/**
 * The stack drawn as **Shortcuts.app** on the MacBook's lid instead of as a page of
 * cards: a sidebar down the left with a row per group, and the pane on the right
 * showing the selected group's skills as a grid of tiles. Rows are clicked on the lid
 * itself — `picking.js` casts against the plane and hands the UV to `hitTest()` here,
 * through the same `screens.click()` the Notes window answers.
 *
 * The copy is the section's own: the groups come straight from the `skills` block in
 * `content.js` — their icons, notes and tags — so adding a skill adds a tile and adding
 * a group adds a row, without touching this file. Each group's `footer` closes the
 * pane under its tiles; "All" closes on the section's certifications footnote.
 *
 * The window sits under macOS's menu bar, drawn onto this same canvas by
 * `desktop.js` with Shortcuts' own menus and the laptop's Wi-Fi and battery beside the
 * clock. The chrome — traffic lights, the "+", the grid/list toggle, the search field —
 * is drawn with canvas paths, the way Notes draws its own; the icons on the rows and
 * tiles are the files in `public/skillsIcon/`, through `loadIcon()`.
 *
 * Each column scrolls on its own: the wheel moves whichever the pointer is over.
 */

/** How much of the window's width the sidebar takes. */
const SIDEBAR = 0.27;

/** The title bar's height, as a fraction of the window's. */
const BAR = 0.085;

/** One sidebar row's height, as a fraction of the window's height. */
const ROW = 0.082;

/** The tiles: how many across, and the grid's gap as a share of the pane's width. */
const ACROSS = 4;
const GAP = 0.025;
/** A tile's height, as a share of its width — shorter than Shortcuts' near-square. */
const TILE = 0.6;
/** The detail box's height, as a share of the pane's, while a tile is open. */
const DETAIL = 0.32;

/** The window's own greys — Shortcuts in dark mode, a shade off the page's ground. */
const CHROME = '#1f2128';
const SIDEBAR_BG = '#1b1d24';
const PANE_BG = '#16181e';
const SELECTED = 'rgba(255, 255, 255, 0.10)';
const HOVERED = 'rgba(255, 255, 255, 0.045)';

/** The traffic lights, in their order across the corner. */
const LIGHTS = ['#ff5f57', '#febc2e', '#28c840'];

/** Shortcuts' menus, as the bar names them. */
const MENUS = ['File', 'Edit', 'View', 'Shortcut', 'Window', 'Help'];

/**
 * The phone reads the lid from further in and wants the type and tiles as they are;
 * on a desktop the same sizes come out heavy, so everything is set smaller by this;
 * the grid runs three tiles across on the phone and five on the desktop. `screen.js` repaints every screen when the breakpoint
 * is crossed, so the window is rebuilt at the other size.
 */
const NARROW = window.matchMedia('(max-width: 760px)');
const scale = () => (NARROW.matches ? 1 : 0.78);
const across = () => (NARROW.matches ? 3 : 5);

/** The desktop's ground behind the window — what shows at its rounded corners. */
const DESKTOP = '#0b0d12';
/** The window's inset from the lid's edges, as a share of the width. */
const MARGIN = 0.008;

export function createStackApp(section, view) {
  const groups = toGroups(section);
  const footnote = section.blocks.find((block) => block.kind === 'footnote')?.text ?? null;

  let selected = groups[0]?.id ?? null;
  let hovered = null;
  /** The tile whose detail box is open — a `tile:` id — or null for none. */
  let open = null;
  /** How far down the tiles are, and how far down the list — one scroll each. */
  let scroll = 0;
  let sideScroll = 0;
  /** Filled by `render()`: where each row and tile landed, so a UV can be turned back into one. */
  let rows = [];
  let tiles = [];
  /** Also filled by `render()`, and read by `scroll()` — each column's own geometry. */
  let pane = { x: 0, y: 0, w: 0, h: 0, span: 0 };
  let side = { x: 0, y: 0, w: 0, h: 0, span: 0 };
  /** The part of the pane the tiles scroll in — the pane less the detail box. */
  let grid = { x: 0, y: 0, w: 0, h: 0 };
  /** The detail card's close button, while it is showing; null otherwise. */
  let closeBtn = null;

  const app = {
    groups,

    get selected() {
      return selected;
    },

    /**
     * Redraws and pushes the result to the screen. Filled in by `screen.js`, which owns
     * the texture; a no-op here so the icon loads can call it either way.
     */
    repaint() {
      this.render();
    },

    /** Draws the whole window. Cheap enough to run per interaction — it is one frame. */
    render() {
      const ctx = view.getContext('2d');
      const W = view.width;
      const H = view.height;

      // The lid's corners are rounded — `screenRadius` in `content.js`, which also
      // makes the plane's material transparent — so they are cleared and everything
      // else is clipped to the shape, the way `blit()` in `screen.js` does for a page.
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      const radius = (section.screenRadius ?? 0) * W;
      if (radius) {
        ctx.beginPath();
        ctx.roundRect(0, 0, W, H, radius);
        ctx.clip();
      }
      ctx.fillStyle = DESKTOP;
      ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = 'top';

      // The menu bar's strip is reserved at the top; the window seats under it, a hair
      // in from the lid's edges, with its own rounded corners — a window on a desktop,
      // not a page filling the glass.
      const k = scale();
      const menu = menuBarHeight(W, H);
      const margin = W * MARGIN;
      const win = { x: margin, y: menu + margin, w: W - margin * 2, h: H - menu - margin * 2 };
      const barH = H * BAR * k;
      const sideW = win.w * SIDEBAR;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(win.x, win.y, win.w, win.h, W * 0.018);
      ctx.clip();
      ctx.fillStyle = PANE_BG;
      ctx.fillRect(win.x, win.y, win.w, win.h);
      ctx.fillStyle = SIDEBAR_BG;
      ctx.fillRect(win.x, win.y, sideW, win.h);

      const body = win.y + barH;
      pane = { x: win.x + sideW, y: body, w: win.w - sideW, h: win.y + win.h - body, span: 0 };
      side = { x: win.x, y: body, w: sideW, h: win.y + win.h - body, span: 0 };
      drawPane(ctx, k);
      drawSidebar(ctx, k);
      drawTitleBar(ctx, win, barH, sideW, k);

      // The seam between the two columns, drawn last so neither fill covers it.
      ctx.fillStyle = LINE;
      ctx.fillRect(win.x + sideW, win.y, Math.max(1, W * 0.0008), win.h);
      ctx.restore();

      // The menu bar last, on this same canvas, inside the lid's rounded clip.
      drawMenuBar(ctx, W, H, 'Shortcuts', MENUS, true);
      ctx.restore();
    },

    /**
     * Scrolls whichever column the pointer is over — the list on the left, the tiles
     * on the right. Returns whether there was anywhere to go, so `index.js` can leave
     * the wheel to the camera over a column that already fits. With no `uv` it is the
     * tiles that move.
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

    /** Back to the first group, at its top — where opening the section should land. */
    rewind() {
      selected = groups[0]?.id ?? null;
      hovered = null;
      open = null;
      scroll = 0;
      sideScroll = 0;
      app.render();
    },

    /**
     * Which sidebar row or tile a point on the plane fell in, or null for the chrome,
     * the detail box and the gaps. `uv` is three.js's: origin bottom-left, so v is
     * flipped to canvas pixels.
     */
    hitTest(uv) {
      if (!uv || !side.w) return null;
      const x = uv.x * view.width;
      const y = (1 - uv.y) * view.height;
      const inside = (box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
      if (inside(side)) return rows.find(inside)?.id ?? null;
      // Only the part of the pane the tiles scroll in: one scrolled under the detail
      // box is still in `tiles`, and must not be clickable through it.
      if (inside(grid)) return tiles.find(inside)?.id ?? null;
      if (closeBtn && inside(closeBtn)) return 'close';
      return null;
    },

    /**
     * Opens a group, or a tile's detail box — a second click on the open tile closes
     * it. Returns whether anything changed, so a no-op costs no redraw.
     */
    select(id) {
      if (!id) return false;
      if (id === 'close') {
        if (!open) return false;
        open = null;
      } else if (id.startsWith('tile:')) {
        open = open === id ? null : id;
      } else {
        if (id === selected) return false;
        selected = id;
        open = null;
        scroll = 0;
      }
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
   * The list of groups: a "Library" caption, then a row each with its mark, its title
   * and how many skills it holds. A row is a fixed share of the window, so the type
   * stays the size it was drawn at however many groups there are.
   */
  function drawSidebar(ctx, k) {
    rows = [];

    const { x: left, y: top, w, h } = side;
    const pad = w * 0.09;
    const rowH = view.height * ROW * k;
    const gap = rowH * 0.12;
    const mark = rowH * 0.5;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, w, h);
    ctx.clip();

    let y = top + rowH * 0.5 - sideScroll;

    ctx.font = `600 ${rowH * 0.28}px ${FONT}`;
    ctx.fillStyle = INK_FAINT;
    ctx.fillText('Library', left + pad, y);
    y += rowH * 0.6;

    for (const group of groups) {
      rows.push({ id: group.id, x: left, y, w, h: rowH });

      const on = group.id === selected;
      if (on || group.id === hovered) {
        ctx.beginPath();
        ctx.roundRect(left + pad * 0.45, y, w - pad * 0.9, rowH, rowH * 0.18);
        ctx.fillStyle = on ? SELECTED : HOVERED;
        ctx.fill();
      }

      const ink = on ? ACCENT : INK;
      const icon = group.icon ? loadIcon(group.icon, ink) : null;
      if (icon?.image) drawIcon(ctx, icon, left + pad, y + (rowH - mark) / 2, mark);

      ctx.font = `500 ${rowH * 0.34}px ${FONT}`;
      ctx.fillStyle = ink;
      const count = String(group.tags.length);
      ctx.font = `400 ${rowH * 0.3}px ${FONT}`;
      const countW = ctx.measureText(count).width;
      ctx.font = `500 ${rowH * 0.34}px ${FONT}`;
      ctx.fillText(
        clip(ctx, group.title, w - pad * 2 - mark * 1.6 - countW - pad * 0.6),
        left + pad + mark * 1.6,
        y + rowH * 0.31
      );

      // The count at the row's far end, the way the sidebar numbers its folders.
      ctx.font = `400 ${rowH * 0.3}px ${FONT}`;
      ctx.fillStyle = on ? INK : INK_FAINT;
      ctx.fillText(count, left + w - pad - countW, y + rowH * 0.34);

      y += rowH + gap;
    }

    side.span = Math.max(0, Math.floor(y + sideScroll + rowH * 0.3 - (top + h)));
    sideScroll = Math.min(sideScroll, side.span);
    rail(ctx, left + w, top, h, side.span, sideScroll, h + side.span, w);

    ctx.restore();
  }

  /**
   * The selected group's skills as tiles in a grid, the group's note over them and
   * the certifications line under. Laid out and painted in the one pass, so the pane's
   * length — what decides how far it scrolls — is what was actually drawn. With a tile
   * open, its detail box takes the bottom of the pane and the grid scrolls above it.
   */
  function drawPane(ctx, k) {
    const group = groups.find((g) => g.id === selected);
    if (!group) return;
    tiles = [];

    const ACROSS = across();
    const { x: left, y: top, w, h } = pane;
    const pad = w * 0.045;
    const gap = w * GAP;
    const tileW = (w - pad * 2 - gap * (ACROSS - 1)) / ACROSS;
    const tileH = tileW * TILE;
    const radius = tileW * 0.14;
    const inset = tileW * 0.09;
    const badge = tileW * 0.2;
    const nameSize = tileW * 0.1;

    const opened = open ? group.tags[Number(open.split(':')[2])] : null;
    closeBtn = null;
    const detailH = opened ? h * DETAIL : 0;
    grid = { x: left, y: top, w, h: h - detailH };

    ctx.save();
    ctx.beginPath();
    ctx.rect(grid.x, grid.y, grid.w, grid.h);
    ctx.clip();

    let y = top + pad * 0.9 - scroll;

    if (group.note) {
      const note = w * 0.024 * k;
      ctx.font = `400 ${note}px ${FONT}`;
      ctx.fillStyle = INK_DIM;
      ctx.fillText(group.note, left + pad, y);
      y += note * 2.1;
    }

    group.tags.forEach((tag, i) => {
      const col = i % ACROSS;
      const row = Math.floor(i / ACROSS);
      const x = left + pad + col * (tileW + gap);
      const ty = y + row * (tileH + gap);
      const id = `tile:${group.id}:${i}`;
      tiles.push({ id, x, y: ty, w: tileW, h: tileH });

      // The one under the pointer lifts a little.
      const isOpen = id === open;
      if (id === hovered && !isOpen) {
        ctx.beginPath();
        ctx.roundRect(x, ty, tileW, tileH, radius);
        ctx.fillStyle = 'rgba(255, 255, 255, .05)';
        ctx.fill();
      }
      glass(ctx, x, ty, tileW, tileH, radius, w);
      // The open tile is ringed in the accent, with a faint glow bleeding in from the
      // ring and gone by the middle — the glass itself stays clear, so it is clear
      // which one the box is about without the tile turning a colour.
      if (isOpen) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, ty, tileW, tileH, radius);
        ctx.clip();
        // A stroke laid just outside the clip: only its shadow lands inside.
        const out = w * 0.02;
        ctx.shadowColor = 'rgba(110, 168, 254, .55)';
        ctx.shadowBlur = tileW * 0.22;
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = out * 2;
        ctx.beginPath();
        ctx.roundRect(x - out, ty - out, tileW + out * 2, tileH + out * 2, radius + out);
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.roundRect(x, ty, tileW, tileH, radius);
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = Math.max(1.5, w * 0.003);
        ctx.stroke();
      }

      // The mark in its badge, top-left, and the name along the bottom.
      ctx.beginPath();
      ctx.roundRect(x + inset, ty + inset, badge, badge, badge * 0.25);
      ctx.fillStyle = 'rgba(255, 255, 255, .12)';
      ctx.fill();
      const icon = tag.icon ? loadIcon(tag.icon, INK) : null;
      if (icon?.image) {
        drawIcon(ctx, icon, x + inset + badge * 0.18, ty + inset + badge * 0.18, badge * 0.64);
      }

      ctx.font = `600 ${nameSize}px ${FONT}`;
      ctx.fillStyle = INK;
      const label = tag.name ?? tag;
      ctx.fillText(clip(ctx, label, tileW - inset * 2), x + inset, ty + tileH - inset - nameSize);
    });
    const rowsOfTiles = Math.ceil(group.tags.length / ACROSS);
    y += rowsOfTiles * tileH + (rowsOfTiles - 1) * gap;

    // The line under the tiles is the group's own; "All" closes on the certifications.
    const footer = group.footer ?? footnote;
    if (footer) {
      y += pad;
      ctx.fillStyle = LINE;
      ctx.fillRect(left + pad, y, w - pad * 2, Math.max(1, w * 0.0012));
      y += pad * 0.7;
      const foot = w * 0.02 * k;
      ctx.font = `400 ${foot}px ${FONT}`;
      ctx.fillStyle = INK_FAINT;
      for (const line of wrapLines(ctx, footer, w - pad * 2, 2)) {
        ctx.fillText(line, left + pad, y);
        y += foot * 1.5;
      }
    }

    pane.span = Math.max(0, Math.floor(y + scroll + pad - (grid.y + grid.h)));
    scroll = Math.min(scroll, pane.span);
    rail(ctx, left + w, grid.y, grid.h, pane.span, scroll, grid.h + pane.span, w);

    ctx.restore();

    if (opened) drawDetail(ctx, opened, group, left, top + h - detailH, w, detailH, pad, badge, k);
  }

  /**
   * The box under the grid about the open tile: a rule across the top, the skill's
   * mark in its badge, its name with the group it belongs to dimmed beside, and the
   * one-line `desc` from `content.js` wrapped under. Fixed to the pane's bottom edge,
   * so it stays put while the tiles scroll.
   */
  function drawDetail(ctx, tag, group, left, top, w, h, pad, badge, k) {
    // A card floating in the pane rather than a strip across it: inset from the seam
    // and the edges on the pane's own ground, then the same glass the tiles are cut
    // from, so it reads as a sheet lifted over the grid and not as part of the sidebar.
    ctx.fillStyle = PANE_BG;
    ctx.fillRect(left, top, w, h);
    const cx = left + pad;
    const cy = top + pad * 0.3;
    const cw = w - pad * 2;
    const ch = h - pad * 1.1;
    const radius = w * 0.022;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, .5)';
    ctx.shadowBlur = w * 0.04;
    ctx.shadowOffsetY = w * 0.008;
    ctx.beginPath();
    ctx.roundRect(cx, cy, cw, ch, radius);
    ctx.fillStyle = SIDEBAR_BG;
    ctx.fill();
    ctx.restore();
    glass(ctx, cx, cy, cw, ch, radius, w);

    // The close button, top-right: a round pad with a cross, lit under the pointer.
    const size = w * 0.042 * k;
    const bx = cx + cw - pad * 0.6 - size;
    const by = cy + pad * 0.5;
    closeBtn = { x: bx, y: by, w: size, h: size };
    ctx.beginPath();
    ctx.arc(bx + size / 2, by + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = hovered === 'close' ? 'rgba(255, 255, 255, .18)' : 'rgba(255, 255, 255, .09)';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, size * 0.09);
    ctx.lineCap = 'round';
    const arm = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(bx + size / 2 - arm, by + size / 2 - arm);
    ctx.lineTo(bx + size / 2 + arm, by + size / 2 + arm);
    ctx.moveTo(bx + size / 2 + arm, by + size / 2 - arm);
    ctx.lineTo(bx + size / 2 - arm, by + size / 2 + arm);
    ctx.stroke();

    const x = cx + pad * 0.8;
    let y = cy + pad * 0.7;
    const mark = badge * 1.1;

    ctx.beginPath();
    ctx.roundRect(x, y, mark, mark, mark * 0.25);
    ctx.fillStyle = 'rgba(110, 168, 254, .18)';
    ctx.fill();
    const icon = tag.icon ? loadIcon(tag.icon, INK) : null;
    if (icon?.image) drawIcon(ctx, icon, x + mark * 0.18, y + mark * 0.18, mark * 0.64);

    const nameSize = w * 0.03 * k;
    const tx = x + mark + pad * 0.6;
    ctx.font = `700 ${nameSize}px ${FONT}`;
    ctx.fillStyle = INK;
    const name = tag.name ?? tag;
    ctx.fillText(clip(ctx, name, bx - tx - pad * 0.4), tx, y + mark * 0.05);
    const nameW = ctx.measureText(name).width;
    ctx.font = `400 ${w * 0.022 * k}px ${FONT}`;
    ctx.fillStyle = INK_FAINT;
    ctx.fillText(groupOf(tag, group), tx + nameW + pad * 0.5, y + mark * 0.05 + nameSize * 0.2);

    y += mark + pad * 0.6;
    const body = w * 0.024 * k;
    ctx.font = `400 ${body}px ${FONT}`;
    ctx.fillStyle = INK_DIM;
    for (const line of wrapLines(ctx, tag.desc ?? '', cw - pad * 1.6, 3)) {
      ctx.fillText(line, x, y);
      y += body * 1.5;
    }
  }

  /** The group a tag belongs to, by name — "All" shows every group's, so it is looked up. */
  function groupOf(tag, group) {
    if (group.id !== 'all') return group.title;
    return groups.find((g) => g.id !== 'all' && g.tags.includes(tag))?.title ?? '';
  }

  /**
   * The window's title bar: traffic lights over the sidebar, then over the pane the
   * open group's name, the "+", the grid/list toggle with the grid lit, and the
   * search field.
   */
  function drawTitleBar(ctx, win, h, sideW, k) {
    const { x: left, y: top, w: W } = win;
    ctx.fillStyle = CHROME;
    ctx.fillRect(left, top, W, h);
    ctx.fillStyle = SIDEBAR_BG;
    ctx.fillRect(left, top, sideW, h);
    ctx.fillStyle = LINE;
    ctx.fillRect(left + sideW, top + h - Math.max(1, h * 0.02), W - sideW, Math.max(1, h * 0.02));

    const mid = top + h / 2;
    const r = h * 0.11;
    LIGHTS.forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(left + h * 0.5 + i * r * 3.1, mid, r, 0, Math.PI * 2);
      ctx.fill();
    });

    const group = groups.find((g) => g.id === selected);
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${h * 0.34}px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(group?.title ?? section.title, left + sideW + h * 0.55, mid);
    ctx.textBaseline = 'top';

    // The toolbar, from the right end in: the search field, the view toggle, the "+".
    const btn = h * 0.62;
    const searchW = W * 0.16 * k;
    let x = left + W - h * 0.45 - searchW;
    ctx.beginPath();
    ctx.roundRect(x, mid - btn / 2, searchW, btn, btn * 0.28);
    ctx.fillStyle = 'rgba(255, 255, 255, .06)';
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = Math.max(1, h * 0.015);
    ctx.stroke();
    glyphSearch(ctx, x + btn * 0.55, mid, btn * 0.24);
    ctx.textBaseline = 'middle';
    ctx.font = `400 ${h * 0.28}px ${FONT}`;
    ctx.fillStyle = INK_FAINT;
    ctx.fillText('Search', x + btn * 1.0, mid);
    ctx.textBaseline = 'top';

    // The toggle: two buttons in one capsule, the grid one lit.
    x -= h * 0.35 + btn * 2.1;
    ctx.beginPath();
    ctx.roundRect(x, mid - btn / 2, btn * 2.1, btn, btn * 0.28);
    ctx.fillStyle = 'rgba(255, 255, 255, .06)';
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + btn * 0.08, mid - btn * 0.42, btn * 0.97, btn * 0.84, btn * 0.24);
    ctx.fillStyle = 'rgba(255, 255, 255, .14)';
    ctx.fill();
    glyphGrid(ctx, x + btn * 0.56, mid, btn * 0.22);
    glyphList(ctx, x + btn * 1.58, mid, btn * 0.22);

    // The "+".
    x -= h * 0.3 + btn;
    ctx.beginPath();
    ctx.roundRect(x, mid - btn / 2, btn, btn, btn * 0.28);
    ctx.fillStyle = 'rgba(255, 255, 255, .06)';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, h * 0.03);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + btn / 2 - btn * 0.2, mid);
    ctx.lineTo(x + btn / 2 + btn * 0.2, mid);
    ctx.moveTo(x + btn / 2, mid - btn * 0.2);
    ctx.lineTo(x + btn / 2, mid + btn * 0.2);
    ctx.stroke();
  }

  // Every mark the window will draw, fetched up front; the first frame goes out with
  // the badges empty and the next fills them in, once, when the batch has landed.
  const pending = [];
  for (const group of groups) {
    if (group.icon) {
      pending.push(loadIcon(group.icon, ACCENT), loadIcon(group.icon, INK));
    }
    for (const tag of group.tags) if (tag.icon) pending.push(loadIcon(tag.icon, INK));
  }
  Promise.all(pending.map((entry) => entry.promise)).then(() => app.repaint());

  app.render();
  // The bar's clock. `repaint()` is the hook `screen.js` fills in with the one thing
  // this module has no business knowing about — flagging the texture.
  startClock(() => app.repaint());
  return app;
}

/**
 * The groups of the section's `skills` block, each given an id to be selected by —
 * led by "All", which is every group's skills in one grid and what the window opens on.
 */
function toGroups(section) {
  const block = section.blocks.find((b) => b.kind === 'skills');
  const groups = (block?.groups ?? []).map((group, i) => ({ id: `group-${i}`, ...group }));
  const all = {
    id: 'all',
    title: 'All Skills',
    icon: 'all-skills',
    note: 'Everything, in one place',
    tags: groups.flatMap((group) => group.tags),
  };
  return [all, ...groups];
}

/**
 * A glyph's own ink box, fitted inside a square of `size` and centred — the same
 * treatment `chips()` in `screen.js` gives them, so a mark reads the same size here
 * whatever margin its file left round it.
 */
function drawIcon(ctx, icon, x, y, size) {
  const { x: cx, y: cy, w, h } = icon.crop;
  const fit = size / Math.max(w, h);
  const dw = w * fit;
  const dh = h * fit;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(icon.image, cx, cy, w, h, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
}

/**
 * A scroll rail down the inside of a column's right edge, drawn only when there is
 * somewhere to go. The same shape Notes puts down its columns.
 */
function rail(ctx, right, top, height, span, at, full, columnW) {
  if (!span) return;
  const w = columnW * 0.006;
  const x = right - w * 3;
  const h = height * (height / full);
  ctx.fillStyle = 'rgba(255, 255, 255, .06)';
  ctx.fillRect(x, top, w, height);
  ctx.fillStyle = ACCENT;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x, top + (height - h) * (at / span), w, h);
  ctx.globalAlpha = 1;
}

/** Trims a line to `width` with an ellipsis, in whatever font is set. */
function clip(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Wraps a name onto at most `max` lines of `width`, the last one clipped if need be. */
function wrapLines(ctx, text, width, max) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    const kept = lines.slice(0, max);
    kept[max - 1] = clip(ctx, lines.slice(max - 1).join(' '), width);
    return kept;
  }
  return lines.map((l) => clip(ctx, l, width));
}

/** A magnifying glass, centred on (x, y), `s` its radius. */
function glyphSearch(ctx, x, y, s) {
  ctx.strokeStyle = INK_FAINT;
  ctx.lineWidth = Math.max(1, s * 0.28);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x - s * 0.15, y - s * 0.15, s * 0.6, 0, Math.PI * 2);
  ctx.moveTo(x + s * 0.3, y + s * 0.3);
  ctx.lineTo(x + s * 0.8, y + s * 0.8);
  ctx.stroke();
}

/** Four small squares — the grid view. */
function glyphGrid(ctx, x, y, s) {
  const cell = s * 0.78;
  const gap = s * 0.22;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, s * 0.16);
  for (let i = 0; i < 4; i++) {
    const cx = x - cell - gap / 2 + (i % 2) * (cell + gap);
    const cy = y - cell - gap / 2 + Math.floor(i / 2) * (cell + gap);
    ctx.beginPath();
    ctx.roundRect(cx, cy, cell, cell, cell * 0.2);
    ctx.stroke();
  }
}

/** Three dotted lines — the list view. */
function glyphList(ctx, x, y, s) {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = Math.max(1, s * 0.16);
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    const ly = y + i * s * 0.7;
    ctx.beginPath();
    ctx.arc(x - s * 0.9, ly, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, ly);
    ctx.lineTo(x + s * 0.9, ly);
    ctx.stroke();
  }
}
