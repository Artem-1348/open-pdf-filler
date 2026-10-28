// Feedback from the project owner's iPhone test (Phase 4 sign-off):
// confirming suggestions on the page, one-tap checkboxes with the right mark,
// and typing through an input bar on phones.
import { expect, test, type Page } from '@playwright/test';
import { expectDocumentOpen, gotoApp, openCorpusFile, usesInputBar } from './helpers';

const field = (page: Page, name: string, widget = 0) => page.locator(`[data-field="${name}"]`).nth(widget);
const W9_NAME = 'topmostSubform[0].Page1[0].f1_01[0]';
const W9_BUSINESS = 'topmostSubform[0].Page1[0].f1_02[0]';
const W9_SCORP = 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[2]';

test.describe('phone input bar', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    test.skip(!(await usesInputBar(page)), 'phones and tablets only');
    await openCorpusFile(page, 'irs-w9-2024-03.pdf');
    await expectDocumentOpen(page, 6);
  });

  test('tapping a text field opens a large input above the keyboard, with the printed label', async ({ page }) => {
    await field(page, W9_NAME).click();
    const bar = page.getByTestId('field-input-bar');
    await expect(bar).toBeVisible();
    // The W-9's fields have no names of their own; the label comes from the page.
    await expect(page.getByTestId('field-input-label')).toContainText('Name of entity');
    // 16px or more stops iPhone Safari from zooming the page.
    const fontSize = await page.getByTestId('field-input').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
    await page.getByTestId('field-input').fill('Jane Example');
    // The box on the page shows the text as it's typed.
    await expect(field(page, W9_NAME)).toHaveText('Jane Example');
  });

  test('Next and Previous walk the fields in order; Done closes the bar', async ({ page }) => {
    await field(page, W9_NAME).click();
    await page.getByTestId('field-next').click();
    await page.getByTestId('field-input').fill('Example LLC');
    await expect(field(page, W9_BUSINESS)).toHaveText('Example LLC');
    await page.getByTestId('field-prev').click();
    await expect(page.getByTestId('field-input')).toHaveValue('');
    await page.getByTestId('field-done').click();
    await expect(page.getByTestId('field-input-bar')).toHaveCount(0);
  });

  test('the page does not zoom while typing', async ({ page }) => {
    await field(page, W9_NAME).click();
    await page.getByTestId('field-input').fill('Jane');
    const scale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    expect(scale).toBeCloseTo(1, 2);
  });
});

test.describe('checkboxes', () => {
  test('one tap ticks, another clears; the mark matches the PDF (a check on the W-9)', async ({ page }) => {
    await gotoApp(page);
    await openCorpusFile(page, 'irs-w9-2024-03.pdf');
    await expectDocumentOpen(page, 6);
    const box = field(page, W9_SCORP);
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await expect(box).toHaveText('✓');
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'false');
    await expect(box).toHaveText('');
  });

  test('checkboxes made by the app are marked with an X', async ({ page }) => {
    await gotoApp(page);
    await openCorpusFile(page, 'simple.pdf');
    await expectDocumentOpen(page, 1);
    await page.getByTestId('mode-edit').click();
    await page.getByTestId('field-tool-checkbox').click();
    const layer = page.locator('[data-page-index="0"] [data-testid="draft-layer"]');
    const b = (await layer.boundingBox())!;
    await layer.click({ position: { x: b.width * 0.3, y: b.height * 0.4 } });
    await page.getByTestId('mode-fill').click();
    const box = field(page, 'Checkbox 1');
    await box.click();
    await expect(box).toHaveText('✕');
  });

  test('a tap just outside a small checkbox still hits it', async ({ page }) => {
    await gotoApp(page);
    await openCorpusFile(page, 'irs-w9-2024-03.pdf');
    await expectDocumentOpen(page, 6);
    const box = field(page, W9_SCORP);
    const r = (await box.boundingBox())!;
    await page.mouse.click(r.x + r.width + 5, r.y + r.height / 2);
    await expect(box).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('confirming suggestions on the page', () => {
  test('keep and remove buttons on the box, then on to the next one', async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId('file-input').setInputFiles('tests/corpus/detect/flat-drawn-form.pdf');
    await expectDocumentOpen(page, 1);
    await page.getByTestId('mode-edit').click();
    await page.getByTestId('detect-button').click();
    await page.getByTestId('detect-quick').check();
    await page.getByTestId('detect-start').click();
    await expect(page.getByTestId('notice')).toContainText('Found');

    const total = await page.getByTestId('suggestion').count();
    await page.locator('[data-draft="Full name"]').click();
    await page.getByTestId('keep-suggestion').click();
    await expect(page.locator('[data-testid="draft"][data-draft="Full name"]')).toHaveCount(1);
    // The next suggestion is selected, ready to confirm.
    await expect(page.getByTestId('keep-suggestion')).toBeVisible();
    await page.getByTestId('remove-suggestion').click();
    await expect(page.getByTestId('suggestion')).toHaveCount(total - 2);
    await expect(page.getByTestId('draft')).toHaveCount(1);
  });
});
