# Roadmap changes and backlog

The roadmap PDF is the baseline. Changes agreed since then are recorded here, so each phase is
tested against the current plan. New ideas go to the backlog and are scheduled between phases.

## Changes to phases

| Date | Phase | Change | Why |
| --- | --- | --- | --- |
| 2026-10-20 | 2 (from 6) | Write appearance streams for every filled field | Preview and iOS don't draw fields themselves; the Phase 2 gate needs them ([design D1](phase-2-design.md)) |
| 2026-10-21 | 4 | **First detector: rebuild flattened fields** (before the rule-based and model detectors) | See below |

### Phase 4, detector 0: rebuild flattened fields

**Problem.** Many "flat" PDFs were fillable forms once. Saving them through a browser's
"Print → Save as PDF" (or any PDFium-based flatten) deletes the form fields but leaves their
empty appearance shells behind. Example: a real 8-page form shared by the project owner has no
form fields at all, yet still contains **328 shells** (249 text-line sized, 79 checkbox sized).

**How the shells look.** PDFium's flatten (`FPDFPage_Flatten`) wraps them in one form XObject per
page, named `/FFT0`, whose content places each shell with its own XObject:
`q 1 0 0 1 125.6 584.6 cm /F0 Do Q`. Each `/F#` keeps its `/BBox` (the field's size); the
`cm` gives its position. Blank fields leave 4-byte empty streams.

**Plan.**
1. Find `/FFT*` XObjects on each page; read each `/F#` placement (`cm`) and `/BBox`.
2. Turn each into a suggested field: small square → checkbox, wider box → text field (multi-line
   if tall); name it from the nearest label (FR-7, same as the other detectors).
3. Show them in the Phase 4 review panel like any other suggestion (accept / reject / edit), with
   high confidence, since the positions are exact rather than guessed.

**Test material.** Flatten the corpus's own fillable forms with PDFium to make synthetic examples
(the ground truth is the original fields). Real-world files only if they can be made public.

## Backlog (not scheduled)

| Idea | Raised | Notes |
| --- | --- | --- |
| Open several documents, or a recent-files list | Phase 0 phone check | One document at a time today |
| Autosave drafts on the device | Roadmap risk table | IndexedDB; nothing leaves the device |
| Undo/redo for filling | Phase 2 | Phase 3 brings undo/redo for the form builder; extend it to filling |
