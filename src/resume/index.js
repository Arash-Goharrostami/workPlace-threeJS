import { buildAnchors, SECTION_ORDER } from './anchors.js';
import { setupFlight, FLIGHT_MS } from './flight.js';
import { setupPicking } from './picking.js';
import { setupPanels } from './panels.js';
import { PROFILE } from './content.js';

/**
 * Résumé mode: the room read as a CV.
 *
 * Nine props stand in for the nine sections (see `anchors.js`). Hovering one lifts it
 * out of the room and names it in the HUD; clicking it — or a dock button — flies the
 * camera to it and slides the section in beside it. Escape or the back button returns
 * to the full room.
 *
 * Nothing is drawn over the props themselves. The room is the interface: a prop that
 * can be read glows when the pointer is on it, which is the whole of the affordance.
 *
 * This module owns only the sequencing between those parts. Each of them is
 * independent and knows nothing about the others:
 *
 *   anchors  → which prop is which section, and how to look at it
 *   flight   → moving the camera there and back
 *   picking  → hover and click on the props themselves
 *   panels   → the sidebar's markup and its open/close wiring
 */

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
  const picking = setupPicking({
    anchors,
    camera,
    canvas,
    onOpen: (key) => open(key),
    // With no label on the prop, the HUD is what says which one is under the pointer.
    onHover: (key) => {
      if (hudEl && !openKey) hudEl.textContent = key ? anchors[key].label : 'View — full room';
    },
  });

  let openKey = null;
  let revealTimer = 0;

  function open(key) {
    const next = panels.show(key);
    openKey = next;
    clearTimeout(revealTimer);

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

    // Halfway through the flight, so the panel arrives with the camera rather than
    // ahead of it.
    if (next) revealTimer = setTimeout(() => panels.reveal(next), FLIGHT_MS * 0.5);
  }

  /** Run once a frame from the render loop, before `renderer.render`. */
  const update = () => {
    flight.update();
    picking.update();
  };

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
