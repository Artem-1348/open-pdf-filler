import { describe, expect, it } from 'vitest';
import { layoutPages, pageAtOffset, totalHeight } from './layout';

const letter = { width: 612, height: 792 };
const landscape = { width: 792, height: 612 };

describe('layoutPages', () => {
  it('stacks pages with a gap above, between and below', () => {
    const boxes = layoutPages([letter, landscape, letter], 1, 10);
    expect(boxes.map((b) => b.top)).toEqual([10, 812, 1434]);
    expect(boxes[1]).toMatchObject({ width: 792, height: 612 });
    expect(totalHeight(boxes, 10)).toBe(1434 + 792 + 10);
  });

  it('scales sizes', () => {
    const [box] = layoutPages([letter], 2, 0);
    expect(box).toEqual({ top: 0, width: 1224, height: 1584 });
  });

  it('handles an empty document', () => {
    expect(totalHeight(layoutPages([], 1))).toBe(0);
  });
});

describe('pageAtOffset', () => {
  const boxes = layoutPages([letter, letter, letter], 1, 10);

  it('finds the page containing an offset', () => {
    expect(pageAtOffset(boxes, 0)).toBe(0);
    expect(pageAtOffset(boxes, 500)).toBe(0);
    expect(pageAtOffset(boxes, 812)).toBe(1);
    expect(pageAtOffset(boxes, 2000)).toBe(2);
    expect(pageAtOffset(boxes, 999999)).toBe(2);
  });

  it('returns 0 for no pages', () => {
    expect(pageAtOffset([], 100)).toBe(0);
  });
});
