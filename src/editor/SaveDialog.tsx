import { useEffect, useRef, useState } from 'react';

export interface SaveChoice {
  flatten: boolean;
}

interface Props {
  fileNameFor(flatten: boolean): string;
  hasFields: boolean;
  passwordProtected: boolean;
  busy: boolean;
  error: string | null;
  onSave(choice: SaveChoice): void;
  onCancel(): void;
}

export function SaveDialog({ fileNameFor, hasFields, passwordProtected, busy, error, onSave, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [flatten, setFlatten] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="save-title"
      data-testid="save-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ flatten });
        }}
      >
        <h2 id="save-title">Save a copy</h2>
        <fieldset className="choices">
          <legend className="sr-only">Type of copy</legend>
          <label className="choice">
            <input type="radio" name="kind" checked={!flatten} onChange={() => setFlatten(false)} data-testid="save-fillable" />
            <span>
              <strong>Fillable PDF</strong>
              <span className="choice-help">
                {hasFields
                  ? 'Form fields stay editable in other apps. Added text and signatures become part of the page.'
                  : 'Added text and signatures become part of the page.'}
              </span>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="kind" checked={flatten} onChange={() => setFlatten(true)} data-testid="save-flattened" />
            <span>
              <strong>Flattened copy</strong>
              <span className="choice-help">Everything becomes part of the page and can't be changed. Best for sending or printing.</span>
            </span>
          </label>
        </fieldset>
        <p className="dialog-text small">
          Saves as <span className="file-name" data-testid="save-file-name">“{fileNameFor(flatten)}”</span>. Your original file isn't changed.
          {passwordProtected && ' The copy keeps the same password.'}
        </p>
        {error && (
          <p className="field-error" role="alert" data-testid="save-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy} data-testid="save-confirm">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
