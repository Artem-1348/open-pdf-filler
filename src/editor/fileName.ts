// Name for a saved copy. The original is never overwritten (FR-9).
export function savedFileName(original: string, flatten: boolean): string {
  const base = original.replace(/\.pdf$/i, '').trim() || 'document';
  return `${base} (${flatten ? 'flattened' : 'filled'}).pdf`;
}
