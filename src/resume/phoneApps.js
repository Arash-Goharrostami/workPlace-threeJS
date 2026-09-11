import { PROFILE } from './content.js';
import { setupPhonePlayer } from './phonePlayer.js';

/**
 * The iPhone's app icons, as the links they look like.
 *
 * Contact is not a section with a sidebar beside it — the phone *is* the section (see
 * `anchors.js`, which frames it on the screen's own panel). Once the camera is down on
 * the glass the icons are the interface: tapping Phone dials the number, Messages opens
 * an SMS to it, Gmail composes mail, and the rest go to their app or their web page.
 *
 * Built the same way `wallFrameFocus.js` is, and for the same reason: a section read on
 * its prop needs per-mesh hover and per-mesh click, which the room's prop-level picking
 * cannot give it. `index.js` owns the sequencing; this module owns which mesh is which
 * app, what each one opens, and what the HUD says about it.
 *
 * The Now Playing card at the top of the screen is taps too, and reaches `index.js`
 * through the same door — so this module tries the player first and falls through to the
 * tiles when the tap missed it. Which is only sequencing; `phonePlayer.js` owns the
 * audio and the transport.
 *
 * The hover feedback is the one thing it does *not* share with the frames. Those are
 * rimmed by `outline.js`, which skips transparent meshes — and every icon here is
 * transparent, because the artwork is a cut-out on its tile. So an icon lifts and swells
 * slightly under the pointer instead, which is closer to what a phone does anyway.
 */

export const PHONE = '+989115950737';

/** The number as WhatsApp and t.me want it: digits only, no leading `+`. */
const MSISDN = PHONE.replace(/\D/g, '');

const TELEGRAM = 'arashgoharrostami';
const INSTAGRAM = 'arash.goharrostami';
export const GITHUB = 'arash-goharrostami';
export const LINKEDIN = 'arash-goharrostami';

/**
 * Where each app goes.
 *
 * `tel:`, `sms:` and `mailto:` are followed as navigations, handing off to the machine's
 * own dialler, messages app and mail client. Everything else opens in a tab.
 *
 * Telegram and WhatsApp are reached through `t.me` and `wa.me` rather than through their
 * `tg://` and `whatsapp://` schemes. Those two pages *are* the handoff — they hand the
 * chat to the installed app on a phone and offer to open the desktop client otherwise —
 * and unlike a raw scheme they still land somewhere when the app is not installed. A
 * scheme tried first with the web URL on a timer behind it is the usual trick, and it
 * opens a stray tab every time the app *does* take over.
 *
 * The dock comes first, in the order it reads on screen from the left. Both lists are
 * reversed on the way into the table below, because `iphone15Pro.js` reverses its own:
 * the phone's body carries a half turn, so a row runs back to front against the model's
 * x and `iphone-dock-icon-1` is the **rightmost** tile. Written on-screen and reversed
 * once, rather than typed out backwards, so these read like the phone does.
 */
const DOCK = [
  { label: 'Phone', view: 'Contact — call', href: `tel:${PHONE}` },
  { label: 'Messages', view: 'Contact — SMS', href: `sms:${PHONE}` },
  { label: 'Telegram', view: 'Contact — Telegram', href: `https://t.me/${TELEGRAM}` },
  { label: 'Instagram', view: 'Contact — Instagram', href: `https://instagram.com/${INSTAGRAM}` },
];

/** The home row above it, same convention. */
const HOME = [
  { label: 'GitHub', view: 'Contact — GitHub', href: `https://github.com/${GITHUB}` },
  {
    label: 'Gmail',
    view: 'Contact — email',
    href: `mailto:${PROFILE.email}?subject=${encodeURIComponent('Hello from your site')}`,
  },
  { label: 'LinkedIn', view: 'Contact — LinkedIn', href: `https://linkedin.com/in/${LINKEDIN}` },
  { label: 'WhatsApp', view: 'Contact — WhatsApp', href: `https://wa.me/${MSISDN}` },
];

/**
 * Mesh name → app. The names are `iphone15Pro.js`'s own, given to the tiles as they are
 * laid out, and are **load-bearing** in the way the material names in `wallFrameFocus.js`
 * are: they are the only handle on which tile is which.
 */
const APPS = new Map([
  ...[...DOCK].reverse().map((app, i) => [`iphone-dock-icon-${i + 1}`, app]),
  ...[...HOME].reverse().map((app, i) => [`iphone-home-icon-${i + 1}`, app]),
]);

/** How far an icon lifts off the glass under the pointer, in metres. */
const LIFT = 0.0016;

/** And how much it swells, so the lift reads from straight above as well as at an angle. */
const SWELL = 1.09;

export function setupPhoneApps({ group }) {
  // The card `iphone15Pro.js` left on the phone root, if this phone has one.
  const card = group.userData.player;
  const player = card ? setupPhonePlayer(card) : null;

  /** The icon meshes, by the app they open — resolved once, off the names above. */
  const icons = new Map();

  group.traverse((node) => {
    const app = node.isMesh && APPS.get(node.name);
    if (!app) return;
    icons.set(node, { ...app, rest: node.position.y, scale: node.scale.x });
  });

  if (icons.size !== APPS.size) {
    console.warn(
      `[phone] ${icons.size} of ${APPS.size} app icons found — were the tiles renamed?`
    );
  }

  let lifted = null;

  /** The icon `object` belongs to, or null for the wallpaper, the bezel, or the body. */
  const iconFor = (object) => {
    for (let node = object; node; node = node.parent) {
      if (icons.has(node)) return node;
      if (node === group) break;
    }
    return null;
  };

  /**
   * Whether anything on the screen is under the pointer — a player control or an app
   * tile — which is what tells `picking.js` to show a pointer cursor. The card is asked
   * first, since it sits over the wallpaper the tiles are laid on.
   */
  const hover = (object) => {
    // A control on the card takes the pointer before the tiles ever see it.
    if (player?.hover(object)) {
      hoverIcon(null);
      return true;
    }
    return hoverIcon(object);
  };

  /**
   * Lifts the tile under the pointer and returns whether there is one. With no other
   * chrome on screen, that lift is the whole of the affordance saying the tiles are
   * tappable.
   */
  const hoverIcon = (object) => {
    const icon = object && iconFor(object);
    if (icon === lifted) return Boolean(icon);

    if (lifted) {
      const was = icons.get(lifted);
      lifted.position.y = was.rest;
      lifted.scale.setScalar(was.scale);
    }
    lifted = icon ?? null;
    if (lifted) {
      const now = icons.get(lifted);
      lifted.position.y = now.rest + LIFT;
      lifted.scale.setScalar(now.scale * SWELL);
    }
    return Boolean(icon);
  };

  const reset = () => {
    player?.reset();
    hoverIcon(null);
  };

  /**
   * Works the tap: a control on the Now Playing card if it landed there, otherwise
   * whatever app tile it hit. Returns the HUD line for it, or null when the click landed
   * off both — which is what lets `index.js` treat a click on the
   * bezel as the step back out to the room that it is for every other prop.
   */
  const open = (object, hit) => {
    const played = player?.open(object, hit);
    if (played) return played;

    const icon = object && iconFor(object);
    if (!icon) return null;
    const app = icons.get(icon);

    // A handoff to the machine's own dialler, messages app or mail client: a navigation,
    // not a tab. The browser hands it over and leaves the room where it is.
    if (/^(tel|sms|mailto):/.test(app.href)) window.location.href = app.href;
    else openTab(app.href);
    return app.view;
  };

  return { hover, reset, open, get count() { return icons.size; } };
}

/** A new tab, never with a handle back to this one — see the `links` rows in `panels.js`. */
function openTab(href) {
  window.open(href, '_blank', 'noopener,noreferrer');
}
