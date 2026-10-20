# Phase 0 — Foundation: test report

**Date:** 2026-10-20 · **Gate:** the deployed app loads on a laptop and a phone; CI is green.

## Result: gate passed, with one item carried over

| Phase 0 item | Status | Evidence |
| --- | --- | --- |
| Requirements signed off; open decisions resolved | ✅ mostly | Decisions below; model license still open (needed before Phase 4) |
| Repo with license, README, issue templates | ✅ | [github.com/Artem-1348/open-pdf-filler](https://github.com/Artem-1348/open-pdf-filler), MIT |
| App deployed to a static host | ✅ | [artem-1348.github.io/open-pdf-filler](https://artem-1348.github.io/open-pdf-filler/) (GitHub Pages, deployed by CI after tests pass) |
| CI: lint, unit tests, Playwright on every push | ✅ | GitHub Actions `CI` workflow, green on `main` |
| Test corpus v1 (~40 PDFs) | ⚠️ carried over | 17 synthetic files; real-world files still to add (see `tests/corpus/README.md`) |
| Viewer matrix tracking sheet | ✅ | [docs/viewer-matrix.md](../viewer-matrix.md) |

## Decisions

| Decision | Outcome |
| --- | --- |
| Platform | Web app (PWA) |
| Rendering engine | EmbedPDF 2.x (PDFium); PDF.js stays the fallback |
| Project license | MIT. The FFDNet model and CommonForms code state no license; the CommonForms dataset is Apache-2.0. Ask the author before Phase 4; if the model can't be used under MIT terms, train our own detector on the dataset. |
| Hosting | GitHub Pages, public repo |
| Test devices | MacBook Air M3 (macOS 15.6.1), iPhone 17 Pro Max (iOS 27.0.1) |
| Project name | "Open PDF Filler" (working name) |
| Auto-detect location | Pending (recommended: on-device only) |
| Word/Excel to PDF | Pending (recommended: after v1) |

## Gate checks

| Check | Device / browser | Result |
| --- | --- | --- |
| Deployed app loads and opens a PDF | MacBook Air M3, macOS 15.6.1, Chromium 152 | ✅ First page in 322 ms with the engine cached |
| Deployed app loads and opens a PDF; zoom works | iPhone 17 Pro Max, iOS 27.0.1, Safari | ✅ (manual check by Artem-1348) |
| Full automated suite against the deployed site | Playwright 1.64: Chromium, Firefox, WebKit, Pixel 7, iPhone 14 profiles | ✅ 271 passed, 24 skipped by design |
| CI green | GitHub Actions, ubuntu-latest | ✅ |

## Findings

1. **Fixed — blurry pages at high zoom in Safari.** CI on WebKit showed that at 400% the page
   bitmap (55M pixels) exceeded Safari's 16.7M-pixel canvas limit and silently failed to render.
   Page bitmaps are now capped to that budget.
2. **Fixed — no way to close a document** (found on the iPhone check). Added a Close button.
3. **Open — first visit is slower.** The PDF engine (4.6 MB, 2.2 MB compressed) downloads on the
   first visit, so the very first file can take a few seconds to appear. Later visits use the
   browser cache. Tracked against NFR-3 / NFR-5 for Phase 7 (offline caching, size budget).
4. **Open — one document at a time.** Opening a file replaces the current one. Multiple open
   files or a recent-files list goes to the backlog.
