import { PROFILE, SECTIONS } from './content.js';
import { PHONE, GITHUB, LINKEDIN } from './phoneApps.js';
import { FONT, wrap } from './screen.js';

/**
 * The whole CV on one sheet of A4, drawn to a canvas — the page the paper tablet on the
 * desk shows (`src/paperTablet.js`).
 *
 * Everything on it is read out of `content.js`, the same data the sidebar and the screens
 * are built from, so the sheet follows the copy: change a role there and the tablet
 * changes with it. What this file adds is only the *condensing* — which of a role's
 * points make the page, how many lines a project gets — because the screens have room
 * to scroll and a sheet of paper does not.
 *
 * It is a page, not a screen: black ink on off-white, set in the room's own face. The
 * canvas is portrait A4 at 150 dpi, which is enough to read from the tablet's distance
 * without paying for a 4K map on a 20 cm prop.
 *
 * And it is *one* page, whatever the copy grows to. The sheet is laid out, measured
 * against the footer and, if it runs past, laid out again with less — what it gives up,
 * in order: the rest of a project's description after its first sentence and a role's
 * second bullet (`LEVEL` 1); the side projects after the first two (`LEVEL` 2); and only
 * then the type, a step at a time down to `MIN_SCALE`. Header, summary, education and
 * footer are never cut: the page stays a complete CV, and it is the middle that condenses.
 */

/** A4 at 150 dpi. */
export const PAGE_W = 1240;
export const PAGE_H = 1754;

const PAPER = '#f2efe8';
const INK = '#1b1b1f';
const INK_DIM = '#45494f';
const RULE = '#c9c6bf';

/** How many of a role's bullet points make the sheet at full length. */
const POINTS_PER_ROLE = 2;

/** How many side projects survive the second round of condensing. */
const CARDS_KEPT = 2;

/** How far the type may shrink before the page is called full, and by what steps. */
const MIN_SCALE = 0.8;
const SCALE_STEP = 0.05;

/** Type sizes in canvas pixels at a given scale, and line height as a multiple. */
function sizes(scale) {
  return {
    name: 54 * scale,
    role: 24 * scale,
    meta: 19 * scale,
    heading: 17 * scale,
    body: 19 * scale,
    small: 17 * scale,
    lead: 1.4,
  };
}

/** The pass being drawn: its type sizes and how much has been given up. Set by `layout`. */
let T = sizes(1);
let LEVEL = 0;

const MARGIN = 84;

/** Where the footer's rule sits; the body has to end above it. */
function footerTop() {
  return PAGE_H - MARGIN - T.small * 2 - T.body;
}

/** Canvas pixels per page unit; the sheet on the desk is drawn denser than the PDF. */
let DENSITY = 1;

/** Draws the sheet and returns the canvas, `density` times PAGE_W across. */
export function drawPortfolioPage(density = 1) {
  DENSITY = density;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE_W * density);
  canvas.height = Math.round(PAGE_H * density);
  const ctx = canvas.getContext('2d');

  // Lay it out until it fits: first with less copy, then with smaller type. The last
  // pass stays on the canvas whether or not it fit — at the floor there is nothing
  // more to give, and a crowded footer beats a missing one.
  const passes = [];
  for (let level = 0; level <= 2; level++) passes.push([1, level]);
  for (let scale = 1 - SCALE_STEP; scale >= MIN_SCALE - 1e-9; scale -= SCALE_STEP) {
    passes.push([scale, 2]);
  }
  for (const [scale, level] of passes) {
    if (layout(ctx, scale, level) <= footerTop()) break;
  }

  return canvas;
}

/** One complete drawing of the sheet at `scale` and `level`; returns where the body ends. */
function layout(ctx, scale, level) {
  T = sizes(scale);
  LEVEL = level;

  ctx.setTransform(DENSITY, 0, 0, DENSITY, 0, 0);
  ctx.textAlign = 'left';
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const width = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  y = header(ctx, MARGIN, y, width);
  y = summary(ctx, MARGIN, y, width);
  y = experience(ctx, MARGIN, y, width);
  y = projects(ctx, MARGIN, y, width);
  y = stack(ctx, MARGIN, y, width);
  y = education(ctx, MARGIN, y, width);
  footer(ctx, MARGIN, width);

  return y;
}

/**
 * The bullets a one-page CV keeps: the hard part and the result of a case study over
 * the how, else the first ones.
 */
function sheetPoints(points, n) {
  const pick = (label) => points.find((p) => p.startsWith(label));
  const chosen = [pick('The hard part'), pick('Result')].filter(Boolean);
  for (const p of points) if (chosen.length < n && !chosen.includes(p)) chosen.push(p);
  return chosen.slice(0, n);
}

/** The first sentence of a description, for when the page has no room for the rest. */
function firstSentence(text) {
  const end = text.search(/[.!?](\s|$)/);
  return end === -1 ? text : text.slice(0, end + 1);
}

function header(ctx, x, y, width) {
  ctx.fillStyle = INK;
  ctx.font = `600 ${T.name}px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(PROFILE.name, x, y);
  y += T.name * 1.15;

  ctx.fillStyle = INK_DIM;
  ctx.font = `400 ${T.role}px ${FONT}`;
  ctx.fillText(PROFILE.role, x, y);
  y += T.role * 1.5;

  // Two lines rather than one: on one it runs past the page's right edge.
  ctx.font = `400 ${T.meta}px ${FONT}`;
  ctx.fillText([PROFILE.email, PHONE, 'Tehran, Iran'].join('   ·   '), x, y);
  y += T.meta * T.lead;
  ctx.fillText([`github.com/${GITHUB}`, `linkedin.com/in/${LINKEDIN}`].join('   ·   '), x, y);
  y += T.meta * 1.6;

  return rule(ctx, x, y, width);
}

function summary(ctx, x, y, width) {
  const about = SECTIONS.about;
  y = heading(ctx, x, y, about.eyebrow);

  const intro = about.blocks.find((b) => b.kind === 'intro');
  if (intro) {
    ctx.fillStyle = INK;
    y = paragraph(ctx, x, y, width, intro.text, T.body);
  }

  const stats = about.blocks.find((b) => b.kind === 'stats');
  if (stats) {
    y += T.small * 0.4;
    ctx.font = `400 ${T.small}px ${FONT}`;
    ctx.fillStyle = INK_DIM;
    ctx.fillText(
      stats.cells.map((c) => `${c.label}: ${c.value}`).join('   ·   '),
      x,
      y
    );
    y += T.small * T.lead;
  }
  return y + T.body * 0.6;
}

function experience(ctx, x, y, width) {
  const section = SECTIONS.experience;
  y = heading(ctx, x, y, section.eyebrow);

  const timeline = section.blocks.find((b) => b.kind === 'timeline');
  for (const item of timeline?.items ?? []) {
    ctx.fillStyle = INK;
    ctx.font = `600 ${T.body}px ${FONT}`;
    ctx.fillText(item.role, x, y);

    ctx.fillStyle = INK_DIM;
    ctx.font = `400 ${T.small}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(item.date, x + width, y + (T.body - T.small) / 2);
    ctx.textAlign = 'left';
    y += T.body * T.lead;

    ctx.fillText(item.org, x, y);
    y += T.small * T.lead;

    ctx.fillStyle = INK;
    ctx.font = `400 ${T.body}px ${FONT}`;
    for (const point of sheetPoints(item.points, LEVEL >= 1 ? 1 : POINTS_PER_ROLE)) {
      y = bullet(ctx, x, y, width, point, T.body);
    }
    y += T.body * 0.5;
  }
  return y + T.body * 0.2;
}

function projects(ctx, x, y, width) {
  const section = SECTIONS.experience;
  const label = section.blocks.find((b) => b.kind === 'heading')?.text ?? 'Projects';
  y = heading(ctx, x, y, label);

  const cards = section.blocks.find((b) => b.kind === 'cards')?.items ?? [];
  for (const card of LEVEL >= 2 ? cards.slice(0, CARDS_KEPT) : cards) {
    ctx.fillStyle = INK;
    ctx.font = `600 ${T.body}px ${FONT}`;
    const title = `${card.title} — `;
    ctx.fillText(title, x, y);
    const indent = ctx.measureText(title).width;

    ctx.font = `400 ${T.body}px ${FONT}`;
    const desc = LEVEL >= 1 ? firstSentence(card.desc) : card.desc;
    const first = wrap(ctx, desc, width - indent);
    ctx.fillText(first[0], x + indent, y);
    y += T.body * T.lead;
    if (first.length > 1) {
      y = paragraph(ctx, x, y, width, first.slice(1).join(' '), T.body);
    }
    y += T.body * 0.25;
  }
  return y + T.body * 0.4;
}

function stack(ctx, x, y, width) {
  const section = SECTIONS.skills;
  y = heading(ctx, x, y, section.eyebrow);

  const skills = section.blocks.find((b) => b.kind === 'skills');
  for (const group of skills?.groups ?? []) {
    ctx.fillStyle = INK_DIM;
    ctx.font = `600 ${T.small}px ${FONT}`;
    const label = `${group.title}  `;
    ctx.fillText(label, x, y + (T.body - T.small) / 2);
    const indent = Math.max(ctx.measureText(label).width, 150);

    ctx.fillStyle = INK;
    ctx.font = `400 ${T.body}px ${FONT}`;
    y = paragraph(ctx, x + indent, y, width - indent, group.tags.map((tag) => tag.name ?? tag).join(', '), T.body);
  }
  return y + T.body * 0.6;
}

function education(ctx, x, y, width) {
  const section = SECTIONS.education;
  y = heading(ctx, x, y, section.eyebrow);

  const cards = section.blocks.find((b) => b.kind === 'cards');
  for (const card of cards?.items ?? []) {
    ctx.fillStyle = INK;
    ctx.font = `600 ${T.body}px ${FONT}`;
    ctx.fillText(card.title, x, y);

    ctx.fillStyle = INK_DIM;
    ctx.font = `400 ${T.small}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(card.meta, x + width, y + (T.body - T.small) / 2);
    ctx.textAlign = 'left';
    y += T.body * T.lead;
    ctx.fillText(card.desc, x, y);
    y += T.small * T.lead;
  }

  const languages = section.blocks.find((b) => b.kind === 'skills');
  for (const group of languages?.groups ?? []) {
    ctx.fillStyle = INK_DIM;
    ctx.font = `600 ${T.small}px ${FONT}`;
    const label = `${group.title}  `;
    ctx.fillText(label, x, y);
    ctx.fillStyle = INK;
    ctx.font = `400 ${T.small}px ${FONT}`;
    ctx.fillText(group.tags.map((tag) => tag.name ?? tag).join(', '), x + Math.max(ctx.measureText(label).width, 150), y);
    y += T.small * T.lead;
  }
  return y;
}

function footer(ctx, x, width) {
  const y = PAGE_H - MARGIN - T.small;
  rule(ctx, x, y - T.small, width);
  ctx.fillStyle = INK_DIM;
  ctx.font = `400 ${T.small}px ${FONT}`;
  ctx.fillText(`${PROFILE.name} — ${PROFILE.role}`, x, y);
  ctx.textAlign = 'right';
  ctx.fillText(PROFILE.email, x + width, y);
  ctx.textAlign = 'left';
}

/** A tracked-out small-caps section label with a rule under it. */
function heading(ctx, x, y, text) {
  ctx.fillStyle = INK_DIM;
  ctx.font = `600 ${T.heading}px ${FONT}`;
  ctx.fillText(text.toUpperCase().split('').join(' '), x, y);
  y += T.heading * 1.5;
  ctx.fillStyle = RULE;
  ctx.fillRect(x, y, PAGE_W - x * 2, 2);
  return y + T.heading * 0.9;
}

function rule(ctx, x, y, width) {
  ctx.fillStyle = RULE;
  ctx.fillRect(x, y, width, 2);
  return y + T.body;
}

function paragraph(ctx, x, y, width, text, size) {
  ctx.font = `400 ${size}px ${FONT}`;
  for (const line of wrap(ctx, text, width)) {
    ctx.fillText(line, x, y);
    y += size * T.lead;
  }
  return y;
}

function bullet(ctx, x, y, width, text, size) {
  const indent = size * 1.2;
  ctx.fillText('•', x + size * 0.2, y);
  return paragraph(ctx, x + indent, y, width - indent, text, size);
}
