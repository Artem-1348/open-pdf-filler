# Phase 2 — Fill & save: design

**Requirements:** FR-3 (fill existing forms), FR-4 (fill flat PDFs), FR-9 (export).
**Gate:** filled files reopen with every value intact in Acrobat, Preview, Chrome, iOS and Android.

## What the user can do

1. **Fill existing form fields** (text, checkbox, radio, dropdown, list) right on the page.
2. **Add to any page:** text, a checkmark, today's date, and a drawn or typed signature. Each
   placed item can be moved, resized (font size for text) and deleted.
3. **Save** a new file, either:
   - **Fillable PDF:** form fields stay editable in other apps; placed items become part of the page.
   - **Flattened copy:** everything becomes part of the page and can't be changed.
4. The original file is never changed. Closing or opening another file with unsaved changes asks first.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Write appearance streams in Phase 2** (the roadmap had them in Phase 6) | Preview and iOS don't redraw fields themselves; without appearances the Phase 2 gate can't pass. |
| D2 | **Placed items are drawn into the page** (like ink on paper), not added as annotations | Every viewer shows page content the same way; annotation support varies. |
| D3 | **Signatures are images or text, never `/Sig` fields** | Certificate signatures are out of scope for v1, and an empty `/Sig` field makes Acrobat offer certificate signing. |
| D4 | **Remove XFA on save** | Acrobat shows XFA data in preference to the form fields, so stale XFA would hide the values we write (e.g. the IRS W-9). |
| D5 | **Non-Latin text:** embed Noto Sans (Latin, Cyrillic, Greek, Vietnamese), subset, only when needed | Standard PDF fonts only cover Western European characters. The font ships with the app (no CDN). Other scripts (CJK, Arabic, Hebrew…) show a clear "not supported yet" message until Phase 6. |
| D6 | **Password-protected files stay protected:** the saved copy uses the same open password | Saving a protected file without protection would be a surprising privacy downgrade. |
| D7 | **Checkboxes and radios are stored as "which widget is on"** | Some forms have one checkbox field with several boxes that act like radio buttons; this handles both. |
| D8 | **Respect "no form filling" permissions** | If the document's permissions forbid filling, fields are read-only and a notice says why. |

## Architecture

```
PDFium (worker) ── reads fields: name, type, value, options, position per page
      │
React editor state ── field values (by field name) + placed items (page, box, content)
      │                rendered as HTML controls over the page image (page drawn without fields)
      ▼
src/pdf/writer.ts ── the only module that writes PDFs (@cantoo/pdf-lib)
      1. load original bytes (with password)
      2. set changed field values; generate appearances
      3. draw placed items into page content (rotation-aware)
      4. optionally flatten
      5. remove XFA; re-encrypt if the original was protected
      ▼
download "<name> (filled).pdf" or "<name> (flattened).pdf"
```

Positions are kept in the viewer's coordinate space (points, top-left origin, page as displayed),
and converted to PDF space only in the writer, which handles page rotation and crop-box offsets.

## How it's tested

| Level | What |
| --- | --- |
| Unit | Coordinate conversion for all rotations, date formatting, file names, text encoding checks |
| Writer (Node) | Fill every field type, place every item type, save, then reopen the result in **PDFium** (Chrome, Android Chrome) and **PDF.js** (Firefox) and check every value and placed text |
| Preview / iOS engine | `scripts/check-pdfkit.swift` reopens saved files with Apple's PDFKit (Preview and iOS Files) on a Mac and reports field values and renders pages |
| End-to-end | Fill in the app → save → reopen the download in the app → values intact; on all five browser profiles |
| Manual | Acrobat Reader, Preview, iOS Files, Chrome, Android, recorded in `docs/viewer-matrix.md` |

## Out of scope for Phase 2

Building new form fields (Phase 3), auto-detect (Phase 4), undo/redo (Phase 3), autosaving drafts,
editing existing page text, certificate signatures.
