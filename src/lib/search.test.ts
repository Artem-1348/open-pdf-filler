import { describe, expect, it } from 'vitest';
import { searchStatus, wrapIndex } from './search';

describe('wrapIndex', () => {
  it('wraps forwards and backwards', () => {
    expect(wrapIndex(4, 4)).toBe(0);
    expect(wrapIndex(-1, 4)).toBe(3);
    expect(wrapIndex(2, 4)).toBe(2);
  });

  it('returns -1 when there is nothing to select', () => {
    expect(wrapIndex(0, 0)).toBe(-1);
  });
});

describe('searchStatus', () => {
  it('describes the result', () => {
    expect(searchStatus(0, 4, 'needle')).toBe('1 of 4');
    expect(searchStatus(-1, 0, 'needle')).toBe('No matches');
    expect(searchStatus(-1, 0, '   ')).toBe('');
  });
});
