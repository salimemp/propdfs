// Web shims for ProPDFs Flutter web. Loaded before the Flutter app
// bootstrap so the Dart side can call into window.propdfs.* without
// race conditions.
//
// Two responsibilities today:
//   1. propdfs.download(bytes, filename) — triggers a browser download
//      of an arbitrary byte array as a file. Used by Repair / OCR /
//      eSign / Comment / Edit PDF to hand the user their output file.
//   2. propdfs.ocr(pageImageDataUrl, lang) — runs Tesseract.js over an
//      image and returns {text, blocks: [{text, bbox:{x,y,w,h}}]}.
//      Used by the OCR PDF tool to recognise text on every page.
//
// Both functions are promise-returning so the Dart side can `await`
// them via dart:js_interop.

(function () {
  if (window.propdfs) return; // idempotent

  const propdfs = {};

  // ----- 1. Download helper -----
  //
  // We accept the bytes as a Uint8Array (Dart's Uint8List maps cleanly
  // to this on the JS side). We wrap it in a Blob and use the classic
  // "create object URL + click an anchor" trick. This works in every
  // modern browser without prompting the user.
  propdfs.download = function (bytes, filename, mimeType) {
    mimeType = mimeType || 'application/octet-stream';
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Defer revocation a tick so Safari has time to start the download.
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    return true;
  };

  // ----- 2. OCR helper -----
  //
  // Lazy-loads Tesseract.js on first call. The Tesseract worker is
  // cached so subsequent calls are fast.
  //
  // Returns: { text: string, blocks: Array<{text, bbox}> }
  //   - text is the full concatenated recognised text
  //   - blocks is per-word with bbox in image pixel coordinates
  //     (origin top-left, matching the PDF overlay convention)
  //
  // Tesseract.js is loaded from a CDN — the user accepts that
  // network round-trip on first OCR. After that the worker is cached.
  propdfs._tesseractWorker = null;

  propdfs._ensureTesseract = async function () {
    if (typeof Tesseract !== 'undefined') return Tesseract;
    // Load via <script> injection. await it via a Promise.
    await new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      // jsDelivr CDN — fast + reliable for open-source packages.
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error('Failed to load Tesseract.js from CDN.'));
      };
      document.head.appendChild(s);
    });
    return Tesseract;
  };

  propdfs.ocr = async function (imageDataUrl, lang) {
    const T = await propdfs._ensureTesseract();
    lang = lang || 'eng';

    if (!propdfs._tesseractWorker) {
      propdfs._tesseractWorker = await T.createWorker(lang, 1, {
        // Run the worker fully in-page — no separate worker file
        // download, simpler deploy.
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        logger: function () {}, // silence the per-line progress
      });
    }

    const result = await propdfs._tesseractWorker.recognize(imageDataUrl);
    const data = result.data;
    const blocks = [];
    // Tesseract returns words with bbox {x0, y0, x1, y1} in image px.
    // We convert to top-left {x, y, w, h} for the overlay.
    if (data.words) {
      for (const w of data.words) {
        if (!w.text || !w.text.trim()) continue;
        const b = w.bbox;
        blocks.push({
          text: w.text,
          bbox: {
            x: b.x0,
            y: b.y0,
            w: b.x1 - b.x0,
            h: b.y1 - b.y0,
          },
        });
      }
    }
    return { text: data.text || '', blocks: blocks };
  };

  // Best-effort cleanup. Called from Dart when the OCR screen is
  // disposed so we don't hold the worker across navigations.
  propdfs.ocrTerminate = async function () {
    if (propdfs._tesseractWorker) {
      try {
        await propdfs._tesseractWorker.terminate();
      } catch (_) {}
      propdfs._tesseractWorker = null;
    }
  };

  window.propdfs = propdfs;
})();
