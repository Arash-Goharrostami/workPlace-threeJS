/**
 * The liquid-glass entrance shared by the begin prompt and the dock: a point that
 * swells into a circle — a hair too far, then back — and is drawn out sideways into
 * its pill. Done with the Web Animations API rather than CSS because the pill's
 * resting width is only known once it is laid out, and `width` is what is animated.
 */

/** iOS's soft spring: quick out of the gate, a long gentle settle. */
export const SPRING = 'cubic-bezier(.2, .8, .2, 1)';
/** The same with an overshoot, for a thing popping free of another. */
export const SPRING_OVER = 'cubic-bezier(.34, 1.45, .5, 1)';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * The text inside an opened shape: unseen (`DIM`) while the glass opens, and once the
 * shape has settled each line lights up in turn, top to bottom, `REVEAL_STEP` ms
 * apart, each taking `REVEAL_MS`.
 */
const DIM = 0;
const REVEAL_STEP = 60;
const REVEAL_MS = 220;

/**
 * Plays the droplet on `el`, ending at `width` × `height` (its resting size, measured
 * by the caller). It starts as a disc `circle` px across — the pill's own height by
 * default, so a pill only ever grows sideways; a pane gives a smaller one and opens
 * in both directions. `origin` is where the point sits: the pill's left end by
 * default, its middle for one centred on the screen, a corner for a pane. `from` is
 * where the disc is born, in px from its resting spot — a bubble that leaves one
 * thing and opens somewhere else slides over as it grows. `label`, one element or
 * several, is faded up over the last stretch, once there is room for it. Resolves
 * when the shape has settled; the animations are cancelled then, so the element's
 * own styles take over. The promise carries a `cancel()` for a shape dismissed
 * mid-arrival. `overshoot: false` lets the disc grow straight to size with no swing
 * past it; `travel: true` is for a bubble born at `from` — it grows there, crosses as
 * a disc and only then opens; `soft: true` is one continuous motion from a small disc
 * to the full shape, for a sheet that should simply open. `reveal` sets the pace the
 * lines light up at afterwards (see `REVEAL_STEP`).
 */
export function dropIn(el, {
  width, height, circle = height, label, origin = 'left center', from = { x: 0, y: 0 }, delay = 0, duration = 1100,
  overshoot = true, travel = false, soft = false, reveal = {},
}) {
  if (REDUCED.matches || typeof el.animate !== 'function') {
    return Object.assign(Promise.resolve(), { cancel() {} });
  }

  const disc = `${circle}px`;
  const away = `translate(${from.x}px, ${from.y}px)`;
  const home = 'translate(0, 0)';
  const full = { width: `${width}px`, height: `${height}px` };
  el.style.transformOrigin = origin;
  const keyframes = soft
    // One continuous motion, for a sheet that should simply open.
    ? [
      { offset: 0, width: disc, height: disc, transform: `${home} scale(.4)`, opacity: 0, easing: SPRING },
      { offset: 1, ...full, transform: `${home} scale(1)`, opacity: 1 },
    ]
    : travel
      // Born elsewhere: grow into a disc there, cross as a disc, open on arrival.
      ? [
        { offset: 0, width: disc, height: disc, transform: `${away} scale(0)`, opacity: 0, easing: SPRING },
        { offset: 0.3, width: disc, height: disc, transform: `${away} scale(1)`, opacity: 1, easing: SPRING },
        { offset: 0.55, width: disc, height: disc, transform: `${home} scale(1)`, easing: SPRING },
        { offset: 0.8, width: `${width * 1.03}px`, height: `${height * 1.02}px`, transform: `${home} scale(1)`, easing: SPRING },
        { offset: 1, ...full, transform: `${home} scale(1)`, opacity: 1 },
      ]
      : [
        { offset: 0, width: disc, height: disc, transform: `${away} scale(0)`, opacity: 0, easing: SPRING },
        ...(overshoot
          ? [
            { offset: 0.18, width: disc, height: disc, transform: `${away} scale(1.18)`, opacity: 1, easing: SPRING },
            { offset: 0.3, width: disc, height: disc, transform: `${away} scale(.96)`, easing: SPRING },
          ]
          : [
            { offset: 0.2, width: disc, height: disc, transform: `${away} scale(.9)`, opacity: 1, easing: SPRING },
          ]),
        { offset: 0.4, width: disc, height: disc, transform: `${away} scale(1)`, easing: SPRING },
        { offset: 0.7, width: `${width * 1.04}px`, height: `${height * 1.02}px`, transform: `${home} scale(1)`, easing: SPRING },
        { offset: 1, ...full, transform: `${home} scale(1)`, opacity: 1 },
      ];
  const drop = el.animate(keyframes, { duration, delay, fill: 'both' });
  const labelFrom = soft ? 0.4 : travel ? 0.7 : 0.55;
  const labels = Array.isArray(label) ? label : label ? [label] : [];
  const labelsIn = labels.map((node) => node.animate([
    { offset: 0, opacity: 0 },
    { offset: labelFrom, opacity: 0 },
    { offset: 1, opacity: DIM },
  ], { duration, delay, fill: 'both' }));
  // `reveal` overrides the pace: `step` and `ms` as the constants, `lead` how far
  // before the shape has settled the first line may start.
  const { step = REVEAL_STEP, ms = REVEAL_MS, lead = 0 } = reveal;
  const reveals = labels.map((node, i) => {
    const lightUp = node.animate([{ opacity: DIM }, { opacity: 1 }], {
      duration: ms, delay: delay + duration - lead + i * step, easing: 'ease', fill: 'both',
    });
    // The hold goes first: a line lit before the shape has settled would otherwise drop
    // back to unseen the moment its light-up is cancelled, until `drop.onfinish` clears it.
    lightUp.onfinish = () => { labelsIn[i].cancel(); lightUp.cancel(); };
    return lightUp;
  });

  const cancel = () => {
    drop.cancel();
    for (const a of labelsIn) a.cancel();
    for (const a of reveals) a.cancel();
    el.style.transformOrigin = '';
  };
  const done = new Promise((resolve) => {
    drop.onfinish = () => {
      // The shape is done; the lines go on lighting up and tidy up after themselves.
      drop.cancel();
      for (const a of labelsIn) a.cancel();
      el.style.transformOrigin = '';
      resolve();
    };
  });
  return Object.assign(done, { cancel });
}

/**
 * The press: the button wobbles like a drop of liquid — squashed wide, then tall, then
 * settling through a couple of smaller swings. Fire-and-forget, cancelled once done so
 * nothing lingers on the element.
 */
export function jiggle(el) {
  if (!el || REDUCED.matches || typeof el.animate !== 'function') return;
  const wobble = el.animate([
    { transform: 'scale(1, 1)' },
    { transform: 'scale(1.14, .86)' },
    { transform: 'scale(.92, 1.08)' },
    { transform: 'scale(1.04, .96)' },
    { transform: 'scale(.99, 1.01)' },
    { transform: 'scale(1, 1)' },
  ], { duration: 550, easing: 'ease' });
  wobble.onfinish = () => wobble.cancel();
}
