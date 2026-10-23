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
    expect(cleanLabel('1 Name of entity')).toBe('Name of entity');
    expect(cleanLabel('3a Check the box')).toBe('Check the box');
  });
});

describe('findLabel', () => {
  const field = { x: 200, y: 100, width: 150, height: 14 };

  it('uses the text to the left of a text field', () => {
    expect(findLabel(field, 'text', [run('Far away', 10, 102, 40), run('Full name:', 140, 102, 50)])).toBe('Full name');
  });

  it('reads a label that runs over two lines above the field from its first line', () => {
    const runs = [run('1', 40, 70, 4), run('Name of entity/individual. An entry is required (for a sole', 50, 70, 300), run('entity’s name on line 2.)', 50, 80, 100)];
    expect(findLabel(field, 'text', runs)).toMatch(/^Name of entity/);
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
