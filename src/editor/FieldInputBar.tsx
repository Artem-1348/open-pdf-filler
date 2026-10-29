// Phones: typing into a tiny box on the page makes Safari zoom and the page
// jump. Text fields open this bar instead, docked above the keyboard, with a
// full-size input and Prev / Next / Done (like the keyboard's own form bar).
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatToIso, isoToFormat } from '../builder/dates';
import { useKeyboardInset } from './useKeyboardInset';
import type { FormFieldInfo } from '../pdf/model';
import { useEditor, type FieldRef } from './EditorContext';

interface Props {
  // Brings a field into view above the bar.
  reveal(page: number, box: FormFieldInfo['widgets'][number]['box']): void;
  // The label printed next to a field on the page, for fields whose PDF gives
  // them no readable name (e.g. "f1_01").
  pageLabel(page: number, box: FormFieldInfo['widgets'][number]['box']): Promise<string | undefined>;
}

const isTyped = (f: FormFieldInfo) => f.kind === 'text' || (f.kind === 'combo' && f.editableCombo);

export function FieldInputBar({ reveal, pageLabel }: Props) {
  const { state, dispatch, fieldsByPage, activeField, openFieldInput } = useEditor();
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const bottom = useKeyboardInset();

  // Every typed field in tab order (pages in order, then each page's order).
  const order = useMemo(() => {
    const list: Array<FieldRef & { field: FormFieldInfo }> = [];
    for (const page of [...fieldsByPage.keys()].sort((a, b) => a - b)) {
      for (const e of fieldsByPage.get(page) ?? []) {
        if (isTyped(e.field) && !e.field.readOnly) list.push({ name: e.field.name, widgetIndex: e.widgetIndex, field: e.field });
      }
    }
    return list;
  }, [fieldsByPage]);

  const index = activeField ? order.findIndex((o) => o.name === activeField.name && o.widgetIndex === activeField.widgetIndex) : -1;
  const current = index >= 0 ? order[index] : null;

  const [printed, setPrinted] = useState<{ key: string; label?: string } | null>(null);
  const key = current ? `${current.name}#${current.widgetIndex}` : '';

  useEffect(() => {
    if (!current) return;
    const w = current.field.widgets[current.widgetIndex];
    reveal(w.page, w.box);
    inputRef.current?.focus({ preventScroll: true });
    // Only fields without their own tooltip need the printed label.
    if (current.field.tooltip?.trim()) return;
    let cancelled = false;
    void pageLabel(w.page, w.box).then((label) => {
      if (!cancelled) setPrinted({ key: `${current.name}#${current.widgetIndex}`, label });
    });
    return () => {
      cancelled = true;
    };
  }, [current, reveal, pageLabel]);

  if (!current || !state.canEdit) return null;
  const { field } = current;
  const value = state.values.get(field.name) ?? field.initial;
  const text = value.kind === 'text' ? value.text : value.kind === 'choice' ? (value.selected[0] ?? '') : '';
  const set = (t: string) =>
    dispatch({
      type: 'set-value',
      name: field.name,
      value: field.kind === 'combo' ? { kind: 'choice', selected: t ? [t] : [] } : { kind: 'text', text: t },
    });
  const go = (delta: number) => {
    const next = order[index + delta];
    if (next) openFieldInput({ name: next.name, widgetIndex: next.widgetIndex });
  };
  // Keep the keyboard up when tapping the bar's buttons.
  const keepFocus = (e: React.PointerEvent) => e.preventDefault();

  const format = field.dateFormat ?? 'MM/DD/YYYY';
  const iso = field.isDate ? formatToIso(text, format) : '';

  return (
    <div className="field-input-bar" style={{ bottom }} role="group" aria-label={`Fill in: ${field.label}`} data-testid="field-input-bar">
      <div className="field-input-head">
        <span className="field-input-label" data-testid="field-input-label">
          {(printed?.key === key && printed.label) || field.label}
          {field.required && <span aria-label="required"> *</span>}
        </span>
        <span className="field-input-count">
          {index + 1} of {order.length}
        </span>
      </div>
      <div className="field-input-row">
        <button type="button" className="icon-btn" aria-label="Previous field" disabled={index === 0} onPointerDown={keepFocus} onClick={() => go(-1)} data-testid="field-prev">
          ‹
        </button>
        {field.isDate && (iso || !text) ? (
          <input
            ref={inputRef}
            type="date"
            className="field-input"
            value={iso}
            onChange={(e) => set(isoToFormat(e.target.value, format))}
            data-testid="field-input"
          />
        ) : field.multiline ? (
          <textarea ref={inputRef} className="field-input" rows={3} value={text} maxLength={field.maxLen} onChange={(e) => set(e.target.value)} data-testid="field-input" />
        ) : (
          <input
            ref={inputRef}
            type="text"
            className="field-input"
            value={text}
            maxLength={field.maxLen}
            enterKeyHint={index < order.length - 1 ? 'next' : 'done'}
            onChange={(e) => set(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (index < order.length - 1) go(1);
                else openFieldInput(null);
              }
            }}
            list={field.kind === 'combo' ? `bar-opts-${index}` : undefined}
            data-testid="field-input"
          />
        )}
        {field.kind === 'combo' && (
          <datalist id={`bar-opts-${index}`}>
            {field.options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        )}
        <button type="button" className="icon-btn" aria-label="Next field" disabled={index === order.length - 1} onPointerDown={keepFocus} onClick={() => go(1)} data-testid="field-next">
          ›
        </button>
        <button type="button" className="btn primary small" onClick={() => openFieldInput(null)} data-testid="field-done">
          Done
        </button>
      </div>
    </div>
  );
}
