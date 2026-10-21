// The form builder's model: one draft per widget (a field's box on a page).
// Fields with several boxes (radio groups, a field repeated on two pages)
// are drafts sharing a name. The order of the drafts is the tab order.
import type { Box } from '../pdf/geometry';
import type { FieldKind, FieldValue, FormFieldInfo } from '../pdf/model';

export type DraftKind = 'text' | 'date' | 'checkbox' | 'radio' | 'dropdown' | 'signature' | 'list' | 'button';
// Kinds the palette can create; lists and buttons can only be moved or deleted.
export type CreatableKind = 'text' | 'date' | 'checkbox' | 'radio' | 'dropdown' | 'signature';

export const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export interface FieldDraft {
  id: string;
  name: string;
  kind: DraftKind;
  page: number;
  box: Box;
  tooltip: string;
  required: boolean;
  readOnly: boolean;
  multiline: boolean;
  maxLen?: number;
  // Points; 0 = auto.
  fontSize: number;
  // Checkbox and radio: the value this box stands for when on.
  exportValue: string;
  // Dropdown and list.
  options: string[];
  editable: boolean;
  multiSelect: boolean;
  dateFormat: DateFormat;
  // Draw a thin border around new fields (existing fields keep their look).
  border: boolean;
  // The PDF field and widget this draft came from; absent for new fields.
  source?: { name: string; widget: number };
}

const fromFieldKind: Record<FieldKind, DraftKind> = {
  text: 'text',
  checkbox: 'checkbox',
  radio: 'radio',
  combo: 'dropdown',
  list: 'list',
  signature: 'signature',
  button: 'button',
};

export function draftsFromFields(fields: ReadonlyArray<FormFieldInfo>): FieldDraft[] {
  const drafts: FieldDraft[] = [];
  for (const f of fields) {
    f.widgets.forEach((w, i) => {
      drafts.push({
        id: `src:${f.name}#${i}`,
        name: f.name,
        kind: f.isDate ? 'date' : fromFieldKind[f.kind],
        page: w.page,
        box: { ...w.box },
        tooltip: f.tooltip ?? '',
        required: f.required,
        readOnly: f.readOnly,
        multiline: f.multiline,
        maxLen: f.maxLen,
        fontSize: f.fontSize,
        exportValue: w.exportValue,
        options: [...f.options],
        editable: f.editableCombo,
        multiSelect: f.multiSelect,
        dateFormat: f.dateFormat ?? 'MM/DD/YYYY',
        border: false,
        source: { name: f.name, widget: i },
      });
    });
  }
  return sortByPageOrder(drafts);
}

const toFieldKind: Record<DraftKind, FieldKind> = {
  text: 'text',
  date: 'text',
  checkbox: 'checkbox',
  radio: 'radio',
  dropdown: 'combo',
  list: 'list',
  signature: 'signature',
  button: 'button',
};

// Back to fields for Fill mode and the writer. Field order follows the first
// draft of each name; widget order follows draft order.
export function fieldsFromDrafts(
  drafts: ReadonlyArray<FieldDraft>,
  original: ReadonlyArray<FormFieldInfo>,
): FormFieldInfo[] {
  const byName = new Map<string, FormFieldInfo>();
  const originalByName = new Map(original.map((f) => [f.name, f]));
  for (const d of drafts) {
    let f = byName.get(d.name);
    if (!f) {
      const src = d.source ? originalByName.get(d.source.name) : undefined;
      const kind = toFieldKind[d.kind];
      const sameKind = src && src.kind === kind;
      f = {
        name: d.name,
        label: d.tooltip.trim() || labelFromName(d.name),
        tooltip: d.tooltip,
        kind,
        widgets: [],
        options: [...d.options],
        multiline: d.multiline,
        readOnly: d.readOnly,
        required: d.required,
        editableCombo: d.editable,
        multiSelect: d.multiSelect,
        maxLen: d.maxLen,
        fontSize: d.fontSize,
        isDate: d.kind === 'date',
        dateFormat: d.dateFormat,
        initial: sameKind ? src.initial : emptyValue(kind),
      };
      byName.set(d.name, f);
    }
    f.widgets.push({ page: d.page, box: { ...d.box }, exportValue: d.exportValue });
  }
  // A toggle's initial "on" index may point past a removed widget.
  for (const f of byName.values()) {
    if (f.initial.kind === 'toggle' && f.initial.on >= f.widgets.length) f.initial = { kind: 'toggle', on: -1 };
  }
  return [...byName.values()];
}

export function emptyValue(kind: FieldKind): FieldValue {
  if (kind === 'checkbox' || kind === 'radio') return { kind: 'toggle', on: -1 };
  if (kind === 'combo' || kind === 'list') return { kind: 'choice', selected: [] };
  return { kind: 'text', text: '' };
}

export function labelFromName(name: string): string {
  const last = name.split('.').pop() ?? name;
  return last.replace(/\[\d+\]$/, '').replace(/_/g, ' ');
}

// ------------------------------------------------------------- tab order

// Page order: pages first, then rows top to bottom (boxes whose vertical
// centres are within ROW_TOLERANCE points count as one row), then left to right.
export const ROW_TOLERANCE = 6;

export function sortByPageOrder<T extends { page: number; box: Box }>(items: ReadonlyArray<T>): T[] {
  const out: T[] = [];
  const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  for (const page of pages) {
    const onPage = items.filter((i) => i.page === page).sort((a, b) => centerY(a) - centerY(b));
    const rows: T[][] = [];
    for (const item of onPage) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(centerY(item) - centerY(row[0])) <= ROW_TOLERANCE) row.push(item);
      else rows.push([item]);
    }
    for (const row of rows) out.push(...row.sort((a, b) => a.box.x - b.box.x));
  }
  return out;
}

const centerY = (i: { box: Box }) => i.box.y + i.box.height / 2;

// ------------------------------------------------------------- names

const KIND_PREFIX: Record<DraftKind, string> = {
  text: 'Text',
  date: 'Date',
  checkbox: 'Checkbox',
  radio: 'Choice',
  dropdown: 'Dropdown',
  signature: 'Signature',
  list: 'List',
  button: 'Button',
};

export function nextName(kind: DraftKind, drafts: ReadonlyArray<FieldDraft>): string {
  const taken = new Set(drafts.map((d) => d.name));
  for (let n = 1; ; n++) {
    const name = `${KIND_PREFIX[kind]} ${n}`;
    if (!taken.has(name)) return name;
  }
}

// Names used by drafts of incompatible kinds (or two separate checkboxes):
// PDF would merge them into one field and link their values.
export function nameClashes(drafts: ReadonlyArray<FieldDraft>): Set<string> {
  const groups = new Map<string, FieldDraft[]>();
  for (const d of drafts) {
    const list = groups.get(d.name);
    if (list) list.push(d);
    else groups.set(d.name, [d]);
  }
  const clashes = new Set<string>();
  for (const [name, group] of groups) {
    if (group.length < 2) continue;
    const kinds = new Set(group.map((d) => d.kind));
    if (kinds.size > 1) clashes.add(name);
    // Radio buttons share a name on purpose; other kinds may repeat a field
    // on several pages, but then all its properties must match.
    else if (group[0].kind === 'radio') {
      const values = group.map((d) => d.exportValue);
      if (new Set(values).size !== values.length) clashes.add(name);
    } else if (group[0].kind === 'checkbox') {
      const values = group.map((d) => d.exportValue);
      if (new Set(values).size === 1 && group.some((d) => !d.source)) clashes.add(name);
    }
  }
  return clashes;
}

export const isNameValid = (name: string) => name.trim().length > 0 && !/[.\\]/.test(name);

// ------------------------------------------------------------- new drafts

// Default sizes in points for each kind when tapped onto a page.
export const DEFAULT_SIZE: Record<CreatableKind, { width: number; height: number }> = {
  text: { width: 160, height: 20 },
  date: { width: 90, height: 20 },
  checkbox: { width: 14, height: 14 },
  radio: { width: 14, height: 14 },
  dropdown: { width: 120, height: 20 },
  signature: { width: 160, height: 36 },
};

let counter = 0;
export function newDraftId(): string {
  counter += 1;
  return `new:${Date.now().toString(36)}-${counter}`;
}

export function newDraft(
  kind: CreatableKind,
  page: number,
  at: { x: number; y: number },
  drafts: ReadonlyArray<FieldDraft>,
  pageSize: { width: number; height: number },
): FieldDraft {
  const size = DEFAULT_SIZE[kind];
  const box = clampToPage({ x: at.x - size.width / 2, y: at.y - size.height / 2, ...size }, pageSize);
  const name = nextName(kind, drafts);
  return {
    id: newDraftId(),
    name,
    kind,
    page,
    box,
    tooltip: kind === 'date' ? 'Date (MM/DD/YYYY)' : '',
    required: false,
    readOnly: false,
    multiline: false,
    fontSize: 0,
    exportValue: kind === 'radio' ? 'Option 1' : kind === 'checkbox' ? 'Yes' : '',
    options: kind === 'dropdown' ? ['Option 1', 'Option 2', 'Option 3'] : [],
    editable: false,
    multiSelect: false,
    dateFormat: 'MM/DD/YYYY',
    border: true,
  };
}

// Another radio button in the same group, placed below the given one.
export function nextRadioOption(of: FieldDraft, drafts: ReadonlyArray<FieldDraft>, pageSize: { width: number; height: number }): FieldDraft {
  const values = new Set(drafts.filter((d) => d.name === of.name).map((d) => d.exportValue));
  let n = values.size + 1;
  while (values.has(`Option ${n}`)) n++;
  return {
    ...of,
    id: newDraftId(),
    exportValue: `Option ${n}`,
    box: clampToPage({ ...of.box, y: of.box.y + of.box.height + 8 }, pageSize),
    source: undefined,
  };
}

export function duplicateDraft(of: FieldDraft, drafts: ReadonlyArray<FieldDraft>, pageSize: { width: number; height: number }): FieldDraft {
  if (of.kind === 'radio') return nextRadioOption(of, drafts, pageSize);
  return {
    ...of,
    id: newDraftId(),
    name: nextName(of.kind, drafts),
    box: clampToPage({ ...of.box, x: of.box.x + 12, y: of.box.y + of.box.height + 8 }, pageSize),
    source: undefined,
  };
}

export function clampToPage(box: Box, page: { width: number; height: number }): Box {
  const width = Math.min(box.width, page.width);
  const height = Math.min(box.height, page.height);
  return {
    width,
    height,
    x: Math.min(Math.max(box.x, 0), page.width - width),
    y: Math.min(Math.max(box.y, 0), page.height - height),
  };
}

// ------------------------------------------------------------- align

export type Alignment = 'left' | 'right' | 'top' | 'bottom' | 'center-x' | 'center-y' | 'same-width' | 'same-height';

// Aligns boxes to the first selected one (the "anchor"), as design tools do.
export function align(boxes: ReadonlyArray<Box>, how: Alignment): Box[] {
  if (boxes.length < 2) return boxes.map((b) => ({ ...b }));
  const a = boxes[0];
  return boxes.map((b, i) => {
    if (i === 0) return { ...b };
    switch (how) {
      case 'left':
        return { ...b, x: a.x };
      case 'right':
        return { ...b, x: a.x + a.width - b.width };
      case 'top':
        return { ...b, y: a.y };
      case 'bottom':
        return { ...b, y: a.y + a.height - b.height };
      case 'center-x':
        return { ...b, x: a.x + a.width / 2 - b.width / 2 };
      case 'center-y':
        return { ...b, y: a.y + a.height / 2 - b.height / 2 };
      case 'same-width':
        return { ...b, width: a.width };
      case 'same-height':
        return { ...b, height: a.height };
    }
  });
}
