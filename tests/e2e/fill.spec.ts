// Phase 2 (FR-3, FR-4, FR-9): fill fields and flat pages, save a copy, and
// reopen the saved copy to check every value survived.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { corpusEntry, expectDocumentOpen, gotoApp, openCorpusFile, typeInto, expectFieldText, usesInputBar } from './helpers';

const field = (page: Page, name: string, widget = 0) => page.locator(`[data-field="${name}"]`).nth(widget);

// Places the active tool at a spot given as fractions of the page's size.
async function placeAt(page: Page, pageIndex: number, fx: number, fy: number) {
  const target = page.locator(`[data-page-index="${pageIndex}"] [data-testid="placement-surface"]`);
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await target.click({ position: { x: box.width * fx, y: box.height * fy } });
}

// Saves through the dialog and returns the path of the downloaded copy.
async function saveCopy(page: Page, testInfo: TestInfo, { flatten = false } = {}) {
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  if (flatten) await page.getByTestId('save-flattened').check();
  const download = page.waitForEvent('download');
  await page.getByTestId('save-confirm').click();
  const d = await download;
  // WebKit on Linux replaces spaces in download names with underscores.
  const name = d.suggestedFilename().replace(/_/g, ' ');
  const path = testInfo.outputPath(d.suggestedFilename());
  await d.saveAs(path);
  await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  return { path, name };
}

// A press-move-release, as a mouse or (Android Chrome) a real touch.
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, touch: boolean) {
  const steps = 6;
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let i = 1; i <= steps; i++) {
      const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    return;
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

async function reopen(page: Page, path: string, pages: number) {
  await page.getByTestId('file-input').setInputFiles(path);
  await expect(page.getByTestId('status')).toContainText('Opened');
  await expectDocumentOpen(page, pages);
}

async function searchCount(page: Page, term: string): Promise<string> {
  if (!(await page.getByTestId('searchbar').count())) await page.getByTestId('toggle-search').click();
  await page.getByTestId('search-input').fill(term);
  await expect(page.getByTestId('search-status')).not.toHaveText('Searching…');
  await expect(page.getByTestId('search-status')).not.toHaveText('');
  return (await page.getByTestId('search-status').textContent()) ?? '';
}

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test.describe('existing form fields (FR-3)', () => {
  test('every field type can be filled, saved and reopened with its value', async ({ page }, testInfo) => {
    await openCorpusFile(page, 'all-field-types.pdf');
    await expectDocumentOpen(page, 3);
    await expect(page.getByTestId('status')).toContainText('form fields');

    await typeInto(page, field(page, 'name_p0'), 'Ada Lovelace');
    await field(page, 'agree_p0').click();
    await typeInto(page, field(page, 'notes'), 'Line one\nLine two');
    await field(page, 'size', 1).click();
    await field(page, 'colour').selectOption('Green');
    await field(page, 'toppings').selectOption(['Olives', 'Onions']);
    // The length limit is read just after opening; max length 4.
    if (await usesInputBar(page)) {
      await field(page, 'pin').click();
      await expect(page.getByTestId('field-input')).toHaveAttribute('maxlength', '4');
      await page.getByTestId('field-input').fill('123456');
      await page.getByTestId('field-done').click();
    } else {
      await expect(field(page, 'pin')).toHaveAttribute('maxlength', '4');
      await field(page, 'pin').fill('123456');
    }
    await expectFieldText(field(page, 'pin'), '1234');
    // Fields on a page rotated 90°.
    await typeInto(page, field(page, 'name_p90'), 'Sideways');

    const { path, name } = await saveCopy(page, testInfo);
    expect(name).toBe('all-field-types (filled).pdf');
    await expect(page.getByTestId('status')).toHaveText(`Saved ${name}.`);

    await reopen(page, path, 3);
    await expectFieldText(field(page, 'name_p0'), 'Ada Lovelace');
    await expect(field(page, 'agree_p0')).toHaveAttribute('aria-checked', 'true');
    await expectFieldText(field(page, 'notes'), 'Line one\nLine two');
    await expect(field(page, 'size', 0)).toHaveAttribute('aria-checked', 'false');
    await expect(field(page, 'size', 1)).toHaveAttribute('aria-checked', 'true');
    await expectFieldText(field(page, 'colour'), 'Green');
    expect(await field(page, 'toppings').evaluate((el: HTMLSelectElement) => Array.from(el.selectedOptions, (o) => o.value))).toEqual(['Olives', 'Onions']);
    await expectFieldText(field(page, 'pin'), '1234');
    await field(page, 'name_p90').scrollIntoViewIfNeeded();
    await expectFieldText(field(page, 'name_p90'), 'Sideways');
  });

  test('fields on sideways pages are drawn where the PDF puts them', async ({ page }) => {
    await openCorpusFile(page, 'all-field-types.pdf');
    await expectDocumentOpen(page, 3);
    // On the page turned 90°, the 300 x 24 name field shows up tall and thin.
    const control = field(page, 'name_p90');
    await control.scrollIntoViewIfNeeded();
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThan(box.width * 5);
  });

  test('the IRS W-9 keeps its name and tax-classification box', async ({ page }, testInfo) => {
    const name = 'topmostSubform[0].Page1[0].f1_01[0]';
    const sCorp = 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[2]';
    await openCorpusFile(page, 'irs-w9-2024-03.pdf');
    await expectDocumentOpen(page, 6);
    await typeInto(page, field(page, name), 'Jane Example');
    await field(page, sCorp).click();
    const { path } = await saveCopy(page, testInfo);
    await reopen(page, path, 6);
    await expectFieldText(field(page, name), 'Jane Example');
    await expect(field(page, sCorp)).toHaveAttribute('aria-checked', 'true');
  });

  test('a flattened copy has no fields left, but its values are on the page', async ({ page }, testInfo) => {
    await openCorpusFile(page, 'all-field-types.pdf');
    await expectDocumentOpen(page, 3);
    await typeInto(page, field(page, 'name_p0'), 'Flattened Name');
    const { path, name } = await saveCopy(page, testInfo, { flatten: true });
    expect(name).toBe('all-field-types (flattened).pdf');
    await reopen(page, path, 3);
    await expect(page.getByTestId('field')).toHaveCount(0);
    expect(await searchCount(page, 'Flattened Name')).toBe('1 of 1');
  });

  test('Cyrillic text is saved with the bundled font', async ({ page }, testInfo) => {
    await openCorpusFile(page, 'all-field-types.pdf');
    await expectDocumentOpen(page, 3);
    await typeInto(page, field(page, 'name_p0'), 'Иван Петров');
    const { path } = await saveCopy(page, testInfo);
    await reopen(page, path, 3);
    await expectFieldText(field(page, 'name_p0'), 'Иван Петров');
  });
});

test.describe('adding to any page (FR-4)', () => {
  test('text, date, checkmark, cross and a typed signature end up in the saved file', async ({ page }, testInfo) => {
    await openCorpusFile(page, 'simple.pdf');
    await expectDocumentOpen(page, 1);

    await page.getByTestId('tool-text').click();
    await placeAt(page, 0, 0.15, 0.3);
    await page.keyboard.type('Placed by a test');
    await page.getByTestId('tool-date').click();
    await placeAt(page, 0, 0.6, 0.3);
    await page.getByTestId('tool-check').click();
    await placeAt(page, 0, 0.15, 0.45);
    await page.getByTestId('tool-cross').click();
    await placeAt(page, 0, 0.25, 0.45);
    await page.getByTestId('tool-sign').click();
    await page.getByTestId('sig-tab-type').click();
    await page.getByTestId('sig-typed-input').fill('Ada Lovelace');
    await page.getByTestId('sig-use').click();
    await expect(page.getByTestId('tool-hint')).toBeVisible();
    await placeAt(page, 0, 0.5, 0.6);

    await expect(page.getByTestId('placed-item')).toHaveCount(5);
    const dateText = await page.locator('[data-kind="date"] [data-testid="item-text"]').innerText();
    expect(dateText).toMatch(/\d/);

    const { path } = await saveCopy(page, testInfo, { flatten: true });
    await reopen(page, path, 1);
    await expect(page.getByTestId('placed-item')).toHaveCount(0);
    expect(await searchCount(page, 'Placed by a test')).toBe('1 of 1');
    expect(await searchCount(page, dateText.trim())).toBe('1 of 1');
    expect(await searchCount(page, 'Ada Lovelace')).toBe('1 of 1');
  });

  test('a drawn signature can be placed and saved', async ({ page }, testInfo) => {
    await openCorpusFile(page, 'simple.pdf');
    await expectDocumentOpen(page, 1);
    await page.getByTestId('tool-sign').click();
    const pad = page.getByTestId('sig-pad');
    const b = (await pad.boundingBox())!;
    await page.mouse.move(b.x + 30, b.y + 120);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(b.x + 30 + i * 10, b.y + 100 + Math.sin(i / 2) * 30);
    await page.mouse.up();
    await page.getByTestId('sig-use').click();
    await expect(page.getByTestId('tool-hint')).toBeVisible();
    await placeAt(page, 0, 0.5, 0.5);
    await expect(page.locator('[data-kind="signature"] img')).toBeVisible();
    const { path } = await saveCopy(page, testInfo);
    await reopen(page, path, 1);
  });

  test('items can be moved and resized', async ({ page, browserName }, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile-safari',
      'Playwright cannot send touch drags to WebKit; checked by hand on a real iPhone',
    );
    await openCorpusFile(page, 'simple.pdf');
    await expectDocumentOpen(page, 1);
    await page.getByTestId('tool-check').click();
    await placeAt(page, 0, 0.3, 0.2);
    const item = page.getByTestId('placed-item');
    const start = (await item.boundingBox())!;
    const touch = testInfo.project.name === 'mobile-chrome' && browserName === 'chromium';

    const center = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    await drag(page, center, { x: center.x + 60, y: center.y + 40 }, touch);
    const moved = (await item.boundingBox())!;
    expect(moved.x - start.x).toBeGreaterThan(50);
    expect(moved.y - start.y).toBeGreaterThan(30);

    const handle = (await page.getByTestId('item-resize').boundingBox())!;
    const grip = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    await drag(page, grip, { x: grip.x + 40, y: grip.y + 40 }, touch);
    expect((await item.boundingBox())!.width).toBeGreaterThan(moved.width + 20);
  });

  test('items can be restyled and deleted', async ({ page }) => {
    await openCorpusFile(page, 'simple.pdf');
    await expectDocumentOpen(page, 1);
    await page.getByTestId('tool-check').click();
    await placeAt(page, 0, 0.3, 0.2);
    await page.getByTestId('item-delete').click();
    await expect(page.getByTestId('placed-item')).toHaveCount(0);

    await page.getByTestId('tool-text').click();
    await placeAt(page, 0, 0.2, 0.3);
    await page.keyboard.type('Grow');
    const text = page.getByTestId('item-text');
    const before = await text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await page.getByTestId('item-larger').click();
    await expect.poll(() => text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(before);
    // Focus is on the A+ button now, so Delete removes the selected item.
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('placed-item')).toHaveCount(0);
  });

  test('Escape puts a tool down without placing anything', async ({ page }) => {
    await openCorpusFile(page, 'simple.pdf');
    await expectDocumentOpen(page, 1);
    await page.getByTestId('tool-check').click();
    await expect(page.getByTestId('tool-check')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tool-check')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('placement-surface')).toHaveCount(0);
  });

  test('characters no bundled font can draw are reported, not saved silently', async ({ page }) => {
    await openCorpusFile(page, 'simple.pdf');
    await expectDocumentOpen(page, 1);
    await page.getByTestId('tool-text').click();
    await placeAt(page, 0, 0.2, 0.4);
    await page.keyboard.type('Hello 你好');
    await page.getByTestId('save-button').click();
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-error')).toContainText('你 好');
    await expect(page.getByTestId('save-dialog')).toBeVisible();
  });
});

test.describe('permissions (design D8)', () => {
  test('a PDF that forbids filling opens read-only and says why', async ({ page }) => {
    await openCorpusFile(page, 'no-fill-permission.pdf');
    await expectDocumentOpen(page, 1);
    await expect(page.getByTestId('no-edit-notice')).toBeVisible();
    await expect(field(page, 'locked_name')).toBeDisabled();
    await expect(page.getByTestId('tool-text')).toBeDisabled();
  });
});

test.describe('saving (FR-9)', () => {
  test('a password-protected file stays protected with the same password', async ({ page }, testInfo) => {
    const { password } = corpusEntry('password-protected.pdf');
    await openCorpusFile(page, 'password-protected.pdf');
    await page.getByTestId('password-input').fill(password!);
    await page.getByTestId('password-submit').click();
    await expectDocumentOpen(page, 1);
    await page.getByTestId('tool-text').click();
    await placeAt(page, 0, 0.2, 0.4);
    await page.keyboard.type('Still secret');
    await page.getByTestId('save-button').click();
    await expect(page.getByTestId('save-dialog')).toContainText('keeps the same password');
    await page.getByTestId('save-dialog').getByRole('button', { name: 'Cancel' }).click();
    const { path } = await saveCopy(page, testInfo);

    await page.getByTestId('file-input').setInputFiles(path);
    await expect(page.getByTestId('password-dialog')).toBeVisible();
    await page.getByTestId('password-input').fill(password!);
    await page.getByTestId('password-submit').click();
    await expectDocumentOpen(page, 1);
    expect(await searchCount(page, 'Still secret')).toBe('1 of 1');
  });

  test('unsaved changes are not lost by accident', async ({ page }, testInfo) => {
    await openCorpusFile(page, 'fillable-form.pdf');
    await expectDocumentOpen(page, 1);
    await typeInto(page, field(page, 'full_name'), 'Changed');
    await expect(page.getByTestId('save-button')).toHaveClass(/primary/);

    // Closing asks first; Cancel keeps everything.
    await page.getByTestId('close-button').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Cancel' }).click();
    await expectFieldText(field(page, 'full_name'), 'Changed');

    // Opening another file asks too.
    await page.getByTestId('open-button').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    // After saving, closing doesn't ask.
    await saveCopy(page, testInfo);
    await page.getByTestId('close-button').click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  test('discarding changes closes the document', async ({ page }) => {
    await openCorpusFile(page, 'fillable-form.pdf');
    await expectDocumentOpen(page, 1);
    await typeInto(page, field(page, 'full_name'), 'Changed');
    await page.getByTestId('close-button').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  test('the original file is never changed', async ({ page }, testInfo) => {
    const { readFileSync } = await import('node:fs');
    const { corpusPath } = await import('./helpers');
    const before = readFileSync(corpusPath('fillable-form.pdf'));
    await openCorpusFile(page, 'fillable-form.pdf');
    await expectDocumentOpen(page, 1);
    await typeInto(page, field(page, 'full_name'), 'Changed');
    const { name } = await saveCopy(page, testInfo);
    expect(name).not.toBe('fillable-form.pdf');
    expect(readFileSync(corpusPath('fillable-form.pdf')).equals(before)).toBe(true);
  });
});
