// Vertical layout of the page stack, computed from page sizes alone so we can
// size every placeholder and find the current page without touching the DOM.

export interface PageBox {
  top: number;
  width: number;
  height: number;
}

export const PAGE_GAP_PX = 16;

export function layoutPages(
  sizes: ReadonlyArray<{ width: number; height: number }>,
  scale: number,
  gap = PAGE_GAP_PX,
): PageBox[] {
  const boxes: PageBox[] = [];
  let top = gap;
  for (const size of sizes) {
    const width = Math.round(size.width * scale);
    const height = Math.round(size.height * scale);
    boxes.push({ top, width, height });
    top += height + gap;
  }
  return boxes;
}

export function totalHeight(boxes: ReadonlyArray<PageBox>, gap = PAGE_GAP_PX): number {
  if (boxes.length === 0) return 0;
  const last = boxes[boxes.length - 1];
  return last.top + last.height + gap;
}

// The page that occupies the middle of the viewport is the "current" page.
export function pageAtOffset(boxes: ReadonlyArray<PageBox>, offset: number): number {
  if (boxes.length === 0) return 0;
  let lo = 0;
  let hi = boxes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (boxes[mid].top <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
