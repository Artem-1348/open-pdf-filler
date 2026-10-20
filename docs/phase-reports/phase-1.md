# Phase 1 — Viewer (FR-1, FR-2): test report

**Date:** 2026-10-20 · **Gate:** every corpus file opens or shows a clear error; NFR-3 met;
the network log shows no document bytes leaving the device (NFR-1).

## Result: gate passed against the current corpus

The corpus is 18 files (17 synthetic + 1 real-world), short of the ~40 the roadmap asks for
(carried over from Phase 0). The gate must be re-run when the remaining real-world files are added.

## What was built

| Requirement | Delivered |
| --- | --- |
| FR-1 Open | File picker, drag-and-drop, "Open with" (desktop Chrome/Edge `file_handlers`; Android share target via service worker; not possible on iOS). Clear errors for empty, non-PDF and damaged files. Password prompt. Close button. |
| FR-2 Read | PDFium (EmbedPDF 2.15) in a Web Worker; zoom 25–400% plus fit width; thumbnails; page-number navigation; text search with highlights and next/previous; phone layout. |

## Gate checks

| Check | Where | Result |
| --- | --- | --- |
| Every corpus file opens or shows the expected error | 18 files × 5 browser profiles, local build, live site and CI | ✅ |
| NFR-3: 20-page PDF opens in under 2 s | Chromium 108 ms · Firefox 112 ms · WebKit 521 ms (live site, MacBook Air M3) | ✅ |
| NFR-3 on a slower machine | GitHub Actions runner: Chromium 277 ms · Firefox 269 ms · WebKit 1153 ms | ✅ |
| NFR-1: no document bytes leave the device | Full session (open 5 files, password, search, zoom, error) records only same-origin GETs; a deliberate cross-origin POST is blocked by the CSP | ✅ |
| Phone layout | Pixel 7 and iPhone 14 profiles: no sideways scrolling, tap targets ≥ 32 px | ✅ |
| Manual check on a real phone | iPhone 17 Pro Max, iOS 27.0.1, Safari: loads, opens, zooms | ✅ |
| Manual check on a laptop | MacBook Air M3, macOS 15.6.1: live site opens and renders | ✅ |

## Automated test totals

| Suite | Result |
| --- | --- |
| Typecheck and lint | ✅ |
| Unit tests (Vitest) | 33 passed |
| End-to-end (Playwright 1.64: Chromium, Firefox, WebKit, Pixel 7, iPhone 14) | 291 passed, 24 skipped by design (phone-only checks on desktop, keyboard shortcuts and NFR-3 on phones, Android share target outside Chromium) |
| CI run | [GitHub Actions run 39491469204](https://github.com/Artem-1348/open-pdf-filler/actions/runs/39491469204) |

## Bugs found and fixed in this phase

| Bug | Severity | Found by |
| --- | --- | --- |
| Pages stayed blurry above ~200% zoom in Safari (bitmap over the 16.7M-pixel canvas limit) | P2 | CI on WebKit / mobile Safari |
| No way to close a document | P3 | Manual iPhone check |
| "Not a PDF" message told users to pick a file ending in .pdf, even when it already did | P4 | Corpus run |

No open P1 or P2 bugs.

## Known limits (not Phase 1 scope)

- **First visit is slower:** the 2.2 MB (compressed) PDF engine downloads before the first file
  can render. Offline caching and the 3 MB first-load budget (NFR-5) are Phase 7.
- **Non-embedded CJK fonts** render with substitutes because CDN font fallback is disabled for
  privacy. Embedded fonts for non-Latin text are Phase 6.
- **One document at a time.** Multiple files or a recent-files list is in the backlog.
- **Not yet tested on:** Android hardware, Windows, Linux; an installed-app "Open with" on a
  real device.

## Definition of done

| Item | Status |
| --- | --- |
| Acceptance criteria pass | ✅ |
| Automated tests green in CI | ✅ |
| No open P1/P2 bugs | ✅ |
| One-page test report | ✅ this file |
| Demo on a laptop and a phone | ✅ |
| Tagged release v0.1 | ✅ v0.1.0 |
