// NFR-3 Open speed: a 20-page PDF opens in under 2 s (proposed target),
// measured from choosing the file to the first page being on screen.
// Desktop projects only; the target is defined for a mid-range laptop.
import { expect, test } from '@playwright/test';
import { expectDocumentOpen, gotoApp, isMobile, openCorpusFile } from './helpers';

const TARGET_MS = 2000;

test('20-page PDF opens in under 2 seconds', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'NFR-3 is measured on desktop');
  await gotoApp(page);
  // The app downloads and compiles PDFium on load, before a file is chosen.
  await page.waitForLoadState('networkidle');

  const start = Date.now();
  await openCorpusFile(page, 'twenty-pages.pdf');
  await expectDocumentOpen(page, 20);
  const elapsed = Date.now() - start;

  testInfo.annotations.push({ type: 'open time', description: `${elapsed} ms (${testInfo.project.name})` });
  console.log(`[NFR-3] ${testInfo.project.name}: 20-page PDF opened in ${elapsed} ms`);
  expect(elapsed).toBeLessThan(TARGET_MS);
});
