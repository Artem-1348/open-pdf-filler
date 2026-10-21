// Phase 1 "phone layout": runs on the mobile-chrome and mobile-safari projects.
import { expect, test } from '@playwright/test';
import { currentPageNumber, expectDocumentOpen, gotoApp, isMobile, openCorpusFile } from './helpers';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'phone layout checks');
  await gotoApp(page);
});

const noHorizontalOverflow = () =>
  document.documentElement.scrollWidth <= window.innerWidth &&
  document.body.scrollWidth <= window.innerWidth;

test('empty state fits the screen', async ({ page }) => {
  expect(await page.evaluate(noHorizontalOverflow)).toBe(true);
  const card = await page.locator('.empty-card').boundingBox();
  const width = page.viewportSize()!.width;
  expect(card!.x).toBeGreaterThanOrEqual(0);
  expect(card!.x + card!.width).toBeLessThanOrEqual(width);
});

test('a page fills the width without sideways scrolling', async ({ page }) => {
  await openCorpusFile(page, 'simple.pdf');
  await expectDocumentOpen(page, 1);
  expect(await page.evaluate(noHorizontalOverflow)).toBe(true);
  const viewer = page.getByTestId('viewer');
  const scrolls = await viewer.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrolls).toBe(false);
  const box = await page.locator('[data-page-index="0"]').boundingBox();
  expect(box!.width).toBeGreaterThan(page.viewportSize()!.width * 0.85);
});

test('toolbar controls fit on one screen width and are big enough to tap', async ({ page }) => {
  await openCorpusFile(page, 'twenty-pages.pdf');
  await expectDocumentOpen(page, 20);
  const width = page.viewportSize()!.width;
  for (const id of ['tool-text', 'tool-date', 'tool-check', 'tool-cross', 'tool-sign', 'save-button', 'open-button', 'toggle-thumbnails', 'close-button', 'page-input', 'zoom-out', 'zoom-in', 'toggle-search']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.x + box!.width, id).toBeLessThanOrEqual(width);
    expect(box!.height, id).toBeGreaterThanOrEqual(32);
  }
});

test('thumbnails start hidden and close after picking a page', async ({ page }) => {
  await openCorpusFile(page, 'twenty-pages.pdf');
  await expectDocumentOpen(page, 20);
  await expect(page.getByTestId('thumbnails')).toHaveCount(0);
  await page.getByTestId('toggle-thumbnails').click();
  await expect(page.getByTestId('thumbnails')).toBeVisible();
  await page.getByTestId('thumbnail').nth(4).click();
  await expect(page.getByTestId('thumbnails')).toHaveCount(0);
  await expect.poll(() => currentPageNumber(page)).toBe(5);
});

test('password dialog fits the screen', async ({ page }) => {
  await openCorpusFile(page, 'password-protected.pdf');
  const dialog = page.getByTestId('password-dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
