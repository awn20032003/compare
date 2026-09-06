import { diffLines, diffWordsWithSpace, diffArrays } from "diff";
import Papa from "papaparse";
import { parse as parseYaml } from "yaml";
import { unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import PostalMime from "postal-mime";
import { openPdf } from "./pdf-runtime.js";

export const wordDiff = (a, b) =>
  diffWordsWithSpace(a, b, { timeout: 500, maxEditLength: 10000 }) || [
    { removed: true, value: a },
    { added: true, value: b },
  ];
export function textChanges(a, b, ignore = false) {
  const clean = (s) =>
    ignore
      ? s
          .split("\n")
          .map((x) => x.trim().replace(/\s+/g, " "))
          .join("\n")
      : s;
  const parts = diffLines(clean(a), clean(b), {
    timeout: 15000,
    maxEditLength: 100000,
  });
  if (!parts)
    throw Error(
      "This text comparison is too complex to finish within the browser limit. Compare smaller sections. No partial result has been reported.",
    );
  const out = [];
  let line = 1;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.added && !p.removed) {
      line += p.count;
      continue;
    }
    const next = parts[i + 1];
    let before = p.removed ? p.value : "",
      after = p.added ? p.value : "";
    if (p.removed && next?.added) {
      after = next.value;
      i++;
    }
    const leftLines = before.match(/[^\n]*\n|[^\n]+$/g) || [""],
      rightLines = after.match(/[^\n]*\n|[^\n]+$/g) || [""];
    if (before && after && leftLines.length === rightLines.length) {
      leftLines.forEach((value, j) =>
        out.push({
          kind: "modified",
          path: `Line ${line + j}`,
          before: value,
          after: rightLines[j],
          summary: fieldSummary(value, rightLines[j]),
        }),
      );
    } else
      out.push({
        kind: before && after ? "modified" : before ? "removed" : "added",
        path: `Line ${line}`,
        before,
        after,
        summary: fieldSummary(before, after),
      });
    if (before) line += p.count;
  }
  return out;
}
function fieldSummary(a, b) {
  const left = a.match(/^\s*([^:\n]{2,50}):\s*(.+?)\s*$/),
    right = b.match(/^\s*([^:\n]{2,50}):\s*(.+?)\s*$/);
  return left && right && left[1] === right[1]
    ? `${left[1]}: ${left[2]} → ${right[2]}`
    : null;
}
export function structuralChanges(a, b, path = "$", out = []) {
  if (path.length > 4000)
    throw Error("This structure is too deeply nested to compare safely.");
  if (Object.is(a, b)) return out;
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    Array.isArray(a) === Array.isArray(b)
  ) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const p = Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`;
      if (!Object.hasOwn(a, k))
        out.push({
          kind: "added",
          path: p,
          before: "",
          after: JSON.stringify(b[k], null, 2),
        });
      else if (!Object.hasOwn(b, k))
        out.push({
          kind: "removed",
          path: p,
          before: JSON.stringify(a[k], null, 2),
          after: "",
        });
      else structuralChanges(a[k], b[k], p, out);
    }
    return out;
  }
  out.push({
    kind: "modified",
    path,
    before: JSON.stringify(a, null, 2),
    after: JSON.stringify(b, null, 2),
  });
  return out;
}
export function tableChanges(
  a,
  b,
  key = "",
  columnsA = Object.keys(a[0] || {}),
  columnsB = Object.keys(b[0] || {}),
) {
  const out = [];
  for (const c of columnsA)
    if (!columnsB.includes(c))
      out.push({ kind: "removed", path: `Column ${c}`, before: c, after: "" });
  for (const c of columnsB)
    if (!columnsA.includes(c))
      out.push({ kind: "added", path: `Column ${c}`, before: "", after: c });
  const cols = [...new Set(columnsA.filter((c) => columnsB.includes(c)))];
  const map = (rows) =>
    new Map(rows.map((r, i) => [key ? String(r[key]) : String(i + 1), r]));
  if (
    key &&
    [a, b].some((rows) =>
      rows.some((r) => !Object.hasOwn(r, key) || r[key] === ""),
    )
  )
    throw Error(
      "The identifying column must exist and contain a value in every row.",
    );
  if (
    key &&
    [a, b].some(
      (rows) => new Set(rows.map((r) => String(r[key]))).size !== rows.length,
    )
  )
    throw Error(
      "That column has duplicate values. Choose a unique identifying column.",
    );
  const am = map(a),
    bm = map(b);
  for (const id of new Set([...am.keys(), ...bm.keys()])) {
    const x = am.get(id),
      y = bm.get(id);
    if (!x || !y) {
      out.push({
        kind: x ? "removed" : "added",
        path: `Row ${id}`,
        before: x ? JSON.stringify(x, null, 2) : "",
        after: y ? JSON.stringify(y, null, 2) : "",
      });
      continue;
    }
    for (const c of cols)
      if (!Object.is(x[c], y[c]))
        out.push({
          kind: !Object.hasOwn(x, c)
            ? "added"
            : !Object.hasOwn(y, c)
              ? "removed"
              : "modified",
          path: `Row ${id} · ${c}`,
          before: String(x[c] ?? ""),
          after: String(y[c] ?? ""),
        });
  }
  return out;
}
const textExt =
  /\.(txt|md|csv|tsv|json|yaml|yml|xml|html|css|js|jsx|ts|tsx|py|java|c|cpp|h|go|rs|sql|sh|log|ini|toml|svg)$/i;
export async function parseInput(input, progress = () => {}) {
  if (input.items) {
    if (
      input.items.length > 15000 ||
      input.items.some((x) => x.file.size > 100 * 1024 * 1024) ||
      input.items.reduce((n, x) => n + x.file.size, 0) > 500 * 1024 * 1024
    )
      throw Error(
        "This collection exceeds the browser limit: 15,000 files, 100 MB per file, or 500 MB total.",
      );
    if (new Set(input.items.map((x) => x.path)).size !== input.items.length)
      throw Error(
        "This collection contains duplicate paths. Choose one folder or use unique file names.",
      );
    return { type: "collection", files: input.items, name: input.name };
  }
  const file = input.file;
  const name = input.name || file?.name || "Pasted text";
  let ext = name.split(".").pop().toLowerCase();
  if (file) {
    if (file.size > 100 * 1024 * 1024)
      throw Error("This file exceeds the 100 MB browser limit.");
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (String.fromCharCode(...signature.slice(0, 5)) === "%PDF-") ext = "pdf";
    if (
      (signature[0] === 0x89 && signature[1] === 0x50) ||
      (signature[0] === 0xff && signature[1] === 0xd8)
    )
      return { type: "image", file, name };
    if (
      signature[0] === 0x50 &&
      signature[1] === 0x4b &&
      !["docx", "xlsx", "pptx"].includes(ext)
    )
      ext = "zip";
  }
  progress(`Reading ${name}`);
  if (file && ["docx", "xlsx"].includes(ext)) {
    let expanded = 0,
      entries = 0;
    unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (e) => {
        if (
          ++entries > 15000 ||
          (expanded += e.originalSize) > 250 * 1024 * 1024
        )
          throw Error(
            "This document expands beyond the safe browser processing limit.",
          );
        return false;
      },
    });
  }
  if (
    file &&
    (file.type.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(name)) &&
    !/svg$/i.test(name)
  )
    return { type: "image", file, name };
  if (ext === "zip" && file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let total = 0,
      count = 0;
    const archive = unzipSync(bytes, {
      filter: (e) => {
        if (++count > 15000 || (total += e.originalSize) > 250 * 1024 * 1024)
          throw Error(
            "This archive exceeds the safe limit of 15,000 entries or 250 MB expanded.",
          );
        return !e.name.endsWith("/");
      },
    });
    return {
      type: "collection",
      name,
      files: Object.entries(archive).map(([path, data]) => ({
        path,
        file: new File([data], path.split("/").pop()),
      })),
    };
  }
  if (ext === "pdf" && file) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;
    const loading = openPdf(
      pdfjs,
      {
        data: new Uint8Array(await file.arrayBuffer()),
        isEvalSupported: false,
        password: input.password,
        ...(typeof location !== "undefined"
          ? {
              standardFontDataUrl: new URL(
                `${import.meta.env?.BASE_URL || "/"}pdf-assets/standard_fonts/`,
                location.origin,
              ).href,
              cMapUrl: new URL(
                `${import.meta.env?.BASE_URL || "/"}pdf-assets/cmaps/`,
                location.origin,
              ).href,
              cMapPacked: true,
            }
          : {}),
      },
      pdfjs.GlobalWorkerOptions.workerSrc,
    );
    try {
      const doc = await loading.promise;
      let pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        progress(`Reading page ${i} of ${doc.numPages}`);
        const page = await doc.getPage(i),
          content = await page.getTextContent();
        pages.push(
          content.items.map((x) => x.str + (x.hasEOL ? "\n" : " ")).join(""),
        );
      }
      const metadata = (await doc.getMetadata().catch(() => ({ info: {} })))
        .info;
      return {
        type: "document",
        name,
        text: pages.join("\n\n"),
        pages,
        format: "PDF",
        file,
        password: input.password,
        metadata,
        notice: pages.every((p) => !p.trim())
          ? "No extractable text was found. Use Appearance to compare scanned pages. OCR is not included."
          : undefined,
      };
    } finally {
      await loading.destroy();
    }
  }
  if (ext === "docx" && file) {
    const mammoth = await import("mammoth/mammoth.browser.js");
    const result = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    return {
      type: "document",
      name,
      text: result.value,
      format: "DOCX",
      notice:
        "Document text compared. Formatting, embedded objects and tracked-change history are not compared.",
    };
  }
  if (ext === "xlsx" && file) {
    const { default: ExcelJS } = await import("exceljs");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    const sheets = {};
    const tables = {};
    for (const sheet of book.worksheets) {
      const cells = {};
      sheet.eachRow((row, r) =>
        row.eachCell((cell, c) => {
          cells[cell.address] = {
            value:
              cell.value instanceof Date
                ? cell.value.toISOString()
                : cell.value,
            format: cell.numFmt,
          };
        }),
      );
      sheets[sheet.name] = cells;
      const columns = [];
      sheet.getRow(1).eachCell((cell, i) => {
        columns[i - 1] = cell.text || `Column ${i}`;
      });
      const rows = [];
      sheet.eachRow((row, i) => {
        if (i > 1) {
          const record = {};
          columns.forEach((c, j) => (record[c] = row.getCell(j + 1).text));
          rows.push(record);
        }
      });
      tables[sheet.name] = { columns, rows };
    }
    return {
      type: "workbook",
      name,
      sheets,
      tables,
      notice:
        "Cell addresses, stored values, formulas and number formats compared. Macros are never executed; formulas are not recalculated.",
    };
  }
  if (ext === "xls")
    throw Error(
      "Legacy .xls workbooks are not supported. Save as .xlsx or CSV and try again.",
    );
  let text = input.text;
  if (text === undefined) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const encoding =
      bytes[0] === 0xff && bytes[1] === 0xfe
        ? "utf-16le"
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? "utf-16be"
          : "utf-8";
    text = new TextDecoder(encoding).decode(bytes);
  }
  if (ext !== "xml" && /^\s*<\?xml\b/.test(text)) ext = "xml";
  if (!file && ext !== "csv" && text.split("\n").length >= 3) {
    const trial = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (
      !trial.errors.length &&
      trial.meta.fields?.length > 1 &&
      trial.data.length >= 2
    )
      ext = "csv";
  }
  if (
    ext === "eml" ||
    (/^From: .+$/m.test(text) &&
      /^Subject: .+$/m.test(text) &&
      /^To: .+$/m.test(text))
  ) {
    const mail = await PostalMime.parse(text);
    return {
      type: "email",
      name,
      text: mail.text || mail.html?.replace(/<[^>]*>/g, " ") || "",
      headers: {
        From: mail.from
          ? `${mail.from.name || ""} <${mail.from.address || ""}>`
          : "",
        To: (mail.to || [])
          .map((x) => `${x.name || ""} <${x.address || ""}>`)
          .sort()
          .join(", "),
        CC: (mail.cc || [])
          .map((x) => `${x.name || ""} <${x.address || ""}>`)
          .sort()
          .join(", "),
        Subject: mail.subject || "",
        Date: mail.date || "",
      },
      attachments: (mail.attachments || []).map((x) => ({
        path: x.filename || "attachment",
        file: new File([x.content], x.filename || "attachment", {
          type: x.mimeType,
        }),
      })),
    };
  }
  if (ext === "json" || /^[\s]*[\[{]/.test(text)) {
    try {
      return {
        type: "structure",
        name,
        data: JSON.parse(text),
        text,
        format: "JSON",
      };
    } catch (e) {
      if (ext === "json")
        return {
          type: "text",
          name,
          text,
          notice: "Invalid JSON. Showing a text comparison instead.",
        };
    }
  }
  if (["yaml", "yml"].includes(ext)) {
    try {
      const data = parseYaml(text, { maxAliasCount: 100 });
      JSON.stringify(data);
      return {
        type: "structure",
        name,
        data,
        text,
        format: "YAML",
      };
    } catch {
      return {
        type: "text",
        name,
        text,
        notice: "Invalid YAML. Showing a text comparison instead.",
      };
    }
  }
  if (ext === "xml") {
    if (/<!DOCTYPE|<!ENTITY/i.test(text))
      return {
        type: "text",
        name,
        text,
        notice:
          "XML declarations with entities are compared as text for safety.",
      };
    if (XMLValidator.validate(text) !== true)
      return {
        type: "text",
        name,
        text,
        notice: "Invalid XML. Showing a text comparison instead.",
      };
    return {
      type: "structure",
      name,
      text,
      format: "XML",
      data: new XMLParser({
        ignoreAttributes: false,
        preserveOrder: true,
        parseTagValue: false,
        parseAttributeValue: false,
        trimValues: false,
        processEntities: false,
      }).parse(text),
    };
  }
  if (["csv", "tsv"].includes(ext)) {
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: ext === "tsv" ? "\t" : ",",
    });
    if (result.errors.length)
      throw Error(
        "This table has inconsistent rows or headers. Check the CSV formatting.",
      );
    return {
      type: "table",
      name,
      rows: result.data,
      columns: result.meta.fields || [],
      text,
    };
  }
  if (file && !textExt.test(name) && text.includes("\0"))
    return { type: "binary", file, name };
  return { type: "text", name, text };
}
async function hash(file) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function collectionChanges(a, b, progress = () => {}) {
  const out = [],
    am = new Map(a.files.map((x) => [x.path, x])),
    bm = new Map(b.files.map((x) => [x.path, x]));
  let n = 0;
  const paths = new Set([...am.keys(), ...bm.keys()]);
  for (const path of paths) {
    progress(`Comparing file ${++n} of ${paths.size}`);
    const x = am.get(path),
      y = bm.get(path);
    if (!x || !y)
      out.push({
        kind: x ? "removed" : "added",
        path,
        before: x ? `${x.file.size} bytes` : "",
        after: y ? `${y.file.size} bytes` : "",
        left: x,
        right: y,
      });
    else if ((await hash(x.file)) !== (await hash(y.file)))
      out.push({
        kind: "modified",
        path,
        before: `${x.file.size} bytes`,
        after: `${y.file.size} bytes`,
        left: x,
        right: y,
      });
  }
  const removed = out.filter((c) => c.kind === "removed"),
    added = out.filter((c) => c.kind === "added");
  const signatures = new Map();
  for (const c of [...removed, ...added]) {
    const digest = await hash((c.left || c.right).file);
    const group = signatures.get(digest) || { removed: [], added: [] };
    group[c.kind].push(c);
    signatures.set(digest, group);
  }
  for (const group of signatures.values())
    if (group.removed.length === 1 && group.added.length === 1) {
      const old = group.removed[0],
        next = group.added[0];
      out.splice(out.indexOf(old), 1);
      out.splice(out.indexOf(next), 1);
      out.push({
        kind:
          old.path.split("/").pop() === next.path.split("/").pop()
            ? "moved"
            : "renamed",
        path: `${old.path} → ${next.path}`,
        before: old.path,
        after: next.path,
        left: old.left,
        right: next.right,
      });
    }
  return out;
}
export async function compare(a, b, options = {}, progress = () => {}) {
  let changes = [],
    notice = [a.notice, b.notice].filter(Boolean).join(" "),
    mode = "text";
  if (a.type === "collection" && b.type === "collection") {
    changes = await collectionChanges(a, b, progress);
    mode = "collection";
    notice = `File contents checked using SHA-256. Unique identical files are recognized as moves or renames. ${a.files.length} files before · ${b.files.length} files after.`;
  } else if (a.type === "image" && b.type === "image") {
    return {
      changes: [],
      mode: "image",
      notice: "Image analysis has not completed.",
      complete: false,
    };
  } else if (a.type === "binary" || b.type === "binary") {
    if (!a.file || !b.file)
      throw Error("These inputs do not have a shared representation.");
    changes =
      (await hash(a.file)) === (await hash(b.file))
        ? []
        : [
            {
              kind: "modified",
              path: "File contents",
              before: `${a.file.size} bytes`,
              after: `${b.file.size} bytes`,
            },
          ];
    notice = "Binary contents checked. Detailed interpretation is unavailable.";
  } else if (a.type === "structure" && b.type === "structure") {
    changes = structuralChanges(a.data, b.data);
    mode = "structure";
    notice = "Object property order ignored. Array order is significant.";
  } else if (a.type === "table" && b.type === "table") {
    changes = tableChanges(a.rows, b.rows, options.key, a.columns, b.columns);
    mode = "table";
    notice = options.key
      ? `Rows matched by ${options.key}.`
      : "Rows matched by position. Choose an identifying column if rows were reordered.";
  } else if (a.type === "workbook" && b.type === "workbook") {
    mode = "table";
    changes = structuralChanges(a.sheets, b.sheets, "Workbook");
  } else if (
    [a.type, b.type].includes("table") &&
    [a.type, b.type].includes("workbook")
  ) {
    const book = a.type === "workbook" ? a : b;
    const values = Object.values(book.tables);
    if (values.length !== 1)
      throw Error(
        "For CSV versus Excel, use a workbook with one sheet or export the desired sheet as CSV.",
      );
    const left = a.type === "table" ? a : values[0],
      right = b.type === "table" ? b : values[0];
    changes = tableChanges(
      left.rows,
      right.rows,
      options.key,
      left.columns,
      right.columns,
    );
    mode = "table";
    notice =
      "CSV versus Excel: first row used as headers; stored text values matched by row position. Formulas and formatting are not compared across formats.";
  } else if (a.type === "email" && b.type === "email") {
    mode = "email";
    changes = [
      ...structuralChanges(a.headers, b.headers, "Headers"),
      ...textChanges(a.text, b.text, options.ignore).map((c) => ({
        ...c,
        path: `Body · ${c.path}`,
      })),
      ...(await collectionChanges(
        { files: a.attachments },
        { files: b.attachments },
        progress,
      )),
    ];
  } else if (a.format === "PDF" && b.format === "PDF") {
    let oldPage = 1,
      newPage = 1;
    const parts = diffArrays(a.pages, b.pages, { timeout: 15000 });
    if (!parts)
      throw Error(
        "This PDF has too many page differences. Compare smaller page ranges.",
      );
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part.added && !part.removed) {
        oldPage += part.count;
        newPage += part.count;
        continue;
      }
      const next = parts[i + 1];
      if (part.removed && next?.added) {
        const count = Math.max(part.count, next.count);
        for (let j = 0; j < count; j++) {
          if (j < part.count && j < next.count)
            changes.push(
              ...textChanges(part.value[j], next.value[j], options.ignore).map(
                (c) => ({
                  ...c,
                  path: `Page ${oldPage + j} → ${newPage + j} · ${c.path}`,
                  beforePage: oldPage + j,
                  afterPage: newPage + j,
                }),
              ),
            );
          else
            changes.push({
              kind: j < part.count ? "removed" : "added",
              path: `Page ${j < part.count ? oldPage + j : newPage + j}`,
              before: part.value[j] || "",
              after: next.value[j] || "",
              beforePage: j < part.count ? oldPage + j : null,
              afterPage: j < next.count ? newPage + j : null,
            });
        }
        oldPage += part.count;
        newPage += next.count;
        i++;
      } else {
        part.value.forEach((text, j) =>
          changes.push({
            kind: part.removed ? "removed" : "added",
            path: `Page ${part.removed ? oldPage + j : newPage + j}`,
            before: part.removed ? text : "",
            after: part.added ? text : "",
            beforePage: part.removed ? oldPage + j : null,
            afterPage: part.added ? newPage + j : null,
          }),
        );
        if (part.removed) oldPage += part.count;
        else newPage += part.count;
      }
    }
    notice += ` ${a.pages.length} pages before · ${b.pages.length} pages after. Text-aligned pages compared. Appearance is scanned separately.`;
    changes.push(
      ...structuralChanges(a.metadata || {}, b.metadata || {}, "Metadata").map(
        (c) => ({ ...c, category: "metadata" }),
      ),
    );
  } else if (typeof a.text === "string" && typeof b.text === "string") {
    changes = textChanges(a.text, b.text, options.ignore);
    if (a.type === "document" || b.type === "document")
      notice +=
        " Extracted text compared. Page appearance is available in the original previews; visual changes are not counted.";
  } else
    throw Error(
      "These inputs cannot be compared together. Try two documents, two images, or two file collections.",
    );
  if (options.ignore) notice += " Whitespace differences are ignored.";
  return {
    changes,
    mode,
    notice,
    identicalBytes:
      a.file && b.file ? (await hash(a.file)) === (await hash(b.file)) : false,
  };
}
