import { describe, expect, it } from 'vitest';
import { checkTexts, isWinAnsi } from './charset';

describe('checkTexts', () => {
  it('uses the standard font for Western European text', () => {
    expect(checkTexts(['Café déjà vu – “quotes” €5', 'Größe'])).toEqual({ need: 'standard', unsupported: [] });
  });

  it('needs Noto Sans for Cyrillic, Greek, Polish and Vietnamese', () => {
    for (const t of ['Иван', 'Ελλάδα', 'Łódź', 'Tiếng Việt']) {
      expect(checkTexts([t]), t).toEqual({ need: 'noto', unsupported: [] });
    }
  });

  it('lists characters no bundled font can draw', () => {
    expect(checkTexts(['日本 שלום 😀 日']).unsupported).toEqual(['日', '本', 'ש', 'ל', 'ו', 'ם', '😀']);
  });

  it('treats line breaks as fine', () => {
    expect(isWinAnsi('\n')).toBe(true);
  });
});
