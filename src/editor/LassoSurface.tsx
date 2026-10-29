// The Select tool: draw a loop around placed items (Fill) or fields (Edit
// form) to select them all, then delete them from the bar at the bottom.
// While it's on, the page doesn't scroll under the finger.
import { useRef, useState, type PointerEvent } from 'react';
import { useEditor } from './EditorContext';
import { boxesInLoop, loopLength, type Point } from './lasso';
import { visibleSuggestions } from './state';

const TAP_PX = 8;

export function LassoSurface({ page, scale }: { page: number; scale: number }) {
  const { state, dispatch } = useEditor();
  // The points live in a ref so lifting the finger always sees all of them,
  // even when the screen hasn't caught up; state is only for drawing.
  const points = useRef<Point[]>([]);
  const [loop, setLoop] = useState<Point[] | null>(null);
  const pointer = useRef<number | null>(null);

  const at = (e: PointerEvent<HTMLDivElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const finish = (points: Point[]) => {
    const tap = loopLength(points) * scale < TAP_PX;
    if (state.mode === 'edit') {
      const things = [...(state.drafts ?? []), ...visibleSuggestions(state)].filter((d) => d.page === page);
      dispatch({ type: 'select-drafts', ids: tap ? [] : boxesInLoop(things, points).map((d) => d.id) });
    } else {
      const things = state.items.filter((i) => i.page === page);
      dispatch({ type: 'select-items', ids: tap ? [] : boxesInLoop(things, points).map((i) => i.id) });
    }
  };

  return (
    <div
      className="lasso-surface"
      data-testid="lasso-surface"
      aria-label="Draw a loop around things to select them"
      onPointerDown={(e) => {
        if (e.button !== 0 || pointer.current !== null) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pointer already gone (e.g. a synthetic event); drawing still works.
        }
        pointer.current = e.pointerId;
        points.current = [at(e)];
        setLoop(points.current);
      }}
      onPointerMove={(e) => {
        if (pointer.current !== e.pointerId) return;
        points.current = [...points.current, at(e)];
        setLoop(points.current);
      }}
      onPointerUp={(e) => {
        if (pointer.current !== e.pointerId) return;
        pointer.current = null;
        finish([...points.current, at(e)]);
        points.current = [];
        setLoop(null);
      }}
      onPointerCancel={() => {
        pointer.current = null;
        points.current = [];
        setLoop(null);
      }}
    >
      {loop && loop.length > 1 && (
        <svg className="lasso-loop" aria-hidden="true">
          <polygon points={loop.map((p) => `${p.x * scale},${p.y * scale}`).join(' ')} />
        </svg>
      )}
    </div>
  );
}
