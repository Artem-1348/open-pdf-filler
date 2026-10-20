import { useState } from 'react';
import { ZOOM_STEPS, type ZoomMode } from '../lib/zoom';
import { CloseIcon, MinusIcon, OpenIcon, PlusIcon, SearchIcon, SidebarIcon } from './icons';

interface Props {
  fileName: string | null;
  pageCount: number;
  currentPage: number;
  zoomPercent: number;
  zoomMode: ZoomMode;
  thumbnailsOpen: boolean;
  searchOpen: boolean;
  onOpenClick(): void;
  onClose(): void;
  onToggleThumbnails(): void;
  onToggleSearch(): void;
  onGoToPage(index: number): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onZoomMode(mode: ZoomMode): void;
}

export function Toolbar(props: Props) {
  const { fileName, pageCount, currentPage, zoomPercent, zoomMode } = props;
  const hasDoc = pageCount > 0;

  return (
    <header className="toolbar" role="toolbar" aria-label="Document tools">
      <div className="toolbar-group">
        <button type="button" className="btn primary" onClick={props.onOpenClick} data-testid="open-button">
          <OpenIcon />
          <span className="label-wide">Open PDF</span>
          <span className="label-narrow">Open</span>
        </button>
        {hasDoc && (
          <button
            type="button"
            className="icon-btn"
            aria-label={props.thumbnailsOpen ? 'Hide thumbnails' : 'Show thumbnails'}
            aria-pressed={props.thumbnailsOpen}
            onClick={props.onToggleThumbnails}
            data-testid="toggle-thumbnails"
          >
            <SidebarIcon />
          </button>
        )}
        {fileName && (
          <span className="file-name toolbar-title" title={fileName} data-testid="file-name">
            {fileName}
          </span>
        )}
        {hasDoc && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Close document"
            title="Close document"
            onClick={props.onClose}
            data-testid="close-button"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {hasDoc && (
        <div className="toolbar-group">
          <PageInput key={currentPage} current={currentPage} count={pageCount} onGo={props.onGoToPage} />
          <div className="zoom" role="group" aria-label="Zoom">
            <button type="button" className="icon-btn" aria-label="Zoom out" onClick={props.onZoomOut} data-testid="zoom-out">
              <MinusIcon />
            </button>
            <select
              className="zoom-select"
              aria-label="Zoom level"
              data-testid="zoom-select"
              value={zoomMode === 'fit-width' ? 'fit-width' : String(zoomMode)}
              onChange={(e) =>
                props.onZoomMode(e.target.value === 'fit-width' ? 'fit-width' : Number(e.target.value))
              }
            >
              <option value="fit-width">
                {/* Short when selected so it fits the phone toolbar. */}
                {zoomMode === 'fit-width' ? `Fit ${zoomPercent}%` : 'Fit width'}
              </option>
              {!ZOOM_STEPS.includes(zoomPercent as (typeof ZOOM_STEPS)[number]) && zoomMode !== 'fit-width' && (
                <option value={String(zoomMode)}>{zoomPercent}%</option>
              )}
              {ZOOM_STEPS.map((s) => (
                <option key={s} value={String(s)}>
                  {s}%
                </option>
              ))}
            </select>
            <button type="button" className="icon-btn" aria-label="Zoom in" onClick={props.onZoomIn} data-testid="zoom-in">
              <PlusIcon />
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Search"
            aria-pressed={props.searchOpen}
            onClick={props.onToggleSearch}
            data-testid="toggle-search"
          >
            <SearchIcon />
          </button>
        </div>
      )}
    </header>
  );
}

function PageInput({ current, count, onGo }: { current: number; count: number; onGo(index: number): void }) {
  // Keyed on the current page by the parent, so it resets when the page changes.
  const [text, setText] = useState(String(current + 1));

  const commit = () => {
    const n = Number.parseInt(text, 10);
    if (Number.isFinite(n) && n >= 1 && n <= count) onGo(n - 1);
    else setText(String(current + 1));
  };

  return (
    <div className="page-nav">
      <input
        className="page-input"
        inputMode="numeric"
        aria-label={`Page number, 1 to ${count}`}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        onBlur={commit}
        data-testid="page-input"
      />
      <span className="page-count" data-testid="page-count">
        / {count}
      </span>
    </div>
  );
}
