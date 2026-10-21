// PDFium (Chrome's PDF engine) running directly in Node, for tests that
// check what other viewers will see in a saved file.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PdfiumNative } from '@embedpdf/engines/pdfium';
import { init } from '@embedpdf/pdfium';
import type { PdfDocumentObject } from '@embedpdf/models';

const require = createRequire(import.meta.url);

let engine: PdfiumNative | null = null;

export async function pdfium(): Promise<PdfiumNative> {
  if (!engine) {
    const wasmBinary = readFileSync(require.resolve('@embedpdf/pdfium/pdfium.wasm'));
    const module = await init({ wasmBinary } as never);
    engine = new PdfiumNative(module, { fontFallback: null } as never);
  }
  return engine;
}

let counter = 0;
export async function openWithPdfium(bytes: Uint8Array, password?: string): Promise<PdfDocumentObject> {
  const e = await pdfium();
  const content = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return e.openDocumentBuffer({ id: `node-${++counter}`, content }, { password: password ?? '' }).toPromise();
}

// Form fields as the app's editor would read them.
export async function readFieldsWithPdfium(bytes: Uint8Array, password?: string) {
  const { buildFields } = await import('../../src/pdf/fields');
  const e = await pdfium();
  const doc = await openWithPdfium(bytes, password);
  const perPage = [];
  for (const page of doc.pages) perPage.push(await e.getPageAnnoWidgets(doc, page).toPromise());
  return { doc, fields: buildFields(perPage) };
}

export async function pageText(doc: PdfDocumentObject, pageIndex: number): Promise<string> {
  const e = await pdfium();
  return e.extractText(doc, [pageIndex]).toPromise();
}

// Count of non-white pixels inside a view-space box, rendered at 1 px per point.
export async function inkInBox(
  doc: PdfDocumentObject,
  pageIndex: number,
  box: { x: number; y: number; width: number; height: number },
): Promise<number> {
  const e = await pdfium();
  const img = (await e
    .renderPageRaw(doc, doc.pages[pageIndex], { scaleFactor: 1, dpr: 1, withAnnotations: true, withForms: true })
    .toPromise()) as { width: number; height: number; data: Uint8ClampedArray };
  let n = 0;
  for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(img.height, box.y + box.height); y++) {
    for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(img.width, box.x + box.width); x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i] + img.data[i + 1] + img.data[i + 2] < 600) n++;
    }
  }
  return n;
}

export async function findText(doc: PdfDocumentObject, term: string) {
  const e = await pdfium();
  const results = [];
  for (const page of doc.pages) results.push(...(await e.searchInPage(doc, page, term, 0).toPromise()));
  return results;
}
