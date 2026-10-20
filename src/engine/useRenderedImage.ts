import { useEffect, useRef, useState } from 'react';
import { PdfErrorCode } from '@embedpdf/models';
import { getEngine, type PdfDocumentObject, type PdfPageObject } from './engine';

interface RenderRequest {
  doc: PdfDocumentObject;
  page: PdfPageObject;
  scaleFactor: number;
  dpr: number;
  // Only pages near the viewport are rendered; others release their bitmap.
  active: boolean;
  thumbnail?: boolean;
}

// Renders a page to an object URL. While a re-render at a new zoom is in
// flight, the previous image stays on screen (stretched) instead of blanking.
export function useRenderedImage({
  doc,
  page,
  scaleFactor,
  dpr,
  active,
  thumbnail = false,
}: RenderRequest): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    const show = (next: string | null) => {
      const prev = shownRef.current;
      shownRef.current = next;
      setUrl(next);
      if (prev && prev !== next) URL.revokeObjectURL(prev);
    };

    if (!active) {
      show(null);
      return;
    }

    let cancelled = false;
    let abort: (() => void) | null = null;

    void getEngine().then((engine) => {
      if (cancelled) return;
      const task = thumbnail
        ? engine.renderThumbnail(doc, page, { scaleFactor, dpr })
        : engine.renderPage(doc, page, { scaleFactor, dpr, withAnnotations: true, withForms: true });
      abort = () => task.abort({ code: PdfErrorCode.Cancelled, message: 'superseded' });
      task.wait(
        (blob) => {
          if (!cancelled) show(URL.createObjectURL(blob));
        },
        () => {
          // Cancelled or failed renders leave the previous image in place.
        },
      );
    });

    return () => {
      cancelled = true;
      abort?.();
    };
  }, [doc, page, scaleFactor, dpr, active, thumbnail]);

  useEffect(
    () => () => {
      if (shownRef.current) URL.revokeObjectURL(shownRef.current);
      shownRef.current = null;
    },
    [],
  );

  return url;
}
