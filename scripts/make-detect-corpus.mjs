// Phase 4 test set for auto-detect, with the true field positions:
//   flattened-*.pdf    corpus forms flattened by PDFium (truth = their fields)
//   flat-drawn-form.pdf a flat form drawn with the usual patterns
//   flat-drawn-scan.pdf the same form as a picture only (no text layer)
// Writes tests/corpus/detect/*.pdf and detect-truth.json.
//
// Run: node scripts/make-detect-corpus.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { PdfiumNative } from '@embedpdf/engines/pdfium';
import { init } from '@embedpdf/pdfium';

const require = createRequire(import.meta.url);
const OUT = new URL('../tests/corpus/detect/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const truth = {};

const wasmBinary = readFileSync(require.resolve('@embedpdf/pdfium/pdfium.wasm'));
const engine = new PdfiumNative(await init({ wasmBinary }), { fontFallback: null });
let docId = 0;
const open = (bytes) =>
  engine.openDocumentBuffer({ id: `d${++docId}`, content: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, { password: '' }).toPromise();

// Field boxes in view space (top-left origin), the way the app sees them.
async function fieldBoxes(bytes) {
  const doc = await open(bytes);
  const out = [];
  for (const page of doc.pages) {
    for (const w of await engine.getPageAnnoWidgets(doc, page).toPromise()) {
      const kind = w.field.type === 2 || w.field.type === 3 ? 'checkbox' : 'text';
      out.push({ page: page.index, kind, box: { x: w.rect.origin.x, y: w.rect.origin.y, width: w.rect.size.width, height: w.rect.size.height } });
    }
  }
  return out;
}

// 1. Corpus forms flattened by PDFium, as "Print → Save as PDF" does.
for (const name of ['fillable-form.pdf']) {
  const bytes = new Uint8Array(readFileSync(new URL(`../tests/corpus/${name}`, import.meta.url)));
  const doc = await open(bytes);
  for (const page of doc.pages) await engine.flattenPage(doc, page).toPromise();
  const flat = new Uint8Array(await engine.saveAsCopy(doc).toPromise());
  const file = `flattened-${name}`;
  writeFileSync(new URL(file, OUT), flat);
  truth[file] = { note: `${name} flattened by PDFium`, fields: await fieldBoxes(bytes) };
}

// 2. A flat form drawn with the common fill-in patterns.
const LETTER = [612, 792];
const H = LETTER[1];
const form = await PDFDocument.create();
form.setCreationDate(new Date('2026-01-01T00:00:00Z'));
form.setModificationDate(new Date('2026-01-01T00:00:00Z'));
const font = await form.embedFont(StandardFonts.Helvetica);
const bold = await form.embedFont(StandardFonts.HelveticaBold);
const page = form.addPage(LETTER);
const fields = [];
const ink = rgb(0.2, 0.2, 0.2);
const pale = rgb(0.75, 0.8, 0.86);
// Helpers take top-left coordinates (view space) and record the truth.
const text = (s, x, y, size = 10, f = font) => page.drawText(s, { x, y: H - y - size * 0.8, size, font: f, color: ink });
const line = (x1, y1, x2, y2, color = ink, thickness = 0.8) =>
  page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness, color });
const rect = (x, y, w, h, color = ink, thickness = 0.8) =>
  page.drawRectangle({ x, y: H - y - h, width: w, height: h, borderColor: color, borderWidth: thickness });
const field = (kind, x, y, width, height) => fields.push({ page: 0, kind, box: { x, y, width, height } });

text('Application form (flat test form)', 50, 40, 16, bold);

// Underlines: "Label: ________"
for (const [i, label] of ['Full name:', 'Email:', 'Phone:'].entries()) {
  const y = 90 + i * 30;
  text(label, 50, y - 10);
  line(130, y, 330, y);
  field('text', 130, y - 16, 200, 16);
}

// Boxes with the label on the left.
for (const [i, label] of ['Street', 'City', 'Postcode'].entries()) {
  const y = 190 + i * 28;
  text(label, 360, y + 5);
  rect(420, y, 150, 20);
  field('text', 420, y, 150, 20);
}

// Rows with a small label at the top and room below (like the IRS W-9).
['1 Name of company', '2 Business address'].forEach((label, i) => {
  const y = 290 + i * 34;
  line(50, y, 330, y);
  text(label, 54, y + 3, 7);
  line(50, y + 34, 330, y + 34);
  line(50, y, 50, y + 34);
  line(330, y, 330, y + 34);
  field('text', 50, y + 13, 280, 21);
});

// Checkboxes with labels on the right.
['Yes', 'No', 'Not sure', 'Prefer not to say'].forEach((label, i) => {
  const x = 50 + i * 120;
  rect(x, 380, 11, 11);
  text(label, x + 16, 381);
  field('checkbox', x, 380, 11, 11);
});

// A table with pale lines: a header row and two rows of empty cells.
const cols = [50, 230, 380, 560];
const rows = [420, 440, 462, 484];
for (const y of rows) line(cols[0], y, cols[3], y, pale);
for (const x of cols) line(x, rows[0], x, rows[3], pale);
['Item', 'Quantity', 'Notes'].forEach((h, i) => text(h, cols[i] + 4, rows[0] + 5, 9, bold));
for (let r = 1; r < 3; r++) for (let c = 0; c < 3; c++) field('text', cols[c], rows[r], cols[c + 1] - cols[c], rows[r + 1] - rows[r]);

// Amounts: "$" then a blank line.
['Income', 'Expenses'].forEach((label, i) => {
  const y = 520 + i * 26;
  text(label, 50, y);
  text('$', 200, y);
  line(210, y + 12, 330, y + 12);
  field('text', 210, y - 4, 120, 16);
});

// SSN-style digit boxes: 3 - 2 - 4.
text('Social security number', 360, 515, 8);
let x = 360;
for (const [g, count] of [3, 2, 4].entries()) {
  const start = x;
  for (let k = 0; k < count; k++) {
    rect(x, 528, 14, 22);
    x += 14;
  }
  field('text', start, 528, x - start, 22);
  if (g < 2) {
    text('-', x + 3, 535);
    x += 12;
  }
}

// Signature and date lines.
text('Signature', 50, 640);
line(110, 650, 330, 650);
field('text', 110, 634, 220, 16);
text('Date', 360, 640);
line(390, 650, 560, 650);
field('text', 390, 634, 170, 16);

const drawn = await form.save();
writeFileSync(new URL('flat-drawn-form.pdf', OUT), drawn);
truth['flat-drawn-form.pdf'] = { note: 'flat form drawn with common patterns', fields };

// 3. The same form as a picture only, like a scan: no text layer.
{
  const doc = await open(new Uint8Array(drawn));
  const scale = 2;
  const img = await engine.renderPageRaw(doc, doc.pages[0], { scaleFactor: scale, dpr: 1 }).toPromise();
  const png = encodePng(img.width, img.height, img.data);
  const scan = await PDFDocument.create();
  scan.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  scan.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const p = scan.addPage(LETTER);
  p.drawImage(await scan.embedPng(png), { x: 0, y: 0, width: LETTER[0], height: LETTER[1] });
  writeFileSync(new URL('flat-drawn-scan.pdf', OUT), await scan.save());
  truth['flat-drawn-scan.pdf'] = { note: 'flat-drawn-form.pdf as an image only', fields };
}

writeFileSync(new URL('detect-truth.json', OUT), JSON.stringify(truth, null, 2) + '\n');
console.log(`Wrote ${Object.keys(truth).length} detection test files to tests/corpus/detect/`);

function encodePng(width, height, rgba) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4));
  }
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
