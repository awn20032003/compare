import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeftRight,
  ArrowLeft,
  Plus,
  Minus,
  FileText,
  Folder,
  Image,
  Table2,
  Braces,
  Mail,
  Code2,
  ShieldCheck,
  Lock,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Download,
  Search,
  SlidersHorizontal,
  Copy,
  CheckCheck,
  PanelLeft,
  Maximize2,
  Upload,
  LoaderCircle,
} from "lucide-react";
import { wordDiff } from "./engine";
import { DataTree, TableView, FileTree, PDFVisual } from "./views";
import "./styles.css";

const examples = {
  Document: [
    "Employment agreement\n\nPosition: Product Designer\nMonthly salary: ₹60,000\nWork arrangement: Remote\nStart date: 1 September 2026\nResponse deadline: Friday\n\nAnnual leave: 24 days\nEquipment provided by the company.",
    "Employment agreement\n\nPosition: Product Designer\nMonthly salary: ₹70,000\nWork arrangement: Hybrid\nStart date: 1 September 2026\nResponse deadline: Monday\n\nAnnual leave: 28 days\nEquipment provided by the company.\nLearning budget: ₹30,000 per year.",
  ],
  Data: [
    '{\n  "name": "Studio",\n  "price": 29,\n  "members": 5,\n  "features": {"exports": true, "history": false}\n}',
    '{\n  "name": "Studio",\n  "price": 39,\n  "members": 10,\n  "features": {"exports": true, "history": true}\n}',
  ],
  Spreadsheet: [
    "id,name,plan,revenue\n1,Acme,Starter,290\n2,Orbit,Pro,790\n3,Linear,Starter,290",
    "id,name,plan,revenue\n1,Acme,Pro,790\n2,Orbit,Pro,990\n3,Linear,Starter,290\n4,North,Pro,790",
  ],
  Email: [
    "From: Alex <alex@example.com>\nTo: Sam <sam@example.com>\nSubject: Your offer\nContent-Type: text/plain; charset=utf-8\n\nMonthly salary: ₹60,000\nWork arrangement: Remote\nResponse deadline: Friday",
    "From: Alex <alex@example.com>\nTo: Sam <sam@example.com>\nSubject: Your updated offer\nContent-Type: text/plain; charset=utf-8\n\nMonthly salary: ₹70,000\nWork arrangement: Hybrid\nResponse deadline: Monday",
  ],
};
const iconFor = (t) =>
  t === "image"
    ? Image
    : t === "collection"
      ? Folder
      : t === "table" || t === "workbook"
        ? Table2
        : t === "structure"
          ? Braces
          : t === "email"
            ? Mail
            : FileText;
const size = (n) =>
  n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
function Logo() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <span />
        <span />
      </span>
      compare<span className="brand-light">anything</span>
      <span className="beta">BETA</span>
    </span>
  );
}
export function App() {
  const [inputs, setInputs] = useState([null, null]),
    [result, setResult] = useState(null),
    [parsed, setParsed] = useState([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [modal, setModal] = useState(null),
    [paste, setPaste] = useState(""),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0),
    [view, setView] = useState("split"),
    [ignore, setIgnore] = useState(false),
    [rowKey, setRowKey] = useState(""),
    [exports, setExports] = useState(false),
    [history, setHistory] = useState([]),
    [drag, setDrag] = useState(-1);
  const worker = useRef(null),
    fileRefs = [useRef(), useRef()],
    folderRefs = [useRef(), useRef()];
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    if (modal === null) return;
    const previous = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    const first = dialog?.querySelector("textarea,button,input");
    first?.focus();
    function trap(e) {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const controls = Array.from(
          dialog.querySelectorAll("button,textarea,input,select,a[href]"),
        ).filter((el) => !el.disabled);
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal]);
  function run(pair, opts = { ignore, key: rowKey }) {
    worker.current?.terminate();
    setError("");
    setBusy("Identifying your inputs");
    setSelected(0);
    setView("split");
    setFilter("all");
    setQuery("");
    const w = new Worker(new URL("./compare.worker.js", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({ data }) => {
      if (data.progress) setBusy(data.progress);
      else {
        setBusy("");
        if (data.error) {
          setError(data.error);
          if (data.passwordIndex !== undefined) {
            setPaste("");
            setModal(`password${data.passwordIndex}`);
          }
        } else {
          setResult(data.result);
          setParsed([data.a, data.b]);
        }
        w.terminate();
      }
    };
    w.onerror = () => {
      setBusy("");
      setError(
        "Something interrupted this comparison. Try smaller files or reload the page.",
      );
      w.terminate();
    };
    w.postMessage({ inputs: pair, options: opts });
  }
  function assign(i, value) {
    const next = [...inputs];
    next[i] = value;
    setInputs(next);
    setResult(null);
    setError("");
    if (next.every(Boolean)) run(next);
  }
  function files(i, list, isFolder = false) {
    const f = Array.from(list);
    if (!f.length) return;
    if (f.some((x) => x.size > 100 * 1024 * 1024)) {
      setError("Please use files under 100 MB for this browser release.");
      return;
    }
    assign(
      i,
      f.length === 1 && !isFolder
        ? { file: f[0], name: f[0].name }
        : {
            name: isFolder
              ? f[0].webkitRelativePath.split("/")[0] || "Folder"
              : `${f.length} files`,
            items: f.map((x) => ({
              file: x,
              path:
                x.webkitRelativePath?.split("/").slice(1).join("/") || x.name,
            })),
          },
    );
  }
  async function drop(e, i) {
    e.preventDefault();
    setDrag(-1);
    const entries = Array.from(e.dataTransfer.items || [])
      .map((x) => x.webkitGetAsEntry?.())
      .filter(Boolean);
    if (entries.some((x) => x.isDirectory)) {
      let items = [];
      async function walk(entry, path = "", root = false) {
        if (entry.isFile) {
          const file = await new Promise((res, rej) => entry.file(res, rej));
          items.push({ file, path: path + file.name });
        } else {
          const reader = entry.createReader();
          let batch;
          do {
            batch = await new Promise((res, rej) =>
              reader.readEntries(res, rej),
            );
            for (const child of batch)
              await walk(child, path + (root ? "" : entry.name + "/"));
          } while (batch.length);
        }
      }
      try {
        for (const entry of entries)
          await walk(entry, "", entries.length === 1);
        assign(i, { name: entries[0].name, items });
      } catch {
        setError(
          "Folder access was interrupted. Try the Choose folder button.",
        );
      }
    } else if (e.dataTransfer.files.length === 2 && !inputs.some(Boolean)) {
      const pair = Array.from(e.dataTransfer.files).map((file) => ({
        file,
        name: file.name,
      }));
      setInputs(pair);
      run(pair);
    } else if (e.dataTransfer.files.length) files(i, e.dataTransfer.files);
    else if (e.dataTransfer.getData("text"))
      assign(i, { name: "Pasted text", text: e.dataTransfer.getData("text") });
  }
  function reset() {
    worker.current?.terminate();
    setBusy("");
    setInputs([null, null]);
    setResult(null);
    setParsed([]);
    setHistory([]);
    setError("");
    setRowKey("");
    setIgnore(false);
    setExports(false);
    setModal(null);
  }
  async function example(name) {
    let pair;
    if (name === "Screenshot") {
      pair = await Promise.all(
        [0, 1].map(async (i) => {
          const canvas = document.createElement("canvas");
          canvas.width = 900;
          canvas.height = 600;
          const c = canvas.getContext("2d");
          c.fillStyle = "#f6f8f7";
          c.fillRect(0, 0, 900, 600);
          c.fillStyle = "#fff";
          c.fillRect(0, 0, 900, 70);
          c.fillStyle = "#2b4538";
          c.font = "bold 22px system-ui";
          c.fillText("Studio / Overview", 35, 45);
          c.fillStyle = "#89988d";
          c.font = "14px system-ui";
          c.fillText("Workspace      Projects      Team", 500, 44);
          c.fillStyle = "#284a37";
          c.font = "bold 32px system-ui";
          c.fillText(
            i ? "Welcome back, Alex." : "Good morning, Alex.",
            40,
            135,
          );
          c.fillStyle = "#829288";
          c.font = "16px system-ui";
          c.fillText("Here is what is happening with your projects.", 40, 173);
          ["Active projects", "Team members", "Tasks completed"].forEach(
            (label, j) => {
              c.fillStyle = "#fff";
              c.fillRect(40 + j * 280, 215, 260, 140);
              c.fillStyle = "#7b9182";
              c.font = "14px system-ui";
              c.fillText(label, 60 + j * 280, 249);
              c.fillStyle = "#2c6241";
              c.font = "bold 38px system-ui";
              c.fillText(
                String([i ? 14 : 12, 8, i ? 148 : 126][j]),
                60 + j * 280,
                310,
              );
            },
          );
          c.fillStyle = i ? "#316c4d" : "#e8efe9";
          c.fillRect(40, 405, 180, 45);
          c.fillStyle = i ? "white" : "#466a52";
          c.font = "14px system-ui";
          c.fillText(i ? "Create a project" : "View projects", 68, 433);
          return {
            name: `dashboard-v${i + 1}.png`,
            file: new File(
              [
                await new Promise((resolve) =>
                  canvas.toBlob(resolve, "image/png"),
                ),
              ],
              `dashboard-v${i + 1}.png`,
              { type: "image/png" },
            ),
          };
        }),
      );
    } else if (name === "Folder") {
      pair = [
        {
          name: "website-v1",
          items: [
            {
              path: "index.html",
              file: new File(["<h1>Hello</h1>"], "index.html"),
            },
            {
              path: "styles.css",
              file: new File(["body { color: black; }"], "styles.css"),
            },
            {
              path: "old-notes.txt",
              file: new File(["Draft"], "old-notes.txt"),
            },
          ],
        },
        {
          name: "website-v2",
          items: [
            {
              path: "index.html",
              file: new File(["<h1>Hello, world</h1>"], "index.html"),
            },
            {
              path: "styles.css",
              file: new File(["body { color: black; }"], "styles.css"),
            },
            { path: "README.md", file: new File(["# Welcome"], "README.md") },
          ],
        },
      ];
    } else {
      const ext = {
        Document: "txt",
        Data: "json",
        Spreadsheet: "csv",
        Email: "eml",
      }[name];
      pair = examples[name].map((text, i) => ({
        text,
        name: `${name.toLowerCase()}-v${i + 1}.${ext}`,
      }));
    }
    setInputs(pair);
    setHistory([]);
    run(pair);
  }
  function download(format) {
    const report = {
      application: "Compare Anything",
      before: inputs[0].name,
      after: inputs[1].name,
      coverage: result.notice,
      changes: result.changes.map(({ left, right, ...c }) => c),
    };
    let content, type;
    if (format === "json") {
      content = JSON.stringify(report, null, 2);
      type = "application/json";
    } else if (format === "txt") {
      content =
        `${report.before} → ${report.after}\n${result.changes.length} changes\n${report.coverage}\n\n` +
        report.changes
          .map(
            (c) =>
              `${c.kind.toUpperCase()} ${c.path}\nBefore: ${c.before}\nAfter: ${c.after}`,
          )
          .join("\n\n");
      type = "text/plain";
    } else {
      const escape = (s) =>
        String(s ?? "").replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c],
        );
      content =
        `<!doctype html><html><meta charset="utf-8"><title>Comparison report</title><style>body{font:16px system-ui;max-width:900px;margin:60px auto;color:#233c35}article{border:1px solid #ddd;padding:20px;margin:20px 0}pre{white-space:pre-wrap}small{color:#667}</style><h1>${report.changes.length} changes found</h1><p>${escape(report.before)} → ${escape(report.after)}</p><small>${escape(report.coverage)}</small>` +
        report.changes
          .map(
            (c) =>
              `<article><h3>${escape(c.kind)} · ${escape(c.path)}</h3><b>Before</b><pre>${escape(c.before)}</pre><b>After</b><pre>${escape(c.after)}</pre></article>`,
          )
          .join("") +
        "</html>";
      type = "text/html";
    }
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `comparison.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExports(false);
  }
  const changes = result?.changes || [],
    visible = changes
      .map((c, i) => ({ ...c, index: i }))
      .filter(
        (c) =>
          (filter === "all" ||
            c.kind === filter ||
            c.category === filter ||
            (filter === "content" && c.category !== "metadata")) &&
          `${c.path} ${c.before} ${c.after}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    current = changes[selected];
  return (
    <div
      className="app"
      onPaste={(e) => {
        if (modal !== null || ["INPUT", "TEXTAREA"].includes(e.target.tagName))
          return;
        const image = Array.from(e.clipboardData.files).find((f) =>
          f.type.startsWith("image/"),
        );
        if (image) {
          e.preventDefault();
          files(inputs[0] ? 1 : 0, [image]);
        } else if (e.clipboardData.getData("text")) {
          e.preventDefault();
          assign(inputs[0] ? 1 : 0, {
            name: "Pasted text",
            text: e.clipboardData.getData("text"),
          });
        }
      }}
    >
      <header>
        <button
          className="logo-button"
          onClick={reset}
          aria-label="Compare Anything home"
        >
          <Logo />
        </button>
        <nav>
          <button onClick={() => setModal("how")}>
            How it works <ArrowUpRight size={13} />
          </button>
          <span className="nav-divider" />
          <button onClick={() => setModal("privacy")}>
            <ShieldCheck size={15} /> Private by design
          </button>
        </nav>
      </header>
      {!result && !busy ? (
        <main className="landing">
          <div className="eyebrow">
            <span className="status-dot" /> TWO VERSIONS. ONE CLEAR ANSWER.
          </div>
          <h1>
            What changed<span>?</span>
          </h1>
          <p className="hero-subtitle">
            Drop two things. We'll show you exactly what's different.
          </p>
          <div className="input-pair">
            {[0, 1].map((i) => (
              <React.Fragment key={i}>
                {i === 1 && (
                  <button
                    className="swap"
                    aria-label="Swap before and after"
                    onClick={() => setInputs([inputs[1], inputs[0]])}
                  >
                    <ArrowLeftRight size={17} />
                  </button>
                )}
                <section
                  className={`drop-card ${drag === i ? "dragging" : ""} ${inputs[i] ? "populated" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(i);
                  }}
                  onDragLeave={() => setDrag(-1)}
                  onDrop={(e) => drop(e, i)}
                >
                  <div className="drop-label">
                    <span className="step">0{i + 1}</span>
                    <span>{i ? "After" : "Before"}</span>
                    <span className="version-label">
                      {i ? "The new version" : "The original"}
                    </span>
                  </div>
                  <div className="drop-center">
                    <div className="file-illustration">
                      <FileText size={32} strokeWidth={1.2} />
                      <span>
                        <Plus size={13} />
                      </span>
                    </div>
                    <h2>{inputs[i] ? inputs[i].name : "Drop anything here"}</h2>
                    <p>
                      {inputs[i]
                        ? inputs[i].items
                          ? `${inputs[i].items.length} files ready`
                          : inputs[i].file
                            ? size(inputs[i].file.size)
                            : `${inputs[i].text.length} characters`
                        : "A file, a folder, or something you copied"}
                    </p>
                    <div className="drop-actions">
                      <button
                        className="choose-button"
                        onClick={() => fileRefs[i].current.click()}
                      >
                        Choose file <ChevronDown size={13} />
                      </button>
                      <span>or</span>
                      <button
                        className="paste-button"
                        onClick={() => {
                          setPaste(inputs[i]?.text || "");
                          setModal(i);
                        }}
                      >
                        paste content
                      </button>
                    </div>
                    <button
                      className="folder-button"
                      onClick={() => folderRefs[i].current.click()}
                    >
                      Choose folder
                    </button>
                  </div>
                  <div className="drop-bottom">
                    <span className="tiny-dot" />
                    {inputs[i]
                      ? "Ready to compare"
                      : "We’ll recognize the format automatically"}
                    {inputs[i] && (
                      <button
                        aria-label="Remove input"
                        onClick={() => assign(i, null)}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileRefs[i]}
                    type="file"
                    hidden
                    multiple
                    onChange={(e) => {
                      files(i, e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={folderRefs[i]}
                    type="file"
                    hidden
                    webkitdirectory=""
                    multiple
                    onChange={(e) => {
                      files(i, e.target.files, true);
                      e.target.value = "";
                    }}
                  />
                </section>
              </React.Fragment>
            ))}
          </div>
          <div className="privacy-line">
            <Lock size={13} />
            <span>Your files never leave your device.</span>
            <span className="dot-separator">·</span>
            <span>No signup. No uploads. Just answers.</span>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="examples">
            <span>Nothing handy? Try an example</span>
            <div>
              {[
                ["Document", FileText],
                ["Screenshot", Image],
                ["Spreadsheet", Table2],
                ["Folder", Folder],
                ["Data", Braces],
                ["Email", Mail],
              ].map(([name, Icon]) => (
                <button key={name} onClick={() => example(name)}>
                  <Icon size={15} />
                  {name}
                  <ArrowUpRight size={12} />
                </button>
              ))}
            </div>
          </div>
          <section className="formats">
            <div className="section-rule">
              <span>DIFFERENT FORMATS. SAME SIMPLE EXPERIENCE.</span>
            </div>
            <div className="format-grid">
              {[
                [FileText, "Documents", "PDF, Word & plain text"],
                [Image, "Images", "Photos, designs & screenshots"],
                [Table2, "Spreadsheets", "Excel & CSV files"],
                [Code2, "Code & data", "JSON, YAML, XML & code"],
                [Folder, "Folders & ZIPs", "Entire projects & archives"],
                [Mail, "Emails", "Messages & attachments"],
              ].map(([Icon, title, sub]) => (
                <div key={title}>
                  <Icon size={20} strokeWidth={1.5} />
                  <h3>{title}</h3>
                  <p>{sub}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="value-strip">
            <div>
              <ShieldCheck size={20} />
              <span>
                <b>Private. By default.</b>
                <small>Processed right here in your browser.</small>
              </span>
            </div>
            <div>
              <SlidersHorizontal size={20} />
              <span>
                <b>The details, without the noise.</b>
                <small>See the big picture. Explore every change.</small>
              </span>
            </div>
            <div>
              <CheckCheck size={20} />
              <span>
                <b>Real differences. Real answers.</b>
                <small>Deterministic comparisons. No AI guesswork.</small>
              </span>
            </div>
          </section>
        </main>
      ) : busy ? (
        <main className="loading">
          <div className="loading-icon">
            <LoaderCircle size={32} />
          </div>
          <h1>Finding what changed.</h1>
          <p role="status">{busy}</p>
          <span>
            <Lock size={13} /> Processing locally on your device
          </span>
          <button
            className="secondary"
            onClick={() => {
              worker.current?.terminate();
              setBusy("");
            }}
          >
            Cancel comparison
          </button>
        </main>
      ) : (
        <main className="results">
          <div className="result-top">
            <button
              className="text-button"
              onClick={
                history.length
                  ? () => {
                      const prev = history.at(-1);
                      setHistory(history.slice(0, -1));
                      setInputs(prev.inputs);
                      setParsed(prev.parsed);
                      setResult(prev.result);
                      setSelected(0);
                    }
                  : reset
              }
            >
              <ArrowLeft size={15} />
              {history.length ? "Back to collection" : "New comparison"}
            </button>
            <div className="result-files">
              {inputs[0]?.name}
              <ArrowRight size={13} />
              {inputs[1]?.name}
            </div>
            <div className="export-wrap">
              <button
                className="secondary"
                onClick={() => setExports(!exports)}
                disabled={result.complete === false}
              >
                <Download size={15} /> Export report <ChevronDown size={13} />
              </button>
              {exports && (
                <div className="export-menu">
                  {["html", "txt", "json"].map((f) => (
                    <button onClick={() => download(f)} key={f}>
                      {f.toUpperCase()} report
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setExports(false);
                      window.print();
                    }}
                  >
                    Print / Save PDF
                  </button>
                  <small>Reports include changed content.</small>
                </div>
              )}
            </div>
          </div>
          {result.mode === "image" ? (
            <ImageViewer
              a={parsed[0]}
              b={parsed[1]}
              onStart={() => {
                setExports(false);
                setResult((r) => ({ ...r, complete: false }));
              }}
              onResult={(c) =>
                setResult((r) => ({
                  ...r,
                  changes: c,
                  complete: true,
                  notice:
                    "Pixel differences at the displayed tolerance. Regions are approximate.",
                }))
              }
            />
          ) : (
            <>
              <div className="answer">
                <div className="eyebrow">
                  <span className="status-dot" /> COMPARISON COMPLETE
                </div>
                <h1>
                  {changes.length
                    ? `${changes.length} ${result.mode === "collection" ? "files changed" : result.mode === "table" ? "table changes found" : "changes found"}`
                    : "No differences found."}
                </h1>
                <div className="stats">
                  {[
                    "added",
                    "removed",
                    "modified",
                    ...(["collection", "email"].includes(result.mode)
                      ? ["moved", "renamed"]
                      : []),
                  ].map((kind) => (
                    <button
                      className={kind}
                      key={kind}
                      onClick={() => setFilter(filter === kind ? "all" : kind)}
                    >
                      <span>
                        {kind === "added"
                          ? "+"
                          : kind === "removed"
                            ? "−"
                            : "~"}
                      </span>
                      {changes.filter((c) => c.kind === kind).length} {kind}
                    </button>
                  ))}
                  <span className="local-badge">
                    <ShieldCheck size={13} /> Compared on your device
                  </span>
                </div>
              </div>
              {changes.some((c) => c.summary) && (
                <div className="summary-cards">
                  {changes
                    .map((c, i) => ({ ...c, index: i }))
                    .filter((c) => c.summary)
                    .slice(0, 4)
                    .map((c) => (
                      <button
                        key={c.index}
                        onClick={() => {
                          setSelected(c.index);
                          setView("split");
                        }}
                      >
                        <span>What changed</span>
                        <b>{c.summary}</b>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                </div>
              )}
              <div className="coverage">
                <ShieldCheck size={14} />
                {result.notice ||
                  "Text differences compared. Every change links to the original content."}
              </div>
              <div className="result-toolbar">
                <div className="segmented">
                  <button
                    className={view === "split" ? "active" : ""}
                    onClick={() => setView("split")}
                  >
                    <PanelLeft size={14} /> Side by side
                  </button>
                  <button
                    className={view === "unified" ? "active" : ""}
                    onClick={() => setView("unified")}
                  >
                    Unified
                  </button>
                  <button
                    className={view === "source" ? "active" : ""}
                    onClick={() => setView("source")}
                  >
                    Originals
                  </button>
                  {parsed.every((p) => p.format === "PDF") && (
                    <button
                      className={view === "visual" ? "active" : ""}
                      onClick={() => setView("visual")}
                    >
                      Appearance
                    </button>
                  )}
                </div>
                <div className="toolbar-right">
                  {parsed.every((p) => p.type === "table") ? (
                    <select
                      aria-label="Row matching column"
                      value={rowKey}
                      onChange={(e) => {
                        setRowKey(e.target.value);
                        run(inputs, { ignore, key: e.target.value });
                      }}
                    >
                      <option value="">Match rows by position</option>
                      {Object.keys(parsed[0].rows[0] || {}).map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  ) : ["text", "email"].includes(result.mode) ? (
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={ignore}
                        onChange={(e) => {
                          setIgnore(e.target.checked);
                          run(inputs, {
                            ignore: e.target.checked,
                            key: rowKey,
                          });
                        }}
                      />{" "}
                      Ignore whitespace
                    </label>
                  ) : null}
                  <span>
                    {selected + 1 > changes.length ? 0 : selected + 1} /{" "}
                    {changes.length}
                  </span>
                  <button
                    aria-label="Previous change"
                    disabled={!changes.length}
                    onClick={() =>
                      setSelected(
                        (selected - 1 + changes.length) % changes.length,
                      )
                    }
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <button
                    aria-label="Next change"
                    disabled={!changes.length}
                    onClick={() => setSelected((selected + 1) % changes.length)}
                  >
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
              <div className="workspace">
                <aside className="change-sidebar">
                  <div className="sidebar-title">
                    Changes <span>{visible.length}</span>
                  </div>
                  <div className="search">
                    <Search size={14} />
                    <input
                      aria-label="Search changes"
                      placeholder="Search changes…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Filter changes"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    {[
                      "all",
                      "added",
                      "removed",
                      "modified",
                      ...(changes.some((c) => c.category === "metadata")
                        ? ["content", "metadata"]
                        : []),
                      ...(["collection", "email"].includes(result.mode)
                        ? ["moved", "renamed"]
                        : []),
                    ].map((k) => (
                      <option value={k} key={k}>
                        {k === "all"
                          ? "All changes"
                          : k[0].toUpperCase() + k.slice(1)}
                      </option>
                    ))}
                  </select>
                  <div className="change-list">
                    {visible.slice(0, 1000).map((c) => (
                      <button
                        className={`change-item ${selected === c.index ? "selected" : ""}`}
                        key={c.index}
                        onClick={() => setSelected(c.index)}
                      >
                        <span className={`change-symbol ${c.kind}`}>
                          {c.kind === "added"
                            ? "+"
                            : c.kind === "removed"
                              ? "−"
                              : "~"}
                        </span>
                        <span>
                          <b>{c.summary?.split(":")[0] || c.path}</b>
                          <small>
                            {c.summary ||
                              String(c.after || c.before).slice(0, 65)}
                          </small>
                        </span>
                        <ChevronRight size={12} />
                      </button>
                    ))}
                    {!visible.length && (
                      <p className="empty-small">No matching changes.</p>
                    )}
                    {visible.length > 1000 && (
                      <p>Showing 1,000 changes. Search to narrow the list.</p>
                    )}
                  </div>
                </aside>
                <section className="diff-canvas">
                  {view === "visual" ? (
                    <PDFVisual inputs={parsed} />
                  ) : view === "source" ? (
                    <div className="source-pair">
                      {parsed.map((p, i) => (
                        <div key={i}>
                          <div className="pane-heading">
                            {i ? "After" : "Before"}
                            <span>{p.name}</span>
                          </div>
                          {p.type === "structure" ? (
                            <DataTree data={p.data} />
                          ) : p.type === "table" ? (
                            <TableView rows={p.rows} />
                          ) : p.type === "workbook" ? (
                            <DataTree data={p.sheets} label="Workbook" />
                          ) : p.type === "collection" ? (
                            <FileTree files={p.files} />
                          ) : p.file && p.format === "PDF" ? (
                            <PDFPreview file={p.file} />
                          ) : (
                            <pre>{p.text}</pre>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : !changes.length ? (
                    <div className="identical">
                      <span>
                        <Check size={28} />
                      </span>
                      <h2>All clear.</h2>
                      <p>
                        {result.identicalBytes
                          ? "These files are byte-for-byte identical."
                          : "No differences found in the compared content."}
                      </p>
                    </div>
                  ) : view === "source" ? (
                    <div className="source-pair">
                      {parsed.map((p, i) => (
                        <div key={i}>
                          <div className="pane-heading">
                            {i ? "After" : "Before"} <span>{p.name}</span>
                          </div>
                          {p.file && p.format === "PDF" ? (
                            <PDFPreview file={p.file} />
                          ) : (
                            <pre>
                              {p.text ||
                                JSON.stringify(
                                  p.data ||
                                    p.rows ||
                                    p.sheets ||
                                    p.files?.map((x) => x.path),
                                  null,
                                  2,
                                )}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : current ? (
                    <>
                      <div className="detail-heading">
                        <span className={`pill ${current.kind}`}>
                          {current.kind}
                        </span>
                        <b>{current.path}</b>
                        {current.left && current.right && (
                          <button
                            className="secondary"
                            onClick={() => {
                              setHistory([
                                ...history,
                                { inputs, parsed, result },
                              ]);
                              const pair = [current.left, current.right].map(
                                (x) => ({ name: x.file.name, file: x.file }),
                              );
                              setInputs(pair);
                              run(pair);
                            }}
                          >
                            Open comparison <ArrowUpRight size={14} />
                          </button>
                        )}
                      </div>
                      <div
                        className={`diff-panes ${view === "unified" ? "unified" : ""}`}
                      >
                        {[0, 1].map((i) => (
                          <div className="diff-pane" key={i}>
                            <div className="pane-heading">
                              <span
                                className={`tiny-dot ${i ? "green" : "red"}`}
                              />
                              {i ? "After" : "Before"}
                              <span>{inputs[i].name}</span>
                            </div>
                            <div
                              className={`diff-content ${i ? "after" : "before"}`}
                            >
                              <span className="line-gutter">
                                {i ? "+" : "−"}
                              </span>
                              <pre>
                                {current.before && current.after
                                  ? wordDiff(
                                      String(current.before),
                                      String(current.after),
                                    )
                                      .filter((p) =>
                                        i ? !p.removed : !p.added,
                                      )
                                      .map((p, j) => (
                                        <mark
                                          key={j}
                                          className={
                                            p.added
                                              ? "word-added"
                                              : p.removed
                                                ? "word-removed"
                                                : "word-same"
                                          }
                                        >
                                          {p.value}
                                        </mark>
                                      ))
                                  : String(
                                      i ? current.after : current.before,
                                    ) || <em>No content</em>}
                              </pre>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="detail-note">
                        <Lock size={12} /> Your original files are never
                        modified.
                      </div>
                    </>
                  ) : null}
                </section>
              </div>
            </>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <section className="print-report">
            {changes.map((c, i) => (
              <article key={i}>
                <h3>
                  {c.kind} · {c.path}
                </h3>
                <b>Before</b>
                <pre>{c.before}</pre>
                <b>After</b>
                <pre>{c.after}</pre>
              </article>
            ))}
          </section>
        </main>
      )}
      <footer>
        <span>Less searching. More clarity.</span>
        <span>
          <span className="tiny-dot green" /> Local processing{" "}
          <span className="footer-divider">/</span>
          <button onClick={() => setModal("formats")}>Supported formats</button>
          <span className="footer-divider">/</span>
          <button onClick={() => setModal("privacy")}>Privacy</button>
        </span>
        <span>Made for the little differences.</span>
      </footer>
      {modal !== null && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              typeof modal === "number"
                ? "Paste content"
                : "Product information"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {String(modal).startsWith("password") ? (
              <>
                <Lock size={28} />
                <h2>Unlock your PDF.</h2>
                <p>
                  Enter the password for {inputs[Number(modal.slice(-1))]?.name}
                  . It stays on this device.
                </p>
                <input
                  className="password-input"
                  autoFocus
                  type="password"
                  aria-label="PDF password"
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                />
                <button
                  className="primary"
                  onClick={() => {
                    const next = inputs.map((x, i) =>
                      i === Number(modal.slice(-1))
                        ? { ...x, password: paste }
                        : x,
                    );
                    setInputs(next);
                    setModal(null);
                    setPaste("");
                    run(next);
                  }}
                >
                  Unlock and compare <ArrowRight size={14} />
                </button>
              </>
            ) : typeof modal === "number" ? (
              <>
                <div className="eyebrow">{modal ? "AFTER" : "BEFORE"}</div>
                <h2>Paste anything.</h2>
                <p>Text, code, JSON, or the contents of an email.</p>
                <textarea
                  autoFocus
                  placeholder="Your content goes here…"
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                />
                <button
                  className="primary"
                  onClick={() => {
                    assign(modal, { text: paste, name: "Pasted text" });
                    setModal(null);
                  }}
                >
                  Use this content <ArrowRight size={15} />
                </button>
              </>
            ) : modal === "privacy" ? (
              <>
                <ShieldCheck size={30} />
                <h2>Your files stay yours.</h2>
                <p>
                  Comparisons run in your browser. File contents, filenames, and
                  results are not uploaded to a server.
                </p>
                <p>
                  There are no accounts, analytics, or AI services. Closing or
                  clearing a comparison releases its session data. Reports you
                  download contain the differences, so share them thoughtfully.
                </p>
              </>
            ) : modal === "how" ? (
              <>
                <h2>Two versions. One clear answer.</h2>
                <ol>
                  <li>Drop, choose, or paste the original.</li>
                  <li>Add the updated version.</li>
                  <li>Explore the detected changes and export a report.</li>
                </ol>
                <p>
                  We recognize the format and choose a comparison view. All
                  processing happens on your device.
                </p>
              </>
            ) : (
              <>
                <h2>A place for all your versions.</h2>
                <p>
                  Text and code, JSON, YAML, CSV, Excel, DOCX text, PDF text,
                  images, folders, ZIP archives, and .eml emails with
                  attachments.
                </p>
                <p>
                  XML uses an ordered structural comparison. PDFs support text
                  and page appearance comparison. OCR, Word formatting, and
                  semantic code analysis are not included. Files are limited to
                  100 MB each.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function PDFPreview({ file }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return <iframe title={file.name} src={url} />;
}
function ImageViewer({ a, b, onResult, onStart }) {
  const [urls, setUrls] = useState([]),
    [mode, setMode] = useState("side"),
    [opacity, setOpacity] = useState(50),
    [tolerance, setTolerance] = useState(15),
    [info, setInfo] = useState(null),
    [zoom, setZoom] = useState(100);
  const canvas = useRef();
  useEffect(() => {
    const u = [URL.createObjectURL(a.file), URL.createObjectURL(b.file)];
    setUrls(u);
    return () => u.forEach(URL.revokeObjectURL);
  }, [a, b]);
  useEffect(() => {
    if (urls.length !== 2) return;
    onStart();
    let canceled = false;
    let pixelWorker;
    Promise.all(
      urls.map(
        (url) =>
          new Promise((res, rej) => {
            const i = new window.Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = url;
          }),
      ),
    )
      .then((images) => {
        if (canceled) return;
        const w = Math.max(...images.map((i) => i.naturalWidth)),
          h = Math.max(...images.map((i) => i.naturalHeight));
        if (w * h > 16000000) {
          setInfo({
            error:
              "Pixel analysis is limited to 16 megapixels. Original previews remain available.",
          });
          return;
        }
        const data = images.map((img) => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, w, h);
        });
        const c = canvas.current;
        if (!c) return;
        c.width = w;
        c.height = h;
        pixelWorker = new Worker(
          new URL("./pixels.worker.js", import.meta.url),
          { type: "module" },
        );
        pixelWorker.onmessage = ({ data: result }) => {
          if (canceled) return;
          c.getContext("2d").putImageData(
            new ImageData(result.output, w, h),
            0,
            0,
          );
          setInfo({
            count: result.count,
            regions: result.regions,
            w,
            h,
            dimensions: images.map(
              (i) => `${i.naturalWidth} ? ${i.naturalHeight}`,
            ),
          });
          onResult(
            result.regions.map((r, i) => ({
              kind: "modified",
              path: `Region ${i + 1} ? (${r.x}, ${r.y})`,
              before: `${r.width} ? ${r.height} pixel region`,
              after: `Visual changes detected. Tolerance: ${tolerance}/255.`,
              region: r,
            })),
          );
          pixelWorker.terminate();
        };
        pixelWorker.onerror = () => {
          setInfo({
            error: "Pixel analysis was interrupted. Try a smaller image.",
          });
          pixelWorker.terminate();
        };
        pixelWorker.postMessage(
          { a: data[0].data, b: data[1].data, width: w, height: h, tolerance },
          [data[0].data.buffer, data[1].data.buffer],
        );
      })
      .catch(() => setInfo({ error: "This image could not be decoded." }));
    return () => {
      canceled = true;
      pixelWorker?.terminate();
    };
  }, [urls, tolerance]);
  return (
    <>
      <div className="answer">
        <div className="eyebrow">
          <span className="status-dot" /> IMAGE COMPARISON
        </div>
        <h1>
          {info?.error
            ? "Image previews"
            : info
              ? info.count
                ? `${info.regions.length} visual regions changed`
                : "No visual differences found."
              : "Comparing pixels…"}
        </h1>
        <p>
          {info?.error ||
            (info
              ? `${((info.count / (info.w * info.h)) * 100).toFixed(2)}% of the canvas · ${info.dimensions.join(" → ")}`
              : "Decoding original images locally")}
        </p>
      </div>
      <div className="result-toolbar">
        <div className="segmented">
          {[
            ["side", "Side by side"],
            ["overlay", "Overlay"],
            ["slider", "Slider"],
            ["difference", "Difference"],
          ].map(([id, label]) => (
            <button
              className={mode === id ? "active" : ""}
              onClick={() => setMode(id)}
              key={id}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          Tolerance{" "}
          <input
            type="range"
            min="0"
            max="100"
            value={tolerance}
            onChange={(e) => setTolerance(+e.target.value)}
          />
          {tolerance}
        </label>
        <select
          aria-label="Image zoom"
          value={zoom}
          onChange={(e) => setZoom(+e.target.value)}
        >
          {[50, 100, 150, 200].map((n) => (
            <option key={n} value={n}>
              {n}%
            </option>
          ))}
        </select>
      </div>
      {["overlay", "slider"].includes(mode) && (
        <label className="image-slider">
          {mode === "overlay" ? "Opacity" : "Reveal"}
          <input
            type="range"
            min="0"
            max="100"
            value={opacity}
            onChange={(e) => setOpacity(+e.target.value)}
          />
          {opacity}%
        </label>
      )}
      {info?.regions?.length > 0 && (
        <div className="page-chips">
          {info.regions.slice(0, 100).map((r, i) => (
            <button
              key={i}
              onClick={() => {
                setMode("difference");
                setZoom(150);
                setTimeout(() => {
                  const stage = document.querySelector(".image-stage");
                  stage?.scrollTo({ left: r.x, top: r.y, behavior: "smooth" });
                }, 0);
              }}
            >
              Region {i + 1} ? {r.width} ? {r.height}
            </button>
          ))}
          <button
            onClick={() => {
              const link = document.createElement("a");
              link.download = "difference.png";
              link.href = canvas.current.toDataURL("image/png");
              link.click();
            }}
          >
            Download difference image
          </button>
        </div>
      )}
      <div className={`image-stage ${mode}`}>
        <div className="image-zoom" style={{ width: `${zoom}%` }}>
          {mode === "side" ? (
            urls.map((u, i) => (
              <figure key={u}>
                <figcaption>
                  {i ? "After" : "Before"} · {i ? b.name : a.name}
                </figcaption>
                <img
                  src={u}
                  alt={`${i ? "After" : "Before"}: ${i ? b.name : a.name}`}
                />
              </figure>
            ))
          ) : mode !== "difference" ? (
            <div className="image-stack">
              <img src={urls[0]} alt="Before" />
              <img
                src={urls[1]}
                alt="After"
                style={
                  mode === "overlay"
                    ? { opacity: opacity / 100 }
                    : { clipPath: `inset(0 ${100 - opacity}% 0 0)` }
                }
              />
            </div>
          ) : null}
          <canvas
            ref={canvas}
            style={{ display: mode === "difference" ? "block" : "none" }}
          />
        </div>
      </div>
    </>
  );
}
if (document.getElementById("root"))
  createRoot(document.getElementById("root")).render(<App />);
