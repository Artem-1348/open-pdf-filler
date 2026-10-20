// FR-1 Open: file picker, drag-and-drop, "Open with", clear errors,
// password prompt. Includes the Phase 1 gate: every corpus file opens or
// shows a clear error.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openErrorMessage } from '../../src/lib/errors';
import {
  corpus,
  corpusPath,
  expectDocumentOpen,
  gotoApp,
  isMobile,
  openCorpusFile,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test('empty state explains how to start and promises no upload', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Open a PDF' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose PDF' })).toBeVisible();
  await expect(page.getByText('Nothing is uploaded')).toBeVisible();
});

test('opens a PDF with the file picker', async ({ page }, testInfo) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose PDF' }).click();
  await (await chooser).setFiles(corpusPath('simple.pdf'));

  await expectDocumentOpen(page, 1);
  await expect(page.getByTestId('page-count')).toHaveText('/ 1');
  if (!isMobile(testInfo)) await expect(page.getByTestId('file-name')).toHaveText('simple.pdf');
  await expect(page.getByTestId('status')).toHaveText('Opened simple.pdf, 1 page.');
});

test('opens a PDF dropped onto the window', async ({ page }) => {
  const base64 = readFileSync(corpusPath('twenty-pages.pdf')).toString('base64');
  const fire = (type: string) =>
    page.evaluate((t) => {
      const dt = (window as unknown as { __dt: DataTransfer }).__dt;
      document.body.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, type);

  await page.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'twenty-pages.pdf', { type: 'application/pdf' }));
    (window as unknown as { __dt: DataTransfer }).__dt = dt;
  }, base64);

  await fire('dragenter');
  await fire('dragover');
  await expect(page.locator('.drop-overlay')).toBeVisible();
  await fire('drop');

  await expectDocumentOpen(page, 20);
  await expect(page.locator('.drop-overlay')).toHaveCount(0);
});

test('dragging a file away hides the drop overlay', async ({ page }) => {
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    (window as unknown as { __dt: DataTransfer }).__dt = dt;
  });
  for (const type of ['dragenter', 'dragleave']) {
    await page.evaluate((t) => {
      const dt = (window as unknown as { __dt: DataTransfer }).__dt;
      document.body.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, type);
    if (type === 'dragenter') await expect(page.locator('.drop-overlay')).toBeVisible();
  }
  await expect(page.locator('.drop-overlay')).toHaveCount(0);
  await expect(page.getByTestId('empty-state')).toBeVisible();
});

test('opening a second file replaces the first', async ({ page }) => {
  await openCorpusFile(page, 'twenty-pages.pdf');
  await expectDocumentOpen(page, 20);
  await openCorpusFile(page, 'simple.pdf');
  await expectDocumentOpen(page, 1);
});

test('closing a document returns to the start screen', async ({ page }) => {
  await openCorpusFile(page, 'twenty-pages.pdf');
  await expectDocumentOpen(page, 20);
  await page.getByRole('button', { name: 'Close document' }).click();
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.getByTestId('app')).toHaveAttribute('data-doc-pages', '0');
  await expect(page.getByTestId('page')).toHaveCount(0);
  await expect(page.getByTestId('close-button')).toHaveCount(0);
  await expect(page.getByTestId('status')).toHaveText('Closed twenty-pages.pdf.');

  // The same file can be opened again afterwards.
  await openCorpusFile(page, 'twenty-pages.pdf');
  await expectDocumentOpen(page, 20);
});

test('an error while a document is open keeps the document', async ({ page }) => {
  await openCorpusFile(page, 'simple.pdf');
  await expectDocumentOpen(page, 1);
  await openCorpusFile(page, 'notes.txt');
  await expect(page.getByTestId('error')).toBeVisible();
  await expectDocumentOpen(page, 1);
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByTestId('error')).toHaveCount(0);
});

test.describe('Phase 1 gate: every corpus file opens or shows a clear error', () => {
  for (const entry of corpus) {
    test(`${entry.file} (${entry.note ?? entry.expect})`, async ({ page }) => {
      await openCorpusFile(page, entry.file);

      if (entry.expect === 'open') {
        await expectDocumentOpen(page, entry.pages!);
        await expect(page.getByTestId('error')).toHaveCount(0);
      } else if (entry.expect === 'password') {
        await expect(page.getByTestId('password-dialog')).toBeVisible();
      } else {
        const alert = page.getByTestId('error');
        await expect(alert).toBeVisible();
        await expect(alert).toContainText(openErrorMessage(entry.error!, entry.file));
        await expect(page.getByTestId('empty-state')).toBeVisible();
      }
    });
  }
});

test('"Open with" on Android: a shared file is handed over by the service worker', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'Web Share Target is a Chromium (Android) feature');
  void testInfo;

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Service workers only control a page after it reloads.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // What Android does when the user picks this app in the share sheet.
  const base64 = readFileSync(corpusPath('simple.pdf')).toString('base64');
  const redirectedTo = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('file', new File([bytes], 'shared form.pdf', { type: 'application/pdf' }));
    const res = await fetch('./share-target', { method: 'POST', body: form });
    return res.url;
  }, base64);
  expect(redirectedTo).toContain('share-target=1');

  await page.goto(redirectedTo);
  await expectDocumentOpen(page, 1);
  await expect(page.getByTestId('status')).toHaveText('Opened shared form.pdf, 1 page.');
  await expect(page).not.toHaveURL(/share-target/);
});

test('manifest registers the app as a PDF handler', async ({ request }) => {
  const manifest = await (await request.get('./manifest.webmanifest')).json();
  expect(manifest.file_handlers[0].accept['application/pdf']).toContain('.pdf');
  expect(manifest.share_target.params.files[0].accept).toContain('application/pdf');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
});
