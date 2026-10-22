import type { Box } from '../pdf/geometry';
import type { CreatableKind } from '../builder/model';

export type DetectorId = 'flattened' | 'rules' | 'model';

export interface DetectedField {
  page: number;
  // View space (points, top-left origin, page as displayed).
  box: Box;
  kind: CreatableKind;
  multiline?: boolean;
  // 0–1: how sure the detector is that this is a real field.
  confidence: number;
  detector: DetectorId;
  // The label next to it, from the page's text, if found (FR-7).
  label?: string;
  // Which rule produced it (detector 1), for later clean-up passes.
  pattern?: 'box' | 'cell-bottom' | 'cell-right' | 'underline' | 'currency' | 'square' | 'digits';
}

// Kind from shape alone; labels can refine it later.
export function kindFromShape(box: Box): { kind: CreatableKind; multiline: boolean } {
  const { width: w, height: h } = box;
  const ratio = w / Math.max(h, 0.001);
  if (w <= 24 && h <= 24 && ratio > 0.6 && ratio < 1.6) return { kind: 'checkbox', multiline: false };
  return { kind: 'text', multiline: h > 28 };
}

export function intersectionOverUnion(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

// How much of `inner` lies inside `outer` (0–1).
export function coverage(inner: Box, outer: Box): number {
  const x1 = Math.max(inner.x, outer.x);
  const y1 = Math.max(inner.y, outer.y);
  const x2 = Math.min(inner.x + inner.width, outer.x + outer.width);
  const y2 = Math.min(inner.y + inner.height, outer.y + outer.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inner.width * inner.height > 0 ? inter / (inner.width * inner.height) : 0;
}
