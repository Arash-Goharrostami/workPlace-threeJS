import * as THREE from 'three';
import { createNotesApp } from './notesApp.js';
import { createTextEditApp } from './textEditApp.js';

/**
 * A section drawn on its prop's own screen, instead of in the sidebar.
 *
 * The room is the interface, and a monitor the camera has just flown up to is a better
 * place for a paragraph than a panel sliding in over the top of it. A section marked
 * `screen` in `content.js` is rendered to a canvas and hung on the display for as long
 * as it is open.
 *
 * The canvas goes on a **plane of its own, parented to the panel**, rather than into the
 * display's material. Repainting the material was the first attempt and the display's
 * own UVs make it unworkable: the lit panel is mapped `u = 8…9, v = 0.2…0.9` off a tiled
 * atlas, so a canvas dropped into that slot arrives cropped, stretched and turned a
 * quarter. A plane owns its own orientation and aspect, restoring is removing it, and
 * the wallpaper underneath is never touched.
 *
 * The plane is `MeshBasicMaterial` with tone mapping off: a screen emits its own light,
 * and shading it with the room's would leave the text as dim as the wall.
 *
 * A section longer than the panel **scrolls**. The copy is laid out once onto a tall
 * offscreen canvas and the plane shows a window of it, blitted across with `drawImage`:
 * turning the wheel then costs one blit, not a re-wrap of every paragraph.
 */

/** Canvas pixels down the long edge. The panel is ~70 cm and is read from close up. */
const LONG_EDGE = 1600;

/** Width of the scroll indicator down the panel's right edge, as a fraction. */
const RAIL = 0.006;

/** How far inside the panel's edges the text sits, as a fraction — clears the bezel. */
const BEZEL = 0.012;

/** Clearance in front of the glass, as a fraction of the screen's own height. */
const PROUD = 0.004;

/**
 * Where `index.html` turns the sidebar into a bottom sheet — and, for the same reason,
 * where a screen is read from further off: a narrow viewport frames its prop smaller,
 * so a section set for a desktop window arrives too small to read on a phone.
 */
const NARROW = window.matchMedia('(max-width: 760px)');

/**
 * How much larger the type is set there. The page keeps its width and scrolls further.
 * A section can opt out with `narrowType: 1` — the portrait display is already a tall
 * narrow screen read close up, so it needs none of this.
 */
const NARROW_TYPE = 2;

/**
 * The sidebar's palette, so a section reads the same wherever it is shown.
 *
 * Exported because `notesApp.js` draws a window around this same copy and has to match
 * it — a second palette there would drift the first time one of these changed.
 */
export const INK = '#e7e9ee';
export const INK_DIM = '#98a1b2';
export const INK_FAINT = '#7d8595';
export const ACCENT = '#6ea8fe';
export const GROUND = '#0d0f13';
export const LINE = '#232833';

export const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

/** Type sizes and spacing, as fractions of the canvas width — so the layout scales. */
export const SCALE = {
  pad: 0.058,
  eyebrow: 0.024,
  title: 0.072,
  text: 0.031,
  lead_size: 0.037,
  lead: 1.7,
  label: 0.022,
  value: 0.034,
  group: 0.022,
  chip: 0.026,
  role: 0.036,
  heading: 0.05,
};

/**
 * The lit panel under a prop: the biggest mesh whose material glows from a map.
 *
 * Found by that property rather than by name — the Sketchfab source calls it
 * `bIyqxwRZNkokZiN_4`, which says nothing and would not survive a re-import.
 */
export function panelOf(prop) {
  let best = null;
  let bestArea = 0;
  prop.traverse((node) => {
    // `overlay` is a picture hung in front of a screen rather than the screen itself —
    // the macOS desktop in `src/desktop.js` is one — and is lit the same way, so it has
    // to be skipped by name of intent or it wins this on size.
    if (!node.isMesh || node.userData.overlay || !node.material?.emissiveMap) return;
    node.geometry.computeBoundingBox();
    const size = node.geometry.boundingBox.getSize(new THREE.Vector3());
    const [a, b] = size.toArray().sort((x, y) => y - x);
    if (a * b > bestArea) {
      bestArea = a * b;
      best = node;
    }
  });
  return best;
}

/**
 * The picture area of a prop's screen, in world space: its middle, how wide and tall it
 * reads in the room, and the three directions that are across it, up it, and out of it.
 * `anchors.js` frames a section on this rather than on the whole display, so the camera
 * fills the viewport with the text instead of with the stand and the bezel.
 *
 * Taken off the triangles rather than off a bounding box. A box only describes a screen
 * when the screen happens to lie along the model's own axes, which the portrait display
 * does and the **laptop does not** — its lid is baked at its open angle, so the box
 * around it is a 34 × 7.6 × 21 slab whose axes point nowhere useful. Read that way the
 * section hung in mid-air at the wrong angle and the wrong size.
 */
export function screenFace(prop) {
  const panel = panelOf(prop);
  if (!panel) return null;

  panel.updateMatrixWorld(true);
  const facets = triangles(panel);
  if (!facets.length) return null;

  // A screen mesh is usually a slab, so the picture is one of its two broad faces and
  // everything else is rim. Those two are found on area alone — a rim is a fraction of
  // either — and only then is it asked which of them is the front, because the back is
  // often the broader of the two and area would pick it. The Pro Display's is.
  const groups = bundles(facets);
  const widest = Math.max(...groups.map((group) => group.area));
  const broad = groups.filter((group) => group.area >= widest * BROAD);

  // The displays stand around the edges of the room, so their front is the face looking
  // inward, toward the middle the room is built around. A screen lying flat on the desk
  // — the phone — has no such side: both of its faces are square to that direction and
  // score the same, and the one you can see is simply the one pointing up.
  const seat = new THREE.Vector3().setFromMatrixPosition(panel.matrixWorld);
  const inward = new THREE.Vector3(-seat.x, 0, -seat.z);
  if (inward.lengthSq() < 1e-6) inward.set(0, 0, 1);
  inward.normalize();

  const front = broad.sort(
    (a, b) => b.normal.dot(inward) - a.normal.dot(inward) || b.normal.y - a.normal.y
  )[0];
  const normal = front.normal;

  // Up the picture is up the room, flattened onto the glass — the one thing that holds
  // whether a panel is upright, tilted back on a hinge, or stood on its short edge, as
  // `proDisplay.js` stands the second display. A screen lying flat has no such
  // direction; any in-plane axis will do there.
  let up = new THREE.Vector3(0, 1, 0).projectOnPlane(normal);
  if (up.lengthSq() < 1e-6) up = new THREE.Vector3(0, 0, 1).projectOnPlane(normal);
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();

  // Measured on the front's own vertices, along those directions: the extent of the
  // glass, not of the box that happens to contain it.
  const span = { right: extent(front.points, right), up: extent(front.points, up) };
  const depth = extent(front.points, normal);

  const centre = new THREE.Vector3()
    .addScaledVector(right, span.right.mid)
    .addScaledVector(up, span.up.mid)
    .addScaledVector(normal, depth.max);

  return {
    panel,
    normal,
    right,
    up,
    centre,
    width: span.right.size,
    height: span.up.size,
  };
}

/** Every triangle of a mesh as world-space points, with its own normal and area. */
function triangles(mesh) {
  const position = mesh.geometry.attributes.position;
  if (!position) return [];
  const index = mesh.geometry.index;
  const count = index ? index.count : position.count;

  const out = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    const [x, y, z] = [0, 1, 2].map((o) => (index ? index.getX(i + o) : i + o));
    a.fromBufferAttribute(position, x).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, y).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, z).applyMatrix4(mesh.matrixWorld);

    const cross = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a));
    const area = cross.length() / 2;
    if (area < 1e-12) continue;
    out.push({ normal: cross.normalize(), area, points: [a.clone(), b.clone(), c.clone()] });
  }
  return out;
}

/** How far apart two facets may point and still count as the same face. */
const SAME_FACE = 0.98;

/**
 * How much of the widest face a bundle must have to count as one of a slab's two broad
 * faces rather than as rim. Half is generous either way: a screen's front and back are
 * within a few percent of each other, and the rim around them is thickness against
 * length — a percent or two.
 */
const BROAD = 0.5;

/** Groups facets by the direction they point, keeping each group's area and points. */
function bundles(facets) {
  const groups = [];
  for (const facet of facets) {
    const group = groups.find((candidate) => candidate.normal.dot(facet.normal) > SAME_FACE);
    if (group) {
      group.area += facet.area;
      group.points.push(...facet.points);
    } else {
      groups.push({ normal: facet.normal.clone(), area: facet.area, points: [...facet.points] });
    }
  }
  return groups;
}

/** How far a set of points reaches along one direction. */
function extent(points, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const along = point.dot(axis);
    if (along < min) min = along;
    if (along > max) max = along;
  }
  return { min, max, mid: (min + max) / 2, size: max - min };
}

export function setupScreens() {
  /** One plane per prop, with the section on it, kept for as long as the room is up. */
  const painted = new Map();

  const screens = {
    /**
     * Paints `section` onto `prop`'s screen, and leaves it there. The display shows its
     * section whether or not anyone is reading it — a monitor in a workroom is not
     * blank, and the text is what this one is for.
     */
    paint(prop, section) {
      const face = screenFace(prop);
      if (!face) {
        console.warn(`[resume] no lit screen on "${prop.name}" to draw the section on`);
        return;
      }

      const old = painted.get(prop);
      if (old) dispose(old.plane);

      const { panel, normal, right, up } = face;
      const width = face.width * (1 - BEZEL * 2);
      const height = face.height * (1 - BEZEL * 2);

      // Laid out full-length once; what the plane shows is a window onto it.
      const view = document.createElement('canvas');
      view.width = Math.round(LONG_EDGE * (width / height));
      view.height = LONG_EDGE;
      const texture = new THREE.CanvasTexture(view);
      texture.colorSpace = THREE.SRGBColorSpace;

      // A section marked `app` is a window rather than a page: `notesApp.js` owns what
      // is on the canvas, and everything below — the plane, its seating, its material —
      // is the same either way.
      // A section marked `app` is a window rather than a page, and which window is the
      // section's own business: Notes on the main display, TextEdit on the portrait one.
      let app = null;
      if (section.app === 'notes') app = createNotesApp(section, view);
      else if (section.app === 'textEdit') app = createTextEditApp(section, view);
      const full = app ? null : draw(section, view.width);
      const page = app
        ? { view, texture, app }
        : { view, full, texture, scroll: 0, span: Math.max(0, full.height - view.height) };
      if (!app) blit(page);
      // The window repaints itself on the minute, for the menu bar's clock, and this is
      // the half of that it cannot do: the same pairing `scroll()` and `rewind()` below
      // make by hand.
      if (app) {
        app.repaint = () => {
          app.render();
          texture.needsUpdate = true;
        };
      }
      texture.needsUpdate = true;

      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
      );
      plane.name = `${prop.name}_section`;
      // Inert, except for a window: its rows are clicked on the monitor itself, so this
      // one plane has to be castable for `picking.js` to find a UV on it.
      if (!app) plane.raycast = () => {};

      // Square to the glass, because those are the glass's own directions: across the
      // picture, up it, and out of it, all measured off the front facets in
      // `screenFace`. Set in world space and then carried into the panel's frame, so
      // whatever the prop's own axes are up to — the laptop's lid is baked at its open
      // angle — the text lands flat on the screen and upright in the room.
      const orient = new THREE.Matrix4().makeBasis(right, up, normal);
      const position = face.centre.clone().addScaledVector(normal, face.height * PROUD);

      panel.add(plane);
      plane.quaternion
        .setFromRotationMatrix(orient)
        .premultiply(panel.getWorldQuaternion(new THREE.Quaternion()).invert());
      plane.position.copy(panel.worldToLocal(position));
      // The plane is built in world units, but hangs off a panel that carries the
      // prop's own scale — divided back out, or a model placed at a tenth of its
      // authored size shows a section a tenth the size of its screen.
      const scale = panel.getWorldScale(new THREE.Vector3());
      plane.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
      plane.updateMatrixWorld(true);

      plane.userData.page = page;
      if (app) plane.userData.notes = app;
      painted.set(prop, { plane, section });
    },

    /**
     * Scrolls a prop's screen by `delta` canvas pixels, clamped to the copy's length.
     * Returns whether there was anywhere to go, so the caller can leave the wheel to
     * the camera when a section already fits.
     */
    scroll(prop, delta, uv) {
      const page = painted.get(prop)?.plane.userData.page;
      if (!page) return false;
      if (page.app) {
        // A window has a column under the pointer; a page has only itself, and ignores
        // the UV entirely.
        const moved = page.app.scroll(delta, uv);
        if (moved) page.texture.needsUpdate = true;
        return moved;
      }
      if (!page.span) return false;

      const was = page.scroll;
      page.scroll = Math.min(page.span, Math.max(0, page.scroll + delta));
      if (page.scroll !== was) blit(page);
      return true;
    },

    /** Back to the top — a section is opened at its beginning, not where it was left. */
    rewind(prop) {
      const page = painted.get(prop)?.plane.userData.page;
      if (!page) return;
      if (page.app) {
        page.app.rewind();
        page.texture.needsUpdate = true;
        return;
      }
      if (!page.scroll) return;
      page.scroll = 0;
      blit(page);
    },

    /**
     * A click on a prop's screen, at `uv` on its plane. Returns whether the window took
     * it — a click that fell on the pane rather than on a row is nobody's, and
     * `picking.js` lets it fall through to whatever it would otherwise have done.
     */
    click(prop, uv) {
      const page = painted.get(prop)?.plane.userData.page;
      if (!page?.app) return false;
      const id = page.app.hitTest(uv);
      if (!id) return false;
      if (page.app.select(id)) page.texture.needsUpdate = true;
      return true;
    },

    /** The same, for the pointer resting on a row. Returns whether one is under it. */
    hover(prop, uv) {
      const page = painted.get(prop)?.plane.userData.page;
      if (!page?.app) return false;
      const id = uv ? page.app.hitTest(uv) : null;
      if (page.app.setHover(id)) page.texture.needsUpdate = true;
      return Boolean(id);
    },
  };

  // Crossing the breakpoint changes how large the copy is set, and a page is laid out
  // once when it is painted — so every screen is painted again when it does. Each comes
  // back at its top, which is where opening a section puts it anyway.
  NARROW.addEventListener('change', () => {
    for (const [prop, { section }] of [...painted]) screens.paint(prop, section);
  });

  return screens;
}

/** Copies the visible window of the laid-out page onto the canvas the plane shows. */
function blit(page) {
  const { view, full, scroll, span } = page;
  const ctx = view.getContext('2d');

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.drawImage(full, 0, scroll, view.width, view.height, 0, 0, view.width, view.height);

  // Only when there is something below: a rail on a page that fits is furniture.
  if (span) {
    const w = view.width * RAIL;
    const x = view.width - w * 3;
    const height = view.height * (view.height / full.height);
    const y = (view.height - height) * (scroll / span);

    ctx.fillStyle = 'rgba(255, 255, 255, .06)';
    ctx.fillRect(x, 0, w, view.height);
    ctx.fillStyle = ACCENT;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, y, w, height);
    ctx.globalAlpha = 1;
  }

  page.texture.needsUpdate = true;
}

/** Frees one painted plane and everything it owns. */
function dispose(plane) {
  plane.material.map.dispose();
  plane.material.dispose();
  plane.geometry.dispose();
  plane.removeFromParent();
}

/* ------------------------------------------------------------------- drawing */

/**
 * Lays the section out on a canvas as tall as the copy needs: eyebrow, title, lead,
 * paragraphs, stats. Measured in a first pass, drawn in a second — the height has to be
 * known before the canvas exists, and setting a canvas's size wipes what is on it.
 */
function draw(section, W) {
  const measure = document.createElement('canvas').getContext('2d');
  measure.textBaseline = 'top';
  const height = Math.max(LONG_EDGE, Math.ceil(flow(measure, section, W)));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;

  const ctx = canvas.getContext('2d');

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = 'top';
  flow(ctx, section, W, true);

  return canvas;
}

/**
 * Runs the layout, drawing only when asked to. The same pass measures and paints, so a
 * block cannot be measured one way and drawn another.
 */
function flow(ctx, section, W, paint = false) {
  // Type is sized off `u`, not off the canvas. They are the same thing until a section
  // asks for something smaller: the laptop's lid is a third of the portrait display's
  // height and is read from further back, so copy set for that one lands on it far too
  // large. `screenScale` in `content.js` is the dial.
  const u =
    W * (section.screenScale ?? 1) * (NARROW.matches ? section.narrowType ?? NARROW_TYPE : 1);
  const pad = u * SCALE.pad;

  let y = pad * 1.1;

  ctx.font = `500 ${u * SCALE.eyebrow}px ${FONT}`;
  if (paint) {
    ctx.fillStyle = ACCENT;
    ctx.fillText(spaced(section.eyebrow.toUpperCase()), pad, y);
  }
  y += u * SCALE.eyebrow * 2.2;

  ctx.font = `600 ${u * SCALE.title}px ${FONT}`;
  if (paint) {
    ctx.fillStyle = INK;
    ctx.fillText(section.title, pad, y);
  }
  y += u * SCALE.title * 1.55;

  y = blocks(ctx, section.blocks, pad, y, W, u, paint);

  return y + pad;
}

/**
 * A run of blocks, laid out down the page from `y` and returning where it ended.
 *
 * Lifted out of `flow()` so the Notes window in `notesApp.js` can put one note's blocks
 * into its own pane through the same renderers this page uses. Every one of them takes
 * `pad` as the left edge and `W - pad` as the right, so a caller wanting a column
 * narrower than the canvas translates the context and passes the column's own width.
 */
export function blocks(ctx, list, pad, top, W, u, paint) {
  let y = top;
  for (const block of list) {
    if (block.kind === 'intro') y = body(ctx, [block.text], pad, y, W, u, paint, true);
    else if (block.kind === 'text') y = body(ctx, block.paragraphs, pad, y, W, u, paint);
    else if (block.kind === 'stats') y = stats(ctx, block.cells, pad, y, W, u, paint);
    else if (block.kind === 'skills') y = skills(ctx, block.groups, pad, y, W, u, paint);
    else if (block.kind === 'heading') y = heading(ctx, block.text, pad, y, u, paint);
    else if (block.kind === 'timeline') y = timeline(ctx, block.items, pad, y, W, u, paint);
    else if (block.kind === 'cards') y = cards(ctx, block.items, pad, y, W, u, paint);
    else if (block.kind === 'footnote') y = body(ctx, [block.text], pad, y, W, u, paint);
    // Anything else is skipped, the way `panels.js` skips block kinds it lacks.
  }
  return y;
}

/**
 * Wrapped copy. `lead` sets it larger and in full-strength ink — the section's opening
 * claim, which carries the weight the site's own heading does.
 */
function body(ctx, list, pad, top, W, u, paint, lead = false) {
  const size = u * (lead ? SCALE.lead_size : SCALE.text);
  const line = size * SCALE.lead;
  ctx.font = `${lead ? 500 : 400} ${size}px ${FONT}`;

  let y = top;
  for (const paragraph of list) {
    for (const text of wrap(ctx, paragraph, W - pad * 2)) {
      if (paint) {
        ctx.fillStyle = lead ? INK : INK_DIM;
        ctx.fillText(text, pad, y);
      }
      y += line;
    }
    y += line * 0.6;
  }
  return y + line * (lead ? 0.5 : 0.7);
}

/** The two-by-two grid of figures, drawn as cells on a hairline grid. */
function stats(ctx, cells, pad, top, W, u, paint) {
  const width = (W - pad * 2) / 2;
  const height = u * 0.125;

  for (let i = 0; i < cells.length; i++) {
    const x = pad + (i % 2) * width;
    const y = top + Math.floor(i / 2) * height;
    if (!paint) continue;

    ctx.fillStyle = 'rgba(255, 255, 255, .022)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = Math.max(1, u * 0.0016);
    ctx.strokeRect(x, y, width, height);

    ctx.font = `500 ${u * SCALE.label}px ${FONT}`;
    ctx.fillStyle = INK_FAINT;
    ctx.fillText(spaced(cells[i].label.toUpperCase()), x + pad * 0.7, y + height * 0.26);

    ctx.font = `400 ${u * SCALE.value}px ${FONT}`;
    ctx.fillStyle = cells[i].accent ? ACCENT : INK;
    ctx.fillText(cells[i].value, x + pad * 0.7, y + height * 0.55);
  }

  return top + Math.ceil(cells.length / 2) * height + u * 0.05;
}

/**
 * The stack, as a tracked-out group heading with its tags wrapped underneath as chips.
 *
 * Laid out in the same pass that paints it, so a chip cannot be measured onto one row
 * and drawn on another — the page's height decides how far the screen scrolls.
 */
function skills(ctx, groups, pad, top, W, u, paint) {
  let y = top;
  for (const group of groups) {
    ctx.font = `500 ${u * SCALE.group}px ${FONT}`;
    if (paint) {
      ctx.fillStyle = INK_FAINT;
      ctx.fillText(spaced(group.title.toUpperCase()), pad, y);
    }
    y += u * SCALE.group * 2.1;
    y = chips(ctx, group.tags, pad, y, pad + W - pad * 2, u, paint) + u * 0.045;
  }

  return y;
}

/**
 * A row of tags as rounded chips, wrapped to `right`. Shared by the stack and by the
 * roles in the timeline, which name theirs the same way.
 */
function chips(ctx, tags, left, top, right, u, paint) {
  const size = u * SCALE.chip;
  const height = size * 2.1;
  const gap = size * 0.5;
  const inset = size * 0.85;

  ctx.font = `400 ${size}px ${FONT}`;
  let x = left;
  let y = top;
  for (const tag of tags) {
    const width = ctx.measureText(tag).width + inset * 2;
    // A chip that would run past the right edge starts the next row instead; one wider
    // than the column on its own is left to overhang rather than loop.
    if (x > left && x + width > right) {
      x = left;
      y += height + gap;
    }
    if (paint) {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, height / 2);
      ctx.fillStyle = 'rgba(255, 255, 255, .03)';
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = Math.max(1, u * 0.0014);
      ctx.stroke();

      ctx.fillStyle = INK_DIM;
      ctx.fillText(tag, x + inset, y + height * 0.28);
    }
    x += width + gap;
  }
  return y + height;
}

/** A second title partway down a page — where one section is really two. */
function heading(ctx, text, pad, top, u, paint) {
  ctx.font = `600 ${u * SCALE.heading}px ${FONT}`;
  if (paint) {
    ctx.fillStyle = INK;
    ctx.fillText(text, pad, top);
  }
  return top + u * SCALE.heading * 1.7;
}

/**
 * A run of roles down a hairline rule, each with its dates, its title, who it was for,
 * the stack it used and what came of it. The rule is drawn per role rather than as one
 * line down the block, so a role cannot be measured into a gap the rule then crosses.
 */
function timeline(ctx, items, pad, top, W, u, paint) {
  const gutter = u * 0.055;
  const left = pad + gutter;
  const right = W - pad;
  const width = right - left;

  let y = top;
  for (const item of items) {
    const from = y;

    ctx.font = `500 ${u * SCALE.label}px ${FONT}`;
    if (paint) {
      ctx.fillStyle = ACCENT;
      ctx.fillText(spaced(item.date.toUpperCase()), left, y);
    }
    y += u * SCALE.label * 2.4;

    ctx.font = `600 ${u * SCALE.role}px ${FONT}`;
    if (paint) {
      ctx.fillStyle = INK;
      ctx.fillText(item.role, left, y);
    }
    y += u * SCALE.role * 1.5;

    if (item.org) {
      ctx.font = `400 ${u * SCALE.text}px ${FONT}`;
      if (paint) {
        ctx.fillStyle = INK_DIM;
        ctx.fillText(item.org, left, y);
      }
      y += u * SCALE.text * 1.9;
    }

    // What the product was, for a role whose bullets are all measurements — a reader
    // otherwise learns the system got faster without ever learning what it did.
    if (item.desc) {
      const size = u * SCALE.text;
      const line = size * SCALE.lead;
      ctx.font = `400 ${size}px ${FONT}`;
      const lines = wrap(ctx, item.desc, width);
      if (paint) {
        ctx.fillStyle = INK_FAINT;
        lines.forEach((text, i) => ctx.fillText(text, left, y + line * i));
      }
      y += line * lines.length + line * 0.35;
    }

    if (item.tags?.length) y = chips(ctx, item.tags, left, y, right, u, paint) + u * 0.03;
    if (item.points?.length) y = bullets(ctx, item.points, left, y, width, u, paint);

    // Drawn last, now that the role's full height is known.
    if (paint) {
      ctx.fillStyle = LINE;
      ctx.fillRect(pad, from, Math.max(1, u * 0.0022), y - from - u * 0.02);
    }
    y += u * 0.05;
  }

  return y;
}

/** Wrapped copy behind a small dot, one entry per line of achievement. */
function bullets(ctx, points, left, top, width, u, paint) {
  const size = u * SCALE.text;
  const line = size * SCALE.lead;
  const inset = size * 1.1;
  ctx.font = `400 ${size}px ${FONT}`;

  let y = top;
  for (const point of points) {
    const lines = wrap(ctx, point, width - inset);
    if (paint) {
      ctx.fillStyle = INK_FAINT;
      ctx.beginPath();
      ctx.arc(left + size * 0.3, y + size * 0.62, size * 0.14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = INK_DIM;
      lines.forEach((text, i) => ctx.fillText(text, left + inset, y + line * i));
    }
    y += line * lines.length + line * 0.25;
  }
  return y + line * 0.4;
}

/**
 * A boxed project: what it is, what it was built with, and what it does.
 *
 * The card's contents are laid out twice when painting — once to find out how tall the
 * box has to be, then again on top of it. A box drawn after its text would cover it,
 * and one drawn before it cannot know its own height.
 */
function cards(ctx, items, pad, top, W, u, paint) {
  const width = W - pad * 2;
  const inset = u * 0.035;

  let y = top;
  for (const item of items) {
    const bottom = card(ctx, item, pad + inset, y + inset, width - inset * 2, u, false);
    const height = bottom - y + inset;

    if (paint) {
      ctx.beginPath();
      ctx.roundRect(pad, y, width, height, u * 0.018);
      ctx.fillStyle = 'rgba(255, 255, 255, .022)';
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = Math.max(1, u * 0.0016);
      ctx.stroke();

      card(ctx, item, pad + inset, y + inset, width - inset * 2, u, true);
    }

    y += height + u * 0.03;
  }

  return y + u * 0.02;
}

/** One card's contents, measured and drawn by the same pass. Returns its bottom. */
function card(ctx, item, left, top, width, u, paint) {
  let y = top;

  if (item.meta) {
    ctx.font = `500 ${u * SCALE.label}px ${FONT}`;
    if (paint) {
      ctx.fillStyle = ACCENT;
      ctx.fillText(spaced(item.meta.toUpperCase()), left, y);
    }
    y += u * SCALE.label * 2.2;
  }

  ctx.font = `600 ${u * SCALE.role}px ${FONT}`;
  if (paint) {
    ctx.fillStyle = INK;
    ctx.fillText(item.title, left, y);
  }
  y += u * SCALE.role * 1.6;

  if (item.tags?.length) y = chips(ctx, item.tags, left, y, left + width, u, paint) + u * 0.025;

  if (item.desc) {
    const size = u * SCALE.text;
    const line = size * SCALE.lead;
    ctx.font = `400 ${size}px ${FONT}`;
    const lines = wrap(ctx, item.desc, width);
    if (paint) {
      ctx.fillStyle = INK_DIM;
      lines.forEach((text, i) => ctx.fillText(text, left, y + line * i));
    }
    y += line * lines.length;
  }

  return y;
}

/** Greedy word wrap against a measured width. */
export function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Canvas has no letter-spacing everywhere yet, and the labels are tracked out wide. */
export function spaced(text) {
  return text.split('').join(' ');
}
