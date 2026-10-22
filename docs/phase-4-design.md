# Phase 4 — Auto-detect (FR-6, FR-7): design

**Requirements.** FR-6: find text boxes, checkboxes and signature boxes on flat or scanned pages;
show them as suggestions with a confidence score; accept, reject or edit one at a time or in bulk.
FR-7: name each detected field from the label next to it.
**Gate:** on the flat-form corpus, at least 85% of real fields found and at least 85% of
suggestions correct; NFR-4 (one page in under 5 s on a laptop, 15 s on a mid-range phone); any
miss fixable in three clicks or fewer.

## Detectors

Run in order; later detectors skip places an earlier one (or an existing field) already covers.

| # | Detector | Finds | Confidence | Needs |
| --- | --- | --- | --- | --- |
| 0 | **Rebuild flattened fields** ([roadmap-changes.md](roadmap-changes.md)) | Exact boxes of fields stripped by "Print → Save as PDF" | 0.98 | Nothing: reads the PDF's leftover shells |
| 1 | **Rule-based lines and boxes** | Underlines, empty boxes, small squares, empty table cells; works on scans | 0.5–0.9 by shape | Nothing: analyses the rendered page image |
| 2 | **Model (CommonForms FFDNet-S)** | What the rules miss: unusual layouts, photos of paper forms | model score | Model download (~25 MB) and a license check; **separate decision** |

Detector 2 follows the roadmap's spike: export the model to ONNX, time it in the browser on a
laptop and a phone, confirm the license, write a one-page go/no-go memo. It needs the model
author's answer on licensing (see Phase 0 report), so it is scheduled after detectors 0 and 1.

### Detector 0 — rebuild flattened fields

PDFium's flatten leaves one form XObject per page (`/FFT0`) that places every field's former
appearance (`/F0`, `/F1`, …) with a `cm` matrix. Read the page content and `/FFT*` content with a
small content-stream parser (q/Q, cm, Do), compose the matrices with each shell's `/BBox` and
`/Matrix`, and convert to view space. Kind from shape and label: small square → checkbox;
tall → multi-line text; label mentions "sign" → signature; "date" → date; otherwise text.

### Detector 1 — rule-based lines and boxes

Render the page at 2 px per point, grey-scale, threshold. Find horizontal and vertical ink runs
(thin and long), join them into lines, then:

| Shape | Becomes | Rules |
| --- | --- | --- |
| Small square (6–24 pt, near 1:1, empty inside) | Checkbox | Closed by 4 lines, or a dark square outline |
| Rectangle (height 10–60 pt, width ≥ 30 pt, empty inside) | Text field (multi-line if tall) | Closed by 4 lines; not a page border or a big table |
| Underline (≥ 30 pt long, thin, empty space above) | Text field sitting on the line | Height = the gap above, capped at 20 pt |
| Empty table cell | Text field | A rectangle as above inside a grid |

"Empty" means little ink inside, so it also works on scans. Results merge with detector 0 and
existing fields: overlaps with them are dropped.

### Naming (FR-7)

From the page's text layer (PDFium text runs): the nearest text to the left on the same line, or
just above, within 120 pt; trimmed of ":" and "_"; unique per document. Scans without a text layer
get kind-based names ("Text 1") until OCR arrives in Phase 5.

## Review (FR-6)

Suggestions appear in **Edit form** as dashed boxes with a confidence badge. The panel shows
"Found N fields" with **Accept all**, **Reject all** and a **confidence slider** that hides weak
ones; each suggestion has **Accept** / **Reject**, and can be moved, resized or retyped first like
any field. Accepted suggestions become normal fields (undo works). A miss is fixed with the Phase 3
palette: pick a type, tap the page, done (two taps, within the three-click target).

## How it's measured

- **Corpus:** synthetic flat forms generated with known fields (text lines, boxes, checkboxes,
  tables, labels), the corpus's fillable forms flattened by PDFium (ground truth = the original
  fields), and scanned-style versions (rasterised, slightly rotated, noise). Real files only if they
  can be made public; the project owner's form is checked locally and never committed.
- **Scoring:** a suggestion matches a real field if their boxes overlap with IoU ≥ 0.5 and the kind
  agrees (text/date/signature count as "text-like"). Recall and precision per detector and overall.
- **Speed:** time per page on the laptop (automated) and on the iPhone (manual).
