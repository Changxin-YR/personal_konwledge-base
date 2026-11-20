import { createHash, randomUUID } from 'node:crypto'
import { constants, type BigIntStats } from 'node:fs'
import fs from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {verifyWordBytes} from './word-original.ts'
import {WORD_MEDIA,type WordMedia} from './office-schema.ts'

const MAX = 64 * 1024 * 1024
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:pdf|txt|docx?)$/
const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex')
export class PdfInputError extends Error {
  readonly code = 'PDF_INVALID_INPUT'
  constructor() {
    super('Invalid PDF envelope')
    this.name = 'PdfInputError'
    this.stack = `${this.name}: ${this.message}`
  }
}

export class PdfStorageError extends Error {
  readonly code = 'PDF_ORIGINAL_UNAVAILABLE'
  constructor() {
    super('PDF original unavailable')
    this.name = 'PdfStorageError'
    this.stack = `${this.name}: ${this.message}`
  }
}

const invalid = () => new PdfInputError()
const unavailable = () => new PdfStorageError()

// Scan just the indirect object's dictionary. A /Type in a comment, nested
// dictionary, literal string or later object must not identify an xref stream.
function xrefStream(head: string): boolean {
  const obj = /^[1-9]\d*[ \t\r\n]+\d+[ \t\r\n]+obj[ \t\r\n]*<</.exec(head)
  if (!obj) return false
  const token = /[\x00\t\n\f\r ]+|%[^\r\n]*|<<|>>|\[|\]|\(|<[\da-fA-F\x00\t\n\f\r ]*>|\/?[^\x00\t\n\f\r ()<>\[\]\/%]+/y
  token.lastIndex = obj[0].length
  const ends = ['>>']
  let type = false, found = false
  for (let m; (m = token.exec(head));) {
    const s = m[0]
    if (/^[%\x00\t\n\f\r ]/.test(s)) continue
    if (ends.length === 1 && type && s === '/XRef') found = true
    type = ends.length === 1 && s === '/Type'
    if (s === '<<' || s === '[') ends.push(s === '<<' ? '>>' : ']')
    else if (s === '>>' || s === ']') {
      if (ends.pop() !== s) return false
      if (!ends.length) return found && /^[ \t\r\n]*stream(?:\r\n|\n)/.test(head.slice(token.lastIndex))
    } else if (s === '(') {
      let depth = 1, pos = token.lastIndex
      while (depth && pos < head.length) {
        const ch = head[pos++]
        if (ch === '\\') pos++
        else if (ch === '(') depth++
        else if (ch === ')') depth--
      }
      token.lastIndex = pos
    }
  }
  return false
}

// Intake, not a parser: inspect only the header, final footer and a bounded
// prefix at its exact byte offset. Never inflate or follow PDF objects.
function checkEnvelope(b: Buffer): void {
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(b.toString('latin1', 0, 10))) throw invalid()
  const tail = Math.max(0, b.length - 4096)
  const footer = /[\r\n]startxref[ \t]*[\r\n]+[ \t]*(\d{1,16})[ \t]*[\r\n]+%%EOF[\x00\t\n\f\r ]*$/.exec(b.toString('latin1', tail))
  if (!footer) throw invalid()
  const offset = Number(footer[1]), end = tail + footer.index
  if (offset < 9 || offset >= end || !/[\x00\t\n\f\r ]/.test(String.fromCharCode(b[offset - 1]))) throw invalid()
  const head = b.toString('latin1', offset, Math.min(end, offset + 16384))
  if (/^xref[ \t\r\n]+\d+[ \t]+[1-9]\d*[ \t]*[\r\n]+\d{10} \d{5} [nf](?=[ \t\r\n])/.test(head)) return
  if (!xrefStream(head)) throw invalid()
}

const statOpts = { bigint: true } as const
const same = (a: BigIntStats, b: BigIntStats) => a.ino !== 0n && a.ino === b.ino && a.dev === b.dev && a.birthtimeNs === b.birthtimeNs
const hasCode = (e: unknown, code: string) => (e as NodeJS.ErrnoException)?.code === code
const noFollow = constants.O_NOFOLLOW ?? 0

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return // Node cannot open a Windows directory for fsync.
  const dir = await fs.open(path, constants.O_RDONLY | constants.O_DIRECTORY | noFollow)
  try { await dir.sync() } finally { await dir.close() }
}

async function checkedDirectory(path: string, create: boolean): Promise<BigIntStats> {
  let stat: BigIntStats
  try { stat = await fs.lstat(path, statOpts) } catch (e) {
    if (!create || !hasCode(e, 'ENOENT') || dirname(path) === path) throw e
    const parent = dirname(path)
    await checkedDirectory(parent, true)
    try { await fs.mkdir(path, { mode: 0o700 }) } catch (e) { if (!hasCode(e, 'EEXIST')) throw e }
    await syncDirectory(parent)
    stat = await fs.lstat(path, statOpts)
  }
  if (!stat.isDirectory() || stat.ino === 0n || await fs.realpath(path) !== path) throw unavailable()
  return stat
}

/** Use a host-private local root under trusted, non-replaceable ancestors.
 * Retain on this writer after a confirmed reference commit; discard
 * only on confirmed rollback, never on an ambiguous commit outcome. Reads
 * require metadata from an already authorized reference, not client input.
 */
export class PdfOriginals {
  readonly #root: string
  #rootId?: BigIntStats
  readonly #pending = new Map<string, { id: BigIntStats; discarding: boolean }>()

  constructor(rootDir: string) {
    if (typeof rootDir !== 'string' || !rootDir) throw unavailable()
    this.#root = resolve(rootDir)
    if (process.platform === 'win32' && !/^[A-Za-z]:\\/.test(this.#root)) throw unavailable()
  }

  async #directory(create = false): Promise<void> {
    const stat = await checkedDirectory(this.#root, create && !this.#rootId)
    if (this.#rootId && !same(this.#rootId, stat)) throw unavailable()
    this.#rootId = stat
  }

  async #file(path: string): Promise<BigIntStats> {
    const stat = await fs.lstat(path, statOpts)
    if (!stat.isFile() || stat.ino === 0n || await fs.realpath(path) !== path) throw unavailable()
    return stat
  }

  async #unlinkOwned(path: string, id: BigIntStats, stillOwned = () => true): Promise<void> {
    await this.#directory()
    const stat = await this.#file(path)
    if (!same(id, stat)) throw unavailable()
    if (stillOwned()) await fs.unlink(path)
  }

  async put(bytes: Uint8Array): Promise<{ key: string; sha256: string; byteLength: number }> {
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX) throw invalid()
    const data = Buffer.from(bytes) // Snapshot before the first await, including subarray bounds.
    checkEnvelope(data)
    try { return await this.#write(data,'pdf') } catch { throw unavailable() }
  }

  async putText(bytes:Uint8Array) {
    if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>MAX)throw unavailable()
    try{return await this.#write(Buffer.from(bytes),'txt')}catch{throw unavailable()}
  }

  async putWord(bytes:Uint8Array,media:WordMedia){
    if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>MAX)throw unavailable()
    const data=Buffer.from(bytes);await verifyWordBytes(data,media)
    try{return await this.#write(data,media===WORD_MEDIA.doc?'doc':'docx')}catch{throw unavailable()}
  }

  async #write(data: Buffer, extension:'txt'|'pdf'|'doc'|'docx') {
    const sha256 = digest(data)
    await this.#directory(true)
    const stage = join(this.#root, `.${randomUUID()}.pending`)
    const key = `${randomUUID()}.${extension}`, final = join(this.#root, key)
    const file = await fs.open(stage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600)
    let id: BigIntStats | undefined, staged = true, linked = false
    try {
      try {
        id = await file.stat(statOpts)
        await file.writeFile(data)
        if ((await file.stat(statOpts)).size !== BigInt(data.length)) throw unavailable()
        await file.sync()
        await this.#directory()
        if (!same(id, await this.#file(stage))) throw unavailable()
        // Unlike rename, link fails if final already exists (including dangling links).
        await fs.link(stage, final)
        linked = true
        await this.#unlinkOwned(stage, id)
        staged = false
        await file.sync() // Flush file metadata after changing links as well.
        const published = await this.#file(final)
        if (!same(id, published) || published.nlink !== 1n || published.size !== BigInt(data.length)) throw unavailable()
      } finally { await file.close() }
      await syncDirectory(this.#root)
      this.#pending.set(key, { id, discarding: false })
      return { key, sha256, byteLength: data.length }
    } catch (failure) {
      // Never remove a collision or enumerate and delete someone else's stages.
      if (id && linked) await this.#unlinkOwned(final, id)
      if (id && staged) await this.#unlinkOwned(stage, id)
      throw failure
    }
  }

  async read(key: string, expectedSha: string, expectedSize: number): Promise<Buffer> {
    try {
      if (typeof key !== 'string' || key.length !== (key.endsWith('.docx')?41:40) || !KEY.test(key) ||
          typeof expectedSha !== 'string' || expectedSha.length !== 64 || !/^[0-9a-f]+$/.test(expectedSha) ||
          !Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX) throw unavailable()
      await this.#directory()
      const path = join(this.#root, key), before = await this.#file(path)
      if (before.nlink !== 1n || before.size !== BigInt(expectedSize)) throw unavailable()
      const file = await fs.open(path, constants.O_RDONLY | noFollow | (constants.O_NONBLOCK ?? 0))
      try {
        const stat = await file.stat(statOpts)
        if (!same(before, stat) || stat.size !== before.size || stat.nlink !== 1n) throw unavailable()
        const data = Buffer.allocUnsafe(expectedSize)
        for (let pos = 0; pos < expectedSize;) {
          const { bytesRead } = await file.read(data, pos, expectedSize - pos, pos)
          if (!bytesRead) throw unavailable()
          pos += bytesRead
        }
        await this.#directory()
        const after = await this.#file(path)
        if (!same(stat, after) || after.size !== stat.size || after.nlink !== 1n || digest(data) !== expectedSha) throw unavailable()
        if(key.endsWith('.pdf'))checkEnvelope(data)
        return data
      } finally { await file.close() }
    } catch { throw unavailable() } // No path, existence or integrity oracle in errors.
  }

  /** Surrender this instance's rollback permission. No I/O and safe to repeat. */
  retain(key: string): void {
    this.#pending.delete(key)
  }

  async discard(key: string): Promise<void> {
    const entry = this.#pending.get(key)
    if (!entry || entry.discarding) return
    entry.discarding = true
    try {
      await this.#unlinkOwned(join(this.#root, key), entry.id, () => this.#pending.get(key) === entry)
      await syncDirectory(this.#root)
    } catch (e) {
      if (!hasCode(e, 'ENOENT')) throw unavailable()
    } finally {
      entry.discarding = false // A failed discard never recreates ownership withdrawn by retain.
    }
    this.#pending.delete(key)
  }
}
