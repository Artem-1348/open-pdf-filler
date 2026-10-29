# Phase 4 — Auto-detect (FR-6, FR-7): test report

**Date:** 2026-10-22 · **Gate:** on the flat-form corpus, at least 85% of real fields found and at
least 85% of suggestions correct; NFR-4 met; any miss fixable in three clicks or fewer.

## Result: gate passed (detectors 0 and 1); detector 2 (AI scan) added and measured

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

## Detector 2 (AI scan), added 2026-10-28

After the owner's feedback that custom forms weren't detected, the CommonForms FFDetr model
(Apache-2.0) was added as an optional AI scan. Measured with the same matching rule, page 1 of each
file (`src/detect/model.test.ts`):

| Test file | Quick scan (rules) | AI scan (rules + model) |
| --- | --- | --- |
| Corpus form flattened by PDFium | 5 / 5 | 5 / 5 |
| Synthetic flat form | 25 / 25 | 25 / 25 |
| Same form as a picture only | 25 / 25 | 25 / 25 |
| **New:** custom-style form (shaded blanks, dotted leaders, typed underscores, rounded and dashed boxes, round and "( )" choices, white boxes on a grey band) | **0 / 21** | **19 / 21** |
| IRS W-9 page 1, fields hidden | 19 / 23 | **23 / 23** |
| **Overall found** | 75% | **98%** |
| **Overall right** | 100% | **100%** |

Owner's real form (8 pages, checked locally, not committed), scored as if it had been printed and
scanned (detector 0 off), a match being a suggestion whose centre lies in a real field of the same
family: quick scan 76 / 328 found, AI scan **244 / 328** found with 75% right. With the file as it
is, detector 0 still rebuilds all 328.

Speed (one thread, WebAssembly): about 3.8 s a page on a MacBook Air M3 in Node and 4.1 s for one
page in Chromium including loading the cached model. The iPhone timing is a manual check.

## What was built

| Item | Delivered |
| --- | --- |
| Detector 0 | Rebuilds fields stripped by a PDFium flatten ("Print → Save as PDF") from their leftover shells; exact positions |
| Detector 1 | Rule-based, from the rendered page (works on scans): boxes, table cells, label-above and label-left cells, small squares, underlines, "$" amounts, digit boxes (SSN/EIN), table-header filter |
| Naming (FR-7) | From the nearest label (right of checkboxes; left or above text fields); "Signature" and "Date" labels set the field type |
| Review (FR-6) | Dashed suggestions with a confidence badge; tap to inspect, change type or name, move or resize; accept or reject one, several, or all; confidence filter; undo |
| Fixing a miss | Two taps with the Phase 3 palette |

## Changes from the owner's testing (2026-10-29)

| Feedback | Change |
| --- | --- |
| Adding many text boxes means picking the tool again each time | A picked tool (Fill and Edit form) stays on until **Done**. In Fill mode, Done then starts typing in the first empty text box. Choice buttons tapped in a row make one question |
| The delete button on a small checkbox covers the next one | Delete, A−/A+ and Keep/Remove moved from the page to a bar at the bottom of the screen (above the keyboard while typing) |
| Deleting many close checkboxes one by one is slow | New **Select** tool in both modes: draw a loop around items or fields, then Delete (one undo step) |
| "Radio" is unclear | Renamed **Choice**, with a hint: "Tap each choice. Only one can be picked" |
| Changing a placed date means typing | A **Calendar** button in the bar opens the system date picker; typing still works |

## Bugs found and fixed in this phase

| Bug | Severity | Found by |
| --- | --- | --- |
| Form fields on rotated pages were placed wrongly (PDFium reports the rotated corner with unrotated size), affecting Fill, Edit form and saving | P2 | Detector 0 tests |
| PDFium's text-rect call returns stray characters in labels; switched to text runs | P3 | Naming review |

## Not done yet

- **Detector 2 on iPhone:** speed and memory on the owner's iPhone 17 Pro Max (manual).
- **Faster AI scan:** WebGPU, or multi-threading through a cross-origin-isolating service worker.
- **YES/NO pairs as radio groups:** two checkboxes per question are suggested as separate
  checkboxes.
- **iPhone timing** for NFR-4 (manual).
