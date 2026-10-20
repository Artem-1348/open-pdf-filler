// Writer round trips: fill and place items, save, then reopen the result with
// PDFium (the engine in Chrome and Android Chrome) and check what it sees.
import { readFileSync } from 'node:fs';
import { PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { PdfErrorCode } from '@embedpdf/models';
import { describe, expect, it } from 'vitest';
import {
  findText,
  inkInBox,
  openWithPdfium,
  pageText,
  readFieldsWithPdfium,
} from '../../tests/support/pdfium-node';
import type { FieldValue, FormFieldInfo, PlacedItem } from './model';
import { savedFileName } from '../editor/fileName';
import { SaveError, readFieldExtras, savePdf, type FontFile } from './writer';

const corpus = (name: string) => new Uint8Array(readFileSync(`tests/corpus/${name}`));
const loadFont = async (f: FontFile) =>
  new Uint8Array(readFileSync(`src/assets/fonts/NotoSans-${f === 'italic' ? 'Italic' : 'Regular'}.ttf`));

async function save(
  file: string,
  opts: {
    values?: Record<string, FieldValue>;
    items?: PlacedItem[];
    flatten?: boolean;
    password?: string;
  } = {},
) {
  const original = corpus(file);
  const { fields } = await readFieldsWithPdfium(original, opts.password);
  const bytes = await savePdf({
    original,
    password: opts.password,
    fields,
    values: new Map(Object.entries(opts.values ?? {})),
    items: opts.items ?? [],
    flatten: opts.flatten ?? false,
    loadFont,
  });
  return { bytes, fields, original };
}

const byName = (fields: FormFieldInfo[], name: string) => {
  const f = fields.find((x) => x.name === name);
  if (!f) throw new Error(`no field ${name}`);
  return f;
};

const text = (t: string): FieldValue => ({ kind: 'text', text: t });
const on = (i: number): FieldValue => ({ kind: 'toggle', on: i });
const choice = (...s: string[]): FieldValue => ({ kind: 'choice', selected: s });

let n = 0;
const item = (p: Partial<PlacedItem> & Pick<PlacedItem, 'kind' | 'page'>): PlacedItem => ({
  id: `i${++n}`,
  box: { x: 72, y: 120, width: 120, height: 20 },
  ...p,
});

describe('filling existing fields', () => {
  const values = {
    name_p0: text('Ada Lovelace'),
    agree_p0: on(0),
    notes: text('Line one\nLine two'),
    size: on(1),
    colour: choice('Green'),
    toppings: choice('Olives', 'Onions'),
    pin: text('1234'),
    name_p90: text('Rotated ninety'),
    agree_p270: on(0),
  };

  it('keeps every value when reopened', async () => {
    const { bytes } = await save('all-field-types.pdf', { values });
    const { fields } = await readFieldsWithPdfium(bytes);
    for (const [name, value] of Object.entries(values)) {
      expect(byName(fields, name).initial, name).toEqual(value);
    }
    // Untouched fields stay empty.
    expect(byName(fields, 'agree_p90').initial).toEqual(on(-1));
    expect(byName(fields, 'name_p270').initial).toEqual(text(''));
  });

  it('writes appearance streams so viewers that do not redraw fields show the values', async () => {
    const { bytes } = await save('all-field-types.pdf', { values });
    const doc = await PDFDocument.load(bytes);
    for (const name of ['name_p0', 'notes', 'colour', 'toppings', 'pin', 'name_p90']) {
      for (const w of doc.getForm().getField(name).acroField.getWidgets()) {
        expect(w.getAppearances()?.normal, name).toBeDefined();
      }
    }
    // And PDFium actually draws ink inside the name box.
    const { doc: reopened, fields } = await readFieldsWithPdfium(bytes);
    const box = byName(fields, 'name_p0').widgets[0].box;
    expect(await inkInBox(reopened, 0, box)).toBeGreaterThan(50);
  });

  it('turns on only the chosen radio', async () => {
    const { bytes } = await save('all-field-types.pdf', { values: { size: on(2) } });
    const doc = await PDFDocument.load(bytes);
    const states = doc
      .getForm()
      .getField('size')
      .acroField.getWidgets()
      .map((w) => w.getAppearanceState()?.decodeText());
    expect(states.filter((s) => s !== 'Off')).toHaveLength(1);
    const { fields } = await readFieldsWithPdfium(bytes);
    expect(byName(fields, 'size').initial).toEqual(on(2));
  });

  it('can untick a checkbox that was ticked', async () => {
    const { bytes } = await save('fillable-form.pdf', { values: { member_before: on(-1) } });
    const { fields } = await readFieldsWithPdfium(bytes);
    expect(byName(fields, 'member_before').initial).toEqual(on(-1));
  });

  it('fills the IRS W-9 and removes its XFA data', async () => {
    const name = 'topmostSubform[0].Page1[0].f1_01[0]';
    // Line 3a: the third box, "S corporation".
    const sCorp = 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[2]';
    const { bytes } = await save('irs-w9-2024-03.pdf', {
      values: { [name]: text('Jane Example'), [sCorp]: on(0) },
    });
    const { fields } = await readFieldsWithPdfium(bytes);
    expect(byName(fields, name).initial).toEqual(text('Jane Example'));
    expect(byName(fields, sCorp).initial).toEqual(on(0));
    const others = fields.filter((f) => f.name.includes('.c1_1[') && f.name !== sCorp);
    expect(others.length).toBe(6);
    for (const f of others) expect(f.initial, f.name).toEqual(on(-1));

    // Acrobat would otherwise show the stale XFA data instead of these values.
    const doc = await PDFDocument.load(bytes, { preserveXFA: true });
    expect(doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict).has(PDFName.of('XFA'))).toBe(false);
  });

  it('can select and clear a radio group', async () => {
    const { bytes } = await save('all-field-types.pdf', { values: { size: on(0) } });
    const second = await save('all-field-types.pdf', { values: { size: on(-1) } });
    expect(byName((await readFieldsWithPdfium(bytes)).fields, 'size').initial).toEqual(on(0));
    expect(byName((await readFieldsWithPdfium(second.bytes)).fields, 'size').initial).toEqual(on(-1));
  });

  it('writes Cyrillic with the bundled Noto Sans font', async () => {
    const { bytes } = await save('all-field-types.pdf', { values: { name_p0: text('Иван Петров') } });
    const { fields } = await readFieldsWithPdfium(bytes);
    expect(byName(fields, 'name_p0').initial).toEqual(text('Иван Петров'));
  });

  it('flattening bakes values into the page and removes the fields', async () => {
    const { bytes } = await save('all-field-types.pdf', { values, flatten: true });
    const { doc, fields } = await readFieldsWithPdfium(bytes);
    expect(fields).toHaveLength(0);
    expect(await pageText(doc, 0)).toContain('Ada Lovelace');
    expect(await pageText(doc, 1)).toContain('Rotated ninety');
  });
});

describe('placing items on pages', () => {
  it('puts text where it was placed on every page rotation', async () => {
    const items = [0, 1, 2, 3].map((page) =>
      item({ kind: 'text', page, text: `Placed on page ${page + 1}`, fontSize: 14, box: { x: 100, y: 150, width: 200, height: 20 } }),
    );
    const { bytes } = await save('rotated.pdf', { items });
    const doc = await openWithPdfium(bytes);
    for (let page = 0; page < 4; page++) {
      const [hit] = await findText(doc, `Placed on page ${page + 1}`);
      expect(hit, `page ${page + 1}`).toBeDefined();
      expect(hit.pageIndex).toBe(page);
      // PDFium reports text rects in the same view space the editor uses.
      const r = hit.rects[0];
      expect(Math.abs(r.origin.x - 102), `x on page ${page + 1}`).toBeLessThan(4);
      expect(Math.abs(r.origin.y - 152), `y on page ${page + 1}`).toBeLessThan(6);
      // Upright: wider than tall.
      expect(r.size.width).toBeGreaterThan(r.size.height);
    }
  });

  it('keeps multi-line text and dates', async () => {
    const { bytes } = await save('simple.pdf', {
      items: [
        item({ kind: 'text', page: 0, text: 'First line\nSecond line', fontSize: 12 }),
        item({ kind: 'date', page: 0, text: '10/20/2026', fontSize: 12, box: { x: 300, y: 300, width: 80, height: 18 } }),
      ],
    });
    const doc = await openWithPdfium(bytes);
    const text = await pageText(doc, 0);
    expect(text).toContain('First line');
    expect(text).toContain('Second line');
    expect(text).toContain('10/20/2026');
  });

  it('draws checkmarks, crosses and signatures inside their boxes on rotated pages', async () => {
    const png = new Uint8Array(readFileSync('public/icon-192.png'));
    const boxes = {
      check: { x: 100, y: 100, width: 24, height: 24 },
      cross: { x: 200, y: 100, width: 24, height: 24 },
      drawn: { x: 100, y: 200, width: 120, height: 60 },
      typed: { x: 100, y: 300, width: 200, height: 40 },
    };
    for (const page of [0, 1, 2, 3]) {
      const { bytes } = await save('rotated.pdf', {
        items: [
          item({ kind: 'check', page, box: boxes.check }),
          item({ kind: 'cross', page, box: boxes.cross }),
          item({ kind: 'signature', page, box: boxes.drawn, signature: { type: 'drawn', png, width: 192, height: 192 } }),
          item({ kind: 'signature', page, box: boxes.typed, fontSize: 24, signature: { type: 'typed', text: 'Ada L.' } }),
        ],
      });
      const doc = await openWithPdfium(bytes);
      for (const [name, box] of Object.entries(boxes)) {
        expect(await inkInBox(doc, page, box), `${name} on page ${page + 1}`).toBeGreaterThan(10);
      }
      const [sig] = await findText(doc, 'Ada L.');
      expect(sig?.pageIndex).toBe(page);
    }
  });

  it('writes a Cyrillic typed signature', async () => {
    const { bytes } = await save('simple.pdf', {
      items: [item({ kind: 'signature', page: 0, fontSize: 20, signature: { type: 'typed', text: 'Артём' } })],
    });
    expect(await pageText(await openWithPdfium(bytes), 0)).toContain('Артём');
  });

  it('ignores empty text items', async () => {
    const { bytes, original } = await save('simple.pdf', { items: [item({ kind: 'text', page: 0, text: '   ' })] });
    expect(await pageText(await openWithPdfium(bytes), 0)).toBe(await pageText(await openWithPdfium(original), 0));
  });
});

describe('safety', () => {
  it('refuses characters no bundled font can draw, and says which', async () => {
    const attempt = save('simple.pdf', { items: [item({ kind: 'text', page: 0, text: 'Hello 你好 😀' })] });
    await expect(attempt).rejects.toBeInstanceOf(SaveError);
    await expect(attempt).rejects.toMatchObject({ kind: 'unsupported-characters', characters: ['你', '好', '😀'] });
  });

  it('keeps a password-protected file protected with the same password', async () => {
    const password = 'open-sesame';
    const { bytes } = await save('password-protected.pdf', {
      password,
      items: [item({ kind: 'text', page: 0, text: 'Still secret' })],
    });
    await expect(openWithPdfium(bytes)).rejects.toMatchObject({ reason: { code: PdfErrorCode.Password } });
    const doc = await openWithPdfium(bytes, password);
    expect(await pageText(doc, 0)).toContain('Still secret');
  });

  it('keeps the original permissions when re-encrypting', async () => {
    const password = 'open-sesame';
    const { bytes } = await save('password-protected.pdf', { password, items: [item({ kind: 'check', page: 0 })] });
    const { pdfium } = await import('../../tests/support/pdfium-node');
    const e = await pdfium();
    const before = await e.getDocUserPermissions(await openWithPdfium(corpus('password-protected.pdf'), password)).toPromise();
    const after = await e.getDocUserPermissions(await openWithPdfium(bytes, password)).toPromise();
    // Fill forms (256) and annotate (32) must survive, or other apps would lock the copy.
    expect(after & 256).toBe(before & 256);
    expect(after & 32).toBe(before & 32);
    expect(after & 256).not.toBe(0);
  });

  it('never writes more than a field’s maximum length', async () => {
    const { bytes } = await save('all-field-types.pdf', { values: { pin: text('123456') } });
    const { fields } = await readFieldsWithPdfium(bytes);
    expect(byName(fields, 'pin').initial).toEqual(text('1234'));
  });

  it('reads maximum lengths PDFium does not report', async () => {
    const extras = await readFieldExtras(corpus('all-field-types.pdf'));
    expect(extras.get('pin')).toEqual({ maxLen: 4 });
    expect(extras.has('name_p0')).toBe(false);
  });

  it('never changes the original bytes', async () => {
    const original = corpus('fillable-form.pdf');
    const copy = original.slice();
    const { fields } = await readFieldsWithPdfium(original);
    await savePdf({
      original,
      fields,
      values: new Map([['full_name', text('Changed')]]),
      items: [],
      flatten: true,
      loadFont,
    });
    expect(original).toEqual(copy);
  });
});

describe('savedFileName', () => {
  it('names the copy so the original is never overwritten', () => {
    expect(savedFileName('W-9.pdf', false)).toBe('W-9 (filled).pdf');
    expect(savedFileName('form.PDF', true)).toBe('form (flattened).pdf');
    expect(savedFileName('.pdf', false)).toBe('document (filled).pdf');
  });
});
