// Glue between the editor and the writer. The writer (and pdf-lib) load only
// when the user first saves, keeping the app's first load small.
import regularFontUrl from '../assets/fonts/NotoSans-Regular.ttf?url';
import italicFontUrl from '../assets/fonts/NotoSans-Italic.ttf?url';
import type { FontFile } from '../pdf/writer';
import type { FieldValue, FormFieldInfo, PlacedItem } from '../pdf/model';
import type { StructureInput } from '../pdf/structure';

export interface SaveInput {
  file: Blob;
  password?: string;
  permissions?: number;
  fields: FormFieldInfo[];
  values: Map<string, FieldValue>;
  items: PlacedItem[];
  flatten: boolean;
  structure?: StructureInput;
}

export async function saveCopy(input: SaveInput): Promise<Uint8Array> {
  const { savePdf } = await import('../pdf/writer');
  return savePdf({
    original: new Uint8Array(await input.file.arrayBuffer()),
    password: input.password,
    permissions: input.permissions,
    fields: input.fields,
    values: input.values,
    items: input.items,
    flatten: input.flatten,
    structure: input.structure,
    loadFont,
  });
}

// Reads field details PDFium doesn't report, such as maximum lengths.
export async function loadFieldExtras(file: Blob, password?: string) {
  const { readFieldExtras } = await import('../pdf/writer');
  return readFieldExtras(new Uint8Array(await file.arrayBuffer()), password);
}

async function loadFont(file: FontFile): Promise<Uint8Array> {
  const res = await fetch(file === 'italic' ? italicFontUrl : regularFontUrl);
  return new Uint8Array(await res.arrayBuffer());
}

export async function isSaveError(e: unknown): Promise<{ characters: string[] } | null> {
  const { SaveError } = await import('../pdf/writer');
  return e instanceof SaveError && e.kind === 'unsupported-characters' ? { characters: e.characters } : null;
}

// Hands the bytes to the browser as a download. On iPhone this opens the
// share/save sheet; elsewhere it lands in the Downloads folder.
export function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before releasing the bytes.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
