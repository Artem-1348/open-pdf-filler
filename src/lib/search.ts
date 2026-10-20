export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return -1;
  return ((index % count) + count) % count;
}

export function searchStatus(activeIndex: number, total: number, query: string): string {
  if (!query.trim()) return '';
  if (total === 0) return 'No matches';
  return `${activeIndex + 1} of ${total}`;
}
