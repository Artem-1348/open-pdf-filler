// Generates the synthetic part of the test corpus into tests/corpus/ along
// with corpus.json, which lists what the app should do with each file.
// Real-world forms (government, scanned, phone photos) are added to the
// same folder by hand and listed in corpus.json; see tests/corpus/README.md.
//
// Run: node scripts/make-corpus.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PDFDocument, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib';

const OUT = new URL('../tests/corpus/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const SIZES = {
  letter: [612, 792],
  a4: [595.28, 841.89],
  legal: [612, 1008],
  tabloidLandscape: [1224, 792],
  a6: [297.64, 419.53],
};

// Fixed timestamps keep the output byte-for-byte reproducible.
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
async function newDoc(title) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer('open-pdf-filler test corpus');
  doc.setCreator('scripts/make-corpus.mjs');
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, font, bold };
}

function heading(page, bold, text, y = page.getHeight() - 72) {
  page.drawText(text, { x: 72, y, size: 22, font: bold, color: rgb(0.1, 0.1, 0.1) });
}

function body(page, font, lines, startY = page.getHeight() - 120) {
  lines.forEach((line, i) => {
    page.drawText(line, { x: 72, y: startY - i * 18, size: 12, font });
  });
}

const entries = [];
function write(name, bytes, expectation) {
  writeFileSync(new URL(name, OUT), bytes);
  entries.push({ file: name, ...expectation });
}

// Deterministic pseudo-random bytes for the "garbage" fixture.
function seededBytes(length, seed = 42) {
  const out = new Uint8Array(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x & 0xff;
  }
  return out;
}

// 1. One simple page.
const simpleBytes = await (async () => {
  const { doc, font, bold } = await newDoc('Simple');
  const page = doc.addPage(SIZES.letter);
  heading(page, bold, 'Open PDF Filler test document');
  body(page, font, ['Hello from the test corpus.', 'This file has a single Letter-sized page.']);
  return doc.save({ useObjectStreams: false });
})();
write('simple.pdf', simpleBytes, { expect: 'open', pages: 1, note: 'single Letter page' });

// 2. Twenty pages with a known search term: "needle" appears on pages 3, 7
// (twice) and 15, so a search should find 4 matches.
await (async () => {
  const { doc, font, bold } = await newDoc('Twenty pages');
  for (let i = 1; i <= 20; i++) {
    const page = doc.addPage(SIZES.letter);
    heading(page, bold, `Page ${i} of 20`);
    const lines = [
      `This is page ${i}. The quick brown fox jumps over the lazy dog.`,
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    ];
    if (i === 3 || i === 15) lines.push('There is a needle on this page.');
    if (i === 7) lines.push('A needle here, and another needle right here.');
    body(page, font, lines);
  }
  write('twenty-pages.pdf', await doc.save(), {
    expect: 'open',
    pages: 20,
    search: { term: 'needle', matches: 4, pages: [3, 7, 7, 15] },
    note: 'NFR-3 timing file; search fixture',
  });
})();

// 3. A long document.
await (async () => {
  const { doc, font, bold } = await newDoc('Long document');
  for (let i = 1; i <= 120; i++) {
    const page = doc.addPage(SIZES.a4);
    heading(page, bold, `Section ${i}`);
    body(page, font, [`Page ${i} of a 120-page document.`]);
  }
  write('long-120-pages.pdf', await doc.save(), { expect: 'open', pages: 120, note: '100+ pages' });
})();

// 4. Rotated pages (the /Rotate key, as scanners and phone apps write it).
await (async () => {
  const { doc, font, bold } = await newDoc('Rotated pages');
  for (const angle of [0, 90, 180, 270]) {
    const page = doc.addPage(SIZES.letter);
    page.setRotation(degrees(angle));
    heading(page, bold, `Rotated ${angle}`);
    body(page, font, ['The heading should read upright only on the 0 degree page.']);
  }
  write('rotated.pdf', await doc.save(), {
    expect: 'open',
    pages: 4,
    rotations: [0, 90, 180, 270],
    note: '/Rotate 0, 90, 180, 270',
  });
})();

// 5. Mixed page sizes and orientations.
await (async () => {
  const { doc, font, bold } = await newDoc('Mixed sizes');
  for (const [name, size] of Object.entries(SIZES)) {
    const page = doc.addPage(size);
    heading(page, bold, name, size[1] - 60);
    body(page, font, [`${size[0]} x ${size[1]} points`], size[1] - 100);
  }
  write('mixed-sizes.pdf', await doc.save(), { expect: 'open', pages: 5, note: 'Letter, A4, Legal, Tabloid landscape, A6' });
})();

// 6. A fillable form (existing AcroForm fields; Phase 2 fills these).
await (async () => {
  const { doc, font, bold } = await newDoc('Fillable form');
  const page = doc.addPage(SIZES.letter);
  const form = doc.getForm();
  heading(page, bold, 'Membership application');
  page.drawText('Full name', { x: 72, y: 660, size: 12, font });
  const name = form.createTextField('full_name');
  name.addToPage(page, { x: 180, y: 652, width: 300, height: 24 });
  name.setText('Ada Lovelace');
  page.drawText('Member before?', { x: 72, y: 610, size: 12, font });
  const member = form.createCheckBox('member_before');
  member.addToPage(page, { x: 180, y: 604, width: 18, height: 18 });
  member.check();
  page.drawText('Plan', { x: 72, y: 560, size: 12, font });
  const plan = form.createRadioGroup('plan');
  plan.addOptionToPage('basic', page, { x: 180, y: 554, width: 18, height: 18 });
  plan.addOptionToPage('plus', page, { x: 260, y: 554, width: 18, height: 18 });
  plan.select('plus');
  page.drawText('Country', { x: 72, y: 510, size: 12, font });
  const country = form.createDropdown('country');
  country.addOptions(['Canada', 'Germany', 'Japan', 'United States']);
  country.select('Japan');
  country.addToPage(page, { x: 180, y: 502, width: 200, height: 24 });
  write('fillable-form.pdf', await doc.save(), { expect: 'open', pages: 1, note: 'text, checkbox, radio, dropdown fields' });
})();

// 6b. Every field type, blank, on upright and rotated pages (Phase 2 filling).
await (async () => {
  const { doc, font, bold } = await newDoc('All field types');
  const form = doc.getForm();
  for (const angle of [0, 90, 270]) {
    const page = doc.addPage(SIZES.letter);
    page.setRotation(degrees(angle));
    const s = `_p${angle}`;
    heading(page, bold, `Fields on a page rotated ${angle}`);
    page.drawText('Name', { x: 72, y: 660, size: 12, font });
    form.createTextField(`name${s}`).addToPage(page, { x: 180, y: 652, width: 300, height: 24 });
    page.drawText('Agree', { x: 72, y: 610, size: 12, font });
    form.createCheckBox(`agree${s}`).addToPage(page, { x: 180, y: 604, width: 18, height: 18 });
    if (angle !== 0) continue;
    page.drawText('Notes', { x: 72, y: 560, size: 12, font });
    const notes = form.createTextField('notes');
    notes.enableMultiline();
    notes.addToPage(page, { x: 180, y: 500, width: 300, height: 72 });
    page.drawText('Size', { x: 72, y: 460, size: 12, font });
    const size = form.createRadioGroup('size');
    for (const [i, v] of ['small', 'medium', 'large'].entries()) {
      size.addOptionToPage(v, page, { x: 180 + i * 80, y: 454, width: 18, height: 18 });
    }
    page.drawText('Colour', { x: 72, y: 410, size: 12, font });
    const colour = form.createDropdown('colour');
    colour.addOptions(['Red', 'Green', 'Blue']);
    colour.addToPage(page, { x: 180, y: 402, width: 160, height: 24 });
    page.drawText('Toppings', { x: 72, y: 360, size: 12, font });
    const toppings = form.createOptionList('toppings');
    toppings.addOptions(['Cheese', 'Olives', 'Peppers', 'Onions']);
    toppings.enableMultiselect();
    toppings.addToPage(page, { x: 180, y: 290, width: 160, height: 80 });
    page.drawText('PIN (4)', { x: 72, y: 250, size: 12, font });
    const pin = form.createTextField('pin');
    pin.setMaxLength(4);
    pin.addToPage(page, { x: 180, y: 242, width: 80, height: 24 });
  }
  write('all-field-types.pdf', await doc.save(), {
    expect: 'open',
    pages: 3,
    note: 'blank text, multiline, max-length, checkbox, radio, dropdown, multi-select list; rotated pages',
  });
})();

// 7. Non-English Latin text.
await (async () => {
  const { doc, font, bold } = await newDoc('Accented text');
  const page = doc.addPage(SIZES.a4);
  heading(page, bold, 'Déclaration de revenus');
  // Limited to characters the standard fonts can encode (WinAnsi).
  body(page, font, ['Größe, Straße, Ñandú, São Paulo, Ærø.']);
  write('accented-text.pdf', await doc.save(), {
    expect: 'open',
    pages: 1,
    search: { term: 'Straße', matches: 1, pages: [1] },
    note: 'French, German, Spanish, Portuguese, Danish text',
  });
})();

// 8. Password needed to open (AES-256).
await (async () => {
  const { doc, font, bold } = await newDoc('Protected');
  const page = doc.addPage(SIZES.letter);
  heading(page, bold, 'Secret document');
  body(page, font, ['You opened the password-protected file.']);
  // Everything allowed once opened, so the app can fill it (Phase 2).
  doc.encrypt({
    userPassword: 'open-sesame',
    ownerPassword: 'owner-secret',
    permissions: { printing: 'highResolution', modifying: true, copying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true },
  });
  write('password-protected.pdf', await doc.save(), {
    expect: 'password',
    password: 'open-sesame',
    pages: 1,
    note: 'user password "open-sesame" (AES-256)',
  });
})();

// 9. Owner password only: opens without a prompt.
await (async () => {
  const { doc, font, bold } = await newDoc('Owner-restricted');
  const page = doc.addPage(SIZES.letter);
  heading(page, bold, 'Restricted permissions');
  body(page, font, ['Anyone can open this; only the owner may change it.']);
  doc.encrypt({ ownerPassword: 'owner-secret', permissions: { printing: 'lowResolution', modifying: false } });
  write('owner-password-only.pdf', await doc.save(), { expect: 'open', pages: 1, note: 'encrypted, empty user password' });
})();

// 9b. Opens without a password, but its permissions forbid filling it in.
await (async () => {
  const { doc, font, bold } = await newDoc('No filling allowed');
  const page = doc.addPage(SIZES.letter);
  heading(page, bold, 'Filling not permitted');
  page.drawText('Name', { x: 72, y: 660, size: 12, font });
  doc.getForm().createTextField('locked_name').addToPage(page, { x: 180, y: 652, width: 300, height: 24 });
  doc.encrypt({
    ownerPassword: 'owner-secret',
    permissions: { printing: 'highResolution', modifying: false, copying: true, annotating: false, fillingForms: false, contentAccessibility: true, documentAssembly: false },
  });
  write('no-fill-permission.pdf', await doc.save(), { expect: 'open', pages: 1, note: 'permissions forbid filling and annotating' });
})();

// 10. Junk before the header (seen in files from some email gateways).
write(
  'leading-junk.pdf',
  Buffer.concat([Buffer.from('X-Mailer-Junk: 0123456789\r\n\r\n'), Buffer.from(simpleBytes)]),
  { expect: 'open', pages: 1, note: '29 bytes before %PDF-' },
);

// 11. Broken cross-reference table offsets; PDFium should repair this.
await (async () => {
  const text = Buffer.from(simpleBytes).toString('latin1');
  const broken = text.replace(/startxref\s+(\d+)/, (_, n) => `startxref\n${Number(n) + 37}`);
  write('broken-xref.pdf', Buffer.from(broken, 'latin1'), { expect: 'open', pages: 1, note: 'wrong startxref offset' });
})();

// 12. Image-only page standing in for a scan.
await (async () => {
  const { doc } = await newDoc('Scan stand-in');
  const page = doc.addPage(SIZES.letter);
  const png = await doc.embedPng(readFileSync(new URL('../public/icon-512.png', import.meta.url)));
  page.drawImage(png, { x: 106, y: 196, width: 400, height: 400 });
  write('image-only.pdf', await doc.save(), { expect: 'open', pages: 1, note: 'no text layer, like a scan' });
})();

// Files that must fail with a clear message.
write('damaged-truncated.pdf', simpleBytes.slice(0, Math.floor(simpleBytes.length * 0.3)), {
  expect: 'error',
  error: 'damaged',
  note: 'first 30% of a valid file',
});
write('damaged-garbage.pdf', Buffer.concat([Buffer.from('%PDF-1.7\n'), seededBytes(4096)]), {
  expect: 'error',
  error: 'damaged',
  note: 'valid header, random body',
});
write('not-a-pdf.pdf', readFileSync(new URL('../public/icon-192.png', import.meta.url)), {
  expect: 'error',
  error: 'not-pdf',
  note: 'a PNG renamed to .pdf',
});
write('notes.txt', Buffer.from('These are plain-text notes, not a PDF.\n'), {
  expect: 'error',
  error: 'not-pdf',
  note: 'plain text file',
});
write('empty.pdf', Buffer.alloc(0), { expect: 'error', error: 'empty', note: '0 bytes' });

writeFileSync(new URL('corpus.json', OUT), JSON.stringify({ files: entries }, null, 2) + '\n');
console.log(`Wrote ${entries.length} files to tests/corpus/`);
