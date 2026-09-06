# Compare Anything

A browser-first comparison app: two inputs, deterministic differences, no accounts or document-processing backend.

## Run

Requires Node.js 20.19+ (Node.js 22 recommended).

```sh
npm install
npm run dev
```

Open http://localhost:5173. Production: `npm run build`, then serve `dist` using any static HTTPS host. `npm run preview` previews the production build locally. No API keys or environment variables are needed.

## Included

- Responsive two-input homepage, file/folder drag and drop, pasted text/images, examples, swapping, replacement, and automatic comparison.
- Worker-based text/word comparison with bounded runtime, explicit whitespace normalization, and deterministic label/value summaries.
- JSON/YAML/XML structural comparison with expandable original trees. XML preserves element order. Unsafe or malformed structures use explicit text fallback.
- CSV/TSV cell, row, and column differences, optional unique row identifiers, and paginated source tables.
- XLSX stored cells, formulas, cached results, sheets, and number formats. Single-sheet XLSX versus CSV compares stored textual values.
- DOCX extracted text comparison.
- PDFs: extracted text with page alignment, metadata changes, original previews, password entry, zoom, page navigation, separate appearance scans, and pixel difference maps.
- Images: pixel analysis in a worker, tolerance control, grouped regions, side-by-side, overlay, reveal slider, difference map, zoom, and PNG difference export.
- Folders/ZIPs: file hashing, additions/removals/modifications, conservative unique-content moves/renames, original trees, and nested file comparisons.
- EML and recognizable pasted emails: sender/recipient/subject/date fields, body changes, attachments, and nested attachment comparison.
- Search, filters, previous/next navigation, original views, HTML/TXT/JSON report downloads, and complete print/PDF reports.
- Session-only data, local processing, no analytics, no external fonts, and no cloud services.

## Comparison coverage and limits

This is a working broad release, not a claim that every format or semantic change is supported.

- Individual files: 100 MB. Collections: 15,000 entries / 500 MB total. ZIP/Office expansion: 250 MB. Image pixel analysis: 16 megapixels. These are safety limits, not performance guarantees.
- OCR is not included. Scanned PDFs have appearance comparison but may have no extractable text.
- PDF text alignment uses exact page text anchors. Appearance currently matches page positions; inserted pages can create downstream visual differences. Appearance counts are separate from text-report counts and are not included in the text export.
- DOCX comparison covers extracted text, not exact layout, tracked-change history, or all embedded objects.
- XLSX is supported; legacy XLS, macros, recalculation, chart appearance, and full spreadsheet style comparison are not. Workbook comparisons use cell addresses. CSV supports row identity selection.
- Images compare decoded pixels and alpha. A 32-pixel tile grid groups neighboring changed areas; region boundaries are approximate. Color-profile and animated-frame semantics are not guaranteed. Blink mode and automatic registration are not included.
- Code uses textual changes, not AST/function analysis. Moved paragraphs are not classified separately.
- ZIP is the supported archive format. Archives are not extracted onto disk. Duplicate file contents make move/rename history ambiguous and remain additions/removals.
- Browser folder access varies. The folder picker and ZIP input provide alternatives. No URLs, mailbox integrations, cloud sharing, or multi-version history.
- Large change lists show the first 1,000 matches, with full search and exports. Table source previews paginate 100 rows at a time. Original trees cap visible child lists to keep navigation responsive.
- SHA-256 processing reads one file at a time; archive decompression and Office parsing are bounded but not fully streaming.

Original files are never edited. Downloaded reports contain potentially sensitive changed content. Closing a comparison releases references; this is not a forensic memory-erasure guarantee.

## Verification

```sh
npm test
npm run test:ui
npm run build
npm audit
```

Engine tests cover text, normalization, structural types, row identity, quoted CSV, malformed input, email, content hashing, XML ordering, YAML cycles, empty CSV headers, ZIPs, rename ambiguity, XLSX formulas, DOCX extraction, and pixel regions.

DOM interaction tests execute real comparison engines through a worker shim and cover homepage/privacy, pasted empty content, summaries/navigation/export controls, data trees, spreadsheets, and nested folder comparison. They do not replace real-browser tests of PDF rendering, canvas, clipboard permissions, or folder access. The provided in-app browser runtime could not initialize in the build environment, so visual/browser QA remains outstanding.

## Architecture

- `src/main.jsx`: input workflow, shared result shell, navigation, exports, image viewer.
- `src/engine.js`: parsing, deterministic comparisons, coverage rules, resource limits.
- `src/compare.worker.js`: cancelable background processing and progress messages.
- `src/views.jsx`: structure/table/file-tree viewers and PDF appearance workflow.
- `src/pixels.js`, `src/pixels.worker.js`: image pixel analysis and region grouping.
- `src/styles.css`: responsive visual system and print styles.

Parser dependencies are bundled locally and larger Office/PDF modules load on demand. Deploy on HTTPS so file APIs, clipboard features, and Web Crypto are available. Keep all generated assets on the same origin.
