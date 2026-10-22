// Scores detectors against known fields (Phase 4 gate: ≥ 85% recall and
// precision). A finding matches a real field if IoU ≥ 0.5 and the kinds
// agree (text, date and signature all count as "text-like").
import type { PdfDocumentObject } from '@embedpdf/models';
import { toGray, type PageImage } from '../../src/detect/rules';
import type { TextRun } from '../../src/detect/labels';
import { intersectionOverUnion, type DetectedField } from '../../src/detect/types';
import type { Box } from '../../src/pdf/geometry';
import { pdfium } from './pdfium-node';

export interface Truth {
  page: number;
  box: Box;
  kind: string;
}

const family = (k: string) => (k === 'checkbox' || k === 'radio' ? 'toggle' : 'text');

export function score(found: ReadonlyArray<DetectedField>, truth: ReadonlyArray<Truth>, iou = 0.5) {
  const used = new Set<number>();
  let hits = 0;
  for (const t of truth) {
    let best = -1;
    let bestIou = iou;
    found.forEach((f, i) => {
      if (used.has(i) || f.page !== t.page || family(f.kind) !== family(t.kind)) return;
      const v = intersectionOverUnion(f.box, t.box);
      if (v >= bestIou) {
        bestIou = v;
        best = i;
      }
    });
    if (best >= 0) {
      used.add(best);
      hits++;
    }
  }
  const missed = truth.length - hits;
  return {
    hits,
    truth: truth.length,
    found: found.length,
    recall: truth.length ? hits / truth.length : 1,
    precision: found.length ? hits / found.length : 1,
    missed,
    extra: found.length - hits,
    unmatched: found.filter((_, i) => !used.has(i)),
  };
}

// The page as the rule-based detector sees it: rendered at 2 px/pt without
// form fields (they're what we're looking for), in grey.
export async function pageImage(doc: PdfDocumentObject, page: number, scale = 2): Promise<PageImage> {
  const e = await pdfium();
  const img = (await e
    .renderPageRaw(doc, doc.pages[page], { scaleFactor: scale, dpr: 1, withAnnotations: false, withForms: false })
    .toPromise()) as { width: number; height: number; data: Uint8ClampedArray };
  return { width: img.width, height: img.height, scale, gray: toGray(img.data, img.width, img.height) };
}

export async function textRuns(doc: PdfDocumentObject, page: number): Promise<TextRun[]> {
  const e = await pdfium();
  const { runs } = await e.getPageTextRuns(doc, doc.pages[page]).toPromise();
  return runs.map((r) => ({ text: r.text, box: { x: r.rect.origin.x, y: r.rect.origin.y, width: r.rect.size.width, height: r.rect.size.height } }));
}
