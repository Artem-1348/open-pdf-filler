// Conversions between the viewer's coordinate space and PDF user space.
//
// View space: points, origin at the top-left of the page *as displayed*
// (after the page's /Rotate is applied), y grows downward. This is what
// PDFium reports for widget rects and what the editor stores.
//
// PDF space: points, origin at the bottom-left of the unrotated page, y grows
// upward, offset by the crop box origin.

export type Rotation = 0 | 90 | 180 | 270;

export interface PageFrame {
  // Unrotated crop box.
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: Rotation;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeRotation(degrees: number): Rotation {
  const r = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  return r as Rotation;
}

// Size of the page as displayed.
export function viewSize(frame: PageFrame): { width: number; height: number } {
  return frame.rotation === 90 || frame.rotation === 270
    ? { width: frame.height, height: frame.width }
    : { width: frame.width, height: frame.height };
}

export function viewToPdf(frame: PageFrame, p: Point): Point {
  const { width: W, height: H } = frame;
  let x: number;
  let y: number;
  switch (frame.rotation) {
    case 0:
      x = p.x;
      y = H - p.y;
      break;
    case 90:
      x = p.y;
      y = p.x;
      break;
    case 180:
      x = W - p.x;
      y = p.y;
      break;
    case 270:
      x = W - p.y;
      y = H - p.x;
      break;
  }
  return { x: x + frame.x, y: y + frame.y };
}

export function pdfToView(frame: PageFrame, p: Point): Point {
  const { width: W, height: H } = frame;
  const x = p.x - frame.x;
  const y = p.y - frame.y;
  switch (frame.rotation) {
    case 0:
      return { x, y: H - y };
    case 90:
      return { x: y, y: x };
    case 180:
      return { x: W - x, y };
    case 270:
      return { x: H - y, y: W - x };
  }
}

// A PDF-space rectangle (x, y = bottom-left) as a view-space box.
export function pdfRectToView(frame: PageFrame, r: Box): Box {
  const a = pdfToView(frame, { x: r.x, y: r.y });
  const b = pdfToView(frame, { x: r.x + r.width, y: r.y + r.height });
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

// Content drawn at a view-space anchor with this rotation (counter-clockwise
// degrees in PDF space) appears upright on the displayed page.
export function uprightRotation(frame: PageFrame): number {
  return frame.rotation;
}

export function boxCenter(b: Box): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
