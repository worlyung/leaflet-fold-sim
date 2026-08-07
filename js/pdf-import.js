/**
 * Split PDF into page images using pdf.js (dynamic import from CDN).
 */

let _pdfjs = null;

/**
 * Ensure pdf.js is available.
 */
export async function ensurePdfJs() {
  if (_pdfjs) return _pdfjs;
  if (window.pdfjsLib) {
    _pdfjs = window.pdfjsLib;
  } else {
    const mod = await import(
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs"
    );
    _pdfjs = mod;
    window.pdfjsLib = mod;
  }
  if (_pdfjs.GlobalWorkerOptions) {
    _pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";
  }
  return _pdfjs;
}

/**
 * @param {File|Blob|ArrayBuffer} fileOrBuffer
 * @param {object} [opts]
 * @param {number} [opts.maxPages=64]
 * @param {number} [opts.scale=1.5]
 * @param {(done:number,total:number)=>void} [opts.onProgress]
 * @returns {Promise<HTMLImageElement[]>}
 */
export async function pdfToImages(fileOrBuffer, opts = {}) {
  const pdfjsLib = await ensurePdfJs();
  const maxPages = opts.maxPages ?? 64;
  const scale = opts.scale ?? 1.5;
  const onProgress = opts.onProgress;

  let data = fileOrBuffer;
  if (fileOrBuffer instanceof File || fileOrBuffer instanceof Blob) {
    data = await fileOrBuffer.arrayBuffer();
  }

  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const total = Math.min(pdf.numPages, maxPages);
  const images = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const img = await canvasToImage(canvas);
    images.push(img);
    onProgress?.(i, total);
  }

  return images;
}

function canvasToImage(canvas) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = canvas.toDataURL("image/png");
  });
}
