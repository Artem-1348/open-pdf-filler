// A minimal reader for PDF content streams: enough to follow the graphics
// state (q, Q, cm) and see where form XObjects are drawn (Do). Used by the
// flattened-field detector.

// [a b c d e f]: maps (x, y) to (a·x + c·y + e, b·x + d·y + f).
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

// m1 then m2 (PDF's row-vector convention: p · m1 · m2).
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

export function apply(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

// Bounding box of a rectangle after a transform.
export function transformRect(m: Matrix, r: { x1: number; y1: number; x2: number; y2: number }) {
  const pts = [apply(m, r.x1, r.y1), apply(m, r.x2, r.y1), apply(m, r.x1, r.y2), apply(m, r.x2, r.y2)];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

export interface XObjectUse {
  name: string;
  // Current transformation matrix where it is drawn.
  ctm: Matrix;
}

export interface ContentSummary {
  uses: XObjectUse[];
  // Operators seen, to recognise streams that only place other XObjects.
  operators: Set<string>;
}

const DELIMITERS = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);
const WHITESPACE = /[\s\0]/;

// Tokenises and walks a content stream. Strings, arrays, dictionaries and
// inline images are skipped; only numbers, names and operators matter here.
export function readContent(text: string, start: Matrix = IDENTITY): ContentSummary {
  const uses: XObjectUse[] = [];
  const operators = new Set<string>();
  const stack: Matrix[] = [];
  let ctm = start;
  let operands: Array<number | string> = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (WHITESPACE.test(ch)) {
      i++;
      continue;
    }
    if (ch === '%') {
      while (i < n && text[i] !== '\n' && text[i] !== '\r') i++;
      continue;
    }
    if (ch === '(') {
      // Literal string with nesting and escapes.
      let depth = 0;
      for (; i < n; i++) {
        if (text[i] === '\\') {
          i++;
          continue;
        }
        if (text[i] === '(') depth++;
        else if (text[i] === ')' && --depth === 0) {
          i++;
          break;
        }
      }
      operands.push('(string)');
      continue;
    }
    if (ch === '<' && text[i + 1] === '<') {
      let depth = 0;
      for (; i < n; i++) {
        if (text[i] === '<' && text[i + 1] === '<') {
          depth++;
          i++;
        } else if (text[i] === '>' && text[i + 1] === '>') {
          depth--;
          i++;
          if (depth === 0) {
            i++;
            break;
          }
        }
      }
      operands.push('(dict)');
      continue;
    }
    if (ch === '<') {
      const end = text.indexOf('>', i);
      i = end < 0 ? n : end + 1;
      operands.push('(hex)');
      continue;
    }
    if (ch === '[' || ch === ']' || ch === '{' || ch === '}') {
      i++;
      continue;
    }
    if (ch === '/') {
      let j = i + 1;
      while (j < n && !WHITESPACE.test(text[j]) && !DELIMITERS.has(text[j])) j++;
      operands.push(text.slice(i, j));
      i = j;
      continue;
    }
    let j = i;
    while (j < n && !WHITESPACE.test(text[j]) && !DELIMITERS.has(text[j])) j++;
    if (j === i) {
      i++;
      continue;
    }
    const token = text.slice(i, j);
    i = j;
    const num = Number(token);
    if (token !== '' && !Number.isNaN(num) && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(token)) {
      operands.push(num);
      continue;
    }

    // An operator.
    operators.add(token);
    switch (token) {
      case 'q':
        stack.push(ctm);
        break;
      case 'Q':
        ctm = stack.pop() ?? start;
        break;
      case 'cm': {
        const m = operands.slice(-6);
        if (m.length === 6 && m.every((v) => typeof v === 'number')) ctm = multiply(m as Matrix, ctm);
        break;
      }
      case 'Do': {
        const name = operands[operands.length - 1];
        if (typeof name === 'string' && name.startsWith('/')) uses.push({ name: name.slice(1), ctm });
        break;
      }
      case 'BI': {
        // Inline image: skip to EI.
        const end = text.indexOf('EI', i);
        i = end < 0 ? n : end + 2;
        break;
      }
    }
    operands = [];
  }
  return { uses, operators };
}
