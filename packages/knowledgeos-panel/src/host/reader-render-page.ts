import type { Methods } from '@embedpdf/pdfium'
import { crc32, deflateSync } from 'node:zlib'

type Engine = Omit<Methods, 'FPDF_LoadMemDocument'> & { memory: WebAssembly.Memory }
export type Rect = { x: number; y: number; width: number; height: number }
export type Box = Rect & { start: number; end: number }
export type RenderedPage = { text: string; width: number; height: number; image: string; boxes: Box[] }

// The extractor and the reader must never normalize the same page differently.
export function normalizeText(raw: string) {
  return raw.toWellFormed().replace(/\r\n?/g, '\n').trim()
}

// PDFium may emit either a scalar or two surrogate entries for a single glyph.
// Keep raw UTF-16 indices until pairs, CRLF and trimmed margins are accounted for.
export function normalizeBoxes(raw: string, source: (Rect | undefined)[], text: string): Box[] {
  const boxes: Box[] = []
  const trimStart = raw.length - raw.trimStart().length
  let out = 0
  for (let i = trimStart; i < raw.length && out < text.length;) {
    const cp = raw.codePointAt(i)!
    const units = cp > 0xffff ? 2 : 1
    const crlf = cp === 13 && raw.charCodeAt(i + 1) === 10
    if (cp !== 13 && cp !== 10) {
      let rect = source[i]
      const tail = units === 2 ? source[i + 1] : undefined
      if (tail && rect) {
        const x = Math.min(rect.x, tail.x), y = Math.min(rect.y, tail.y)
        rect = {x, y, width: Math.max(rect.x + rect.width, tail.x + tail.width) - x,
          height: Math.max(rect.y + rect.height, tail.y + tail.height) - y}
      } else rect ??= tail
      if (rect) boxes.push({start: out, end: out + units, ...rect})
    }
    i += crlf ? 2 : units
    out += units
  }
  return boxes
}

export function viewport(api: Engine, page: number) {
  const w = api.FPDF_GetPageWidthF(page), h = api.FPDF_GetPageHeightF(page)
  if (![w, h].every(n => Number.isFinite(n) && n > 0)) throw Error('Invalid PDF page dimensions')
  const scale = Math.min(2, 1536 / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

export function glyphRect(api: Engine, page: number, tp: number, index: number, width: number, height: number, ptr: number): Rect | undefined {
  if (api.FPDFText_IsGenerated(tp, index) !== 0 || !api.FPDFText_GetCharBox(tp, index, ptr, ptr+8, ptr+16, ptr+24)) return
  const [left, right, bottom, top] = new Float64Array(api.memory.buffer, ptr, 4)
  if (![left, right, bottom, top].every(Number.isFinite)) return
  // The display matrix includes the CropBox origin and intrinsic quarter-turn.
  // Its axes remain perpendicular, so opposite corners suffice.
  const point = (x: number, y: number) => {
    if (!api.FPDF_PageToDevice(page, 0, 0, width, height, 0, x, y, ptr, ptr+4)) return
    return Array.from(new Int32Array(api.memory.buffer, ptr, 2))
  }
  const a = point(left, bottom), b = point(right, top)
  if (!a || !b) return
  const x = Math.max(0, Math.min(a[0], b[0])), y = Math.max(0, Math.min(a[1], b[1]))
  const w = Math.min(width, Math.max(a[0], b[0])) - x, h = Math.min(height, Math.max(a[1], b[1])) - y
  if (w > 0 && h > 0) return { x, y, width: w, height: h }
}

function chunk(name: string, data: Buffer) {
  const buf = Buffer.allocUnsafe(data.length + 12)
  buf.writeUInt32BE(data.length); buf.write(name, 4, 4, 'ascii'); data.copy(buf, 8)
  buf.writeUInt32BE(crc32(buf.subarray(4, -4)), buf.length - 4)
  return buf
}

export function imagePng(api: Engine, page: number, width: number, height: number) {
  const bitmap = api.FPDFBitmap_Create(width, height, 0) // opaque BGRx
  if (!bitmap) throw Error('PDF bitmap unavailable')
  try {
    if (!api.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff)) throw Error('PDF bitmap unavailable')
    api.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, 1) // include static annotations
    const ptr = api.FPDFBitmap_GetBuffer(bitmap), stride = api.FPDFBitmap_GetStride(bitmap)
    if (!ptr || stride < width*4) throw Error('Invalid PDF bitmap')
    const bgr = new Uint8Array(api.memory.buffer, ptr, stride*height)
    const rows = Buffer.allocUnsafe((1 + 3*width) * height)
    let dst = 0
    for (let y = 0; y < height; y++) {
      rows[dst++] = 0 // no PNG prediction filter
      for (let x = 0, src = y*stride; x < width; x++, src += 4) {
        rows[dst++] = bgr[src+2]; rows[dst++] = bgr[src+1]; rows[dst++] = bgr[src]
      }
    }
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 1 })), chunk('IEND', Buffer.alloc(0))])
    return 'data:image/png;base64,' + png.toString('base64')
  } finally { api.FPDFBitmap_Destroy(bitmap) }
}
