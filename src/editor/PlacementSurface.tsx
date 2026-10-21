// While a tool is picked, a transparent layer over the page catches the tap
// that places the new item (so it doesn't land in a form field instead).
import type { PointerEvent } from 'react';
import { useEditor } from './EditorContext';
import { initialBox, newItemId, todayText } from './state';

export function PlacementSurface({ page, scale }: { page: number; scale: number }) {
  const { state, dispatch } = useEditor();
  const tool = state.tool;
  if (!tool) return null;

  const place = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const point = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    const signature = tool.kind === 'signature' ? tool.signature : undefined;
    dispatch({
      type: 'place',
      item: {
        id: newItemId(),
        page,
        kind: tool.kind,
        box: initialBox(tool.kind, point, signature),
        ...(tool.kind === 'date' ? { text: todayText(), fontSize: 12 } : {}),
        ...(tool.kind === 'text' ? { text: '', fontSize: 12 } : {}),
        ...(signature ? { signature } : {}),
      },
    });
  };

  return (
    <div
      className="placement-surface"
      onPointerDown={place}
      data-testid="placement-surface"
      aria-label="Tap to place"
    />
  );
}
