import { useEffect, useRef } from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="confirm-title"
      data-testid="confirm-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <p className="dialog-text">{message}</p>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" className="btn danger" onClick={onConfirm} data-testid="confirm-ok">
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
