// The second toolbar: Fill (place text, checks, signatures) or Edit form
// (the form builder's field palette), undo/redo, and Save.
import type { ReactNode } from 'react';
import {
  CheckIcon,
  CheckboxIcon,
  CrossIcon,
  DateIcon,
  DropdownIcon,
  RadioIcon,
  RedoIcon,
  SaveIcon,
  SignIcon,
  TextFieldIcon,
  TextIcon,
  UndoIcon,
  WandIcon,
} from '../components/icons';
import type { CreatableKind } from '../builder/model';
import { useEditor } from './EditorContext';
import { canRedo, canUndo, type Tool } from './state';

export interface DetectProgress {
  done: number;
  total: number;
  // AI scan only: megabytes downloaded so far while the model loads.
  downloadMB?: number;
  ai?: boolean;
}

interface Props {
  dirty: boolean;
  onSignature(): void;
  onSave(): void;
  // Auto-detect (Phase 4): null when not running.
  detecting: DetectProgress | null;
  onDetect(): void;
  onStopDetect(): void;
}

export function FillBar({ dirty, onSignature, onSave, detecting, onDetect, onStopDetect }: Props) {
  const { state, dispatch } = useEditor();
  const active = state.tool?.kind ?? null;
  const pick = (tool: Tool) => dispatch({ type: 'set-tool', tool: active === tool.kind ? null : tool });

  const edit = state.mode === 'edit';
  const build = state.buildTool;
  const pickField = (kind: CreatableKind) => dispatch({ type: 'set-build-tool', tool: build === kind ? null : kind });

  return (
    <div className="fillbar" role="toolbar" aria-label={edit ? 'Edit form' : 'Fill and sign'}>
      <div className="mode-switch" role="radiogroup" aria-label="Mode">
        <button
          type="button"
          role="radio"
          aria-checked={!edit}
          onClick={() => dispatch({ type: 'set-mode', mode: 'fill' })}
          data-testid="mode-fill"
        >
          Fill
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={edit}
          disabled={!state.canEdit}
          onClick={() => dispatch({ type: 'set-mode', mode: 'edit' })}
          data-testid="mode-edit"
        >
          Edit form
        </button>
      </div>
      {edit ? (
        <div className="toolbar-group tools" aria-label="Add a field">
          <ToolButton label="Text box" active={build === 'text'} disabled={false} onClick={() => pickField('text')} testId="field-tool-text">
            <TextFieldIcon />
          </ToolButton>
          <ToolButton label="Date" active={build === 'date'} disabled={false} onClick={() => pickField('date')} testId="field-tool-date">
            <DateIcon />
          </ToolButton>
          <ToolButton label="Checkbox" active={build === 'checkbox'} disabled={false} onClick={() => pickField('checkbox')} testId="field-tool-checkbox">
            <CheckboxIcon />
          </ToolButton>
          <ToolButton label="Radio" active={build === 'radio'} disabled={false} onClick={() => pickField('radio')} testId="field-tool-radio">
            <RadioIcon />
          </ToolButton>
          <ToolButton label="Dropdown" active={build === 'dropdown'} disabled={false} onClick={() => pickField('dropdown')} testId="field-tool-dropdown">
            <DropdownIcon />
          </ToolButton>
          <ToolButton label="Signature" active={build === 'signature'} disabled={false} onClick={() => pickField('signature')} testId="field-tool-signature">
            <SignIcon />
          </ToolButton>
          <span className="tool-divider" aria-hidden="true" />
          <ToolButton label={detecting ? 'Detecting…' : 'Detect fields'} active={!!detecting} disabled={!!detecting} onClick={onDetect} testId="detect-button">
            <WandIcon />
          </ToolButton>
        </div>
      ) : (
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
      )}
      {!state.canEdit && (
        <p className="fill-notice" role="status" data-testid="no-edit-notice">
          This PDF's permissions don't allow filling it in, so it's read-only here.
        </p>
      )}
      <div className="toolbar-group">
        {detecting && (
          <span className="tool-hint floating" role="status" data-testid="detect-progress">
            {detecting.downloadMB !== undefined
              ? `Getting the AI model… ${detecting.downloadMB} MB`
              : `${detecting.ai ? 'AI scan' : 'Looking for fields'}… page ${Math.min(detecting.done + 1, detecting.total)} of ${detecting.total}`}
            {detecting.ai && (
              <button type="button" className="hint-action" onClick={onStopDetect} data-testid="detect-stop">
                Stop
              </button>
            )}
          </span>
        )}
        {!detecting && (state.tool || build) && (
          <span className="tool-hint floating" role="status" data-testid="tool-hint">
            {build ? 'Tap the page to add the field' : state.tool?.kind === 'text' ? 'Tap where the text should start' : 'Tap the page to place it'}
          </span>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label="Undo"
          title="Undo (Ctrl/Cmd+Z)"
          disabled={!canUndo(state)}
          onClick={() => dispatch({ type: 'undo' })}
          data-testid="undo"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Redo"
          title="Redo (Ctrl/Cmd+Shift+Z)"
          disabled={!canRedo(state)}
          onClick={() => dispatch({ type: 'redo' })}
          data-testid="redo"
        >
          <RedoIcon />
        </button>
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
