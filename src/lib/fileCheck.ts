// Quick checks on a file's bytes before handing it to PDFium, so obvious
// non-PDFs get a clear message instead of a generic engine error.

export type FileCheck =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'not-pdf' };

// The spec puts "%PDF-" at the start, but real-world files sometimes carry a
// few bytes of junk first; Acrobat accepts the header anywhere in the first 1 KB.
const HEADER_SEARCH_BYTES = 1024;
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

export function hasPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, HEADER_SEARCH_BYTES) - PDF_HEADER.length;
  for (let i = 0; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < PDF_HEADER.length; j++) {
      if (bytes[i + j] !== PDF_HEADER[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

export function checkPdfBytes(bytes: Uint8Array): FileCheck {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (!hasPdfHeader(bytes)) return { ok: false, reason: 'not-pdf' };
  return { ok: true };
}

export function looksLikePdfName(name: string, type: string): boolean {
  return type === 'application/pdf' || /\.pdf$/i.test(name);
}
