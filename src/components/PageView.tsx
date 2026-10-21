import { memo } from 'react';
import type { PdfDocumentObject, PdfPageObject, SearchResult } from '../engine/engine';
import { useRenderedImage } from '../engine/useRenderedImage';
import type { PageBox } from '../lib/layout';
import { bitmapDpr } from '../lib/zoom';
import { PageLayers } from '../editor/PageLayers';

interface Props {
  doc: PdfDocumentObject;
  page: PdfPageObject;
  box: PageBox;
  scale: number;
  dpr: number;
  near: boolean;
  matches: ReadonlyArray<SearchResult>;
  activeMatch: SearchResult | null;
  // The page has fillable fields: render it without them and show editable
  // controls instead.
  hasFields: boolean;
}

export const PageView = memo(function PageView({
  doc,
  page,
  box,
  scale,
  dpr,
  near,
  matches,
  activeMatch,
  hasFields,
}: Props) {
  const url = useRenderedImage({
    doc,
    page,
    scaleFactor: scale,
    dpr: bitmapDpr(box.width, box.height, dpr),
    active: near,
    withForms: !hasFields,
  });
  const label = `Page ${page.index + 1} of ${doc.pageCount}`;

  return (
    <div
      className="page"
      data-testid="page"
      data-page-index={page.index}
      style={{ width: box.width, height: box.height }}
      aria-label={label}
      role="group"
    >
      {url ? (
        <img className="page-image" src={url} alt="" draggable={false} data-testid="page-image" />
      ) : (
        <div className="page-placeholder" aria-hidden="true" />
      )}
      {matches.length > 0 && (
        <div className="highlights" aria-hidden="true">
          {matches.flatMap((m) =>
            m.rects.map((r, i) => (
              <div
                key={`${m.charIndex}-${i}`}
                className={m === activeMatch ? 'highlight active' : 'highlight'}
                data-testid={m === activeMatch ? 'highlight-active' : 'highlight'}
                style={{
                  left: r.origin.x * scale,
                  top: r.origin.y * scale,
                  width: r.size.width * scale,
                  height: r.size.height * scale,
                }}
              />
            )),
          )}
        </div>
      )}
      {near && <PageLayers page={page.index} scale={scale} pageWidth={page.size.width} pageHeight={page.size.height} />}
    </div>
  );
});
