# Viewer compatibility matrix

Exported PDFs must open and keep their values in every viewer below (NFR-2).
Used from Phase 2 (fill & save) and signed off in Phase 6.

How to test a row: open the exported file in that viewer, check that every field
shows its value, change one value, save, reopen. Record **✅ pass**, **❌ fail**
(link the issue), or **— not tested**, plus the date and viewer version.

## Phase 2 gate: filled files reopen with every value intact

Sample files: `npx vitest run src/pdf/viewers.test.ts` writes them to `test-results/gate-samples/`
(form filled, form flattened, IRS W-9 with signature and date, items on rotated pages, Cyrillic,
password-protected copy; password `open-sesame`).

| Viewer | Platform | Text | Checkbox | Radio | Dropdown | List | Placed items | How checked / date | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome built-in viewer (PDFium) | Desktop | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Automated, PDFium 2.15 in Node, 2026-10-20 | Same engine as Edge and Android Chrome |
| Open PDF Filler (PDFium) | All 5 browser profiles | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Automated e2e: save, reopen, compare, 2026-10-20 | |
| Firefox built-in viewer (PDF.js) | Desktop | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Automated, PDF.js 6.4.299, 2026-10-20 | |
| Preview (PDFKit) | macOS 15.6.1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Automated, PDFKit via `scripts/check-pdfkit.swift`, 2026-10-20 | Fillable list boxes: Preview draws its own appearance without the selection highlight; value is correct |
| Open PDF Filler on iPhone (Safari) | iOS 27.0.1, iPhone 17 Pro Max | ✅ | ✅ | — | — | — | ✅ | Manual by Artem-1348 on the live site with the IRS W-9, 2026-10-21: "perfect" | Files/Markup uses PDFKit, checked automatically above |
| Adobe Acrobat Reader | macOS | — | — | — | — | — | — | Not tested: not installed on the test Mac; deferred to the Phase 6 matrix sign-off | |
| Adobe Acrobat Reader | Windows | — | — | — | — | — | — | Not tested (no device) | |
| Google Drive viewer | Android | — | — | — | — | — | — | Not tested (no device) | |
| Adobe Acrobat Reader | Android | — | — | — | — | — | — | Not tested (no device) | |
| Edge built-in viewer | Windows | — | — | — | — | — | — | Not tested (no device); same engine as Chrome | |
| Okular | Linux | — | — | — | — | — | — | Not tested (no device) | |
| Evince / Papers | Linux | — | — | — | — | — | — | Not tested (no device) | |

## Phase 3 gate: a 20-field form built in the app

Same viewers; additionally check that Tab moves through fields in page order.

| Viewer | Platform | All 20 fields fill | Tab order | Version / date | Notes |
| --- | --- | --- | --- | --- | --- |
| Adobe Acrobat Reader | Windows | — | — | | |
| Adobe Acrobat Reader | macOS | — | — | | |
| Preview | macOS | — | — | | |
| Files / Markup | iOS | — | — | | |
| Google Drive viewer | Android | — | — | | |
| Chrome built-in viewer | Desktop | — | — | | |

## Phase 6 sign-off

10 representative exported forms × every viewer above. Track per form in a copy of
the Phase 2 table.

## Test devices

Real devices available for manual passes (fill in at the Phase 0 gate):

| Device | OS version | Browser(s) | Owner |
| --- | --- | --- | --- |
| MacBook Air (M3, 16 GB) | macOS 15.6.1 | Chromium 152 (Claude desktop browser pane); Playwright Chromium, Firefox, WebKit | Artem-1348 |
| iPhone 17 Pro Max | iOS 27.0.1 | Safari | Artem-1348 |

Still needed for the Phase 2 matrix: an Android phone, a Windows PC, and a Linux machine
(or volunteers who have them).
