// FR-7: name detected fields from the label next to them, using the page's
// text layer. Text fields usually have their label on the left or just
// above; checkboxes usually have it on the right ("☐ Married").
import type { Box } from '../pdf/geometry';
import type { DetectedField } from './types';

export interface TextRun {
  text: string;
  box: Box;
}

const MAX_LEFT_GAP = 160;
const MAX_RIGHT_GAP = 70;
const MAX_ABOVE_GAP = 24;
const MAX_LABEL_LENGTH = 48;

// Removes control characters, stray punctuation and fill-in underscores.
export function cleanLabel(raw: string): string {
  let s = Array.from(raw)
    .filter((ch) => {
      const c = ch.codePointAt(0)!;
      return c >= 0x20 && c !== 0x7f && !(c >= 0xe000 && c <= 0xf8ff);
    })
    .join('');
  s = s.replace(/_{2,}/g, ' ').replace(/\.{3,}/g, ' ');
  s = s.replace(/^[\s\d]*[.)]\s+/, ''); // "1. Name" → "Name"
  s = s.replace(/[\s:;,.(\-–—_*]+$/, '').replace(/^[\s:;,.)\-–—_*]+/, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > MAX_LABEL_LENGTH) s = `${s.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`;
  return s;
}

const centerY = (b: Box) => b.y + b.height / 2;
const sameLine = (a: Box, b: Box) => Math.abs(centerY(a) - centerY(b)) <= Math.max(a.height, b.height) * 0.7;
const overlapX = (a: Box, b: Box) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);

function nearest(candidates: Array<{ run: TextRun; gap: number }>): string | undefined {
  candidates.sort((a, b) => a.gap - b.gap);
  for (const c of candidates) {
    const label = cleanLabel(c.run.text);
    // Row numbers ("5") and joining words ("or") aren't labels; look further.
    const letters = (label.match(/\p{L}/gu) ?? []).length;
    if (letters >= 3 && !/^(and|or|and\/or|the|of|if any|optional)$/i.test(label)) return label;
  }
  return undefined;
}

export function findLabel(field: Box, kind: DetectedField['kind'], runs: ReadonlyArray<TextRun>): string | undefined {
  // Text that sits inside the field is prefilled content, not a label.
  const outside = runs.filter((r) => overlapX(r.box, field) <= 2 || !sameLine(r.box, field));

  const left = outside
    .filter((r) => sameLine(r.box, field) && r.box.x + r.box.width <= field.x + 2)
    .map((run) => ({ run, gap: field.x - (run.box.x + run.box.width) }))
    .filter((c) => c.gap <= MAX_LEFT_GAP);
  const right = outside
    .filter((r) => sameLine(r.box, field) && r.box.x >= field.x + field.width - 2)
    .map((run) => ({ run, gap: run.box.x - (field.x + field.width) }))
    .filter((c) => c.gap <= MAX_RIGHT_GAP);
  const above = outside
    .filter((r) => r.box.y + r.box.height <= field.y + 2 && overlapX(r.box, field) > 0)
    .map((run) => ({ run, gap: field.y - (run.box.y + run.box.height) }))
    .filter((c) => c.gap <= MAX_ABOVE_GAP);

  if (kind === 'checkbox' || kind === 'radio') return nearest(right) ?? nearest(left) ?? nearest(above);
  return nearest(left) ?? nearest(above);
}

// Labels refine the kind: "Signature" fields and "Date" fields.
export function kindFromLabel(kind: DetectedField['kind'], label: string | undefined): DetectedField['kind'] {
  if (!label || kind === 'checkbox' || kind === 'radio') return kind;
  if (/\bsign(ature|ed)?\b|подпись/i.test(label)) return 'signature';
  if (/\b(date|dob|d\.o\.b|birth\s*day|date of birth)\b|дата/i.test(label)) return 'date';
  return kind;
}

export function labelFields(fields: DetectedField[], runsByPage: ReadonlyMap<number, TextRun[]>): DetectedField[] {
  return fields.map((f) => {
    // A detector may already know the label (e.g. text inside a box's top).
    const label = f.label ?? findLabel(f.box, f.kind, runsByPage.get(f.page) ?? []);
    return { ...f, label, kind: kindFromLabel(f.kind, label) };
  });
}

// Unique field names from labels, falling back to the kind ("Text 3").
export function uniqueNames(fields: ReadonlyArray<DetectedField>, taken: Iterable<string>): string[] {
  const used = new Set(taken);
  const prefix: Record<string, string> = { text: 'Text', date: 'Date', checkbox: 'Checkbox', radio: 'Choice', dropdown: 'Dropdown', signature: 'Signature' };
  return fields.map((f) => {
    const base = (f.label ?? prefix[f.kind] ?? 'Field').replace(/[.\\]/g, ' ').trim() || 'Field';
    let name = base;
    let n = 2;
    if (!f.label) {
      n = 1;
      name = `${base} ${n}`;
    }
    while (used.has(name)) name = `${base} ${n++}`;
    used.add(name);
    return name;
  });
}
