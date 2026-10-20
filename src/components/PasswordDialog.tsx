import { useEffect, useRef, useState, type FormEvent } from 'react';

interface Props {
  fileName: string;
  // Number of wrong passwords entered so far for this file.
  failedAttempts: number;
  busy: boolean;
  onSubmit(password: string): void;
  onCancel(): void;
}

export function PasswordDialog({ fileName, failedAttempts, busy, onSubmit, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const wrongPassword = failedAttempts > 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (failedAttempts > 0) inputRef.current?.focus();
  }, [failedAttempts]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    onSubmit(password);
    // Cleared right away so a wrong password never lingers in the field.
    setPassword('');
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="pw-title"
      data-testid="password-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <form onSubmit={submit}>
        <h2 id="pw-title">Password required</h2>
        <p className="dialog-text">
          <span className="file-name">“{fileName}”</span> is protected. Enter its password to open it.
          The password stays on this device.
        </p>
        <label className="field">
          <span>Password</span>
          <input
            ref={inputRef}
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={wrongPassword || undefined}
            aria-describedby={wrongPassword ? 'pw-error' : undefined}
            data-testid="password-input"
          />
        </label>
        {wrongPassword && (
          <p id="pw-error" className="field-error" role="alert" data-testid="password-error">
            That password didn't work. Check it and try again.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!password || busy} data-testid="password-submit">
            {busy ? 'Opening…' : 'Open'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
