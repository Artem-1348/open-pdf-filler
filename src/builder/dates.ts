// Date fields store text in the form's format; the date picker speaks ISO.
import type { DateFormat } from './model';

export function isoToFormat(iso: string, format: DateFormat): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const [, y, mo, d] = m;
  switch (format) {
    case 'MM/DD/YYYY':
      return `${mo}/${d}/${y}`;
    case 'DD/MM/YYYY':
      return `${d}/${mo}/${y}`;
    case 'YYYY-MM-DD':
      return `${y}-${mo}-${d}`;
  }
}

export function formatToIso(text: string, format: DateFormat): string {
  const parts = text.trim().split(/[/.-]/);
  if (parts.length !== 3) return '';
  let y: string, mo: string, d: string;
  switch (format) {
    case 'MM/DD/YYYY':
      [mo, d, y] = parts;
      break;
    case 'DD/MM/YYYY':
      [d, mo, y] = parts;
      break;
    case 'YYYY-MM-DD':
      [y, mo, d] = parts;
      break;
  }
  if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(mo) || !/^\d{1,2}$/.test(d)) return '';
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? '' : iso;
}
