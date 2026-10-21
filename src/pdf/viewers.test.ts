// Phase 2 gate, automated part: save sample files with the writer, then
// reopen them in the engines behind the gate's viewers:
//   PDFium  — Chrome, Edge, Android Chrome (also the writer tests)
//   PDF.js  — Firefox
//   PDFKit  — macOS Preview, iPhone/iPad Files (macOS only)
// The samples are left in test-results/gate-samples/ for the manual checks
// in Acrobat Reader and on phones (docs/viewer-matrix.md).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFieldsWithPdfium } from '../../tests/support/pdfium-node';
import type { FieldValue, PlacedItem } from './model';
import { savePdf, type FontFile } from './writer';

const OUT = 'test-results/gate-samples';
const corpus = (name: string) => new Uint8Array(readFileSync(`tests/corpus/${name}`));
const loadFont = async (f: FontFile) =>
  new Uint8Array(readFileSync(`src/assets/fonts/NotoSans-${f === 'italic' ? 'Italic' : 'Regular'}.ttf`));
const text = (t: string): FieldValue => ({ kind: 'text', text: t });
const on = (i: number): FieldValue => ({ kind: 'toggle', on: i });
const choice = (...s: string[]): FieldValue => ({ kind: 'choice', selected: s });
const signaturePng = new Uint8Array(readFileSync('public/icon-192.png'));

const FORM_VALUES = {
  name_p0: text('Ada Lovelace'),
  agree_p0: on(0),
  notes: text('Line one\nLine two'),
  size: on(1),
  colour: choice('Green'),
  toppings: choice('Olives', 'Onions'),
  pin: text('1234'),
  name_p90: text('Rotated ninety'),
};
const W9_NAME = 'topmostSubform[0].Page1[0].f1_01[0]';
const W9_SCORP = 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[2]';

let id = 0;
const item = (p: Omit<PlacedItem, 'id'>): PlacedItem => ({ id: `s${++id}`, ...p });

interface Sample {
  file: string;
  source: string;
  password?: string;
  values?: Record<string, FieldValue>;
  items?: PlacedItem[];
  flatten?: boolean;
}

const SAMPLES: Sample[] = [
  { file: 'form-filled.pdf', source: 'all-field-types.pdf', values: FORM_VALUES },
  { file: 'form-flattened.pdf', source: 'all-field-types.pdf', values: FORM_VALUES, flatten: true },
  {
    file: 'w9-filled.pdf',
    source: 'irs-w9-2024-03.pdf',
    values: { [W9_NAME]: text('Jane Example'), [W9_SCORP]: on(0) },
    items: [
      item({ kind: 'signature', page: 0, box: { x: 150, y: 574, width: 160, height: 22 }, fontSize: 14, signature: { type: 'typed', text: 'Jane Example' } }),
      item({ kind: 'date', page: 0, box: { x: 410, y: 578, width: 80, height: 18 }, fontSize: 10, text: '10/20/2026' }),
    ],
  },
  {
    file: 'placed-rotated.pdf',
    source: 'rotated.pdf',
    items: [0, 1, 2, 3].flatMap((page) => [
      item({ kind: 'text', page, box: { x: 100, y: 150, width: 200, height: 20 }, fontSize: 14, text: `Placed on page ${page + 1}` }),
      item({ kind: 'check', page, box: { x: 100, y: 200, width: 20, height: 20 } }),
      item({ kind: 'signature', page, box: { x: 100, y: 250, width: 60, height: 60 }, signature: { type: 'drawn', png: signaturePng, width: 192, height: 192 } }),
    ]),
  },
  {
    file: 'cyrillic.pdf',
    source: 'all-field-types.pdf',
    values: { name_p0: text('Иван Петров') },
    items: [item({ kind: 'text', page: 0, box: { x: 72, y: 700, width: 200, height: 20 }, fontSize: 12, text: 'Подпись: Иван' })],
  },
  {
    file: 'protected.pdf',
    source: 'password-protected.pdf',
    password: 'open-sesame',
    items: [item({ kind: 'text', page: 0, box: { x: 72, y: 200, width: 200, height: 20 }, fontSize: 14, text: 'Still secret' })],
  },
];

const saved = new Map<string, Uint8Array>();

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const s of SAMPLES) {
    const original = corpus(s.source);
    const { fields } = await readFieldsWithPdfium(original, s.password);
    const bytes = await savePdf({
      original,
      password: s.password,
      fields,
      values: new Map(Object.entries(s.values ?? {})),
      items: s.items ?? [],
      flatten: s.flatten ?? false,
      loadFont,
    });
    saved.set(s.file, bytes);
    writeFileSync(join(OUT, s.file), bytes);
  }
}, 60_000);

// ------------------------------------------------------------------ PDF.js

async function pdfjsOpen(file: string, password?: string) {
  return getDocument({
    data: saved.get(file)!.slice(),
    password,
    useSystemFonts: false,
    standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/',
  }).promise;
}

async function pdfjsText(file: string, password?: string): Promise<string[]> {
  const doc = await pdfjsOpen(file, password);
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((t) => ('str' in t ? t.str : '')).join(' '));
  }
  return pages;
}

interface PdfJsWidget {
  fieldName: string;
  fieldValue: string | string[];
  buttonValue?: string;
  exportValue?: string;
  checkBox?: boolean;
  radioButton?: boolean;
}

// Form widgets as Firefox's viewer sees them, grouped by field name.
async function pdfjsFields(file: string): Promise<Record<string, PdfJsWidget[]>> {
  const doc = await pdfjsOpen(file);
  const out: Record<string, PdfJsWidget[]> = {};
  for (let i = 1; i <= doc.numPages; i++) {
    for (const a of (await (await doc.getPage(i)).getAnnotations()) as Array<PdfJsWidget & { subtype: string }>) {
      if (a.subtype !== 'Widget' || !a.fieldName) continue;
      (out[a.fieldName] ??= []).push(a);
    }
  }
  return out;
}

// Whether this checkbox/radio widget is the one turned on.
const isOn = (w: PdfJsWidget) =>
  w.radioButton ? w.fieldValue === w.buttonValue : w.fieldValue !== 'Off' && w.fieldValue !== '';

describe('PDF.js (Firefox)', () => {
  it('reads every filled field value', async () => {
    const f = await pdfjsFields('form-filled.pdf');
    expect(f.name_p0[0].fieldValue).toBe('Ada Lovelace');
    expect(f.notes[0].fieldValue).toBe('Line one\nLine two');
    expect(f.pin[0].fieldValue).toBe('1234');
    expect(f.name_p90[0].fieldValue).toBe('Rotated ninety');
    expect([f.colour[0].fieldValue].flat()).toEqual(['Green']);
    expect([f.toppings[0].fieldValue].flat()).toEqual(['Olives', 'Onions']);
    expect(isOn(f.agree_p0[0])).toBe(true);
    expect(isOn(f.agree_p90[0])).toBe(false);
    // The second radio is on, the others off.
    expect(f.size.map(isOn)).toEqual([false, true, false]);
  });

  it('sees flattened values as page text, with no fields left', async () => {
    expect(Object.keys(await pdfjsFields('form-flattened.pdf'))).toHaveLength(0);
    const pages = await pdfjsText('form-flattened.pdf');
    expect(pages[0]).toContain('Ada Lovelace');
    expect(pages[1]).toContain('Rotated ninety');
  });

  it('reads the W-9 name, box and signature', async () => {
    const f = await pdfjsFields('w9-filled.pdf');
    expect(f[W9_NAME][0].fieldValue).toBe('Jane Example');
    expect(isOn(f[W9_SCORP][0])).toBe(true);
    expect((await pdfjsText('w9-filled.pdf'))[0]).toContain('10/20/2026');
  });

  it('reads placed text on rotated pages, Cyrillic, and protected files', async () => {
    const rotated = await pdfjsText('placed-rotated.pdf');
    rotated.forEach((t, i) => expect(t).toContain(`Placed on page ${i + 1}`));
    expect((await pdfjsFields('cyrillic.pdf')).name_p0[0].fieldValue).toBe('Иван Петров');
    expect((await pdfjsText('cyrillic.pdf'))[0]).toContain('Подпись: Иван');
    await expect(pdfjsOpen('protected.pdf')).rejects.toThrow(/password/i);
    expect((await pdfjsText('protected.pdf', 'open-sesame'))[0]).toContain('Still secret');
  });
});

// ------------------------------------------------------------------ PDFKit

interface PdfKitReport {
  file: string;
  opened: boolean;
  locked: boolean;
  pages: number;
  fields: Array<{ name: string; type: string; value: string; page: number }>;
  text: string[];
}

const canRunPdfKit = (() => {
  if (platform() !== 'darwin') return false;
  try {
    execFileSync('swift', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!canRunPdfKit)('PDFKit (macOS Preview, iPhone Files)', () => {
  let reports: Map<string, PdfKitReport>;

  beforeAll(() => {
    const args = SAMPLES.map((s) => join(OUT, s.file) + (s.password ? `::${s.password}` : ''));
    const json = execFileSync('swift', ['scripts/check-pdfkit.swift', OUT, ...args], { encoding: 'utf8', timeout: 180_000 });
    reports = new Map((JSON.parse(json) as PdfKitReport[]).map((r) => [r.file, r]));
  }, 200_000);

  const field = (file: string, name: string) => reports.get(file)!.fields.filter((f) => f.name === name);

  it('shows every filled field value', () => {
    expect(field('form-filled.pdf', 'name_p0')[0].value).toBe('Ada Lovelace');
    expect(field('form-filled.pdf', 'notes')[0].value).toBe('Line one\nLine two');
    expect(field('form-filled.pdf', 'pin')[0].value).toBe('1234');
    expect(field('form-filled.pdf', 'name_p90')[0].value).toBe('Rotated ninety');
    expect(field('form-filled.pdf', 'colour')[0].value).toBe('Green');
    expect(field('form-filled.pdf', 'agree_p0')[0].value).not.toBe('off');
    expect(field('form-filled.pdf', 'size').map((w) => w.value !== 'off')).toEqual([false, true, false]);
  });

  it('shows flattened values and placed items as page text', () => {
    const flat = reports.get('form-flattened.pdf')!;
    expect(flat.fields).toHaveLength(0);
    expect(flat.text[0]).toContain('Ada Lovelace');
    const rotated = reports.get('placed-rotated.pdf')!;
    rotated.text.forEach((t, i) => expect(t).toContain(`Placed on page ${i + 1}`));
  });

  it('shows the W-9, Cyrillic and the protected copy', () => {
    expect(field('w9-filled.pdf', W9_NAME)[0].value).toBe('Jane Example');
    expect(field('w9-filled.pdf', W9_SCORP)[0].value).not.toBe('off');
    expect(reports.get('w9-filled.pdf')!.text[0]).toContain('10/20/2026');
    expect(field('cyrillic.pdf', 'name_p0')[0].value).toBe('Иван Петров');
    expect(reports.get('cyrillic.pdf')!.text[0]).toContain('Подпись: Иван');
    const protectedCopy = reports.get('protected.pdf')!;
    expect(protectedCopy.locked).toBe(false); // unlocked with the same password
    expect(protectedCopy.text[0]).toContain('Still secret');
  });
});
