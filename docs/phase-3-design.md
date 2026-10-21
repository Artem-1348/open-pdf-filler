# Phase 3 — Manual form builder: design

**Requirement:** FR-5 Build a form: create, move, resize and delete fields; set name, required,
multiline, font size, checkbox export value.
**Roadmap scope:** field palette (text, checkbox, radio group, dropdown, date, signature); drag,
resize, align, duplicate, undo/redo; properties panel and tab order.
**Gate:** a 20-field form built in the app fills correctly in the same five viewers (Acrobat,
Preview, Chrome, iOS, Android); Tab moves through fields in page order.

## What the user can do

1. Switch the toolbar between **Fill** (Phase 2) and **Edit form**.
2. In **Edit form**, pick a field type and draw or tap to place it: text, checkbox, radio button,
   dropdown, date, signature. Existing fields in the PDF can be edited the same way.
3. **Select** a field (tap), **several** (Shift/⌘-click, or a long-press on phones), then move,
   resize, nudge with arrow keys, **duplicate**, **delete**, and **align** (left, right, top,
   bottom, centres; same width or height).
4. **Properties panel** (side panel on desktop, bottom sheet on phones): name, tooltip, required,
   read-only; per type: multi-line and max length (text), font size (auto or
   points), export value (checkbox), group and option value (radio), options list (dropdown).
5. **Tab order:** automatic page order (rows, top to bottom, left to right) with a list to
   reorder it by hand.
6. **Undo/redo** for everything in Edit form mode, and for filling too (backlog item).
7. Switch back to **Fill** to try the form, then **Save** a fillable copy as in Phase 2.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| E1 | **One field model for new and existing fields.** On entering Edit form, PDF fields become editable drafts; the writer applies the differences (create, update, delete). | Editing an existing form and building a new one are the same operation. |
| E2 | **Field names must be unique per type**; radio buttons in one group share a name. The panel flags clashes and suggests names (`Text 1`, `Text 2`…). | PDF merges same-named fields, which silently links their values. |
| E3 | **Tab order is written as the page's annotation order** and `/Tabs` is cleared. | Acrobat, Preview and PDF.js all follow annotation order when `/Tabs` is absent. |
| E4 | **Appearances are generated for every new or changed field** (as in Phase 2, D1). | Preview and iOS need them. |
| E5 | **Undo/redo keeps whole-state snapshots** (fields, values, placed items), capped at 100 steps. | Simple, and fast enough for forms with hundreds of fields. |
| E6 | **Signature fields are standard PDF signature fields** (`/Sig`). Tapping one in this app opens the signature pad; Acrobat users can also sign with a digital ID. | Agreed 2026-10-21: the standard type works with digital signing later. |
| E7 | **Date fields are text fields with a date hint** (e.g. "Date (MM/DD/YYYY)" in the tooltip), marked so this app shows a date picker. No scripts in the PDF. | Agreed 2026-10-21: no JavaScript inside PDFs. |

### Options considered (decided 2026-10-21)

**E6 — what a "signature field" becomes in the saved PDF**

- **(a) A standard signature field** (`/Sig`). ✅ Chosen. Acrobat users can sign it with a digital ID;
  in this app, tapping it opens the signature pad (as in Phase 2). Downside: Acrobat's click
  opens its "digital ID" dialog, which confuses people who just want to draw a signature.
- **(b) A text field labelled "Signature".** Every viewer lets people type their name into it;
  this app still offers the signature pad on top. Downside: no digital signing in Acrobat.

**E7 — what a "date field" becomes**

- **(a) A text field with a date hint** ✅ Chosen. ("MM/DD/YYYY" in its tooltip). This app shows a date
  picker. No scripts in the PDF.
- **(b) A text field with Acrobat's date-format script**, which validates and formats dates in
  Acrobat only; other viewers ignore it. Adds JavaScript to the PDF.

## Architecture

```
Edit form mode
  drafts: FieldDraft[]  (id, kind, name, page, box, props, sourceName?)   ← from PDF fields + new
  selection, tab order, undo stack
      │
src/pdf/writer.ts (extended)
  1. delete removed fields (and their widgets)
  2. update changed fields: rect, flags, DA font size, tooltip, options, export values
  3. create new fields (pdf-lib createTextField / CheckBox / RadioGroup / Dropdown / Signature)
  4. reorder each page's /Annots to the tab order; remove /Tabs
  5. then Phase 2 steps: values, placed items, flatten, re-encrypt
```

## How it's tested

| Level | What |
| --- | --- |
| Unit | Tab-order sorting (rows with tolerance), name clash detection, align/distribute maths, undo stack |
| Writer (Node) | Build the gate's 20-field form on a blank page; edit, move and delete fields in an existing form; reopen in PDFium, PDF.js and PDFKit; check types, names, rects, flags, options, export values and annotation order |
| End-to-end | Build the 20-field form in the app → save → reopen → fill every field → save → reopen; Tab walks fields in page order; undo/redo; phone layout |
| Manual | Acrobat (if installed), Preview, iPhone; recorded in `docs/viewer-matrix.md` |

## Out of scope for Phase 3

Auto-detect (Phase 4), default values (fill the form and save instead), calculated fields and
JavaScript actions, field validation
rules beyond required/max length, list boxes in the palette (dropdown covers the common case),
certificate signing.
