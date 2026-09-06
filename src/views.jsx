import React, { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Folder,
  FileText,
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
export function DataTree({ data, label = "$", depth = 0 }) {
  const [open, setOpen] = useState(depth < 2);
  if (data === null || typeof data !== "object")
    return (
      <div className="tree-leaf">
        <span>{label}</span>
        <code>{JSON.stringify(data)}</code>
      </div>
    );
  const entries = Object.entries(data);
  return (
    <div className="data-tree">
      <button onClick={() => setOpen(!open)}>
        <ChevronRight
          size={13}
          style={{ transform: open ? "rotate(90deg)" : "" }}
        />
        <b>{label}</b>
        <span>
          {Array.isArray(data) ? "Array" : "Object"} · {entries.length}
        </span>
      </button>
      {open && (
        <div className="tree-children">
          {entries.slice(0, 500).map(([k, v]) => (
            <DataTree key={k} data={v} label={k} depth={depth + 1} />
          ))}
          {entries.length > 500 && (
            <p>
              Showing 500 entries. Use change search for the full comparison.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
export function TableView({ rows }) {
  const [page, setPage] = useState(0);
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    <div className="table-view">
      <div className="table-pagination">
        <span>{rows.length.toLocaleString()} rows</span>
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          <ArrowLeft size={13} />
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(rows.length / 100))}
        </span>
        <button
          disabled={(page + 1) * 100 >= rows.length}
          onClick={() => setPage(page + 1)}
        >
          <ArrowRight size={13} />
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 100, (page + 1) * 100).map((r, i) => (
              <tr key={i}>
                <td>{page * 100 + i + 1}</td>
                {cols.map((c) => (
                  <td key={c}>{String(r[c] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function FileTree({ files }) {
  const tree = {};
  files.forEach((f) => {
    let n = tree;
    const parts = f.path.split("/");
    parts.forEach((p, i) => {
      if (i === parts.length - 1) n[p] = { __file: f };
      else n = n[p] ??= {};
    });
  });
  return (
    <div className="file-tree">
      <FileBranch tree={tree} />
    </div>
  );
}
function FileBranch({ tree }) {
  return Object.entries(tree)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 1000)
    .map(([name, node]) =>
      node.__file ? (
        <div className="file-leaf" key={name}>
          <FileText size={14} />
          <span>{name}</span>
          <small>{node.__file.file.size.toLocaleString()} B</small>
        </div>
      ) : (
        <details key={name} open>
          <summary>
            <Folder size={14} />
            {name}
          </summary>
          <FileBranch tree={node} />
        </details>
      ),
    );
}
export function PDFVisual({ inputs }) {
  const [docs, setDocs] = useState([]),
    [page, setPage] = useState(1),
    [scale, setScale] = useState(1),
    [status, setStatus] = useState("Loading PDF previews"),
    [error, setError] = useState(""),
    [visual, setVisual] = useState([]),
    [scan, setScan] = useState(false),
    [diff, setDiff] = useState(false);
  const canvases = [useRef(), useRef()],
    heat = useRef(),
    cancel = useRef(false);
  useEffect(() => {
    let disposed = false;
    let tasks = [];
    (async () => {
      try {
        const pdf = await import("pdfjs-dist");
        pdf.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).href;
        tasks = await Promise.all(
          inputs.map(async (i) =>
            pdf.getDocument({
              data: new Uint8Array(await i.file.arrayBuffer()),
              isEvalSupported: false,
              password: i.password,
              standardFontDataUrl: new URL(
                `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,
                location.origin,
              ).href,
              cMapUrl: new URL(
                `${import.meta.env.BASE_URL}pdf-assets/cmaps/`,
                location.origin,
              ).href,
              cMapPacked: true,
            }),
          ),
        );
        const loaded = await Promise.all(tasks.map((t) => t.promise));
        if (!disposed) {
          setDocs(loaded);
          setStatus("");
        }
      } catch (e) {
        if (!disposed) setError(e.message);
      }
    })();
    return () => {
      disposed = true;
      cancel.current = true;
      tasks.forEach((t) => t.destroy());
    };
  }, [inputs]);
  async function render(doc, num, canvas, s = 1) {
    if (num > doc.numPages) {
      canvas.width = 1;
      canvas.height = 1;
      return;
    }
    const p = await doc.getPage(num),
      viewport = p.getViewport({ scale: s });
    if (viewport.width * viewport.height > 16000000)
      throw Error(
        "This page is too large to render at this zoom. Choose a lower zoom level.",
      );
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await p.render({
      canvasContext: canvas.getContext("2d", { willReadFrequently: true }),
      viewport,
    }).promise;
  }
  function difference(a, b, target) {
    const w = Math.max(a.width, b.width),
      h = Math.max(a.height, b.height);
    const data = [a, b].map((c) => {
      const surface = document.createElement("canvas");
      surface.width = w;
      surface.height = h;
      const ctx = surface.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(c, 0, 0);
      return ctx.getImageData(0, 0, w, h).data;
    });
    const out = new Uint8ClampedArray(w * h * 4);
    let count = 0;
    for (let i = 0; i < out.length; i += 4) {
      const different = [0, 1, 2].some(
        (j) => Math.abs(data[0][i + j] - data[1][i + j]) > 20,
      );
      if (different) count++;
      out[i] = different ? 226 : Math.round(data[1][i] * 0.25 + 190);
      out[i + 1] = different ? 78 : Math.round(data[1][i + 1] * 0.25 + 190);
      out[i + 2] = different ? 102 : Math.round(data[1][i + 2] * 0.25 + 190);
      out[i + 3] = 255;
    }
    if (target) {
      target.width = w;
      target.height = h;
      target.getContext("2d").putImageData(new ImageData(out, w, h), 0, 0);
    }
    return count;
  }
  useEffect(() => {
    if (docs.length !== 2) return;
    let stale = false;
    const temp = [
      document.createElement("canvas"),
      document.createElement("canvas"),
    ];
    Promise.all(docs.map((d, i) => render(d, page, temp[i], scale)))
      .then(() => {
        if (stale) return;
        temp.forEach((c, i) => {
          const target = canvases[i].current;
          if (target) {
            target.width = c.width;
            target.height = c.height;
            target.getContext("2d").drawImage(c, 0, 0);
          }
        });
        difference(...temp, heat.current);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [docs, page, scale]);
  async function scanAll() {
    cancel.current = false;
    setScan(true);
    setVisual([]);
    const found = [];
    try {
      for (let p = 1; p <= Math.max(...docs.map((d) => d.numPages)); p++) {
        if (cancel.current) break;
        setStatus(
          `Checking appearance: page ${p} of ${Math.max(...docs.map((d) => d.numPages))}`,
        );
        const c = [
          document.createElement("canvas"),
          document.createElement("canvas"),
        ];
        await Promise.all(docs.map((d, i) => render(d, p, c[i])));
        const pixels = difference(...c);
        if (pixels) found.push({ page: p, pixels });
        setVisual([...found]);
        await new Promise((r) => setTimeout(r, 0));
      }
      setStatus(
        cancel.current
          ? "Appearance scan canceled. Results are incomplete."
          : `Appearance scan complete: ${found.length} pages differ.`,
      );
    } catch (e) {
      setError(e.message);
    }
    setScan(false);
  }
  return (
    <div className="pdf-visual">
      <div className="pdf-controls">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          aria-label="Previous PDF page"
        >
          <ArrowLeft size={14} />
        </button>
        <span>
          Page {page} /{" "}
          {docs.length ? Math.max(...docs.map((d) => d.numPages)) : "…"}
        </span>
        <button
          disabled={
            !docs.length || page >= Math.max(...docs.map((d) => d.numPages))
          }
          onClick={() => setPage(page + 1)}
          aria-label="Next PDF page"
        >
          <ArrowRight size={14} />
        </button>
        <select
          aria-label="PDF zoom"
          value={scale}
          onChange={(e) => setScale(+e.target.value)}
        >
          {[0.5, 1, 1.5, 2].map((n) => (
            <option value={n} key={n}>
              {n * 100}%
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={diff}
            onChange={(e) => setDiff(e.target.checked)}
          />{" "}
          Difference map
        </label>
        <button
          className="secondary"
          disabled={!docs.length}
          onClick={
            scan
              ? () => {
                  cancel.current = true;
                }
              : scanAll
          }
        >
          {scan ? "Cancel scan" : "Scan all pages"}
        </button>
      </div>
      <p className="viewer-notice">
        Pages matched by position. An inserted page can affect later matches.
        Appearance uses a 20/255 pixel tolerance and is separate from text
        counts.
      </p>
      {status && (
        <p className="viewer-notice" role="status">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {visual.length > 0 && (
        <div className="page-chips">
          {visual.map((v) => (
            <button key={v.page} onClick={() => setPage(v.page)}>
              Page {v.page} · {v.pixels.toLocaleString()} px
            </button>
          ))}
        </div>
      )}
      <div className="pdf-pages">
        <canvas
          ref={heat}
          style={{
            display: diff ? "block" : "none",
            width: `${scale * 100}%`,
            maxWidth: "none",
            flexShrink: 0,
          }}
        />
        {canvases.map((ref, i) => (
          <figure
            style={{
              display: diff ? "none" : "block",
              flex: `0 0 calc(${scale * 50}% - 8px)`,
            }}
            key={i}
          >
            <figcaption>
              {i ? "After" : "Before"} ·{" "}
              {docs[i] && page > docs[i].numPages
                ? "No corresponding page"
                : inputs[i].name}
            </figcaption>
            <canvas ref={ref} />
          </figure>
        ))}
      </div>
    </div>
  );
}
