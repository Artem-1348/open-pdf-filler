// The bar at the bottom of the screen: what the picked tool does (with Done),
// detection progress, or actions for what's selected. It stays off the page,
// so its buttons never cover the next checkbox.
import { useRef, type PointerEvent, type ReactNode } from 'react';
import { DateIcon, TrashIcon } from '../components/icons';
import { useEditor } from './EditorContext';
import { useKeyboardInset } from './useKeyboardInset';
import { dateTextToIso, isoToDateText, todayText, visibleSuggestions, type EditorState, type Suggestion } from './state';
import type { DetectProgress } from './FillBar';

const MIN_FONT = 6;
const MAX_FONT = 72;

// Keeps the keyboard up while typing in a text box (A−/A+ don't steal focus).
const keepFocus = (e: PointerEvent) => e.preventDefault();

export function ActionBar({ detecting, onStopDetect }: { detecting: DetectProgress | null; onStopDetect(): void }) {
  const { state, dispatch } = useEditor();
  const inset = useKeyboardInset();
  const edit = state.mode === 'edit';

  let content: ReactNode = null;
  let testId = 'tool-hint';
  if (detecting) {
    testId = 'detect-progress';
    content = (
      <>
        {detecting.downloadMB !== undefined
          ? `Getting the AI model… ${detecting.downloadMB} MB`
          : `${detecting.ai ? 'AI scan' : 'Looking for fields'}… page ${Math.min(detecting.done + 1, detecting.total)} of ${detecting.total}`}
        {detecting.ai && (
          <button type="button" className="hint-action" onClick={onStopDetect} data-testid="detect-stop">
            Stop
          </button>
        )}
      </>
    );
  } else if (state.tool || state.buildTool) {
    content = (
      <>
        <span>{toolHint(state)}</span>
        <button
          type="button"
          className="hint-action primary"
          onClick={() => dispatch(state.buildTool ? { type: 'set-build-tool', tool: null } : { type: 'set-tool', tool: null })}
          data-testid="tool-done"
        >
          Done
        </button>
      </>
    );
  } else if (edit && state.selection.length) {
    const suggestions = state.suggestions.filter((d) => state.selection.includes(d.id));
    if (suggestions.length === state.selection.length) {
      testId = 'selection-bar';
      content = <SuggestionActions selected={suggestions} />;
    } else if (state.lasso) {
      testId = 'selection-bar';
      content = (
        <>
          <span>{count(state.selection.length, 'field')}</span>
          <button type="button" className="hint-action danger" onClick={() => dispatch({ type: 'remove-drafts', ids: state.selection })} data-testid="selection-delete">
            <TrashIcon /> Delete
          </button>
          <LassoDone />
        </>
      );
    }
  } else if (!edit && state.selectedItems.length) {
    testId = 'selection-bar';
    content = (
      <>
        <span>{count(state.selectedItems.length, 'item')}</span>
        <button type="button" className="hint-action danger" onClick={() => dispatch({ type: 'remove-items', ids: state.selectedItems })} data-testid="selection-delete">
          <TrashIcon /> Delete
        </button>
        {state.lasso && <LassoDone />}
      </>
    );
  } else if (!edit && state.selectedId && state.canEdit) {
    testId = 'selection-bar';
    content = <ItemActions id={state.selectedId} />;
  }
  if (!content && state.lasso) {
    content = (
      <>
        <span>Draw a loop around {edit ? 'fields' : 'items'} to select them</span>
        <LassoDone />
      </>
    );
  }
  if (!content) return null;

  return (
    <div
      className={`tool-hint floating action-bar${edit ? ' above-sheet' : ''}${testId === 'selection-bar' ? ' selection' : ''}`}
      style={inset ? { bottom: inset + 12 } : undefined}
      role="status"
      data-testid={testId}
    >
      {content}
    </div>
  );
}

function toolHint(state: EditorState): string {
  if (state.buildTool === 'radio') return 'Tap each choice. Only one can be picked';
  if (state.buildTool) return 'Tap the page to add fields';
  if (state.tool?.kind === 'text') return 'Tap to add text boxes, then Done to type';
  return 'Tap the page to place it';
}

const count = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;

function LassoDone() {
  const { dispatch } = useEditor();
  return (
    <button type="button" className="hint-action primary" onClick={() => dispatch({ type: 'set-lasso', on: false })} data-testid="lasso-done">
      Done
    </button>
  );
}

// Font size, calendar and delete for the one selected placed item.
function ItemActions({ id }: { id: string }) {
  const { state, dispatch } = useEditor();
  const item = state.items.find((i) => i.id === id);
  if (!item) return null;
  const isText = item.kind === 'text' || item.kind === 'date';
  const typedSignature = item.kind === 'signature' && item.signature?.type === 'typed';
  const fontSize = item.fontSize ?? (typedSignature ? item.box.height * 0.6 : 12);
  const setSize = (size: number) =>
    dispatch({ type: 'update-item', id, patch: { fontSize: Math.min(MAX_FONT, Math.max(MIN_FONT, size)) } });
  return (
    <>
      {(isText || typedSignature) && (
        <>
          <button type="button" className="hint-action" aria-label="Smaller text" onPointerDown={keepFocus} onClick={() => setSize(Math.round(fontSize) - 2)} data-testid="item-smaller">
            A−
          </button>
          <button type="button" className="hint-action" aria-label="Larger text" onPointerDown={keepFocus} onClick={() => setSize(Math.round(fontSize) + 2)} data-testid="item-larger">
            A+
          </button>
        </>
      )}
      {item.kind === 'date' && <DatePicker text={item.text ?? ''} onPick={(text) => dispatch({ type: 'update-item', id, patch: { text } })} />}
      <button type="button" className="hint-action danger" aria-label="Delete" onClick={() => dispatch({ type: 'remove-item', id })} data-testid="item-delete">
        <TrashIcon /> Delete
      </button>
    </>
  );
}

// A calendar for people who'd rather not type the date. The system picker
// opens from an invisible date input laid over the button.
function DatePicker({ text, onPick }: { text: string; onPick(text: string): void }) {
  const input = useRef<HTMLInputElement>(null);
  const iso = dateTextToIso(text) || dateTextToIso(todayText());
  return (
    <span className="date-pick">
      <button type="button" className="hint-action" tabIndex={-1} aria-hidden="true">
        <DateIcon /> Calendar
      </button>
      <input
        ref={input}
        type="date"
        className="date-pick-input"
        aria-label="Pick a date from a calendar"
        value={iso}
        onClick={(e) => {
          // Desktop browsers only open the calendar from its own icon.
          try {
            e.currentTarget.showPicker();
          } catch {
            // Already open, or not supported: the input still works.
          }
        }}
        onChange={(e) => {
          const picked = isoToDateText(e.currentTarget.value);
          if (picked) onPick(picked);
        }}
        data-testid="item-date-input"
      />
    </span>
  );
}

// Keep or remove suggestions; with one, move on to the next so a form can
// be checked box by box.
function SuggestionActions({ selected }: { selected: Suggestion[] }) {
  const { state, dispatch } = useEditor();
  const one = selected.length === 1 ? selected[0] : null;
  const next = () => {
    if (!one) return [];
    const list = visibleSuggestions(state)
      .filter((d) => d.id !== one.id)
      .sort((a, b) => a.page - b.page || a.box.y - b.box.y || a.box.x - b.box.x);
    const after = list.find(
      (d) => d.page === one.page && (d.box.y > one.box.y + 2 || (Math.abs(d.box.y - one.box.y) <= 2 && d.box.x > one.box.x)),
    );
    return after ? [after.id] : [];
  };
  const act = (type: 'accept-suggestions' | 'reject-suggestions') => {
    const following = next();
    dispatch({ type, ids: selected.map((d) => d.id) });
    dispatch({ type: 'select-drafts', ids: following });
  };
  return (
    <>
      <span>{one ? `Suggestion · ${Math.round(one.confidence * 100)}% sure` : count(selected.length, 'suggestion')}</span>
      <button type="button" className="hint-action primary" aria-label={one ? 'Keep this field' : 'Keep these fields'} onClick={() => act('accept-suggestions')} data-testid="keep-suggestion">
        ✓ Keep
      </button>
      <button type="button" className="hint-action danger" aria-label={one ? 'Remove this suggestion' : 'Remove these suggestions'} onClick={() => act('reject-suggestions')} data-testid="remove-suggestion">
        ✕ Remove
      </button>
      {state.lasso && <LassoDone />}
    </>
  );
}
