import { useEffect, useRef } from 'react';
import { searchStatus } from '../lib/search';
import { CloseIcon, DownIcon, UpIcon } from './icons';

interface Props {
  query: string;
  total: number;
  activeIndex: number;
  searching: boolean;
  focusSignal: number;
  onQueryChange(query: string): void;
  onNext(): void;
  onPrev(): void;
  onClose(): void;
}

export function SearchBar(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [props.focusSignal]);

  const status = props.searching ? 'Searching…' : searchStatus(props.activeIndex, props.total, props.query);

  return (
    <div className="searchbar" role="search" data-testid="searchbar">
      <input
        ref={inputRef}
        type="search"
        className="search-input"
        placeholder="Find in document"
        aria-label="Find in document"
        value={props.query}
        onChange={(e) => props.onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) props.onPrev();
            else props.onNext();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            props.onClose();
          }
        }}
        data-testid="search-input"
      />
      <span className="search-status" aria-live="polite" data-testid="search-status">
        {status}
      </span>
      <button type="button" className="icon-btn" aria-label="Previous match" onClick={props.onPrev} disabled={props.total === 0} data-testid="search-prev">
        <UpIcon />
      </button>
      <button type="button" className="icon-btn" aria-label="Next match" onClick={props.onNext} disabled={props.total === 0} data-testid="search-next">
        <DownIcon />
      </button>
      <button type="button" className="icon-btn" aria-label="Close search" onClick={props.onClose}>
        <CloseIcon />
      </button>
    </div>
  );
}
