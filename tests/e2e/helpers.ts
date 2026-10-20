import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type TestInfo } from '@playwright/test';

export const CORPUS_DIR = fileURLToPath(new URL('../corpus/', import.meta.url));

export interface CorpusEntry {
  file: string;
  expect: 'open' | 'error' | 'password';
  pages?: number;
  error?: 'empty' | 'not-pdf' | 'damaged';
  password?: string;
  rotations?: number[];
  search?: { term: string; matches: number; pages: number[] };
  note?: string;
}

export const corpus: CorpusEntry[] = JSON.parse(
  readFileSync(new URL('../corpus/corpus.json', import.meta.url), 'utf8'),
).files;

export function corpusEntry(file: string): CorpusEntry {
  const entry = corpus.find((e) => e.file === file);
  if (!entry) throw new Error(`${file} is not in corpus.json`);
  return entry;
}

export const corpusPath = (file: string) => CORPUS_DIR + file;

export function isMobile(testInfo: TestInfo): boolean {
  return testInfo.project.name.startsWith('mobile');
}

export async function gotoApp(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('empty-state')).toBeVisible();
}

// Opens a corpus file through the real file picker input.
export async function openCorpusFile(page: Page, file: string) {
  await page.getByTestId('file-input').setInputFiles(corpusPath(file));
}

export async function expectDocumentOpen(page: Page, pages: number) {
  await expect(page.getByTestId('app')).toHaveAttribute('data-doc-pages', String(pages));
  await expect(page.getByTestId('page')).toHaveCount(pages);
  await expectPageRendered(page, 0);
}

// A page counts as rendered once its bitmap has decoded.
export async function expectPageRendered(page: Page, index: number) {
  const img = page.locator(`[data-page-index="${index}"] [data-testid="page-image"]`);
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
}

export async function currentPageNumber(page: Page): Promise<number> {
  return Number(await page.getByTestId('page-input').inputValue());
}
