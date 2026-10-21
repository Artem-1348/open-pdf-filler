import { describe, expect, it } from 'vitest';
import type { FormFieldInfo } from '../pdf/model';
import { editorReducer, emptyEditor, hasUnsavedChanges } from './state';

const pin: FormFieldInfo = {
  name: 'pin',
  label: 'PIN',
  kind: 'text',
  widgets: [{ page: 0, box: { x: 0, y: 0, width: 50, height: 20 }, exportValue: '' }],
  options: [],
  multiline: false,
  readOnly: false,
  required: false,
  editableCombo: false,
  multiSelect: false,
  fontSize: 12,
  initial: { kind: 'text', text: '' },
};

describe('editorReducer', () => {
  it('trims text typed before a field length limit arrived', () => {
    let s = editorReducer(emptyEditor, { type: 'reset', fields: [pin], canEdit: true });
    s = editorReducer(s, { type: 'set-value', name: 'pin', value: { kind: 'text', text: '123456' } });
    s = editorReducer(s, { type: 'enrich-fields', extras: new Map([['pin', { maxLen: 4 }]]) });
    expect(s.values.get('pin')).toEqual({ kind: 'text', text: '1234' });
    expect(s.fields[0].maxLen).toBe(4);
  });

  it('tracks unsaved changes until saved', () => {
    let s = editorReducer(emptyEditor, { type: 'reset', fields: [pin], canEdit: true });
    expect(hasUnsavedChanges(s)).toBe(false);
    s = editorReducer(s, { type: 'set-value', name: 'pin', value: { kind: 'text', text: '1' } });
    expect(hasUnsavedChanges(s)).toBe(true);
    s = editorReducer(s, { type: 'saved' });
    expect(hasUnsavedChanges(s)).toBe(false);
  });
});
