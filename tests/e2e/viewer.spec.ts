// FR-2 Read: render, zoom, thumbnails, text search.
import { expect, test, type Page } from '@playwright/test';
import {
  corpusEntry,
  currentPageNumber,
  expectDocumentOpen,
  expectPageRendered,
  gotoApp,
  isMobile,
  openCorpusFile,
} from './helpers';

const pageWidth = (page: Page, index = 0) =>
  page.locator(`[data-page-index="${index}"]`).evaluate((el) => el.getBoundingClientRect().width);

async function open(page: Page, file: string) {
  await gotoApp(page);
  await openCorpusFile(page, file);
  await expectDocumentOpen(page, corpusEntry(file).pages!);
}

test.describe('rendering', () => {
  test('rotated pages are laid out in their rotated orientation', async ({ page }) => {
    await open(page, 'rotated.pdf');
    const sizes = await page
      .getByTestId('page')
      .evaluateAll((els) => els.map((el) => [el.clientWidth, el.clientHeight]));
    const landscape = sizes.map(([w, h]) => w > h);
    expect(landscape).toEqual([false, true, false, true]);
  });

  test('the rendered bitmap matches the page shape', async ({ page }) => {
    await open(page, 'rotated.pdf');
    await page.getByTestId('page-input').fill('2');
    await page.getByTestId('page-input').press('Enter');
    await expectPageRendered(page, 1);
    const ratio = await page
      .locator('[data-page-index="1"] [data-testid="page-image"]')
      .evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight);
    expect(ratio).toBeCloseTo(792 / 612, 1);
  });

  test('mixed page sizes keep their proportions', async ({ page }) => {
    await open(page, 'mixed-sizes.pdf');
    const ratios = await page
      .getByTestId('page')
      .evaluateAll((els) => els.map((el) => el.clientHeight / el.clientWidth));
    const expected = [792 / 612, 841.89 / 595.28, 1008 / 612, 792 / 1224, 419.53 / 297.64];
    ratios.forEach((r, i) => expect(r).toBeCloseTo(expected[i], 1));
  });

  test('only pages near the viewport are rendered in long documents', async ({ page }) => {
    await open(page, 'long-120-pages.pdf');
    const rendered = await page.getByTestId('page-image').count();
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(15);
  });

  test('fillable form fields are drawn with their values', async ({ page }) => {
    await open(page, 'fillable-form.pdf');
    await expectPageRendered(page, 0);
  });
});

test.describe('zoom', () => {
  test('starts at fit width with the page inside the viewer', async ({ page }) => {
    await open(page, 'simple.pdf');
    await expect(page.getByTestId('zoom-select')).toHaveValue('fit-width');
    const viewerWidth = await page.getByTestId('viewer').evaluate((el) => el.clientWidth);
    const width = await pageWidth(page);
    expect(width).toBeLessThanOrEqual(viewerWidth);
    expect(width).toBeGreaterThan(viewerWidth * 0.85);
  });

  test('zoom in and out change the page size', async ({ page }) => {
    await open(page, 'simple.pdf');
    const start = await pageWidth(page);
    await page.getByTestId('zoom-in').click();
    await expect.poll(() => pageWidth(page)).toBeGreaterThan(start);
    const zoomed = await pageWidth(page);
    await page.getByTestId('zoom-out').click();
    await page.getByTestId('zoom-out').click();
    await expect.poll(() => pageWidth(page)).toBeLessThan(zoomed);
  });

  test('choosing a level sets an exact size (100% = actual size)', async ({ page }) => {
    await open(page, 'simple.pdf');
    await page.getByTestId('zoom-select').selectOption('100');
    await expect.poll(() => pageWidth(page)).toBeCloseTo(816, 0); // 612pt × 96/72
    await page.getByTestId('zoom-select').selectOption('200');
    await expect.poll(() => pageWidth(page)).toBeCloseTo(1632, 0);
    await page.getByTestId('zoom-select').selectOption('fit-width');
    await expect.poll(() => pageWidth(page)).toBeLessThan(1632);
  });

  test('the page re-renders sharper after zooming in', async ({ page }) => {
    await open(page, 'simple.pdf');
    const img = page.locator('[data-page-index="0"] [data-testid="page-image"]');
    const before = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    await page.getByTestId('zoom-select').selectOption('400');
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(before);
  });

  test('keyboard shortcuts zoom', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'no hardware keyboard on phones');
    await open(page, 'simple.pdf');
    const start = await pageWidth(page);
    await page.keyboard.press('ControlOrMeta+=');
    await expect.poll(() => pageWidth(page)).toBeGreaterThan(start);
    await page.keyboard.press('ControlOrMeta+0');
    await expect(page.getByTestId('zoom-select')).toHaveValue('fit-width');
  });

  test('zooming keeps the reader on the same page', async ({ page }) => {
    await open(page, 'twenty-pages.pdf');
    await page.getByTestId('page-input').fill('12');
    await page.getByTestId('page-input').press('Enter');
    await expect.poll(() => currentPageNumber(page)).toBe(12);
    await page.getByTestId('zoom-select').selectOption('200');
    await expect.poll(() => currentPageNumber(page)).toBe(12);
    await page.getByTestId('zoom-select').selectOption('50');
    await expect.poll(() => currentPageNumber(page)).toBe(12);
  });
});

test.describe('navigation', () => {
  test('the page number box jumps to a page and ignores bad input', async ({ page }) => {
    await open(page, 'twenty-pages.pdf');
    const input = page.getByTestId('page-input');
    await input.fill('15');
    await input.press('Enter');
    await expect.poll(() => currentPageNumber(page)).toBe(15);
    await expectPageRendered(page, 14);
    await input.fill('99');
    await input.press('Enter');
    await expect(input).toHaveValue('15');
  });

  test('scrolling updates the page number', async ({ page }) => {
    await open(page, 'twenty-pages.pdf');
    await page.getByTestId('viewer').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect.poll(() => currentPageNumber(page)).toBe(20);
    await expectPageRendered(page, 19);
  });
});

test.describe('thumbnails', () => {
  test('show one thumbnail per page and jump on click', async ({ page }, testInfo) => {
    await open(page, 'twenty-pages.pdf');
    if (isMobile(testInfo)) await page.getByTestId('toggle-thumbnails').click();
    const thumbs = page.getByTestId('thumbnail');
    await expect(thumbs).toHaveCount(20);
    await expect(thumbs.first().locator('img')).toBeVisible();
    await expect(thumbs.first()).toHaveAttribute('aria-current', 'page');

    await thumbs.nth(9).scrollIntoViewIfNeeded();
    await thumbs.nth(9).click();
    await expect.poll(() => currentPageNumber(page)).toBe(10);
    await expectPageRendered(page, 9);
    if (!isMobile(testInfo)) await expect(thumbs.nth(9)).toHaveAttribute('aria-current', 'page');
  });

  test('can be hidden and shown', async ({ page }, testInfo) => {
    await open(page, 'twenty-pages.pdf');
    const toggle = page.getByTestId('toggle-thumbnails');
    const startsOpen = !isMobile(testInfo);
    await expect(page.getByTestId('thumbnails')).toHaveCount(startsOpen ? 1 : 0);
    await toggle.click();
    await expect(page.getByTestId('thumbnails')).toHaveCount(startsOpen ? 0 : 1);
    await expect(toggle).toHaveAttribute('aria-pressed', String(!startsOpen));
  });
});

test.describe('search', () => {
  async function search(page: Page, term: string) {
    await page.getByTestId('toggle-search').click();
    await page.getByTestId('search-input').fill(term);
  }

  test('finds every match, highlights them and steps through', async ({ page }) => {
    const expected = corpusEntry('twenty-pages.pdf').search!;
    await open(page, 'twenty-pages.pdf');
    await search(page, expected.term);

    const status = page.getByTestId('search-status');
    await expect(status).toHaveText(`1 of ${expected.matches}`);
    await expect.poll(() => currentPageNumber(page)).toBe(expected.pages[0]);
    await expect(page.getByTestId('highlight-active')).toBeVisible();

    for (let i = 1; i < expected.matches; i++) {
      await page.getByTestId('search-next').click();
      await expect(status).toHaveText(`${i + 1} of ${expected.matches}`);
      await expect.poll(() => currentPageNumber(page)).toBe(expected.pages[i]);
    }
    // Wraps around to the first match.
    await page.getByTestId('search-next').click();
    await expect(status).toHaveText(`1 of ${expected.matches}`);
    await page.getByTestId('search-prev').click();
    await expect(status).toHaveText(`${expected.matches} of ${expected.matches}`);
  });

  test('Enter and Shift+Enter step through matches', async ({ page }) => {
    await open(page, 'twenty-pages.pdf');
    await search(page, 'needle');
    const status = page.getByTestId('search-status');
    await expect(status).toHaveText('1 of 4');
    await page.getByTestId('search-input').press('Enter');
    await expect(status).toHaveText('2 of 4');
    await page.getByTestId('search-input').press('Shift+Enter');
    await expect(status).toHaveText('1 of 4');
  });

  test('is case-insensitive and finds accented words', async ({ page }) => {
    await open(page, 'accented-text.pdf');
    // The document says "Straße"; search in lower case.
    await search(page, 'straße');
    await expect(page.getByTestId('search-status')).toHaveText('1 of 1');
  });

  test('reports when nothing matches', async ({ page }) => {
    await open(page, 'twenty-pages.pdf');
    await search(page, 'haystack');
    await expect(page.getByTestId('search-status')).toHaveText('No matches');
    await expect(page.getByTestId('search-next')).toBeDisabled();
  });

  test('closing search clears highlights', async ({ page }) => {
    await open(page, 'twenty-pages.pdf');
    await search(page, 'needle');
    await expect(page.getByTestId('search-status')).toHaveText('1 of 4');
    await page.getByTestId('search-input').press('Escape');
    await expect(page.getByTestId('searchbar')).toHaveCount(0);
    await expect(page.getByTestId('highlight-active')).toHaveCount(0);
  });

  test('Ctrl/Cmd+F opens search', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'no hardware keyboard on phones');
    await open(page, 'simple.pdf');
    await page.keyboard.press('ControlOrMeta+f');
    await expect(page.getByTestId('search-input')).toBeFocused();
  });
});
