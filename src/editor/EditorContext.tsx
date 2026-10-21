import { createContext, useContext, type Dispatch } from 'react';
import type { FieldDraft } from '../builder/model';
import type { FormFieldInfo, SignatureContent } from '../pdf/model';
import type { EditorAction, EditorState } from './state';

export interface FieldOnPage {
  field: FormFieldInfo;
  widgetIndex: number;
}

export interface EditorApi {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  // Fields grouped by the page their widgets are on.
  fieldsByPage: ReadonlyMap<number, FieldOnPage[]>;
  // Opens the signature pad; resolves with the signature, or null if cancelled.
  requestSignature(): Promise<SignatureContent | null>;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error('useEditor needs an EditorContext provider');
  return api;
}

// Controls come out in tab order (the DOM order is what Tab follows): the
// builder's draft order when there are drafts, otherwise the PDF's own order.
export function groupFieldsByPage(
  fields: ReadonlyArray<FormFieldInfo>,
  drafts?: ReadonlyArray<FieldDraft> | null,
): Map<number, FieldOnPage[]> {
  const order = new Map<string, number>();
  if (drafts) {
    const seen = new Map<string, number>();
    drafts.forEach((d, i) => {
      const n = seen.get(d.name) ?? 0;
      seen.set(d.name, n + 1);
      order.set(`${d.name}#${n}`, i);
    });
  }
  const map = new Map<number, FieldOnPage[]>();
  for (const field of fields) {
    if (field.kind === 'button') continue;
    field.widgets.forEach((w, widgetIndex) => {
      const list = map.get(w.page);
      if (list) list.push({ field, widgetIndex });
      else map.set(w.page, [{ field, widgetIndex }]);
    });
  }
  if (drafts) {
    const rank = (e: FieldOnPage) => order.get(`${e.field.name}#${e.widgetIndex}`) ?? Infinity;
    for (const list of map.values()) list.sort((a, b) => rank(a) - rank(b));
  }
  return map;
}
