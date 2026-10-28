// Detect fields: choose the quick rule-based scan or the AI scan (detector 2).
import { useEffect, useRef, useState } from 'react';
import { MODEL } from '../detect/model';

export type DetectMethod = 'ai' | 'quick';

interface Props {
  // The choice made last time, picked by default.
  initial: DetectMethod;
  // Whether the AI model is already on this device (no download needed).
  modelOnDevice: boolean;
  pageCount: number;
  onStart(method: DetectMethod): void;
  onCancel(): void;
}

export function DetectDialog({ initial, modelOnDevice, pageCount, onStart, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [method, setMethod] = useState<DetectMethod>(initial);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  // About 4 s a page on a recent phone or laptop (one thread).
  const aiSeconds = Math.max(5, Math.round(pageCount * 4));
  const aiTime = aiSeconds < 90 ? `about ${aiSeconds} seconds` : `about ${Math.round(aiSeconds / 60)} minutes`;

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="detect-title"
      data-testid="detect-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onStart(method);
        }}
      >
        <h2 id="detect-title">Find fields</h2>
        <fieldset className="choices">
          <legend className="sr-only">How to look for fields</legend>
          <label className="choice">
            <input type="radio" name="method" checked={method === 'ai'} onChange={() => setMethod('ai')} data-testid="detect-ai" />
            <span>
              <strong>AI scan</strong>
              <span className="choice-help">
                Best for custom forms: shaded boxes, dotted lines, unusual layouts. Takes {aiTime} for this document.{' '}
                {modelOnDevice ? (
                  <span data-testid="model-ready">The AI model is on this device.</span>
                ) : (
                  <span data-testid="model-download">Downloads the AI model once ({MODEL.downloadMB} MB), then works offline.</span>
                )}
              </span>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="method" checked={method === 'quick'} onChange={() => setMethod('quick')} data-testid="detect-quick" />
            <span>
              <strong>Quick scan</strong>
              <span className="choice-help">Instant. Finds drawn lines, boxes and squares.</span>
            </span>
          </label>
        </fieldset>
        <p className="dialog-text small">Both run on this device. Your file isn't uploaded anywhere.</p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" data-testid="detect-start">
            Find fields
          </button>
        </div>
      </form>
    </dialog>
  );
}
