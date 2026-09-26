#!/usr/bin/env node
/**
 * Lays out the car magazine's pages (see `src/magazine.js`) from the photos in
 * `tmp/magazine/` and writes them to `public/textures/magazine/`:
 *
 *     npm run magazine
 *
 * Three spreads, one car each. The left page is the photo, cropped to the page and run
 * to the edges, with the headline over it; the right page is the feature — the whole car,
 * a few lines about it and a spec box. Text is SVG composited by sharp, so the layout
 * lives here and the scene only ever loads six small JPEGs.
 *
 * The photos are Wikimedia Commons files, kept in `tmp/` under their source names, and
 * each is credited on its own page as its licence asks:
 *   - Porsche_911,_EMS_2024,_Essen_(P1032183).jpg — Matti Blume, CC BY-SA 4.0
 *   - Ferrari_296_GTB_DSC_6997.jpg — Alexander Migl, CC BY-SA 4.0
 *   - 1961_Jaguar_E-Type_3,8,_Tour_Auto_2015,_Toulouse.jpg — Handelsgeselschaft, CC BY-SA 4.0
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'tmp/magazine';
const OUT = 'public/textures/magazine';

/** A page, in pixels — the open book's page is 19.7 × 27.2 units, so about 0.72:1. */
const W = 768;
const H = 1064;
const QUALITY = 80;

const MASTHEAD = 'AUTO REVUE';

const CARS = [
  {
    file: 'Porsche_911,_EMS_2024,_Essen_(P1032183).jpg',
    credit: 'Photo: Matti Blume / Wikimedia Commons, CC BY-SA 4.0 (cropped)',
    // Where the portrait crop for the left page is centred, as a fraction of the width.
    focus: 0.3,
    accent: '#c8102e',
    kicker: 'DRIVEN',
    make: 'Porsche',
    model: '911 Carrera GTS',
    tagline: 'Sixty years on, still the benchmark.',
    body: [
      'The 992-generation GTS sits right where a 911 makes the most',
      'sense: sharper than a Carrera S, calmer than a GT3, and quick',
      'enough to embarrass cars twice its price on a mountain road.',
      'Rear-engined, rear-biased, and utterly usable every day.',
    ],
    specs: [
      ['Engine', '3.0 L twin-turbo flat-six'],
      ['Power', '480 PS'],
      ['0–100 km/h', '3.4 s'],
      ['Top speed', '311 km/h'],
    ],
    issue: 'ISSUE 01',
  },
  {
    file: 'Ferrari_296_GTB_DSC_6997.jpg',
    credit: 'Photo: Alexander Migl / Wikimedia Commons, CC BY-SA 4.0 (cropped)',
    focus: 0.62,
    accent: '#d40000',
    kicker: 'FIRST LOOK',
    make: 'Ferrari',
    model: '296 GTB',
    tagline: 'Six cylinders and a plug. No apologies.',
    body: [
      'Maranello’s first road-going V6 is a plug-in hybrid that',
      'can glide out of town in silence, then wake a 120-degree',
      'twin-turbo V6 that revs to 8,500 rpm. Short wheelbase,',
      'tiny overhangs, and a shape that owes a nod to the 250 LM.',
    ],
    specs: [
      ['Powertrain', '3.0 L V6 + e-motor'],
      ['Power', '830 cv'],
      ['0–100 km/h', '2.9 s'],
      ['Top speed', '330+ km/h'],
    ],
    issue: 'ISSUE 01',
  },
  {
    file: '1961_Jaguar_E-Type_3,8,_Tour_Auto_2015,_Toulouse.jpg',
    credit: 'Photo: Handelsgeselschaft / Wikimedia Commons, CC BY-SA 4.0 (cropped)',
    focus: 0.3,
    accent: '#1f6f8b',
    kicker: 'CLASSIC',
    make: 'Jaguar',
    model: 'E-Type 3.8',
    tagline: 'The most beautiful car ever made?',
    body: [
      'Unveiled at Geneva in 1961, the E-Type offered 150 mph for',
      'a fraction of an Aston or a Ferrari. This one still earns',
      'its keep, racing the Tour Auto in lightweight livery — long',
      'bonnet, covered headlamps and a straight-six up front.',
    ],
    specs: [
      ['Engine', '3.8 L straight-six'],
      ['Power', '265 bhp'],
      ['0–100 km/h', '7.0 s'],
      ['Top speed', '240 km/h'],
    ],
    issue: 'ISSUE 01',
  },
];

const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The left page: the photo cropped to the page, darkened at the foot under the headline. */
async function leftPage(car, n) {
  const src = sharp(`${SRC}/${car.file}`);
  const { width, height } = await src.metadata();
  const cropW = Math.round(height * (W / H));
  const left = Math.max(0, Math.min(width - cropW, Math.round(width * car.focus - cropW / 2)));
  const photo = await src.extract({ left, top: 0, width: cropW, height }).resize(W, H).toBuffer();

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.85"/>
      </linearGradient>
      <linearGradient id="head" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#000" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="170" fill="url(#head)"/>
    <text x="48" y="92" font-family="${SANS}" font-weight="900" font-size="64" letter-spacing="6" fill="#fff">${MASTHEAD}</text>
    <text x="50" y="128" font-family="${SANS}" font-size="20" letter-spacing="3" fill="#fff">${car.issue}</text>
    <rect y="${H - 420}" width="${W}" height="420" fill="url(#foot)"/>
    <rect x="48" y="${H - 300}" width="${car.kicker.length * 17 + 28}" height="40" fill="${car.accent}"/>
    <text x="62" y="${H - 272}" font-family="${SANS}" font-weight="700" font-size="22" letter-spacing="3" fill="#fff">${car.kicker}</text>
    <text x="46" y="${H - 190}" font-family="${SERIF}" font-weight="700" font-size="84" fill="#fff">${esc(car.make)}</text>
    <text x="48" y="${H - 128}" font-family="${SANS}" font-weight="300" font-size="44" fill="#fff">${esc(car.model)}</text>
    <text x="48" y="${H - 34}" font-family="${SANS}" font-size="14" fill="#fff" fill-opacity="0.7">${esc(car.credit)}</text>
    <text x="${W - 48}" y="${H - 34}" text-anchor="end" font-family="${SANS}" font-size="16" fill="#fff" fill-opacity="0.8">${n * 2}</text>
  </svg>`;

  return sharp(photo).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
}

/** The right page: the whole car, a short piece about it and the spec box. */
async function rightPage(car, n) {
  const PAD = 56;
  const photoW = W - PAD * 2;
  const photoH = Math.round(photoW / 1.75);
  const photoTop = 180;
  const photo = await sharp(`${SRC}/${car.file}`).resize(photoW, photoH, { fit: 'cover' }).toBuffer();

  const bodyTop = photoTop + photoH + 88;
  const specTop = bodyTop + car.body.length * 34 + 28;
  const specRow = 46;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#f7f4ee"/>
    <text x="${PAD}" y="70" font-family="${SANS}" font-weight="700" font-size="18" letter-spacing="4" fill="${car.accent}">${car.kicker}</text>
    <text x="${W - PAD}" y="70" text-anchor="end" font-family="${SANS}" font-size="16" letter-spacing="3" fill="#888">${MASTHEAD}</text>
    <line x1="${PAD}" y1="88" x2="${W - PAD}" y2="88" stroke="#222" stroke-width="2"/>
    <text x="${PAD}" y="150" font-family="${SERIF}" font-style="italic" font-size="38" fill="#111">${esc(car.tagline)}</text>
    <text x="${PAD}" y="${photoTop + photoH + 24}" font-family="${SANS}" font-size="12" fill="#999">${esc(car.credit)}</text>
    <text x="${PAD}" y="${photoTop + photoH + 64}" font-family="${SANS}" font-weight="700" font-size="26" fill="#111">${esc(car.make)} ${esc(car.model)}</text>
    ${car.body.map((line, i) => `<text x="${PAD}" y="${bodyTop + i * 34}" font-family="${SERIF}" font-size="21" fill="#333">${esc(line)}</text>`).join('\n    ')}
    <rect x="${PAD}" y="${specTop}" width="${W - PAD * 2}" height="${specRow * car.specs.length + 24}" fill="#111"/>
    <rect x="${PAD}" y="${specTop}" width="8" height="${specRow * car.specs.length + 24}" fill="${car.accent}"/>
    ${car.specs.map(([k, v], i) => `
    <text x="${PAD + 32}" y="${specTop + 44 + i * specRow}" font-family="${SANS}" font-size="18" letter-spacing="2" fill="#aaa">${esc(k.toUpperCase())}</text>
    <text x="${W - PAD - 28}" y="${specTop + 44 + i * specRow}" text-anchor="end" font-family="${SANS}" font-weight="700" font-size="24" fill="#fff">${esc(v)}</text>`).join('')}
    <text x="${W - PAD}" y="${H - 18}" text-anchor="end" font-family="${SANS}" font-size="16" fill="#888">${n * 2 + 1}</text>
  </svg>`;

  return sharp(Buffer.from(svg))
    .composite([{ input: photo, left: PAD, top: photoTop }])
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();
}

await mkdir(OUT, { recursive: true });
for (const [i, car] of CARS.entries()) {
  const n = i + 1;
  for (const [side, make] of [['left', leftPage], ['right', rightPage]]) {
    const path = `${OUT}/spread${n}-${side}.jpg`;
    const buf = await make(car, n);
    await sharp(buf).toFile(path);
    console.log(`${path}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
}
