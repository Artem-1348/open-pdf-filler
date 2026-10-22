// Edit form mode's side panel (a bottom sheet on phones): properties of the
// selected field, alignment for several, and the tab order when nothing is
// selected.
import { useEffect, useState, type ReactNode } from 'react';
import { useEditor } from '../editor/EditorContext';
import { visibleSuggestions, type DraftPatch, type Suggestion } from '../editor/state';
import {
  DATE_FORMATS,
  align,
  duplicateDraft,
  isNameValid,
  nameClashes,
  nextRadioOption,
  type Alignment,
  type DateFormat,
  type FieldDraft,
} from './model';

interface Props {
  pageSizes: ReadonlyArray<{ width: number; height: number }>;
  onGoToPage(index: number): void;
}

// Properties that belong to the whole field, shared by all its boxes.
const FIELD_LEVEL: Array<keyof DraftPatch> = [
  'name',
  'tooltip',
  'required',
  'readOnly',
  'multiline',
  'maxLen',
  'fontSize',
  'options',
  'editable',
  'multiSelect',
  'dateFormat',
];

export function PropertiesPanel({ pageSizes, onGoToPage }: Props) {
  const { state } = useEditor();
  const drafts = state.drafts ?? [];
  const selectedSuggestions = state.suggestions.filter((d) => state.selection.includes(d.id));
  const selected = [...drafts.filter((d) => state.selection.includes(d.id)), ...selectedSuggestions];
  const onlySuggestions = selected.length > 0 && selectedSuggestions.length === selected.length;
  // Opening or folding the panel lasts until the selection changes. By
  // default it's open, except on phones with nothing selected, where it
  // would cover half the page. While a field type is picked it folds away so
  // the whole page can be tapped.
  const narrow = useNarrow();
  const selectionKey = state.selection.join(',');
  const [toggled, setToggled] = useState<{ key: string; open: boolean } | null>(null);
  const defaultOpen = selected.length > 0 || !narrow;
  const open = !state.buildTool && (toggled?.key === selectionKey ? toggled.open : defaultOpen);
  const setOpen = (fn: (v: boolean) => boolean) => setToggled({ key: selectionKey, open: fn(open) });

  return (
    <aside className={open ? 'props-panel' : 'props-panel collapsed'} aria-label="Field properties" data-testid="props-panel">
      <button type="button" className="props-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {selected.length === 0
          ? state.suggestions.length
            ? 'Suggested fields'
            : 'Fields and tab order'
          : onlySuggestions
            ? 'Suggestion'
            : selected.length === 1
              ? 'Field properties'
              : `${selected.length} fields selected`}
        <span aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <div className="props-body">
          {selected.length === 0 && state.suggestions.length > 0 && <DetectSummary />}
          {selected.length === 0 && <TabOrder drafts={drafts} onGoToPage={onGoToPage} />}
          {onlySuggestions && <SuggestionProps selected={selectedSuggestions} />}
          {!onlySuggestions && selected.length === 1 && (
            <FieldProperties
              key={`${selected[0].id}:${selected[0].name}`}
              draft={selected[0]}
              drafts={drafts}
              pageSize={pageSizes[selected[0].page]}
            />
          )}
          {!onlySuggestions && selected.length > 1 && <MultiSelection selected={selected} drafts={drafts} pageSizes={pageSizes} />}
          {state.selection.length > 0 && (
            <p className="props-hint">Tip: drag to move, use the corner handle to resize, arrow keys to nudge.</p>
          )}
        </div>
      )}
      {selected.length === 0 && state.drafts && !state.buildTool && open && (
        <p className="props-hint">Pick a field type in the toolbar, then tap the page to add it.</p>
      )}
      <span className="sr-only" aria-live="polite">
        {selected.length === 1 ? `Selected ${selected[0].name}` : ''}
      </span>
    </aside>
  );
}

function FieldProperties({ draft, drafts, pageSize }: { draft: FieldDraft; drafts: FieldDraft[]; pageSize: { width: number; height: number } }) {
  const { dispatch } = useEditor();
  const siblings = drafts.filter((d) => d.name === draft.name);
  const clashes = nameClashes(drafts);
  // Keyed on id and name by the parent, so it resets when either changes.
  const [name, setName] = useState(draft.name);

  const set = (patch: DraftPatch, key?: string) => {
    const fieldPatch: DraftPatch = {};
    const widgetPatch: DraftPatch = {};
    for (const [k, v] of Object.entries(patch) as Array<[keyof DraftPatch, unknown]>) {
      if (FIELD_LEVEL.includes(k)) (fieldPatch as Record<string, unknown>)[k] = v;
      else (widgetPatch as Record<string, unknown>)[k] = v;
    }
    const patches = siblings.map((d) => ({ id: d.id, patch: d.id === draft.id ? { ...fieldPatch, ...widgetPatch } : fieldPatch }));
    dispatch({ type: 'update-drafts', patches, key });
  };

  const nameError = !isNameValid(name)
    ? "Names can't be empty or contain dots."
    : name !== draft.name && drafts.some((d) => d.name === name && (d.kind !== draft.kind || draft.kind !== 'radio'))
      ? 'Another field already has this name.'
      : clashes.has(draft.name)
        ? 'This name is shared with a different kind of field.'
        : null;

  const commitName = () => {
    if (name === draft.name) return;
    if (!isNameValid(name) || drafts.some((d) => d.name === name && !(draft.kind === 'radio' && d.kind === 'radio'))) {
      return;
    }
    set({ name: name.trim() });
  };

  return (
    <div className="props-form" data-testid="field-props">
      <p className="props-kind">
        {kindLabel(draft)}
        {draft.source ? ' · from this PDF' : ' · new'}
      </p>
      <Row label={draft.kind === 'radio' ? 'Group name' : 'Name'} error={nameError}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
          }}
          aria-invalid={!!nameError || undefined}
          data-testid="prop-name"
        />
      </Row>
      {draft.kind === 'radio' && (
        <Row label="This option's value">
          <input type="text" value={draft.exportValue} onChange={(e) => set({ exportValue: e.target.value }, `export:${draft.id}`)} data-testid="prop-export" />
        </Row>
      )}
      {draft.kind === 'checkbox' && (
        <Row label="Value when checked">
          <input type="text" value={draft.exportValue} onChange={(e) => set({ exportValue: e.target.value }, `export:${draft.id}`)} data-testid="prop-export" />
        </Row>
      )}
      <Row label="Tooltip (shown when hovering; read aloud by screen readers)">
        <input type="text" value={draft.tooltip} onChange={(e) => set({ tooltip: e.target.value }, `tooltip:${draft.name}`)} data-testid="prop-tooltip" />
      </Row>
      {(draft.kind === 'text' || draft.kind === 'date') && (
        <>
          {draft.kind === 'text' && (
            <Check label="Multi-line" checked={draft.multiline} onChange={(v) => set({ multiline: v })} testId="prop-multiline" />
          )}
          {draft.kind === 'date' && (
            <Row label="Date format">
              <select
                value={draft.dateFormat}
                onChange={(e) => {
                  const dateFormat = e.target.value as DateFormat;
                  const defaultTip = /^Date \(.*\)$/.test(draft.tooltip) || !draft.tooltip;
                  set({ dateFormat, ...(defaultTip ? { tooltip: `Date (${dateFormat})` } : {}) });
                }}
                data-testid="prop-date-format"
              >
                {DATE_FORMATS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Row>
          )}
          {draft.kind === 'text' && (
            <Row label="Maximum characters (blank = no limit)">
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={draft.maxLen ?? ''}
                onChange={(e) => set({ maxLen: e.target.value ? Math.max(1, Number(e.target.value)) : undefined }, `maxlen:${draft.name}`)}
                data-testid="prop-maxlen"
              />
            </Row>
          )}
        </>
      )}
      {(draft.kind === 'text' || draft.kind === 'date' || draft.kind === 'dropdown') && (
        <Row label="Font size (points; 0 = fit automatically)">
          <input
            type="number"
            min={0}
            max={72}
            inputMode="decimal"
            value={draft.fontSize}
            onChange={(e) => set({ fontSize: Math.max(0, Math.min(72, Number(e.target.value) || 0)) }, `font:${draft.name}`)}
            data-testid="prop-font-size"
          />
        </Row>
      )}
      {draft.kind === 'dropdown' && (
        <>
          <Row label="Options (one per line)">
            <textarea
              rows={4}
              value={draft.options.join('\n')}
              onChange={(e) => set({ options: e.target.value.split('\n') }, `options:${draft.name}`)}
              data-testid="prop-options"
            />
          </Row>
          <Check label="People can type their own answer" checked={draft.editable} onChange={(v) => set({ editable: v })} testId="prop-editable" />
        </>
      )}
      <Check label="Required" checked={draft.required} onChange={(v) => set({ required: v })} testId="prop-required" />
      <Check label="Read-only" checked={draft.readOnly} onChange={(v) => set({ readOnly: v })} testId="prop-readonly" />
      {!draft.source && <Check label="Show a border" checked={draft.border} onChange={(v) => set({ border: v })} testId="prop-border" />}

      <div className="props-actions">
        {draft.kind === 'radio' && (
          <button
            type="button"
            className="btn small"
            onClick={() => dispatch({ type: 'add-drafts', drafts: [nextRadioOption(draft, drafts, pageSize)] })}
            data-testid="prop-add-option"
          >
            Add option
          </button>
        )}
        <button
          type="button"
          className="btn small"
          onClick={() => dispatch({ type: 'add-drafts', drafts: [duplicateDraft(draft, drafts, pageSize)] })}
          data-testid="prop-duplicate"
        >
          Duplicate
        </button>
        <button
          type="button"
          className="btn small danger-outline"
          onClick={() => dispatch({ type: 'remove-drafts', ids: [draft.id] })}
          data-testid="prop-delete"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

const ALIGNMENTS: Array<{ how: Alignment; label: string }> = [
  { how: 'left', label: 'Left edges' },
  { how: 'center-x', label: 'Centres (across)' },
  { how: 'right', label: 'Right edges' },
  { how: 'top', label: 'Top edges' },
  { how: 'center-y', label: 'Middles (down)' },
  { how: 'bottom', label: 'Bottom edges' },
  { how: 'same-width', label: 'Same width' },
  { how: 'same-height', label: 'Same height' },
];

function MultiSelection({
  selected,
  drafts,
  pageSizes,
}: {
  selected: FieldDraft[];
  drafts: FieldDraft[];
  pageSizes: ReadonlyArray<{ width: number; height: number }>;
}) {
  const { state, dispatch } = useEditor();
  // The first one picked is the anchor the others line up with.
  const ordered = state.selection.map((id) => selected.find((d) => d.id === id)).filter((d): d is FieldDraft => !!d);
  const samePage = new Set(ordered.map((d) => d.page)).size === 1;
  return (
    <div className="props-form" data-testid="multi-props">
      <p className="props-kind">
        Lines up with “{ordered[0]?.name}”, the first one you picked.
      </p>
      <div className="align-grid" role="group" aria-label="Align">
        {ALIGNMENTS.map(({ how, label }) => (
          <button
            key={how}
            type="button"
            className="btn small"
            disabled={!samePage}
            onClick={() => {
              const boxes = align(ordered.map((d) => d.box), how);
              dispatch({ type: 'update-drafts', patches: ordered.map((d, i) => ({ id: d.id, patch: { box: boxes[i] } })) });
            }}
            data-testid={`align-${how}`}
          >
            {label}
          </button>
        ))}
      </div>
      {!samePage && <p className="props-hint">Fields on different pages can't be aligned.</p>}
      <div className="props-actions">
        <button
          type="button"
          className="btn small"
          onClick={() => {
            const copies: FieldDraft[] = [];
            for (const d of ordered) copies.push(duplicateDraft(d, [...drafts, ...copies], pageSizes[d.page]));
            dispatch({ type: 'add-drafts', drafts: copies });
          }}
        >
          Duplicate all
        </button>
        <button type="button" className="btn small danger-outline" onClick={() => dispatch({ type: 'remove-drafts', ids: ordered.map((d) => d.id) })} data-testid="multi-delete">
          Delete all
        </button>
      </div>
    </div>
  );
}

const DETECTOR_LABEL: Record<Suggestion['detector'], string> = {
  flattened: 'rebuilt from fields this PDF used to have',
  rules: 'found from the lines and boxes on the page',
  model: 'found by the detection model',
};

// Results of auto-detect: how many, a confidence filter, accept or reject all.
function DetectSummary() {
  const { state, dispatch } = useEditor();
  const shown = visibleSuggestions(state);
  const hidden = state.suggestions.length - shown.length;
  return (
    <div className="detect-summary" data-testid="detect-summary">
      <p className="detect-count">
        <strong data-testid="suggestion-count">{shown.length}</strong> suggested field{shown.length === 1 ? '' : 's'}
        {hidden > 0 && <span className="props-hint"> ({hidden} hidden by the filter)</span>}
      </p>
      <label className="field props-row">
        <span>Only show suggestions at least {Math.round(state.minConfidence * 100)}% sure</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(state.minConfidence * 100)}
          onChange={(e) => dispatch({ type: 'set-min-confidence', value: Number(e.target.value) / 100 })}
          data-testid="confidence-slider"
        />
      </label>
      <div className="props-actions">
        <button
          type="button"
          className="btn small primary"
          disabled={!shown.length}
          onClick={() => dispatch({ type: 'accept-suggestions', ids: shown.map((d) => d.id) })}
          data-testid="accept-all"
        >
          Accept {shown.length === state.suggestions.length ? 'all' : `${shown.length} shown`}
        </button>
        <button
          type="button"
          className="btn small danger-outline"
          onClick={() => dispatch({ type: 'reject-suggestions', ids: state.suggestions.map((d) => d.id) })}
          data-testid="reject-all"
        >
          Reject all
        </button>
      </div>
      <p className="props-hint">Tap a dashed box to check it, change its type or name, or move it first. Suggestions you don't accept aren't saved.</p>
    </div>
  );
}

function SuggestionProps({ selected }: { selected: Suggestion[] }) {
  const { dispatch } = useEditor();
  const one = selected.length === 1 ? selected[0] : null;
  const ids = selected.map((d) => d.id);
  const set = (patch: DraftPatch) => dispatch({ type: 'update-drafts', patches: ids.map((id) => ({ id, patch })) });
  return (
    <div className="props-form" data-testid="suggestion-props">
      {one ? (
        <>
          <p className="props-kind">
            Suggested · {Math.round(one.confidence * 100)}% sure · {DETECTOR_LABEL[one.detector]}
          </p>
          <label className="field props-row">
            <span>Type</span>
            <select
              value={one.kind}
              onChange={(e) => {
                const kind = e.target.value as Suggestion['kind'];
                set({ kind, ...(kind === 'checkbox' ? { exportValue: 'Yes' } : {}), ...(kind === 'date' ? { tooltip: 'Date (MM/DD/YYYY)' } : {}) });
              }}
              data-testid="suggestion-kind"
            >
              <option value="text">Text box</option>
              <option value="date">Date</option>
              <option value="checkbox">Checkbox</option>
              <option value="signature">Signature</option>
            </select>
          </label>
          <label className="field props-row">
            <span>Name</span>
            <input type="text" value={one.name} onChange={(e) => set({ name: e.target.value })} data-testid="suggestion-name" />
          </label>
        </>
      ) : (
        <p className="props-kind">{selected.length} suggestions selected</p>
      )}
      <div className="props-actions">
        <button type="button" className="btn small primary" onClick={() => dispatch({ type: 'accept-suggestions', ids })} data-testid="accept-suggestion">
          Accept
        </button>
        <button type="button" className="btn small danger-outline" onClick={() => dispatch({ type: 'reject-suggestions', ids })} data-testid="reject-suggestion">
          Reject
        </button>
      </div>
    </div>
  );
}

function TabOrder({ drafts, onGoToPage }: { drafts: FieldDraft[]; onGoToPage(index: number): void }) {
  const { state, dispatch } = useEditor();
  const move = (index: number, delta: number) => {
    const ids = drafts.map((d) => d.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    dispatch({ type: 'reorder-drafts', ids });
  };
  if (!drafts.length) return <p className="props-hint">This PDF has no fields yet.</p>;
  return (
    <div className="tab-order" data-testid="tab-order">
      <div className="tab-order-head">
        <strong>Tab order</strong>
        <span className="props-hint">{state.customOrder ? 'Custom order' : 'Page order (automatic)'}</span>
      </div>
      <ol>
        {drafts.map((d, i) => (
          <li key={d.id} data-testid="tab-order-item">
            <button type="button" className="tab-order-name" onClick={() => {
              onGoToPage(d.page);
              dispatch({ type: 'select-drafts', ids: [d.id] });
            }}>
              <span className="tab-order-page">p{d.page + 1}</span> {d.kind === 'radio' ? `${d.name}: ${d.exportValue}` : d.name}
            </button>
            <button type="button" className="icon-btn small" aria-label={`Move ${d.name} earlier`} onClick={() => move(i, -1)} disabled={i === 0}>
              ↑
            </button>
            <button type="button" className="icon-btn small" aria-label={`Move ${d.name} later`} onClick={() => move(i, 1)} disabled={i === drafts.length - 1}>
              ↓
            </button>
          </li>
        ))}
      </ol>
      {state.customOrder && (
        <button type="button" className="btn small" onClick={() => dispatch({ type: 'reset-order' })} data-testid="reset-order">
          Reset to page order
        </button>
      )}
    </div>
  );
}

function Row({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="field props-row">
      <span>{label}</span>
      {children}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

function Check({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange(v: boolean): void; testId: string }) {
  return (
    <label className="props-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span>{label}</span>
    </label>
  );
}

function kindLabel(d: FieldDraft): string {
  return { text: 'Text field', date: 'Date field', checkbox: 'Checkbox', radio: 'Radio button', dropdown: 'Dropdown', signature: 'Signature field', list: 'List box', button: 'Button' }[d.kind];
}

const NARROW_QUERY = '(max-width: 720px)';
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}
