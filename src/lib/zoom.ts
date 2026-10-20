// Zoom is a percentage where 100% means "actual size": one PDF point is
// 96/72 CSS pixels, the same convention PDF.js and Acrobat use.
export const POINTS_TO_CSS_PX = 96 / 72;

export const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400] as const;
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

export type ZoomMode = 'fit-width' | number;

export function clampZoom(percent: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, percent));
}

export function nextZoomStep(current: number): number {
  return ZOOM_STEPS.find((s) => s > current + 0.5) ?? MAX_ZOOM;
}

export function prevZoomStep(current: number): number {
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < current - 0.5) return ZOOM_STEPS[i];
  }
  return MIN_ZOOM;
}

// Percentage that makes the widest page fill the available width.
export function fitWidthZoom(widestPagePoints: number, availableCssPx: number): number {
  if (widestPagePoints <= 0 || availableCssPx <= 0) return 100;
  const percent = (availableCssPx / (widestPagePoints * POINTS_TO_CSS_PX)) * 100;
  return clampZoom(Math.floor(percent));
}

// CSS pixels per PDF point at a given zoom percentage.
export function cssScale(percent: number): number {
  return (percent / 100) * POINTS_TO_CSS_PX;
}

// Device pixel ratio used for rendering; capped so 3x phones don't allocate
// huge bitmaps for little visible gain.
export function renderDpr(devicePixelRatio: number): number {
  return Math.min(Math.max(devicePixelRatio || 1, 1), 2);
}

// Safari (macOS and iOS) refuses canvases above 16,777,216 pixels and the
// render silently fails, so a page's bitmap is kept under that budget. At
// extreme zoom the page renders at a slightly lower density instead.
export const MAX_BITMAP_PIXELS = 16_777_216;

export function bitmapDpr(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  maxPixels = MAX_BITMAP_PIXELS,
): number {
  const area = cssWidth * cssHeight;
  if (area <= 0) return dpr;
  const limit = Math.sqrt(maxPixels / area);
  // Small safety margin for PDFium rounding the bitmap size up.
  return Math.min(dpr, limit * 0.99);
}
