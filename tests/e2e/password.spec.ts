// FR-1: password prompt for protected PDFs.
import { expect, test } from '@playwright/test';
import { corpusEntry, expectDocumentOpen, gotoApp, openCorpusFile } from './helpers';

const FILE = 'password-protected.pdf';

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await openCorpusFile(page, FILE);
  await expect(page.getByTestId('password-dialog')).toBeVisible();
});

test('prompts for the password with focus in the field', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Password required' })).toBeVisible();
  await expect(page.getByTestId('password-dialog')).toContainText(FILE);
  await expect(page.getByTestId('password-input')).toBeFocused();
  await expect(page.getByTestId('password-submit')).toBeDisabled();
});

test('a wrong password shows an error and clears the field', async ({ page }) => {
  await page.getByTestId('password-input').fill('not-it');
  await page.getByTestId('password-input').press('Enter');
  await expect(page.getByTestId('password-error')).toBeVisible();
  await expect(page.getByTestId('password-input')).toHaveValue('');
  await expect(page.getByTestId('password-input')).toHaveAttribute('aria-invalid', 'true');

  // A second wrong attempt still reports the error.
  await page.getByTestId('password-input').fill('still-wrong');
  await page.getByTestId('password-submit').click();
  await expect(page.getByTestId('password-error')).toBeVisible();
  await expect(page.getByTestId('password-input')).toHaveValue('');
});

test('the right password opens the document', async ({ page }) => {
  const entry = corpusEntry(FILE);
  await page.getByTestId('password-input').fill('wrong');
  await page.getByTestId('password-input').press('Enter');
  await expect(page.getByTestId('password-error')).toBeVisible();

  await page.getByTestId('password-input').fill(entry.password!);
  await page.getByTestId('password-submit').click();
  await expect(page.getByTestId('password-dialog')).toHaveCount(0);
  await expectDocumentOpen(page, entry.pages!);
});

test('cancel closes the prompt and returns to the start', async ({ page }) => {
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('password-dialog')).toHaveCount(0);
  await expect(page.getByTestId('empty-state')).toBeVisible();
});

test('Escape also cancels', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('password-dialog')).toHaveCount(0);
});
