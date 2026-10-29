import { describe, expect, it } from 'vitest';
import type { FormFieldInfo } from '../pdf/model';
import type { PlacedItem } from '../pdf/model';
import { dateTextToIso, editorReducer, emptyEditor, hasUnsavedChanges, isoToDateText, todayText } from './state';

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

  it('keeps a tool on to place several in a row, then types in the first empty text box', () => {
    const text = (id: string, x: number): PlacedItem => ({ id, page: 0, kind: 'text', box: { x, y: 0, width: 80, height: 16 }, text: '', fontSize: 12 });
    let s = editorReducer(emptyEditor, { type: 'reset', fields: [], canEdit: true });
    s = editorReducer(s, { type: 'set-tool', tool: { kind: 'text' } });
    s = editorReducer(s, { type: 'place', item: text('a', 0) });
    s = editorReducer(s, { type: 'place', item: text('b', 100) });
    s = editorReducer(s, { type: 'place', item: text('c', 200) });
    expect(s.tool).toEqual({ kind: 'text' });
    expect(s.items).toHaveLength(3);
    expect(s.editingId).toBeNull();
    s = editorReducer(s, { type: 'update-item', id: 'a', patch: { text: 'filled' } });
    s = editorReducer(s, { type: 'set-tool', tool: null });
    expect(s.tool).toBeNull();
    expect(s.editingId).toBe('b');
    // Each placement is its own undo step.
    s = editorReducer(s, { type: 'undo' });
    s = editorReducer(s, { type: 'undo' });
    expect(s.items).toHaveLength(2);
  });

  it('deletes several items picked with the lasso in one undo step', () => {
    const mark = (id: string): PlacedItem => ({ id, page: 0, kind: 'check', box: { x: 0, y: 0, width: 16, height: 16 } });
    let s = editorReducer(emptyEditor, { type: 'reset', fields: [], canEdit: true });
    for (const id of ['a', 'b', 'c']) s = editorReducer(s, { type: 'place', item: mark(id) });
    s = editorReducer(s, { type: 'set-lasso', on: true });
    s = editorReducer(s, { type: 'select-items', ids: ['a', 'c'] });
    expect(s.selectedItems).toEqual(['a', 'c']);
    s = editorReducer(s, { type: 'remove-items', ids: s.selectedItems });
    expect(s.items.map((i) => i.id)).toEqual(['b']);
    expect(s.selectedItems).toEqual([]);
    s = editorReducer(s, { type: 'undo' });
    expect(s.items).toHaveLength(3);
    // One item from the lasso is a normal single selection.
    s = editorReducer(s, { type: 'select-items', ids: ['b'] });
    expect(s.selectedId).toBe('b');
  });
});

describe('placed dates and the calendar', () => {
  it('converts between the short local format and ISO', () => {
    expect(todayText(new Date(2026, 9, 29), 'en-US')).toBe('10/29/2026');
    expect(dateTextToIso('10/29/2026', 'en-US')).toBe('2026-10-29');
    expect(dateTextToIso('29.10.2026', 'de-DE')).toBe('2026-10-29');
    expect(dateTextToIso('2026-10-29', 'sv-SE')).toBe('2026-10-29');
    expect(isoToDateText('2026-03-05', 'en-US')).toBe('03/05/2026');
    expect(isoToDateText('2026-03-05', 'en-GB')).toBe('05/03/2026');
  });

  it('gives nothing for text that is not a whole date', () => {
    expect(dateTextToIso('next Tuesday', 'en-US')).toBe('');
    expect(dateTextToIso('02/30/2026', 'en-US')).toBe('');
    expect(dateTextToIso('10/29', 'en-US')).toBe('');
    expect(isoToDateText('', 'en-US')).toBe('');
  });
});
