// The editor's document model: form fields read from the PDF, the values the
// user gives them, and items placed on pages. Boxes are in view space (see
// geometry.ts).
import type { Box } from './geometry';

export type CheckStyle = 'check' | 'cross' | 'circle' | 'square' | 'diamond' | 'star';

// ZapfDingbats caption characters used for checkbox marks.
export const CHECK_STYLE_CAPTION: Record<CheckStyle, string> = {
  check: '4',
  cross: '8',
  circle: 'l',
  square: 'n',
  diamond: 'u',
  star: 'H',
};

export type FieldKind = 'text' | 'checkbox' | 'radio' | 'combo' | 'list' | 'signature' | 'button';

export interface WidgetInfo {
  page: number;
  box: Box;
  exportValue: string;
}

export interface FormFieldInfo {
  name: string;
  // Human-readable label: the field's tooltip (/TU) if it has one.
  label: string;
  // The tooltip itself, unshortened.
  tooltip?: string;
  // A text field the form builder marked as a date (Phase 3).
  isDate?: boolean;
  // Checkbox mark as the PDF draws it (from /MK /CA); unknown means a check.
  checkStyle?: CheckStyle;
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  kind: FieldKind;
  widgets: WidgetInfo[];
  options: string[];
  multiline: boolean;
  readOnly: boolean;
  required: boolean;
  editableCombo: boolean;
  multiSelect: boolean;
  maxLen?: number;
  // Font size from the field's default appearance; 0 means "auto".
  fontSize: number;
  initial: FieldValue;
}

export type FieldValue =
  | { kind: 'text'; text: string }
  // Checkboxes and radios: which widget is on (-1 = none). Some forms have a
  // single checkbox field with several boxes that behave like radios.
  | { kind: 'toggle'; on: number }
  | { kind: 'choice'; selected: string[] };

export type PlacedKind = 'text' | 'date' | 'check' | 'cross' | 'signature';

export type SignatureContent =
  | { type: 'drawn'; png: Uint8Array; width: number; height: number }
  | { type: 'typed'; text: string };

export interface PlacedItem {
  id: string;
  page: number;
  kind: PlacedKind;
  box: Box;
  // text and date
  text?: string;
  fontSize?: number;
  signature?: SignatureContent;
}

export function fieldValuesEqual(a: FieldValue, b: FieldValue): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'text':
      return a.text === (b as typeof a).text;
    case 'toggle':
      return a.on === (b as typeof a).on;
    case 'choice': {
      const other = (b as typeof a).selected;
      return a.selected.length === other.length && a.selected.every((s, i) => s === other[i]);
    }
  }
}

// Text-like content of a field value or placed item, for font checks.
export function textsIn(values: Iterable<FieldValue>, items: Iterable<PlacedItem>): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (v.kind === 'text') out.push(v.text);
    else if (v.kind === 'choice') out.push(...v.selected);
  }
  for (const item of items) {
    if (item.text) out.push(item.text);
    if (item.signature?.type === 'typed') out.push(item.signature.text);
  }
  return out;
}
