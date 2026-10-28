// Detector 2 (the FFDetr model) in Node, through the same onnxruntime-web
// build and the same pre- and post-processing the browser worker uses.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as ort from 'onnxruntime-web/wasm';
import type { PdfDocumentObject } from '@embedpdf/models';
import { decodeDetections, MODEL, modelRenderScale, toModelInput } from '../../src/detect/model';
import type { DetectedField } from '../../src/detect/types';
import { pdfium } from './pdfium-node';

const require = createRequire(import.meta.url);
const sessions = new Map<string, Promise<ort.InferenceSession>>();

export function modelSession(file = `public/${MODEL.file}`) {
  let s = sessions.get(file);
  if (!s) {
    ort.env.wasm.wasmBinary = readFileSync(require.resolve('onnxruntime-web/ort-wasm-simd-threaded.wasm'));
    ort.env.wasm.numThreads = 1;
    s = ort.InferenceSession.create(readFileSync(file), { executionProviders: ['wasm'] });
    sessions.set(file, s);
  }
  return s;
}

export async function modelFindings(doc: PdfDocumentObject, page: number, file?: string, size = MODEL.size): Promise<DetectedField[]> {
  const e = await pdfium();
  const p = doc.pages[page];
  // The shorter side decides the scale, so rotation doesn't matter here.
  const scale = modelRenderScale(p.size, size);
  const img = (await e
    .renderPageRaw(doc, p, { scaleFactor: scale, dpr: 1, withAnnotations: false, withForms: false })
    .toPromise()) as { width: number; height: number; data: Uint8ClampedArray };
  const input = toModelInput(img.data, img.width, img.height, size);
  const session = await modelSession(file);
  const out = await session.run({ input: new ort.Tensor('float32', input, [1, 3, size, size]) });
  const logits = out.labels;
  return decodeDetections(out.dets.data as Float32Array, logits.data as Float32Array, logits.dims[2], page, {
    width: img.width / scale,
    height: img.height / scale,
  });
}
