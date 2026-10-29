// The Select tool's loop: which boxes it goes around.
import type { Box } from '../pdf/geometry';

export interface Point {
  x: number;
  y: number;
}

// Even-odd rule; the loop is closed from its last point back to the first.
export function insideLoop(p: Point, loop: ReadonlyArray<Point>): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i];
    const b = loop[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Boxes whose middle is inside the loop.
export function boxesInLoop<T extends { box: Box }>(things: ReadonlyArray<T>, loop: ReadonlyArray<Point>): T[] {
  if (loop.length < 3) return [];
  return things.filter(({ box }) => insideLoop({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, loop));
}

// How far the pointer travelled: a short one is a tap, not a loop.
export function loopLength(loop: ReadonlyArray<Point>): number {
  let total = 0;
  for (let i = 1; i < loop.length; i++) total += Math.hypot(loop[i].x - loop[i - 1].x, loop[i].y - loop[i - 1].y);
  return total;
}
