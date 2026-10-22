import { describe, expect, it } from 'vitest';
import { formatToIso, isoToFormat } from './dates';

describe('date fields', () => {
  it('formats picker dates in the field\'s format', () => {
    expect(isoToFormat('2026-10-21', 'MM/DD/YYYY')).toBe('10/21/2026');
    expect(isoToFormat('2026-10-21', 'DD/MM/YYYY')).toBe('21/10/2026');
    expect(isoToFormat('2026-10-21', 'YYYY-MM-DD')).toBe('2026-10-21');
    expect(isoToFormat('', 'MM/DD/YYYY')).toBe('');
  });

  it('reads typed dates back, and rejects impossible ones', () => {
    expect(formatToIso('10/21/2026', 'MM/DD/YYYY')).toBe('2026-10-21');
    expect(formatToIso('1/2/2026', 'DD/MM/YYYY')).toBe('2026-02-01');
    expect(formatToIso('2026-02-30', 'YYYY-MM-DD')).toBe('');
    expect(formatToIso('soon', 'MM/DD/YYYY')).toBe('');
  });
});
