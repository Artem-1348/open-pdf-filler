import { memo, useEffect, useRef, useState } from 'react';
import type { PdfDocumentObject, PdfPageObject } from '../engine/engine';
import { useRenderedImage } from '../engine/useRenderedImage';
import { renderDpr } from '../lib/zoom';

const THUMB_WIDTH_PX = 112;

interface Props {
  doc: PdfDocumentObject;
  currentPage: number;
  onSelect(index: number): void;
}

export function Thumbnails({ doc, currentPage, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setNear((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const index = Number((entry.target as HTMLElement).dataset.thumbIndex);
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next;
        });
      },
      { root, rootMargin: '50% 0px' },
    );
    root.querySelectorAll<HTMLElement>('[data-thumb-index]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [doc]);

  // Keep the current page's thumbnail in view as the user scrolls the document.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-thumb-index="${currentPage}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [currentPage]);

  return (
    <nav className="thumbnails" ref={listRef} aria-label="Page thumbnails" data-testid="thumbnails">
      <ol>
        {doc.pages.map((page) => (
          <li key={page.index}>
            <Thumbnail
              doc={doc}
              page={page}
              active={page.index === currentPage}
              near={near.has(page.index)}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}

const Thumbnail = memo(function Thumbnail({
  doc,
  page,
  active,
  near,
  onSelect,
}: {
  doc: PdfDocumentObject;
  page: PdfPageObject;
  active: boolean;
  near: boolean;
  onSelect(index: number): void;
}) {
  const scaleFactor = THUMB_WIDTH_PX / page.size.width;
  const height = Math.round(page.size.height * scaleFactor);
  const url = useRenderedImage({
    doc,
    page,
    scaleFactor,
    dpr: renderDpr(window.devicePixelRatio),
    active: near,
    thumbnail: true,
  });

  return (
    <button
      type="button"
      className={active ? 'thumb active' : 'thumb'}
      data-thumb-index={page.index}
      data-testid="thumbnail"
      aria-current={active ? 'page' : undefined}
      aria-label={`Go to page ${page.index + 1}`}
      onClick={() => onSelect(page.index)}
    >
      <span className="thumb-frame" style={{ width: THUMB_WIDTH_PX, height }}>
        {url && <img src={url} alt="" draggable={false} />}
      </span>
      <span className="thumb-label">{page.index + 1}</span>
    </button>
  );
});
