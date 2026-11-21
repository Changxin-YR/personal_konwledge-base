import { readFile } from 'node:fs/promises'
import { Worker, parentPort, workerData } from 'node:worker_threads'
import type { Methods } from '@embedpdf/pdfium'
import { glyphRect, imagePng, normalizeBoxes, normalizeText, viewport, type Rect, type RenderedPage } from './reader-render-page.ts'

const MiB = 1024 * 1024
const MAX_BYTES = 64 * MiB, MAX_MEMORY = 256 * MiB, MAX_PAGES = 10_000
const MAX_CHARS = 32_000, MAX_BOOKMARKS = 2048, MAX_TITLE_BYTES = 512
const DEADLINE_MS = 15_000, MAX_WORKERS = 2
const role = 'knowledgeos:pdf-extractor:v1'
const readerRole = 'knowledgeos:pdf-reader:v1'
type Page = { text: string; needsReview: boolean; chapter: string }
type Outline = {ordinal:number;title:string;depth:number}[]
type Doc = { numPages: number; page(n: number): Promise<Page>; outline():Promise<Outline>; renderPage(n: number): Promise<RenderedPage>; close(): Promise<void> }
type Input = Uint8Array<ArrayBuffer> | number | {render: number} | 'outline'
type Result = { value: number | Page | RenderedPage | Outline } | { error: string; fatal: boolean }
const active = { extract: 0, reader: 0, index: 0 }

type ErrorCode = 'PDF_PAGE_FAILED' | 'PDF_HANDLE_CLOSED' | 'PDF_BUSY' | 'PDF_OPEN_FAILED'
function pdfError(code: ErrorCode, message: string) { return Object.assign(new Error(message), {code}) }

/** One-based physical pages. Callers own the handle and must close it in finally. */
export function openPdf(bytes: Uint8Array): Promise<Omit<Doc, 'renderPage'>> { return open(bytes, 'extract') }
export function openIndexPdf(bytes:Uint8Array,signal:AbortSignal):Promise<Omit<Doc,'renderPage'>> {return open(bytes,'index',signal)}
export function openReaderPdf(bytes: Uint8Array, signal?: AbortSignal): Promise<Doc> {
  return open(bytes, 'reader', signal)
}

async function open(bytes: Uint8Array, pool: keyof typeof active, signal?: AbortSignal): Promise<Doc> {
  if (signal?.aborted) throw pdfError('PDF_HANDLE_CLOSED', 'PDF closed')
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_BYTES)
    throw pdfError('PDF_OPEN_FAILED', 'Invalid PDF input size or type')
  // A reader burst must not make the parse worker mark an import job failed.
  if (active[pool] >= (pool==='index'?1:MAX_WORKERS)) throw pdfError('PDF_BUSY', 'PDF extractor busy')
  const copy = new Uint8Array(bytes) // never transfer/detach the caller's buffer or pooled slab
  const worker = new Worker(new URL('./pdf-extractor.js', import.meta.url), {
    workerData: pool === 'reader' ? readerRole : role, env: {}, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 48, maxYoungGenerationSizeMb: 8 },
  })
  active[pool]++
  let pending: ((msg: Result) => void) | undefined
  let closing: Promise<void> | undefined
  const close = (): Promise<void> => {
    if (!closing) {
      signal?.removeEventListener('abort', abort)
      closing = worker.terminate().then(() => {}).finally(() => { active[pool]-- })
      pending?.({error: 'PDF closed', fatal: true})
    }
    return closing
  }
  function fail(error: string) {
    pending?.({error, fatal: true})
    void close()
  }
  function abort() { void close() }
  signal?.addEventListener('abort', abort, {once:true})
  worker.on('message', (msg: Result) => {
    pending?.(msg)
    if ('error' in msg && msg.fatal) void close()
  })
  worker.on('error', () => fail('PDF worker failed'))
  worker.on('exit', () => fail('PDF worker exited'))
  function request(input: Input): Promise<number | Page | RenderedPage | Outline> {
    if (closing) return Promise.reject(pdfError('PDF_HANDLE_CLOSED', 'PDF closed'))
    if (pending) return Promise.reject(pdfError('PDF_BUSY', 'PDF extractor busy'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail('PDF parser deadline exceeded'), DEADLINE_MS)
      pending = msg => {
        clearTimeout(timer)
        pending = undefined
        if ('error' in msg) {
          const code = input instanceof Uint8Array ? 'PDF_OPEN_FAILED' : msg.fatal ? 'PDF_HANDLE_CLOSED' : 'PDF_PAGE_FAILED'
          reject(pdfError(code, msg.error))
        } else resolve(msg.value)
      }
      try { worker.postMessage(input, input instanceof Uint8Array ? [input.buffer] : []) }
      catch { fail('PDF worker unavailable') }
    })
  }
  try {
    const numPages = await request(copy) as number
    return { numPages, close, async outline(){return await request('outline') as Outline}, async page(n) {
      if (!Number.isInteger(n) || n < 1 || n > numPages) throw new RangeError('Invalid PDF page number')
      return await request(n) as Page
    }, async renderPage(n) {
      if (!Number.isInteger(n) || n < 1 || n > numPages) throw new RangeError('Invalid PDF page number')
      return await request({render:n}) as RenderedPage
    } }
  } catch (error) { await close(); throw error }
}

// Raw C ABI, not the package's Emscripten Node loader. The only file opened by
// this adapter is the fixed, build-supplied binary. There is no WASI host, JS
// evaluator, external font loader, document action handler, or network import.
type Pdfium = Omit<Methods, 'FPDF_LoadMemDocument'> & {
  FPDF_LoadMemDocument(ptr: number, length: number, password: number): number
  memory: WebAssembly.Memory; __indirect_function_table: WebAssembly.Table
  malloc(n: number): number; free(p: number): void
  emscripten_stack_init(): void; __wasm_call_ctors(): void
}
async function loadEngine(): Promise<Pdfium> {
  const binary = await readFile(new URL('./pdfium.wasm', import.meta.url))
  const module = await WebAssembly.compile(binary)
  let api: Pdfium
  const abort = () => { throw new Error('PDF parser stopped') }
  const env: WebAssembly.ModuleImports = {
    _abort_js: abort, __assert_fail: abort, _emscripten_throw_longjmp: abort,
    emscripten_date_now: () => 0, _tzset_js: abort, _localtime_js: abort, _gmtime_js: abort,
    _emscripten_memcpy_js: (to: number, from: number, len: number) => {
      new Uint8Array(api.memory.buffer).copyWithin(to, from, from + len)
    },
    emscripten_resize_heap: (size: number) => {
      const old = api.memory.buffer.byteLength
      if ((size >>> 0) > MAX_MEMORY) throw new Error('PDF parser memory limit')
      const target = Math.min(MAX_MEMORY, Math.max(size >>> 0, old + 8 * MiB))
      api.memory.grow(Math.ceil((target - old) / 65536))
      return 1
    },
  }
  // Delegate indirect calls only to the module's own function table. Unsupported
  // exceptional unwinding traps the request, never resumes a damaged instance.
  for (const { name, module: ns } of WebAssembly.Module.imports(module)) {
    if (ns === 'env' && /^invoke_[vi]+$/.test(name))
      env[name] = (i: number, ...args: number[]) => api.__indirect_function_table.get(i)(...args)
  }
  for (const op of ['openat','fcntl64','ioctl','fstat64','stat64','newfstatat','lstat64','getdents64','unlinkat','rmdir','ftruncate64'])
    env['__syscall_' + op] = () => -44 // Emscripten ENOENT
  const wasi: WebAssembly.ModuleImports = {}
  for (const op of ['fd_close','fd_write','fd_read','fd_sync','fd_seek','environ_get','environ_sizes_get'])
    wasi[op] = () => 76 // WASI ENOTCAPABLE
  const instance = await WebAssembly.instantiate(module, {env, wasi_snapshot_preview1: wasi})
  api = instance.exports as unknown as Pdfium
  api.emscripten_stack_init(); api.__wasm_call_ctors(); api.FPDF_InitLibrary()
  return api
}

function allocate(api: Pdfium, n: number) {
  const ptr = api.malloc(n)
  if (!ptr) throw new Error('PDF parser allocation failed')
  return ptr
}

// Only root-level, local GoTo destinations. Ignore remote actions and never
// infer structure from typography. Discard partial outlines on cycle/overflow.
function readOutline(api: Pdfium, doc: number, pages: number, nested:boolean):Outline {
  const titles:Outline=[], seen = new Set<number>()
  const buf = allocate(api, MAX_TITLE_BYTES)
  try {
    const stack=[{bm:api.FPDFBookmark_GetFirstChild(doc,0),depth:0}]
    while(stack.length){
      const {bm,depth}=stack.pop()!
      if(!bm)continue
      if (seen.has(bm) || seen.size >= MAX_BOOKMARKS) return []
      seen.add(bm)
      stack.push({bm:api.FPDFBookmark_GetNextSibling(doc,bm),depth})
      if(nested)stack.push({bm:api.FPDFBookmark_GetFirstChild(doc,bm),depth:depth+1})
      let dest = api.FPDFBookmark_GetDest(doc, bm)
      if (!dest) {
        const action = api.FPDFBookmark_GetAction(bm)
        if (action && api.FPDFAction_GetType(action) === 1) dest = api.FPDFAction_GetDest(doc, action)
      }
      if (!dest) continue
      const n = api.FPDFDest_GetDestPageIndex(doc, dest) + 1
      if (n < 1 || n > pages) continue
      const len = api.FPDFBookmark_GetTitle(bm, buf, MAX_TITLE_BYTES)
      if (len < 4 || len > MAX_TITLE_BYTES || len % 2) continue
      const title = new TextDecoder('utf-16le').decode(new Uint8Array(api.memory.buffer, buf, len - 2)).replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim()
      if (title) titles.push({ordinal:n,title,depth})
    }
    return titles
  } finally { api.free(buf) }
}

class PageFailure extends Error {}
async function parse(bytes: Uint8Array) {
  const api = await loadEngine(), ptr = allocate(api, bytes.length)
  new Uint8Array(api.memory.buffer, ptr, bytes.length).set(bytes)
  // The document borrows ptr until close. Worker termination frees the whole
  // instance, including the document and input, even on timeout or cancellation.
  const doc = api.FPDF_LoadMemDocument(ptr, bytes.length, 0)
  if (!doc) throw new Error('Invalid or password-protected PDF')
  if (api.FPDF_GetSecurityHandlerRevision(doc) >= 0) throw new Error('Encrypted PDF is not supported')
  const numPages = api.FPDF_GetPageCount(doc)
  if (numPages < 1 || numPages > MAX_PAGES) throw new Error('Invalid or excessive PDF page count')
  const labels: string[] = ['']
  if (workerData !== readerRole) {
    const titles = new Map<number,string>()
    for(const entry of readOutline(api,doc,numPages,false))if(!titles.has(entry.ordinal))titles.set(entry.ordinal,entry.title)
    for (let i = 1; i <= numPages; i++) labels.push(titles.get(i) ?? labels[i-1])
  }
  function page(n: number, render = false): Page | RenderedPage {
    const p = api.FPDF_LoadPage(doc, n - 1)
    if (!p) throw new PageFailure('Failed to load PDF page')
    try {
      const tp = api.FPDFText_LoadPage(p)
      if (!tp) throw new PageFailure('Failed to load PDF page text')
      try {
        const count = api.FPDFText_CountChars(tp)
        if (count < 0 || count > MAX_CHARS) throw new PageFailure('Invalid or excessive PDF page text length')
        // Captions on a scan must not turn an unextracted image into a clean
        // page. Forms can also contain images; conservatively flag them.
        const objects = render ? 0 : api.FPDFPage_CountObjects(p)
        let text = '', needsReview = objects < 0 || objects > 4096
        for (let i = 0; i < objects && !needsReview; i++) {
          const type = api.FPDFPageObj_GetType(api.FPDFPage_GetObject(p, i))
          needsReview = type === 0 || type === 3 || type === 5 // unknown, image, form
        }
        const view = render ? viewport(api, p) : undefined
        const source: (Rect | undefined)[] = []
        const scratch = view ? allocate(api, 32) : 0
        try {
          for (let i = 0; i < count; i++) {
            const ch = api.FPDFText_GetUnicode(tp, i)
            if (!view && (api.FPDFText_HasUnicodeMapError(tp, i) !== 0 || !ch || ch > 0x10ffff)) needsReview = true
            if (view) source[text.length] = glyphRect(api, p, tp, i, view.width, view.height, scratch)
            text += ch && ch <= 0x10ffff ? String.fromCodePoint(ch) : '\ufffd'
          }
        } finally { if (scratch) api.free(scratch) }
        const raw = text
        text = normalizeText(raw)
        if (view) return {text, ...view, boxes: normalizeBoxes(raw, source, text), image: imagePng(api, p, view.width, view.height)}
        needsReview ||= !text || /[\ufffd\p{Co}\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text)
        return {text, needsReview, chapter: labels[n]}
      } finally { api.FPDFText_ClosePage(tp) }
    } finally { api.FPDF_ClosePage(p) }
  }
  return { numPages, page, outline:()=>readOutline(api,doc,numPages,true) }
}

if (parentPort && (workerData === role || workerData === readerRole)) {
  const port = parentPort
  let document: Awaited<ReturnType<typeof parse>>
  port.on('message', async (input: Input) => {
    try {
      if (input instanceof Uint8Array) { document = await parse(input); port.postMessage({value: document.numPages}) }
      else if (input==='outline') port.postMessage({value:document.outline()})
      else if (typeof input === 'number') port.postMessage({value: document.page(input)})
      else port.postMessage({value: document.page(input.render, true)})
    } catch (err) {
      const error = err instanceof Error ? err.message : 'PDF parser failed'
      port.postMessage({error, fatal: !(err instanceof PageFailure)})
    }
  })
}
