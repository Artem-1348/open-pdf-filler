// The "Fill & sign" toolbar: tools that place items on pages, and Save.
import type { ReactNode } from 'react';
import { CheckIcon, CrossIcon, DateIcon, SaveIcon, SignIcon, TextIcon } from '../components/icons';
import { useEditor } from './EditorContext';
import type { Tool } from './state';

interface Props {
  dirty: boolean;
  onSignature(): void;
  onSave(): void;
}

export function FillBar({ dirty, onSignature, onSave }: Props) {
  const { state, dispatch } = useEditor();
  const active = state.tool?.kind ?? null;
  const pick = (tool: Tool) => dispatch({ type: 'set-tool', tool: active === tool.kind ? null : tool });

  return (
    <div className="fillbar" role="toolbar" aria-label="Fill and sign">
      <div className="toolbar-group tools">
        <ToolButton label="Text" active={active === 'text'} disabled={!state.canEdit} onClick={() => pick({ kind: 'text' })} testId="tool-text">
          <TextIcon />
        </ToolButton>
        <ToolButton label="Date" active={active === 'date'} disabled={!state.canEdit} onClick={() => pick({ kind: 'date' })} testId="tool-date">
          <DateIcon />
        </ToolButton>
        <ToolButton label="Check" active={active === 'check'} disabled={!state.canEdit} onClick={() => pick({ kind: 'check' })} testId="tool-check">
          <CheckIcon />
        </ToolButton>
        <ToolButton label="Cross" active={active === 'cross'} disabled={!state.canEdit} onClick={() => pick({ kind: 'cross' })} testId="tool-cross">
          <CrossIcon />
        </ToolButton>
        <ToolButton
          label="Sign"
          active={active === 'signature'}
          disabled={!state.canEdit}
          onClick={() => (active === 'signature' ? dispatch({ type: 'set-tool', tool: null }) : onSignature())}
          testId="tool-sign"
        >
          <SignIcon />
        </ToolButton>
      </div>
      <div className="toolbar-group">
        {state.tool && (
          <span className="tool-hint floating" role="status" data-testid="tool-hint">
            {state.tool.kind === 'text' ? 'Tap where the text should start' : 'Tap the page to place it'}
          </span>
        )}
        {!state.canEdit && (
          <span className="tool-hint" role="status" data-testid="no-edit-notice">
            This PDF's permissions don't allow filling it in.
          </span>
        )}
        <button type="button" className={dirty ? 'btn primary' : 'btn'} onClick={onSave} data-testid="save-button">
          <SaveIcon />
          <span>Save</span>
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  testId,
  children,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick(): void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="tool-btn"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      title={label}
    >
      {children}
      <span className="tool-label">{label}</span>
    </button>
  );
}
