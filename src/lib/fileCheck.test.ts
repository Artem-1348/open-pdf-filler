import { describe, expect, it } from 'vitest';
import { checkPdfBytes, hasPdfHeader, looksLikePdfName } from './fileCheck';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('checkPdfBytes', () => {
  it('accepts a normal PDF header', () => {
    expect(checkPdfBytes(bytes('%PDF-1.7\n%âãÏÓ\n1 0 obj'))).toEqual({ ok: true });
  });

  it('accepts junk before the header within the first 1 KB', () => {
    expect(checkPdfBytes(bytes('X-Junk: 1\r\n\r\n%PDF-1.4\n'))).toEqual({ ok: true });
  });

  it('rejects a header that only appears after 1 KB', () => {
    const late = new Uint8Array(2048);
    late.set(bytes('%PDF-1.4'), 1500);
    expect(checkPdfBytes(late)).toEqual({ ok: false, reason: 'not-pdf' });
  });

  it('accepts a header that ends exactly at the 1 KB boundary', () => {
    const edge = new Uint8Array(1024);
    edge.set(bytes('%PDF-'), 1019);
    expect(hasPdfHeader(edge)).toBe(true);
  });

  it('flags empty files separately from non-PDFs', () => {
    expect(checkPdfBytes(new Uint8Array())).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects other formats', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(checkPdfBytes(png)).toEqual({ ok: false, reason: 'not-pdf' });
    expect(checkPdfBytes(bytes('PK\u0003\u0004 word document'))).toEqual({ ok: false, reason: 'not-pdf' });
    expect(checkPdfBytes(bytes('%PDF'))).toEqual({ ok: false, reason: 'not-pdf' });
  });
});

describe('looksLikePdfName', () => {
  it('uses the MIME type or the extension', () => {
    expect(looksLikePdfName('form.PDF', '')).toBe(true);
    expect(looksLikePdfName('download', 'application/pdf')).toBe(true);
    expect(looksLikePdfName('photo.jpg', 'image/jpeg')).toBe(false);
  });
});
