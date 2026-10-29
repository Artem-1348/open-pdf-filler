import { describe, expect, it } from 'vitest';
import { boxesInLoop, insideLoop, loopLength } from './lasso';

// A rough circle around (100, 100), as a finger would draw it.
const circle = Array.from({ length: 24 }, (_, i) => ({
  x: 100 + 50 * Math.cos((i / 24) * 2 * Math.PI),
  y: 100 + 45 * Math.sin((i / 24) * 2 * Math.PI),
}));

const box = (x: number, y: number, size = 14) => ({ box: { x, y, width: size, height: size } });

describe('lasso', () => {
  it('tells inside from outside', () => {
    expect(insideLoop({ x: 100, y: 100 }, circle)).toBe(true);
    expect(insideLoop({ x: 160, y: 100 }, circle)).toBe(false);
    expect(insideLoop({ x: 100, y: 40 }, circle)).toBe(false);
  });

  it('picks boxes by their middle, so a neighbour just touched stays out', () => {
    const near = box(93, 93);
    const edge = box(147, 93); // middle at x 154: just outside the loop
    const far = box(300, 300);
    expect(boxesInLoop([near, edge, far], circle)).toEqual([near]);
  });

  it('works for a loop drawn the other way round and for a concave one', () => {
    expect(boxesInLoop([box(93, 93)], [...circle].reverse())).toHaveLength(1);
    // A "C" shape: the gap in the middle is outside.
    const c = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 70 },
      { x: 100, y: 70 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(insideLoop({ x: 60, y: 50 }, c)).toBe(false);
    expect(insideLoop({ x: 15, y: 50 }, c)).toBe(true);
  });

  it('ignores a tap', () => {
    expect(boxesInLoop([box(0, 0)], [{ x: 5, y: 5 }])).toEqual([]);
    expect(loopLength([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
  });
});
