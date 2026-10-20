import { PdfErrorCode } from '@embedpdf/models';
import { describe, expect, it } from 'vitest';
import { kindFromPdfiumCode, openErrorMessage, type OpenErrorKind } from './errors';

describe('kindFromPdfiumCode', () => {
  it('maps PDFium error codes to user-facing kinds', () => {
    expect(kindFromPdfiumCode(PdfErrorCode.Password)).toBe('password-required');
    expect(kindFromPdfiumCode(PdfErrorCode.Security)).toBe('unsupported-security');
    expect(kindFromPdfiumCode(PdfErrorCode.WrongFormat)).toBe('damaged');
    expect(kindFromPdfiumCode(PdfErrorCode.PageError)).toBe('damaged');
    expect(kindFromPdfiumCode(PdfErrorCode.Initialization)).toBe('engine');
    expect(kindFromPdfiumCode(PdfErrorCode.Unknown)).toBe('unknown');
    expect(kindFromPdfiumCode(undefined)).toBe('unknown');
  });
});

describe('openErrorMessage', () => {
  const kinds: OpenErrorKind[] = [
    'empty',
    'not-pdf',
    'damaged',
    'password-required',
    'unsupported-security',
    'engine',
    'unknown',
  ];

  it.each(kinds)('gives a non-technical message for %s', (kind) => {
    const message = openErrorMessage(kind, 'tax-form.pdf');
    expect(message.length).toBeGreaterThan(20);
    expect(message).not.toMatch(/pdfium|errno|exception|undefined|null/i);
  });

  it('names the file so the user knows which one failed', () => {
    for (const kind of kinds.filter((k) => k !== 'engine')) {
      expect(openErrorMessage(kind, 'tax-form.pdf')).toContain('tax-form.pdf');
    }
  });
});
