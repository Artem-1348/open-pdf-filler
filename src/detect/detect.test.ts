// Phase 4 gate, automated: run all detectors on the flat-form test set and
// score them against the true field positions (≥ 85% found, ≥ 85% correct).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openWithPdfium, readFieldsWithPdfium } from '../../tests/support/pdfium-node';
import { pageImage, score, textRuns, type Truth } from '../../tests/support/detect-eval';
import { detectFields } from './run';
import type { DetectedField } from './types';

interface Case {
  file: string;
  truth: Truth[];
}

const DIR = 'tests/corpus/detect/';
const truthFile = JSON.parse(readFileSync(`${DIR}detect-truth.json`, 'utf8')) as Record<string, { fields: Truth[] }>;

async function cases(): Promise<Case[]> {
  // The custom-styles form is the AI scan's test (model.test.ts); the
  // quick scan isn't meant to read it.
  const list: Case[] = Object.entries(truthFile)
    .filter(([file]) => file !== 'flat-custom-styles.pdf')
    .map(([file, t]) => ({ file: DIR + file, truth: t.fields }));
  // The IRS W-9 as a flat form: its fields are hidden when rendered, and
  // the detectors must find them from the drawing alone.
  const w9 = 'tests/corpus/irs-w9-2024-03.pdf';
  const { fields } = await readFieldsWithPdfium(new Uint8Array(readFileSync(w9)));
  list.push({
    file: w9,
    truth: fields
      .flatMap((f) => f.widgets.map((w) => ({ page: w.page, box: w.box, kind: f.kind === 'checkbox' || f.kind === 'radio' ? 'checkbox' : 'text' })))
      .filter((t) => t.page === 0),
  });
  return list;
}

async function detect(file: string, pages?: number[]): Promise<{ found: DetectedField[]; msPerPage: number }> {
  const bytes = new Uint8Array(readFileSync(file));
  const doc = await openWithPdfium(bytes);
  const pageList = pages ?? doc.pages.map((p) => p.index);
  const started = performance.now();
  const found = await detectFields({
    bytes,
    pageCount: Math.max(...pageList) + 1,
    // The W-9's own fields aren't "existing" here: we're testing detection.
    existing: [],
    textRuns: (p) => textRuns(doc, p),
    pageImage: (p) => pageImage(doc, p),
  });
  return { found: found.filter((f) => pageList.includes(f.page)), msPerPage: (performance.now() - started) / pageList.length };
}

describe('Phase 4 gate: auto-detect on the flat-form test set', () => {
  it('finds at least 85% of real fields, and at least 85% of suggestions are right', async () => {
    let hits = 0;
    let truthTotal = 0;
    let foundTotal = 0;
    const rows: string[] = [];
    for (const c of await cases()) {
      const { found, msPerPage } = await detect(c.file, c.file.includes('irs-w9') ? [0] : undefined);
      const s = score(found, c.truth);
      hits += s.hits;
      truthTotal += s.truth;
      foundTotal += s.found;
      rows.push(
        `${c.file.split('/').pop()}: found ${s.hits}/${s.truth} (${Math.round(s.recall * 100)}%), right ${s.hits}/${s.found} (${Math.round(s.precision * 100)}%), ${Math.round(msPerPage)} ms/page`,
      );
    }
    const recall = hits / truthTotal;
    const precision = hits / foundTotal;
    rows.push(`OVERALL: found ${Math.round(recall * 100)}%, right ${Math.round(precision * 100)}%`);
    console.log(`[Phase 4 gate]\n${rows.join('\n')}`);
    expect(recall).toBeGreaterThanOrEqual(0.85);
    expect(precision).toBeGreaterThanOrEqual(0.85);
  }, 120_000);

  it('is fast enough: one page in well under 5 seconds (NFR-4, laptop)', async () => {
    const { msPerPage } = await detect(`${DIR}flat-drawn-form.pdf`);
    expect(msPerPage).toBeLessThan(5000);
  }, 60_000);
});
