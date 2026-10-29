// Text, dates, checkmarks and signatures placed on a page. Items can be
// dragged (mouse or touch), resized and edited; font size, the calendar and
// Delete are in the bar at the bottom (ActionBar).
import { memo, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type PointerEvent } from 'react';
import type { PlacedItem } from '../pdf/model';
import { TEXT_LINE_HEIGHT, TEXT_PADDING } from '../pdf/layout';
import { useEditor } from './EditorContext';

interface Props {
  page: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
}

const DRAG_THRESHOLD_PX = 4;

export const ItemLayer = memo(function ItemLayer({ page, scale, pageWidth, pageHeight }: Props) {
  const { state } = useEditor();
  const items = state.items.filter((i) => i.page === page);
  if (!items.length) return null;
  return (
    <div className="item-layer">
      {items.map((item) => (
        <Item key={item.id} item={item} scale={scale} pageWidth={pageWidth} pageHeight={pageHeight} />
      ))}
    </div>
  );
});

function Item({ item, scale, pageWidth, pageHeight }: { item: PlacedItem; scale: number; pageWidth: number; pageHeight: number }) {
  const { state, dispatch } = useEditor();
  const selected = state.selectedId === item.id || state.selectedItems.includes(item.id);
  const editing = state.editingId === item.id;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; box: PlacedItem['box']; moved: boolean; id: number } | null>(null);
  const isText = item.kind === 'text' || item.kind === 'date';
  const isTypedSignature = item.kind === 'signature' && item.signature?.type === 'typed';
  const fontSize = item.fontSize ?? (isTypedSignature ? item.box.height * 0.6 : 12);

  const clampBox = (b: PlacedItem['box']) => ({
    ...b,
    x: Math.min(Math.max(b.x, -b.width / 2), pageWidth - b.width / 2),
    y: Math.min(Math.max(b.y, 0), pageHeight - b.height / 2),
  });

  const onPointerDown = (e: PointerEvent) => {
    if (!state.canEdit || e.button !== 0) return;
    // Let clicks inside text being edited place the caret.
    if (editing && (e.target as HTMLElement).isContentEditable) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, box: item.box, moved: false, id: e.pointerId };
    if (!selected) dispatch({ type: 'select', id: item.id });
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    dispatch({ type: 'update-item', id: item.id, patch: { box: clampBox({ ...d.box, x: d.box.x + dx / scale, y: d.box.y + dy / scale }) } });
  };

  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    // A tap on text (not a drag) starts editing it.
    if (!d.moved && isText) {
      dispatch({ type: 'edit', id: item.id });
    }
  };

  const style: CSSProperties = {
    left: item.box.x * scale,
    top: item.box.y * scale,
    ...(isText ? {} : { width: item.box.width * scale, height: item.box.height * scale }),
  };

  return (
    <div
      ref={ref}
      className={`item item-${item.kind}${selected ? ' selected' : ''}`}
      style={style}
      data-testid="placed-item"
      data-kind={item.kind}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      {isText && <EditableText item={item} scale={scale} fontSize={fontSize} editing={editing} />}
      {(item.kind === 'check' || item.kind === 'cross') && <Mark kind={item.kind} />}
      {item.kind === 'signature' && <SignatureView item={item} scale={scale} fontSize={fontSize} />}
      {state.selectedId === item.id && state.canEdit && !isText && <ResizeHandle item={item} scale={scale} />}
    </div>
  );
}

function EditableText({ item, scale, fontSize, editing }: { item: PlacedItem; scale: number; fontSize: number; editing: boolean }) {
  const { dispatch } = useEditor();
  const ref = useRef<HTMLDivElement>(null);

  // The element is uncontrolled while typing; only push text in when it
  // changed from outside (e.g. a new item).
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.innerText !== (item.text ?? '')) el.innerText = item.text ?? '';
  }, [item.text]);

  useEffect(() => {
    const el = ref.current;
    if (!editing || !el) return;
    el.focus();
    // Caret at the end.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  // Keep the stored box size in step with the rendered text.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const width = el.offsetWidth / scale;
    const height = el.offsetHeight / scale;
    if (Math.abs(width - item.box.width) > 0.5 || Math.abs(height - item.box.height) > 0.5) {
      dispatch({ type: 'update-item', id: item.id, patch: { box: { ...item.box, width, height } } });
    }
  });

  return (
    <div
      ref={ref}
      className="item-text"
      contentEditable={editing ? 'plaintext-only' : false}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={item.kind === 'date' ? 'Date' : 'Text'}
      data-testid="item-text"
      spellCheck={false}
      style={{
        fontSize: fontSize * scale,
        lineHeight: TEXT_LINE_HEIGHT,
        padding: TEXT_PADDING * scale,
      }}
      onInput={(e) => dispatch({ type: 'update-item', id: item.id, patch: { text: (e.currentTarget as HTMLElement).innerText } })}
      onBlur={() => dispatch({ type: 'stop-editing' })}
      onKeyDown={(e) => {
        if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur();
      }}
    />
  );
}

function Mark({ kind }: { kind: 'check' | 'cross' }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-label={kind === 'check' ? 'Checkmark' : 'Cross'} role="img">
      <path
        d={kind === 'check' ? 'M4 12.5 L9.5 18 L20 6' : 'M6 6 L18 18 M18 6 L6 18'}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SignatureView({ item, scale, fontSize }: { item: PlacedItem; scale: number; fontSize: number }) {
  const sig = item.signature;
  const url = useMemo(() => {
    if (sig?.type !== 'drawn') return null;
    return URL.createObjectURL(new Blob([sig.png as BlobPart], { type: 'image/png' }));
  }, [sig]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  if (!sig) return null;
  if (sig.type === 'drawn') return <img src={url ?? ''} alt="Signature" draggable={false} className="item-signature-img" />;
  return (
    <div
      className="item-signature-typed"
      aria-label="Signature"
      style={{ fontSize: fontSize * scale, lineHeight: TEXT_LINE_HEIGHT, padding: TEXT_PADDING * scale }}
    >
      {sig.text}
    </div>
  );
}

function ResizeHandle({ item, scale }: { item: PlacedItem; scale: number }) {
  const { dispatch } = useEditor();
  const start = useRef<{ x: number; box: PlacedItem['box']; id: number } | null>(null);
  const aspect = item.box.width / item.box.height;
  return (
    <div
      className="resize-handle"
      aria-hidden="true"
      data-testid="item-resize"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, box: item.box, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        const width = Math.max(8, s.box.width + (e.clientX - s.x) / scale);
        dispatch({ type: 'update-item', id: item.id, patch: { box: { ...s.box, width, height: width / aspect } } });
      }}
      onPointerUp={() => (start.current = null)}
    />
  );
}
