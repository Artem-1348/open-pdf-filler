// Detector 2: the FFDetr model from CommonForms (Apache-2.0, see NOTICE).
// This file holds the parts that don't depend on how the model is run:
// turning a page rendering into the model's input, and the model's output
// into findings. The model itself runs in model.worker.ts.
import type { CreatableKind } from '../builder/model';
import { kindFromShape, type DetectedField } from './types';

export const MODEL = {
  // Served from this site, cached on the device after the first download.
  file: 'models/ffdetr-768-q8.onnx',
  // Pages are squeezed into a size × size square, as in training.
  size: 768,
  // Shown before the first download: the model (32 MB) and the runtime
  // that runs it (14 MB).
  downloadMB: 46,
};

// The model's classes, in output order (CommonForms: TextBox, ChoiceButton, Signature).
const CLASSES: CreatableKind[] = ['text', 'checkbox', 'signature'];

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

// Below this score a box isn't reported (CommonForms uses the same).
export const MODEL_THRESHOLD = 0.4;

// Resamples an RGBA rendering to size × size by averaging the pixels each
// output pixel covers (no aliasing on thin lines), then normalises it the
// way the model was trained: planar RGB, ImageNet mean and deviation.
export function toModelInput(rgba: ArrayLike<number>, width: number, height: number, size = MODEL.size): Float32Array {
  const xs = spans(width, size);
  const ys = spans(height, size);
  // Horizontal pass: size columns per input row, 3 channels.
  const row = new Float32Array(height * size * 3);
  for (let y = 0; y < height; y++) {
    for (let ox = 0; ox < size; ox++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [x, w] of xs[ox]) {
        const i = (y * width + x) * 4;
        r += rgba[i] * w;
        g += rgba[i + 1] * w;
        b += rgba[i + 2] * w;
      }
      const o = (y * size + ox) * 3;
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
    }
  }
  // Vertical pass, straight into the planar, normalised output.
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [y, w] of ys[oy]) {
        const o = (y * size + ox) * 3;
        r += row[o] * w;
        g += row[o + 1] * w;
        b += row[o + 2] * w;
      }
      const p = oy * size + ox;
      out[p] = (r / 255 - MEAN[0]) / STD[0];
      out[plane + p] = (g / 255 - MEAN[1]) / STD[1];
      out[2 * plane + p] = (b / 255 - MEAN[2]) / STD[2];
    }
  }
  return out;
}

// For each output pixel: the input pixels it covers and their weights (sum 1).
function spans(from: number, to: number): Array<Array<[number, number]>> {
  const ratio = from / to;
  const result: Array<Array<[number, number]>> = [];
  for (let o = 0; o < to; o++) {
    if (ratio <= 1) {
      // Upscaling (rare: tiny pages): linear interpolation.
      const c = Math.max(0, Math.min(from - 1, (o + 0.5) * ratio - 0.5));
      const i = Math.floor(c);
      const f = c - i;
      result.push(f > 0 && i + 1 < from ? [[i, 1 - f], [i + 1, f]] : [[i, 1]]);
      continue;
    }
    const start = o * ratio;
    const end = start + ratio;
    const span: Array<[number, number]> = [];
    for (let i = Math.floor(start); i < Math.min(from, Math.ceil(end)); i++) {
      const w = Math.min(end, i + 1) - Math.max(start, i);
      if (w > 0) span.push([i, w / ratio]);
    }
    result.push(span);
  }
  return result;
}

// The model's raw output → findings in view space (points, top-left).
// boxes: [queries × 4] centre x, centre y, width, height, all 0–1.
// logits: [queries × classes]; only the first three classes are used.
export function decodeDetections(
  boxes: ArrayLike<number>,
  logits: ArrayLike<number>,
  numClasses: number,
  page: number,
  pageSize: { width: number; height: number },
  threshold = MODEL_THRESHOLD,
): DetectedField[] {
  const queries = boxes.length / 4;
  const candidates: DetectedField[] = [];
  for (let q = 0; q < queries; q++) {
    let best = 0;
    let bestScore = -Infinity;
    for (let c = 0; c < CLASSES.length; c++) {
      const v = logits[q * numClasses + c];
      if (v > bestScore) {
        bestScore = v;
        best = c;
      }
    }
    const score = 1 / (1 + Math.exp(-bestScore));
    if (score <= threshold) continue;
    const [cx, cy, w, h] = [boxes[q * 4], boxes[q * 4 + 1], boxes[q * 4 + 2], boxes[q * 4 + 3]];
    const x0 = Math.max(0, cx - w / 2) * pageSize.width;
    const y0 = Math.max(0, cy - h / 2) * pageSize.height;
    const x1 = Math.min(1, cx + w / 2) * pageSize.width;
    const y1 = Math.min(1, cy + h / 2) * pageSize.height;
    if (x1 - x0 < 2 || y1 - y0 < 2) continue;
    const box = { x: round(x0), y: round(y0), width: round(x1 - x0), height: round(y1 - y0) };
    // The model often calls small square boxes text; a box that size is a checkbox.
    const kind = CLASSES[best] === 'text' && kindFromShape(box).kind === 'checkbox' ? 'checkbox' : CLASSES[best];
    candidates.push({
      page,
      box,
      kind,
      multiline: kind === 'text' && box.height > 28,
      confidence: Math.round(score * 1000) / 1000,
      detector: 'model',
    });
  }
  return suppressOverlaps(candidates);
}

// Keeps the most confident of any boxes that overlap at all (IoU > 0.1),
// whatever their kind, as CommonForms does.
function suppressOverlaps(found: DetectedField[]): DetectedField[] {
  const sorted = [...found].sort((a, b) => b.confidence - a.confidence);
  const kept: DetectedField[] = [];
  for (const f of sorted) if (!kept.some((k) => overlap(k.box, f.box) > 0.1)) kept.push(f);
  return kept;
}

function overlap(a: DetectedField['box'], b: DetectedField['box']): number {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const inter = w * h;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

const round = (v: number) => Math.round(v * 10) / 10;

// The scale to render a page at so both sides cover the model's square.
export function modelRenderScale(pageSize: { width: number; height: number }, size = MODEL.size): number {
  return size / Math.min(pageSize.width, pageSize.height);
}

