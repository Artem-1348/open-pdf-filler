import { createContext, useContext, type Dispatch } from 'react';
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

export function groupFieldsByPage(fields: ReadonlyArray<FormFieldInfo>): Map<number, FieldOnPage[]> {
  const map = new Map<number, FieldOnPage[]>();
  for (const field of fields) {
    if (field.kind === 'button') continue;
    field.widgets.forEach((w, widgetIndex) => {
      const list = map.get(w.page);
      if (list) list.push({ field, widgetIndex });
      else map.set(w.page, [{ field, widgetIndex }]);
    });
  }
  return map;
}
