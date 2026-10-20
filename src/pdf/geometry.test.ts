import { describe, expect, it } from 'vitest';
import { normalizeRotation, pdfRectToView, pdfToView, viewSize, viewToPdf, type PageFrame, type Rotation } from './geometry';

const frame = (rotation: Rotation, x = 0, y = 0): PageFrame => ({ x, y, width: 612, height: 792, rotation });

describe('view <-> PDF coordinates', () => {
  it.each([0, 90, 180, 270] as Rotation[])('round-trips at %i°', (rotation) => {
    for (const f of [frame(rotation), frame(rotation, 30, -12)]) {
      for (const p of [{ x: 0, y: 0 }, { x: 100, y: 250 }, { x: 611, y: 13 }]) {
        const back = pdfToView(f, viewToPdf(f, p));
        expect(back.x).toBeCloseTo(p.x);
        expect(back.y).toBeCloseTo(p.y);
      }
    }
  });

  it('maps the displayed top-left corner to the right PDF corner', () => {
    // Unrotated: top-left is (0, H).
    expect(viewToPdf(frame(0), { x: 0, y: 0 })).toEqual({ x: 0, y: 792 });
    // Turned 90° clockwise: the displayed top-left is the PDF origin.
    expect(viewToPdf(frame(90), { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(viewToPdf(frame(180), { x: 0, y: 0 })).toEqual({ x: 612, y: 0 });
    expect(viewToPdf(frame(270), { x: 0, y: 0 })).toEqual({ x: 612, y: 792 });
  });

  it('applies the crop box offset', () => {
    expect(viewToPdf(frame(0, 50, 20), { x: 0, y: 0 })).toEqual({ x: 50, y: 812 });
  });

  it('swaps width and height for sideways pages', () => {
    expect(viewSize(frame(90))).toEqual({ width: 792, height: 612 });
    expect(viewSize(frame(180))).toEqual({ width: 612, height: 792 });
  });

  it('converts PDF rectangles to view boxes', () => {
    expect(pdfRectToView(frame(0), { x: 100, y: 700, width: 50, height: 20 })).toEqual({ x: 100, y: 72, width: 50, height: 20 });
    const r = pdfRectToView(frame(90), { x: 100, y: 700, width: 50, height: 20 });
    expect(r).toEqual({ x: 700, y: 100, width: 20, height: 50 });
  });

  it('normalizes odd rotation values', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
  });
});
