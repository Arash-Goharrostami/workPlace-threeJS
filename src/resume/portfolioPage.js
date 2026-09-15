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
 */

/** A4 at 150 dpi. */
export const PAGE_W = 1240;
export const PAGE_H = 1754;

const PAPER = '#f2efe8';
const INK = '#1b1b1f';
const INK_DIM = '#45494f';
const RULE = '#c9c6bf';

/** How many of a role's bullet points make the sheet. */
const POINTS_PER_ROLE = 2;

/** Type sizes in canvas pixels, and line heights as multiples of them. */
const T = {
  name: 54,
  role: 24,
  meta: 19,
  heading: 17,
  body: 19,
  small: 17,
  lead: 1.4,
};

/** Draws the sheet and returns the canvas. */
export function drawPortfolioPage() {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const margin = 84;
  const width = PAGE_W - margin * 2;
  let y = margin;

  y = header(ctx, margin, y, width);
  y = summary(ctx, margin, y, width);
  y = experience(ctx, margin, y, width);
  y = projects(ctx, margin, y, width);
  y = stack(ctx, margin, y, width);
  y = education(ctx, margin, y, width);
  footer(ctx, margin, width);

  return canvas;
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
    for (const point of item.points.slice(0, POINTS_PER_ROLE)) {
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

  const cards = section.blocks.find((b) => b.kind === 'cards');
  for (const card of cards?.items ?? []) {
    ctx.fillStyle = INK;
    ctx.font = `600 ${T.body}px ${FONT}`;
    const title = `${card.title} — `;
    ctx.fillText(title, x, y);
    const indent = ctx.measureText(title).width;

    ctx.font = `400 ${T.body}px ${FONT}`;
    const first = wrap(ctx, card.desc, width - indent);
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
  const y = PAGE_H - 84 - T.small;
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
