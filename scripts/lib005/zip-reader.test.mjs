import assert from 'node:assert/strict'
import test from 'node:test'
import { crc32, deflateRawSync } from 'node:zlib'
import { inspectZip, readZipMember, preflightZipSelection, ZipInputError, ZIP_LIMITS } from '../../packages/knowledgeos-panel/src/host/zip-reader.ts'
import { acceptanceSamples } from '../lib004/acceptance-samples.mjs'

// Small, in-memory classic ZIP writer. Central ordering and streamed headers
// are ordinary variations; no extraction paths or external tools are used.
function zip(files, { reverse = false } = {}) {
  const locals = [], directory = []
  let offset = 0
  for (const { name, data = '', deflate = false, descriptor, attrs = 0 } of files) {
    const filename = Buffer.from(name), content = Buffer.from(data), crc = crc32(content)
    const compressed = deflate ? deflateRawSync(content) : content
    const header = Buffer.alloc(30), central = Buffer.alloc(46)
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4)
    header.writeUInt16LE(0x800 | (descriptor ? 8 : 0),6); header.writeUInt16LE(deflate ? 8 : 0,8)
    header.writeUInt16LE(33,12); header.writeUInt16LE(filename.length,26)
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x314,4); header.copy(central,6,4)
    central.writeUInt32LE(crc,16); central.writeUInt32LE(compressed.length,20); central.writeUInt32LE(content.length,24)
    central.writeUInt32LE(attrs,38); central.writeUInt32LE(offset,42)
    if (!descriptor) central.copy(header,14,16,28)
    const parts = [header,filename,compressed]
    if (descriptor) {
      const desc = Buffer.alloc(descriptor === 'signed' ? 16 : 12)
      if (desc.length===16) desc.writeUInt32LE(0x08074b50)
      central.copy(desc,desc.length-12,16,28); parts.push(desc)
    }
    const local = Buffer.concat(parts); locals.push(local); offset += local.length
    directory.push(Buffer.concat([central,filename]))
  }
  const listing = Buffer.concat(reverse ? directory.reverse() : directory), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10)
  end.writeUInt32LE(listing.length,12); end.writeUInt32LE(offset,16)
  return Buffer.concat([...locals,listing,end])
}
const error = code => e => e instanceof ZipInputError && e.code === code

test('manifest follows central order, preserves original name, and returns independent selected bytes', async () => {
  const name = 'docs/cafe\u0301.md', data = Buffer.from('# notes\n')
  const bytes = zip([{name:'docs/',attrs:0x41ed0010},{name,data,deflate:true,descriptor:'signed'},
    {name:'plain.txt',data:'text'},{name:'image.png',data:'not selected'}], {reverse:true})
  const manifest = inspectZip(bytes)
  assert.deepEqual(manifest, [
    {ordinal:0,name:'image.png',path:'image.png',size:12,compressedSize:12,media:null,reason:'ZIP_UNSUPPORTED_MEDIA'},
    {ordinal:1,name:'plain.txt',path:'plain.txt',size:4,compressedSize:4,media:'text/plain',reason:null},
    {ordinal:2,name,path:'docs/caf\u00e9.md',size:data.length,compressedSize:deflateRawSync(data).length,media:'text/markdown',reason:null},
    {ordinal:3,name:'docs/',path:'docs',size:0,compressedSize:0,media:null,reason:'ZIP_DIRECTORY'}])
  await preflightZipSelection(bytes,[2,1]); assert.deepEqual(await readZipMember(bytes,2),data)
  const out = await readZipMember(bytes,1); out.fill(0); assert.equal((await readZipMember(bytes,1)).toString(),'text')
  await assert.rejects(readZipMember(bytes,0),error('ZIP_UNSUPPORTED_MEDIA'))
  await assert.rejects(readZipMember(bytes,3),error('ZIP_DIRECTORY'))
})

test('PDF and DOCX originals survive byte-for-byte; embedded Word package is not a nested import', async () => {
  const originals=acceptanceSamples(), pdf=originals['a08-reference.pdf'], docx=originals['a08-v1.docx']
  const bytes=zip([{name:'reference.PDF',data:pdf},{name:'review.DOCX',data:docx,deflate:true,descriptor:'unsigned'}])
  assert.deepEqual(inspectZip(bytes).map(e=>e.media),['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
  await preflightZipSelection(bytes,[0,1]); assert.deepEqual(await readZipMember(bytes,0),pdf); assert.deepEqual(await readZipMember(bytes,1),docx)
  assert.equal(ZIP_LIMITS.archiveDepth,0)
  assert.throws(()=>inspectZip(zip([{name:'notes.zip',data:zip([])}])),error('ZIP_NESTED_ARCHIVE'))
})

test('empty archive, empty files and data descriptors', async () => {
  assert.deepEqual(inspectZip(zip([])),[])
  const bytes=zip([{name:'empty.txt'},{name:'empty.md',deflate:true,descriptor:'unsigned'}])
  for (const i of [0,1]) assert.deepEqual(await readZipMember(bytes,i),Buffer.alloc(0))
  await preflightZipSelection(bytes,[1,0])
  for (const i of [-1,2,0.5]) await assert.rejects(readZipMember(bytes,i),error('ZIP_INVALID_SELECTION'))
  for (const ids of [[],[0,0],[2],new Array(1)]) await assert.rejects(preflightZipSelection(bytes,ids),error('ZIP_INVALID_SELECTION'))
})

test('archive admission enforces the input byte cap and requires stable memory', () => {
  assert.throws(()=>inspectZip(Buffer.alloc(ZIP_LIMITS.archiveBytes+1)),error('ZIP_LIMIT_EXCEEDED'))
  const bytes=zip([]), shared=Buffer.from(new SharedArrayBuffer(bytes.length)); bytes.copy(shared)
  assert.throws(()=>inspectZip(shared),error('ZIP_UNSUPPORTED_FEATURE'))
})

test('declared policy limits accept exact entry/path limits and decline one extra', () => {
  const names=Array.from({length:ZIP_LIMITS.entries},(_,i)=>({name:`note-${i}.txt`}))
  assert.equal(inspectZip(zip(names)).length,names.length)
  assert.throws(()=>inspectZip(zip([...names,{name:'extra.txt'}])),error('ZIP_LIMIT_EXCEEDED'))
  const name='a/'.repeat(ZIP_LIMITS.pathDepth-1)+'n.txt'; assert.equal(inspectZip(zip([{name}]))[0].path,name)
  assert.throws(()=>inspectZip(zip([{name:'b/'+name}])),error('ZIP_LIMIT_EXCEEDED'))
  const component='a'.repeat(251)+'.txt'; assert.equal(inspectZip(zip([{name:component}]))[0].name,component)
  assert.throws(()=>inspectZip(zip([{name:'x'+component}])),error('ZIP_LIMIT_EXCEEDED'))
})

test('nonportable names and ambiguous file/directory mappings are not selectable', () => {
  for (const name of ['report?.txt','notes.','NUL.txt']) assert.throws(()=>inspectZip(zip([{name}])),error('ZIP_UNSAFE_PATH'))
  for (const names of [['a.txt','A.TXT'],['cafe\u0301.md','caf\u00e9.md'],['folder','folder/notes.md'],['a/one.txt','A/two.txt']]) {
    assert.throws(()=>inspectZip(zip(names.map(name=>({name})))),error('ZIP_PATH_ALIAS'))
  }
  // Metadata-only: a directory mode is inconsistent with a regular file name.
  assert.throws(()=>inspectZip(zip([{name:'entry.txt',attrs:0x41ed0000}])),error('ZIP_UNSAFE_TYPE'))
})

test('a truncated upload is malformed; a damaged selected original fails CRC before publication', async () => {
  const bytes=zip([{name:'first.txt',data:'ordinary first note'},{name:'second.txt',data:'ordinary second note'}])
  assert.throws(()=>inspectZip(bytes.subarray(0,bytes.length-1)),error('ZIP_MALFORMED'))
  const pos=bytes.indexOf('ordinary second note'); assert.notEqual(pos,-1); bytes[pos]=0x4f
  assert.equal(inspectZip(bytes).length,2); await preflightZipSelection(bytes,[0])
  await assert.rejects(preflightZipSelection(bytes,[0,1]),error('ZIP_INTEGRITY'))
  await assert.rejects(readZipMember(bytes,1),error('ZIP_INTEGRITY'))
})

test('in-flight cancellation stops a selected read; a later retry still succeeds', async () => {
  const body=Buffer.from('ordinary line\n'.repeat(10000)), bytes=zip([{name:'journal.txt',data:body,deflate:true}])
  const controller=new AbortController(), pending=readZipMember(bytes,0,controller.signal); controller.abort()
  await assert.rejects(pending,error('ZIP_CANCELLED'))
  await assert.rejects(preflightZipSelection(bytes,[0],controller.signal),error('ZIP_CANCELLED'))
  assert.deepEqual(await readZipMember(bytes,0),body)
})
