// The only module that writes PDF files (roadmap risk: keep all writing behind
// one module so the library can be swapped). Uses @cantoo/pdf-lib.
import fontkit from '@cantoo/fontkit';
import {
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb,
  type PDFField,
  type PDFFont,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { checkTexts } from './charset';
import {
  boxCenter,
  normalizeRotation,
  pdfRectToView,
  uprightRotation,
  viewToPdf,
  type Box,
  type PageFrame,
} from './geometry';
import { BASELINE_RATIO, TEXT_LINE_HEIGHT, TEXT_PADDING, autoFieldFontSize } from './layout';
import { textsIn, type FieldValue, type FormFieldInfo, type PlacedItem } from './model';

export type FontFile = 'regular' | 'italic';

export interface SaveRequest {
  original: Uint8Array;
  password?: string;
  // The original's permission bits (PDF /P), kept when re-encrypting.
  permissions?: number;
  fields: ReadonlyArray<FormFieldInfo>;
  // Only fields whose value the user changed.
  values: ReadonlyMap<string, FieldValue>;
  items: ReadonlyArray<PlacedItem>;
  flatten: boolean;
  loadFont(file: FontFile): Promise<Uint8Array>;
}

export class SaveError extends Error {
  readonly kind: 'unsupported-characters' | 'failed';
  readonly characters: string[];
  constructor(kind: SaveError['kind'], message: string, characters: string[] = []) {
    super(message);
    this.kind = kind;
    this.characters = characters;
  }
}


const CHECK_PATH = 'M4 12.5 L9.5 18 L20 6';
const CROSS_PATH = 'M6 6 L18 18 M18 6 L6 18';

export async function savePdf(req: SaveRequest): Promise<Uint8Array> {
  const charset = checkTexts(textsIn(req.values.values(), req.items));
  if (charset.unsupported.length) {
    throw new SaveError(
      'unsupported-characters',
      'Some characters can’t be saved yet',
      charset.unsupported,
    );
  }

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(req.original, {
      password: req.password,
      updateMetadata: false,
      ignoreEncryption: false,
      preserveXFA: true,
    });
  } catch (e) {
    throw new SaveError('failed', `Couldn't read the original file: ${(e as Error).message}`);
  }
  doc.registerFontkit(fontkit);
  removeXfa(doc);

  const fonts = new FontSet(doc, req, charset.need === 'noto');
  const pages = doc.getPages();
  const frames = pages.map(frameOf);

  await fillFields(doc, req, frames, fonts);
  for (const item of req.items) {
    const page = pages[item.page];
    if (page) await drawItem(page, frames[item.page], item, fonts);
  }

  const form = doc.getForm();
  if (req.flatten) {
    form.flatten({ updateFieldAppearances: false });
  }

  if (req.password) {
    // Keep the saved copy protected with the same open password (design D6).
    doc.encrypt({
      userPassword: req.password,
      ownerPassword: randomPassword(),
      permissions: permissionsFromBits(req.permissions),
    });
  }

  // Appearances were generated above with the right font; pdf-lib's default
  // pass would redo them in Helvetica and bake "auto" font sizes into them.
  return doc.save({ updateFieldAppearances: false });
}

// ---------------------------------------------------------------- fields

async function fillFields(doc: PDFDocument, req: SaveRequest, frames: PageFrame[], fonts: FontSet) {
  if (req.values.size === 0) return;
  const form = doc.getForm();
  const widgetPages = widgetPageIndex(doc);
  let textChanged = false;

  for (const [name, value] of req.values) {
    const info = req.fields.find((f) => f.name === name);
    if (!info || info.readOnly) continue;
    let field: PDFField;
    try {
      field = form.getField(name);
    } catch {
      continue;
    }

    switch (value.kind) {
      case 'text': {
        const textField = form.getTextField(name);
        // The editor enforces the limit; this only guards against pdf-lib
        // refusing the whole save over one over-long value.
        const max = textField.getMaxLength();
        textField.setText(max !== undefined ? value.text.slice(0, max) : value.text);
        if (isAutoSize(textField)) textField.setFontSize(autoSizeFor(info));
        textChanged = true;
        break;
      }
      case 'choice':
        if (info.kind === 'combo') {
          const dropdown = form.getDropdown(name);
          if (value.selected.length) dropdown.select(value.selected[0], info.editableCombo);
          else dropdown.clear();
          if (isAutoSize(dropdown)) dropdown.setFontSize(autoSizeFor(info));
        } else {
          const list = form.getOptionList(name);
          if (value.selected.length) list.select(value.selected);
          else list.clear();
          if (isAutoSize(list)) list.setFontSize(Math.min(autoSizeFor(info), 11));
        }
        textChanged = true;
        break;
      case 'toggle':
        setToggle(field, info, value.on, widgetPages, frames);
        break;
    }
  }

  if (textChanged) {
    // Appearance streams make values visible in viewers that don't draw
    // fields themselves, like Preview and iOS (design D1).
    form.updateFieldAppearances(await fonts.forFields());
  }
}

// The font size in a field's default appearance ("/Helv 12 Tf"); 0 = auto.
export function daFontSize(field: PDFField): number | undefined {
  const da = field.acroField.getDefaultAppearance();
  const match = da?.match(/(-?\d*\.?\d+)\s+Tf/);
  return match ? Number(match[1]) : undefined;
}

const isAutoSize = (field: PDFField) => (daFontSize(field) ?? 0) === 0;

// Auto-sized fields get the same size the editor showed (see layout.ts).
function autoSizeFor(info: FormFieldInfo): number {
  const heights = info.widgets.map((w) => w.box.height);
  const height = info.kind === 'list' || info.multiline ? 18 : Math.min(...heights);
  return autoFieldFontSize(height);
}

// Checkbox and radio: turn on exactly one widget (or none). The widget is
// matched by page and position, since PDFium and pdf-lib may list a field's
// widgets in different orders.
function setToggle(
  field: PDFField,
  info: FormFieldInfo,
  onIndex: number,
  widgetPages: Map<PDFDict, number>,
  frames: PageFrame[],
) {
  const target = info.widgets[onIndex];
  const widgets = field.acroField.getWidgets();
  let chosen: PDFDict | null = null;

  if (target) {
    const want = boxCenter(target.box);
    let best = Infinity;
    for (const w of widgets) {
      const page = widgetPages.get(w.dict);
      if (page !== target.page) continue;
      const box = pdfRectToView(frames[page], w.getRectangle());
      const c = boxCenter(box);
      const d = Math.hypot(c.x - want.x, c.y - want.y);
      if (d < best) {
        best = d;
        chosen = w.dict;
      }
    }
  }

  let onValue: PDFName | undefined;
  for (const w of widgets) {
    const isOn = w.dict === chosen;
    const value = w.getOnValue();
    if (isOn && value) onValue = value;
    w.setAppearanceState(isOn && value ? value : PDFName.of('Off'));
  }
  field.acroField.dict.set(PDFName.of('V'), onValue ?? PDFName.of('Off'));
}

function widgetPageIndex(doc: PDFDocument): Map<PDFDict, number> {
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

// ---------------------------------------------------------------- placed items

async function drawItem(page: PDFPage, frame: PageFrame, item: PlacedItem, fonts: FontSet) {
  const rotate = degrees(uprightRotation(frame));
  const ink = rgb(0.05, 0.05, 0.1);
  const { box } = item;

  switch (item.kind) {
    case 'text':
    case 'date': {
      const text = item.text ?? '';
      if (!text.trim()) return;
      const font = await fonts.forText(text, 'regular');
      const size = item.fontSize ?? 12;
      drawLines(page, frame, text, box, font, size, ink, rotate);
      break;
    }
    case 'check':
    case 'cross': {
      const origin = viewToPdf(frame, { x: box.x, y: box.y });
      const scale = Math.min(box.width, box.height) / 24;
      page.drawSvgPath(item.kind === 'check' ? CHECK_PATH : CROSS_PATH, {
        x: origin.x,
        y: origin.y,
        scale,
        rotate,
        borderColor: ink,
        // pdf-lib scales the stroke along with the path.
        borderWidth: 2.6,
        borderLineCap: 1, // round
      });
      break;
    }
    case 'signature': {
      const sig = item.signature;
      if (!sig) return;
      if (sig.type === 'drawn') {
        const image = await page.doc.embedPng(sig.png);
        const bottomLeft = viewToPdf(frame, { x: box.x, y: box.y + box.height });
        page.drawImage(image, {
          x: bottomLeft.x,
          y: bottomLeft.y,
          width: box.width,
          height: box.height,
          rotate,
        });
      } else {
        const font = await fonts.forText(sig.text, 'italic');
        const size = item.fontSize ?? box.height * 0.6;
        drawLines(page, frame, sig.text, box, font, size, ink, rotate);
      }
      break;
    }
  }
}

function drawLines(
  page: PDFPage,
  frame: PageFrame,
  text: string,
  box: Box,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  rotate: ReturnType<typeof degrees>,
) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, i) => {
    if (!line) return;
    const baseline = viewToPdf(frame, {
      x: box.x + TEXT_PADDING,
      y: box.y + TEXT_PADDING + i * TEXT_LINE_HEIGHT * size + BASELINE_RATIO * size,
    });
    page.drawText(line, { x: baseline.x, y: baseline.y, size, font, color, rotate });
  });
}

// ---------------------------------------------------------------- fonts

class FontSet {
  private cache = new Map<string, Promise<PDFFont>>();
  private doc: PDFDocument;
  private req: SaveRequest;
  private needNoto: boolean;

  constructor(doc: PDFDocument, req: SaveRequest, needNoto: boolean) {
    this.doc = doc;
    this.req = req;
    this.needNoto = needNoto;
  }

  // Fields share one font for their appearances.
  forFields(): Promise<PDFFont> {
    return this.needNoto ? this.noto('regular') : this.standard(StandardFonts.Helvetica);
  }

  forText(text: string, style: FontFile): Promise<PDFFont> {
    const needs = checkTexts([text]).need === 'noto';
    if (needs) return this.noto(style);
    return this.standard(style === 'italic' ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica);
  }

  private standard(name: StandardFonts): Promise<PDFFont> {
    return this.memo(name, () => this.doc.embedFont(name));
  }

  private noto(style: FontFile): Promise<PDFFont> {
    return this.memo(`noto-${style}`, async () =>
      this.doc.embedFont(await this.req.loadFont(style), { subset: true }),
    );
  }

  private memo(key: string, make: () => Promise<PDFFont>): Promise<PDFFont> {
    let font = this.cache.get(key);
    if (!font) {
      font = make();
      this.cache.set(key, font);
    }
    return font;
  }
}

// ---------------------------------------------------------------- helpers

// Acrobat shows XFA data in preference to the form fields, so stale XFA would
// hide the values we write (design D4). Removed here rather than by pdf-lib's
// loader, which logs a warning to the console.
function removeXfa(doc: PDFDocument) {
  const acroForm = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  acroForm?.delete(PDFName.of('XFA'));
}

function frameOf(page: PDFPage): PageFrame {
  const box = page.getCropBox();
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rotation: normalizeRotation(page.getRotation().angle),
  };
}

// PDF permission bits (ISO 32000 table 22) to pdf-lib's options. Unknown or
// unencrypted (-1) means everything is allowed.
function permissionsFromBits(bits: number | undefined) {
  const all = bits === undefined || bits === -1 || bits >>> 0 === 0xffffffff;
  const has = (bit: number) => all || ((bits! >>> 0) & bit) !== 0;
  return {
    printing: has(4) ? (has(2048) ? ('highResolution' as const) : ('lowResolution' as const)) : false,
    modifying: has(8),
    copying: has(16),
    annotating: has(32),
    fillingForms: has(256),
    contentAccessibility: has(512),
    documentAssembly: has(1024),
  };
}

// Field details PDFium doesn't report (currently the maximum text length).
export interface FieldExtras {
  maxLen?: number;
  // From the default appearance; 0 = auto. PDFium reports a computed size.
  fontSize?: number;
}

export async function readFieldExtras(original: Uint8Array, password?: string): Promise<Map<string, FieldExtras>> {
  const doc = await PDFDocument.load(original, { password, updateMetadata: false, preserveXFA: true });
  const out = new Map<string, FieldExtras>();
  for (const field of doc.getForm().getFields()) {
    const extras: FieldExtras = {};
    if (field instanceof PDFTextField) {
      const maxLen = field.getMaxLength();
      if (maxLen !== undefined) extras.maxLen = maxLen;
    }
    if (field instanceof PDFTextField || field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const size = daFontSize(field);
      if (size !== undefined) extras.fontSize = size;
    }
    if (extras.maxLen !== undefined || extras.fontSize !== undefined) out.set(field.getName(), extras);
  }
  return out;
}

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
