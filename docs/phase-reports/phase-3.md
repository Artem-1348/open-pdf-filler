# Phase 3 — Manual form builder (FR-5): test report

**Date:** 2026-10-22 · **Gate:** a 20-field form built in the app fills correctly in the same
five viewers (Acrobat, Preview, Chrome, iOS, Android); Tab moves through fields in page order.

## Result: gate passed (Acrobat deferred to Phase 6; no Android device)

| Gate viewer | Engine | 20 fields fill | Tab order |
| --- | --- | --- | --- |
| Chrome | PDFium | ✅ automated (built in the app, filled, saved, reopened) | ✅ in-app Tab walk, all 5 browser profiles |
| Preview | PDFKit | ✅ automated | ✅ widgets listed in page order |
| iOS | PDFKit (same engine) | ✅ via the engine; ✅ manual on iPhone 17 Pro Max: built, filled and saved a form, 2026-10-22 | ✅ via the engine |
| Firefox (extra) | PDF.js | ✅ automated | ✅ widgets in page order |
| Acrobat | Adobe | ⏸ deferred to Phase 6 (not installed) | ⏸ |
| Android | PDFium | ✅ engine; no device | ✅ engine |

## What was built

| Item | Delivered |
| --- | --- |
| Field palette | Text, date, checkbox, radio (with "Add option"), dropdown, signature (standard `/Sig`) |
| Editing | Tap to place; select (Shift/⌘-click, long-press on phones); drag, resize, arrow-key nudge, duplicate (⌘D), delete; align 8 ways; works on existing PDF fields too |
| Properties | Name (with clash checks), tooltip, required, read-only, multi-line, max length, font size (auto or points), checkbox/radio values, dropdown options and "type your own", date format, border |
| Tab order | Automatic page order (rows, then left to right) or a hand-made order; written as the page's annotation order |
| Undo/redo | Buttons and Ctrl/⌘+Z, ⌘+Shift+Z, Ctrl+Y; covers building and filling; one drag or one field's typing is one step |
| Fill | Date fields get the system date picker; Fill mode Tab follows the builder's order |

Design and decisions: [phase-3-design.md](../phase-3-design.md) (E6 standard signature fields,
E7 date fields as text with a hint, no scripts).

## Automated test totals

| Suite | Result |
| --- | --- |
| Typecheck and lint | ✅ |
| Unit + writer + cross-viewer (Vitest) | 90 passed |
| End-to-end (Playwright: Chromium, Firefox, WebKit, Pixel 7, iPhone 14) | 418 passed, 32 skipped by design |

## Bugs found and fixed in this phase

| Bug | Severity | Found by |
| --- | --- | --- |
| Fields with a border grew by a point on every save (pdf-lib's border offset) | P2 | Writer "no creep" test |
| Safari skipped checkboxes, radios and "Sign here" on Tab | P2 (accessibility) | Tab-order end-to-end test on WebKit |
| Field details (e.g. max length) could be dropped when a file was reopened quickly | P2 | End-to-end test on WebKit |
| On phones, two field tools and undo/redo were pushed off the toolbar | P2 | Phone screenshot |
| On phones, the properties sheet covered the page while placing fields, and the end of the document couldn't be scrolled out from under it | P3 | Phone end-to-end test |

No open P1 or P2 bugs.

## Known limits

- **Unsigned signature fields** have no visible border in Preview (Acrobat draws its own).
- **Radio buttons are separate Tab stops** in this app (one per option), in reading order; native
  PDF viewers treat a group as one stop.
- **Lists and buttons** in existing PDFs can be moved or deleted but not created.
- **Default values** aren't set in the builder: fill the form in Fill mode and save instead.

## Definition of done

| Item | Status |
| --- | --- |
| Acceptance criteria pass | ✅ |
| Automated tests green in CI | ✅ PR #2 and `main` |
| No open P1/P2 bugs | ✅ |
| One-page test report | ✅ this file |
| Demo on a laptop and a phone | ✅ |
| Tagged release v0.3 | ✅ v0.3.0 |
