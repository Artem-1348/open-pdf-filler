import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import type { PdfDocumentObject, SearchResult } from '../engine/engine';
import { layoutPages, pageAtOffset, totalHeight } from '../lib/layout';
import { cssScale, renderDpr } from '../lib/zoom';
import { PageView } from './PageView';

export interface ViewerHandle {
  scrollToPage(index: number): void;
  scrollToMatch(match: SearchResult): void;
  // Brings a box (view-space points on a page) into view near the top, where
  // it stays visible above the phone keyboard and input bar.
  scrollToBox(page: number, box: { x: number; y: number; width: number; height: number }): void;
}

interface Props {
  ref?: Ref<ViewerHandle>;
  doc: PdfDocumentObject;
  zoomPercent: number;
  matches: ReadonlyArray<SearchResult>;
  activeMatch: SearchResult | null;
  onCurrentPageChange(index: number): void;
  onAvailableWidthChange(px: number): void;
  pagesWithFields: ReadonlySet<number>;
  // A press on the page or background (not on a placed item).
  onBackgroundPointerDown(): void;
}

const EMPTY: ReadonlyArray<SearchResult> = [];
const NARROW_QUERY = '(max-width: 720px)';

// Tighter page spacing on phones, where every pixel of width counts.
function useGap(): number {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow ? 8 : 16;
}

export function Viewer({
  ref,
  doc,
  zoomPercent,
  matches,
  activeMatch,
  onCurrentPageChange,
  onAvailableWidthChange,
  pagesWithFields,
  onBackgroundPointerDown,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scale = cssScale(zoomPercent);
  const gap = useGap();
  const [dpr, setDpr] = useState(() => renderDpr(window.devicePixelRatio));
  const boxes = useMemo(
    () => layoutPages(doc.pages.map((p) => p.size), scale, gap),
    [doc, scale, gap],
  );
  const [near, setNear] = useState<ReadonlySet<number>>(() => new Set([0, 1]));

  // Where the user is, as (page, fraction through it), so zooming keeps the
  // same spot on screen instead of jumping.
  const anchorRef = useRef({ page: 0, fraction: 0 });
  const currentRef = useRef(0);

  const matchesByPage = useMemo(() => {
    const map = new Map<number, SearchResult[]>();
    for (const m of matches) {
      const list = map.get(m.pageIndex);
      if (list) list.push(m);
      else map.set(m.pageIndex, [m]);
    }
    return map;
  }, [matches]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const probe = el.scrollTop + el.clientHeight / 3;
    const index = pageAtOffset(boxes, probe);
    const box = boxes[index];
    anchorRef.current = {
      page: index,
      fraction: box ? Math.max(0, (el.scrollTop - box.top) / box.height) : 0,
    };
    if (index !== currentRef.current) {
      currentRef.current = index;
      onCurrentPageChange(index);
    }
  }, [boxes, onCurrentPageChange]);

  // Restore the anchor after the layout changes size.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const box = boxes[anchorRef.current.page];
    if (!el || !box) return;
    el.scrollTop = box.top + anchorRef.current.fraction * box.height;
  }, [boxes]);

  // A new document starts at the top.
  useLayoutEffect(() => {
    anchorRef.current = { page: 0, fraction: 0 };
    currentRef.current = 0;
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [doc]);

  // Render only pages within about one screen of the viewport.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setNear((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const index = Number((entry.target as HTMLElement).dataset.pageIndex);
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next;
        });
      },
      { root, rootMargin: '100% 0px' },
    );
    root.querySelectorAll<HTMLElement>('[data-page-index]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [doc]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const report = () => onAvailableWidthChange(el.clientWidth - 2 * gap);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onAvailableWidthChange, gap]);

  // Re-render sharper when the window moves to a different-density screen.
  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const update = () => setDpr(renderDpr(window.devicePixelRatio));
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [dpr]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage(index) {
        const el = scrollerRef.current;
        const box = boxes[index];
        if (el && box) el.scrollTop = box.top - gap / 2;
      },
      scrollToBox(page, target) {
        const el = scrollerRef.current;
        const box = boxes[page];
        if (!el || !box) return;
        const pageLeft = (el.scrollWidth - box.width) / 2;
        el.scrollTo({
          top: Math.max(0, box.top + target.y * scale - el.clientHeight * 0.18),
          left: Math.max(0, pageLeft + target.x * scale - 12),
        });
      },
      scrollToMatch(match) {
        const el = scrollerRef.current;
        const box = boxes[match.pageIndex];
        const rect = match.rects[0];
        if (!el || !box) return;
        const y = box.top + (rect ? rect.origin.y * scale : 0);
        const x = rect ? rect.origin.x * scale : 0;
        const pageLeft = (el.scrollWidth - box.width) / 2;
        el.scrollTo({
          top: Math.max(0, y - el.clientHeight / 3),
          left: Math.max(0, pageLeft + x - el.clientWidth / 3),
        });
      },
    }),
    [boxes, scale, gap],
  );

  return (
    <div
      className="scroller"
      ref={scrollerRef}
      onScroll={handleScroll}
      onPointerDown={onBackgroundPointerDown}
      data-testid="viewer"
      tabIndex={0}
      aria-label="Document pages"
    >
      <div className="pages" style={{ gap, padding: gap, minHeight: totalHeight(boxes, gap) }}>
        {doc.pages.map((page, i) => (
          <PageView
            key={page.index}
            doc={doc}
            page={page}
            box={boxes[i]}
            scale={scale}
            dpr={dpr}
            near={near.has(i)}
            matches={matchesByPage.get(i) ?? EMPTY}
            activeMatch={activeMatch?.pageIndex === i ? activeMatch : null}
            hasFields={pagesWithFields.has(i)}
          />
        ))}
      </div>
    </div>
  );
}
