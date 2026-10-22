// Phase 3 (FR-5): build a form in the app, try it, save it, and reopen it.
// Includes the gate: a 20-field form fills correctly and Tab walks the
// fields in page order.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectDocumentOpen, gotoApp, isMobile, openCorpusFile } from './helpers';

const draft = (page: Page, name: string) => page.locator(`[data-draft="${name}"]`);
const field = (page: Page, name: string, widget = 0) => page.locator(`[data-field="${name}"]`).nth(widget);

async function editMode(page: Page, file = 'simple.pdf', pages = 1) {
  await gotoApp(page);
  await openCorpusFile(page, file);
  await expectDocumentOpen(page, pages);
  await page.getByTestId('mode-edit').click();
}

// Picks a field type and taps it onto page 1 at a spot given in points.
async function addField(page: Page, kind: string, x: number, y: number) {
  await page.getByTestId(`field-tool-${kind}`).click();
  const layer = page.locator('[data-page-index="0"] [data-testid="draft-layer"]');
  const box = (await layer.boundingBox())!;
  const scale = box.width / 612;
  await layer.click({ position: { x: x * scale, y: y * scale } });
}

async function rename(page: Page, name: string) {
  await page.getByTestId('prop-name').fill(name);
  await page.getByTestId('prop-name').press('Enter');
}

async function saveCopy(page: Page, testInfo: TestInfo) {
  await page.getByTestId('save-button').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('save-confirm').click();
  const d = await download;
  const path = testInfo.outputPath(d.suggestedFilename());
  await d.saveAs(path);
  await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  return path;
}

async function reopen(page: Page, path: string) {
  await page.getByTestId('file-input').setInputFiles(path);
  await expect(page.getByTestId('status')).toContainText('Opened');
  await expect(page.getByTestId('page-image').first()).toBeVisible();
}

// The gate form: rows of fields on one page, named in reading order.
const GATE_ROWS: Array<Array<{ kind: string; name: string }>> = [
  [{ kind: 'text', name: 'F01 First name' }, { kind: 'text', name: 'F02 Last name' }],
  [{ kind: 'text', name: 'F03 Street' }, { kind: 'text', name: 'F04 City' }],
  [{ kind: 'text', name: 'F05 Zip' }, { kind: 'text', name: 'F06 Phone' }],
  [{ kind: 'text', name: 'F07 Email' }, { kind: 'text', name: 'F08 Company' }],
  [{ kind: 'text', name: 'F09 Title' }, { kind: 'text', name: 'F10 Notes' }],
  [{ kind: 'date', name: 'F11 Start' }, { kind: 'date', name: 'F12 End' }],
  [{ kind: 'checkbox', name: 'F13 Agree' }, { kind: 'checkbox', name: 'F14 News' }, { kind: 'checkbox', name: 'F15 Member' }],
  [{ kind: 'dropdown', name: 'F16 Country' }, { kind: 'dropdown', name: 'F17 Size' }],
  [{ kind: 'signature', name: 'F18 Signature' }],
];

async function buildGateForm(page: Page) {
  for (const [r, row] of GATE_ROWS.entries()) {
    for (const [c, f] of row.entries()) {
      await addField(page, f.kind, 140 + c * 170, 150 + r * 32);
      await rename(page, f.name);
    }
  }
  // Two radio groups, below the rows: 3 + 2 options.
  await addField(page, 'radio', 100, 470);
  await rename(page, 'F19 Plan');
  await page.getByTestId('prop-add-option').click();
  await page.getByTestId('prop-add-option').click();
  await addField(page, 'radio', 300, 470);
  await rename(page, 'F20 Contact');
  await page.getByTestId('prop-add-option').click();
}

test.describe('Phase 3 gate', () => {
  test('a 20-field form built in the app fills, saves and reopens correctly; Tab follows page order', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await editMode(page);
    await buildGateForm(page);
    await expect(page.getByTestId('draft')).toHaveCount(23); // 20 fields, 23 boxes

    // Try it in Fill mode.
    await page.getByTestId('mode-fill').click();
    await expect(page.getByTestId('field')).toHaveCount(23);

    if (!isMobile(testInfo)) {
      // Tab goes through the fields in reading order.
      // Date pickers have one Tab stop per part (month, day, year); count
      // each date field once.
      await field(page, 'F01 First name').focus();
      const order: string[] = [];
      for (let i = 0; i < 40 && order.length < 22; i++) {
        const [name, type] = await page.evaluate(() => [
          document.activeElement?.getAttribute('data-field') ?? '',
          document.activeElement?.getAttribute('type') ?? '',
        ]);
        if (!(type === 'date' && order[order.length - 1] === name)) order.push(name);
        await page.keyboard.press('Tab');
      }
      // The two radio groups sit side by side, so reading order alternates.
      const expected = [...GATE_ROWS.flat().map((f) => f.name), 'F19 Plan', 'F20 Contact', 'F19 Plan', 'F20 Contact'];
      expect(order).toEqual(expected.slice(0, 22));
    }

    await field(page, 'F01 First name').fill('Ada');
    await field(page, 'F05 Zip').fill('12345');
    await field(page, 'F11 Start').fill('2026-10-21');
    await field(page, 'F13 Agree').click();
    await field(page, 'F19 Plan', 1).click();
    await field(page, 'F20 Contact', 0).click();
    await field(page, 'F16 Country').selectOption('Option 2');
    const path = await saveCopy(page, testInfo);

    await reopen(page, path);
    await expect(page.getByTestId('status')).toContainText('20 form fields');
    await expect(field(page, 'F01 First name')).toHaveValue('Ada');
    await expect(field(page, 'F05 Zip')).toHaveValue('12345');
    await expect(field(page, 'F11 Start')).toHaveValue('2026-10-21');
    await expect(field(page, 'F11 Start')).toHaveAttribute('type', 'date');
    await expect(field(page, 'F13 Agree')).toHaveAttribute('aria-checked', 'true');
    await expect(field(page, 'F14 News')).toHaveAttribute('aria-checked', 'false');
    await expect(field(page, 'F19 Plan', 1)).toHaveAttribute('aria-checked', 'true');
    await expect(field(page, 'F20 Contact', 0)).toHaveAttribute('aria-checked', 'true');
    await expect(field(page, 'F16 Country')).toHaveValue('Option 2');
    await expect(field(page, 'F18 Signature')).toHaveText('Sign here');
  });
});

test.describe('building', () => {
  test('field properties are saved', async ({ page }, testInfo) => {
    await editMode(page);
    await addField(page, 'text', 200, 200);
    await rename(page, 'Comments');
    await page.getByTestId('prop-multiline').check();
    await page.getByTestId('prop-required').check();
    await page.getByTestId('prop-tooltip').fill('Anything else?');
    await addField(page, 'text', 200, 300);
    await rename(page, 'PIN');
    await page.getByTestId('prop-maxlen').fill('4');
    await addField(page, 'dropdown', 200, 400);
    await page.getByTestId('prop-options').fill('Red\nGreen\nBlue');
    await addField(page, 'checkbox', 200, 450);
    await page.getByTestId('prop-export').fill('Agreed');
    const path = await saveCopy(page, testInfo);

    await reopen(page, path);
    await expect(field(page, 'Comments')).toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(field(page, 'Comments')).toHaveAttribute('aria-required', 'true');
    await expect(field(page, 'Comments')).toHaveAttribute('title', 'Anything else?');
    await expect(field(page, 'PIN')).toHaveAttribute('maxlength', '4');
    expect(await field(page, 'Dropdown 1').locator('option').allTextContents()).toEqual(['', 'Red', 'Green', 'Blue']);

    // And they show in Edit form mode too.
    await page.getByTestId('mode-edit').click();
    await draft(page, 'Checkbox 1').click();
    await expect(page.getByTestId('prop-export')).toHaveValue('Agreed');
  });

  test('undo and redo cover adding, moving and deleting', async ({ page }) => {
    await editMode(page);
    await addField(page, 'text', 200, 200);
    await expect(page.getByTestId('draft')).toHaveCount(1);
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('draft')).toHaveCount(0);
    await page.getByTestId('redo').click();
    await expect(page.getByTestId('draft')).toHaveCount(1);

    const box = draft(page, 'Text 1');
    const start = (await box.boundingBox())!;
    await page.mouse.move(start.x + 20, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + 120, start.y + start.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
    const moved = (await box.boundingBox())!;
    expect(moved.x - start.x).toBeGreaterThan(80);
    // One drag is one undo step.
    await page.getByTestId('undo').click();
    await expect.poll(async () => (await box.boundingBox())!.x).toBeCloseTo(start.x, 0);

    await page.getByTestId('prop-delete').click();
    await expect(page.getByTestId('draft')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('draft')).toHaveCount(1);
  });

  test('keyboard: nudge, duplicate and delete', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'no hardware keyboard on phones');
    await editMode(page);
    await addField(page, 'text', 200, 200);
    const box = draft(page, 'Text 1');
    const start = (await box.boundingBox())!;
    await box.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => (await box.boundingBox())!.x).toBeGreaterThan(start.x + 5);
    await page.keyboard.press('ControlOrMeta+d');
    await expect(page.getByTestId('draft')).toHaveCount(2);
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('draft')).toHaveCount(1);
  });

  test('several fields line up with the first one picked', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'Shift-click; phones use long-press, checked by hand');
    await editMode(page);
    await addField(page, 'text', 200, 200);
    await addField(page, 'text', 260, 260);
    await draft(page, 'Text 1').click();
    await draft(page, 'Text 2').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('multi-props')).toBeVisible();
    await page.getByTestId('align-left').click();
    const a = (await draft(page, 'Text 1').boundingBox())!;
    const b = (await draft(page, 'Text 2').boundingBox())!;
    expect(Math.abs(a.x - b.x)).toBeLessThan(1);
  });

  test('a custom tab order is kept', async ({ page }, testInfo) => {
    await editMode(page);
    await addField(page, 'text', 200, 200);
    await addField(page, 'text', 200, 300);
    await page.keyboard.press('Escape');
    await page.locator('[data-page-index="0"] [data-testid="draft-layer"]').click({ position: { x: 5, y: 5 } });
    // On phones the list starts folded away.
    const toggle = page.locator('.props-toggle');
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    const items = page.getByTestId('tab-order-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('Text 1');
    await page.getByRole('button', { name: 'Move Text 2 earlier' }).click();
    await expect(items.nth(0)).toContainText('Text 2');
    await expect(page.getByTestId('reset-order')).toBeVisible();
    const path = await saveCopy(page, testInfo);
    await reopen(page, path);
    if (!isMobile(testInfo)) {
      await field(page, 'Text 2').focus();
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.getAttribute('data-field'))).toBe('Text 1');
    }
  });
});

test.describe('editing an existing form', () => {
  test('fields in a PDF can be moved, renamed and deleted', async ({ page }, testInfo) => {
    await editMode(page, 'fillable-form.pdf');
    await expect(page.getByTestId('draft')).toHaveCount(5);
    await draft(page, 'full_name').click();
    await rename(page, 'Full name');
    await draft(page, 'member_before').click();
    await page.getByTestId('prop-delete').click();
    await expect(page.getByTestId('draft')).toHaveCount(4);
    const path = await saveCopy(page, testInfo);
    await reopen(page, path);
    await expect(page.getByTestId('status')).toContainText('3 form fields');
    await expect(field(page, 'Full name')).toBeVisible();
    await expect(page.locator('[data-field="member_before"]')).toHaveCount(0);
  });

  test('just looking in Edit form is not an unsaved change', async ({ page }) => {
    await editMode(page, 'fillable-form.pdf');
    await page.getByTestId('mode-fill').click();
    await page.getByTestId('close-button').click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  test('adding a field is an unsaved change', async ({ page }) => {
    await editMode(page);
    await addField(page, 'checkbox', 200, 200);
    await page.getByTestId('close-button').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  });
});

test.describe('phone layout', () => {
  test('Edit form fits the screen with every tool reachable', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'phone layout');
    await editMode(page);
    const width = page.viewportSize()!.width;
    for (const id of ['mode-fill', 'mode-edit', 'undo', 'redo', 'save-button']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.x + b.width, id).toBeLessThanOrEqual(width);
    }
    for (const kind of ['text', 'date', 'checkbox', 'radio', 'dropdown', 'signature']) {
      await page.getByTestId(`field-tool-${kind}`).scrollIntoViewIfNeeded();
      await expect(page.getByTestId(`field-tool-${kind}`)).toBeInViewport();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
