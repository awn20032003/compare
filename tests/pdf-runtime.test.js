import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { transform } from "esbuild";
import { readFile } from "node:fs/promises";
import { openPdf } from "../src/pdf-runtime.js";

test("browser PDF.js extracts text without document or window", async () => {
  // Node's PDF.js branch bypasses the failing browser asset check. Bundle the
  // browser implementation into a windowless realm to exercise that check.
  const sourceCode = await readFile(
    new URL(import.meta.resolve("pdfjs-dist")),
    "utf8",
  );
  const bundled = await transform(
    sourceCode + "\n;globalThis.pdfjs={getDocument,PDFWorker};",
    { format: "iife", platform: "browser", logLevel: "silent" },
  );
  const context = vm.createContext({
    console,
    URL,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Uint8ClampedArray,
    ArrayBuffer,
    ReadableStream,
    AbortController,
    AbortSignal,
    structuredClone,
    setTimeout,
    clearTimeout,
    pdfjsWorker: await import("pdfjs-dist/build/pdf.worker.mjs"),
  });
  vm.runInContext(bundled.code, context);
  const stream = "BT /F1 12 Tf 50 700 Td (Worker PDF regression) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(source.length);
    source += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = source.length;
  source +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const options = {
    data: new TextEncoder().encode(source),
    cMapUrl: "https://example.invalid/cmaps/",
    standardFontDataUrl: "https://example.invalid/fonts/",
    cMapPacked: true,
    isEvalSupported: false,
  };
  // Prove this is the browser-only failure, not the Node fallback.
  assert.throws(
    () => context.pdfjs.getDocument(options),
    /document is not defined/,
  );
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) =>
    new Response(
      await readFile(
        new URL(
          "../public/pdf-assets/standard_fonts/" +
            new URL(url).pathname.split("/").pop(),
          import.meta.url,
        ),
      ),
    );
  const loading = openPdf(context.pdfjs, options, "unused-worker-url");
  try {
    const doc = await loading.promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    assert.match(
      content.items.map((i) => i.str).join(" "),
      /Worker PDF regression/,
    );
  } finally {
    await loading.destroy();
    globalThis.fetch = previousFetch;
  }
});

test("worker port is explicit and released even when PDF loading fails", async () => {
  const previous = globalThis.Worker;
  let terminated = 0,
    destroyed = 0,
    taskDestroyed = 0;
  globalThis.Worker = class {
    constructor(url, options) {
      assert.equal(url, "/pdf.worker.mjs");
      assert.equal(options.type, "module");
    }
    terminate() {
      terminated++;
    }
  };
  const pdfjs = {
    PDFWorker: class {
      constructor({ port }) {
        assert.ok(port instanceof Worker);
      }
      destroy() {
        destroyed++;
      }
    },
    getDocument(options) {
      assert.equal(options.useWorkerFetch, true);
      assert.ok(options.worker instanceof this.PDFWorker);
      return {
        promise: Promise.reject(Error("Invalid PDF")),
        async destroy() {
          taskDestroyed++;
        },
      };
    },
  };
  try {
    const loading = openPdf(pdfjs, {}, "/pdf.worker.mjs");
    await assert.rejects(loading.promise, /Invalid PDF/);
    await loading.destroy();
    assert.equal(terminated, 1);
    assert.equal(destroyed, 1);
    assert.equal(taskDestroyed, 1);
  } finally {
    if (previous === undefined) delete globalThis.Worker;
    else globalThis.Worker = previous;
  }
});
