// Runs the detectors over a document and merges their findings (Phase 4).
// Loaded on demand together with pdf-lib, like the writer.
import { PDFDocument } from '@cantoo/pdf-lib';
import type { Box } from '../pdf/geometry';
import { detectFlattened } from './flattened';
import { labelFields, type TextRun } from './labels';
import { detectRules, type PageImage } from './rules';
import { coverage, intersectionOverUnion, type DetectedField } from './types';

export interface DetectInput {
  bytes: Uint8Array;
  password?: string;
  pageCount: number;
  // Fields already in the document (or already accepted): not suggested again.
  existing: ReadonlyArray<{ page: number; box: Box }>;
  textRuns(page: number): Promise<TextRun[]>;
  // A grey-scale rendering of a page for the rule-based detector.
  pageImage(page: number): Promise<PageImage>;
  // Detector 2, when the person has turned it on: the model's findings
  // for a page (it runs in its own worker; see model-client.ts).
  modelFindings?(page: number): Promise<DetectedField[]>;
  onProgress?(done: number, total: number): void;
  signal?: AbortSignal;
}

export async function detectFields(input: DetectInput): Promise<DetectedField[]> {
  // Detector 0: fields stripped by a flatten, from their leftover shells.
  let found: DetectedField[] = [];
  try {
    const doc = await PDFDocument.load(input.bytes, { password: input.password, updateMetadata: false, preserveXFA: true });
    found = detectFlattened(doc);
  } catch {
    // An unreadable structure just means detector 0 has nothing to add.
  }

  // Detector 1: lines and boxes drawn on each page.
  const runsByPage = new Map<number, TextRun[]>();
  for (let page = 0; page < input.pageCount; page++) {
    if (input.signal?.aborted) throw new DOMException('Detection cancelled', 'AbortError');
    const runs = await input.textRuns(page);
    runsByPage.set(page, runs);
    const image = await input.pageImage(page);
    found.push(...detectRules(page, image, runs));
    if (input.modelFindings) {
      if (input.signal?.aborted) throw new DOMException('Detection cancelled', 'AbortError');
      found.push(...(await input.modelFindings(page)));
    }
    input.onProgress?.(page + 1, input.pageCount);
  }

  return mergeFindings(labelFields(found, runsByPage), input.existing);
}

// Shells are exact and the rules follow the drawn lines to the pixel, so
// where detectors agree, their box is kept over the model's.
const PRIORITY: Record<DetectedField['detector'], number> = { flattened: 0, rules: 1, model: 2 };

// Drops findings that repeat an existing field or a better finding. When two
// different detectors found the same field, the kept one is more certain.
export function mergeFindings(
  found: ReadonlyArray<DetectedField>,
  existing: ReadonlyArray<{ page: number; box: Box }>,
): DetectedField[] {
  const sorted = [...found].sort((a, b) => PRIORITY[a.detector] - PRIORITY[b.detector] || b.confidence - a.confidence);
  const kept: DetectedField[] = [];
  const covers = (a: { page: number; box: Box }, b: { page: number; box: Box }) =>
    a.page === b.page && (intersectionOverUnion(a.box, b.box) > 0.3 || coverage(a.box, b.box) > 0.6 || coverage(b.box, a.box) > 0.6);
  for (const f of sorted) {
    if (existing.some((e) => covers(f, e))) continue;
    const same = kept.findIndex((k) => covers(f, k));
    if (same >= 0) {
      const k = kept[same];
      if (k.detector !== f.detector) {
        const both = Math.min(0.99, Math.max(k.confidence, f.confidence) + 0.1);
        kept[same] = { ...k, confidence: Math.round(both * 1000) / 1000 };
      }
      continue;
    }
    kept.push(f);
  }
  return kept.sort((a, b) => a.page - b.page || a.box.y - b.box.y || a.box.x - b.box.x);
}
