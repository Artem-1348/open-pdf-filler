import { existsSync, readFileSync } from 'node:fs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { openWithPdfium, pdfium, readFieldsWithPdfium } from '../../tests/support/pdfium-node';
import { IDENTITY, multiply, readContent, transformRect } from './content';
import { detectFlattened } from './flattened';
import { intersectionOverUnion } from './types';

const corpus = (name: string) => new Uint8Array(readFileSync(`tests/corpus/${name}`));

// What "Print → Save as PDF" in Chrome does: PDFium flattens every page.
async function flattenWithPdfium(bytes: Uint8Array): Promise<Uint8Array> {
  const e = await pdfium();
  const doc = await openWithPdfium(bytes);
  for (const page of doc.pages) await e.flattenPage(doc, page).toPromise();
  return new Uint8Array(await e.saveAsCopy(doc).toPromise());
}

describe('content stream reader', () => {
  it('follows q/Q and cm to where XObjects are drawn', () => {
    const { uses } = readContent('q 1 0 0 1 100 200 cm /A Do Q q 2 0 0 2 0 0 cm q 1 0 0 1 5 5 cm /B Do Q Q /C Do');
    expect(uses.map((u) => u.name)).toEqual(['A', 'B', 'C']);
    expect(uses[0].ctm).toEqual([1, 0, 0, 1, 100, 200]);
    expect(uses[1].ctm).toEqual([2, 0, 0, 2, 10, 10]);
    expect(uses[2].ctm).toEqual(IDENTITY);
  });

  it('skips strings, dictionaries and comments without losing track', () => {
    const { uses } = readContent('% comment q\n(a ) Q string) Tj <</X 1 0 0 1 9 9 cm>> BDC q 1 0 0 1 3 4 cm /Im Do Q');
    expect(uses).toEqual([{ name: 'Im', ctm: [1, 0, 0, 1, 3, 4] }]);
  });

  it('composes matrices and transforms rectangles', () => {
    const m = multiply([1, 0, 0, 1, 10, 20], [2, 0, 0, 2, 0, 0]);
    expect(m).toEqual([2, 0, 0, 2, 20, 40]);
    expect(transformRect(m, { x1: 0, y1: 0, x2: 5, y2: 5 })).toEqual({ x: 20, y: 40, width: 10, height: 10 });
  });
});

describe('detector 0: rebuild flattened fields', () => {
  // (The IRS W-9 is left out on purpose: PDFium leaves no shells when it
  // flattens that form, so nothing survives for this detector; detector 1,
  // which reads the drawn lines and boxes, covers it.)
  for (const file of ['fillable-form.pdf', 'all-field-types.pdf']) {
    it(`finds every field of ${file} after a PDFium flatten`, async () => {
      const original = corpus(file);
      const { fields } = await readFieldsWithPdfium(original);
      const truth = fields.flatMap((f) => f.widgets.map((w) => ({ ...w, kind: f.kind })));
      const flat = await flattenWithPdfium(original);
      // The flattened file really has no fields left.
      expect((await readFieldsWithPdfium(flat)).fields).toHaveLength(0);

      const found = detectFlattened(await PDFDocument.load(flat));
      const matched = truth.filter((t) => found.some((f) => f.page === t.page && intersectionOverUnion(f.box, t.box) > 0.8));
      expect(matched.length / truth.length, `${matched.length} of ${truth.length}`).toBeGreaterThanOrEqual(0.95);
      expect(found.length).toBeLessThanOrEqual(truth.length);
      // Checkboxes and radios come back as checkboxes, the rest as text.
      for (const t of truth) {
        const f = found.find((x) => x.page === t.page && intersectionOverUnion(x.box, t.box) > 0.8);
        if (!f) continue;
        if (t.kind === 'checkbox' || t.kind === 'radio') expect(f.kind, `${t.kind} at ${t.box.x},${t.box.y}`).toBe('checkbox');
      }
    });
  }

  it('finds nothing in a flattened W-9, where PDFium kept no shells', async () => {
    const flat = await flattenWithPdfium(corpus('irs-w9-2024-03.pdf'));
    expect(detectFlattened(await PDFDocument.load(flat))).toHaveLength(0);
  });

  it('finds nothing in PDFs that were never forms', async () => {
    for (const file of ['simple.pdf', 'twenty-pages.pdf', 'rotated.pdf', 'image-only.pdf']) {
      expect(detectFlattened(await PDFDocument.load(corpus(file))), file).toHaveLength(0);
    }
  });

  // The project owner's real form: checked on this Mac only, never committed.
  const LOCAL = process.env.LOGICS_PDF;
  it.skipIf(!LOCAL || !existsSync(LOCAL))('finds all 328 stripped fields in the owner\'s form (local only)', async () => {
    const found = detectFlattened(await PDFDocument.load(readFileSync(LOCAL!)));
    expect(found).toHaveLength(328);
    expect(found.filter((f) => f.kind === 'checkbox')).toHaveLength(79);
  });
});
