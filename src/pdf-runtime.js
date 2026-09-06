// PDF.js's default asset and worker detection assumes a browser window.
// Text extraction also runs inside compare.worker, so configure both explicitly.
export function openPdf(pdfjs, options, workerSrc) {
  let port;
  let worker;
  let task;
  try {
    if (typeof document === "undefined" && typeof Worker !== "undefined") {
      port = new Worker(workerSrc, { type: "module" });
      worker = new pdfjs.PDFWorker({ port });
    }
    task = pdfjs.getDocument({
      ...options,
      useWorkerFetch: true,
      ...(worker ? { worker } : {}),
    });
  } catch (error) {
    worker?.destroy();
    port?.terminate();
    throw error;
  }
  return {
    promise: task.promise,
    async destroy() {
      try {
        await task.destroy();
      } finally {
        worker?.destroy();
        port?.terminate();
      }
    },
  };
}
