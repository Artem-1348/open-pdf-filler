// Detector 1: rule-based. Reads the rendered page (so it also works on
// scans) and finds thin lines, then the boxes, table cells, small squares
// and underlines they form. Coordinates are pixels until the end, where they
// become view-space points.
import type { Box } from '../pdf/geometry';
import type { TextRun } from './labels';
import { cleanLabel } from './labels';
import type { DetectedField } from './types';

export interface PageImage {
  width: number;
  height: number;
  // Pixels per point.
  scale: number;
  // One byte per pixel, 0 = black, 255 = white.
  gray: Uint8Array;
}

interface HLine {
  y1: number;
  y2: number;
  x1: number;
  x2: number;
}
interface VLine {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

// A pixel is ink when it's clearly darker than the page around it. Forms
// often draw their lines and boxes in pale grey or blue, so the cut-off sits
// just below the background rather than at mid-grey; light row shading
// (a few levels below white) stays background.
const INK_BELOW_BACKGROUND = 12;
const MAX_THICKNESS_PT = 3;
const MIN_H_LINE_PT = 6;
const MIN_V_LINE_PT = 5;
const MIN_UNDERLINE_PT = 24;
const JOIN_TOLERANCE_PT = 2.5;
const EMPTY_INK_SHARE = 0.012;

export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    // Transparent counts as white.
    const a = rgba[i + 3] / 255;
    const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    gray[j] = Math.round(lum * a + 255 * (1 - a));
  }
  return gray;
}

export function detectRules(page: number, image: PageImage, runs: ReadonlyArray<TextRun>): DetectedField[] {
  const s = image.scale;
  const threshold = backgroundLevel(image.gray) - INK_BELOW_BACKGROUND;
  const ink = (x: number, y: number) => image.gray[y * image.width + x] < threshold;

  // Letters drawn close together can look like short lines; drop "lines"
  // that run through the middle of text.
  const throughText = (x1: number, x2: number, y1: number, y2: number) =>
    runs.some((r) => {
      const rb = r.box;
      const cy = (y1 + y2) / 2 / s;
      return cy > rb.y + rb.height * 0.15 && cy < rb.y + rb.height * 0.85 && x1 / s < rb.x + rb.width && x2 / s > rb.x;
    });
  const hLines = findHorizontalLines(image, ink, MIN_H_LINE_PT * s, MAX_THICKNESS_PT * s).filter(
    (l) => !throughText(l.x1, l.x2, l.y1, l.y2),
  );
  const vLines = findVerticalLines(image, ink, MIN_V_LINE_PT * s, MAX_THICKNESS_PT * s).filter(
    (l) => !throughText(l.x1, l.x2, l.y1, l.y2),
  );
  const tol = JOIN_TOLERANCE_PT * s;

  const found: DetectedField[] = [];
  const usedAsEdge = new Set<HLine>();
  const cellKeys = new Set<string>();

  const sortedH = [...hLines].sort((a, b) => a.y1 - b.y1);
  for (let ti = 0; ti < sortedH.length; ti++) {
    const top = sortedH[ti];
    for (let bi = ti + 1; bi < sortedH.length; bi++) {
      const bottom = sortedH[bi];
      const dy = bottom.y1 - top.y2;
      if (dy < 5 * s) continue;
      if (dy > 120 * s) break;
      const ox1 = Math.max(top.x1, bottom.x1);
      const ox2 = Math.min(top.x2, bottom.x2);
      if (ox2 - ox1 < 6 * s) continue;
      // Vertical lines joining these two lines, left to right.
      const sides = vLines
        .filter((v) => v.x1 >= ox1 - tol && v.x2 <= ox2 + tol && v.y1 <= top.y2 + tol && v.y2 >= bottom.y1 - tol)
        .sort((a, b) => a.x1 - b.x1);
      for (let k = 0; k + 1 < sides.length; k++) {
        const left = sides[k];
        const right = sides[k + 1];
        if (right.x1 - left.x2 < 5 * s) continue;
        const key = `${Math.round(left.x2 / tol)}:${Math.round(top.y2 / tol)}:${Math.round(right.x1 / tol)}`;
        if (cellKeys.has(key)) continue; // a nearer bottom line already closed this cell
        cellKeys.add(key);
        usedAsEdge.add(top).add(bottom);
        const cell = { x1: left.x2 + 1, y1: top.y2 + 1, x2: right.x1 - 1, y2: bottom.y1 - 1 };
        const field = fieldInCell(page, cell, image, ink, runs);
        if (field) found.push(field);
      }
    }
  }

  mergeDigitBoxes(found);
  dropTableHeaders(found);

  // "$ ____" or "$" in an otherwise empty cell: the amount goes to its right.
  for (const run of runs) {
    if (!/^[$€£¥₽]\s*$/.test(run.text.trim())) continue;
    const field = fieldRightOf(page, run.box, image, ink, runs);
    if (field && !found.some((f) => overlaps(f.box, field.box))) found.push(field);
  }

  // Underlines: a long line with empty space above it, not part of a box.
  for (const line of hLines) {
    if (usedAsEdge.has(line)) continue;
    if (line.x2 - line.x1 < MIN_UNDERLINE_PT * s) continue;
    const field = fieldAboveLine(page, line, image, ink, runs);
    if (field) found.push(field);
  }

  return found;
}

// The page's paper colour: the most common grey level (usually white, but
// scans are often a little darker).
export function backgroundLevel(gray: Uint8Array): number {
  const counts = new Uint32Array(256);
  for (let i = 0; i < gray.length; i += 7) counts[gray[i]]++;
  let best = 255;
  for (let v = 0; v < 256; v++) if (counts[v] > counts[best]) best = v;
  return Math.max(best, 120);
}

// ------------------------------------------------------------- lines

export function findHorizontalLines(img: PageImage, ink: (x: number, y: number) => boolean, minLen: number, maxThick: number): HLine[] {
  const open: HLine[] = [];
  const done: HLine[] = [];
  for (let y = 0; y < img.height; y++) {
    const segs: Array<[number, number]> = [];
    let start = -1;
    for (let x = 0; x <= img.width; x++) {
      const on = x < img.width && ink(x, y);
      if (on && start < 0) start = x;
      else if (!on && start >= 0) {
        if (x - start >= minLen) segs.push([start, x - 1]);
        start = -1;
      }
    }
    // Continue lines from the row above, or start new ones.
    const continued = new Set<HLine>();
    for (const [x1, x2] of segs) {
      const line = open.find((l) => l.y2 === y - 1 && !continued.has(l) && overlapShare(l.x1, l.x2, x1, x2) > 0.8);
      if (line) {
        line.y2 = y;
        line.x1 = Math.min(line.x1, x1);
        line.x2 = Math.max(line.x2, x2);
        continued.add(line);
      } else {
        const fresh = { y1: y, y2: y, x1, x2 };
        open.push(fresh);
        continued.add(fresh);
      }
    }
    for (let i = open.length - 1; i >= 0; i--) {
      if (!continued.has(open[i])) done.push(...open.splice(i, 1));
    }
  }
  done.push(...open);
  return done.filter((l) => l.y2 - l.y1 + 1 <= maxThick);
}

export function findVerticalLines(img: PageImage, ink: (x: number, y: number) => boolean, minLen: number, maxThick: number): VLine[] {
  const open: VLine[] = [];
  const done: VLine[] = [];
  for (let x = 0; x < img.width; x++) {
    const segs: Array<[number, number]> = [];
    let start = -1;
    for (let y = 0; y <= img.height; y++) {
      const on = y < img.height && ink(x, y);
      if (on && start < 0) start = y;
      else if (!on && start >= 0) {
        if (y - start >= minLen) segs.push([start, y - 1]);
        start = -1;
      }
    }
    const continued = new Set<VLine>();
    for (const [y1, y2] of segs) {
      const line = open.find((l) => l.x2 === x - 1 && !continued.has(l) && overlapShare(l.y1, l.y2, y1, y2) > 0.8);
      if (line) {
        line.x2 = x;
        line.y1 = Math.min(line.y1, y1);
        line.y2 = Math.max(line.y2, y2);
        continued.add(line);
      } else {
        const fresh = { x1: x, x2: x, y1, y2 };
        open.push(fresh);
        continued.add(fresh);
      }
    }
    for (let i = open.length - 1; i >= 0; i--) {
      if (!continued.has(open[i])) done.push(...open.splice(i, 1));
    }
  }
  done.push(...open);
  return done.filter((l) => l.x2 - l.x1 + 1 <= maxThick);
}

function overlapShare(a1: number, a2: number, b1: number, b2: number): number {
  const inter = Math.min(a2, b2) - Math.max(a1, b1) + 1;
  return inter / Math.min(a2 - a1 + 1, b2 - b1 + 1);
}

// ------------------------------------------------------------- shapes

interface PxRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function inkShare(r: PxRect, ink: (x: number, y: number) => boolean): number {
  let n = 0;
  let total = 0;
  for (let y = Math.max(0, r.y1); y <= r.y2; y++) {
    for (let x = Math.max(0, r.x1); x <= r.x2; x++) {
      total++;
      if (ink(x, y)) n++;
    }
  }
  return total ? n / total : 1;
}

function rowHasInk(y: number, x1: number, x2: number, ink: (x: number, y: number) => boolean): boolean {
  let n = 0;
  for (let x = x1; x <= x2; x++) if (ink(x, y)) n++;
  return n > Math.max(1, (x2 - x1 + 1) * 0.01);
}

const toBox = (r: PxRect, s: number): Box => ({ x: r.x1 / s, y: r.y1 / s, width: (r.x2 - r.x1 + 1) / s, height: (r.y2 - r.y1 + 1) / s });

function textInside(box: Box, runs: ReadonlyArray<TextRun>): TextRun[] {
  return runs.filter((r) => {
    const cx = r.box.x + r.box.width / 2;
    const cy = r.box.y + r.box.height / 2;
    return cx > box.x && cx < box.x + box.width && cy > box.y && cy < box.y + box.height;
  });
}

// A closed cell: a checkbox if it's a small square, a text field if it's
// empty (or has a small label at the top and room to write below).
function fieldInCell(
  page: number,
  cell: PxRect,
  img: PageImage,
  ink: (x: number, y: number) => boolean,
  runs: ReadonlyArray<TextRun>,
): DetectedField | null {
  const s = img.scale;
  const w = (cell.x2 - cell.x1 + 1) / s;
  const h = (cell.y2 - cell.y1 + 1) / s;
  if (w > (img.width / s) * 0.95) return null; // page frame

  // Margins keep the box's own lines out of the emptiness check.
  const pad = Math.round(1.5 * s);
  const inner = { x1: cell.x1 + pad, y1: cell.y1 + pad, x2: cell.x2 - pad, y2: cell.y2 - pad };

  const square = w >= 5 && w <= 24 && h >= 5 && h <= 24 && w / h > 0.7 && w / h < 1.4;
  // Narrow boxes for one character each (comb fields) are joined later.
  const digitBox = w >= 5 && w <= 24 && h >= 9 && h <= 30 && !square;
  if (square || digitBox) {
    if (inkShare(inner, ink) > 0.25) return null; // a filled square is decoration
    return { page, box: toBox(cell, s), kind: 'checkbox', confidence: square ? 0.85 : 0.5, detector: 'rules', pattern: square ? 'square' : 'digits' };
  }
  if (w < 24 || h < 9) return null;

  const box = toBox(inner, s);
  const insideText = textInside(box, runs);
  if (insideText.length === 0 && inkShare(inner, ink) < EMPTY_INK_SHARE) {
    return { page, box, kind: 'text', multiline: h > 28, confidence: h > 60 ? 0.65 : 0.8, detector: 'rules', pattern: 'box' };
  }

  const label = cleanLabel(insideText.map((r) => r.text).join(' '));
  const withLabel = label ? { label } : {};

  // A label at the top, room below (like the IRS W-9): the field is the
  // empty band at the bottom.
  let y = inner.y2;
  while (y > inner.y1 && !rowHasInk(y, inner.x1, inner.x2, ink)) y--;
  const band = { x1: inner.x1, y1: y + Math.round(1 * s), x2: inner.x2, y2: inner.y2 };
  const bandH = (band.y2 - band.y1 + 1) / s;
  if (bandH >= 9 && bandH >= h * 0.35) {
    return { page, box: toBox(band, s), kind: 'text', multiline: bandH > 28, confidence: 0.75, detector: 'rules', pattern: 'cell-bottom', ...withLabel };
  }

  // A label on the left, room to the right: the field is the empty part.
  const rightBand = emptyRightPart(inner, ink, s);
  if (rightBand && insideText.every((r) => r.box.x + r.box.width <= rightBand.x1 / s + 1)) {
    const bandW = (rightBand.x2 - rightBand.x1 + 1) / s;
    if (bandW >= 30 && bandW >= w * 0.4) {
      return { page, box: toBox(rightBand, s), kind: 'text', multiline: h > 28, confidence: 0.7, detector: 'rules', pattern: 'cell-right', ...withLabel };
    }
  }
  return null;
}

function columnHasInk(x: number, y1: number, y2: number, ink: (x: number, y: number) => boolean): boolean {
  let n = 0;
  for (let y = y1; y <= y2; y++) if (ink(x, y)) n++;
  return n > Math.max(1, (y2 - y1 + 1) * 0.02);
}

// The empty part of a rectangle to the right of whatever is at its left.
function emptyRightPart(r: PxRect, ink: (x: number, y: number) => boolean, s: number): PxRect | null {
  let x = r.x2;
  while (x > r.x1 && !columnHasInk(x, r.y1, r.y2, ink)) x--;
  if (x <= r.x1) return null; // all empty: handled as an empty box
  const x1 = x + Math.round(3 * s);
  return x1 < r.x2 ? { x1, y1: r.y1, x2: r.x2, y2: r.y2 } : null;
}

// After a currency sign: empty space to the right on the same line.
function fieldRightOf(
  page: number,
  sign: Box,
  img: PageImage,
  ink: (x: number, y: number) => boolean,
  runs: ReadonlyArray<TextRun>,
): DetectedField | null {
  const s = img.scale;
  const y1 = Math.max(0, Math.round((sign.y - 2) * s));
  const y2 = Math.min(img.height - 1, Math.round((sign.y + sign.height + 2) * s));
  const x1 = Math.round((sign.x + sign.width + 2) * s);
  let x = x1;
  const limit = Math.min(img.width - 1, x1 + Math.round(140 * s));
  while (x < limit && !columnHasInk(x, y1, y2, ink)) x++;
  const width = (x - x1) / s - 3;
  if (width < 25) return null;
  const box: Box = { x: x1 / s, y: y1 / s, width, height: (y2 - y1) / s };
  if (textInside(box, runs).length) return null;
  return { page, box, kind: 'text', confidence: 0.7, detector: 'rules', pattern: 'currency' };
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Rows of small, equal, touching boxes (one per digit, as in an SSN) are
// one field each run, not many tiny ones. Narrow cells were skipped as too
// small for text; rebuild them here from the checkbox-sized and skipped cells.
function mergeDigitBoxes(found: DetectedField[]): void {
  const small = found.filter((f) => f.kind === 'checkbox');
  const used = new Set<DetectedField>();
  for (const f of small) {
    if (used.has(f)) continue;
    const row = [f];
    let last = f;
    for (;;) {
      const next = small.find(
        (g) =>
          !used.has(g) &&
          !row.includes(g) &&
          Math.abs(g.box.y - last.box.y) < 2 &&
          Math.abs(g.box.height - last.box.height) < 2 &&
          g.box.x - (last.box.x + last.box.width) >= -1 &&
          g.box.x - (last.box.x + last.box.width) < 4,
      );
      if (!next) break;
      row.push(next);
      last = next;
    }
    if (row.length < 2) continue;
    for (const g of row) used.add(g);
    const x1 = row[0].box.x;
    const x2 = last.box.x + last.box.width;
    found.push({ page: f.page, box: { x: x1, y: f.box.y, width: x2 - x1, height: f.box.height }, kind: 'text', confidence: 0.75, detector: 'rules', pattern: 'digits' });
  }
  for (let i = found.length - 1; i >= 0; i--) if (used.has(found[i])) found.splice(i, 1);
}

// A label cell with empty fields right under it in the same column is a
// table header, not a "label: blank" field.
function dropTableHeaders(found: DetectedField[]): void {
  for (let i = found.length - 1; i >= 0; i--) {
    const f = found[i];
    if (f.pattern !== 'cell-right') continue;
    const cellX1 = f.box.x - 40; // the label sat to the left of the field
    const below = found.some(
      (g) =>
        g !== f &&
        (g.pattern === 'box' || g.pattern === 'cell-right') &&
        g.box.y > f.box.y + f.box.height - 1 &&
        g.box.y - (f.box.y + f.box.height) < 8 &&
        g.box.x < f.box.x + f.box.width &&
        g.box.x + g.box.width > cellX1 &&
        Math.abs(g.box.x + g.box.width - (f.box.x + f.box.width)) < 4,
    );
    if (below) found.splice(i, 1);
  }
}

// An underline: the field is the empty space above it (up to 20 pt).
function fieldAboveLine(
  page: number,
  line: HLine,
  img: PageImage,
  ink: (x: number, y: number) => boolean,
  runs: ReadonlyArray<TextRun>,
): DetectedField | null {
  const s = img.scale;
  const x1 = line.x1 + Math.round(1 * s);
  const x2 = line.x2 - Math.round(1 * s);
  let y = line.y1 - 1;
  const limit = Math.max(0, line.y1 - Math.round(20 * s));
  while (y > limit && !rowHasInk(y, x1, x2, ink)) y--;
  const gap = (line.y1 - 1 - y) / s;
  if (gap < 8) return null; // text right above: an underlined heading, not a blank
  const box: Box = { x: x1 / s, y: (line.y1 - Math.min(gap, 18) * s) / s, width: (x2 - x1 + 1) / s, height: Math.min(gap, 18) };
  // Underlined words in the text layer aren't fill-in lines either.
  if (textInside({ ...box, y: box.y - 2, height: box.height + 4 }, runs).length) return null;
  return { page, box, kind: 'text', confidence: 0.75, detector: 'rules', pattern: 'underline' };
}
