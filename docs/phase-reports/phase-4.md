# Phase 4 — Auto-detect (FR-6, FR-7): test report

**Date:** 2026-10-22 · **Gate:** on the flat-form corpus, at least 85% of real fields found and at
least 85% of suggestions correct; NFR-4 met; any miss fixable in three clicks or fewer.

## Result: gate passed for detectors 0 and 1; detector 2 (model) awaiting a decision

| Test file | Found | Right | Time / page |
| --- | --- | --- | --- |
| Corpus form flattened by PDFium | 5 / 5 (100%) | 5 / 5 (100%) | 40 ms |
| Synthetic flat form (drawn lines, boxes, table, underlines, $, SSN boxes) | 25 / 25 (100%) | 25 / 25 (100%) | 36 ms |
| Same form as a picture only (no text layer) | 25 / 25 (100%) | 25 / 25 (100%) | 72 ms |
| IRS W-9 page 1, fields hidden | 19 / 23 (83%) | 19 / 19 (100%) | 89 ms |
| **Overall** | **95%** | **100%** | |
| Project owner's real form (8 pages; checked locally, not committed) | 328 / 328 (detector 0) | | 0.3 s for all 8 pages in the app |

The synthetic forms were designed for these tests, so their 100% partly reflects that; the W-9 is
the independent real-world check. Timings: MacBook Air M3, Node / Chromium. NFR-4 (under 5 s per
page on a laptop) is met by a wide margin; the iPhone timing is a manual check (pending).

Matching rule: a suggestion counts if it overlaps a real field with IoU ≥ 0.5 and is the same
family (checkbox, or text-like). Scoring code: `tests/support/detect-eval.ts`; test:
`src/detect/detect.test.ts`.

## What was built

| Item | Delivered |
| --- | --- |
| Detector 0 | Rebuilds fields stripped by a PDFium flatten ("Print → Save as PDF") from their leftover shells; exact positions |
| Detector 1 | Rule-based, from the rendered page (works on scans): boxes, table cells, label-above and label-left cells, small squares, underlines, "$" amounts, digit boxes (SSN/EIN), table-header filter |
| Naming (FR-7) | From the nearest label (right of checkboxes; left or above text fields); "Signature" and "Date" labels set the field type |
| Review (FR-6) | Dashed suggestions with a confidence badge; tap to inspect, change type or name, move or resize; accept or reject one, several, or all; confidence filter; undo |
| Fixing a miss | Two taps with the Phase 3 palette |

## Bugs found and fixed in this phase

| Bug | Severity | Found by |
| --- | --- | --- |
| Form fields on rotated pages were placed wrongly (PDFium reports the rotated corner with unrotated size), affecting Fill, Edit form and saving | P2 | Detector 0 tests |
| PDFium's text-rect call returns stray characters in labels; switched to text runs | P3 | Naming review |

## Not done yet

- **Detector 2 (CommonForms model).** Needs a licence answer from the model's author (none is
  stated) and a ~25 MB download per user. Scheduled as the roadmap's spike after the decision.
- **YES/NO pairs as radio groups:** two checkboxes per question are suggested as separate
  checkboxes.
- **iPhone timing** for NFR-4 (manual).
