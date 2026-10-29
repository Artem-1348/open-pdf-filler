// Editor state: field values and placed items for the open document, plus
// the form builder's drafts (Phase 3) and undo/redo.
import { fieldValuesEqual, type FieldValue, type FormFieldInfo, type PlacedItem, type PlacedKind, type SignatureContent } from '../pdf/model';
import type { Box } from '../pdf/geometry';
import {
  draftsFromFields,
  fieldsFromDrafts,
  sortByPageOrder,
  type CreatableKind,
  type DateFormat,
  type FieldDraft,
} from '../builder/model';

export type Tool =
  | { kind: 'text' }
  | { kind: 'date' }
  | { kind: 'check' }
  | { kind: 'cross' }
  | { kind: 'signature'; signature: SignatureContent };

export type Mode = 'fill' | 'edit';

// A field a detector found (Phase 4), waiting to be accepted or rejected.
export interface Suggestion extends FieldDraft {
  confidence: number;
  detector: 'flattened' | 'rules' | 'model';
}

interface Snapshot {
  drafts: FieldDraft[] | null;
  suggestions: Suggestion[];
  customOrder: boolean;
  values: Map<string, FieldValue>;
  items: PlacedItem[];
}

const HISTORY_LIMIT = 100;

export interface EditorState {
  // Fields as read from the PDF.
  originalFields: FormFieldInfo[];
  // The form's structure once the user edits it; null while untouched.
  drafts: FieldDraft[] | null;
  // Drafts as first made from the PDF; unchanged drafts mean no structure
  // changes to write.
  baseDrafts: FieldDraft[] | null;
  // The user reordered tabs by hand; otherwise drafts stay in page order.
  customOrder: boolean;
  // The fields Fill mode and the writer use: from drafts, or the originals.
  fields: FormFieldInfo[];
  canEdit: boolean;
  mode: Mode;
  values: Map<string, FieldValue>;
  items: PlacedItem[];
  selectedId: string | null;
  // Item that should take keyboard focus for typing right after placement.
  editingId: string | null;
  tool: Tool | null;
  // Items placed since the tool was picked: a tool stays on so several can
  // be placed in a row, and Done then starts typing in the first empty one.
  placedRun: string[];
  // Several placed items picked with the lasso (Fill mode).
  selectedItems: string[];
  // Select tool: draw a loop around things to select them (both modes).
  lasso: boolean;
  // Edit form mode.
  selection: string[];
  // Auto-detect suggestions, and the confidence below which they're hidden.
  suggestions: Suggestion[];
  minConfidence: number;
  buildTool: CreatableKind | null;
  // Undo/redo. Consecutive edits with the same key (typing in one field,
  // dragging one box) count as one step.
  past: Snapshot[];
  future: Snapshot[];
  lastKey: string | null;
  // Snapshot at the last save, to tell whether there are unsaved changes.
  savedValues: Map<string, FieldValue>;
  savedItems: PlacedItem[];
  savedDrafts: FieldDraft[] | null;
}

export interface FieldExtrasUpdate {
  maxLen?: number;
  checkStyle?: import('../pdf/model').CheckStyle;
  fontSize?: number;
  isDate?: boolean;
  dateFormat?: DateFormat;
  tooltip?: string;
}

export type DraftPatch = Partial<Omit<FieldDraft, 'id' | 'source'>>;

export type EditorAction =
  | { type: 'reset'; fields: FormFieldInfo[]; canEdit: boolean }
  | { type: 'set-value'; name: string; value: FieldValue }
  | { type: 'enrich-fields'; extras: ReadonlyMap<string, FieldExtrasUpdate> }
  | { type: 'place'; item: PlacedItem }
  | { type: 'update-item'; id: string; patch: Partial<Omit<PlacedItem, 'id'>> }
  | { type: 'remove-item'; id: string }
  | { type: 'remove-items'; ids: string[] }
  | { type: 'select-items'; ids: string[] }
  | { type: 'set-lasso'; on: boolean }
  | { type: 'select'; id: string | null }
  | { type: 'edit'; id: string }
  | { type: 'stop-editing' }
  | { type: 'set-tool'; tool: Tool | null }
  | { type: 'set-mode'; mode: Mode }
  | { type: 'set-build-tool'; tool: CreatableKind | null }
  // `keepTool`: the field type stays picked, to add more in a row.
  | { type: 'add-drafts'; drafts: FieldDraft[]; keepTool?: boolean }
  // `key` groups a run of updates (e.g. one drag) into one undo step.
  | { type: 'update-drafts'; patches: Array<{ id: string; patch: DraftPatch }>; key?: string }
  | { type: 'remove-drafts'; ids: string[] }
  | { type: 'reorder-drafts'; ids: string[] }
  | { type: 'reset-order' }
  | { type: 'select-drafts'; ids: string[] }
  | { type: 'set-suggestions'; suggestions: Suggestion[] }
  | { type: 'accept-suggestions'; ids: string[] }
  | { type: 'reject-suggestions'; ids: string[] }
  | { type: 'set-min-confidence'; value: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved' };

export const emptyEditor: EditorState = {
  originalFields: [],
  drafts: null,
  baseDrafts: null,
  customOrder: false,
  fields: [],
  canEdit: true,
  mode: 'fill',
  values: new Map(),
  items: [],
  selectedId: null,
  editingId: null,
  tool: null,
  placedRun: [],
  selectedItems: [],
  lasso: false,
  selection: [],
  suggestions: [],
  minConfidence: 0.5,
  buildTool: null,
  past: [],
  future: [],
  lastKey: null,
  savedValues: new Map(),
  savedItems: [],
  savedDrafts: null,
};

const snapshot = (s: EditorState): Snapshot => ({
  drafts: s.drafts,
  suggestions: s.suggestions,
  customOrder: s.customOrder,
  values: s.values,
  items: s.items,
});

// Records the state before an edit, unless it continues the previous one.
function record(state: EditorState, key: string | null): Pick<EditorState, 'past' | 'future' | 'lastKey'> {
  if (key !== null && key === state.lastKey) return { past: state.past, future: [], lastKey: key };
  const past = [...state.past, snapshot(state)].slice(-HISTORY_LIMIT);
  return { past, future: [], lastKey: key };
}

function withDrafts(state: EditorState, drafts: FieldDraft[] | null, customOrder = state.customOrder): EditorState {
  const ordered = drafts && !customOrder ? sortByPageOrder(drafts) : drafts;
  const fields = ordered ? fieldsFromDrafts(ordered, state.originalFields) : state.originalFields;
  return { ...state, drafts: ordered, customOrder, fields };
}

function restore(state: EditorState, snap: Snapshot): EditorState {
  const next = withDrafts({ ...state, values: snap.values, items: snap.items, suggestions: snap.suggestions }, snap.drafts, snap.customOrder);
  const ids = new Set([...(next.drafts?.map((d) => d.id) ?? []), ...snap.suggestions.map((d) => d.id)]);
  const itemIds = new Set(next.items.map((i) => i.id));
  return {
    ...next,
    selection: state.selection.filter((id) => ids.has(id)),
    selectedId: state.selectedId && itemIds.has(state.selectedId) ? state.selectedId : null,
    selectedItems: state.selectedItems.filter((id) => itemIds.has(id)),
    editingId: null,
    lastKey: null,
  };
}

// When a rename leaves an old name unused, its value follows the field.
function migrateValues(
  values: Map<string, FieldValue>,
  before: ReadonlyArray<FieldDraft>,
  after: ReadonlyArray<FieldDraft>,
): Map<string, FieldValue> {
  const stillUsed = new Set(after.map((d) => d.name));
  let out = values;
  for (const old of before) {
    const now = after.find((d) => d.id === old.id);
    if (!now || now.name === old.name || stillUsed.has(old.name)) continue;
    const value = values.get(old.name);
    if (value === undefined || values.has(now.name)) continue;
    if (out === values) out = new Map(values);
    out.set(now.name, value);
    out.delete(old.name);
  }
  return out;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'reset': {
      const values = new Map(action.fields.map((f) => [f.name, f.initial]));
      return {
        ...emptyEditor,
        originalFields: action.fields,
        fields: action.fields,
        canEdit: action.canEdit,
        values,
        savedValues: values,
      };
    }
    case 'enrich-fields': {
      // A length limit can arrive after the user started typing; trim to it
      // so the screen matches what will be saved.
      const values = new Map(state.values);
      for (const [name, extra] of action.extras) {
        const v = values.get(name);
        if (extra.maxLen !== undefined && v?.kind === 'text' && v.text.length > extra.maxLen) {
          values.set(name, { kind: 'text', text: v.text.slice(0, extra.maxLen) });
        }
      }
      const originalFields = state.originalFields.map((f) => {
        const extra = action.extras.get(f.name);
        return extra ? { ...f, ...definedOnly(extra) } : f;
      });
      const drafts = state.drafts?.map((d) => {
        const extra = d.source && action.extras.get(d.source.name);
        if (!extra) return d;
        return {
          ...d,
          ...(extra.maxLen !== undefined ? { maxLen: extra.maxLen } : {}),
          ...(extra.fontSize !== undefined ? { fontSize: extra.fontSize } : {}),
          ...(extra.isDate ? { kind: 'date' as const } : {}),
          ...(extra.dateFormat ? { dateFormat: extra.dateFormat } : {}),
        };
      }) ?? null;
      const next = withDrafts({ ...state, originalFields, values }, drafts);
      // Extras describe the file as opened; they aren't an unsaved change.
      return {
        ...next,
        savedDrafts: state.drafts === state.savedDrafts ? next.drafts : state.savedDrafts,
        baseDrafts: state.drafts === state.baseDrafts ? next.drafts : state.baseDrafts,
      };
    }
    case 'set-value': {
      const values = new Map(state.values);
      values.set(action.name, action.value);
      return { ...state, ...record(state, `value:${action.name}`), values };
    }
    case 'place':
      // The tool stays on; nothing is selected until the run is done.
      return {
        ...state,
        ...record(state, null),
        items: [...state.items, action.item],
        selectedId: null,
        selectedItems: [],
        editingId: null,
        placedRun: [...state.placedRun, action.item.id],
      };
    case 'update-item':
      return {
        ...state,
        ...record(state, `item:${action.id}`),
        items: state.items.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)),
      };
    case 'remove-item':
      return editorReducer(state, { type: 'remove-items', ids: [action.id] });
    case 'remove-items': {
      const gone = new Set(action.ids);
      if (!state.items.some((i) => gone.has(i.id))) return state;
      return {
        ...state,
        ...record(state, null),
        items: state.items.filter((i) => !gone.has(i.id)),
        selectedId: state.selectedId && gone.has(state.selectedId) ? null : state.selectedId,
        selectedItems: state.selectedItems.filter((id) => !gone.has(id)),
        editingId: state.editingId && gone.has(state.editingId) ? null : state.editingId,
      };
    }
    case 'select':
      return {
        ...state,
        selectedId: action.id,
        selectedItems: [],
        editingId: action.id === state.editingId ? state.editingId : null,
        lastKey: null,
      };
    case 'select-items':
      // One item gets the usual single selection (handles, font size).
      return action.ids.length === 1
        ? { ...state, selectedId: action.ids[0], selectedItems: [], editingId: null, lastKey: null }
        : { ...state, selectedId: null, selectedItems: action.ids, editingId: null, lastKey: null };
    case 'set-lasso':
      return {
        ...state,
        lasso: action.on,
        tool: null,
        buildTool: null,
        placedRun: [],
        editingId: null,
        ...(action.on ? {} : { selectedItems: [] }),
      };
    case 'edit':
      return { ...state, selectedId: action.id, editingId: action.id };
    case 'stop-editing':
      return { ...state, editingId: null, lastKey: null };
    case 'set-tool': {
      const base = { ...state, tool: action.tool, placedRun: [], lasso: false, selectedItems: [] };
      if (action.tool) return { ...base, selectedId: null, editingId: null };
      // Done with text boxes: start typing in the first one still empty.
      const firstEmpty =
        state.tool?.kind === 'text'
          ? state.placedRun.map((id) => state.items.find((i) => i.id === id)).find((i) => i?.kind === 'text' && !i.text)
          : undefined;
      return firstEmpty ? { ...base, selectedId: firstEmpty.id, editingId: firstEmpty.id } : base;
    }
    case 'set-mode': {
      const base = {
        ...state,
        mode: action.mode,
        tool: null,
        buildTool: null,
        lasso: false,
        placedRun: [],
        selection: [],
        selectedItems: [],
        selectedId: null,
        editingId: null,
      };
      if (action.mode === 'edit' && !state.drafts) {
        // Entering Edit form turns the PDF's fields into drafts; this alone
        // is not a change to the document.
        const next = withDrafts(base, draftsFromFields(state.originalFields), false);
        return {
          ...next,
          baseDrafts: next.drafts,
          savedDrafts: state.savedDrafts === null ? next.drafts : state.savedDrafts,
        };
      }
      return base;
    }
    case 'set-build-tool':
      return { ...state, buildTool: action.tool, lasso: action.tool ? false : state.lasso, selection: action.tool ? [] : state.selection };
    case 'add-drafts': {
      const drafts = [...(state.drafts ?? []), ...action.drafts];
      const next = withDrafts({ ...state, ...record(state, null) }, drafts);
      return { ...next, selection: action.drafts.map((d) => d.id), buildTool: action.keepTool ? state.buildTool : null };
    }
    case 'update-drafts': {
      if (!state.drafts) return state;
      const patches = new Map(action.patches.map((p) => [p.id, p.patch]));
      const drafts = state.drafts.map((d) => {
        const patch = patches.get(d.id);
        return patch ? { ...d, ...patch } : d;
      });
      const values = migrateValues(state.values, state.drafts, drafts);
      // Suggestions can be moved and resized before they're accepted.
      const suggestions = state.suggestions.some((d) => patches.has(d.id))
        ? state.suggestions.map((d) => {
            const patch = patches.get(d.id);
            return patch ? { ...d, ...patch } : d;
          })
        : state.suggestions;
      return withDrafts({ ...state, ...record(state, action.key ?? null), values, suggestions }, drafts);
    }
    case 'remove-drafts': {
      if (!state.drafts) return state;
      const gone = new Set(action.ids);
      const suggestions = state.suggestions.filter((d) => !gone.has(d.id));
      const next = withDrafts({ ...state, ...record(state, null), suggestions }, state.drafts.filter((d) => !gone.has(d.id)));
      return { ...next, selection: state.selection.filter((id) => !gone.has(id)) };
    }
    case 'reorder-drafts': {
      if (!state.drafts) return state;
      const byId = new Map(state.drafts.map((d) => [d.id, d]));
      const ordered = action.ids.map((id) => byId.get(id)).filter((d): d is FieldDraft => !!d);
      const rest = state.drafts.filter((d) => !action.ids.includes(d.id));
      return withDrafts({ ...state, ...record(state, null) }, [...ordered, ...rest], true);
    }
    case 'reset-order':
      return withDrafts({ ...state, ...record(state, null) }, state.drafts, false);
    case 'select-drafts':
      return { ...state, selection: action.ids, lastKey: null };
    case 'set-suggestions': {
      // Suggestions are reviewed in Edit form, which needs the drafts.
      const base = state.drafts ? state : editorReducer(state, { type: 'set-mode', mode: 'edit' });
      return { ...base, ...record(base, null), mode: 'edit', suggestions: action.suggestions, selection: [] };
    }
    case 'accept-suggestions': {
      const ids = new Set(action.ids);
      const accepted = state.suggestions.filter((d) => ids.has(d.id));
      if (!accepted.length) return state;
      const taken = new Set((state.drafts ?? []).map((d) => d.name));
      const drafts: FieldDraft[] = accepted.map(({ confidence: _c, detector: _d, ...d }) => {
        let name = d.name;
        for (let n = 2; taken.has(name); n++) name = `${d.name} ${n}`;
        taken.add(name);
        return { ...d, name };
      });
      const next = withDrafts(
        { ...state, ...record(state, null), suggestions: state.suggestions.filter((d) => !ids.has(d.id)) },
        [...(state.drafts ?? []), ...drafts],
      );
      return { ...next, selection: drafts.length === 1 ? [drafts[0].id] : [] };
    }
    case 'reject-suggestions': {
      const ids = new Set(action.ids);
      return {
        ...state,
        ...record(state, null),
        suggestions: state.suggestions.filter((d) => !ids.has(d.id)),
        selection: state.selection.filter((id) => !ids.has(id)),
      };
    }
    case 'set-min-confidence':
      return { ...state, minConfidence: action.value };
    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      const restored = restore(state, prev);
      return { ...restored, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future] };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      const restored = restore(state, next);
      return { ...restored, past: [...state.past, snapshot(state)], future: state.future.slice(1) };
    }
    case 'saved':
      return { ...state, savedValues: state.values, savedItems: state.items, savedDrafts: state.drafts };
  }
}

function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export const canUndo = (s: EditorState) => s.past.length > 0;
export const canRedo = (s: EditorState) => s.future.length > 0;

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
  if (state.drafts !== state.savedDrafts) return true;
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

// Structure changes to write when saving, relative to the original file.
export function structureChanges(state: EditorState) {
  if (!state.drafts || state.drafts === state.baseDrafts) return undefined;
  return { drafts: state.drafts, originalFields: state.originalFields };
}

// Suggestions shown with the current confidence filter.
export function visibleSuggestions(state: EditorState): Suggestion[] {
  return state.suggestions.filter((d) => d.confidence >= state.minConfidence);
}

// Placed dates use the same short format as todayText; the calendar picker
// speaks ISO (YYYY-MM-DD). Text that isn't a whole date gives ''.
export function dateTextToIso(text: string, locale?: string): string {
  const order = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(2001, 10, 22))
    .map((p) => p.type)
    .filter((t) => t === 'year' || t === 'month' || t === 'day');
  const nums = text.match(/\d+/g);
  if (!nums || nums.length !== 3 || order.length !== 3) return '';
  const parts: Record<string, string> = {};
  order.forEach((t, i) => (parts[t] = nums[i]));
  const { year: y, month: m, day: d } = parts;
  if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return '';
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function isoToDateText(iso: string, locale?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? todayText(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), locale) : '';
}
