import { buildAnchors, reframeAnchors, SECTION_ORDER } from './anchors.js';
import { dropIn, jiggle, SPRING_OVER } from '../droplet.js';
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
    return { update() {}, intro() {}, isFlying: () => false, lockZoomOut() {}, blurb: { dismiss() {}, reopen() {} } };
  }

  const introEl = document.getElementById('intro');
  // On a phone the blurb is a glass pane that opens from its corner when the intro
  // starts (see `enterBlurb`); unseen until then. On a desktop it is plain text.
  const introText = SHEET.matches ? document.getElementById('intro-text') : null;
  if (introText) introText.style.opacity = '0';
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

  // The view button: from the desk up to the wide shot, where the orbit runs free all
  // the way round, and from there back down to the desk. Same guard as `onMiss`: not
  // over a section, and not mid-flight.
  const dock = buildDock(dockEl, live, anchors, onSound, () => {
    if (openKey || flight.flying) return;
    if (flight.wideView) flight.to(null, 0);
    else flight.toWide();
  });
  // Every glass button wobbles under the finger, like the liquid it is dressed as.
  for (const surface of [dockEl, document.getElementById('menu'), backBtn]) {
    surface?.addEventListener('pointerdown', (event) => {
      jiggle(event.target.closest('.nav-btn, .menu-item'));
    });
  }

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
    } else if (mode === 'mural') {
      // Something simply read where it hangs: nothing on it to hover or open, so a
      // click anywhere while it is up — the chalk itself included — steps back out,
      // the way a tap off any prop does.
      onProp[key] = { hover: () => false, open: () => (dismiss(), true), reset() {} };
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
    const leaving = openKey;
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
    // Closing a section goes back to the overview — except one read from outside the
    // room, the mural on the back wall: that was reached from the wide shot, and the
    // way out is back up to it, not down to the desk on the far side of the concrete.
    const wasOutside = !next && openKey === null && leaving && SECTIONS[leaving]?.outside;
    if (wasOutside) flight.toWide();
    else flight.to(next ? anchors[next] : null, width);

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
    // A screen is opened where it was last left — the group picked in Shortcuts, the
    // note open in Notes, how far a page was read — the way the machines themselves
    // would keep it. Nothing is rewound; `screens.rewind()` stays for a reload.
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
    // The glyph follows the view whichever way it got there — the button, a click on
    // empty room, or closing the mural.
    dock.setWide(flight.wideView);
  };

  // The view drifts with the pointer — browsing the room or reading a section — so the
  // scene is never a still image. Fed as a fraction of the viewport; `flight.js` turns
  // it into a lens shift rather than moving the camera.
  canvas.addEventListener('pointermove', (event) => {
    // A mouse only: a finger on the screen is scrolling or orbiting, not leaning. And
    // only while hovering: a held button is a drag, which belongs to the orbit — with
    // a prop open its tilt band is narrow enough that a lean chasing the pointer would
    // outweigh it — so the lean holds where it was until the mouse is released.
    if (event.pointerType === 'touch' || event.buttons) return;
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
  let blurbDrop = null;
  function intro({ position, target }) {
    dock.enter();
    blurbDrop = enterBlurb(introText, dock.menuBtn);
    flight.fly(position, target, 'View — desk');
  }

  /**
   * The blurb while the room is orbited (`body.orbiting`, set by `main.js`): `dismiss`
   * drops a droplet still playing so the pane just slides away under its stylesheet,
   * `reopen` plays the entrance again from the Menu button once the camera has
   * rested. On a desktop the blurb is plain text and both are no-ops.
   */
  const blurb = {
    dismiss() { blurbDrop?.cancel(); blurbDrop = null; },
    reopen() {
      if (!introText) return;
      blurbDrop?.cancel();
      blurbDrop = enterBlurb(introText, dock.menuBtn, { delay: 0, duration: 1000 });
    },
  };

  /** Whether the camera is flying or the lean is still settling — `main.js` keeps the
   *  full frame rate up while it is. */
  const isFlying = () => flight.moving;

  const lockZoomOut = (minPolar) => flight.lockZoomOut(minPolar);
  return { update, open, intro, isFlying, lockZoomOut, blurb, get openKey() { return openKey; } };
}

/** Fades a bit of chrome out without collapsing the layout the labels dodge around. */
function toggle(element, visible) {
  if (!element) return;
  element.style.opacity = visible ? '1' : '0';
  element.style.pointerEvents = visible ? 'auto' : 'none';
  // Belt and braces: on the phone the glass buttons went on taking taps under a
  // parent's `pointer-events: none` — each is composited on its own for its backdrop
  // blur — so the switch is put on every button too, and the whole thing is made
  // `inert`, which is the browser's own "nothing in here can be interacted with".
  element.inert = !visible;
  for (const button of element.querySelectorAll('button')) {
    button.style.pointerEvents = visible ? '' : 'none';
  }
}

/** The always-available list of sections, for anyone who would rather not hunt props. */
/**
 * The dock's and the menu's glyphs, as the SVGs in `public/icons/` — inlined so they take
 * the button's ink and cost no request. The controls (list, link, back, camera, play,
 * volume) are SVG Repo, CC0; the seven section glyphs are drawn here, each a small
 * picture of the prop its section flies to — the iPhone for Contact, the portrait
 * display for About — so the sheet reads as a map of the desk.
 */
const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 18.75C10.9015 18.7505 10.8038 18.7313 10.7128 18.6935C10.6218 18.6557 10.5393 18.6001 10.47 18.53L4.47001 12.53C4.32956 12.3894 4.25067 12.1988 4.25067 12C4.25067 11.8013 4.32956 11.6107 4.47001 11.47L10.47 5.47003C10.6122 5.33755 10.8002 5.26543 10.9945 5.26885C11.1888 5.27228 11.3742 5.35099 11.5116 5.48841C11.649 5.62582 11.7278 5.81121 11.7312 6.00551C11.7346 6.19981 11.6625 6.38785 11.53 6.53003L6.06001 12L11.53 17.47C11.6705 17.6107 11.7494 17.8013 11.7494 18C11.7494 18.1988 11.6705 18.3894 11.53 18.53C11.4608 18.6001 11.3782 18.6557 11.2872 18.6935C11.1962 18.7313 11.0986 18.7505 11 18.75Z"/><path d="M19 12.75H5C4.80109 12.75 4.61032 12.671 4.46967 12.5303C4.32902 12.3897 4.25 12.1989 4.25 12C4.25 11.8011 4.32902 11.6103 4.46967 11.4697C4.61032 11.329 4.80109 11.25 5 11.25H19C19.1989 11.25 19.3897 11.329 19.5303 11.4697C19.671 11.6103 19.75 11.8011 19.75 12C19.75 12.1989 19.671 12.3897 19.5303 12.5303C19.3897 12.671 19.1989 12.75 19 12.75Z"/></svg>',
  camera: '<svg viewBox="0 0 36 36" fill="currentColor" aria-hidden="true"><path d="M34,10.34a2.11,2.11,0,0,0-1.16-1.9,2,2,0,0,0-2.13.15L26,11.6V8a2,2,0,0,0-2-2H6a4,4,0,0,0-4,4V26a4,4,0,0,0,4,4H24a2,2,0,0,0,2-2V24.4l4.64,3a2.07,2.07,0,0,0,2.2.2A2.11,2.11,0,0,0,34,25.66ZM31.93,25.77c-.06,0-.11,0-.19-.06L24,20.77V28H6a2,2,0,0,1-2-2V10A2,2,0,0,1,6,8H24v7.23l7.8-5a.11.11,0,0,1,.13,0,.11.11,0,0,1,.07.11V25.66A.11.11,0,0,1,31.93,25.77Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 18.75C7.88537 18.7486 7.77256 18.7212 7.67 18.67C7.54453 18.6086 7.43873 18.5133 7.36453 18.3949C7.29032 18.2765 7.25065 18.1397 7.25 18V6.00003C7.25065 5.86031 7.29032 5.72356 7.36453 5.60518C7.43873 5.4868 7.54453 5.3915 7.67 5.33003C7.79355 5.26757 7.93214 5.24102 8.07002 5.25339C8.2079 5.26576 8.33955 5.31657 8.45 5.40003L16.45 11.4C16.5431 11.4699 16.6187 11.5605 16.6708 11.6646C16.7229 11.7688 16.75 11.8836 16.75 12C16.75 12.1165 16.7229 12.2313 16.6708 12.3354C16.6187 12.4396 16.5431 12.5302 16.45 12.6L8.45 18.6C8.32052 18.6981 8.1624 18.7508 8 18.75ZM8.75 7.50003V16.5L14.75 12L8.75 7.50003Z"/></svg>',
  volumeUp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 19.75C12.8304 19.7472 12.6661 19.6912 12.53 19.59L7.74 15.75H3C2.80189 15.7474 2.61263 15.6676 2.47253 15.5275C2.33244 15.3874 2.25259 15.1981 2.25 15V9C2.25259 8.80189 2.33244 8.61263 2.47253 8.47253C2.61263 8.33244 2.80189 8.25259 3 8.25H7.74L12.53 4.41C12.6406 4.32106 12.7741 4.26533 12.9151 4.24927C13.0561 4.2332 13.1988 4.25747 13.3265 4.31926C13.4543 4.38104 13.5619 4.4778 13.6369 4.5983C13.7118 4.7188 13.751 4.85809 13.75 5V19C13.7491 19.1422 13.7084 19.2814 13.6324 19.4016C13.5563 19.5218 13.4481 19.6182 13.32 19.68C13.2202 19.728 13.1107 19.7519 13 19.75ZM3.75 14.25H8C8.16991 14.2507 8.33494 14.3069 8.47 14.41L12.25 17.41V6.56L8.47 9.56C8.33886 9.6739 8.17345 9.74076 8 9.75H3.75V14.25Z"/><path d="M18.46 18.07C18.2806 18.0697 18.107 18.006 17.97 17.89C17.8945 17.8258 17.8327 17.7472 17.7881 17.6587C17.7436 17.5702 17.7173 17.4736 17.7107 17.3748C17.7042 17.2759 17.7176 17.1768 17.7501 17.0832C17.7826 16.9896 17.8336 16.9035 17.9 16.83C19.0891 15.5022 19.7466 13.7824 19.7466 12C19.7466 10.2176 19.0891 8.49779 17.9 7.16998C17.8344 7.09644 17.7838 7.01069 17.7513 6.91762C17.7188 6.82455 17.7049 6.72599 17.7105 6.62756C17.7161 6.52913 17.741 6.43276 17.7838 6.34395C17.8266 6.25515 17.8865 6.17564 17.96 6.10998C18.0336 6.04432 18.1193 5.99379 18.2124 5.96127C18.3054 5.92875 18.404 5.91488 18.5024 5.92045C18.6009 5.92602 18.6972 5.95093 18.786 5.99374C18.8749 6.03656 18.9544 6.09644 19.02 6.16998C20.4578 7.76752 21.2534 9.84072 21.2534 11.99C21.2534 14.1392 20.4578 16.2124 19.02 17.81C18.9518 17.8921 18.8662 17.9581 18.7693 18.0031C18.6724 18.048 18.5668 18.0709 18.46 18.07Z"/><path d="M16.11 15.38C15.9481 15.3779 15.7908 15.3255 15.66 15.23C15.5009 15.1107 15.3957 14.933 15.3675 14.7361C15.3394 14.5392 15.3906 14.3391 15.51 14.18C15.9869 13.5533 16.2451 12.7875 16.2451 12C16.2451 11.2125 15.9869 10.4467 15.51 9.82C15.3906 9.66087 15.3394 9.46085 15.3675 9.26393C15.3957 9.06702 15.5009 8.88935 15.66 8.77C15.8191 8.65065 16.0191 8.59941 16.2161 8.62754C16.413 8.65567 16.5906 8.76087 16.71 8.92C17.3863 9.80433 17.7528 10.8867 17.7528 12C17.7528 13.1133 17.3863 14.1957 16.71 15.08C16.6391 15.172 16.5483 15.2468 16.4444 15.2988C16.3405 15.3507 16.2262 15.3785 16.11 15.38Z"/></svg>',
  volumeOff: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 19.75C16.8304 19.7472 16.6661 19.6912 16.53 19.59L11.74 15.75H7C6.80189 15.7474 6.61263 15.6676 6.47253 15.5275C6.33244 15.3874 6.25259 15.1981 6.25 15V9C6.25259 8.80189 6.33244 8.61263 6.47253 8.47253C6.61263 8.33244 6.80189 8.25259 7 8.25H11.74L16.53 4.41C16.6406 4.32106 16.7741 4.26533 16.9151 4.24927C17.0561 4.2332 17.1988 4.25747 17.3265 4.31926C17.4543 4.38104 17.5619 4.4778 17.6369 4.5983C17.7118 4.7188 17.751 4.85809 17.75 5V19C17.7489 19.1409 17.7092 19.2789 17.6351 19.3988C17.5611 19.5187 17.4555 19.6159 17.33 19.68C17.2264 19.7271 17.1138 19.751 17 19.75ZM7.75 14.25H12C12.1699 14.2507 12.3349 14.3069 12.47 14.41L16.25 17.41V6.56L12.47 9.56C12.3349 9.6631 12.1699 9.71928 12 9.72H7.75V14.25Z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 12.75H8C7.80109 12.75 7.61032 12.671 7.46967 12.5303C7.32902 12.3897 7.25 12.1989 7.25 12C7.25 11.8011 7.32902 11.6103 7.46967 11.4697C7.61032 11.329 7.80109 11.25 8 11.25H19C19.1989 11.25 19.3897 11.329 19.5303 11.4697C19.671 11.6103 19.75 11.8011 19.75 12C19.75 12.1989 19.671 12.3897 19.5303 12.5303C19.3897 12.671 19.1989 12.75 19 12.75Z"/><path d="M19 8.25H8C7.80109 8.25 7.61032 8.17098 7.46967 8.03033C7.32902 7.88968 7.25 7.69891 7.25 7.5C7.25 7.30109 7.32902 7.11032 7.46967 6.96967C7.61032 6.82902 7.80109 6.75 8 6.75H19C19.1989 6.75 19.3897 6.82902 19.5303 6.96967C19.671 7.11032 19.75 7.30109 19.75 7.5C19.75 7.69891 19.671 7.88968 19.5303 8.03033C19.3897 8.17098 19.1989 8.25 19 8.25Z"/><path d="M19 17.25H8C7.80109 17.25 7.61032 17.171 7.46967 17.0303C7.32902 16.8897 7.25 16.6989 7.25 16.5C7.25 16.3011 7.32902 16.1103 7.46967 15.9697C7.61032 15.829 7.80109 15.75 8 15.75H19C19.1989 15.75 19.3897 15.829 19.5303 15.9697C19.671 16.1103 19.75 16.3011 19.75 16.5C19.75 16.6989 19.671 16.8897 19.5303 17.0303C19.3897 17.171 19.1989 17.25 19 17.25Z"/><path d="M5.00002 8.50002C4.87 8.50161 4.74093 8.47783 4.62002 8.43002C4.50052 8.37204 4.3895 8.29802 4.29002 8.21002C4.19734 8.11658 4.12401 8.00576 4.07425 7.88392C4.02448 7.76209 3.99926 7.63163 4.00002 7.50002C4.0037 7.23525 4.10728 6.98165 4.29002 6.79002C4.38389 6.69742 4.49637 6.62583 4.62002 6.58002C4.86348 6.48 5.13656 6.48 5.38002 6.58002C5.50277 6.62761 5.61491 6.69898 5.71002 6.79002C5.89275 6.98165 5.99633 7.23525 6.00002 7.50002C6.00078 7.63163 5.97555 7.76209 5.92579 7.88392C5.87602 8.00576 5.8027 8.11658 5.71002 8.21002C5.61054 8.29802 5.49951 8.37204 5.38002 8.43002C5.25911 8.47783 5.13003 8.50161 5.00002 8.50002Z"/><path d="M5.00002 13C4.86934 12.9984 4.74024 12.9712 4.62002 12.92C4.49883 12.8693 4.38722 12.7983 4.29002 12.71C4.19734 12.6165 4.12401 12.5057 4.07425 12.3839C4.02448 12.262 3.99926 12.1316 4.00002 12C4.0037 11.7352 4.10728 11.4816 4.29002 11.29C4.38722 11.2016 4.49883 11.1306 4.62002 11.08C4.80104 10.996 5.00303 10.9682 5.20002 11L5.38002 11.06L5.56002 11.15C5.6124 11.1869 5.6625 11.227 5.71002 11.27C5.89749 11.4666 6.00144 11.7283 6.00002 12C6.00002 12.2652 5.89466 12.5195 5.70712 12.7071C5.51959 12.8946 5.26523 13 5.00002 13Z"/><path d="M4.99999 17.5C4.86998 17.5016 4.7409 17.4778 4.61999 17.43C4.50049 17.372 4.38947 17.298 4.28999 17.21C4.20166 17.1128 4.13063 17.0012 4.07999 16.88C4.02708 16.7603 3.99976 16.6309 3.99976 16.5C3.99976 16.3691 4.02708 16.2397 4.07999 16.12C4.13063 15.9988 4.20166 15.8872 4.28999 15.79C4.43061 15.6513 4.60919 15.5573 4.80317 15.5199C4.99716 15.4825 5.19788 15.5034 5.37999 15.58C5.50274 15.6276 5.61488 15.699 5.70999 15.79C5.79832 15.8872 5.86935 15.9988 5.91999 16.12C5.97289 16.2397 6.00022 16.3691 6.00022 16.5C6.00022 16.6309 5.97289 16.7603 5.91999 16.88C5.86935 17.0012 5.79832 17.1128 5.70999 17.21C5.61655 17.3027 5.50573 17.376 5.38389 17.4258C5.26206 17.4756 5.1316 17.5008 4.99999 17.5Z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.23001 18.25C6.17025 18.2535 5.15243 17.8363 4.40001 17.09C3.63614 16.2785 3.22341 15.1983 3.2515 14.0842C3.27958 12.97 3.74622 11.912 4.55001 11.14L8.31001 7.35C9.12729 6.50634 10.2456 6.0209 11.42 6C11.9475 6.00352 12.4692 6.11135 12.9549 6.3173C13.4406 6.52325 13.8807 6.82324 14.25 7.2C15.0243 8.01629 15.4433 9.10627 15.4152 10.231C15.387 11.3557 14.9141 12.4234 14.1 13.2L12.84 14.46C12.7713 14.5337 12.6885 14.5928 12.5965 14.6338C12.5045 14.6748 12.4052 14.6968 12.3045 14.6986C12.2038 14.7004 12.1038 14.6818 12.0104 14.6441C11.917 14.6064 11.8322 14.5503 11.761 14.479C11.6897 14.4078 11.6336 14.323 11.5959 14.2296C11.5582 14.1362 11.5396 14.0362 11.5414 13.9355C11.5432 13.8348 11.5652 13.7355 11.6062 13.6435C11.6472 13.5515 11.7063 13.4687 11.78 13.4L13 12.1C13.5247 11.6076 13.8338 10.9279 13.86 10.2088C13.8862 9.4897 13.6275 8.78933 13.14 8.26C12.6071 7.7953 11.9167 7.55197 11.2102 7.57986C10.5037 7.60774 9.83461 7.90474 9.34001 8.41L5.61001 12.19C5.09513 12.6812 4.79158 13.3535 4.76359 14.0646C4.73559 14.7757 4.98535 15.4698 5.46001 16C5.72088 16.2578 6.03529 16.4551 6.38093 16.5778C6.72657 16.7005 7.09497 16.7456 7.46001 16.71C7.55727 16.7004 7.65547 16.7101 7.74895 16.7386C7.84243 16.7671 7.92934 16.8139 8.00465 16.8762C8.07996 16.9385 8.14218 17.0151 8.18773 17.1015C8.23327 17.188 8.26124 17.2827 8.27001 17.38C8.28956 17.5775 8.23003 17.7747 8.10444 17.9284C7.97885 18.0821 7.79746 18.1798 7.60001 18.2L7.23001 18.25Z"/><path d="M12.58 18C12.0525 17.9965 11.5308 17.8887 11.0451 17.6827C10.5594 17.4768 10.1193 17.1768 9.75 16.8C8.97574 15.9837 8.55674 14.8937 8.58486 13.769C8.61297 12.6443 9.08592 11.5766 9.9 10.8L11.16 9.54C11.2287 9.46632 11.3115 9.40721 11.4035 9.36622C11.4955 9.32523 11.5948 9.30319 11.6955 9.30141C11.7962 9.29964 11.8962 9.31816 11.9896 9.35588C12.083 9.3936 12.1678 9.44975 12.239 9.52097C12.3103 9.59218 12.3664 9.67702 12.4041 9.77041C12.4418 9.86379 12.4604 9.96382 12.4586 10.0645C12.4568 10.1652 12.4348 10.2645 12.3938 10.3565C12.3528 10.4485 12.2937 10.5313 12.22 10.6L11 11.9C10.4753 12.3924 10.1662 13.0721 10.14 13.7912C10.1138 14.5103 10.3726 15.2107 10.86 15.74C11.3929 16.2047 12.0833 16.448 12.7898 16.4201C13.4963 16.3923 14.1654 16.0953 14.66 15.59L18.43 11.81C18.9393 11.3134 19.2355 10.6383 19.256 9.92727C19.2766 9.21626 19.0198 8.52513 18.54 8C18.2791 7.7422 17.9647 7.54495 17.6191 7.42224C17.2734 7.29954 16.905 7.2544 16.54 7.29C16.4427 7.29964 16.3445 7.28992 16.2511 7.2614C16.1576 7.23287 16.0707 7.18612 15.9954 7.12382C15.9201 7.06153 15.8578 6.98493 15.8123 6.89846C15.7667 6.81199 15.7388 6.71735 15.73 6.62C15.7104 6.42248 15.77 6.22527 15.8956 6.07156C16.0212 5.91786 16.2025 5.82021 16.4 5.8C16.9821 5.73967 17.5704 5.80779 18.1233 5.99959C18.6762 6.19138 19.1803 6.50216 19.6 6.91C20.3639 7.72153 20.7766 8.80172 20.7485 9.91585C20.7204 11.03 20.2538 12.088 19.45 12.86L15.69 16.65C14.8727 17.4937 13.7544 17.9791 12.58 18Z"/></svg>',
  contact: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><rect x="7" y="2.75" width="10" height="18.5" rx="2.5"/><path d="M10.5 5.25h3" stroke-width="1.8"/></svg>',
  experience: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><rect x="2.75" y="4.25" width="18.5" height="11.5" rx="1.5"/><path d="M12 15.75v3.5M8 19.25h8"/></svg>',
  cv: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><rect x="5.75" y="3.75" width="12.5" height="16.5" rx="1.25"/><path d="M9.5 3.75V2.5h5v1.25M9 10h6M9 13h6M9 16h4"/></svg>',
  stack: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><rect x="4.75" y="4.75" width="14.5" height="10" rx="1.25"/><path d="M2.5 17.75h19l-1.25 1.5H3.75z"/></svg>',
  about: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><rect x="6.25" y="2.25" width="11.5" height="15.5" rx="1.5"/><path d="M12 17.75v2M8.5 19.75h7"/></svg>',
  education: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><rect x="3.25" y="4.25" width="11" height="9" rx="1"/><rect x="9.75" y="10.75" width="11" height="9" rx="1"/></svg>',
  writing: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2"/><rect x="5" y="7.5" width="14" height="9" rx=".5" stroke-width="1"/></svg>',
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
 * guitar and the phone are played on purpose and keep their own controls), and a view
 * button that swaps between the desk and the wide shot: a camera while the room is at
 * the desk, play while it is up at the wide shot. `onSound(muted)` is told each press
 * of the sound button, `onView()` each press of the view button; the returned
 * `setWide(wide)` keeps the view button's glyph matching where the room actually is.
 * The sheet lists every live section in `MENU_ORDER`, each with its glyph; its rows
 * open through the same `[data-open]` delegation in `panels.js` the old pills used.
 */
function buildDock(dock, keys, anchors, onSound, onView) {
  const none = { setWide() {}, enter() {}, menuBtn: null };
  if (!dock) return none;
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

  // The view button. Starts as the camera: the dock first shows once the intro has
  // landed at the desk.
  const view = document.createElement('button');
  view.className = 'nav-btn is-icon glass';
  view.id = 'play-btn';
  view.addEventListener('click', () => onView?.());
  dock.appendChild(view);
  let wideGlyph = null;
  const setWide = (wide) => {
    if (wide === wideGlyph) return;
    wideGlyph = wide;
    view.innerHTML = wide ? ICONS.play : ICONS.camera;
    view.setAttribute('aria-label', wide ? 'Desk view' : 'Room view');
  };
  setWide(false);

  // Every button starts unseen: the dock is hidden under `body.begin` anyway, but the
  // click lifts that a beat before `enter()` runs, and nothing should show in between.
  for (const button of dock.children) button.style.opacity = '0';
  const enter = () => enterDock(menuBtn, [...dock.querySelectorAll('.is-icon')]);

  if (!menu) return { setWide, enter, menuBtn };
  for (const [key, icon] of MENU_ORDER) {
    if (!keys.includes(key)) continue;
    const item = document.createElement('button');
    item.className = 'menu-item';
    item.setAttribute('data-open', key);
    item.innerHTML = `${ICONS[icon]}<span>${anchors[key].label}</span>`;
    menu.appendChild(item);
  }
  setupMenu(menu, menuBtn);
  return { setWide, enter, menuBtn };
}

/**
 * The phone's intro blurb, born out of the Menu button: once the pill has landed, a
 * bubble rises from it, swells into a small disc and slides to the pane's bottom-left
 * corner, where it opens up and to the right into the pane, the text fading in once
 * there is room for it. Nothing on a desktop, where the blurb is not a pane.
 */
function enterBlurb(el, menuBtn, { delay = 800, duration = 1400 } = {}) {
  if (!el) return null;
  const circle = 44;
  const pane = DOMRect.fromRect(el.getBoundingClientRect());
  // Measured as laid out: on the way back from an orbit the pane is still slid down
  // by `body.orbiting`'s transform (see index.html), which the rect would include.
  const matrix = new DOMMatrix(getComputedStyle(el).transform);
  pane.x -= matrix.e;
  pane.y -= matrix.f;
  const from = { x: 0, y: 0 };
  if (menuBtn) {
    // Measured untransformed — the button's own droplet has it at scale(0) right now,
    // so its client rect is a point — and aimed at where that droplet's disc sits: the
    // pill's left end. The bubble's disc rests in the pane's bottom-left corner; this
    // puts its centre on the button's disc centre.
    const parent = menuBtn.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const left = parent.left + menuBtn.offsetLeft;
    const top = parent.top + menuBtn.offsetTop;
    const size = menuBtn.offsetHeight;
    from.x = left + size / 2 - (pane.left + circle / 2);
    from.y = top + size / 2 - (pane.bottom - circle / 2);
  }
  const drop = dropIn(el, {
    width: pane.width,
    height: pane.height,
    circle,
    // About its own centre, so the disc grows in place on the button rather than
    // off one corner; the pane's left and bottom are pinned by the stylesheet, so the
    // opening still spreads up and to the right.
    origin: 'center',
    from,
    travel: true,
    delay,
    label: [...el.children],
    duration,
  });
  drop.then(() => { el.style.opacity = ''; });
  return drop;
}

/**
 * The dock's entrance, played once as the intro flight starts. Menu arrives as the
 * droplet (`dropIn`), then the round buttons pop out of it in turn, each from inside
 * the one before it (52px plus the 10px gap), with a glint of brightness as it clears.
 */
function enterDock(menuBtn, icons) {
  dropIn(menuBtn, {
    width: menuBtn.offsetWidth,
    height: menuBtn.offsetHeight,
    label: menuBtn.querySelector('span'),
  }).then(() => { menuBtn.style.opacity = ''; });

  icons.forEach((icon, i) => {
    if (typeof icon.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      icon.style.opacity = '';
      return;
    }
    const pop = icon.animate([
      { offset: 0, transform: 'translateX(-62px) scale(.25)', opacity: 0, filter: 'brightness(1)' },
      { offset: 0.5, transform: 'translateX(-17px) scale(.9)', opacity: 1, filter: 'brightness(1.6)' },
      { offset: 1, transform: 'translateX(0) scale(1)', opacity: 1, filter: 'brightness(1)' },
    ], { duration: 650, delay: 900 + 260 * i, easing: SPRING_OVER, fill: 'both' });
    pop.onfinish = () => {
      pop.cancel();
      icon.style.opacity = '';
    };
  });
}

/**
 * Opens and closes the sheet: the button toggles it, a click anywhere else or Escape
 * closes it, and so does opening a section (`open()` calls `closeMenu`).
 */
let closeMenu = () => {};
function setupMenu(menu, button) {
  // The sheet opens as a droplet from the corner nearest the button — below it on a
  // desktop, above it on a phone — the rows fading in as it fills out. The stylesheet's
  // own transition still takes it away; a sheet closed mid-arrival drops the droplet.
  let opening = null;
  const set = (on) => {
    const was = menu.classList.contains('is-open');
    menu.classList.toggle('is-open', on);
    button.setAttribute('aria-expanded', String(on));
    if (on && !was) {
      opening?.cancel();
      opening = dropIn(menu, {
        width: menu.offsetWidth,
        height: menu.offsetHeight,
        circle: 44,
        origin: SHEET.matches ? 'left bottom' : 'left top',
        label: [...menu.children],
        soft: true,
        duration: 520,
        reveal: { step: 30, ms: 140, lead: 200 },
      });
    } else if (!on && opening) {
      opening.cancel();
      opening = null;
    }
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
