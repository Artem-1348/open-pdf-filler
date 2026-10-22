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
    input.onProgress?.(page + 1, input.pageCount);
  }

  return mergeFindings(labelFields(found, runsByPage), input.existing);
}

// Drops findings that repeat an existing field or a more confident finding.
export function mergeFindings(
  found: ReadonlyArray<DetectedField>,
  existing: ReadonlyArray<{ page: number; box: Box }>,
): DetectedField[] {
  const sorted = [...found].sort((a, b) => b.confidence - a.confidence);
  const kept: DetectedField[] = [];
  const covers = (a: { page: number; box: Box }, b: { page: number; box: Box }) =>
    a.page === b.page && (intersectionOverUnion(a.box, b.box) > 0.3 || coverage(a.box, b.box) > 0.6 || coverage(b.box, a.box) > 0.6);
  for (const f of sorted) {
    if (existing.some((e) => covers(f, e))) continue;
    if (kept.some((k) => covers(f, k))) continue;
    kept.push(f);
  }
  return kept.sort((a, b) => a.page - b.page || a.box.y - b.box.y || a.box.x - b.box.x);
}
