// The Phase 3 gate form, shared by the writer and cross-viewer tests:
// 20 fields of every kind on a Letter page, laid out in rows.
import { newDraft, type CreatableKind, type FieldDraft } from '../../src/builder/model';
import type { FieldValue } from '../../src/pdf/model';

const LETTER = { width: 612, height: 792 };

export function gateForm(): FieldDraft[] {
  const drafts: FieldDraft[] = [];
  const add = (kind: CreatableKind, x: number, y: number, patch: Partial<FieldDraft> = {}) => {
    const d = { ...newDraft(kind, 0, { x, y }, drafts, LETTER), ...patch };
    drafts.push(d);
    return d;
  };
  // 10 text fields: two columns of five rows.
  for (let row = 0; row < 5; row++) {
    add('text', 160, 140 + row * 40, { name: `First ${row + 1}` });
    add('text', 420, 140 + row * 40, { name: `Second ${row + 1}`, ...(row === 0 ? { required: true } : {}) });
  }
  drafts.find((d) => d.name === 'Second 2')!.maxLen = 5;
  Object.assign(drafts.find((d) => d.name === 'Second 3')!, { multiline: true, box: { x: 340, y: 210, width: 160, height: 40 } });
  add('date', 160, 360, { name: 'Start date' });
  add('date', 420, 360, { name: 'End date', dateFormat: 'DD/MM/YYYY', tooltip: 'Date (DD/MM/YYYY)' });
  add('checkbox', 100, 400, { name: 'Agree terms', exportValue: 'Agree' });
  add('checkbox', 200, 400, { name: 'Newsletter' });
  add('checkbox', 300, 400, { name: 'Member' });
  // Radio group "Plan" with 3 options, "Contact" with 2.
  for (const [i, v] of ['Basic', 'Plus', 'Pro'].entries()) add('radio', 100 + i * 80, 440, { name: 'Plan', exportValue: v });
  for (const [i, v] of ['Email', 'Phone'].entries()) add('radio', 100 + i * 80, 480, { name: 'Contact', exportValue: v });
  add('dropdown', 160, 520, { name: 'Country', options: ['Canada', 'Germany', 'Japan'] });
  add('dropdown', 420, 520, { name: 'Size', options: ['S', 'M', 'L'], editable: true });
  add('signature', 200, 600, { name: 'Signature', tooltip: 'Sign here' });
  return drafts;
}

export const GATE_VALUES: Record<string, FieldValue> = {
  'First 1': { kind: 'text', text: 'Ada' },
  'Second 2': { kind: 'text', text: '12345' },
  'Second 3': { kind: 'text', text: 'Line one\nLine two' },
  'Start date': { kind: 'text', text: '10/21/2026' },
  'Agree terms': { kind: 'toggle', on: 0 },
  Plan: { kind: 'toggle', on: 1 },
  Contact: { kind: 'toggle', on: 0 },
  Country: { kind: 'choice', selected: ['Japan'] },
  Size: { kind: 'choice', selected: ['XL'] },
};

