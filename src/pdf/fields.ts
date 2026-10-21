// Turns PDFium's per-page widget list into the editor's form fields: one entry
// per field name, with every widget (box) that belongs to it.
import {
  PDF_FORM_FIELD_FLAG,
  PDF_FORM_FIELD_TYPE,
  type PdfWidgetAnnoObject,
} from '@embedpdf/models';
import type { FieldKind, FieldValue, FormFieldInfo } from './model';

function kindOf(type: PDF_FORM_FIELD_TYPE): FieldKind | null {
  switch (type) {
    case PDF_FORM_FIELD_TYPE.TEXTFIELD:
      return 'text';
    case PDF_FORM_FIELD_TYPE.CHECKBOX:
      return 'checkbox';
    case PDF_FORM_FIELD_TYPE.RADIOBUTTON:
      return 'radio';
    case PDF_FORM_FIELD_TYPE.COMBOBOX:
      return 'combo';
    case PDF_FORM_FIELD_TYPE.LISTBOX:
      return 'list';
    case PDF_FORM_FIELD_TYPE.SIGNATURE:
      return 'signature';
    case PDF_FORM_FIELD_TYPE.PUSHBUTTON:
      return 'button';
    default:
      return null;
  }
}

const has = (flags: number, flag: number) => (flags & flag) === flag;

export function buildFields(widgetsByPage: ReadonlyArray<ReadonlyArray<PdfWidgetAnnoObject>>): FormFieldInfo[] {
  const byName = new Map<string, FormFieldInfo>();
  // Raw field values, to work out which toggle widget is on once all are known.
  const rawValue = new Map<string, string>();

  widgetsByPage.forEach((widgets, page) => {
    for (const w of widgets) {
      const kind = kindOf(w.field.type);
      if (!kind || w.flags?.includes('hidden')) continue;
      const name = w.field.name;
      let info = byName.get(name);
      if (!info) {
        const flags = w.field.flag;
        const options = 'options' in w.field && Array.isArray(w.field.options) ? w.field.options : [];
        info = {
          name,
          label: labelFor(w.field.alternateName, name),
          tooltip: w.field.alternateName ?? '',
          kind,
          widgets: [],
          options: options.map((o) => o.label),
          multiline: has(flags, PDF_FORM_FIELD_FLAG.TEXT_MULTIPLINE),
          readOnly: has(flags, PDF_FORM_FIELD_FLAG.READONLY),
          required: has(flags, PDF_FORM_FIELD_FLAG.REQUIRED),
          editableCombo: has(flags, PDF_FORM_FIELD_FLAG.CHOICE_EDIT),
          multiSelect: has(flags, PDF_FORM_FIELD_FLAG.CHOICE_MULTL_SELECT),
          maxLen: 'maxLen' in w.field && typeof w.field.maxLen === 'number' && w.field.maxLen > 0 ? w.field.maxLen : undefined,
          fontSize: w.fontSize > 0 ? w.fontSize : 0,
          initial: { kind: 'text', text: '' },
        };
        byName.set(name, info);
        rawValue.set(name, w.field.value ?? '');
        if (kind === 'combo' || kind === 'list') {
          const selected = options.filter((o) => o.isSelected).map((o) => o.label);
          if (!selected.length && w.field.value) selected.push(w.field.value);
          info.initial = { kind: 'choice', selected };
        } else if (kind === 'text') {
          info.initial = { kind: 'text', text: w.field.value ?? '' };
        }
      }
      info.widgets.push({
        page,
        box: { x: w.rect.origin.x, y: w.rect.origin.y, width: w.rect.size.width, height: w.rect.size.height },
        exportValue: w.exportValue ?? '',
      });
    }
  });

  for (const info of byName.values()) {
    if (info.kind === 'checkbox' || info.kind === 'radio') {
      info.initial = { kind: 'toggle', on: initialToggle(info, rawValue.get(info.name) ?? '') };
    }
  }
  return [...byName.values()];
}

function labelFor(alternate: string | undefined, name: string): string {
  const tooltip = alternate?.trim();
  if (tooltip) return tooltip.length > 80 ? `${tooltip.slice(0, 77)}…` : tooltip;
  // "topmostSubform[0].Page1[0].f1_01[0]" -> "f1_01"
  const last = name.split('.').pop() ?? name;
  return last.replace(/\[\d+\]$/, '').replace(/_/g, ' ');
}

function initialToggle(info: FormFieldInfo, value: string): number {
  if (!value || value === 'Off') return -1;
  const match = info.widgets.findIndex((w) => w.exportValue === value);
  if (match >= 0) return match;
  // A lone checkbox whose on-state name differs from its export value.
  return info.widgets.length === 1 ? 0 : -1;
}

export function initialValues(fields: ReadonlyArray<FormFieldInfo>): Map<string, FieldValue> {
  return new Map(fields.map((f) => [f.name, f.initial]));
}
