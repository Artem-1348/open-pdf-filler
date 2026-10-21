// Text layout shared by the on-screen editor and the writer, so saved text
// lands where it was shown. Sizes are in points.
export const TEXT_LINE_HEIGHT = 1.2;
export const TEXT_PADDING = 2;
// Baseline of the first line, as a fraction of the font size from the top of
// the line box (Helvetica/Arial at line-height 1.2).
export const BASELINE_RATIO = 0.9;

// Font size for a form field whose default appearance says "auto" (0): the
// editor shows this size on screen and the writer draws the saved
// appearance with it, so both match. pdf-lib's own auto-size blows a
// multi-line value up to fill the box and drops the lines that don't fit.
export function autoFieldFontSize(boxHeight: number): number {
  return Math.max(6, Math.min(12, boxHeight * 0.65));
}
