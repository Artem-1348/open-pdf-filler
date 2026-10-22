// Form builder round trips (Phase 3): build or edit a form's structure, save,
// reopen with PDFium, pdf-lib and PDF.js, and check what they see.
import { readFileSync } from 'node:fs';
import { PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { findText, openWithPdfium, readFieldsWithPdfium } from '../../tests/support/pdfium-node';
import { draftsFromFields, fieldsFromDrafts, newDraft, sortByPageOrder, type FieldDraft } from '../builder/model';
import { GATE_VALUES, gateForm } from '../../tests/support/gate-form';
import type { FieldValue, FormFieldInfo } from './model';
import { readFieldExtras, savePdf, type FontFile } from './writer';

const corpus = (name: string) => new Uint8Array(readFileSync(`tests/corpus/${name}`));
const loadFont = async (f: FontFile) =>
  new Uint8Array(readFileSync(`src/assets/fonts/NotoSans-${f === 'italic' ? 'Italic' : 'Regular'}.ttf`));
const LETTER = { width: 612, height: 792 };

async function build(
  file: string,
  edit: (drafts: FieldDraft[], original: FormFieldInfo[]) => FieldDraft[],
  values: Record<string, FieldValue> = {},
  opts: { flatten?: boolean; customOrder?: boolean } = {},
) {
  const original = corpus(file);
  const { fields: originalFields } = await readFieldsWithPdfium(original);
  const edited = edit(draftsFromFields(originalFields), originalFields);
  const drafts = opts.customOrder ? edited : sortByPageOrder(edited);
  const fields = fieldsFromDrafts(drafts, originalFields);
  const bytes = await savePdf({
    original,
    fields,
    values: new Map(Object.entries(values)),
    items: [],
    flatten: opts.flatten ?? false,
    loadFont,
    structure: { drafts, originalFields },
  });
  return { bytes, drafts };
}

const byName = (fields: FormFieldInfo[], name: string) => {
  const f = fields.find((x) => x.name === name);
  if (!f) throw new Error(`no field ${name} in ${fields.map((x) => x.name).join(', ')}`);
  return f;
};

describe('building a new form', () => {
  it('creates the 20-field gate form with the right kinds, names, positions and properties', async () => {
    const { bytes, drafts } = await build('simple.pdf', () => gateForm());
    const { fields } = await readFieldsWithPdfium(bytes);
    expect(fields).toHaveLength(20);
    const kinds = Object.fromEntries(fields.map((f) => [f.name, f.kind]));
    expect(kinds['First 1']).toBe('text');
    expect(kinds['Start date']).toBe('text');
    expect(kinds['Agree terms']).toBe('checkbox');
    expect(kinds.Plan).toBe('radio');
    expect(kinds.Country).toBe('combo');
    expect(kinds.Signature).toBe('signature');
    expect(byName(fields, 'Plan').widgets).toHaveLength(3);
    expect(byName(fields, 'Second 1').required).toBe(true);
    expect(byName(fields, 'Second 3').multiline).toBe(true);
    expect(byName(fields, 'Country').options).toEqual(['Canada', 'Germany', 'Japan']);
    expect(byName(fields, 'Size').editableCombo).toBe(true);
    expect(byName(fields, 'Agree terms').widgets[0].exportValue).toBe('Agree');
    expect(byName(fields, 'Signature').label).toBe('Sign here');

    // Positions survive to within a point.
    for (const d of drafts) {
      const f = byName(fields, d.name);
      const w = f.widgets.find((w) => Math.abs(w.box.x - d.box.x) < 1 && Math.abs(w.box.y - d.box.y) < 1);
      expect(w, `${d.name} at ${d.box.x},${d.box.y}`).toBeDefined();
      // PDFium rounds rectangles outward to whole points.
      expect(Math.abs(w!.box.width - d.box.width)).toBeLessThanOrEqual(1);
    }

    const extras = await readFieldExtras(bytes);
    expect(extras.get('Second 2')?.maxLen).toBe(5);
    expect(extras.get('Start date')).toMatchObject({ isDate: true, dateFormat: 'MM/DD/YYYY' });
    expect(extras.get('End date')).toMatchObject({ isDate: true, dateFormat: 'DD/MM/YYYY' });
  });

  it('writes tab order as page order: rows top to bottom, left to right', async () => {
    const { bytes, drafts } = await build('simple.pdf', () => gateForm());
    const doc = await PDFDocument.load(bytes);
    const annots = doc.getPage(0).node.Annots()!;
    const names: string[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const dict = annots.lookup(i, PDFDict);
      // Radio buttons are kids of their group; the name is on the parent.
      const owner = dict.has(PDFName.of('T')) ? dict : dict.lookup(PDFName.of('Parent'), PDFDict);
      names.push((owner.lookup(PDFName.of('T')) as unknown as { decodeText(): string }).decodeText());
    }
    expect(names).toEqual(drafts.map((d) => d.name));
    expect(names.slice(0, 4)).toEqual(['First 1', 'Second 1', 'First 2', 'Second 2']);
    expect(doc.getPage(0).node.get(PDFName.of('Tabs'))).toBeUndefined();

    // Firefox's engine reads widgets in that order too.
    const pdfjs = await getDocument({ data: bytes.slice() }).promise;
    const ann = (await (await pdfjs.getPage(1)).getAnnotations()) as Array<{ fieldName: string; subtype: string }>;
    expect(ann.filter((a) => a.subtype === 'Widget').map((a) => a.fieldName)).toEqual(names);
  });

  it('keeps a hand-made tab order', async () => {
    const { bytes } = await build(
      'simple.pdf',
      () => {
        const form = sortByPageOrder(gateForm());
        return [form[form.length - 1], ...form.slice(0, -1)];
      },
      {},
      { customOrder: true },
    );
    const doc = await PDFDocument.load(bytes);
    const first = doc.getPage(0).node.Annots()!.lookup(0, PDFDict);
    expect(first.get(PDFName.of('FT'))?.toString()).toBe('/Sig');
  });

  it('fills the built form, and every value survives a reopen', async () => {
    const { bytes } = await build('simple.pdf', () => gateForm(), GATE_VALUES);
    const { fields } = await readFieldsWithPdfium(bytes);
    for (const [name, value] of Object.entries(GATE_VALUES)) {
      expect(byName(fields, name).initial, name).toEqual(value);
    }
  });

  it('flattens a built and filled form', async () => {
    const { bytes } = await build('simple.pdf', () => gateForm(), GATE_VALUES, { flatten: true });
    const { doc, fields } = await readFieldsWithPdfium(bytes);
    expect(fields).toHaveLength(0);
    expect(await findText(doc, 'Ada')).toHaveLength(1);
    expect(await findText(doc, 'Line two')).toHaveLength(1);
  });

  it('places fields upright on rotated pages', async () => {
    const { bytes } = await build(
      'rotated.pdf',
      () =>
        [1, 2, 3].map((page) => ({
          ...newDraft('text', page, { x: 200, y: 160 }, [], LETTER),
          name: `Rotated ${page}`,
        })),
      { 'Rotated 1': { kind: 'text', text: 'Ninety' }, 'Rotated 2': { kind: 'text', text: 'OneEighty' }, 'Rotated 3': { kind: 'text', text: 'TwoSeventy' } },
      { flatten: true },
    );
    const doc = await openWithPdfium(bytes);
    for (const word of ['Ninety', 'OneEighty', 'TwoSeventy']) {
      const [hit] = await findText(doc, word);
      expect(hit, word).toBeDefined();
      // Upright text is wider than tall, and lands inside the field's box.
      expect(hit.rects[0].size.width, word).toBeGreaterThan(hit.rects[0].size.height);
      expect(hit.rects[0].origin.x).toBeGreaterThan(115);
      expect(hit.rects[0].origin.x).toBeLessThan(285);
      expect(hit.rects[0].origin.y).toBeGreaterThan(145);
      expect(hit.rects[0].origin.y).toBeLessThan(175);
    }
  });
});

describe('editing an existing form', () => {
  it('does not creep: saving a built form again keeps every box where it was', async () => {
    const first = await build('simple.pdf', () => gateForm());
    const { fields: once } = await readFieldsWithPdfium(first.bytes);
    const again = await savePdf({
      original: first.bytes,
      fields: once,
      values: new Map(),
      items: [],
      flatten: false,
      loadFont,
      structure: { drafts: draftsFromFields(once), originalFields: once },
    });
    const { fields: twice } = await readFieldsWithPdfium(again);
    for (const f of once) {
      const g = byName(twice, f.name);
      f.widgets.forEach((w, i) => expect(g.widgets[i].box, f.name).toEqual(w.box));
    }
  });

  it('moves, resizes, deletes, renames and changes options', async () => {
    const { bytes } = await build('all-field-types.pdf', (drafts) =>
      drafts
        .filter((d) => d.name !== 'agree_p0')
        .map((d) => {
          if (d.name === 'name_p0') return { ...d, box: { ...d.box, x: d.box.x + 20, width: 200 } };
          if (d.name === 'notes') return { ...d, name: 'comments', required: true };
          if (d.name === 'colour') return { ...d, options: ['Red', 'Green', 'Blue', 'Yellow'] };
          return d;
        }),
    );
    const { fields } = await readFieldsWithPdfium(bytes);
    const names = fields.map((f) => f.name);
    expect(names).not.toContain('agree_p0');
    expect(names).not.toContain('notes');
    expect(names).toContain('comments');
    expect(byName(fields, 'comments').multiline).toBe(true);
    expect(byName(fields, 'comments').required).toBe(true);
    expect(byName(fields, 'colour').options).toEqual(['Red', 'Green', 'Blue', 'Yellow']);
    const name = byName(fields, 'name_p0').widgets[0].box;
    expect(name.x).toBeCloseTo(199.5, 0);
    expect(name.width).toBeCloseTo(200, 0);
    // Untouched fields are still there and unchanged.
    expect(byName(fields, 'size').widgets).toHaveLength(3);
    expect(byName(fields, 'name_p90').kind).toBe('text');
  });

  it('deletes one radio button from a group', async () => {
    const { bytes } = await build('all-field-types.pdf', (drafts) =>
      drafts.filter((d) => !(d.name === 'size' && d.source?.widget === 2)),
    );
    const { fields } = await readFieldsWithPdfium(bytes);
    expect(byName(fields, 'size').widgets).toHaveLength(2);
  });

  it('removes every field when all drafts are deleted', async () => {
    const { bytes } = await build('irs-w9-2024-03.pdf', () => []);
    const { fields } = await readFieldsWithPdfium(bytes);
    expect(fields).toHaveLength(0);
  });
});
