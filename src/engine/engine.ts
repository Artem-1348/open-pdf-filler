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
import { buildFields } from '../pdf/fields';
import type { FormFieldInfo } from '../pdf/model';
import { PdfPermissionFlag } from '@embedpdf/models';

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

export interface FormInfo {
  fields: FormFieldInfo[];
  // Pages that have at least one fillable widget; they render without
  // PDFium's own field drawing so the editor's controls replace it.
  pagesWithFields: ReadonlySet<number>;
  canEdit: boolean;
  permissions: number;
}

export async function readForm(doc: PdfDocumentObject): Promise<FormInfo> {
  const engine = await getEngine();
  const perPage = await Promise.all(
    doc.pages.map((page) =>
      engine
        .getPageAnnoWidgets(doc, page)
        .toPromise()
        .catch(() => []),
    ),
  );
  const fields = buildFields(perPage, doc.pages);
  const pagesWithFields = new Set<number>();
  for (const f of fields) for (const w of f.widgets) pagesWithFields.add(w.page);

  // Respect "no form filling" permissions (design D8). Unencrypted files
  // report every permission.
  const permissions = await engine.getDocUserPermissions(doc).toPromise().catch(() => -1);
  const canEdit =
    permissions === -1 ||
    (permissions & PdfPermissionFlag.FillForms) !== 0 ||
    (permissions & PdfPermissionFlag.ModifyAnnotations) !== 0;
  return { fields, pagesWithFields, canEdit, permissions };
}

// Page text with positions, for naming detected fields (Phase 4).
export async function getTextRuns(doc: PdfDocumentObject, pageIndex: number) {
  const engine = await getEngine();
  // Text runs (not text rects): their text is clean, without stray characters.
  const result = await engine.getPageTextRuns(doc, doc.pages[pageIndex]).toPromise().catch(() => ({ runs: [] }));
  return result.runs.map((r) => ({
    text: r.text,
    box: { x: r.rect.origin.x, y: r.rect.origin.y, width: r.rect.size.width, height: r.rect.size.height },
  }));
}

// The page in grey at `scale` pixels per point, without form fields, for the
// rule-based detector.
// A colour rendering for the AI model (detector 2), without form fields.
export async function getPageRgba(doc: PdfDocumentObject, pageIndex: number, scale: number) {
  const engine = await getEngine();
  const img = await engine
    .renderPageRaw(doc, doc.pages[pageIndex], { scaleFactor: scale, dpr: 1, withAnnotations: false, withForms: false })
    .toPromise();
  return { width: img.width, height: img.height, data: img.data };
}

export async function getPageImage(doc: PdfDocumentObject, pageIndex: number, scale = 2) {
  const engine = await getEngine();
  const img = await engine
    .renderPageRaw(doc, doc.pages[pageIndex], { scaleFactor: scale, dpr: 1, withAnnotations: false, withForms: false })
    .toPromise();
  const { toGray } = await import('../detect/rules');
  return { width: img.width, height: img.height, scale, gray: toGray(img.data, img.width, img.height) };
}
