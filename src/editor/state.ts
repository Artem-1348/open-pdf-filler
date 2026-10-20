// Editor state: field values and placed items for the open document.
import { fieldValuesEqual, type FieldValue, type FormFieldInfo, type PlacedItem, type PlacedKind, type SignatureContent } from '../pdf/model';
import type { Box } from '../pdf/geometry';

export type Tool =
  | { kind: 'text' }
  | { kind: 'date' }
  | { kind: 'check' }
  | { kind: 'cross' }
  | { kind: 'signature'; signature: SignatureContent };

export interface EditorState {
  fields: FormFieldInfo[];
  canEdit: boolean;
  values: Map<string, FieldValue>;
  items: PlacedItem[];
  selectedId: string | null;
  // Item that should take keyboard focus for typing right after placement.
  editingId: string | null;
  tool: Tool | null;
  // Snapshot at the last save, to tell whether there are unsaved changes.
  savedValues: Map<string, FieldValue>;
  savedItems: PlacedItem[];
}

export type EditorAction =
  | { type: 'reset'; fields: FormFieldInfo[]; canEdit: boolean }
  | { type: 'set-value'; name: string; value: FieldValue }
  | { type: 'enrich-fields'; maxLen: ReadonlyMap<string, { maxLen?: number }> }
  | { type: 'place'; item: PlacedItem }
  | { type: 'update-item'; id: string; patch: Partial<Omit<PlacedItem, 'id'>> }
  | { type: 'remove-item'; id: string }
  | { type: 'select'; id: string | null }
  | { type: 'edit'; id: string }
  | { type: 'stop-editing' }
  | { type: 'set-tool'; tool: Tool | null }
  | { type: 'saved' };

export const emptyEditor: EditorState = {
  fields: [],
  canEdit: true,
  values: new Map(),
  items: [],
  selectedId: null,
  editingId: null,
  tool: null,
  savedValues: new Map(),
  savedItems: [],
};

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'reset': {
      const values = new Map(action.fields.map((f) => [f.name, f.initial]));
      return { ...emptyEditor, fields: action.fields, canEdit: action.canEdit, values, savedValues: values };
    }
    case 'enrich-fields':
      return {
        ...state,
        fields: state.fields.map((f) => {
          const extra = action.maxLen.get(f.name);
          return extra?.maxLen !== undefined ? { ...f, maxLen: extra.maxLen } : f;
        }),
      };
    case 'set-value': {
      const values = new Map(state.values);
      values.set(action.name, action.value);
      return { ...state, values };
    }
    case 'place':
      return {
        ...state,
        items: [...state.items, action.item],
        selectedId: action.item.id,
        editingId: action.item.kind === 'text' ? action.item.id : null,
        tool: null,
      };
    case 'update-item':
      return {
        ...state,
        items: state.items.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)),
      };
    case 'remove-item':
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        editingId: state.editingId === action.id ? null : state.editingId,
      };
    case 'select':
      return { ...state, selectedId: action.id, editingId: action.id === state.editingId ? state.editingId : null };
    case 'edit':
      return { ...state, selectedId: action.id, editingId: action.id };
    case 'stop-editing':
      return { ...state, editingId: null };
    case 'set-tool':
      return { ...state, tool: action.tool, selectedId: action.tool ? null : state.selectedId };
    case 'saved':
      return { ...state, savedValues: state.values, savedItems: state.items };
  }
}

// Fields whose value differs from what the file had when opened.
export function changedValues(state: EditorState): Map<string, FieldValue> {
  const out = new Map<string, FieldValue>();
  for (const field of state.fields) {
    const value = state.values.get(field.name);
    if (value && !fieldValuesEqual(value, field.initial)) out.set(field.name, value);
  }
  return out;
}

export function hasUnsavedChanges(state: EditorState): boolean {
  if (state.items !== state.savedItems) {
    if (state.items.length !== state.savedItems.length) return true;
    if (state.items.some((item, i) => item !== state.savedItems[i])) return true;
  }
  for (const field of state.fields) {
    const now = state.values.get(field.name);
    const then = state.savedValues.get(field.name);
    if (now && then && !fieldValuesEqual(now, then)) return true;
  }
  return false;
}

// Items that would leave nothing on the page (empty text) don't count.
export function meaningfulItems(items: ReadonlyArray<PlacedItem>): PlacedItem[] {
  return items.filter((i) => (i.kind === 'text' || i.kind === 'date' ? !!i.text?.trim() : true));
}

let counter = 0;
export function newItemId(): string {
  counter += 1;
  return `item-${Date.now().toString(36)}-${counter}`;
}

// Default sizes, in points, for newly placed items.
export const DEFAULT_TEXT_SIZE = 12;
export const DEFAULT_MARK_SIZE = 16;
export const DEFAULT_SIGNATURE_HEIGHT = 36;

// Where a click at `point` puts a new item of this kind.
export function initialBox(kind: PlacedKind, point: { x: number; y: number }, signature?: SignatureContent): Box {
  switch (kind) {
    case 'text':
    case 'date':
      // The click marks where the text starts, roughly at the middle of the line.
      return { x: point.x - 2, y: point.y - DEFAULT_TEXT_SIZE * 0.8, width: 80, height: DEFAULT_TEXT_SIZE * 1.2 + 4 };
    case 'check':
    case 'cross':
      return {
        x: point.x - DEFAULT_MARK_SIZE / 2,
        y: point.y - DEFAULT_MARK_SIZE / 2,
        width: DEFAULT_MARK_SIZE,
        height: DEFAULT_MARK_SIZE,
      };
    case 'signature': {
      const height = DEFAULT_SIGNATURE_HEIGHT;
      const aspect = signature?.type === 'drawn' ? signature.width / signature.height : 4;
      const width = height * aspect;
      return { x: point.x - width / 2, y: point.y - height / 2, width, height };
    }
  }
}

// Today's date in the user's own short format, e.g. 10/20/2026 or 20.10.2026.
export function todayText(date = new Date(), locale?: string): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
