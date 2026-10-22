// Detector 0: rebuild form fields that a PDFium flatten ("Print → Save as
// PDF" in Chrome, among others) stripped out. The flatten leaves each
// field's former appearance as an XObject ("/F0", "/F1", …) placed by one
// container XObject per page ("/FFT0"); their positions and sizes are exact.
import { PDFDict, PDFName, PDFRawStream, PDFStream, decodePDFRawStream, type PDFDocument, type PDFPage } from '@cantoo/pdf-lib';
import { normalizeRotation, pdfRectToView, type PageFrame } from '../pdf/geometry';
import { IDENTITY, multiply, readContent, transformRect, type Matrix } from './content';
import { kindFromShape, type DetectedField } from './types';

const CONFIDENCE = 0.98;
// Field shells are small; anything bigger is page artwork, not a field.
const MAX_SHELL_AREA_SHARE = 0.25;

export function detectFlattened(doc: PDFDocument): DetectedField[] {
  const found: DetectedField[] = [];
  doc.getPages().forEach((page, index) => {
    const frame = frameOf(page);
    const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjects) return;
    const { uses } = readContent(pageContent(page));
    for (const use of uses) {
      const container = xobjects.lookupMaybe(PDFName.of(use.name), PDFStream);
      if (!container || !isShellContainer(use.name, container)) continue;
      const outer = multiply(formMatrix(container), use.ctm);
      const inner = container.dict.lookupMaybe(PDFName.of('Resources'), PDFDict)?.lookupMaybe(PDFName.of('XObject'), PDFDict);
      if (!inner) continue;
      for (const shellUse of readContent(streamText(container)).uses) {
        const shell = inner.lookupMaybe(PDFName.of(shellUse.name), PDFStream);
        const bbox = shell && bboxOf(shell);
        if (!shell || !bbox) continue;
        const m = multiply(multiply(formMatrix(shell), shellUse.ctm), outer);
        const rect = transformRect(m, bbox);
        if (rect.width < 2 || rect.height < 2) continue;
        if (rect.width * rect.height > frame.width * frame.height * MAX_SHELL_AREA_SHARE) continue;
        const box = pdfRectToView(frame, rect);
        const { kind, multiline } = kindFromShape(box);
        found.push({ page: index, box, kind, multiline, confidence: CONFIDENCE, detector: 'flattened' });
      }
    }
  });
  return found;
}

// PDFium names the container "FFT<n>"; also accept any form XObject whose
// content does nothing but place other XObjects, which is what it contains.
function isShellContainer(name: string, stream: PDFStream): boolean {
  if (stream.dict.get(PDFName.of('Subtype'))?.toString() !== '/Form') return false;
  if (/^FFT\d+$/.test(name)) return true;
  const { uses, operators } = readContent(streamText(stream));
  const onlyPlacing = [...operators].every((op) => op === 'q' || op === 'Q' || op === 'cm' || op === 'Do');
  return onlyPlacing && uses.length >= 2;
}

function formMatrix(stream: PDFStream): Matrix {
  const m = stream.dict.lookupMaybe(PDFName.of('Matrix'), Object as never) as unknown as { asArray?: () => Array<{ asNumber?: () => number }> } | undefined;
  const values = m?.asArray?.().map((v) => v.asNumber?.() ?? NaN);
  return values && values.length === 6 && values.every(Number.isFinite) ? (values as Matrix) : IDENTITY;
}

function bboxOf(stream: PDFStream) {
  const b = stream.dict.lookupMaybe(PDFName.of('BBox'), Object as never) as unknown as { asArray?: () => Array<{ asNumber?: () => number }> } | undefined;
  const v = b?.asArray?.().map((x) => x.asNumber?.() ?? NaN);
  if (!v || v.length !== 4 || !v.every(Number.isFinite)) return null;
  return { x1: Math.min(v[0], v[2]), y1: Math.min(v[1], v[3]), x2: Math.max(v[0], v[2]), y2: Math.max(v[1], v[3]) };
}

function streamText(stream: PDFStream): string {
  try {
    const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
    return new TextDecoder('latin1').decode(bytes);
  } catch {
    return '';
  }
}

function pageContent(page: PDFPage): string {
  const contents = page.node.Contents();
  if (!contents) return '';
  if (contents instanceof PDFStream) return streamText(contents);
  const parts: string[] = [];
  for (let i = 0; i < contents.size(); i++) {
    const s = contents.lookupMaybe(i, PDFStream);
    if (s) parts.push(streamText(s));
  }
  return parts.join('\n');
}

function frameOf(page: PDFPage): PageFrame {
  const box = page.getCropBox();
  return { x: box.x, y: box.y, width: box.width, height: box.height, rotation: normalizeRotation(page.getRotation().angle) };
}
