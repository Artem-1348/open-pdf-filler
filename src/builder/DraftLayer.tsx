// Edit form mode: every field on the page as a box that can be selected,
// dragged, resized and placed. Pointer events cover mouse, pen and touch.
import { memo, useRef, type PointerEvent } from 'react';
import { useEditor } from '../editor/EditorContext';
import { visibleSuggestions, type Suggestion } from '../editor/state';
import { clampToPage, newDraft, type FieldDraft } from './model';

interface Props {
  page: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
}

const DRAG_THRESHOLD_PX = 4;
const LONG_PRESS_MS = 450;
const MIN_SIZE = 6;

const KIND_LABEL: Record<FieldDraft['kind'], string> = {
  text: 'Text',
  date: 'Date',
  checkbox: 'Checkbox',
  radio: 'Radio',
  dropdown: 'Dropdown',
  signature: 'Signature',
  list: 'List',
  button: 'Button',
};

export const DraftLayer = memo(function DraftLayer({ page, scale, pageWidth, pageHeight }: Props) {
  const { state, dispatch } = useEditor();
  const drafts = (state.drafts ?? []).filter((d) => d.page === page);
  const suggestions = visibleSuggestions(state).filter((d) => d.page === page);
  const pageSize = { width: pageWidth, height: pageHeight };

  // Tap on the page: place the picked field type, or clear the selection.
  const onSurfaceDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    if (!state.buildTool) {
      if (state.selection.length) dispatch({ type: 'select-drafts', ids: [] });
      return;
    }
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const at = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    dispatch({ type: 'add-drafts', drafts: [newDraft(state.buildTool, page, at, state.drafts ?? [], pageSize)] });
  };

  return (
    <div
      className={state.buildTool ? 'draft-layer placing' : 'draft-layer'}
      onPointerDown={onSurfaceDown}
      data-testid="draft-layer"
      aria-label={state.buildTool ? `Tap to add a ${KIND_LABEL[state.buildTool].toLowerCase()} field` : undefined}
    >
      {drafts.map((d) => (
        <DraftBox key={d.id} draft={d} scale={scale} pageSize={pageSize} />
      ))}
      {suggestions.map((d) => (
        <DraftBox key={d.id} draft={d} suggestion={d} scale={scale} pageSize={pageSize} />
      ))}
    </div>
  );
});

function DraftBox({
  draft,
  suggestion,
  scale,
  pageSize,
}: {
  draft: FieldDraft;
  suggestion?: Suggestion;
  scale: number;
  pageSize: { width: number; height: number };
}) {
  const { state, dispatch } = useEditor();
  const selected = state.selection.includes(draft.id);
  const gesture = useRef<{
    x: number;
    y: number;
    id: number;
    moved: boolean;
    boxes: Map<string, FieldDraft['box']>;
    timer: number | null;
    multi: boolean;
  } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let selection = state.selection;
    if (additive) {
      selection = selected ? selection.filter((id) => id !== draft.id) : [...selection, draft.id];
      dispatch({ type: 'select-drafts', ids: selection });
    } else if (!selected) {
      selection = [draft.id];
      dispatch({ type: 'select-drafts', ids: selection });
    }
    const all = [...(state.drafts ?? []), ...state.suggestions];
    const boxes = new Map(all.filter((d) => selection.includes(d.id)).map((d) => [d.id, d.box]));
    const g = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, boxes, timer: null as number | null, multi: false };
    // Long-press (touch) adds this box to the selection, like Shift-click.
    if (e.pointerType !== 'mouse' && !additive) {
      g.timer = window.setTimeout(() => {
        g.multi = true;
        g.timer = null;
        if (!state.selection.includes(draft.id) || state.selection.length === 1) {
          dispatch({ type: 'select-drafts', ids: [...new Set([...state.selection, draft.id])] });
        }
        navigator.vibrate?.(15);
      }, LONG_PRESS_MS);
    }
    gesture.current = g;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || g.multi) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (g.timer !== null) {
      window.clearTimeout(g.timer);
      g.timer = null;
    }
    g.moved = true;
    dispatch({
      type: 'update-drafts',
      key: `move:${[...g.boxes.keys()].join(',')}:${g.x},${g.y}`,
      patches: [...g.boxes].map(([id, box]) => ({
        id,
        patch: { box: clampToPage({ ...box, x: box.x + dx / scale, y: box.y + dy / scale }, pageSize) },
      })),
    });
  };

  const end = () => {
    const g = gesture.current;
    if (g?.timer) window.clearTimeout(g.timer);
    gesture.current = null;
  };

  const label = draft.kind === 'radio' ? `${draft.name}: ${draft.exportValue}` : draft.name;
  const clash = !suggestion && !!state.drafts && isClashing(draft, state.drafts);

  return (
    <div
      className={`draft draft-${draft.kind}${selected ? ' selected' : ''}${clash ? ' clash' : ''}${suggestion ? ' suggested' : ''}`}
      style={{
        left: draft.box.x * scale,
        top: draft.box.y * scale,
        width: draft.box.width * scale,
        height: draft.box.height * scale,
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${suggestion ? 'Suggested ' : ''}${KIND_LABEL[draft.kind]} field ${label}`}
      title={label}
      data-testid={suggestion ? 'suggestion' : 'draft'}
      data-draft={draft.name}
      data-kind={draft.kind}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onFocus={() => {
        if (!selected) dispatch({ type: 'select-drafts', ids: [draft.id] });
      }}
    >
      <span className="draft-label">{draft.kind === 'checkbox' || draft.kind === 'radio' ? '' : label}</span>
      {suggestion && (
        <span className="confidence" aria-hidden="true">
          {Math.round(suggestion.confidence * 100)}
        </span>
      )}
      {selected && state.selection.length === 1 && <ResizeHandle draft={draft} scale={scale} pageSize={pageSize} />}
    </div>
  );
}

function ResizeHandle({ draft, scale, pageSize }: { draft: FieldDraft; scale: number; pageSize: { width: number; height: number } }) {
  const { dispatch } = useEditor();
  const start = useRef<{ x: number; y: number; box: FieldDraft['box']; id: number } | null>(null);
  // Checkboxes and radios stay square.
  const square = draft.kind === 'checkbox' || draft.kind === 'radio';
  return (
    <div
      className="resize-handle"
      aria-hidden="true"
      data-testid="draft-resize"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, box: draft.box, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        let width = Math.max(MIN_SIZE, s.box.width + (e.clientX - s.x) / scale);
        let height = Math.max(MIN_SIZE, s.box.height + (e.clientY - s.y) / scale);
        if (square) width = height = Math.max(width, height);
        width = Math.min(width, pageSize.width - s.box.x);
        height = Math.min(height, pageSize.height - s.box.y);
        dispatch({ type: 'update-drafts', key: `resize:${draft.id}:${s.x},${s.y}`, patches: [{ id: draft.id, patch: { box: { ...s.box, width, height } } }] });
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
    />
  );
}

function isClashing(draft: FieldDraft, drafts: ReadonlyArray<FieldDraft>): boolean {
  const same = drafts.filter((d) => d.name === draft.name);
  if (same.length < 2) return false;
  if (same.some((d) => d.kind !== draft.kind)) return true;
  if (draft.kind === 'radio') return same.filter((d) => d.exportValue === draft.exportValue).length > 1;
  return false;
}
