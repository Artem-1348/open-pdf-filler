// Draws the PWA PNG icons (same artwork as public/favicon.svg) with no
// image dependencies. Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ACCENT = [0x1f, 0x5f, 0x8b];
const WHITE = [255, 255, 255];
const FOLD = [0xcf, 0xe0, 0xee];

// Shapes in the favicon's 64-unit space, painted in order.
function colorAt(x, y, { maskable }) {
  // Maskable icons need full-bleed background and a smaller safe-zone glyph.
  if (maskable) {
    const s = 0.72;
    x = (x - 32) / s + 32;
    y = (y - 32) / s + 32;
  } else if (!inRoundRect(x, y, 0, 0, 64, 64, 14)) {
    return null;
  }
  let c = ACCENT;
  const inPage = x >= 18 && x <= 48 && y >= 12 && y <= 52 && !(x > 37 && y < 12 + (x - 37));
  if (inPage) c = WHITE;
  if (x >= 37 && x <= 48 && y >= 12 && y <= 23 && y >= 12 + (x - 37)) c = FOLD;
  for (const [ly, lw] of [[31, 18], [38, 18], [45, 11]]) {
    if (inRoundRect(x, y, 24, ly, lw, 3, 1.5)) c = ACCENT;
  }
  return c;
}

function inRoundRect(x, y, rx, ry, w, h, r) {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size, opts) {
  const SS = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 64;
          const y = ((py + (sy + 0.5) / SS) / size) * 64;
          const c = colorAt(x, y, opts);
          if (c) {
            r += c[0]; g += c[1]; b += c[2]; a += 255;
          }
        }
      }
      const n = SS * SS;
      const alpha = a / n;
      const o = 1 + px * 4;
      if (alpha > 0) {
        row[o] = Math.round((r / n) * (255 / alpha));
        row[o + 1] = Math.round((g / n) * (255 / alpha));
        row[o + 2] = Math.round((b / n) * (255 / alpha));
      }
      row[o + 3] = Math.round(alpha);
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

function png(size, raw) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), render(192, { maskable: false }));
writeFileSync(new URL('icon-512.png', out), render(512, { maskable: false }));
writeFileSync(new URL('icon-512-maskable.png', out), render(512, { maskable: true }));
console.log('Wrote icon-192.png, icon-512.png, icon-512-maskable.png');
