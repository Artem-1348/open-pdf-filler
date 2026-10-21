// Signature pad: draw with a finger, pen or mouse, or type a name. The result
// stays in memory for this session only.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { SignatureContent } from '../pdf/model';

interface Props {
  previous: SignatureContent | null;
  onDone(signature: SignatureContent | null): void;
}

type Tab = 'draw' | 'type';
const PAD_HEIGHT = 200;
const INK = '#14141f';

export function SignatureDialog({ previous, onDone }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>(previous?.type === 'typed' ? 'type' : 'draw');
  const [typed, setTyped] = useState(previous?.type === 'typed' ? previous.text : '');
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<{ last: { x: number; y: number } | null; id: number | null }>({ last: null, id: null });

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  // Size the canvas to its on-screen size at device resolution.
  useEffect(() => {
    if (tab !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(PAD_HEIGHT * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    setHasInk(false);
  }, [tab]);

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    strokes.current = { last: point(e), id: e.pointerId };
    const ctx = e.currentTarget.getContext('2d')!;
    const p = point(e);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    setHasInk(true);
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = strokes.current;
    if (s.id !== e.pointerId || !s.last) return;
    const ctx = e.currentTarget.getContext('2d')!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(s.last.x, s.last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    s.last = p;
  };
  const up = () => {
    strokes.current = { last: null, id: null };
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const use = async () => {
    if (tab === 'type') {
      if (typed.trim()) onDone({ type: 'typed', text: typed.trim() });
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    const cropped = cropToInk(canvas);
    if (!cropped) return;
    const blob = await new Promise<Blob | null>((r) => cropped.toBlob(r, 'image/png'));
    if (!blob) return;
    onDone({ type: 'drawn', png: new Uint8Array(await blob.arrayBuffer()), width: cropped.width, height: cropped.height });
  };

  const ready = tab === 'type' ? typed.trim().length > 0 : hasInk;

  return (
    <dialog
      ref={dialogRef}
      className="dialog signature-dialog"
      aria-labelledby="sig-title"
      data-testid="signature-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onDone(null);
      }}
    >
      <h2 id="sig-title">Add your signature</h2>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'draw'} onClick={() => setTab('draw')} data-testid="sig-tab-draw">
          Draw
        </button>
        <button type="button" role="tab" aria-selected={tab === 'type'} onClick={() => setTab('type')} data-testid="sig-tab-type">
          Type
        </button>
      </div>
      {tab === 'draw' ? (
        <div className="sig-pad-wrap">
          <canvas
            ref={canvasRef}
            className="sig-pad"
            style={{ height: PAD_HEIGHT }}
            aria-label="Signature pad. Draw your signature here."
            data-testid="sig-pad"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
          <div className="sig-pad-line" aria-hidden="true" />
          <button type="button" className="btn small sig-clear" onClick={clear} disabled={!hasInk}>
            Clear
          </button>
        </div>
      ) : (
        <label className="field">
          <span>Your name</span>
          <input
            type="text"
            value={typed}
            autoFocus
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void use();
            }}
            data-testid="sig-typed-input"
          />
          {typed.trim() && <span className="sig-typed-preview">{typed}</span>}
        </label>
      )}
      <p className="dialog-text small">Your signature stays on this device and isn't saved anywhere.</p>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!ready} onClick={() => void use()} data-testid="sig-use">
          Use signature
        </button>
      </div>
    </dialog>
  );
}

// Copy of the canvas cropped to the drawn strokes plus a small margin.
function cropToInk(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
