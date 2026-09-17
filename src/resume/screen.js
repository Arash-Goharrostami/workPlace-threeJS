import * as THREE from 'three';
import { LOW } from '../quality.js';
import { createNotesApp } from './notesApp.js';
import { createTextEditApp } from './textEditApp.js';
import { createStackApp } from './stackApp.js';

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

/**
 * Canvas pixels down the long edge. The panel is ~70 cm and is read from close up. A
 * weak device gets three quarters of it: the screens are the room's biggest textures
 * after the shadow map, and at a phone's distance the type is still sharp.
 */
const LONG_EDGE = LOW ? 1200 : 1600;

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
/** The accent as a wash and a hairline, for the date badges in the timeline. */
const ACCENT_TINT = 'rgba(110, 168, 254, .13)';
const ACCENT_LINE = 'rgba(110, 168, 254, .35)';
export const GROUND = '#0d0f13';
export const LINE = '#232833';

export const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

/**
 * The face the renderers below set type in. `FONT` unless a section names its own —
 * the Writing section is set in a handwriting face — in which case `flow()` swaps it in
 * for that page and back out after, so a window drawing blocks through `blocks()`
 * (`notesApp.js`) is not left with the last page's face.
 */
let face = FONT;

/**
 * Multiplier on the vertical gaps, likewise set per page by `flow()`. A handwritten
 * pad wants its lines closer than the monitors' pages do; `leading` in `content.js`.
 */
let leading = 1;

/**
 * Faces that live in `public/fonts/`, by the name a section's `font` uses. Loaded on
 * first use through the FontFace API rather than a stylesheet, so nothing on the page
 * has to mention them; `paint()` repaints the screen once the file is in, since a
 * canvas cannot wait for a font the way the DOM does.
 */
const FACES = {
  Caveat: 'fonts/caveat.woff2',
};
const loaded = new Map();

export function loadFace(name) {
  if (!FACES[name]) return Promise.resolve();
  if (!loaded.has(name)) {
    const font = new FontFace(name, `url(${FACES[name]})`);
    loaded.set(
      name,
      font.load().then((f) => document.fonts.add(f)).catch((error) => {
        console.warn(`[resume] font "${name}" failed to load:`, error);
      })
    );
  }
  return loaded.get(name);
}

/**
 * The glyphs the stack's chips carry, from `public/skillsIcon/` by the `icon` a tag
 * names in `content.js`. They arrive as black-fill SVGs, so the file is fetched as text
 * and its fill rewritten to the ink the chip sets its word in before it becomes an
 * image — one per name and colour, since a group's mark is set in the accent.
 * Like a face, an icon cannot be waited for mid-paint: `paint()` repaints the screen
 * once the set a section needs has landed, and `chips()` reserves the slot either way.
 */
const icons = new Map();

export function loadIcon(name, color) {
  const key = `${name}|${color}`;
  if (!icons.has(key)) {
    const entry = { image: null, promise: null };
    entry.promise = fetch(`skillsIcon/${name}.svg`)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.text();
      })
      .then((svg) => {
        // Any fill the file spells out becomes the chip's ink; a path with none picks
        // the same up from the root.
        const tinted = svg
          .replace(/fill="(#[0-9a-fA-F]{3,8}|currentColor|url\(#[^)]*\))"/g, `fill="${color}"`)
          // The same fill spelt as CSS, in a `<style>` block or a `style=` attribute.
          .replace(/fill:\s*#[0-9a-fA-F]{3,8}/g, `fill:${color}`)
          // An outline icon draws with its stroke instead; that takes the ink too.
          .replace(/stroke="#[0-9a-fA-F]{3,8}"/g, `stroke="${color}"`)
          .replace(/stroke:\s*#[0-9a-fA-F]{3,8}/g, `stroke:${color}`)
          // A white plate behind the mark (Next.js ships one) would be a white square
          // on the chip: it goes clear rather than taking the ink.
          .replace(/fill="(white|#fff(?:fff)?)"/gi, 'fill="none"')
          .replace(/<svg\b(?![^>]*\sfill=)/, `<svg fill="${color}"`)
          // A file with a viewBox but no width and height has no intrinsic size as an
          // image, and some browsers draw nothing for it (`frontend.svg` was one). The
          // size only sets the raster's scale, so any generous square does.
          .replace(/<svg\b(?![^>]*\swidth=)/, '<svg width="800" height="800"');
        const image = new Image();
        return new Promise((resolve, reject) => {
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tinted)}`;
        });
      })
      .then((image) => {
        entry.image = image;
        entry.crop = inkBounds(image);
      })
      .catch((error) => {
        console.warn(`[resume] icon "${name}" failed to load:`, error);
      });
    icons.set(key, entry);
  }
  return icons.get(key);
}

/**
 * The box the glyph actually fills, in image pixels. The files come from different
 * hands and leave different margins inside their viewBox — Docker sits low in a 32
 * square, Kubernetes fills its 16 — so drawn as-is they land at different sizes on the
 * chips. Found by rasterising once and scanning the alpha; `chips()` draws the box, not
 * the file, so every glyph fills its slot the same way.
 */
function inkBounds(image) {
  const N = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, N, N);
  const { data } = ctx.getImageData(0, 0, N, N);
  let minX = N, minY = N, maxX = -1, maxY = -1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (data[(y * N + x) * 4 + 3] < 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: image.width, h: image.height };
  const sx = image.width / N;
  const sy = image.height / N;
  return { x: minX * sx, y: minY * sy, w: (maxX - minX + 1) * sx, h: (maxY - minY + 1) * sy };
}

/**
 * Every icon a section's chips will ask for, paired with the ink each is drawn in —
 * the skills groups' marks and tags, and the tags on a role or a project card.
 */
function iconsOf(section) {
  const wanted = [];
  for (const block of section.blocks ?? []) {
    if (block.kind === 'skills') {
      for (const group of block.groups) {
        if (group.icon) wanted.push([group.icon, ACCENT]);
        for (const tag of group.tags) {
          if (tag.icon) wanted.push([tag.icon, INK]);
        }
      }
    } else if (block.kind === 'timeline' || block.kind === 'cards') {
      for (const item of block.items) {
        for (const tag of item.tags ?? []) {
          if (tag.icon) wanted.push([tag.icon, INK]);
        }
      }
    }
  }
  return wanted;
}

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
  if (!panel) return slabFace(prop);

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

/**
 * The face of a prop that has no lit panel to find — the iPad, whose model is one unlit
 * mesh with nothing that says "screen" about it. Read as the slab it is: the thinnest
 * axis of its biggest mesh is out of the glass, and the box face at the top of that
 * axis is the glass. Cruder than the facet read above, but a tablet lying on a desk *is*
 * its bounding box, near enough.
 *
 * The page is portrait: up the picture is the slab's long axis, pointed away from the
 * middle of the room — which for a tablet on the desk is away from whoever stands at
 * the desk reading it, so the page is upright from their side.
 */
function slabFace(prop) {
  let panel = null;
  let bestArea = 0;
  prop.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.computeBoundingBox();
    const size = node.geometry.boundingBox.getSize(new THREE.Vector3());
    const [a, b] = size.toArray().sort((x, y) => y - x);
    if (a * b > bestArea) {
      bestArea = a * b;
      panel = node;
    }
  });
  if (!panel) return null;

  panel.updateMatrixWorld(true);
  const box = panel.geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const axes = ['x', 'y', 'z'];
  const thin = axes.reduce((a, b) => (size[a] < size[b] ? a : b));
  const flat = axes.filter((axis) => axis !== thin);

  // A local axis carried into the room, without the prop's scale.
  const world = (axis) => {
    const v = new THREE.Vector3();
    v[axis] = 1;
    return v.transformDirection(panel.matrixWorld);
  };

  const normal = world(thin);
  const top = normal.y >= 0;
  if (!top) normal.negate();

  const seat = new THREE.Vector3().setFromMatrixPosition(panel.matrixWorld);
  const away = new THREE.Vector3(seat.x, 0, seat.z);
  if (away.lengthSq() < 1e-6) away.set(0, 0, -1);
  away.normalize();
  // Portrait: the long axis is up the page, pointed away from the reader.
  const upAxis = flat.reduce((a, b) => (size[a] >= size[b] ? a : b));
  const rightAxis = flat.find((axis) => axis !== upAxis);
  const up = world(upAxis);
  if (up.dot(away) < 0) up.negate();
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();

  const local = box.getCenter(new THREE.Vector3());
  local[thin] = top ? box.max[thin] : box.min[thin];
  const centre = panel.localToWorld(local);

  const scale = panel.getWorldScale(new THREE.Vector3());
  return {
    panel,
    normal,
    right,
    up,
    centre,
    width: size[rightAxis] * scale[rightAxis],
    height: size[upAxis] * scale[upAxis],
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
  /** Faces that have landed, so a repaint does not queue another. */
  const ready = new Set();

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
      // A section can widen the inset: a tablet's bezel is a good deal broader than a
      // monitor's, and the box read in `slabFace` takes in the rim as well as the glass.
      const inset = section.screenInset ?? BEZEL;
      const width = face.width * (1 - inset * 2);
      const height = face.height * (1 - inset * 2);

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
      else if (section.app === 'shortcuts') app = createStackApp(section, view);
      const full = app ? null : draw(section, view.width);
      // Drawn now in whatever face is in; drawn again once the section's own has
      // arrived. Only for a page — the windows set their own type. Not gated on
      // `document.fonts.check()`: that answers true for a family the page has never
      // heard of, which is exactly the case before the first load.
      if (!app && section.font && !ready.has(section.font)) {
        loadFace(section.font).then(() => {
          ready.add(section.font);
          if (painted.get(prop)?.plane === plane) screens.paint(prop, section);
        });
      }
      // The same again for the chips' icons: drawn with their slots empty now, and
      // once more with the glyphs in. Only the ones still on their way queue a repaint
      // — of the page, or of the window, whose chips come from the same renderer.
      const pending = iconsOf(section)
        .map(([name, color]) => loadIcon(name, color))
        .filter((entry) => !entry.image);
      if (pending.length) {
        Promise.all(pending.map((entry) => entry.promise)).then(() => {
          if (painted.get(prop)?.plane !== plane) return;
          if (app) app.repaint();
          else screens.paint(prop, section);
        });
      }
      const page = app
        ? { view, texture, app }
        : {
            view, full, texture, scroll: 0,
            span: Math.max(0, full.height - view.height),
            radius: section.screenRadius ?? 0,
            toolbar: section.toolbar ?? null,
          };
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
        new THREE.MeshBasicMaterial({
          map: texture,
          toneMapped: false,
          // See `blit()`: rounded corners are cleared, not painted, and show the glass.
          transparent: Boolean(section.screenRadius),
        })
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

    /** A window's phone layout on or off — only a window that has one answers. */
    setCompact(prop, on) {
      const page = painted.get(prop)?.plane.userData.page;
      if (!page?.app?.setCompact) return;
      page.app.setCompact(on);
      page.texture.needsUpdate = true;
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
  const { view, full, scroll, span, radius } = page;
  const ctx = view.getContext('2d');

  // A screen with rounded corners — the tablet's — is clipped to them, and the corners
  // left clear so the glass shows through; the plane's material is transparent for it.
  ctx.save();
  if (radius) {
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.beginPath();
    ctx.roundRect(0, 0, view.width, view.height, radius * view.width);
    ctx.clip();
  }
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
  if (page.toolbar === 'draw') drawToolbar(ctx, view.width, view.height);
  ctx.restore();

  page.texture.needsUpdate = true;
}

/**
 * The tool bar of a drawing app, along the bottom of the glass: a row of round buttons — undo, redo, erase, draw (lit), tools, fill, pen size, colour and
 * layers — each with its glyph and a small label. Painted over the page in `blit()`
 * rather than into it, so it holds still while the page scrolls under it.
 */
const TOOLBAR_H = 0.11;
const TOOLS = [
  { label: 'Undo', glyph: 'undo' },
  { label: 'Redo', glyph: 'redo' },
  { label: 'Erase', glyph: 'erase' },
  { label: 'Draw', glyph: 'draw', lit: true },
  { label: 'Tools', glyph: 'tools' },
  { label: 'Fill', glyph: 'fill' },
  { label: '0.8 mm', glyph: 'size' },
  { label: 'Color', glyph: 'color' },
  { label: 'Layers', glyph: 'layers' },
];

function drawToolbar(ctx, W, H) {
  const h = W * TOOLBAR_H;
  const top = H - h;

  // No band behind the buttons: they sit straight on the page.
  ctx.save();

  const n = TOOLS.length;
  const d = h * 0.6;
  const gap = Math.min(d * 0.35, (W - n * d) / (n + 1));
  const rowW = n * d + (n - 1) * gap;
  let x = (W - rowW) / 2;
  const cy = top + h * 0.4;
  const labelSize = h * 0.11;

  for (const tool of TOOLS) {
    const cx = x + d / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool.lit ? '#2f7cf6' : '#2a2d34';
    ctx.fill();

    ctx.strokeStyle = '#f2f4f8';
    ctx.fillStyle = '#f2f4f8';
    ctx.lineWidth = d * 0.06;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    glyph(ctx, tool.glyph, cx, cy, d * 0.24);

    ctx.font = `500 ${labelSize}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = tool.lit ? '#cfe1ff' : INK_DIM;
    ctx.fillText(tool.label, cx, cy + d / 2 + labelSize * 1.1);
    ctx.textAlign = 'left';

    x += d + gap;
  }
  ctx.restore();
}

/** One tool bar icon, drawn with strokes inside a box `r` either side of (cx, cy). */
function glyph(ctx, kind, cx, cy, r) {
  ctx.beginPath();
  switch (kind) {
    case 'undo':
    case 'redo': {
      // One drawing, mirrored for redo.
      ctx.save();
      ctx.translate(cx, cy);
      if (kind === 'redo') ctx.scale(-1, 1);
      ctx.arc(0, r * 0.15, r * 0.75, Math.PI * 1.1, Math.PI * 2.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, -r * 0.7);
      ctx.lineTo(-r * 0.75, -r * 0.05);
      ctx.lineTo(-r * 0.1, -r * 0.05);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'erase':
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 4);
      ctx.roundRect(-r * 0.9, -r * 0.45, r * 1.8, r * 0.9, r * 0.15);
      ctx.moveTo(-r * 0.2, -r * 0.45);
      ctx.lineTo(-r * 0.2, r * 0.45);
      ctx.stroke();
      ctx.restore();
      break;
    case 'draw':
      ctx.moveTo(cx - r * 0.6, cy + r * 0.7);
      ctx.lineTo(cx + r * 0.6, cy - r * 0.7);
      ctx.stroke();
      break;
    case 'tools':
      ctx.roundRect(cx - r * 0.85, cy - r * 0.35, r * 1.2, r * 1.2, r * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + r * 0.35, cy - r * 0.3, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'fill':
      ctx.moveTo(cx - r * 0.7, cy + r * 0.1);
      ctx.lineTo(cx - r * 0.1, cy - r * 0.6);
      ctx.lineTo(cx + r * 0.5, cy);
      ctx.lineTo(cx - r * 0.1, cy + r * 0.7);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + r * 0.75, cy + r * 0.55, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'size':
      for (const [dy, w] of [[-0.45, 0.04], [0, 0.08], [0.45, 0.14]]) {
        ctx.beginPath();
        ctx.lineWidth = r * w * 2;
        ctx.moveTo(cx - r * 0.8, cy + r * dy);
        ctx.lineTo(cx + r * 0.8, cy + r * dy);
        ctx.stroke();
      }
      break;
    case 'color':
      ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    case 'layers':
      for (const dy of [-0.35, 0, 0.35]) {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.85, cy + r * dy);
        ctx.lineTo(cx, cy + r * (dy - 0.45));
        ctx.lineTo(cx + r * 0.85, cy + r * dy);
        ctx.lineTo(cx, cy + r * (dy + 0.45));
        ctx.closePath();
        ctx.stroke();
      }
      break;
  }
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

  face = section.font ? `"${section.font}", ${FONT}` : FONT;
  leading = section.leading ?? 1;
  const end = flowBody(ctx, section, W, u, pad, paint);
  face = FONT;
  leading = 1;
  return end;
}

function flowBody(ctx, section, W, u, pad, paint) {
  let y = pad * 1.1 * leading;

  ctx.font = `500 ${u * SCALE.eyebrow}px ${face}`;
  if (paint) {
    ctx.fillStyle = ACCENT;
    ctx.fillText(spaced(section.eyebrow.toUpperCase()), pad, y);
  }
  y += u * SCALE.eyebrow * 2.2 * leading;

  ctx.font = `600 ${u * SCALE.title}px ${face}`;
  if (paint) {
    ctx.fillStyle = INK;
    ctx.fillText(section.title, pad, y);
  }
  y += u * SCALE.title * 1.55 * leading;

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
    else if (block.kind === 'rows') y = rows(ctx, block.items, pad, y, W, u, paint);
    else if (block.kind === 'jots') y = jots(ctx, block.items, pad, y, W, u, paint);
    else if (block.kind === 'checklist') y = checklist(ctx, block.groups, pad, y, W, u, paint);
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
  ctx.font = `${lead ? 500 : 400} ${size}px ${face}`;

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

/**
 * Lines jotted by hand: each set a little off the margin and leaning its own way, and
 * the done ones crossed out with a stroke that wobbles the way a pen does. `indent` and
 * `slant` come with the line from `content.js`, so measure and paint agree.
 */
function jots(ctx, items, pad, top, W, u, paint) {
  const size = u * SCALE.lead_size * 1.2;
  const line = size * 1.22 * leading;
  ctx.font = `500 ${size}px ${face}`;

  let y = top;
  for (const item of items) {
    const x = pad + item.indent * size * 0.9;
    const lean = item.slant * 0.012;
    if (paint) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(lean);
      ctx.fillStyle = item.done ? INK_FAINT : INK;
      ctx.fillText(item.text, 0, 0);
      if (item.done) strike(ctx, ctx.measureText(item.text).width, size, item.slant);
      ctx.restore();
    }
    y += line;
  }
  return y + line * 0.3;
}

/**
 * Boxes on the pad, in the same hand as the jots: a small square drawn as one loose
 * pen stroke, a tick inside the done ones, and the group's word — "done", "next" — set
 * small above each run. The done lines are dimmed the way a struck jot is, but left
 * legible: they are the point.
 */
function checklist(ctx, groups, pad, top, W, u, paint) {
  const size = u * SCALE.lead_size * 1.15;
  const line = size * 1.3 * leading;
  const box = size * 0.72;
  const gap = size * 0.5;

  let y = top + line * 0.2;
  groups.forEach((group, g) => {
    ctx.font = `500 ${size * 0.8}px ${face}`;
    if (paint) {
      ctx.fillStyle = ACCENT;
      ctx.fillText(group.group, pad, y);
    }
    y += line * 0.85;

    ctx.font = `500 ${size}px ${face}`;
    const done = group.group === 'done';
    // Wrapped to the pad's width, the turned line hanging in under the first.
    const width = W - pad * 2 - box - gap;
    group.items.forEach((text, i) => {
      // A fixed seed per line, so the wobble holds still between paints.
      const seed = Math.sin((g + 1) * 7.3 + i * 3.1);
      const lines = wrap(ctx, text, width);
      if (paint) {
        ctx.save();
        ctx.translate(pad, y);
        ctx.rotate(seed * 0.01);
        penBox(ctx, 0, size * 0.18, box, seed, done);
        ctx.fillStyle = done ? INK_DIM : INK;
        lines.forEach((part, k) => ctx.fillText(part, box + gap, line * k * 0.9));
        ctx.restore();
      }
      y += line + line * 0.9 * (lines.length - 1);
    });
    y += line * 0.35;
  });
  return y;
}

/**
 * A square drawn by hand: four strokes that do not quite meet at the corners, and,
 * when `ticked`, a check drawn in two strokes that overshoots the box the way a pen
 * does when the thing is actually done.
 */
function penBox(ctx, x, y, s, seed, ticked) {
  const w = (k) => Math.sin(seed * 5 + k) * s * 0.06;
  ctx.strokeStyle = INK_DIM;
  ctx.lineWidth = Math.max(1.5, s * 0.075);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w(1), y + w(2));
  ctx.lineTo(x + s + w(3), y + w(4));
  ctx.lineTo(x + s + w(5), y + s + w(6));
  ctx.lineTo(x + w(7), y + s + w(8));
  ctx.lineTo(x + w(1), y + w(2) - s * 0.02);
  ctx.stroke();
  if (!ticked) return;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = Math.max(1.5, s * 0.1);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.2, y + s * 0.5 + w(9));
  ctx.lineTo(x + s * 0.45, y + s * 0.8 + w(10));
  ctx.lineTo(x + s * 1.15, y - s * 0.15 + w(11));
  ctx.stroke();
}

/**
 * A pen stroke through a line of text: starts a little before it, ends a little past,
 * and drifts up and down along the way. `seed` keeps the wobble the same between
 * frames — the page is painted more than once and the stroke must not crawl.
 */
function strike(ctx, width, size, seed) {
  const mid = size * 0.58;
  const from = -size * 0.15;
  const to = width + size * 0.2;
  const steps = 6;
  ctx.strokeStyle = INK_DIM;
  ctx.lineWidth = Math.max(1.5, size * 0.055);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from, mid + size * 0.04 * seed);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const wobble = Math.sin(t * Math.PI * 2.3 + seed * 3) * size * 0.05;
    ctx.lineTo(from + (to - from) * t, mid + wobble + size * 0.04 * seed * (1 - t));
  }
  ctx.stroke();
}

/**
 * A list of posts, one per hairline rule: the small line above — a date, or "Draft" —
 * and the title under it. The screen's answer to `rows` in `panels.js`.
 */
function rows(ctx, items, pad, top, W, u, paint) {
  const meta = u * SCALE.label;
  const title = u * SCALE.role;
  const line = title * 1.15 * leading;
  const width = W - pad * 2;

  let y = top;
  for (const item of items) {
    if (paint) {
      ctx.fillStyle = LINE;
      ctx.fillRect(pad, y, width, Math.max(1, u * 0.0015));
    }
    y += meta * 0.8 * leading;

    // The small line above the title — a date, "Draft" — only where the row has one.
    if (item.meta) {
      ctx.font = `500 ${meta}px ${face}`;
      if (paint) {
        ctx.fillStyle = ACCENT;
        ctx.fillText(spaced(item.meta.toUpperCase()), pad, y);
      }
      y += meta * 1.4 * leading;
    }

    ctx.font = `500 ${title}px ${face}`;
    for (const text of wrap(ctx, item.title, width)) {
      if (paint) {
        ctx.fillStyle = INK;
        ctx.fillText(text, pad, y);
      }
      y += line;
    }
    y += meta * 0.8 * leading;
  }
  return y + meta;
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

    ctx.font = `500 ${u * SCALE.label}px ${face}`;
    ctx.fillStyle = INK_FAINT;
    ctx.fillText(spaced(cells[i].label.toUpperCase()), x + pad * 0.7, y + height * 0.26);

    ctx.font = `400 ${u * SCALE.value}px ${face}`;
    ctx.fillStyle = cells[i].accent ? ACCENT : INK;
    ctx.fillText(cells[i].value, x + pad * 0.7, y + height * 0.55);
  }

  return top + Math.ceil(cells.length / 2) * height + u * 0.05;
}

/**
 * A pane of Apple's liquid glass, as a canvas can fake it: a frosted fill that is a
 * touch lighter along the top, a soft drop shadow lifting it off the ground, a hairline
 * rim brighter where the light lands and dimmer underneath, and a thin specular along
 * the inside of the top edge. Everything on the stack page — the cards and every chip
 * in them — is set in the same pane, so no two of them read as different materials.
 * Exported for the Shortcuts window (`stackApp.js`), whose tiles are the same glass.
 */
export function glass(ctx, x, y, w, h, radius, u) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);

  // The lift.
  ctx.shadowColor = 'rgba(0, 0, 0, .35)';
  ctx.shadowBlur = u * 0.02;
  ctx.shadowOffsetY = u * 0.006;
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, 'rgba(255, 255, 255, .11)');
  fill.addColorStop(1, 'rgba(255, 255, 255, .05)');
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // The rim.
  const rim = ctx.createLinearGradient(0, y, 0, y + h);
  rim.addColorStop(0, 'rgba(255, 255, 255, .38)');
  rim.addColorStop(0.5, 'rgba(255, 255, 255, .12)');
  rim.addColorStop(1, 'rgba(255, 255, 255, .06)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(1, u * 0.0016);
  ctx.stroke();

  // The specular: clipped to the pane, a brighter line just inside the top edge that
  // fades out before the corners.
  ctx.clip();
  const shine = ctx.createLinearGradient(x, 0, x + w, 0);
  shine.addColorStop(0, 'rgba(255, 255, 255, 0)');
  shine.addColorStop(0.25, 'rgba(255, 255, 255, .45)');
  shine.addColorStop(0.75, 'rgba(255, 255, 255, .45)');
  shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = shine;
  ctx.fillRect(x + radius * 0.6, y + ctx.lineWidth, w - radius * 1.2, Math.max(1, u * 0.0012));
  ctx.restore();
}

/**
 * The stack, as a grid of cards: two to a row, each a hairline cell like `stats()`
 * draws, with an accent tick, the tracked-out group title, the group's `note` under it
 * and its tags wrapped as chips inside. The two cells of a row share the taller height;
 * a narrow viewport stacks them one per row.
 *
 * Laid out in the same pass that paints it, so a chip cannot be measured onto one row
 * and drawn on another — the page's height decides how far the screen scrolls. Each
 * card is measured with a silent pass through `chips()` before its row is painted, so
 * the pair's height is known before either is drawn.
 */
function skills(ctx, groups, pad, top, W, u, paint) {
  const columns = NARROW.matches ? 1 : 2;
  const gap = u * 0.045;
  const width = (W - pad * 2 - gap * (columns - 1)) / columns;
  const inset = u * 0.05;
  // The card's heading is set larger than the sidebar's group labels and in full
  // ink: it is the one line on the lid that names what the chips under it are.
  const title = u * SCALE.group * 1.5;
  const note = u * SCALE.label * 1.2;

  // Where the card's body goes and how tall it comes out, without drawing anything.
  const card = (group, x, y, draw) => {
    let cursor = y + inset + title * 1.1;
    // The group's own mark, in the accent, ahead of its title; the title steps aside
    // for it whether or not the file has landed, like a chip's slot.
    const mark = group.icon ? loadIcon(group.icon, ACCENT) : null;
    const markSize = title * 1.9;
    const lead = mark ? markSize + title * 0.6 : 0;
    ctx.font = `500 ${title}px ${face}`;
    if (draw) {
      if (mark?.image) {
        ctx.imageSmoothingQuality = 'high';
        const { x: cx, y: cy, w, h } = mark.crop;
        const fit = markSize / Math.max(w, h);
        const dw = w * fit;
        const dh = h * fit;
        ctx.drawImage(
          mark.image, cx, cy, w, h,
          x + inset + (markSize - dw) / 2, cursor + title * 0.5 - dh / 2, dw, dh
        );
      }
      ctx.fillStyle = INK;
      ctx.fillText(spaced(group.title.toUpperCase()), x + inset + lead, cursor);
    }
    cursor += title * 1.8;
    if (group.note) {
      ctx.font = `400 ${note}px ${face}`;
      if (draw) {
        ctx.fillStyle = INK_DIM;
        ctx.fillText(group.note, x + inset, cursor);
      }
      cursor += note * 2.1;
    } else {
      cursor += title * 0.7;
    }
    cursor = chips(ctx, group.tags, x + inset, cursor, x + width - inset, u, draw);
    return cursor + inset - y;
  };

  let y = top;
  for (let i = 0; i < groups.length; i += columns) {
    const row = groups.slice(i, i + columns);
    const heights = row.map((group, j) => card(group, pad + j * (width + gap), y, false));
    const height = Math.max(...heights);

    for (let j = 0; j < row.length; j++) {
      const x = pad + j * (width + gap);
      if (!paint) continue;
      glass(ctx, x, y, width, height, u * 0.022, u);
      card(row[j], x, y, true);
    }
    y += height + gap;
  }

  return y - gap + u * 0.045;
}

/**
 * A row of tags as rounded chips of glass, wrapped to `right`. Shared by the stack and
 * by the roles in the timeline, which name theirs the same way. Every chip is the same
 * pane — see `glass()` — whatever it says or carries.
 */
function chips(ctx, tags, left, top, right, u, paint) {
  const size = u * SCALE.chip;
  const height = size * 2.2;
  const gap = size * 0.65;
  const inset = size * 0.95;
  // The glyph's square, and the breath between it and the word.
  const glyph = size * 1.4;
  const after = size * 0.45;

  ctx.font = `400 ${size}px ${face}`;
  let x = left;
  let y = top;
  for (const tag of tags) {
    const label = tag.name ?? tag;
    // The slot is reserved whether or not the file has landed, so the row a chip sits
    // on does not change when the repaint brings the glyph in.
    const icon = tag.icon ? loadIcon(tag.icon, INK) : null;
    const lead = icon ? glyph + after : 0;
    const width = ctx.measureText(label).width + inset * 2 + lead;
    // A chip that would run past the right edge starts the next row instead; one wider
    // than the column on its own is left to overhang rather than loop.
    if (x > left && x + width > right) {
      x = left;
      y += height + gap;
    }
    if (paint) {
      glass(ctx, x, y, width, height, height / 2, u);

      if (icon?.image) {
        ctx.imageSmoothingQuality = 'high';
        // The glyph's own box, fitted inside the slot and centred — so a wide mark and
        // a tall one read the same size, whatever margin the file left round them.
        const { x: cx, y: cy, w, h } = icon.crop;
        const fit = glyph / Math.max(w, h);
        const dw = w * fit;
        const dh = h * fit;
        ctx.drawImage(
          icon.image, cx, cy, w, h,
          x + inset + (glyph - dw) / 2, y + (height - dh) / 2, dw, dh
        );
      }
      ctx.fillStyle = INK;
      ctx.fillText(label, x + inset + lead, y + height * 0.28);
    }
    x += width + gap;
  }
  return y + height;
}

/** A second title partway down a page — where one section is really two. */
function heading(ctx, text, pad, top, u, paint) {
  ctx.font = `600 ${u * SCALE.heading}px ${face}`;
  if (paint) {
    ctx.fillStyle = INK;
    ctx.fillText(text, pad, top);
  }
  return top + u * SCALE.heading * 1.7 * leading;
}

/**
 * The dates of a role as a small rounded badge tinted with the accent — read at a
 * glance, where the spaced faint caps it used to be were the first thing lost on the
 * display. Returns its bottom.
 */
function dateBadge(ctx, text, left, top, u, paint) {
  const size = u * SCALE.text * 0.85;
  const height = size * 1.9;
  const inset = size * 0.8;
  ctx.font = `500 ${size}px ${face}`;
  const width = ctx.measureText(text).width + inset * 2;
  if (paint) {
    ctx.beginPath();
    ctx.roundRect(left, top, width, height, height / 2);
    ctx.fillStyle = ACCENT_TINT;
    ctx.fill();
    ctx.strokeStyle = ACCENT_LINE;
    ctx.lineWidth = Math.max(1, u * 0.0014);
    ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.fillText(text, left + inset, top + height * 0.27);
  }
  return top + height;
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

    y = dateBadge(ctx, item.date, left, y, u, paint) + u * 0.03;

    // The product first and in full ink — it is what a reader scans the column for —
    // and the role held there under it.
    ctx.font = `600 ${u * SCALE.role}px ${face}`;
    if (paint) {
      ctx.fillStyle = INK;
      ctx.fillText(item.org ?? item.role, left, y);
    }
    y += u * SCALE.role * 1.5;

    if (item.org) {
      ctx.font = `500 ${u * SCALE.text}px ${face}`;
      if (paint) {
        ctx.fillStyle = INK_DIM;
        ctx.fillText(item.role, left, y);
      }
      y += u * SCALE.text * 1.9;
    }

    // What the product was, for a role whose bullets are all measurements — a reader
    // otherwise learns the system got faster without ever learning what it did.
    if (item.desc) {
      const size = u * SCALE.text;
      const line = size * SCALE.lead;
      ctx.font = `400 ${size}px ${face}`;
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
  ctx.font = `400 ${size}px ${face}`;

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
    y += line * lines.length + line * 0.1;
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

  if (item.meta) y = dateBadge(ctx, item.meta, left, y, u, paint) + u * 0.03;

  ctx.font = `600 ${u * SCALE.heading * 0.8}px ${face}`;
  if (paint) {
    ctx.fillStyle = INK;
    ctx.fillText(item.title, left, y);
  }
  y += u * SCALE.heading * 0.8 * 1.5;

  if (item.tags?.length) y = chips(ctx, item.tags, left, y, left + width, u, paint) + u * 0.025;

  if (item.desc) {
    const size = u * SCALE.text;
    const line = size * SCALE.lead;
    ctx.font = `400 ${size}px ${face}`;
    const lines = wrap(ctx, item.desc, width);
    if (paint) {
      ctx.fillStyle = INK_DIM;
      lines.forEach((text, i) => ctx.fillText(text, left, y + line * i));
    }
    y += line * lines.length;
  }

  // What it does, as the roles list what came of them — under the description, with
  // a breath between, so the card reads hook first and features second.
  if (item.points?.length) {
    y += u * SCALE.text * 0.6;
    y = bullets(ctx, item.points, left, y, width, u, paint) - u * SCALE.text * SCALE.lead * 0.4;
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
