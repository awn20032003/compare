import test from "node:test";
import assert from "node:assert/strict";
import {
  textChanges,
  structuralChanges,
  tableChanges,
  parseInput,
  compare,
  collectionChanges,
} from "../src/engine.js";
import { zipSync, strToU8 } from "fflate";
import { comparePixels } from "../src/pixels.js";
test("text preserves replacements, additions and identical content", () => {
  assert.deepEqual(textChanges("same", "same"), []);
  const c = textChanges("hello\nold\n", "hello\nnew\n");
  assert.equal(c[0].kind, "modified");
  assert.equal(c[0].path, "Line 2");
  assert.equal(c[0].before, "old\n");
  assert.equal(c[0].after, "new\n");
  assert.equal(textChanges("", "new")[0].kind, "added");
});
test("whitespace normalization is explicit", () => {
  assert.equal(textChanges("hello  world", "hello world").length, 1);
  assert.equal(textChanges("hello  world", "hello world", true).length, 0);
});
test("structure respects types, array order, and absent properties", () => {
  assert.equal(structuralChanges({ a: 1, b: 2 }, { b: 2, a: 1 }).length, 0);
  assert.equal(structuralChanges({ a: 1 }, { a: "1" })[0].kind, "modified");
  assert.equal(structuralChanges({}, { a: null })[0].kind, "added");
  assert.equal(structuralChanges([1, 2], [2, 1]).length, 2);
});
test("table identity handles reordering and rejects duplicate keys", () => {
  const a = [
    { id: "1", value: "a" },
    { id: "2", value: "b" },
  ];
  assert.equal(tableChanges(a, [a[1], a[0]], "id").length, 0);
  assert.throws(() => tableChanges(a, [a[0], a[0]], "id"), /duplicate/);
  assert.equal(
    tableChanges(a, [{ id: "1", value: "c" }, a[1]], "id")[0].path,
    "Row 1 · value",
  );
});
test("CSV handles quoted delimiters and line breaks", async () => {
  const a = await parseInput({
    name: "a.csv",
    text: 'id,notes\n1,"hello, world"\n2,"two\nlines"',
  });
  assert.equal(a.rows[0].notes, "hello, world");
  assert.equal(a.rows[1].notes, "two\nlines");
});
test("malformed JSON falls back truthfully", async () => {
  const a = await parseInput({ name: "bad.json", text: "{ broken" });
  assert.equal(a.type, "text");
  assert.match(a.notice, /Invalid JSON/);
});
test("email parses headers and body", async () => {
  const a = await parseInput({
    name: "mail.eml",
    text: "From: Sam <sam@example.com>\nSubject: Hello\nContent-Type: text/plain\n\nBody",
  });
  assert.equal(a.type, "email");
  assert.equal(a.headers.Subject, "Hello");
  assert.match(a.text, /Body/);
});
test("collections hash contents rather than sizes", async () => {
  const a = { files: [{ path: "a.txt", file: new File(["ab"], "a.txt") }] },
    b = { files: [{ path: "a.txt", file: new File(["cd"], "a.txt") }] };
  assert.equal((await collectionChanges(a, b))[0].kind, "modified");
  assert.deepEqual(await collectionChanges(a, a), []);
});
test("incompatible types do not produce false identical results", async () => {
  await assert.rejects(
    compare({ type: "image" }, { type: "text", text: "x" }),
    /cannot be compared/,
  );
});
test("XML comparison preserves element order but ignores attribute order", async () => {
  const a = await parseInput({
      name: "a.xml",
      text: '<root a="1" b="2"><item>one</item><item>two</item></root>',
    }),
    b = await parseInput({
      name: "b.xml",
      text: '<root b="2" a="1"><item>one</item><item>two</item></root>',
    });
  assert.equal(a.type, "structure");
  assert.equal((await compare(a, b)).changes.length, 0);
});
test("YAML cyclic aliases safely fall back to text", async () => {
  const a = await parseInput({ name: "a.yaml", text: "a: &a\n  self: *a" });
  assert.equal(a.type, "text");
});
test("empty CSV still compares column headers", async () => {
  const a = await parseInput({ name: "a.csv", text: "id,name" }),
    b = await parseInput({ name: "b.csv", text: "id,title" });
  const r = await compare(a, b);
  assert.equal(r.changes.length, 2);
  assert.equal(r.changes[0].path, "Column name");
});
test("ZIPs preserve nested paths and detect content renames", async () => {
  const bytes = zipSync({ "nested/a.txt": strToU8("same") });
  const a = await parseInput({ file: new File([bytes], "a.zip") });
  assert.equal(a.files[0].path, "nested/a.txt");
  const changes = await collectionChanges(a, {
    files: [{ path: "nested/b.txt", file: new File(["same"], "b.txt") }],
  });
  assert.equal(changes[0].kind, "renamed");
});
test("ambiguous duplicate file renames remain additions/removals", async () => {
  const f = (path) => ({ path, file: new File(["same"], path) });
  const r = await collectionChanges(
    { files: [f("a"), f("b")] },
    { files: [f("c")] },
  );
  assert.equal(r.length, 3);
  assert.ok(!r.some((c) => c.kind === "renamed"));
});
test("XLSX detects formulas even if cached values match", async () => {
  const { default: ExcelJS } = await import("exceljs");
  async function book(formula) {
    const w = new ExcelJS.Workbook(),
      s = w.addWorksheet("Budget");
    s.getCell("A1").value = { formula, result: 2 };
    return await parseInput({
      file: new File([await w.xlsx.writeBuffer()], "budget.xlsx"),
    });
  }
  const a = await book("1+1"),
    b = await book("2*1");
  const r = await compare(a, b);
  assert.equal(r.changes.length, 1);
  assert.match(r.changes[0].path, /formula/);
});
test("DOCX extracts text from a minimal valid document", async () => {
  const bytes = zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello document</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  const a = await parseInput({ file: new File([bytes], "a.docx") });
  assert.match(a.text, /Hello document/);
});
test("pixel regions, tolerance and alpha differences are deterministic", () => {
  const a = new Uint8ClampedArray(96 * 32 * 4),
    b = new Uint8ClampedArray(a);
  b[0] = 100;
  b[95 * 4] = 100;
  const r = comparePixels(a, b, 96, 32, 15);
  assert.equal(r.count, 2);
  assert.equal(r.regions.length, 2);
  assert.equal(comparePixels(a, b, 96, 32, 100).count, 0);
  b[3] = 255;
  assert.ok(comparePixels(a, b, 96, 32, 100).count > 0);
});
test("summaries come from matching explicit field labels", () => {
  const r = textChanges("Salary: 60000", "Salary: 70000");
  assert.equal(r[0].summary, "Salary: 60000 → 70000");
  assert.equal(textChanges("hello", "goodbye")[0].summary, null);
});
test("PDF text extraction reads a real generated PDF", async () => {
  globalThis.pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.mjs");
  const stream = "BT /F1 12 Tf 50 700 Td (Hello PDF) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(source.length);
    source += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const start = source.length;
  source +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  const parsed = await parseInput({ file: new File([source], "sample.pdf") });
  assert.equal(parsed.format, "PDF");
  assert.equal(parsed.pages.length, 1);
  assert.match(parsed.text, /Hello PDF/);
});
test("PDF inserted pages do not mark later matching text as changed", async () => {
  const a = {
      format: "PDF",
      type: "document",
      pages: ["first", "last"],
      text: "first\nlast",
    },
    b = {
      format: "PDF",
      type: "document",
      pages: ["first", "inserted", "last"],
      text: "first\ninserted\nlast",
    };
  const result = await compare(a, b);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].kind, "added");
  assert.equal(result.changes[0].afterPage, 2);
});
