// src/host/pdf-extractor.ts
import { readFile } from "node:fs/promises";
import { Worker, parentPort, workerData } from "node:worker_threads";
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
var active = 0;
function pdfError(code, message) {
  return Object.assign(new Error(message), { code });
}
async function openPdf(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_BYTES)
    throw pdfError("PDF_OPEN_FAILED", "Invalid PDF input size or type");
  if (active >= MAX_WORKERS) throw pdfError("PDF_BUSY", "PDF extractor busy");
  const copy = new Uint8Array(bytes);
  const worker = new Worker(new URL("./pdf-extractor.js", import.meta.url), {
    workerData: role,
    env: {},
    execArgv: [],
    resourceLimits: { maxOldGenerationSizeMb: 48, maxYoungGenerationSizeMb: 8 }
  });
  active++;
  let pending;
  let closing;
  const close = () => {
    if (!closing) {
      closing = worker.terminate().then(() => {
      }).finally(() => {
        active--;
      });
      pending?.({ error: "PDF closed", fatal: true });
    }
    return closing;
  };
  function fail(error) {
    pending?.({ error, fatal: true });
    void close();
  }
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
          const code = typeof input !== "number" ? "PDF_OPEN_FAILED" : msg.fatal ? "PDF_HANDLE_CLOSED" : "PDF_PAGE_FAILED";
          reject(pdfError(code, msg.error));
        } else resolve(msg.value);
      };
      try {
        worker.postMessage(input, typeof input === "number" ? [] : [input.buffer]);
      } catch {
        fail("PDF worker unavailable");
      }
    });
  }
  try {
    const numPages = await request(copy);
    return { numPages, close, async page(n) {
      if (!Number.isInteger(n) || n < 1 || n > numPages) throw new RangeError("Invalid PDF page number");
      return await request(n);
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
function chapters(api, doc, pages) {
  const titles = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set();
  const buf = allocate(api, MAX_TITLE_BYTES);
  try {
    for (let bm = api.FPDFBookmark_GetFirstChild(doc, 0); bm; bm = api.FPDFBookmark_GetNextSibling(doc, bm)) {
      if (seen.has(bm) || seen.size >= MAX_BOOKMARKS) return /* @__PURE__ */ new Map();
      seen.add(bm);
      let dest = api.FPDFBookmark_GetDest(doc, bm);
      if (!dest) {
        const action = api.FPDFBookmark_GetAction(bm);
        if (action && api.FPDFAction_GetType(action) === 1) dest = api.FPDFAction_GetDest(doc, action);
      }
      if (!dest) continue;
      const n = api.FPDFDest_GetDestPageIndex(doc, dest) + 1;
      if (n < 1 || n > pages || titles.has(n)) continue;
      const len = api.FPDFBookmark_GetTitle(bm, buf, MAX_TITLE_BYTES);
      if (len < 4 || len > MAX_TITLE_BYTES || len % 2) continue;
      const title = new TextDecoder("utf-16le").decode(new Uint8Array(api.memory.buffer, buf, len - 2)).replace(/[\p{Cc}\p{Cf}]/gu, " ").trim();
      if (title) titles.set(n, title);
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
  const titles = chapters(api, doc, numPages);
  const labels = [""];
  for (let i = 1; i <= numPages; i++) labels.push(titles.get(i) ?? labels[i - 1]);
  function page(n) {
    const p = api.FPDF_LoadPage(doc, n - 1);
    if (!p) throw new PageFailure("Failed to load PDF page");
    try {
      const tp = api.FPDFText_LoadPage(p);
      if (!tp) throw new PageFailure("Failed to load PDF page text");
      try {
        const count = api.FPDFText_CountChars(tp);
        if (count < 0 || count > MAX_CHARS) throw new PageFailure("Invalid or excessive PDF page text length");
        const objects = api.FPDFPage_CountObjects(p);
        let text = "", needsReview = objects < 0 || objects > 4096;
        for (let i = 0; i < objects && !needsReview; i++) {
          const type = api.FPDFPageObj_GetType(api.FPDFPage_GetObject(p, i));
          needsReview = type === 0 || type === 3 || type === 5;
        }
        for (let i = 0; i < count; i++) {
          const ch = api.FPDFText_GetUnicode(tp, i);
          if (api.FPDFText_HasUnicodeMapError(tp, i) !== 0 || !ch || ch > 1114111) needsReview = true;
          text += ch && ch <= 1114111 ? String.fromCodePoint(ch) : "\uFFFD";
        }
        text = text.toWellFormed().replace(/\r\n?/g, "\n").trim();
        needsReview ||= !text || /[\ufffd\p{Co}\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text);
        return { text, needsReview, chapter: labels[n] };
      } finally {
        api.FPDFText_ClosePage(tp);
      }
    } finally {
      api.FPDF_ClosePage(p);
    }
  }
  return { numPages, page };
}
if (parentPort && workerData === role) {
  const port = parentPort;
  let document;
  port.on("message", async (input) => {
    try {
      if (typeof input !== "number") {
        document = await parse(input);
        port.postMessage({ value: document.numPages });
      } else port.postMessage({ value: document.page(input) });
    } catch (err) {
      const error = err instanceof Error ? err.message : "PDF parser failed";
      port.postMessage({ error, fatal: !(err instanceof PageFailure) });
    }
  });
}
export {
  openPdf
};
