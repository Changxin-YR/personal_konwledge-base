import { createHash } from 'node:crypto'

const MAX_BYTES = 8 * 1024 * 1024, MAX_BLOCKS = 16_384
type Media = 'text/plain' | 'text/markdown'
type Kind = 'paragraph' | 'blank' | 'heading' | 'code'
type Block = { kind: Kind; start: number; end: number; text: string; anchor: string }
type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030'

const messages = {
  TEXT_INVALID_INPUT: 'Expected text bytes and a supported text media type',
  TEXT_TOO_LARGE: 'Text exceeds the byte or structural block limit',
  TEXT_UNSUPPORTED_ENCODING: 'Unsupported text encoding',
  TEXT_INVALID_ENCODING: 'Invalid text bytes or conflicting byte order mark',
  TEXT_BINARY: 'Unexpected binary control character in text',
}

export class TextInputError extends Error {
  readonly code: keyof typeof messages
  constructor(code: keyof typeof messages) {
    super(messages[code])
    this.name = 'TextInputError'
    this.code = code
  }
}

function bomEncoding(bytes: Uint8Array): Encoding | undefined {
  const [a, b, c, d] = bytes
  // Check the longer UTF-32 signatures before their UTF-16 prefixes.
  if ((a === 0xff && b === 0xfe && c === 0 && d === 0) ||
      (a === 0 && b === 0 && c === 0xfe && d === 0xff)) throw new TextInputError('TEXT_UNSUPPORTED_ENCODING')
  if (a === 0xff && b === 0xfe) return 'utf-16le'
  if (a === 0xfe && b === 0xff) return 'utf-16be'
  if (a === 0xef && b === 0xbb && c === 0xbf) return 'utf-8'
}

function selectEncoding(bom: Encoding | undefined, requested?: string): Encoding {
  if (requested === undefined) return bom ?? 'utf-8'
  if (typeof requested !== 'string' || requested.length > 64) throw new TextInputError('TEXT_UNSUPPORTED_ENCODING')
  const label = requested.trim().toLowerCase()
  const enc = label === 'utf8' ? 'utf-8' : label
  if (enc !== 'utf-8' && enc !== 'utf-16le' && enc !== 'utf-16be' && enc !== 'gb18030')
    throw new TextInputError('TEXT_UNSUPPORTED_ENCODING')
  if (bom && bom !== enc) throw new TextInputError('TEXT_INVALID_ENCODING')
  return enc
}

// Index top-level Markdown markers only. Lines are scanned once in order;
// never split the whole document into an array or re-hash a growing paragraph.
function indexBlocks(source: string, markdown: boolean): Block[] {
  const blocks: Block[] = []
  let start = 0, pending: Kind | undefined, fence = ''
  function flush(end: number) {
    if (!pending) return
    if (blocks.length >= MAX_BLOCKS) throw new TextInputError('TEXT_TOO_LARGE')
    const text = source.slice(start, end)
    const anchor = createHash('sha256').update(text, 'utf8').digest('hex')
    blocks.push({kind: pending, start, end, text, anchor})
    start = end
    pending = undefined
  }

  for (let pos = 0; pos < source.length;) {
    let eol = pos
    while (eol < source.length && source.charCodeAt(eol) !== 10 && source.charCodeAt(eol) !== 13) eol++
    let end = eol
    if (source[end] === '\r') end++
    if (source[end] === '\n') end++
    const line = source.slice(pos, eol)
    const marker = markdown ? /^ {0,3}(`{3,}|~{3,})/.exec(line) : null
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length &&
          /^[ \t]*$/.test(line.slice(marker[0].length))) {
        flush(end)
        fence = ''
      }
    } else if (marker && (marker[1][0] === '~' || !line.includes('`', marker[0].length))) {
      flush(pos)
      pending = 'code'
      fence = marker[1]
    } else if (markdown && /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) {
      flush(pos)
      pending = 'heading'
      flush(end)
    } else if (markdown && pending === 'paragraph' && /^ {0,3}(?:=+|-+)[ \t]*$/.test(line)) {
      pending = 'heading'
      flush(end)
    } else {
      const kind = /^[ \t]*$/.test(line) ? 'blank' : 'paragraph'
      if (pending !== kind) flush(pos)
      pending = kind
    }
    pos = end
  }
  flush(source.length)
  return blocks
}

/** Offsets are half-open UTF-16 code units after one leading BOM. The anchor
 * hashes the exact decoded block including its line endings; use the offsets
 * to distinguish repeated blocks within a version. Markdown is never rendered. */
export function decodeText(bytes: Uint8Array, media: Media, requestedEncoding?: string): {encoding: string; blocks: Block[]} {
  if (!(bytes instanceof Uint8Array) || (media !== 'text/plain' && media !== 'text/markdown'))
    throw new TextInputError('TEXT_INVALID_INPUT')
  if (bytes.byteLength > MAX_BYTES) throw new TextInputError('TEXT_TOO_LARGE')
  const encoding = selectEncoding(bomEncoding(bytes), requestedEncoding)
  let decoder: TextDecoder
  try { decoder = new TextDecoder(encoding, {fatal: true, ignoreBOM: false}) }
  catch { throw new TextInputError('TEXT_UNSUPPORTED_ENCODING') }
  let text: string
  try { text = decoder.decode(bytes) }
  catch { throw new TextInputError('TEXT_INVALID_ENCODING') }
  // Check decoded characters, not bytes: zero bytes are normal in UTF-16.
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)) throw new TextInputError('TEXT_BINARY')
  return {encoding, blocks: indexBlocks(text, media === 'text/markdown')}
}
