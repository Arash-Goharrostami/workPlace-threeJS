/**
 * The CV as a PDF, built from the sheet.
 *
 * There is no file under `public/` to hand out: the page on the paper tablet is drawn
 * from `content.js` (`portfolioPage.js`), so the PDF is drawn from the same canvas at
 * the moment it is asked for, and can never say something the room does not. It is one
 * A4 page carrying the sheet as a JPEG — an image, so the text is not selectable, which
 * was accepted over keeping a second copy of the résumé in step by hand.
 *
 * Written by hand rather than through a library: a single-image PDF is five objects
 * and a cross-reference table, and the only care it needs is that the offsets in that
 * table are counted in bytes over the finished file — the image is binary, so a
 * string's length would be wrong.
 */

/** A4 in PostScript points. */
const A4 = { w: 595.28, h: 841.89 };

const encoder = new TextEncoder();

/** The base64 payload of a data URL as bytes. */
function dataUrlBytes(url) {
  const base64 = url.slice(url.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Wraps `canvas` in a one-page PDF and returns it as a Blob.
 */
export function sheetToPdfBlob(canvas) {
  const image = dataUrlBytes(canvas.toDataURL('image/jpeg', 0.92));

  const content = `q ${A4.w.toFixed(2)} 0 0 ${A4.h.toFixed(2)} 0 0 cm /Im0 Do Q`;

  // Each object as the pieces that make it up: strings are encoded, bytes are copied.
  const objects = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] ` +
        '/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
    ],
    [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`],
    [
      `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`,
      image,
      '\nendstream',
    ],
  ];

  const parts = [];
  let length = 0;
  const push = (piece) => {
    const bytes = typeof piece === 'string' ? encoder.encode(piece) : piece;
    parts.push(bytes);
    length += bytes.length;
  };

  push('%PDF-1.4\n%âãÏÓ\n');

  const offsets = [];
  objects.forEach((pieces, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n`);
    for (const piece of pieces) push(piece);
    push('\nendobj\n');
  });

  const xref = length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(parts, { type: 'application/pdf' });
}
