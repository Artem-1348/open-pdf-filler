import { describe, expect, it } from 'vitest';
import { cleanLabel, findLabel, kindFromLabel, uniqueNames } from './labels';
import type { DetectedField } from './types';

const run = (text: string, x: number, y: number, width: number, height = 9) => ({ text, box: { x, y, width, height } });

describe('cleanLabel', () => {
  it('drops control characters, numbering, colons and fill-in lines', () => {
    expect(cleanLabel('Marital Status: (')).toBe('Marital Status');
    expect(cleanLabel('Married \u0018')).toBe('Married');
    expect(cleanLabel('1. Name of entity/individual:')).toBe('Name of entity/individual');
    expect(cleanLabel('Phone ________')).toBe('Phone');
  });
});

describe('findLabel', () => {
  const field = { x: 200, y: 100, width: 150, height: 14 };

  it('uses the text to the left of a text field', () => {
    expect(findLabel(field, 'text', [run('Far away', 10, 102, 40), run('Full name:', 140, 102, 50)])).toBe('Full name');
  });

  it('falls back to the text just above', () => {
    expect(findLabel(field, 'text', [run('Address', 205, 88, 40)])).toBe('Address');
  });

  it('prefers the text to the right of a checkbox', () => {
    const box = { x: 100, y: 200, width: 10, height: 10 };
    expect(findLabel(box, 'checkbox', [run('Status', 40, 200, 50), run('Single', 114, 200, 30)])).toBe('Single');
  });

  it('ignores text inside the field and text too far away', () => {
    expect(findLabel(field, 'text', [run('prefilled', 210, 102, 40), run('Too far', 0, 102, 30)])).toBeUndefined();
  });
});

describe('kinds and names', () => {
  it('turns signature and date labels into those kinds', () => {
    expect(kindFromLabel('text', 'Signature of applicant')).toBe('signature');
    expect(kindFromLabel('text', 'Date of birth')).toBe('date');
    expect(kindFromLabel('checkbox', 'Date')).toBe('checkbox');
    expect(kindFromLabel('text', 'Updated address')).toBe('text');
  });

  it('makes names unique, using kinds when there is no label', () => {
    const f = (label?: string): DetectedField => ({ page: 0, box: { x: 0, y: 0, width: 1, height: 1 }, kind: 'text', confidence: 1, detector: 'rules', label });
    expect(uniqueNames([f('Name'), f('Name'), f(), f()], ['Text 1'])).toEqual(['Name', 'Name 2', 'Text 2', 'Text 3']);
  });
});
