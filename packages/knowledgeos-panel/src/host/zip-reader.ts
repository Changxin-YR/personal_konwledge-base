import { crc32, createInflateRaw } from 'node:zlib'
import { WORD_MEDIA } from './office-schema.ts'
import { checkWordEnvelope } from './word-original.ts'

// Classic, single-disk ZIP; stored and deflated members. No recursive archive
// imports. A DOCX is one opaque Word original, not a second import manifest.
const MiB = 1024 * 1024
export const ZIP_LIMITS = Object.freeze({ archiveBytes: 64 * MiB, memberBytes: 64 * MiB,
  expandedBytes: 128 * MiB, entries: 512, pathBytes: 1024, pathDepth: 16, archiveDepth: 0 })

type Code = 'ZIP_MALFORMED' | 'ZIP_UNSUPPORTED_FEATURE' | 'ZIP_UNSAFE_PATH' | 'ZIP_UNSAFE_TYPE' |
  'ZIP_PATH_ALIAS' | 'ZIP_LIMIT_EXCEEDED' | 'ZIP_NESTED_ARCHIVE' | 'ZIP_DIRECTORY' |
  'ZIP_UNSUPPORTED_MEDIA' | 'ZIP_INVALID_SELECTION' | 'ZIP_INTEGRITY' | 'ZIP_CANCELLED'
export class ZipInputError extends Error {
  constructor(readonly code: Code) { super(code); this.name = 'ZipInputError' }
}
function reject(code: Code): never { throw new ZipInputError(code) }
function valid(condition: boolean): void { if (!condition) reject('ZIP_MALFORMED') }
function limit(condition: boolean): void { if (!condition) reject('ZIP_LIMIT_EXCEEDED') }
function active(signal?: AbortSignal): void { if (signal?.aborted) reject('ZIP_CANCELLED') }

export interface ZipEntry {
  ordinal: number; name: string; path: string; size: number; compressedSize: number
  media: string | null; reason: 'ZIP_DIRECTORY' | 'ZIP_UNSUPPORTED_MEDIA' | null
}
interface RecordInfo { entry: ZipEntry; local: number; start: number; end: number; method: number; crc: number }
const utf8 = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true})
const mediaTypes = new Map([['pdf','application/pdf'], ['doc',WORD_MEDIA.doc], ['docx',WORD_MEDIA.docx],
  ['md','text/markdown'], ['markdown','text/markdown'], ['txt','text/plain']])
const nestedName = /\.(?:zipx?|7z|rar|tar|tgz|gz|bz2|xz|jar|war)$/i
const forbidden = /[\\/:*?"<>|\p{Cc}\p{Cf}]/u
const reserved = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|(?:COM|LPT)[1-9])(?: *\.|$)/iu

// Record implicit directories too: a file may not shadow a parent, and two
// distinct original spellings may not resolve to the same path or parent.
type Seen = Map<string,{ original: string; directory: boolean; explicit: boolean }>
function manifestPath(name: string, directory: boolean, seen: Seen): string {
  const parts = (directory ? name.slice(0,-1) : name).split('/')
  limit(parts.length <= ZIP_LIMITS.pathDepth)
  let key = '', original = ''
  for (const [i,part] of parts.entries()) {
    const normal = part.normalize('NFKC')
    if (!normal || forbidden.test(normal) || /[. ]$/.test(normal) || reserved.test(normal) || /~[0-9]+(?:\.|$)/i.test(normal)) reject('ZIP_UNSAFE_PATH')
    limit(Buffer.byteLength(part) <= 255)
    const last = i === parts.length-1, dir = !last || directory
    original += '/' + part; key += '/' + normal.toUpperCase()
    const old = seen.get(key)
    if (old && (old.original !== original || old.directory !== dir || (last && old.explicit))) reject('ZIP_PATH_ALIAS')
    seen.set(key,{original,directory:dir,explicit:last || !!old?.explicit})
  }
  return parts.join('/').normalize('NFC')
}

// Accept only non-semantic time/owner extras. Alternate names, ZIP64 sizes,
// and platform-specific link metadata are outside this reader's profile.
function checkExtras(b: Buffer, pos: number, end: number) {
  while (pos < end) {
    valid(pos+4 <= end)
    const tag=b.readUInt16LE(pos), length=b.readUInt16LE(pos+2); pos+=4
    valid(pos+length <= end)
    if (![0x5455,0x7875,0x000a].includes(tag)) reject('ZIP_UNSUPPORTED_FEATURE')
    // The only NTFS attribute supported is the fixed-length timestamp triple.
    if (tag===0x000a && !(length===32 && b.readUInt32LE(pos)===0 && b.readUInt16LE(pos+4)===1 && b.readUInt16LE(pos+6)===24)) reject('ZIP_UNSUPPORTED_FEATURE')
    pos+=length
  }
}

function findEnd(b: Buffer): number {
  for (let pos=b.length-22, floor=Math.max(0,pos-65535); pos>=floor; --pos) {
    if (b.readUInt32LE(pos)===0x06054b50 && pos+22+b.readUInt16LE(pos+20)===b.length) return pos
  }
  return reject('ZIP_MALFORMED')
}

function parse(bytes: Buffer): RecordInfo[] {
  valid(Buffer.isBuffer(bytes)); limit(bytes.length <= ZIP_LIMITS.archiveBytes)
  // Integrity checks require a stable view before the first asynchronous read.
  if (bytes.buffer instanceof SharedArrayBuffer) reject('ZIP_UNSUPPORTED_FEATURE')
  const b=bytes, end=findEnd(b), count=b.readUInt16LE(end+10), central=b.readUInt32LE(end+16)
  if (b.readUInt32LE(end+4)!==0 || count===0xffff || central===0xffffffff) reject('ZIP_UNSUPPORTED_FEATURE')
  valid(b.readUInt16LE(end+8)===count && central+b.readUInt32LE(end+12)===end)
  limit(count<=ZIP_LIMITS.entries)
  let pos=central, expanded=0
  const seen: Seen=new Map(), records: RecordInfo[]=[]
  for (let ordinal=0; ordinal<count; ++ordinal) {
    valid(pos+46<=end && b.readUInt32LE(pos)===0x02014b50)
    const flags=b.readUInt16LE(pos+8), method=b.readUInt16LE(pos+10), crc=b.readUInt32LE(pos+16),
      compressedSize=b.readUInt32LE(pos+20), size=b.readUInt32LE(pos+24), n=b.readUInt16LE(pos+28),
      x=b.readUInt16LE(pos+30), extraEnd=pos+46+n+x, next=extraEnd+b.readUInt16LE(pos+32), local=b.readUInt32LE(pos+42)
    if ((flags & ~(0x808 | (method===8?6:0))) || (method!==0 && method!==8) || b.readUInt16LE(pos+34)!==0 ||
      [compressedSize,size,local].includes(0xffffffff)) reject('ZIP_UNSUPPORTED_FEATURE')
    valid(n>0 && next<=end && local+30<=central && b.readUInt32LE(local)===0x04034b50)
    expanded+=size
    limit(n<=ZIP_LIMITS.pathBytes && size<=ZIP_LIMITS.memberBytes && expanded<=ZIP_LIMITS.expandedBytes)
    const raw=b.subarray(pos+46,pos+46+n)
    if (!(flags&0x800) && raw.some(byte=>byte>=128)) reject('ZIP_UNSUPPORTED_FEATURE')
    let name: string
    try { name=utf8.decode(raw) } catch { return reject('ZIP_MALFORMED') }
    const directory=name.endsWith('/'), attrs=b.readUInt32LE(pos+38), kind=(attrs>>>16)&0xf000
    if (![0,3,10,19].includes(b[pos+5]!)) reject('ZIP_UNSUPPORTED_FEATURE')
    if ((attrs & 0x448) || (kind!==0 && kind!==(directory?0x4000:0x8000)) || ((attrs&0x10)!==0 && !directory)) reject('ZIP_UNSAFE_TYPE')
    const path=manifestPath(name,directory,seen)
    if (!directory && nestedName.test(path)) reject('ZIP_NESTED_ARCHIVE')
    valid(!directory || (size===0 && crc===0)); valid(method!==0 || size===compressedSize)
    checkExtras(b,pos+46+n,extraEnd)

    const start=local+30+n+b.readUInt16LE(local+28), dataEnd=start+compressedSize
    valid(dataEnd<=central && b.readUInt16LE(local+26)===n && raw.equals(b.subarray(local+30,local+30+n)))
    valid(b.readUInt16LE(local+6)===flags && b.readUInt16LE(local+8)===method && b.readUInt16LE(local+4)===b.readUInt16LE(pos+6))
    checkExtras(b,local+30+n,start)
    const descriptor=(flags&8)!==0
    for (const [off,expected] of [[14,crc],[18,compressedSize],[22,size]] as const) {
      const value=b.readUInt32LE(local+off); valid(value===expected || (descriptor && value===0))
    }
    let recordEnd=dataEnd
    if (descriptor) {
      valid(recordEnd+12<=central)
      if (b.readUInt32LE(recordEnd)===0x08074b50) recordEnd+=4
      valid(recordEnd+12<=central && b.readUInt32LE(recordEnd)===crc && b.readUInt32LE(recordEnd+4)===compressedSize && b.readUInt32LE(recordEnd+8)===size)
      recordEnd+=12
    }
    const ext=/\.([a-z]+)$/i.exec(path)?.[1]?.toLowerCase(), media=(!directory && ext && mediaTypes.get(ext)) || null
    records.push({entry:{ordinal,name,path,size,compressedSize,media,reason:directory?'ZIP_DIRECTORY':media?null:'ZIP_UNSUPPORTED_MEDIA'},
      local,start,end:recordEnd,method,crc}); pos=next
  }
  valid(pos===end)
  // Central order defines public ordinals. In physical order every local byte
  // belongs to exactly one record: no overlap, preamble or unlisted records.
  let tail=0
  for (const r of [...records].sort((a,b)=>a.local-b.local)) { valid(r.local===tail); tail=r.end }
  valid(tail===central)
  return records
}

/** Metadata only; names are display data, never storage keys. Zero-based ordinals. */
export function inspectZip(bytes: Buffer): ZipEntry[] { return parse(bytes).map(r=>r.entry) }

function selectable(records: RecordInfo[], ordinal: number): RecordInfo {
  if (!Number.isSafeInteger(ordinal) || ordinal<0 || ordinal>=records.length) reject('ZIP_INVALID_SELECTION')
  const r=records[ordinal]!
  if (r.entry.reason) reject(r.entry.reason)
  return r
}

function checkContainer(bytes: Buffer, media: string | null) {
  const sig=bytes.length>=4 ? bytes.readUInt32LE(0) : 0
  if ([0x04034b50,0x06054b50,0x08074b50].includes(sig)) {
    if (media===WORD_MEDIA.docx) {
      try { checkWordEnvelope(bytes,WORD_MEDIA.docx); return } catch { /* not an accepted Word container */ }
    }
    reject('ZIP_NESTED_ARCHIVE')
  }
  if (bytes.subarray(0,2).equals(Buffer.from([0x1f,0x8b])) || bytes.subarray(0,6).toString('hex')==='377abcaf271c' ||
      bytes.subarray(0,6).toString('hex')==='fd377a585a00' || bytes.subarray(0,4).toString('hex')==='52617221') reject('ZIP_NESTED_ARCHIVE')
}

async function decode(packed: Buffer, r: RecordInfo, signal?: AbortSignal): Promise<Buffer> {
  active(signal)
  const {size,media}=r.entry
  let output: Buffer
  if (r.method===0) {
    if (crc32(packed)!==r.crc) reject('ZIP_INTEGRITY')
    output=Buffer.from(packed)
  } else {
    // Single bounded result. Never append an output chunk before checking
    // remaining space; fail on short output or unused compressed input too.
    output=Buffer.allocUnsafe(size)
    const stream=createInflateRaw({chunkSize:32*1024}), abort=()=>{stream.destroy()}
    signal?.addEventListener('abort',abort,{once:true})
    try {
      stream.end(packed)
      let written=0, crc=0
      for await (const chunk of stream) {
        active(signal)
        if (chunk.length>size-written) reject('ZIP_INTEGRITY')
        chunk.copy(output,written); written+=chunk.length; crc=crc32(chunk,crc)
      }
      active(signal)
      if (written!==size || stream.bytesWritten!==packed.length || crc!==r.crc) reject('ZIP_INTEGRITY')
    } catch { active(signal); return reject('ZIP_INTEGRITY') }
    finally { signal?.removeEventListener('abort',abort); stream.destroy() }
  }
  checkContainer(output,media)
  return output
}

/** Read only the selected ordinal; revalidate the directory and verify all
 * returned bytes. The returned Buffer never aliases the caller's ZIP. */
export async function readZipMember(bytes: Buffer, ordinal: number, signal?: AbortSignal): Promise<Buffer> {
  active(signal)
  const r=selectable(parse(bytes),ordinal), slice=bytes.subarray(r.start,r.start+r.entry.compressedSize)
  return decode(r.method===0?slice:Buffer.from(slice),r,signal)
}

/** ZIP-layer preflight before publishing any selected child. Bind subsequent
 * reads to the same immutable archive/hash. Each ordinal is decoded once,
 * sequentially, under the aggregate manifest budget; no children are retained.
 * Media validators and publication ACLs remain the importer's responsibility. */
export async function preflightZipSelection(bytes: Buffer, ordinals: readonly number[], signal?: AbortSignal): Promise<void> {
  active(signal)
  const records=parse(bytes)
  if (!Array.isArray(ordinals) || !ordinals.length || ordinals.length>records.length || new Set(ordinals).size!==ordinals.length) reject('ZIP_INVALID_SELECTION')
  const selected=Array.from(ordinals,i=>selectable(records,i)), snapshot=Buffer.from(bytes)
  for (const r of selected) await decode(snapshot.subarray(r.start,r.start+r.entry.compressedSize),r,signal)
}
