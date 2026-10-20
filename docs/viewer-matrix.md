# Viewer compatibility matrix

Exported PDFs must open and keep their values in every viewer below (NFR-2).
Used from Phase 2 (fill & save) and signed off in Phase 6.

How to test a row: open the exported file in that viewer, check that every field
shows its value, change one value, save, reopen. Record **✅ pass**, **❌ fail**
(link the issue), or **— not tested**, plus the date and viewer version.

## Phase 2 gate: filled files reopen with every value intact

| Viewer | Platform | Text | Checkbox | Radio | Dropdown | Signature | Version / date | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Adobe Acrobat Reader | Windows | — | — | — | — | — | | |
| Adobe Acrobat Reader | macOS | — | — | — | — | — | | |
| Preview | macOS | — | — | — | — | — | | Known to skip missing appearance streams |
| Files / Markup | iOS | — | — | — | — | — | | |
| Google Drive viewer | Android | — | — | — | — | — | | |
| Adobe Acrobat Reader | Android | — | — | — | — | — | | |
| Chrome built-in viewer | Desktop | — | — | — | — | — | | |
| Edge built-in viewer | Windows | — | — | — | — | — | | |
| Firefox built-in viewer (PDF.js) | Desktop | — | — | — | — | — | | |
| Okular | Linux | — | — | — | — | — | | |
| Evince / Papers | Linux | — | — | — | — | — | | |

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
