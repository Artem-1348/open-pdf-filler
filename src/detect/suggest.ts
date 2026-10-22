// Turns detector findings into reviewable suggestions (drafts with a score).
import type { FieldDraft } from '../builder/model';
import { newDraftId } from '../builder/model';
import type { Suggestion } from '../editor/state';
import { uniqueNames } from './labels';
import type { DetectedField } from './types';

export function toSuggestions(found: ReadonlyArray<DetectedField>, existing: ReadonlyArray<FieldDraft>): Suggestion[] {
  const names = uniqueNames(found, existing.map((d) => d.name));
  return found.map((f, i) => ({
    id: newDraftId(),
    name: names[i],
    kind: f.kind,
    page: f.page,
    box: { ...f.box },
    tooltip: f.kind === 'date' ? 'Date (MM/DD/YYYY)' : (f.label ?? ''),
    required: false,
    readOnly: false,
    multiline: !!f.multiline,
    fontSize: 0,
    exportValue: f.kind === 'checkbox' ? 'Yes' : '',
    options: [],
    editable: false,
    multiSelect: false,
    dateFormat: 'MM/DD/YYYY',
    // The form already shows its own lines and boxes.
    border: false,
    confidence: f.confidence,
    detector: f.detector,
  }));
}
