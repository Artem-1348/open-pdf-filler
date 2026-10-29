// Everything drawn over a page image: form controls and placed items in Fill
// mode, field boxes in Edit form mode.
import { DraftLayer } from '../builder/DraftLayer';
import { useEditor } from './EditorContext';
import { FieldLayer } from './FieldLayer';
import { ItemLayer } from './ItemLayer';
import { LassoSurface } from './LassoSurface';
import { PlacementSurface } from './PlacementSurface';

interface Props {
  page: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
}

export function PageLayers({ page, scale, pageWidth, pageHeight }: Props) {
  const { state } = useEditor();
  if (state.mode === 'edit') {
    return (
      <>
        {/* Placed items stay visible for reference but can't be touched. */}
        <div className="locked-items" aria-hidden="true">
          <ItemLayer page={page} scale={scale} pageWidth={pageWidth} pageHeight={pageHeight} />
        </div>
        <DraftLayer page={page} scale={scale} pageWidth={pageWidth} pageHeight={pageHeight} />
        {state.lasso && <LassoSurface page={page} scale={scale} />}
      </>
    );
  }
  return (
    <>
      <FieldLayer page={page} scale={scale} />
      <ItemLayer page={page} scale={scale} pageWidth={pageWidth} pageHeight={pageHeight} />
      <PlacementSurface page={page} scale={scale} />
      {state.lasso && <LassoSurface page={page} scale={scale} />}
    </>
  );
}
