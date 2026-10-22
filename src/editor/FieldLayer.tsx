// Editable HTML controls laid over a page's form fields. The page image is
// rendered without PDFium's own field drawing, so these replace it.
import { memo, type CSSProperties } from 'react';
import { formatToIso, isoToFormat } from '../builder/dates';
import { autoFieldFontSize } from '../pdf/layout';
import type { FieldValue, FormFieldInfo } from '../pdf/model';
import { initialBox, newItemId } from './state';
import { useEditor, type FieldOnPage } from './EditorContext';

interface Props {
  page: number;
  scale: number;
}

export const FieldLayer = memo(function FieldLayer({ page, scale }: Props) {
  const { fieldsByPage } = useEditor();
  const fields = fieldsByPage.get(page);
  if (!fields?.length) return null;
  return (
    <div className="field-layer">
      {fields.map((f) => (
        <FieldControl key={`${f.field.name}#${f.widgetIndex}`} entry={f} scale={scale} />
      ))}
    </div>
  );
});

function FieldControl({ entry, scale }: { entry: FieldOnPage; scale: number }) {
  const { state, dispatch, requestSignature } = useEditor();
  const { field, widgetIndex } = entry;
  const widget = field.widgets[widgetIndex];
  const value = state.values.get(field.name) ?? field.initial;
  const disabled = field.readOnly || !state.canEdit;
  const set = (v: FieldValue) => dispatch({ type: 'set-value', name: field.name, value: v });

  const { box } = widget;
  const style: CSSProperties = {
    left: box.x * scale,
    top: box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
  const fontPx = fieldFontSize(field, box.height) * scale;
  const common = {
    className: 'field-control',
    'data-field': field.name,
    'data-testid': 'field',
    'aria-label': field.label,
    title: field.label,
    disabled,
    'aria-required': field.required || undefined,
  };

  switch (field.kind) {
    case 'text': {
      const text = value.kind === 'text' ? value.text : '';
      const onChange = (t: string) => set({ kind: 'text', text: t });
      // Date fields made by the form builder get the system date picker;
      // text that isn't a date in the field's format stays editable as text.
      if (field.isDate) {
        const format = field.dateFormat ?? 'MM/DD/YYYY';
        const iso = formatToIso(text, format);
        if (iso || !text) {
          return (
            <input
              {...common}
              type="date"
              className="field-control date"
              style={{ ...style, fontSize: fontPx }}
              value={iso}
              onChange={(e) => onChange(isoToFormat(e.target.value, format))}
            />
          );
        }
      }
      return field.multiline ? (
        <textarea
          {...common}
          style={{ ...style, fontSize: fontPx }}
          value={text}
          maxLength={field.maxLen}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          {...common}
          type="text"
          style={{ ...style, fontSize: fontPx }}
          value={text}
          maxLength={field.maxLen}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    case 'checkbox':
    case 'radio': {
      const on = value.kind === 'toggle' && value.on === widgetIndex;
      const toggle = () => {
        if (field.kind === 'radio') set({ kind: 'toggle', on: widgetIndex });
        else set({ kind: 'toggle', on: on ? -1 : widgetIndex });
      };
      return (
        <button
          {...common}
          type="button"
          // Safari skips buttons on Tab unless they ask to be focusable.
          tabIndex={0}
          role={field.kind}
          aria-checked={on}
          className={`field-control toggle ${field.kind}${on ? ' on' : ''}`}
          style={{ ...style, fontSize: Math.min(box.width, box.height) * scale * 0.9 }}
          onClick={toggle}
        >
          {on ? (field.kind === 'radio' ? '●' : '✓') : ''}
        </button>
      );
    }
    case 'combo': {
      const selected = value.kind === 'choice' ? (value.selected[0] ?? '') : '';
      const onChange = (v: string) => set({ kind: 'choice', selected: v ? [v] : [] });
      if (field.editableCombo) {
        const listId = `opts-${cssId(field.name)}`;
        return (
          <>
            <input
              {...common}
              type="text"
              list={listId}
              style={{ ...style, fontSize: fontPx }}
              value={selected}
              onChange={(e) => onChange(e.target.value)}
            />
            <datalist id={listId}>
              {field.options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </>
        );
      }
      return (
        <select {...common} style={{ ...style, fontSize: fontPx }} value={selected} onChange={(e) => onChange(e.target.value)}>
          <option value="" />
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    case 'list': {
      const selected = value.kind === 'choice' ? value.selected : [];
      return (
        <select
          {...common}
          multiple={field.multiSelect || undefined}
          size={Math.max(2, Math.floor(box.height / 14))}
          style={{ ...style, fontSize: Math.min(fontPx, 11 * scale) }}
          value={field.multiSelect ? selected : (selected[0] ?? '')}
          onChange={(e) =>
            set({ kind: 'choice', selected: Array.from(e.target.selectedOptions, (o) => o.value) })
          }
        >
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    case 'signature': {
      const sign = async () => {
        const signature = await requestSignature();
        if (!signature) return;
        const fitted = fitSignature(box, signature);
        dispatch({ type: 'place', item: { id: newItemId(), page: widget.page, kind: 'signature', box: fitted, signature } });
      };
      return (
        <button {...common} type="button" tabIndex={0} className="field-control sign" style={style} onClick={sign}>
          Sign here
        </button>
      );
    }
    case 'button':
      return null;
  }
}

// Field font size in points: the form's own, or the shared auto size.
function fieldFontSize(field: FormFieldInfo, boxHeight: number): number {
  if (field.fontSize > 0) return field.fontSize;
  // Same auto size the writer uses for the saved appearance (layout.ts).
  return autoFieldFontSize(field.multiline || field.kind === 'list' ? 18 : boxHeight);
}

// A signature centred in a signature field, keeping its proportions.
function fitSignature(box: FormFieldInfo['widgets'][number]['box'], signature: Parameters<typeof initialBox>[2]) {
  const natural = initialBox('signature', { x: 0, y: 0 }, signature);
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

function cssId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
