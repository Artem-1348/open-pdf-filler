# Phase 2 — Fill & save (FR-3, FR-4, FR-9): test report

**Date:** 2026-10-21 · **Gate:** filled files reopen with every value intact in Acrobat, Preview,
Chrome, iOS and Android.

## Result: gate passed, except Acrobat (deferred) and Android (no device)

| Gate viewer | Engine | Result |
| --- | --- | --- |
| Chrome | PDFium | ✅ automated |
| Preview | PDFKit | ✅ automated |
| iOS | PDFKit (same engine as Preview) | ✅ automated via the shared engine; ✅ manual: W-9 filled, signed and saved on an iPhone 17 Pro Max (iOS 27.0.1) |
| Acrobat | Adobe | ⏸ deferred to the Phase 6 viewer-matrix sign-off (Acrobat Reader isn't installed on the test Mac) |
| Android | PDFium (Chrome, Drive viewer) | ✅ engine automated; no Android device available |

Details per field type: [viewer-matrix.md](../viewer-matrix.md).

## What was built

| Requirement | Delivered |
| --- | --- |
| FR-3 Fill existing forms | Text (single and multi-line, max length), checkbox, radio, dropdown (incl. editable), list (incl. multi-select), signature field ("Sign here" places a signature into it) |
| FR-4 Fill flat PDFs | Text, today's date, checkmark, cross, drawn or typed signature; move, resize, font size, delete; works on rotated pages |
| FR-9 Export | Fillable copy or flattened copy, downloaded as a new file; original never changed; protected files keep their password and permissions; unsaved-changes guard |

Design and decisions: [phase-2-design.md](../phase-2-design.md). Roadmap change: appearance streams
moved from Phase 6 into Phase 2 (decision D1).

## Automated test totals

| Suite | Result |
| --- | --- |
| Typecheck and lint | ✅ |
| Unit + writer + cross-viewer (Vitest) | 76 passed |
| End-to-end (Playwright 1.64: Chromium, Firefox, WebKit, Pixel 7, iPhone 14) | 375 passed, 25 skipped by design |

## Bugs found and fixed in this phase

| Bug | Severity | Found by |
| --- | --- | --- |
| Flattened copies drew "auto"-size multi-line fields huge and dropped lines | P1 (data loss) | PDFKit cross-viewer check |
| Re-encrypting a protected file dropped its permissions, locking the copy in other apps | P2 | End-to-end test |
| Field maximum length not enforced (PDFium doesn't report it); over-long values could fail the save | P2 | End-to-end test |
| Placed checkmarks on phones were too small to drag (resize handle covered them) | P2 | Touch end-to-end test (Android) |
| Read-only notice hidden on phones | P3 | End-to-end test |
| Checkmarks drawn thinner in saved files than on screen | P4 | Walkthrough screenshots |

No open P1 or P2 bugs.

## Known limits

- **Scripts other than Latin, Cyrillic, Greek and Vietnamese** can't be saved yet; the app lists the
  characters instead of saving them wrongly (Phase 6).
- **Fillable list boxes in Preview** show the right value but without a selection highlight
  (Preview draws its own appearance). Flattened copies show the highlight.
- **No undo/redo** (Phase 3). **No autosaved drafts** (backlog).
- **Touch dragging on iPhone** can't be automated; covered by the manual iPhone check.
- **Flat PDFs that used to be forms** (fields stripped by "Print → Save as PDF") show no fields; rebuilding them is now Phase 4's first detector ([roadmap-changes.md](../roadmap-changes.md)).
- **Bundle:** first load unchanged at 213 KB compressed JS; the writer (405 KB compressed) and the
  Noto Sans fonts (0.6 MB each) load only when needed.

## Definition of done

| Item | Status |
| --- | --- |
| Acceptance criteria pass | ✅ (Acrobat deferred to Phase 6, Android: no device) |
| Automated tests green in CI | ✅ PR #1 and `main` |
| No open P1/P2 bugs | ✅ |
| One-page test report | ✅ this file |
| Demo on a laptop and a phone | ✅ |
| Tagged release v0.2 | ✅ v0.2.0 |
