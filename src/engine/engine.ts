// The one place that talks to PDFium. It runs in a Web Worker created by
// EmbedPDF, so parsing and rendering never block the UI thread.
import { createPdfiumEngine } from '@embedpdf/engines/pdfium-worker-engine';
import type {
  PdfDocumentObject,
  PdfEngine,
  PdfPageObject,
  SearchResult,
} from '@embedpdf/models';
import pdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import { checkPdfBytes } from '../lib/fileCheck';
import { OpenError, kindFromPdfiumCode } from '../lib/errors';

export type { PdfDocumentObject, PdfPageObject, SearchResult };

let enginePromise: Promise<PdfEngine<Blob>> | null = null;

export function getEngine(): Promise<PdfEngine<Blob>> {
  if (!enginePromise) {
    enginePromise = (async () => {
      // The worker is a blob: URL, so it needs an absolute URL to the wasm.
      const wasmUrl = new URL(pdfiumWasmUrl, window.location.href).href;
      // fontFallback: null keeps PDFium from fetching fallback fonts from a
      // CDN; nothing about the document may leave the device (NFR-1).
      return createPdfiumEngine(wasmUrl, { fontFallback: null });
    })();
    enginePromise.catch(() => {
      enginePromise = null;
    });
  }
  return enginePromise;
}

// Start downloading and compiling PDFium before the user picks a file.
export function warmUpEngine(): void {
  void getEngine();
}

function reasonOf(error: unknown): { code?: number; message?: string } {
  if (error && typeof error === 'object') {
    const e = error as { reason?: unknown; code?: unknown; message?: unknown };
    if (e.reason && typeof e.reason === 'object') return reasonOf(e.reason);
    return {
      code: typeof e.code === 'number' ? e.code : undefined,
      message: typeof e.message === 'string' ? e.message : undefined,
    };
  }
  return {};
}

let docCounter = 0;

export async function openPdf(file: Blob, password?: string): Promise<PdfDocumentObject> {
  // Read a fresh copy each time: the buffer is transferred to the worker,
  // and a password retry needs the bytes again.
  const content = await file.arrayBuffer();
  const check = checkPdfBytes(new Uint8Array(content, 0, Math.min(content.byteLength, 1024)));
  if (!check.ok) throw new OpenError(check.reason);

  let engine: PdfEngine<Blob>;
  try {
    engine = await getEngine();
  } catch (e) {
    throw new OpenError('engine', reasonOf(e).message);
  }
  try {
    return await engine
      .openDocumentBuffer({ id: `doc-${++docCounter}`, content }, { password: password ?? '' })
      .toPromise();
  } catch (e) {
    const reason = reasonOf(e);
    throw new OpenError(kindFromPdfiumCode(reason.code), reason.message);
  }
}

export async function closePdf(doc: PdfDocumentObject): Promise<void> {
  const engine = await getEngine();
  await engine.closeDocument(doc).toPromise().catch(() => undefined);
}

export async function searchPdf(doc: PdfDocumentObject, keyword: string): Promise<SearchResult[]> {
  const engine = await getEngine();
  const result = await engine.searchAllPages(doc, keyword).toPromise();
  return result.results;
}
