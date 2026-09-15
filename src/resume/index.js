import { buildAnchors, reframeAnchors, SECTION_ORDER } from './anchors.js';
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

/** …and a finger's, in canvas pixels per screen pixel dragged; past `TOUCH_SLOP` it is a scroll. */
const TOUCH_RATE = 2.4;
const TOUCH_SLOP = 6;

/** Matches the breakpoint where `index.html` turns the sidebar into a bottom sheet. */
const SHEET = window.matchMedia('(max-width: 760px)');

export function setupResume({ scene, camera, renderer, controls, model, onSound, onFocus }) {
  const canvas = renderer.domElement;
  const anchors = buildAnchors(model, camera);
  if (!Object.keys(anchors).length) {
    console.warn('[resume] no props resolved — leaving the room as a plain viewer');
    return { update() {}, intro() {}, isFlying: () => false };
  }

  const introEl = document.getElementById('intro');
  // The watch beside the phone: it wakes with the time whenever Contact opens.
  const watchFace = model.getObjectByName('Apple_Watch_SE')?.userData.face ?? null;
  const dockEl = document.getElementById('dock');
  // The phone's way out of a section (see `#back-btn` in index.html): the same step
  // back a tap off the prop takes, so the two can never disagree.
  const backBtn = document.getElementById('back-btn');
  backBtn.innerHTML = ICONS.back;
  backBtn.addEventListener('click', () => dismiss());

  // Only the sections whose prop actually made it into the scene get a panel or a
  // dock button — an anchor `buildAnchors` dropped has nothing to fly to.
  const live = SECTION_ORDER.filter((key) => anchors[key]);

  const panels = setupPanels({
    order: live,
    container: document.getElementById('panels'),
    onOpen: (key) => open(key),
    onClose: () => open(null),
  });

  buildDock(dockEl, live, anchors, onSound);

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
    // Clickable on its own, so a click on it is not a click on nothing.
    swallow: [model.getObjectByName('Guitar_on_stand')].filter(Boolean),
    onOpen: (key) => open(key),
    // With nothing open, a click on empty room flies back to the overview — the way
    // home after orbiting or zooming away — and, from the overview itself, up to the
    // wide shot of the room; the next one comes back down. Not mid-flight: a click
    // during the opening trip would restart it.
    onMiss: () => {
      if (openKey || flight.flying) return;
      if (flight.atOverview) flight.toWide();
      else flight.to(null, 0);
    },
    // Click off the prop being read and the room comes back — the counterpart of the
    // back button, for anyone who never looks at the chrome.
    // …except while a single print is being read: that click steps back out to the whole
    // composition first, so the way out of a frame is the same click that got into it.
    onDismiss: () => dismiss(),
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
      return Boolean(prop.open(hit.object, hit));
    },
    onScreenHover: (key, hit) => {
      if (!key) return false;
      // A wall of pictures hovers per print, a phone per app icon; a screen hovers per
      // row of its window.
      if (onProp[key]) return onProp[key].hover(hit?.object ?? null);
      return screens.hover(anchors[key].object, hit?.uv ?? null);
    },
  });

  let openKey = null;
  let revealTimer = 0;

  /**
   * Steps back out of whatever is being read: a single focused print to its whole
   * composition first, otherwise the section to the room. Shared by the tap off the
   * prop and the phone's back button.
   */
  function dismiss() {
    if (focused) focusFrame(openKey, null);
    else open(null);
  }
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
    flight.to(next ?? anchors[key], 0);
    return true;
  }

  function open(key) {
    const next = panels.show(key);
    // The window being left goes back to full-screen; the one being opened shrinks to
    // its phone layout on a narrow screen — the moment it is read, not before.
    if (openKey && SECTIONS[openKey]?.screen) screens.setCompact(anchors[openKey].object, false);
    if (next && SECTIONS[next]?.screen) screens.setCompact(anchors[next].object, SHEET.matches);
    openKey = next;
    // Told on every open and close, so whatever listens (the printer's sound, in
    // `main.js`) knows whether the camera is down on a prop or back in the room.
    onFocus?.(Boolean(next));
    clearTimeout(revealTimer);
    if (next === 'contact') watchFace?.wake();
    // A section is opened on the whole of its prop, never on the print left focused the
    // last time it was read.
    focused = null;
    for (const group of Object.values(onProp)) group.reset();

    // Measured before the flight, not after: the lens shift that keeps the prop clear
    // of the sidebar has to be sized from a width the panel has not taken yet. On a
    // narrow screen the panel is a bottom sheet spanning the full width, so there is
    // no free half to shift the prop into — pass no width and the lens stays centred.
    const width = next && !SHEET.matches ? panels.widthOf(next) : 0;
    flight.to(next ? anchors[next] : null, width);

    toggle(introEl, !next);
    toggle(dockEl, !next);
    // Only ever displayed on a phone — the stylesheet keeps it off a desktop.
    backBtn.hidden = !next;
    closeMenu();
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

  // The view drifts with the pointer — browsing the room or reading a section — so the
  // scene is never a still image. Fed as a fraction of the viewport; `flight.js` turns
  // it into a lens shift rather than moving the camera.
  canvas.addEventListener('pointermove', (event) => {
    // A mouse only: a finger on the screen is scrolling or orbiting, not leaning.
    if (event.pointerType === 'touch') return;
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

  // The anchors were fitted at load, to that viewport's shape; crossing the breakpoint
  // is when the shape — and, for the Notes window, what is framed — actually changes.
  SHEET.addEventListener('change', () => reframeAnchors(anchors, model, camera));

  // A finger reads the page: dragging on the open screen scrolls it, where a mouse has
  // the wheel. Once the drag is a scroll the orbit is switched off for the rest of the
  // gesture — `OrbitControls` reads `enabled` per move — so the room does not turn
  // under the page. A drag that starts off the screen is the camera's, as ever.
  let touch = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || !openKey || !SECTIONS[openKey]?.screen) return;
    touch = { y: event.clientY, scrolling: false };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!touch || event.pointerType !== 'touch') return;
    // Whether the finger is on the screen is only known a frame after it lands —
    // `picking.update()` casts once a frame — so it is asked here, not on the press.
    if (!touch.scrolling && !picking.screenUv) return;
    const dy = touch.y - event.clientY;
    if (!touch.scrolling && Math.abs(dy) < TOUCH_SLOP) return;
    touch.y = event.clientY;
    const moved = screens.scroll(anchors[openKey].object, dy * TOUCH_RATE, picking.screenUv);
    if (moved && !touch.scrolling) {
      touch.scrolling = true;
      controls.enabled = false;
    }
  });
  const endTouch = () => {
    if (touch?.scrolling) controls.enabled = true;
    touch = null;
  };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  document.title = `${PROFILE.name} — ${PROFILE.role}`;

  /**
   * The opening flight, from the wide view the room loaded at down to the desk — which
   * is the view "back" returns to from then on.
   */
  function intro({ position, target }) {
    flight.fly(position, target, 'View — desk');
  }

  /** Whether the camera is flying or the lean is still settling — `main.js` keeps the
   *  full frame rate up while it is. */
  const isFlying = () => flight.moving;

  return { update, open, intro, isFlying, get openKey() { return openKey; } };
}

/** Fades a bit of chrome out without collapsing the layout the labels dodge around. */
function toggle(element, visible) {
  if (!element) return;
  element.style.opacity = visible ? '1' : '0';
  element.style.pointerEvents = visible ? 'auto' : 'none';
}

/** The always-available list of sections, for anyone who would rather not hunt props. */
/**
 * The dock's and the menu's glyphs, as the path data of the SVGs in `public/icons/`
 * (SVG Repo, CC0) — inlined so they take the button's ink and cost no request.
 */
const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 18.75C10.9015 18.7505 10.8038 18.7313 10.7128 18.6935C10.6218 18.6557 10.5393 18.6001 10.47 18.53L4.47001 12.53C4.32956 12.3894 4.25067 12.1988 4.25067 12C4.25067 11.8013 4.32956 11.6107 4.47001 11.47L10.47 5.47003C10.6122 5.33755 10.8002 5.26543 10.9945 5.26885C11.1888 5.27228 11.3742 5.35099 11.5116 5.48841C11.649 5.62582 11.7278 5.81121 11.7312 6.00551C11.7346 6.19981 11.6625 6.38785 11.53 6.53003L6.06001 12L11.53 17.47C11.6705 17.6107 11.7494 17.8013 11.7494 18C11.7494 18.1988 11.6705 18.3894 11.53 18.53C11.4608 18.6001 11.3782 18.6557 11.2872 18.6935C11.1962 18.7313 11.0986 18.7505 11 18.75Z"/><path d="M19 12.75H5C4.80109 12.75 4.61032 12.671 4.46967 12.5303C4.32902 12.3897 4.25 12.1989 4.25 12C4.25 11.8011 4.32902 11.6103 4.46967 11.4697C4.61032 11.329 4.80109 11.25 5 11.25H19C19.1989 11.25 19.3897 11.329 19.5303 11.4697C19.671 11.6103 19.75 11.8011 19.75 12C19.75 12.1989 19.671 12.3897 19.5303 12.5303C19.3897 12.671 19.1989 12.75 19 12.75Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 18.75C7.88537 18.7486 7.77256 18.7212 7.67 18.67C7.54453 18.6086 7.43873 18.5133 7.36453 18.3949C7.29032 18.2765 7.25065 18.1397 7.25 18V6.00003C7.25065 5.86031 7.29032 5.72356 7.36453 5.60518C7.43873 5.4868 7.54453 5.3915 7.67 5.33003C7.79355 5.26757 7.93214 5.24102 8.07002 5.25339C8.2079 5.26576 8.33955 5.31657 8.45 5.40003L16.45 11.4C16.5431 11.4699 16.6187 11.5605 16.6708 11.6646C16.7229 11.7688 16.75 11.8836 16.75 12C16.75 12.1165 16.7229 12.2313 16.6708 12.3354C16.6187 12.4396 16.5431 12.5302 16.45 12.6L8.45 18.6C8.32052 18.6981 8.1624 18.7508 8 18.75ZM8.75 7.50003V16.5L14.75 12L8.75 7.50003Z"/></svg>',
  volumeUp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 19.75C12.8304 19.7472 12.6661 19.6912 12.53 19.59L7.74 15.75H3C2.80189 15.7474 2.61263 15.6676 2.47253 15.5275C2.33244 15.3874 2.25259 15.1981 2.25 15V9C2.25259 8.80189 2.33244 8.61263 2.47253 8.47253C2.61263 8.33244 2.80189 8.25259 3 8.25H7.74L12.53 4.41C12.6406 4.32106 12.7741 4.26533 12.9151 4.24927C13.0561 4.2332 13.1988 4.25747 13.3265 4.31926C13.4543 4.38104 13.5619 4.4778 13.6369 4.5983C13.7118 4.7188 13.751 4.85809 13.75 5V19C13.7491 19.1422 13.7084 19.2814 13.6324 19.4016C13.5563 19.5218 13.4481 19.6182 13.32 19.68C13.2202 19.728 13.1107 19.7519 13 19.75ZM3.75 14.25H8C8.16991 14.2507 8.33494 14.3069 8.47 14.41L12.25 17.41V6.56L8.47 9.56C8.33886 9.6739 8.17345 9.74076 8 9.75H3.75V14.25Z"/><path d="M18.46 18.07C18.2806 18.0697 18.107 18.006 17.97 17.89C17.8945 17.8258 17.8327 17.7472 17.7881 17.6587C17.7436 17.5702 17.7173 17.4736 17.7107 17.3748C17.7042 17.2759 17.7176 17.1768 17.7501 17.0832C17.7826 16.9896 17.8336 16.9035 17.9 16.83C19.0891 15.5022 19.7466 13.7824 19.7466 12C19.7466 10.2176 19.0891 8.49779 17.9 7.16998C17.8344 7.09644 17.7838 7.01069 17.7513 6.91762C17.7188 6.82455 17.7049 6.72599 17.7105 6.62756C17.7161 6.52913 17.741 6.43276 17.7838 6.34395C17.8266 6.25515 17.8865 6.17564 17.96 6.10998C18.0336 6.04432 18.1193 5.99379 18.2124 5.96127C18.3054 5.92875 18.404 5.91488 18.5024 5.92045C18.6009 5.92602 18.6972 5.95093 18.786 5.99374C18.8749 6.03656 18.9544 6.09644 19.02 6.16998C20.4578 7.76752 21.2534 9.84072 21.2534 11.99C21.2534 14.1392 20.4578 16.2124 19.02 17.81C18.9518 17.8921 18.8662 17.9581 18.7693 18.0031C18.6724 18.048 18.5668 18.0709 18.46 18.07Z"/><path d="M16.11 15.38C15.9481 15.3779 15.7908 15.3255 15.66 15.23C15.5009 15.1107 15.3957 14.933 15.3675 14.7361C15.3394 14.5392 15.3906 14.3391 15.51 14.18C15.9869 13.5533 16.2451 12.7875 16.2451 12C16.2451 11.2125 15.9869 10.4467 15.51 9.82C15.3906 9.66087 15.3394 9.46085 15.3675 9.26393C15.3957 9.06702 15.5009 8.88935 15.66 8.77C15.8191 8.65065 16.0191 8.59941 16.2161 8.62754C16.413 8.65567 16.5906 8.76087 16.71 8.92C17.3863 9.80433 17.7528 10.8867 17.7528 12C17.7528 13.1133 17.3863 14.1957 16.71 15.08C16.6391 15.172 16.5483 15.2468 16.4444 15.2988C16.3405 15.3507 16.2262 15.3785 16.11 15.38Z"/></svg>',
  volumeOff: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 19.75C16.8304 19.7472 16.6661 19.6912 16.53 19.59L11.74 15.75H7C6.80189 15.7474 6.61263 15.6676 6.47253 15.5275C6.33244 15.3874 6.25259 15.1981 6.25 15V9C6.25259 8.80189 6.33244 8.61263 6.47253 8.47253C6.61263 8.33244 6.80189 8.25259 7 8.25H11.74L16.53 4.41C16.6406 4.32106 16.7741 4.26533 16.9151 4.24927C17.0561 4.2332 17.1988 4.25747 17.3265 4.31926C17.4543 4.38104 17.5619 4.4778 17.6369 4.5983C17.7118 4.7188 17.751 4.85809 17.75 5V19C17.7489 19.1409 17.7092 19.2789 17.6351 19.3988C17.5611 19.5187 17.4555 19.6159 17.33 19.68C17.2264 19.7271 17.1138 19.751 17 19.75ZM7.75 14.25H12C12.1699 14.2507 12.3349 14.3069 12.47 14.41L16.25 17.41V6.56L12.47 9.56C12.3349 9.6631 12.1699 9.71928 12 9.72H7.75V14.25Z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 12.75H8C7.80109 12.75 7.61032 12.671 7.46967 12.5303C7.32902 12.3897 7.25 12.1989 7.25 12C7.25 11.8011 7.32902 11.6103 7.46967 11.4697C7.61032 11.329 7.80109 11.25 8 11.25H19C19.1989 11.25 19.3897 11.329 19.5303 11.4697C19.671 11.6103 19.75 11.8011 19.75 12C19.75 12.1989 19.671 12.3897 19.5303 12.5303C19.3897 12.671 19.1989 12.75 19 12.75Z"/><path d="M19 8.25H8C7.80109 8.25 7.61032 8.17098 7.46967 8.03033C7.32902 7.88968 7.25 7.69891 7.25 7.5C7.25 7.30109 7.32902 7.11032 7.46967 6.96967C7.61032 6.82902 7.80109 6.75 8 6.75H19C19.1989 6.75 19.3897 6.82902 19.5303 6.96967C19.671 7.11032 19.75 7.30109 19.75 7.5C19.75 7.69891 19.671 7.88968 19.5303 8.03033C19.3897 8.17098 19.1989 8.25 19 8.25Z"/><path d="M19 17.25H8C7.80109 17.25 7.61032 17.171 7.46967 17.0303C7.32902 16.8897 7.25 16.6989 7.25 16.5C7.25 16.3011 7.32902 16.1103 7.46967 15.9697C7.61032 15.829 7.80109 15.75 8 15.75H19C19.1989 15.75 19.3897 15.829 19.5303 15.9697C19.671 16.1103 19.75 16.3011 19.75 16.5C19.75 16.6989 19.671 16.8897 19.5303 17.0303C19.3897 17.171 19.1989 17.25 19 17.25Z"/><path d="M5.00002 8.50002C4.87 8.50161 4.74093 8.47783 4.62002 8.43002C4.50052 8.37204 4.3895 8.29802 4.29002 8.21002C4.19734 8.11658 4.12401 8.00576 4.07425 7.88392C4.02448 7.76209 3.99926 7.63163 4.00002 7.50002C4.0037 7.23525 4.10728 6.98165 4.29002 6.79002C4.38389 6.69742 4.49637 6.62583 4.62002 6.58002C4.86348 6.48 5.13656 6.48 5.38002 6.58002C5.50277 6.62761 5.61491 6.69898 5.71002 6.79002C5.89275 6.98165 5.99633 7.23525 6.00002 7.50002C6.00078 7.63163 5.97555 7.76209 5.92579 7.88392C5.87602 8.00576 5.8027 8.11658 5.71002 8.21002C5.61054 8.29802 5.49951 8.37204 5.38002 8.43002C5.25911 8.47783 5.13003 8.50161 5.00002 8.50002Z"/><path d="M5.00002 13C4.86934 12.9984 4.74024 12.9712 4.62002 12.92C4.49883 12.8693 4.38722 12.7983 4.29002 12.71C4.19734 12.6165 4.12401 12.5057 4.07425 12.3839C4.02448 12.262 3.99926 12.1316 4.00002 12C4.0037 11.7352 4.10728 11.4816 4.29002 11.29C4.38722 11.2016 4.49883 11.1306 4.62002 11.08C4.80104 10.996 5.00303 10.9682 5.20002 11L5.38002 11.06L5.56002 11.15C5.6124 11.1869 5.6625 11.227 5.71002 11.27C5.89749 11.4666 6.00144 11.7283 6.00002 12C6.00002 12.2652 5.89466 12.5195 5.70712 12.7071C5.51959 12.8946 5.26523 13 5.00002 13Z"/><path d="M4.99999 17.5C4.86998 17.5016 4.7409 17.4778 4.61999 17.43C4.50049 17.372 4.38947 17.298 4.28999 17.21C4.20166 17.1128 4.13063 17.0012 4.07999 16.88C4.02708 16.7603 3.99976 16.6309 3.99976 16.5C3.99976 16.3691 4.02708 16.2397 4.07999 16.12C4.13063 15.9988 4.20166 15.8872 4.28999 15.79C4.43061 15.6513 4.60919 15.5573 4.80317 15.5199C4.99716 15.4825 5.19788 15.5034 5.37999 15.58C5.50274 15.6276 5.61488 15.699 5.70999 15.79C5.79832 15.8872 5.86935 15.9988 5.91999 16.12C5.97289 16.2397 6.00022 16.3691 6.00022 16.5C6.00022 16.6309 5.97289 16.7603 5.91999 16.88C5.86935 17.0012 5.79832 17.1128 5.70999 17.21C5.61655 17.3027 5.50573 17.376 5.38389 17.4258C5.26206 17.4756 5.1316 17.5008 4.99999 17.5Z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.23001 18.25C6.17025 18.2535 5.15243 17.8363 4.40001 17.09C3.63614 16.2785 3.22341 15.1983 3.2515 14.0842C3.27958 12.97 3.74622 11.912 4.55001 11.14L8.31001 7.35C9.12729 6.50634 10.2456 6.0209 11.42 6C11.9475 6.00352 12.4692 6.11135 12.9549 6.3173C13.4406 6.52325 13.8807 6.82324 14.25 7.2C15.0243 8.01629 15.4433 9.10627 15.4152 10.231C15.387 11.3557 14.9141 12.4234 14.1 13.2L12.84 14.46C12.7713 14.5337 12.6885 14.5928 12.5965 14.6338C12.5045 14.6748 12.4052 14.6968 12.3045 14.6986C12.2038 14.7004 12.1038 14.6818 12.0104 14.6441C11.917 14.6064 11.8322 14.5503 11.761 14.479C11.6897 14.4078 11.6336 14.323 11.5959 14.2296C11.5582 14.1362 11.5396 14.0362 11.5414 13.9355C11.5432 13.8348 11.5652 13.7355 11.6062 13.6435C11.6472 13.5515 11.7063 13.4687 11.78 13.4L13 12.1C13.5247 11.6076 13.8338 10.9279 13.86 10.2088C13.8862 9.4897 13.6275 8.78933 13.14 8.26C12.6071 7.7953 11.9167 7.55197 11.2102 7.57986C10.5037 7.60774 9.83461 7.90474 9.34001 8.41L5.61001 12.19C5.09513 12.6812 4.79158 13.3535 4.76359 14.0646C4.73559 14.7757 4.98535 15.4698 5.46001 16C5.72088 16.2578 6.03529 16.4551 6.38093 16.5778C6.72657 16.7005 7.09497 16.7456 7.46001 16.71C7.55727 16.7004 7.65547 16.7101 7.74895 16.7386C7.84243 16.7671 7.92934 16.8139 8.00465 16.8762C8.07996 16.9385 8.14218 17.0151 8.18773 17.1015C8.23327 17.188 8.26124 17.2827 8.27001 17.38C8.28956 17.5775 8.23003 17.7747 8.10444 17.9284C7.97885 18.0821 7.79746 18.1798 7.60001 18.2L7.23001 18.25Z"/><path d="M12.58 18C12.0525 17.9965 11.5308 17.8887 11.0451 17.6827C10.5594 17.4768 10.1193 17.1768 9.75 16.8C8.97574 15.9837 8.55674 14.8937 8.58486 13.769C8.61297 12.6443 9.08592 11.5766 9.9 10.8L11.16 9.54C11.2287 9.46632 11.3115 9.40721 11.4035 9.36622C11.4955 9.32523 11.5948 9.30319 11.6955 9.30141C11.7962 9.29964 11.8962 9.31816 11.9896 9.35588C12.083 9.3936 12.1678 9.44975 12.239 9.52097C12.3103 9.59218 12.3664 9.67702 12.4041 9.77041C12.4418 9.86379 12.4604 9.96382 12.4586 10.0645C12.4568 10.1652 12.4348 10.2645 12.3938 10.3565C12.3528 10.4485 12.2937 10.5313 12.22 10.6L11 11.9C10.4753 12.3924 10.1662 13.0721 10.14 13.7912C10.1138 14.5103 10.3726 15.2107 10.86 15.74C11.3929 16.2047 12.0833 16.448 12.7898 16.4201C13.4963 16.3923 14.1654 16.0953 14.66 15.59L18.43 11.81C18.9393 11.3134 19.2355 10.6383 19.256 9.92727C19.2766 9.21626 19.0198 8.52513 18.54 8C18.2791 7.7422 17.9647 7.54495 17.6191 7.42224C17.2734 7.29954 16.905 7.2544 16.54 7.29C16.4427 7.29964 16.3445 7.28992 16.2511 7.2614C16.1576 7.23287 16.0707 7.18612 15.9954 7.12382C15.9201 7.06153 15.8578 6.98493 15.8123 6.89846C15.7667 6.81199 15.7388 6.71735 15.73 6.62C15.7104 6.42248 15.77 6.22527 15.8956 6.07156C16.0212 5.91786 16.2025 5.82021 16.4 5.8C16.9821 5.73967 17.5704 5.80779 18.1233 5.99959C18.6762 6.19138 19.1803 6.50216 19.6 6.91C20.3639 7.72153 20.7766 8.80172 20.7485 9.91585C20.7204 11.03 20.2538 12.088 19.45 12.86L15.69 16.65C14.8727 17.4937 13.7544 17.9791 12.58 18Z"/></svg>',
  contact: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.23001 18.25C6.17025 18.2535 5.15243 17.8363 4.40001 17.09C3.63614 16.2785 3.22341 15.1983 3.2515 14.0842C3.27958 12.97 3.74622 11.912 4.55001 11.14L8.31001 7.35C9.12729 6.50634 10.2456 6.0209 11.42 6C11.9475 6.00352 12.4692 6.11135 12.9549 6.3173C13.4406 6.52325 13.8807 6.82324 14.25 7.2C15.0243 8.01629 15.4433 9.10627 15.4152 10.231C15.387 11.3557 14.9141 12.4234 14.1 13.2L12.84 14.46C12.7713 14.5337 12.6885 14.5928 12.5965 14.6338C12.5045 14.6748 12.4052 14.6968 12.3045 14.6986C12.2038 14.7004 12.1038 14.6818 12.0104 14.6441C11.917 14.6064 11.8322 14.5503 11.761 14.479C11.6897 14.4078 11.6336 14.323 11.5959 14.2296C11.5582 14.1362 11.5396 14.0362 11.5414 13.9355C11.5432 13.8348 11.5652 13.7355 11.6062 13.6435C11.6472 13.5515 11.7063 13.4687 11.78 13.4L13 12.1C13.5247 11.6076 13.8338 10.9279 13.86 10.2088C13.8862 9.4897 13.6275 8.78933 13.14 8.26C12.6071 7.7953 11.9167 7.55197 11.2102 7.57986C10.5037 7.60774 9.83461 7.90474 9.34001 8.41L5.61001 12.19C5.09513 12.6812 4.79158 13.3535 4.76359 14.0646C4.73559 14.7757 4.98535 15.4698 5.46001 16C5.72088 16.2578 6.03529 16.4551 6.38093 16.5778C6.72657 16.7005 7.09497 16.7456 7.46001 16.71C7.55727 16.7004 7.65547 16.7101 7.74895 16.7386C7.84243 16.7671 7.92934 16.8139 8.00465 16.8762C8.07996 16.9385 8.14218 17.0151 8.18773 17.1015C8.23327 17.188 8.26124 17.2827 8.27001 17.38C8.28956 17.5775 8.23003 17.7747 8.10444 17.9284C7.97885 18.0821 7.79746 18.1798 7.60001 18.2L7.23001 18.25Z"/><path d="M12.58 18C12.0525 17.9965 11.5308 17.8887 11.0451 17.6827C10.5594 17.4768 10.1193 17.1768 9.75 16.8C8.97574 15.9837 8.55674 14.8937 8.58486 13.769C8.61297 12.6443 9.08592 11.5766 9.9 10.8L11.16 9.54C11.2287 9.46632 11.3115 9.40721 11.4035 9.36622C11.4955 9.32523 11.5948 9.30319 11.6955 9.30141C11.7962 9.29964 11.8962 9.31816 11.9896 9.35588C12.083 9.3936 12.1678 9.44975 12.239 9.52097C12.3103 9.59218 12.3664 9.67702 12.4041 9.77041C12.4418 9.86379 12.4604 9.96382 12.4586 10.0645C12.4568 10.1652 12.4348 10.2645 12.3938 10.3565C12.3528 10.4485 12.2937 10.5313 12.22 10.6L11 11.9C10.4753 12.3924 10.1662 13.0721 10.14 13.7912C10.1138 14.5103 10.3726 15.2107 10.86 15.74C11.3929 16.2047 12.0833 16.448 12.7898 16.4201C13.4963 16.3923 14.1654 16.0953 14.66 15.59L18.43 11.81C18.9393 11.3134 19.2355 10.6383 19.256 9.92727C19.2766 9.21626 19.0198 8.52513 18.54 8C18.2791 7.7422 17.9647 7.54495 17.6191 7.42224C17.2734 7.29954 16.905 7.2544 16.54 7.29C16.4427 7.29964 16.3445 7.28992 16.2511 7.2614C16.1576 7.23287 16.0707 7.18612 15.9954 7.12382C15.9201 7.06153 15.8578 6.98493 15.8123 6.89846C15.7667 6.81199 15.7388 6.71735 15.73 6.62C15.7104 6.42248 15.77 6.22527 15.8956 6.07156C16.0212 5.91786 16.2025 5.82021 16.4 5.8C16.9821 5.73967 17.5704 5.80779 18.1233 5.99959C18.6762 6.19138 19.1803 6.50216 19.6 6.91C20.3639 7.72153 20.7766 8.80172 20.7485 9.91585C20.7204 11.03 20.2538 12.088 19.45 12.86L15.69 16.65C14.8727 17.4937 13.7544 17.9791 12.58 18Z"/></svg>',
  experience: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 11.25H6C5.40326 11.25 4.83097 11.0129 4.40901 10.591C3.98705 10.169 3.75 9.59674 3.75 9V6C3.75 5.40326 3.98705 4.83097 4.40901 4.40901C4.83097 3.98705 5.40326 3.75 6 3.75H9C9.59674 3.75 10.169 3.98705 10.591 4.40901C11.0129 4.83097 11.25 5.40326 11.25 6V9C11.25 9.59674 11.0129 10.169 10.591 10.591C10.169 11.0129 9.59674 11.25 9 11.25ZM6 5.25C5.80189 5.25259 5.61263 5.33244 5.47253 5.47253C5.33244 5.61263 5.25259 5.80189 5.25 6V9C5.25259 9.19811 5.33244 9.38737 5.47253 9.52747C5.61263 9.66756 5.80189 9.74741 6 9.75H9C9.19811 9.74741 9.38737 9.66756 9.52747 9.52747C9.66756 9.38737 9.74741 9.19811 9.75 9V6C9.74741 5.80189 9.66756 5.61263 9.52747 5.47253C9.38737 5.33244 9.19811 5.25259 9 5.25H6Z"/><path d="M9 20.25H6C5.40326 20.25 4.83097 20.0129 4.40901 19.591C3.98705 19.169 3.75 18.5967 3.75 18V15C3.75 14.4033 3.98705 13.831 4.40901 13.409C4.83097 12.9871 5.40326 12.75 6 12.75H9C9.59674 12.75 10.169 12.9871 10.591 13.409C11.0129 13.831 11.25 14.4033 11.25 15V18C11.25 18.5967 11.0129 19.169 10.591 19.591C10.169 20.0129 9.59674 20.25 9 20.25ZM6 14.25C5.80189 14.2526 5.61263 14.3324 5.47253 14.4725C5.33244 14.6126 5.25259 14.8019 5.25 15V18C5.25259 18.1981 5.33244 18.3874 5.47253 18.5275C5.61263 18.6676 5.80189 18.7474 6 18.75H9C9.19811 18.7474 9.38737 18.6676 9.52747 18.5275C9.66756 18.3874 9.74741 18.1981 9.75 18V15C9.74741 14.8019 9.66756 14.6126 9.52747 14.4725C9.38737 14.3324 9.19811 14.2526 9 14.25H6Z"/><path d="M18 11.25H15C14.4033 11.25 13.831 11.0129 13.409 10.591C12.9871 10.169 12.75 9.59674 12.75 9V6C12.75 5.40326 12.9871 4.83097 13.409 4.40901C13.831 3.98705 14.4033 3.75 15 3.75H18C18.5967 3.75 19.169 3.98705 19.591 4.40901C20.0129 4.83097 20.25 5.40326 20.25 6V9C20.25 9.59674 20.0129 10.169 19.591 10.591C19.169 11.0129 18.5967 11.25 18 11.25ZM15 5.25C14.8019 5.25259 14.6126 5.33244 14.4725 5.47253C14.3324 5.61263 14.2526 5.80189 14.25 6V9C14.2526 9.19811 14.3324 9.38737 14.4725 9.52747C14.6126 9.66756 14.8019 9.74741 15 9.75H18C18.1981 9.74741 18.3874 9.66756 18.5275 9.52747C18.6676 9.38737 18.7474 9.19811 18.75 9V6C18.7474 5.80189 18.6676 5.61263 18.5275 5.47253C18.3874 5.33244 18.1981 5.25259 18 5.25H15Z"/><path d="M18 20.25H15C14.4033 20.25 13.831 20.0129 13.409 19.591C12.9871 19.169 12.75 18.5967 12.75 18V15C12.75 14.4033 12.9871 13.831 13.409 13.409C13.831 12.9871 14.4033 12.75 15 12.75H18C18.5967 12.75 19.169 12.9871 19.591 13.409C20.0129 13.831 20.25 14.4033 20.25 15V18C20.25 18.5967 20.0129 19.169 19.591 19.591C19.169 20.0129 18.5967 20.25 18 20.25ZM15 14.25C14.8019 14.2526 14.6126 14.3324 14.4725 14.4725C14.3324 14.6126 14.2526 14.8019 14.25 15V18C14.2526 18.1981 14.3324 18.3874 14.4725 18.5275C14.6126 18.6676 14.8019 18.7474 15 18.75H18C18.1981 18.7474 18.3874 18.6676 18.5275 18.5275C18.6676 18.3874 18.7474 18.1981 18.75 18V15C18.7474 14.8019 18.6676 14.6126 18.5275 14.4725C18.3874 14.3324 18.1981 14.2526 18 14.25H15Z"/></svg>',
  cv: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.94 20.74C7.45715 20.7458 6.02743 20.1882 4.94001 19.18C4.41043 18.6904 3.98787 18.0965 3.69887 17.4356C3.40987 16.7748 3.26068 16.0613 3.26068 15.34C3.26068 14.6188 3.40987 13.9053 3.69887 13.2445C3.98787 12.5836 4.41043 11.9897 4.94001 11.5L12.5 4.36005C13.2775 3.65032 14.2923 3.25684 15.345 3.25684C16.3977 3.25684 17.4125 3.65032 18.19 4.36005C18.5954 4.73639 18.9204 5.19087 19.1456 5.69612C19.3707 6.20138 19.4913 6.74697 19.5 7.30005C19.5027 7.77802 19.4064 8.25137 19.2171 8.69025C19.0278 9.12914 18.7495 9.52404 18.4 9.85005L10.83 17C10.3732 17.4239 9.77312 17.6594 9.15 17.6594C8.52689 17.6594 7.92679 17.4239 7.47001 17C7.24334 16.7912 7.06243 16.5376 6.93869 16.2554C6.81495 15.9731 6.75106 15.6682 6.75106 15.36C6.75106 15.0518 6.81495 14.747 6.93869 14.4647C7.06243 14.1824 7.24334 13.9289 7.47001 13.72L14.47 7.13005C14.6106 6.9896 14.8013 6.91071 15 6.91071C15.1988 6.91071 15.3894 6.9896 15.53 7.13005C15.6705 7.27067 15.7493 7.4613 15.7493 7.66005C15.7493 7.8588 15.6705 8.04942 15.53 8.19005L8.53 14.78C8.45149 14.8486 8.38856 14.9331 8.34544 15.028C8.30232 15.1228 8.28 15.2258 8.28 15.33C8.28 15.4343 8.30232 15.5373 8.34544 15.6321C8.38856 15.727 8.45149 15.8115 8.53 15.88C8.71114 16.035 8.94165 16.1201 9.18001 16.1201C9.41836 16.1201 9.64887 16.035 9.83001 15.88L17.4 8.75005C17.5926 8.56129 17.745 8.33553 17.8482 8.08635C17.9513 7.83717 18.0029 7.56971 18 7.30005C17.9917 6.95248 17.913 6.6102 17.7686 6.29393C17.6242 5.97767 17.4172 5.69398 17.16 5.46005C16.6663 5.0025 16.0181 4.74828 15.345 4.74828C14.6719 4.74828 14.0237 5.0025 13.53 5.46005L6.00001 12.59C5.61867 12.9395 5.31419 13.3644 5.10588 13.8378C4.89757 14.3113 4.79001 14.8228 4.79001 15.34C4.79001 15.8573 4.89757 16.3688 5.10588 16.8423C5.31419 17.3157 5.61867 17.7406 6.00001 18.09C6.81452 18.8492 7.88656 19.2714 9.00001 19.2714C10.1135 19.2714 11.1855 18.8492 12 18.09L19.49 11C19.559 10.9293 19.6414 10.8731 19.7324 10.8347C19.8234 10.7963 19.9212 10.7765 20.02 10.7765C20.1188 10.7765 20.2166 10.7963 20.3076 10.8347C20.3986 10.8731 20.4811 10.9293 20.55 11C20.6905 11.1407 20.7693 11.3313 20.7693 11.53C20.7693 11.7288 20.6905 11.9194 20.55 12.06L13 19.18C11.898 20.2034 10.4437 20.7622 8.94 20.74Z"/></svg>',
  stack: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.01 21C13.52 21 13.06 20.77 12.68 20.57C12.44 20.45 12.15 20.3 12 20.3C11.85 20.3 11.55 20.45 11.32 20.57C10.84 20.82 10.24 21.12 9.59999 20.95C8.93999 20.78 8.57999 20.2 8.27999 19.74C8.14999 19.53 7.96999 19.25 7.84999 19.18C7.72999 19.11 7.40999 19.1 7.13999 19.08C6.59999 19.05 5.92999 19.02 5.44999 18.55C4.96999 18.06 4.93999 17.39 4.90999 16.85C4.89999 16.59 4.87999 16.26 4.80999 16.14C4.74999 16.03 4.45999 15.85 4.25999 15.72C3.79999 15.42 3.22999 15.05 3.04999 14.4C2.87999 13.76 3.17999 13.16 3.42999 12.68C3.54999 12.44 3.69999 12.15 3.69999 12C3.69999 11.85 3.54999 11.55 3.42999 11.32C3.17999 10.84 2.87999 10.24 3.04999 9.60002C3.21999 8.94002 3.79999 8.58002 4.25999 8.28002C4.46999 8.15002 4.74999 7.97002 4.81999 7.85002C4.88999 7.73002 4.89999 7.41002 4.91999 7.14002C4.94999 6.60002 4.97999 5.93002 5.44999 5.45002C5.93999 4.97002 6.60999 4.94002 7.14999 4.91002C7.40999 4.90002 7.73999 4.88002 7.85999 4.81002C7.96999 4.75002 8.14999 4.46002 8.27999 4.26002C8.57999 3.80002 8.94999 3.23002 9.59999 3.05002C10.24 2.88002 10.84 3.18002 11.32 3.43002C11.56 3.55002 11.85 3.70002 12 3.70002C12.15 3.70002 12.45 3.55002 12.68 3.43002C13.16 3.19002 13.76 2.88002 14.4 3.05002C15.06 3.22002 15.42 3.80002 15.72 4.26002C15.85 4.47002 16.03 4.75002 16.15 4.82002C16.27 4.89002 16.59 4.90002 16.86 4.92002C17.4 4.95002 18.07 4.98002 18.55 5.45002C19.03 5.94002 19.06 6.61002 19.09 7.15002C19.1 7.41002 19.12 7.74002 19.19 7.86002C19.25 7.97002 19.54 8.15002 19.74 8.28002C20.2 8.58002 20.77 8.95002 20.95 9.60002C21.12 10.24 20.82 10.84 20.57 11.32C20.45 11.56 20.3 11.85 20.3 12C20.3 12.15 20.45 12.45 20.57 12.68C20.82 13.16 21.12 13.76 20.95 14.4C20.78 15.06 20.2 15.42 19.74 15.72C19.53 15.85 19.25 16.03 19.18 16.15C19.11 16.27 19.1 16.59 19.08 16.86C19.05 17.4 19.02 18.07 18.55 18.55C18.06 19.03 17.39 19.06 16.85 19.09C16.59 19.1 16.26 19.12 16.14 19.19C16.03 19.25 15.85 19.54 15.72 19.74C15.42 20.2 15.05 20.77 14.4 20.95C14.27 20.99 14.14 21 14.01 21ZM9.99999 4.50002C9.99999 4.50002 9.99999 4.50002 9.98999 4.50002C9.88999 4.54002 9.65999 4.88002 9.54999 5.07002C9.30999 5.44002 9.03999 5.86002 8.60999 6.11002C8.16999 6.36002 7.66999 6.39002 7.21999 6.41002C6.99999 6.42002 6.58999 6.44002 6.49999 6.51002C6.43999 6.59002 6.41999 6.99002 6.40999 7.21002C6.38999 7.66002 6.35999 8.16002 6.10999 8.59002C5.85999 9.02002 5.43999 9.29002 5.06999 9.53002C4.87999 9.65002 4.53999 9.87002 4.49999 9.98002C4.48999 10.09 4.65999 10.43 4.75999 10.63C4.95999 11.03 5.19999 11.48 5.19999 11.99C5.19999 12.5 4.96999 12.95 4.75999 13.35C4.65999 13.55 4.47999 13.89 4.49999 14C4.53999 14.1 4.87999 14.33 5.06999 14.44C5.43999 14.68 5.85999 14.95 6.10999 15.38C6.35999 15.82 6.38999 16.32 6.40999 16.77C6.41999 16.99 6.43999 17.4 6.50999 17.49C6.58999 17.55 6.98999 17.57 7.20999 17.58C7.65999 17.6 8.15999 17.63 8.58999 17.88C9.01999 18.13 9.28999 18.55 9.52999 18.92C9.64999 19.11 9.86999 19.45 9.97999 19.49C10.08 19.52 10.43 19.33 10.63 19.23C11.03 19.03 11.48 18.79 11.99 18.79C12.5 18.79 12.95 19.02 13.35 19.23C13.55 19.33 13.87 19.52 14 19.49C14.1 19.45 14.33 19.11 14.44 18.92C14.68 18.55 14.95 18.13 15.38 17.88C15.82 17.63 16.32 17.6 16.77 17.58C16.99 17.57 17.4 17.55 17.49 17.48C17.55 17.4 17.57 17 17.58 16.78C17.6 16.33 17.63 15.83 17.88 15.4C18.13 14.97 18.55 14.7 18.92 14.46C19.11 14.34 19.45 14.12 19.49 14.01C19.5 13.9 19.33 13.56 19.23 13.36C19.03 12.96 18.79 12.51 18.79 12C18.79 11.49 19.02 11.04 19.23 10.64C19.33 10.44 19.5 10.1 19.49 9.99002C19.45 9.88002 19.1 9.66002 18.92 9.54002C18.55 9.30002 18.13 9.03002 17.88 8.60002C17.63 8.16002 17.6 7.66002 17.58 7.21002C17.57 6.99002 17.55 6.58002 17.48 6.49002C17.4 6.43002 17 6.41002 16.78 6.40002C16.33 6.38002 15.83 6.35002 15.4 6.10002C14.97 5.85002 14.7 5.43002 14.46 5.06002C14.34 4.87002 14.12 4.53002 14.01 4.49002C13.91 4.46002 13.56 4.65002 13.36 4.75002C12.96 4.95002 12.51 5.19002 12 5.19002C11.49 5.19002 11.04 4.96002 10.64 4.75002C10.44 4.65002 10.12 4.49002 9.99999 4.49002V4.50002ZM10.49 15.51C10.29 15.51 10.1 15.43 9.95999 15.29L7.44999 12.78C7.15999 12.49 7.15999 12.01 7.44999 11.72C7.73999 11.43 8.21999 11.43 8.50999 11.72L10.49 13.7L15.48 8.71002C15.77 8.42002 16.25 8.42002 16.54 8.71002C16.83 9.00002 16.83 9.48002 16.54 9.77002L11.02 15.29C10.88 15.43 10.69 15.51 10.49 15.51Z"/></svg>',
  about: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12.25C11.2583 12.25 10.5333 12.0301 9.91661 11.618C9.29993 11.206 8.81928 10.6203 8.53545 9.93506C8.25163 9.24984 8.17736 8.49584 8.32206 7.76841C8.46675 7.04098 8.8239 6.3728 9.34835 5.84835C9.8728 5.3239 10.541 4.96675 11.2684 4.82206C11.9958 4.67736 12.7498 4.75162 13.4351 5.03545C14.1203 5.31928 14.706 5.79993 15.118 6.41661C15.5301 7.0333 15.75 7.75832 15.75 8.5C15.75 9.49456 15.3549 10.4484 14.6517 11.1517C13.9484 11.8549 12.9946 12.25 12 12.25ZM12 6.25C11.555 6.25 11.12 6.38196 10.75 6.62919C10.38 6.87643 10.0916 7.22783 9.92127 7.63896C9.75098 8.0501 9.70642 8.5025 9.79323 8.93895C9.88005 9.37541 10.0943 9.77632 10.409 10.091C10.7237 10.4057 11.1246 10.62 11.561 10.7068C11.9975 10.7936 12.4499 10.749 12.861 10.5787C13.2722 10.4084 13.6236 10.12 13.8708 9.75003C14.118 9.38002 14.25 8.94501 14.25 8.5C14.25 7.90326 14.0129 7.33097 13.591 6.90901C13.169 6.48705 12.5967 6.25 12 6.25Z"/><path d="M19 19.25C18.8019 19.2474 18.6126 19.1676 18.4725 19.0275C18.3324 18.8874 18.2526 18.6981 18.25 18.5C18.25 16.55 17.19 15.25 12 15.25C6.81 15.25 5.75 16.55 5.75 18.5C5.75 18.6989 5.67098 18.8897 5.53033 19.0303C5.38968 19.171 5.19891 19.25 5 19.25C4.80109 19.25 4.61032 19.171 4.46967 19.0303C4.32902 18.8897 4.25 18.6989 4.25 18.5C4.25 13.75 9.68 13.75 12 13.75C14.32 13.75 19.75 13.75 19.75 18.5C19.7474 18.6981 19.6676 18.8874 19.5275 19.0275C19.3874 19.1676 19.1981 19.2474 19 19.25Z"/></svg>',
  education: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.17 4.43994H16.83C15.82 4.43994 15 5.25994 15 6.26994V6.71994L5.5 8.75994V8.24994C5.5 7.83994 5.16 7.49994 4.75 7.49994C4.34 7.49994 4 7.83994 4 8.24994V15.2499C4 15.6599 4.34 15.9999 4.75 15.9999C5.16 15.9999 5.5 15.6599 5.5 15.2499V14.6199L15 16.6599V17.1099C15 18.1199 15.82 18.9399 16.83 18.9399H18.17C19.18 18.9399 20 18.1199 20 17.1099V6.26994C20 5.25994 19.18 4.43994 18.17 4.43994ZM5.5 13.0799V10.2899L15 8.24994V15.1199L5.5 13.0799ZM18.5 17.1099C18.5 17.2899 18.35 17.4399 18.17 17.4399H16.83C16.65 17.4399 16.5 17.2899 16.5 17.1099V6.26994C16.5 6.08994 16.65 5.93994 16.83 5.93994H18.17C18.35 5.93994 18.5 6.08994 18.5 6.26994V17.1099ZM12.97 17.6299C12.6 18.7899 11.53 19.5699 10.3 19.5699C8.76 19.5699 7.5 18.3299 7.5 16.8199C7.5 16.7099 7.5 16.5899 7.52 16.4799C7.57 16.0699 7.95 15.7799 8.36 15.8299C8.77 15.8799 9.06 16.2499 9.01 16.6599C9.01 16.7099 9.01 16.7599 9.01 16.8099C9.01 17.4999 9.59 18.0599 10.31 18.0599C10.88 18.0599 11.38 17.6999 11.55 17.1699C11.67 16.7699 12.1 16.5499 12.49 16.6799C12.89 16.7999 13.1 17.2299 12.98 17.6199L12.97 17.6299Z"/></svg>',
  writing: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 18.75H6.5C5.81 18.75 5.25 18.19 5.25 17.5V5.5C5.25 4.81 5.81 4.25 6.5 4.25H10.25V9C10.25 9.41 10.59 9.75 11 9.75H15.8C15.9 10.04 16.17 10.25 16.5 10.25C16.91 10.25 17.25 9.91 17.25 9.5V9C17.25 8.9 17.23 8.8 17.19 8.71C17.15 8.62 17.1 8.54 17.03 8.47L11.53 2.97C11.46 2.9 11.38 2.85 11.29 2.81C11.2 2.77 11.1 2.75 11 2.75H6.5C4.98 2.75 3.75 3.98 3.75 5.5V17.5C3.75 19.02 4.98 20.25 6.5 20.25H8C8.41 20.25 8.75 19.91 8.75 19.5C8.75 19.09 8.41 18.75 8 18.75ZM11.75 5.31L14.69 8.25H11.75V5.31ZM19.61 11.37C19.23 10.99 18.67 10.76 18.09 10.75C17.49 10.72 16.92 10.95 16.54 11.34L10.15 17.74C10.02 17.87 9.95 18.03 9.93 18.21L9.75 20.44C9.73 20.66 9.81 20.88 9.97 21.03C10.11 21.17 10.3 21.25 10.5 21.25C10.52 21.25 10.54 21.25 10.57 21.25L12.82 21.04C12.99 21.02 13.16 20.95 13.28 20.82L19.67 14.42C20.47 13.63 20.44 12.2 19.61 11.37ZM18.61 13.36L12.41 19.57L11.32 19.67L11.4 18.61L17.6 12.4C17.7 12.3 17.88 12.26 18.06 12.25C18.26 12.25 18.44 12.32 18.55 12.43C18.79 12.66 18.82 13.15 18.61 13.36Z"/></svg>',
};

/** The sheet's rows, in reading order: section key → its glyph in `ICONS`. */
const MENU_ORDER = [
  ['contact', 'contact'],
  ['experience', 'experience'],
  ['resume', 'cv'],
  ['skills', 'stack'],
  ['about', 'about'],
  ['education', 'education'],
  ['blog', 'writing'],
];

/**
 * The dock: a Menu button that opens the sheet of sections, Contact as an icon on its
 * own, a sound button that mutes the room's ambient sound (the printer's motors — the
 * guitar and the phone are played on purpose and keep their own controls), and a Play
 * button that is not wired to anything yet. `onSound(muted)` is told each press of the
 * sound button. The sheet lists every live section in
 * `MENU_ORDER`, each with its glyph; its rows open through the same `[data-open]`
 * delegation in `panels.js` the old pills used.
 */
function buildDock(dock, keys, anchors, onSound) {
  if (!dock) return;
  const menu = document.getElementById('menu');

  const menuBtn = document.createElement('button');
  menuBtn.className = 'nav-btn glass';
  menuBtn.id = 'menu-btn';
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.innerHTML = `${ICONS.list}<span>Menu</span>`;
  dock.appendChild(menuBtn);

  if (keys.includes('contact')) {
    const contact = document.createElement('button');
    contact.className = 'nav-btn is-icon glass';
    contact.setAttribute('data-open', 'contact');
    contact.setAttribute('aria-label', 'Contact');
    contact.innerHTML = ICONS.link;
    dock.appendChild(contact);
  }

  const sound = document.createElement('button');
  sound.className = 'nav-btn is-icon glass';
  sound.id = 'sound-btn';
  sound.setAttribute('aria-label', 'Mute sound');
  sound.setAttribute('aria-pressed', 'false');
  sound.innerHTML = ICONS.volumeUp;
  let muted = false;
  sound.addEventListener('click', () => {
    muted = !muted;
    sound.innerHTML = muted ? ICONS.volumeOff : ICONS.volumeUp;
    sound.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    sound.setAttribute('aria-pressed', String(muted));
    onSound?.(muted);
  });
  dock.appendChild(sound);

  // Play: a placeholder for now — the button is there, it does nothing yet.
  const play = document.createElement('button');
  play.className = 'nav-btn is-icon glass';
  play.id = 'play-btn';
  play.setAttribute('aria-label', 'Play');
  play.innerHTML = ICONS.play;
  dock.appendChild(play);

  if (!menu) return;
  for (const [key, icon] of MENU_ORDER) {
    if (!keys.includes(key)) continue;
    const item = document.createElement('button');
    item.className = 'menu-item';
    item.setAttribute('data-open', key);
    item.innerHTML = `${ICONS[icon]}<span>${anchors[key].label}</span>`;
    menu.appendChild(item);
  }
  setupMenu(menu, menuBtn);
}

/**
 * Opens and closes the sheet: the button toggles it, a click anywhere else or Escape
 * closes it, and so does opening a section (`open()` calls `closeMenu`).
 */
let closeMenu = () => {};
function setupMenu(menu, button) {
  const set = (on) => {
    menu.classList.toggle('is-open', on);
    button.setAttribute('aria-expanded', String(on));
  };
  closeMenu = () => set(false);
  button.addEventListener('click', () => set(!menu.classList.contains('is-open')));
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('#menu, #menu-btn')) set(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') set(false);
  });
}
