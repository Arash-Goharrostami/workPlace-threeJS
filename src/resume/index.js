import { buildAnchors, SECTION_ORDER } from './anchors.js';
import { setupFlight, FLIGHT_MS } from './flight.js';
import { setupPicking } from './picking.js';
import { setupOutlines } from './outline.js';
import { setupPanels } from './panels.js';
import { setupScreens } from './screen.js';
import { setupWallFrames } from './wallFrameFocus.js';
import { setupPhoneApps } from './phoneApps.js';
import { setupSheetPrompt } from './sheetPrompt.js';
import { PROFILE, SECTIONS } from './content.js';

/**
 * Résumé mode: the room read as a CV.
 *
 * Nine props stand in for the nine sections (see `anchors.js`). Hovering one lifts it
 * out of the room and names it in the HUD; clicking it — or a dock button — flies the
 * camera to it and slides the section in beside it. Escape or the back button returns
 * to the full room.
 *
 * Nothing is drawn over the props themselves. The room is the interface: a prop that
 * can be read is rimmed with light when the pointer is on it, which is the whole of the
 * affordance, and the one being read keeps that rim while its panel is open.
 *
 * This module owns only the sequencing between those parts. Each of them is
 * independent and knows nothing about the others:
 *
 *   anchors  → which prop is which section, and how to look at it
 *   flight   → moving the camera there and back
 *   picking  → hover and click on the props themselves
 *   outline  → the rim of light that says a prop is readable
 *   panels   → the sidebar's markup and its open/close wiring
 *   screen   → the sections that are read off their own prop instead
 *   frames   → the section that is read as pictures on a wall
 *   phone    → the section whose prop's own app icons are the links
 */

/**
 * Whether a section is read in the sidebar at all. Two kinds are not: one painted onto
 * a prop's own screen, and one that *is* a prop — the wall frames, whose pictures are the
 * content, and the iPhone, whose app icons are. Both fill the viewport instead of sharing
 * it with a panel.
 */
const hasPanel = (section) => Boolean(section) && !section.screen && !section.onProp;

/**
 * Canvas pixels scrolled per wheel unit. The page is laid out at 1600 px down, so this
 * is about a fifth of a panel per notch — a read, not a jump.
 */
const SCROLL_RATE = 1.6;

/** Matches the breakpoint where `index.html` turns the sidebar into a bottom sheet. */
const SHEET = window.matchMedia('(max-width: 760px)');

export function setupResume({ scene, camera, renderer, controls, model }) {
  const canvas = renderer.domElement;
  const anchors = buildAnchors(model, camera);
  if (!Object.keys(anchors).length) {
    console.warn('[resume] no props resolved — leaving the room as a plain viewer');
    return { update() {} };
  }

  const introEl = document.getElementById('intro');
  const dockEl = document.getElementById('dock');
  const backEl = document.getElementById('back');
  const hudEl = document.getElementById('hud-view');
  const hintEl = document.getElementById('hint');

  // Only the sections whose prop actually made it into the scene get a panel or a
  // dock button — an anchor `buildAnchors` dropped has nothing to fly to.
  const live = SECTION_ORDER.filter((key) => anchors[key]);

  const panels = setupPanels({
    order: live,
    container: document.getElementById('panels'),
    onOpen: (key) => open(key),
    onClose: () => open(null),
  });

  buildDock(dockEl, live, anchors);

  const flight = setupFlight({ camera, controls, canvas });
  const outlines = setupOutlines(model);
  const screens = setupScreens();
  // A section read on its prop rather than beside it, of which there are two kinds: the
  // wall frames, a group of pictures each of which can be looked at on its own, and the
  // iPhone, whose app icons are links. Both answer `hover` and `reset` and both are
  // handed a click, so `index.js` holds them in one map and only the click parts differ.
  // Built off the section's own `propMode` rather than for `education` by name, so the
  // wiring stays about the flag and not about which prop happens to carry it.
  const onProp = {};
  for (const key of live) {
    const mode = SECTIONS[key]?.onProp && SECTIONS[key].propMode;
    if (mode === 'frames') {
      onProp[key] = setupWallFrames({ group: anchors[key].object, model, camera, outlines });
    } else if (mode === 'apps') {
      onProp[key] = setupPhoneApps({ group: anchors[key].object });
    } else if (mode === 'sheet') {
      onProp[key] = setupSheetPrompt({ group: anchors[key].object });
    } else if (SECTIONS[key]?.onProp) {
      console.warn(`[resume] section "${key}" is read on its prop but names no propMode`);
    }
  }
  // Painted once and left there. A display in a workroom is not blank, and a section
  // that lives on its own screen should be readable from across the room — walking up
  // to it is what opening the section does, not what makes the text appear.
  for (const key of live) {
    if (SECTIONS[key]?.screen) screens.paint(anchors[key].object, SECTIONS[key]);
  }

  const picking = setupPicking({
    anchors,
    camera,
    canvas,
    outlines,
    onOpen: (key) => open(key),
    // Click off the prop being read and the room comes back — the counterpart of the
    // back button, for anyone who never looks at the chrome.
    // …except while a single print is being read: that click steps back out to the whole
    // composition first, so the way out of a frame is the same click that got into it.
    onDismiss: () => (focused ? focusFrame(openKey, null) : open(null)),
    // With no label on the prop, the HUD is what says which one is under the pointer.
    // A section drawn as a window — the Notes app on the main display — takes its own
    // clicks and hovers while it is being read. Both return whether the window used
    // the event, which is what tells `picking.js` to stop there. The phone's icons are
    // the same bargain, and the only one of the three that does not move the camera: an
    // icon opens its link and leaves the room where it is, and a click that misses every
    // icon is nobody's.
    onScreenClick: (key, hit) => {
      const prop = onProp[key];
      if (!prop) return screens.click(anchors[key].object, hit.uv);
      if (!prop.open) return focusFrame(key, hit);
      // The hit itself, not just the mesh: a tap on the phone's progress or volume bar
      // is a *position* along it, which only the intersection can say.
      const view = prop.open(hit.object, hit);
      if (view && hudEl) hudEl.textContent = view;
      return Boolean(view);
    },
    onScreenHover: (key, hit) => {
      if (!key) return false;
      // A wall of pictures hovers per print, a phone per app icon; a screen hovers per
      // row of its window.
      if (onProp[key]) return onProp[key].hover(hit?.object ?? null);
      return screens.hover(anchors[key].object, hit?.uv ?? null);
    },
    onHover: (key) => {
      if (hudEl && !openKey) hudEl.textContent = key ? anchors[key].label : 'View — full room';
    },
  });

  let openKey = null;
  let revealTimer = 0;
  /** The single print being read inside an `onProp` section, if the camera is down on one. */
  let focused = null;

  /**
   * Flies to one print of a `onProp` section, or back out to the whole composition.
   *
   * Called for every click that lands while such a section is open: a print that is not
   * the one already focused is flown to, and anything else — the frame around it, the
   * wall, a second click on the print itself — steps back out. Returns true either way,
   * which is what tells `picking.js` the click was used and the section should stay open.
   */
  function focusFrame(key, hit) {
    const next = hit && !focused ? onProp[key]?.anchorFor(hit.object) : null;
    focused = next;
    const view = flight.to(next ?? anchors[key], 0);
    if (hudEl) hudEl.textContent = view;
    return true;
  }

  function open(key) {
    const next = panels.show(key);
    openKey = next;
    clearTimeout(revealTimer);
    // A section is opened on the whole of its prop, never on the print left focused the
    // last time it was read.
    focused = null;
    for (const group of Object.values(onProp)) group.reset();

    // Measured before the flight, not after: the lens shift that keeps the prop clear
    // of the sidebar has to be sized from a width the panel has not taken yet. On a
    // narrow screen the panel is a bottom sheet spanning the full width, so there is
    // no free half to shift the prop into — pass no width and the lens stays centred.
    const width = next && !SHEET.matches ? panels.widthOf(next) : 0;
    const view = flight.to(next ? anchors[next] : null, width);
    if (hudEl) hudEl.textContent = view;

    toggle(introEl, !next);
    toggle(dockEl, !next);
    // An explicit value, not '': the stylesheet's own rule is `display: none`, so
    // clearing the inline style would leave the button hidden.
    if (backEl) backEl.style.display = next ? 'block' : 'none';
    if (hintEl) hintEl.style.opacity = next ? '0' : '';
    picking.setEnabled(!next);
    picking.setReading(next);
    // Back to a level lens: the drift belongs to whatever is open now, not to the
    // pointer's last position over what was.
    flight.setDrift(0, 0);
    // A section is opened at its beginning, not where it was last left.
    if (next && SECTIONS[next]?.screen) screens.rewind(anchors[next].object);
    // Held rather than hovered: the pointer is off in the panel by now, and the prop
    // being read is the one thing on screen that should still be lit. A section shown
    // on its own screen is the exception — it is already the brightest thing in the
    // room, and a rim around it only fences off what you are trying to read.
    outlines.hold(next && hasPanel(SECTIONS[next]) ? anchors[next].object : null);

    // Halfway through the flight, so the panel arrives with the camera rather than
    // ahead of it. A section read off its own screen has nothing to reveal — its text
    // has been on the display all along.
    if (next && hasPanel(SECTIONS[next])) {
      revealTimer = setTimeout(() => panels.reveal(next), FLIGHT_MS * 0.5);
    }
  }

  /** Run once a frame from the render loop, before `renderer.render`. */
  const update = () => {
    flight.update();
    picking.update();
  };

  // The view drifts a little with the pointer while a section is open, so a screen
  // being read is not a still image. Fed as a fraction of the viewport; `flight.js`
  // turns it into a lens shift rather than moving the camera.
  canvas.addEventListener('pointermove', (event) => {
    if (!openKey) return;
    const rect = canvas.getBoundingClientRect();
    flight.setDrift(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      ((event.clientY - rect.top) / rect.height) * 2 - 1
    );
  });
  canvas.addEventListener('pointerleave', () => flight.setDrift(0, 0));

  // The wheel reads the page only where the page is: pointer on the screen being
  // read, and it scrolls; anywhere else it belongs to the camera, so a section can
  // be backed away from without closing it. Captured so it runs before
  // `OrbitControls`, which is on the same canvas and would otherwise dolly on the
  // same turn.
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (!openKey || !SECTIONS[openKey]?.screen) return;
      // Null off the prop being read — `picking.update()` recasts once a frame and
      // only reports a UV for that one screen.
      if (!picking.screenUv) return;
      // The pointer picks the column: the list on the left, the note on the right.
      const moved = screens.scroll(
        anchors[openKey].object, event.deltaY * SCROLL_RATE, picking.screenUv
      );
      if (!moved) return;
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true, passive: false }
  );

  const onResize = () => {
    flight.applyOffset();
  };
  window.addEventListener('resize', onResize);

  document.title = `${PROFILE.name} — ${PROFILE.role}`;

  return { update, open, get openKey() { return openKey; } };
}

/** Fades a bit of chrome out without collapsing the layout the labels dodge around. */
function toggle(element, visible) {
  if (!element) return;
  element.style.opacity = visible ? '1' : '0';
  element.style.pointerEvents = visible ? 'auto' : 'none';
}

/** The always-available list of sections, for anyone who would rather not hunt props. */
function buildDock(dock, keys, anchors) {
  if (!dock) return;
  for (const key of keys) {
    const button = document.createElement('button');
    button.className = 'nav-btn';
    button.setAttribute('data-open', key);
    button.textContent = anchors[key].label;
    dock.appendChild(button);
  }
}
