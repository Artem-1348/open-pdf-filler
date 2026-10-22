// Phase 4 (FR-6, FR-7): find fields automatically, review them, keep the
// good ones, and fill them.
import { expect, test, type Page } from '@playwright/test';
import { expectDocumentOpen, gotoApp } from './helpers';

const DIR = 'tests/corpus/detect/';

async function detect(page: Page, file: string) {
  await gotoApp(page);
  await page.getByTestId('file-input').setInputFiles(DIR + file);
  await expectDocumentOpen(page, 1);
  await page.getByTestId('mode-edit').click();
  await page.getByTestId('detect-button').click();
  await expect(page.getByTestId('notice')).toContainText('Found', { timeout: 30_000 });
}

async function openPanel(page: Page) {
  const toggle = page.locator('.props-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

test('rebuilds the fields of a form that was flattened by "Print → Save as PDF"', async ({ page }) => {
  await detect(page, 'flattened-fillable-form.pdf');
  await openPanel(page);
  await expect(page.getByTestId('suggestion-count')).toHaveText('5');
  await page.getByTestId('accept-all').click();
  await expect(page.getByTestId('suggestion')).toHaveCount(0);
  await expect(page.getByTestId('draft')).toHaveCount(5);
});

test('finds fields on a flat form, names them from labels, and they can be filled and saved', async ({ page }, testInfo) => {
  await detect(page, 'flat-drawn-form.pdf');
  await openPanel(page);
  const count = Number(await page.getByTestId('suggestion-count').textContent());
  expect(count).toBeGreaterThanOrEqual(22);
  await expect(page.locator('[data-draft="Full name"]')).toHaveCount(1);
  await expect(page.locator('[data-draft="Signature"][data-kind="signature"]')).toHaveCount(1);
  await expect(page.locator('[data-draft="Date"][data-kind="date"]')).toHaveCount(1);

  await page.getByTestId('accept-all').click();
  await page.getByTestId('mode-fill').click();
  await page.locator('[data-field="Full name"]').fill('Ada Lovelace');
  await page.locator('[data-field="Yes"]').click();
  await page.getByTestId('save-button').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('save-confirm').click();
  const d = await download;
  const path = testInfo.outputPath('detected.pdf');
  await d.saveAs(path);

  await page.getByTestId('file-input').setInputFiles(path);
  await expect(page.getByTestId('status')).toContainText('form fields');
  await expect(page.locator('[data-field="Full name"]')).toHaveValue('Ada Lovelace');
  await expect(page.locator('[data-field="Yes"]')).toHaveAttribute('aria-checked', 'true');
});

test('works on a scan with no text layer', async ({ page }) => {
  await detect(page, 'flat-drawn-scan.pdf');
  await openPanel(page);
  expect(Number(await page.getByTestId('suggestion-count').textContent())).toBeGreaterThanOrEqual(22);
});

test('suggestions can be reviewed one at a time, filtered, or rejected', async ({ page }) => {
  await detect(page, 'flat-drawn-form.pdf');
  await openPanel(page);
  const total = Number(await page.getByTestId('suggestion-count').textContent());

  // Change one suggestion's type, then accept just that one.
  await page.locator('[data-draft="Full name"]').click();
  await expect(page.getByTestId('suggestion-props')).toBeVisible();
  await page.getByTestId('suggestion-kind').selectOption('date');
  await page.getByTestId('accept-suggestion').click();
  await expect(page.locator('[data-testid="draft"][data-draft="Full name"]')).toHaveAttribute('data-kind', 'date');

  // Reject one.
  await page.locator('[data-draft="Email"]').click();
  await page.getByTestId('reject-suggestion').click();
  await expect(page.locator('[data-draft="Email"]')).toHaveCount(0);

  // The confidence filter hides the less certain ones.
  await page.locator('[data-page-index="0"] [data-testid="draft-layer"]').click({ position: { x: 3, y: 3 } });
  await openPanel(page);
  await page.getByTestId('confidence-slider').fill('80');
  const shown = Number(await page.getByTestId('suggestion-count').textContent());
  expect(shown).toBeLessThan(total - 2);

  // Undo brings back the rejected one; Reject all clears the rest.
  await page.getByTestId('undo').click();
  await page.getByTestId('reject-all').click();
  await expect(page.getByTestId('suggestion')).toHaveCount(0);
  await expect(page.getByTestId('draft')).toHaveCount(1);
});

test('a miss can be added by hand in two taps', async ({ page }) => {
  await detect(page, 'flat-drawn-form.pdf');
  await page.getByTestId('field-tool-text').click(); // tap 1
  const layer = page.locator('[data-page-index="0"] [data-testid="draft-layer"]');
  const b = (await layer.boundingBox())!;
  await layer.click({ position: { x: b.width * 0.8, y: b.height * 0.92 } }); // tap 2
  await expect(page.getByTestId('draft')).toHaveCount(1);
});
