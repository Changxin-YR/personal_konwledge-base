// src/host/pdf-extractor.ts
import { readFile } from "node:fs/promises";
import { Worker, parentPort, workerData } from "node:worker_threads";

// src/host/reader-render-page.ts
import { crc32, deflateSync } from "node:zlib";
function normalizeText(raw) {
  return raw.toWellFormed().replace(/\r\n?/g, "\n").trim();
}
function normalizeBoxes(raw, source, text) {
  const boxes = [];
  const trimStart = raw.length - raw.trimStart().length;
  let out = 0;
  for (let i = trimStart; i < raw.length && out < text.length; ) {
    const cp = raw.codePointAt(i);
    const units = cp > 65535 ? 2 : 1;
    const crlf = cp === 13 && raw.charCodeAt(i + 1) === 10;
    if (cp !== 13 && cp !== 10) {
      let rect = source[i];
      const tail = units === 2 ? source[i + 1] : void 0;
      if (tail && rect) {
        const x = Math.min(rect.x, tail.x), y = Math.min(rect.y, tail.y);
        rect = {
          x,
          y,
          width: Math.max(rect.x + rect.width, tail.x + tail.width) - x,
          height: Math.max(rect.y + rect.height, tail.y + tail.height) - y
        };
      } else rect ??= tail;
      if (rect) boxes.push({ start: out, end: out + units, ...rect });
    }
    i += crlf ? 2 : units;
    out += units;
  }
  return boxes;
}
function viewport(api, page) {
  const w = api.FPDF_GetPageWidthF(page), h = api.FPDF_GetPageHeightF(page);
  if (![w, h].every((n) => Number.isFinite(n) && n > 0)) throw Error("Invalid PDF page dimensions");
  const scale = Math.min(2, 1536 / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
function glyphRect(api, page, tp, index, width, height, ptr) {
  if (api.FPDFText_IsGenerated(tp, index) !== 0 || !api.FPDFText_GetCharBox(tp, index, ptr, ptr + 8, ptr + 16, ptr + 24)) return;
  const [left, right, bottom, top] = new Float64Array(api.memory.buffer, ptr, 4);
  if (![left, right, bottom, top].every(Number.isFinite)) return;
  const point = (x2, y2) => {
    if (!api.FPDF_PageToDevice(page, 0, 0, width, height, 0, x2, y2, ptr, ptr + 4)) return;
    return Array.from(new Int32Array(api.memory.buffer, ptr, 2));
  };
  const a = point(left, bottom), b = point(right, top);
  if (!a || !b) return;
  const x = Math.max(0, Math.min(a[0], b[0])), y = Math.max(0, Math.min(a[1], b[1]));
  const w = Math.min(width, Math.max(a[0], b[0])) - x, h = Math.min(height, Math.max(a[1], b[1])) - y;
  if (w > 0 && h > 0) return { x, y, width: w, height: h };
}
function chunk(name, data) {
  const buf = Buffer.allocUnsafe(data.length + 12);
  buf.writeUInt32BE(data.length);
  buf.write(name, 4, 4, "ascii");
  data.copy(buf, 8);
  buf.writeUInt32BE(crc32(buf.subarray(4, -4)), buf.length - 4);
  return buf;
}
function imagePng(api, page, width, height) {
  const bitmap = api.FPDFBitmap_Create(width, height, 0);
  if (!bitmap) throw Error("PDF bitmap unavailable");
  try {
    if (!api.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 4294967295)) throw Error("PDF bitmap unavailable");
    api.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, 1);
    const ptr = api.FPDFBitmap_GetBuffer(bitmap), stride = api.FPDFBitmap_GetStride(bitmap);
    if (!ptr || stride < width * 4) throw Error("Invalid PDF bitmap");
    const bgr = new Uint8Array(api.memory.buffer, ptr, stride * height);
    const rows = Buffer.allocUnsafe((1 + 3 * width) * height);
    let dst = 0;
    for (let y = 0; y < height; y++) {
      rows[dst++] = 0;
      for (let x = 0, src = y * stride; x < width; x++, src += 4) {
        rows[dst++] = bgr[src + 2];
        rows[dst++] = bgr[src + 1];
        rows[dst++] = bgr[src];
      }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 2;
    const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
    return "data:image/png;base64," + png.toString("base64");
  } finally {
    api.FPDFBitmap_Destroy(bitmap);
  }
}

// src/host/pdf-extractor.ts
var MiB = 1024 * 1024;
var MAX_BYTES = 64 * MiB;
var MAX_MEMORY = 256 * MiB;
var MAX_PAGES = 1e4;
var MAX_CHARS = 32e3;
var MAX_BOOKMARKS = 2048;
var MAX_TITLE_BYTES = 512;
var DEADLINE_MS = 15e3;
var MAX_WORKERS = 2;
var role = "knowledgeos:pdf-extractor:v1";
var readerRole = "knowledgeos:pdf-reader:v1";
var active = { extract: 0, reader: 0, index: 0 };
function pdfError(code, message) {
  return Object.assign(new Error(message), { code });
}
function openPdf(bytes) {
  return open(bytes, "extract");
}
function openIndexPdf(bytes, signal) {
  return open(bytes, "index", signal);
}
function openReaderPdf(bytes, signal) {
  return open(bytes, "reader", signal);
}
async function open(bytes, pool, signal) {
  if (signal?.aborted) throw pdfError("PDF_HANDLE_CLOSED", "PDF closed");
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_BYTES)
    throw pdfError("PDF_OPEN_FAILED", "Invalid PDF input size or type");
  if (active[pool] >= (pool === "index" ? 1 : MAX_WORKERS)) throw pdfError("PDF_BUSY", "PDF extractor busy");
  const copy = new Uint8Array(bytes);
  const worker = new Worker(new URL("./pdf-extractor.js", import.meta.url), {
    workerData: pool === "reader" ? readerRole : role,
    env: {},
    execArgv: [],
    resourceLimits: { maxOldGenerationSizeMb: 48, maxYoungGenerationSizeMb: 8 }
  });
  active[pool]++;
  let pending;
  let closing;
  const close = () => {
    if (!closing) {
      signal?.removeEventListener("abort", abort);
      closing = worker.terminate().then(() => {
      }).finally(() => {
        active[pool]--;
      });
      pending?.({ error: "PDF closed", fatal: true });
    }
    return closing;
  };
  function fail(error) {
    pending?.({ error, fatal: true });
    void close();
  }
  function abort() {
    void close();
  }
  signal?.addEventListener("abort", abort, { once: true });
  worker.on("message", (msg) => {
    pending?.(msg);
    if ("error" in msg && msg.fatal) void close();
  });
  worker.on("error", () => fail("PDF worker failed"));
  worker.on("exit", () => fail("PDF worker exited"));
  function request(input) {
    if (closing) return Promise.reject(pdfError("PDF_HANDLE_CLOSED", "PDF closed"));
    if (pending) return Promise.reject(pdfError("PDF_BUSY", "PDF extractor busy"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail("PDF parser deadline exceeded"), DEADLINE_MS);
      pending = (msg) => {
        clearTimeout(timer);
        pending = void 0;
        if ("error" in msg) {
          const code = input instanceof Uint8Array ? "PDF_OPEN_FAILED" : msg.fatal ? "PDF_HANDLE_CLOSED" : "PDF_PAGE_FAILED";
          reject(pdfError(code, msg.error));
        } else resolve(msg.value);
      };
      try {
        worker.postMessage(input, input instanceof Uint8Array ? [input.buffer] : []);
      } catch {
        fail("PDF worker unavailable");
      }
    });
  }
  try {
    const numPages = await request(copy);
    return { numPages, close, async outline() {
      return await request("outline");
    }, async page(n) {
      if (!Number.isInteger(n) || n < 1 || n > numPages) throw new RangeError("Invalid PDF page number");
      return await request(n);
    }, async renderPage(n) {
      if (!Number.isInteger(n) || n < 1 || n > numPages) throw new RangeError("Invalid PDF page number");
      return await request({ render: n });
    } };
  } catch (error) {
    await close();
    throw error;
  }
}
async function loadEngine() {
  const binary = await readFile(new URL("./pdfium.wasm", import.meta.url));
  const module = await WebAssembly.compile(binary);
  let api;
  const abort = () => {
    throw new Error("PDF parser stopped");
  };
  const env = {
    _abort_js: abort,
    __assert_fail: abort,
    _emscripten_throw_longjmp: abort,
    emscripten_date_now: () => 0,
    _tzset_js: abort,
    _localtime_js: abort,
    _gmtime_js: abort,
    _emscripten_memcpy_js: (to, from, len) => {
      new Uint8Array(api.memory.buffer).copyWithin(to, from, from + len);
    },
    emscripten_resize_heap: (size) => {
      const old = api.memory.buffer.byteLength;
      if (size >>> 0 > MAX_MEMORY) throw new Error("PDF parser memory limit");
      const target = Math.min(MAX_MEMORY, Math.max(size >>> 0, old + 8 * MiB));
      api.memory.grow(Math.ceil((target - old) / 65536));
      return 1;
    }
  };
  for (const { name, module: ns } of WebAssembly.Module.imports(module)) {
    if (ns === "env" && /^invoke_[vi]+$/.test(name))
      env[name] = (i, ...args) => api.__indirect_function_table.get(i)(...args);
  }
  for (const op of ["openat", "fcntl64", "ioctl", "fstat64", "stat64", "newfstatat", "lstat64", "getdents64", "unlinkat", "rmdir", "ftruncate64"])
    env["__syscall_" + op] = () => -44;
  const wasi = {};
  for (const op of ["fd_close", "fd_write", "fd_read", "fd_sync", "fd_seek", "environ_get", "environ_sizes_get"])
    wasi[op] = () => 76;
  const instance = await WebAssembly.instantiate(module, { env, wasi_snapshot_preview1: wasi });
  api = instance.exports;
  api.emscripten_stack_init();
  api.__wasm_call_ctors();
  api.FPDF_InitLibrary();
  return api;
}
function allocate(api, n) {
  const ptr = api.malloc(n);
  if (!ptr) throw new Error("PDF parser allocation failed");
  return ptr;
}
function readOutline(api, doc, pages, nested) {
  const titles = [], seen = /* @__PURE__ */ new Set();
  const buf = allocate(api, MAX_TITLE_BYTES);
  try {
    const stack = [{ bm: api.FPDFBookmark_GetFirstChild(doc, 0), depth: 0 }];
    while (stack.length) {
      const { bm, depth } = stack.pop();
      if (!bm) continue;
      if (seen.has(bm) || seen.size >= MAX_BOOKMARKS) return [];
      seen.add(bm);
      stack.push({ bm: api.FPDFBookmark_GetNextSibling(doc, bm), depth });
      if (nested) stack.push({ bm: api.FPDFBookmark_GetFirstChild(doc, bm), depth: depth + 1 });
      let dest = api.FPDFBookmark_GetDest(doc, bm);
      if (!dest) {
        const action = api.FPDFBookmark_GetAction(bm);
        if (action && api.FPDFAction_GetType(action) === 1) dest = api.FPDFAction_GetDest(doc, action);
      }
      if (!dest) continue;
      const n = api.FPDFDest_GetDestPageIndex(doc, dest) + 1;
      if (n < 1 || n > pages) continue;
      const len = api.FPDFBookmark_GetTitle(bm, buf, MAX_TITLE_BYTES);
      if (len < 4 || len > MAX_TITLE_BYTES || len % 2) continue;
      const title = new TextDecoder("utf-16le").decode(new Uint8Array(api.memory.buffer, buf, len - 2)).replace(/[\p{Cc}\p{Cf}]/gu, " ").trim();
      if (title) titles.push({ ordinal: n, title, depth });
    }
    return titles;
  } finally {
    api.free(buf);
  }
}
var PageFailure = class extends Error {
};
async function parse(bytes) {
  const api = await loadEngine(), ptr = allocate(api, bytes.length);
  new Uint8Array(api.memory.buffer, ptr, bytes.length).set(bytes);
  const doc = api.FPDF_LoadMemDocument(ptr, bytes.length, 0);
  if (!doc) throw new Error("Invalid or password-protected PDF");
  if (api.FPDF_GetSecurityHandlerRevision(doc) >= 0) throw new Error("Encrypted PDF is not supported");
  const numPages = api.FPDF_GetPageCount(doc);
  if (numPages < 1 || numPages > MAX_PAGES) throw new Error("Invalid or excessive PDF page count");
  const labels = [""];
  if (workerData !== readerRole) {
    const titles = /* @__PURE__ */ new Map();
    for (const entry of readOutline(api, doc, numPages, false)) if (!titles.has(entry.ordinal)) titles.set(entry.ordinal, entry.title);
    for (let i = 1; i <= numPages; i++) labels.push(titles.get(i) ?? labels[i - 1]);
  }
  function page(n, render = false) {
    const p = api.FPDF_LoadPage(doc, n - 1);
    if (!p) throw new PageFailure("Failed to load PDF page");
    try {
      const tp = api.FPDFText_LoadPage(p);
      if (!tp) throw new PageFailure("Failed to load PDF page text");
      try {
        const count = api.FPDFText_CountChars(tp);
        if (count < 0 || count > MAX_CHARS) throw new PageFailure("Invalid or excessive PDF page text length");
        const objects = render ? 0 : api.FPDFPage_CountObjects(p);
        let text = "", needsReview = objects < 0 || objects > 4096;
        for (let i = 0; i < objects && !needsReview; i++) {
          const type = api.FPDFPageObj_GetType(api.FPDFPage_GetObject(p, i));
          needsReview = type === 0 || type === 3 || type === 5;
        }
        const view = render ? viewport(api, p) : void 0;
        const source = [];
        const scratch = view ? allocate(api, 32) : 0;
        try {
          for (let i = 0; i < count; i++) {
            const ch = api.FPDFText_GetUnicode(tp, i);
            if (!view && (api.FPDFText_HasUnicodeMapError(tp, i) !== 0 || !ch || ch > 1114111)) needsReview = true;
            if (view) source[text.length] = glyphRect(api, p, tp, i, view.width, view.height, scratch);
            text += ch && ch <= 1114111 ? String.fromCodePoint(ch) : "\uFFFD";
          }
        } finally {
          if (scratch) api.free(scratch);
        }
        const raw = text;
        text = normalizeText(raw);
        if (view) return { text, ...view, boxes: normalizeBoxes(raw, source, text), image: imagePng(api, p, view.width, view.height) };
        needsReview ||= !text || /[\ufffd\p{Co}\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text);
        return { text, needsReview, chapter: labels[n] };
      } finally {
        api.FPDFText_ClosePage(tp);
      }
    } finally {
      api.FPDF_ClosePage(p);
    }
  }
  return { numPages, page, outline: () => readOutline(api, doc, numPages, true) };
}
if (parentPort && (workerData === role || workerData === readerRole)) {
  const port = parentPort;
  let document;
  port.on("message", async (input) => {
    try {
      if (input instanceof Uint8Array) {
        document = await parse(input);
        port.postMessage({ value: document.numPages });
      } else if (input === "outline") port.postMessage({ value: document.outline() });
      else if (typeof input === "number") port.postMessage({ value: document.page(input) });
      else port.postMessage({ value: document.page(input.render, true) });
    } catch (err) {
      const error = err instanceof Error ? err.message : "PDF parser failed";
      port.postMessage({ error, fatal: !(err instanceof PageFailure) });
    }
  });
}
export {
  openIndexPdf,
  openPdf,
  openReaderPdf
};
