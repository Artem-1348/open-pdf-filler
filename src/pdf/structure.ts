// Applies the form builder's drafts to a PDF (Phase 3): delete, update and
// create fields, then write the tab order. Part of the writer; uses pdf-lib.
import {
  PDFArray,
  PDFDict,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  PDFTextField,
  PDFWidgetAnnotation,
  degrees,
  rgb,
  type PDFDocument,
  type PDFField,
  type PDFForm,
  type PDFPage,
} from '@cantoo/pdf-lib';
import type { FieldDraft } from '../builder/model';
import { boxCenter, pdfRectToView, viewToPdf, type Box, type PageFrame } from './geometry';
import type { FormFieldInfo } from './model';

// Private keys marking builder metadata other viewers ignore.
export const KIND_KEY = 'OPF_Kind';
export const DATE_FORMAT_KEY = 'OPF_DateFormat';

export interface StructureInput {
  drafts: ReadonlyArray<FieldDraft>;
  originalFields: ReadonlyArray<FormFieldInfo>;
}

export function applyStructure(doc: PDFDocument, input: StructureInput, frames: PageFrame[]): void {
  const form = doc.getForm();
  const pages = doc.getPages();
  const originalByName = new Map(input.originalFields.map((f) => [f.name, f]));
  const widgetPages = widgetPageIndex(doc);

  // Each draft's widget dict once the structure is applied, for tab order.
  const widgetOf = new Map<string, PDFDict>();

  // Group drafts by the PDF field they came from.
  const bySource = new Map<string, FieldDraft[]>();
  for (const d of input.drafts) {
    if (!d.source) continue;
    const list = bySource.get(d.source.name);
    if (list) list.push(d);
    else bySource.set(d.source.name, [d]);
  }

  const recreate: FieldDraft[] = [];

  for (const original of input.originalFields) {
    let field: PDFField;
    try {
      field = form.getField(original.name);
    } catch {
      continue;
    }
    const drafts = bySource.get(original.name) ?? [];
    if (drafts.length === 0) {
      form.removeField(field);
      continue;
    }

    // Renames and changed export values can't be done in place reliably;
    // such fields are removed and created again from their drafts.
    const needsRecreate = drafts.some(
      (d) =>
        d.name !== original.name ||
        d.kind === 'date' !== !!original.isDate ||
        ((d.kind === 'checkbox' || d.kind === 'radio') && d.exportValue !== original.widgets[d.source!.widget]?.exportValue),
    );
    if (needsRecreate) {
      form.removeField(field);
      recreate.push(...drafts.map((d) => ({ ...d, source: undefined })));
      continue;
    }

    // Match each kept draft to its pdf-lib widget by its original position.
    const widgets = field.acroField.getWidgets();
    const kept = new Set<PDFWidgetAnnotation>();
    for (const d of drafts) {
      const originalBox = original.widgets[d.source!.widget]?.box;
      const w = originalBox ? closestWidget(widgets, widgetPages, frames, d.page, originalBox) : undefined;
      if (!w) continue;
      kept.add(w);
      widgetOf.set(d.id, w.dict);
      const r = viewBoxToPdfRect(frames[d.page], d.box);
      w.setRectangle(r);
    }
    // Widgets whose drafts were deleted.
    for (let i = widgets.length - 1; i >= 0; i--) {
      if (kept.has(widgets[i])) continue;
      removeWidgetFromPage(doc, widgets[i].dict, widgetPages);
      field.acroField.removeWidget(i);
    }
    applyProperties(field, drafts[0], form, false);
  }

  // New fields, grouped by name, in draft order.
  const created = [...recreate, ...input.drafts.filter((d) => !d.source)];
  const groups = new Map<string, FieldDraft[]>();
  for (const d of created) {
    const list = groups.get(d.name);
    if (list) list.push(d);
    else groups.set(d.name, [d]);
  }
  for (const [name, drafts] of groups) {
    createField(doc, form, name, drafts, pages, frames, widgetOf, originalByName);
  }

  writeTabOrder(doc, input.drafts, widgetOf);
}

// ---------------------------------------------------------------- update

function applyProperties(field: PDFField, d: FieldDraft, form: PDFForm, isNew: boolean) {
  if (d.required) field.enableRequired();
  else field.disableRequired();
  if (d.readOnly) field.enableReadOnly();
  else field.disableReadOnly();

  const dict = field.acroField.dict;
  if (d.tooltip.trim()) dict.set(PDFName.of('TU'), PDFHexString.fromText(d.tooltip.trim()));
  else dict.delete(PDFName.of('TU'));

  if (field instanceof PDFTextField) {
    if (d.multiline) field.enableMultiline();
    else field.disableMultiline();
    if (d.maxLen && d.maxLen > 0) {
      // pdf-lib refuses a limit shorter than the current text.
      const text = field.getText() ?? '';
      if (text.length > d.maxLen) field.setText(text.slice(0, d.maxLen));
      field.setMaxLength(d.maxLen);
    } else field.removeMaxLength();
    setFontSize(field, d.fontSize);
    if (d.kind === 'date') {
      dict.set(PDFName.of(KIND_KEY), PDFName.of('Date'));
      dict.set(PDFName.of(DATE_FORMAT_KEY), PDFString.of(d.dateFormat));
    }
    form.markFieldAsDirty(field.ref);
  } else if (field instanceof PDFDropdown) {
    const before = field.getSelected();
    field.setOptions(d.options.filter((o) => o.trim()));
    if (before.length && d.options.includes(before[0])) field.select(before[0]);
    if (d.editable) field.enableEditing();
    else field.disableEditing();
    setFontSize(field, d.fontSize);
    form.markFieldAsDirty(field.ref);
  }
  void isNew;
}

function setFontSize(field: PDFTextField | PDFDropdown, size: number) {
  if (size > 0) field.setFontSize(size);
  else {
    // "Auto": pdf-lib's setFontSize(0) is ignored, so write it directly.
    const da = field.acroField.getDefaultAppearance() ?? '0 g /Helv 0 Tf';
    field.acroField.setDefaultAppearance(da.replace(/(-?\d*\.?\d+)\s+Tf/, '0 Tf'));
  }
}

// ---------------------------------------------------------------- create

function createField(
  doc: PDFDocument,
  form: PDFForm,
  name: string,
  drafts: FieldDraft[],
  pages: PDFPage[],
  frames: PageFrame[],
  widgetOf: Map<string, PDFDict>,
  _original: Map<string, FormFieldInfo>,
) {
  const first = drafts[0];
  const look = (d: FieldDraft) => ({
    ...appearanceBox(frames[d.page], d.box, d.border ? 1 : 0),
    borderWidth: d.border ? 1 : 0,
    borderColor: d.border ? rgb(0.45, 0.45, 0.45) : undefined,
    backgroundColor: undefined,
  });
  // The widget pdf-lib just added is the field's last one.
  const lastWidget = (field: PDFField) => {
    const widgets = field.acroField.getWidgets();
    return widgets[widgets.length - 1].dict;
  };

  switch (first.kind) {
    case 'text':
    case 'date': {
      const field = form.createTextField(name);
      for (const d of drafts) {
        field.addToPage(pages[d.page], look(d));
        const widget = lastWidget(field);
        uprightOnPage(widget, doc, frames[d.page]);
        widgetOf.set(d.id, widget);
      }
      applyProperties(field, first, form, true);
      break;
    }
    case 'checkbox': {
      const field = form.createCheckBox(name);
      for (const d of drafts) {
        field.addToPage(pages[d.page], look(d));
        const widget = lastWidget(field);
        uprightOnPage(widget, doc, frames[d.page]);
        renameOnState(widget, d.exportValue || 'Yes');
        widgetOf.set(d.id, widget);
      }
      applyProperties(field, first, form, true);
      form.markFieldAsDirty(field.ref);
      break;
    }
    case 'radio': {
      const field = form.createRadioGroup(name);
      for (const d of drafts) {
        field.addOptionToPage(d.exportValue || `Option ${drafts.indexOf(d) + 1}`, pages[d.page], look(d));
        const widget = lastWidget(field);
        uprightOnPage(widget, doc, frames[d.page]);
        widgetOf.set(d.id, widget);
      }
      applyProperties(field, first, form, true);
      form.markFieldAsDirty(field.ref);
      break;
    }
    case 'dropdown': {
      const field = form.createDropdown(name);
      field.setOptions(first.options.filter((o) => o.trim()));
      for (const d of drafts) {
        field.addToPage(pages[d.page], look(d));
        const widget = lastWidget(field);
        uprightOnPage(widget, doc, frames[d.page]);
        widgetOf.set(d.id, widget);
      }
      applyProperties(field, first, form, true);
      break;
    }
    case 'signature': {
      for (const d of drafts) widgetOf.set(d.id, createSignatureField(doc, form, name, d, pages[d.page], frames[d.page]));
      break;
    }
    case 'list':
    case 'button':
      // Can't be created from the palette; recreating one is not supported.
      break;
  }
}

// A standard, unsigned signature field (/FT /Sig) with one widget (design E6).
function createSignatureField(doc: PDFDocument, form: PDFForm, name: string, d: FieldDraft, page: PDFPage, frame: PageFrame): PDFDict {
  const ctx = doc.context;
  const r = viewBoxToPdfRect(frame, d.box);
  const ap = ctx.formXObject([], { BBox: [0, 0, r.width, r.height] });
  const apRef = ctx.register(ap);
  const dict = ctx.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    T: PDFHexString.fromText(name),
    Rect: [r.x, r.y, r.x + r.width, r.y + r.height],
    F: 4,
    P: page.ref,
    AP: { N: apRef },
  }) as PDFDict;
  if (d.tooltip.trim()) dict.set(PDFName.of('TU'), PDFHexString.fromText(d.tooltip.trim()));
  if (d.required) dict.set(PDFName.of('Ff'), PDFNumber.of(2));
  if (d.border) {
    dict.set(PDFName.of('MK'), ctx.obj({ BC: [0.45, 0.45, 0.45] }));
    dict.set(PDFName.of('BS'), ctx.obj({ W: 1, S: 'S' }));
  }
  const ref = ctx.register(dict);
  page.node.addAnnot(ref);
  form.acroForm.addField(ref);
  // Signature fields need the document's AcroForm to say so for some viewers.
  form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(1));
  return dict;
}

// pdf-lib names a checkbox's on-state "Yes"; use the chosen export value.
function renameOnState(widget: PDFDict, value: string) {
  if (value === 'Yes') return;
  const ap = widget.lookupMaybe(PDFName.of('AP'), PDFDict);
  for (const key of ['N', 'D']) {
    const states = ap?.lookupMaybe(PDFName.of(key), PDFDict);
    const on = states?.get(PDFName.of('Yes'));
    if (states && on) {
      states.set(PDFName.of(value), on);
      states.delete(PDFName.of('Yes'));
    }
  }
  const as = widget.get(PDFName.of('AS'));
  if (as instanceof PDFName && as.decodeText() === 'Yes') widget.set(PDFName.of('AS'), PDFName.of(value));
}

// ---------------------------------------------------------------- tab order

// Writes each page's /Annots so its widgets come in tab order, followed by
// any other annotations in their original order; clears /Tabs (design E3).
function writeTabOrder(doc: PDFDocument, drafts: ReadonlyArray<FieldDraft>, widgetOf: Map<string, PDFDict>) {
  doc.getPages().forEach((page, index) => {
    const annots = page.node.Annots();
    if (!annots) return;
    const refs = annots.asArray();
    const dictToRef = new Map<PDFDict, PDFRef>();
    for (const ref of refs) {
      if (!(ref instanceof PDFRef)) continue;
      const dict = doc.context.lookupMaybe(ref, PDFDict);
      if (dict) dictToRef.set(dict, ref);
    }
    const ordered: PDFRef[] = [];
    for (const d of drafts) {
      if (d.page !== index) continue;
      const dict = widgetOf.get(d.id);
      const ref = dict && dictToRef.get(dict);
      if (ref && !ordered.includes(ref)) ordered.push(ref);
    }
    const rest = refs.filter((r) => !(r instanceof PDFRef) || !ordered.includes(r));
    page.node.set(PDFName.of('Annots'), doc.context.obj([...ordered, ...rest]) as PDFArray);
    page.node.delete(PDFName.of('Tabs'));
  });
}

// ---------------------------------------------------------------- helpers

export function widgetPageIndex(doc: PDFDocument): Map<PDFDict, number> {
  const map = new Map<PDFDict, number>();
  doc.getPages().forEach((page, index) => {
    const annots = page.node.Annots();
    if (!annots) return;
    for (let i = 0; i < annots.size(); i++) {
      const dict = annots.lookupMaybe(i, PDFDict);
      if (dict) map.set(dict, index);
    }
  });
  return map;
}

export function closestWidget(
  widgets: PDFWidgetAnnotation[],
  widgetPages: Map<PDFDict, number>,
  frames: PageFrame[],
  page: number,
  target: Box,
): PDFWidgetAnnotation | undefined {
  const want = boxCenter(target);
  let best: PDFWidgetAnnotation | undefined;
  let bestDistance = Infinity;
  for (const w of widgets) {
    if (widgetPages.get(w.dict) !== page) continue;
    const c = boxCenter(pdfRectToView(frames[page], w.getRectangle()));
    const d = Math.hypot(c.x - want.x, c.y - want.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = w;
    }
  }
  return best;
}

function removeWidgetFromPage(doc: PDFDocument, widget: PDFDict, widgetPages: Map<PDFDict, number>) {
  const index = widgetPages.get(widget);
  if (index === undefined) return;
  const page = doc.getPage(index);
  const annots = page.node.Annots();
  if (!annots) return;
  for (let i = annots.size() - 1; i >= 0; i--) {
    if (annots.lookupMaybe(i, PDFDict) === widget) annots.remove(i);
  }
}

// A view-space box as a PDF rectangle (x, y = bottom-left, unrotated space).
export function viewBoxToPdfRect(frame: PageFrame, box: Box) {
  const a = viewToPdf(frame, { x: box.x, y: box.y });
  const b = viewToPdf(frame, { x: box.x + box.width, y: box.y + box.height });
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

// pdf-lib's addToPage options for a box: the rectangle in PDF space. The
// rotation is set afterwards with /MK /R (see uprightOnPage).
// pdf-lib grows the rectangle by the border width (half on each side);
// compensate so the saved field lands exactly where it was drawn (otherwise
// it creeps on every save).
function appearanceBox(frame: PageFrame, box: Box, borderWidth: number) {
  const r = viewBoxToPdfRect(frame, box);
  const half = borderWidth / 2;
  return {
    x: r.x + half,
    y: r.y + half,
    width: r.width - borderWidth,
    height: r.height - borderWidth,
    rotate: degrees(0),
  };
}

// /MK /R turns the field's content so it reads upright on a rotated page;
// pdf-lib honours it when it regenerates the appearance.
function uprightOnPage(widget: PDFDict, doc: PDFDocument, frame: PageFrame) {
  if (frame.rotation === 0) return;
  PDFWidgetAnnotation.fromDict(widget).getOrCreateAppearanceCharacteristics().setRotation(frame.rotation);
  void doc;
}
