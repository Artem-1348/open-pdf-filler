import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  cssScale,
  fitWidthZoom,
  nextZoomStep,
  prevZoomStep,
  renderDpr,
} from './zoom';

describe('zoom steps', () => {
  it('steps through the preset levels', () => {
    expect(nextZoomStep(100)).toBe(125);
    expect(prevZoomStep(100)).toBe(75);
  });

  it('snaps odd fit-width levels to the next preset', () => {
    expect(nextZoomStep(92)).toBe(100);
    expect(prevZoomStep(92)).toBe(75);
  });

  it('stays within bounds', () => {
    expect(nextZoomStep(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(prevZoomStep(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(MIN_ZOOM);
  });
});

describe('fitWidthZoom', () => {
  it('fills the available width with the widest page', () => {
    // Letter is 612pt = 816 CSS px at 100%.
    expect(fitWidthZoom(612, 816)).toBe(100);
    expect(fitWidthZoom(612, 408)).toBe(50);
  });

  it('never exceeds the available width', () => {
    const percent = fitWidthZoom(612, 343); // iPhone-ish width
    expect(612 * cssScale(percent)).toBeLessThanOrEqual(343);
  });

  it('falls back to 100% for unusable sizes', () => {
    expect(fitWidthZoom(0, 800)).toBe(100);
    expect(fitWidthZoom(612, 0)).toBe(100);
  });
});

describe('renderDpr', () => {
  it('caps very dense screens at 2x', () => {
    expect(renderDpr(3)).toBe(2);
    expect(renderDpr(1.5)).toBe(1.5);
    expect(renderDpr(0)).toBe(1);
  });
});
