import { PdfErrorCode } from '@embedpdf/models';

export type OpenErrorKind =
  | 'empty'
  | 'not-pdf'
  | 'damaged'
  | 'password-required'
  | 'unsupported-security'
  | 'engine'
  | 'unknown';

export class OpenError extends Error {
  readonly kind: OpenErrorKind;
  constructor(kind: OpenErrorKind, detail?: string) {
    super(detail ?? kind);
    this.kind = kind;
  }
}

// PDFium reports a missing and a wrong password with the same code.
export function kindFromPdfiumCode(code: number | undefined): OpenErrorKind {
  switch (code) {
    case PdfErrorCode.Password:
      return 'password-required';
    case PdfErrorCode.Security:
      return 'unsupported-security';
    case PdfErrorCode.WrongFormat:
    case PdfErrorCode.NotFound:
    case PdfErrorCode.PageError:
      return 'damaged';
    case PdfErrorCode.Initialization:
    case PdfErrorCode.NotReady:
      return 'engine';
    default:
      return 'unknown';
  }
}

export function openErrorMessage(kind: OpenErrorKind, fileName: string): string {
  const name = `“${fileName}”`;
  switch (kind) {
    case 'empty':
      return `${name} is empty (0 bytes). Check that it finished downloading, then try again.`;
    case 'not-pdf':
      return `${name} isn't a PDF file, so it can't be opened here. Choose a PDF and try again.`;
    case 'damaged':
      return `${name} looks damaged and can't be opened. Try downloading it again, or ask the sender for a new copy.`;
    case 'password-required':
      return `${name} is password-protected.`;
    case 'unsupported-security':
      return `${name} uses a kind of protection this app can't open.`;
    case 'engine':
      return `The PDF engine couldn't start in this browser. Reload the page, or try an up-to-date Chrome, Edge, Firefox or Safari.`;
    case 'unknown':
      return `Something went wrong opening ${name}. Try again, or try a different file.`;
  }
}
