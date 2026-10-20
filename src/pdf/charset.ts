// Which characters each of our fonts can draw.
//
// The 14 standard PDF fonts (Helvetica etc.) need no embedding but only
// cover WinAnsi (Western European). Noto Sans, which ships with the app,
// covers Latin, Cyrillic, Greek and Vietnamese. Anything else (CJK, Arabic,
// Hebrew, Devanagari, emoji...) isn't supported yet (Phase 6).

// WinAnsi characters above 0x7F that aren't in Latin-1 at the same code point.
const WIN_ANSI_EXTRA = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''),
);

export function isWinAnsi(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  if (c === 0x0a || c === 0x0d || c === 0x09) return true;
  if (c >= 0x20 && c <= 0x7e) return true;
  if (c >= 0xa0 && c <= 0xff) return true;
  return WIN_ANSI_EXTRA.has(ch);
}

const NOTO_RANGES: Array<[number, number]> = [
  [0x0000, 0x024f], // Basic Latin through Latin Extended-B
  [0x0250, 0x02ff], // IPA, spacing modifiers
  [0x0300, 0x036f], // combining diacritics
  [0x0370, 0x03ff], // Greek
  [0x0400, 0x052f], // Cyrillic + supplement
  [0x1d00, 0x1dbf], // phonetic extensions
  [0x1e00, 0x1fff], // Latin Extended Additional (Vietnamese), Greek Extended
  [0x2000, 0x206f], // general punctuation
  [0x20a0, 0x20cf], // currency symbols
  [0x2100, 0x214f], // letterlike symbols (№, ™)
  [0x2150, 0x218f], // number forms
  [0x2190, 0x21ff], // arrows
  [0x2c60, 0x2c7f], // Latin Extended-C
  [0x2de0, 0x2dff], // Cyrillic Extended-A
  [0xa640, 0xa69f], // Cyrillic Extended-B
  [0xa720, 0xa7ff], // Latin Extended-D
  [0xfb00, 0xfb06], // Latin ligatures
];

export function isNotoSupported(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  return NOTO_RANGES.some(([lo, hi]) => c >= lo && c <= hi);
}

export type FontNeed = 'standard' | 'noto';

export interface CharsetCheck {
  need: FontNeed;
  // Characters no bundled font can draw, deduplicated, in order of appearance.
  unsupported: string[];
}

export function checkTexts(texts: Iterable<string>): CharsetCheck {
  let need: FontNeed = 'standard';
  const unsupported: string[] = [];
  for (const text of texts) {
    for (const ch of text) {
      if (isWinAnsi(ch)) continue;
      if (isNotoSupported(ch)) need = 'noto';
      else if (!unsupported.includes(ch)) unsupported.push(ch);
    }
  }
  return { need, unsupported };
}
