// Detector 2: the model's input and output handling, and how much it adds
// to the rules on the test set (including a form in custom styles).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openWithPdfium, readFieldsWithPdfium } from '../../tests/support/pdfium-node';
import { pageImage, score, textRuns, type Truth } from '../../tests/support/detect-eval';
import { modelFindings } from '../../tests/support/model-node';
import { decodeDetections, toModelInput } from './model';
import { detectFields } from './run';

describe('model input and output', () => {
  it('averages pixels down to the square and normalises them per channel', () => {
    // 4×2 image: left half white, right half black → 2×2 square.
    const w = 4;
    const h = 2;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(x < 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * w + x) * 4);
    const out = toModelInput(rgba, w, h, 2);
    expect(out).toHaveLength(12);
    expect(out[0]).toBeCloseTo((1 - 0.485) / 0.229, 4); // red, white pixel
    expect(out[1]).toBeCloseTo((0 - 0.485) / 0.229, 4); // red, black pixel
    expect(out[8]).toBeCloseTo((1 - 0.406) / 0.225, 4); // blue plane
  });

  it('turns centre boxes into page boxes, maps classes and drops overlaps', () => {
    const classes = 4;
    const logit = (p: number) => Math.log(p / (1 - p));
    const boxes = [0.5, 0.5, 0.2, 0.1, 0.5, 0.5, 0.21, 0.1, 0.1, 0.1, 0.02, 0.02, 0.9, 0.9, 0.1, 0.1];
    const logits = [
      logit(0.9), logit(0.1), logit(0.1), 0, // text, kept
      logit(0.6), logit(0.1), logit(0.1), 0, // same place, less sure: dropped
      logit(0.1), logit(0.8), logit(0.1), 0, // checkbox
      logit(0.2), logit(0.3), logit(0.1), 0, // below the threshold
    ];
    const found = decodeDetections(boxes, logits, classes, 2, { width: 600, height: 800 });
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ page: 2, kind: 'text', detector: 'model', box: { x: 240, y: 360, width: 120, height: 80 } });
    expect(found[0].confidence).toBeCloseTo(0.9, 3);
    expect(found[1]).toMatchObject({ kind: 'checkbox', box: { x: 54, y: 72, width: 12, height: 16 } });
  });
});

const DIR = 'tests/corpus/detect/';
const truthFile = JSON.parse(readFileSync(`${DIR}detect-truth.json`, 'utf8')) as Record<string, { fields: Truth[] }>;

async function run(file: string, truth: Truth[], pages: number[], withModel: boolean) {
  const bytes = new Uint8Array(readFileSync(file));
  const doc = await openWithPdfium(bytes);
  const started = performance.now();
  const found = await detectFields({
    bytes,
    pageCount: Math.max(...pages) + 1,
    existing: [],
    textRuns: (p) => textRuns(doc, p),
    pageImage: (p) => pageImage(doc, p),
    modelFindings: withModel ? (p) => (pages.includes(p) ? modelFindings(doc, p) : Promise.resolve([])) : undefined,
  });
  const s = score(
    found.filter((f) => pages.includes(f.page)),
    truth,
  );
  return { ...s, msPerPage: (performance.now() - started) / pages.length };
}

describe('detector 2 on the test set', () => {
  it('finds more fields with the model than the rules alone, without many wrong ones', async () => {
    const cases: Array<{ file: string; truth: Truth[]; pages: number[] }> = Object.entries(truthFile).map(([file, t]) => ({
      file: DIR + file,
      truth: t.fields,
      pages: [0],
    }));
    const w9 = 'tests/corpus/irs-w9-2024-03.pdf';
    const { fields } = await readFieldsWithPdfium(new Uint8Array(readFileSync(w9)));
    cases.push({
      file: w9,
      truth: fields
        .flatMap((f) => f.widgets.map((w) => ({ page: w.page, box: w.box, kind: f.kind === 'checkbox' || f.kind === 'radio' ? 'checkbox' : 'text' })))
        .filter((t) => t.page === 0),
      pages: [0],
    });

    const total = { rules: { hits: 0, truth: 0, found: 0 }, both: { hits: 0, truth: 0, found: 0 } };
    const rows: string[] = [];
    let custom = { rules: 0, both: 0 };
    for (const c of cases) {
      const rules = await run(c.file, c.truth, c.pages, false);
      const both = await run(c.file, c.truth, c.pages, true);
      for (const [k, s] of [['rules', rules], ['both', both]] as const) {
        total[k].hits += s.hits;
        total[k].truth += s.truth;
        total[k].found += s.found;
      }
      if (c.file.includes('custom')) custom = { rules: rules.recall, both: both.recall };
      const pct = (v: number) => `${Math.round(v * 100)}%`;
      rows.push(
        `${c.file.split('/').pop()}: rules ${rules.hits}/${rules.truth} found, ${pct(rules.precision)} right | +model ${both.hits}/${both.truth} found, ${pct(both.precision)} right, ${Math.round(both.msPerPage)} ms/page`,
      );
    }
    const r = (t: { hits: number; truth: number; found: number }) => `found ${Math.round((t.hits / t.truth) * 100)}%, right ${Math.round((t.hits / t.found) * 100)}%`;
    rows.push(`OVERALL rules: ${r(total.rules)} | +model: ${r(total.both)}`);
    console.log(`[Detector 2]\n${rows.join('\n')}`);

    expect(total.both.hits).toBeGreaterThan(total.rules.hits);
    expect(custom.both).toBeGreaterThan(custom.rules);
    expect(total.both.hits / total.both.found).toBeGreaterThanOrEqual(0.85);
  }, 600_000);
});
