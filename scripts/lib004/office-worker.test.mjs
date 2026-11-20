// Adapter behavior only: synthetic OfficeKit responses, in-memory lease/blob stores, real PDFium.
import assert from 'node:assert/strict'
import {createHash, randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import test from 'node:test'
import {fixture} from '../lib002/pdf-fixtures.mjs'
import {AssetError} from '../../packages/knowledgeos-panel/src/host/asset-store.ts'
import {startOfficeWorker} from '../../packages/knowledgeos-panel/src/host/office-worker.ts'
import {openPdf} from '../../packages/knowledgeos-panel/lib/pdf-extractor.js'

const sha = b => createHash('sha256').update(b).digest('hex')
const input = Buffer.from('synthetic fixture; not a Word document')
const imagePdf = fixture({pages:[null, null]})
const result = (pdf = imagePdf) => ({pdf, missingFonts:['Fixture Sans'], cacheKey:'fixture-key', generation:'fixture-generation'})
async function until(condition, label, ms = 10_000) {
  const end = Date.now() + ms
  while (!condition()) {
    assert.ok(Date.now() < end, `timed out: ${label}`)
    await delay(15)
  }
}

function setup(t, extension = 'docx') {
  const token = randomUUID(), ref = {assetId:randomUUID(), versionId:randomUUID(), key:`${randomUUID()}.${extension}`,
    sha256:sha(input), byteLength:input.length, extension}
  const x = {valid:true, claims:0, reads:[], requests:[], stages:[], retained:[], discarded:[], completed:[], failures:[], log:[]}
  const store = {
    claim() { if (++x.claims === 1) return {token} },
    source(id) { if (x.valid && id === token) return {...ref} },
    renew(id) { return x.valid && id === token },
    complete(...args) { x.completed.push(args); return x.valid && args[0] === token },
    fail(...args) { x.failures.push(args) },
  }
  const originals = {
    async read(...args) { x.reads.push(args); return Buffer.from(input) },
    async put(bytes) {
      const blob = {key:`${randomUUID()}.pdf`, sha256:sha(bytes), byteLength:bytes.length}
      x.stages.push(blob); return blob
    },
    retain(key) { x.retained.push(key) }, async discard(key) { x.discarded.push(key) },
  }
  const kit = {async convert(req, signal) {
    x.requests.push(req); x.readResult = await req.source.read(signal, req.source.bytes); return result()
  }}
  const start = (open = openPdf) => {
    const stop = startOfficeWorker(store, originals, kit, open, msg => x.log.push(msg))
    let done
    const unload = () => done ??= stop()
    t.after(unload); return unload
  }
  // The worker has finished the only job when it asks the store for another.
  const idle = () => until(() => x.claims >= 2, 'worker to finish job and poll again')
  return {x, ref, token, store, originals, kit, start, idle}
}

for (const extension of ['doc', 'docx']) test(`fixture ${extension}: validate image-only PDF and publish owned bytes`, async t => {
  const {x, ref, token, start, idle} = setup(t, extension)
  start(); await idle()
  assert.equal(x.requests.length,1)
  const req = x.requests[0]
  assert.equal(req.extension, extension); assert.ok(['foreground','background'].includes(req.priority))
  assert.ok(req.source.key.includes(ref.versionId)); assert.ok(req.source.key !== ref.versionId)
  assert.equal(req.source.bytes, input.length); assert.equal(typeof req.source.version,'string'); assert.ok(req.source.version)
  assert.equal(x.readResult.version,req.source.version); assert.deepEqual(Buffer.from(x.readResult.bytes), input)
  assert.deepEqual(x.reads, [[ref.key, ref.sha256, ref.byteLength]])
  assert.equal(x.stages.length,1); const [blob] = x.stages
  assert.equal(blob.sha256,sha(imagePdf)); assert.equal(blob.byteLength,imagePdf.length)
  assert.deepEqual(x.completed, [[token, blob, 2, ['Fixture Sans']]])
  assert.deepEqual(x.retained,[blob.key]); assert.deepEqual(x.discarded,[]); assert.deepEqual(x.failures,[])
})

test('reject denied token before even a cached kit response', async t => {
  const {x, kit, start, idle} = setup(t)
  let calls = 0; x.valid = false; kit.convert = async () => { calls++; return result() }
  start(); await idle()
  assert.equal(calls,0); assert.deepEqual(x.reads,[]); assert.deepEqual(x.completed,[])
})

test('cache hit with authority lost before return never stages or publishes bytes', async t => {
  const {x, kit, start, idle} = setup(t)
  let hit = false; kit.convert = async () => { hit = true; x.valid = false; return result() }
  start(); await idle()
  assert.equal(hit,true); assert.deepEqual(x.reads,[]); assert.deepEqual(x.stages,[]); assert.deepEqual(x.completed,[])
})

for (const mode of ['short reservation', 'denied before read', 'denied during read', 'changed version during read']) {
  test(`deferred source read: ${mode}`, async t => {
    const {x, ref, originals, kit, start, idle} = setup(t)
    const during = mode.includes('during'), read = originals.read
    originals.read = async (...args) => {
      const bytes = await read(...args)
      if (mode === 'denied during read') x.valid = false
      if (mode === 'changed version during read') ref.versionId = randomUUID()
      return bytes
    }
    let rejected = false
    kit.convert = async (req, signal) => {
      if (mode === 'denied before read') x.valid = false
      try { await req.source.read(signal, input.length - Number(mode === 'short reservation')) }
      catch (e) { rejected = true; throw e }
      return result()
    }
    start(); await idle()
    assert.equal(rejected,true); assert.equal(x.reads.length,Number(during)); assert.deepEqual(x.completed,[]); assert.deepEqual(x.stages,[])
  })
}

for (const [name, bytes] of [['empty',()=>Buffer.alloc(0)], ['unreadable',()=>Buffer.from('%PDF-1.7\nnot a document\n%%EOF')],
  ['over originals cap',()=>new Uint8Array(64*1024*1024+1)]]) {
  test(`invalid converter output: ${name}`, async t => {
    const {x, token, kit, start, idle} = setup(t)
    kit.convert = async () => result(bytes()); start(); await idle()
    assert.deepEqual(x.stages,[]); assert.deepEqual(x.completed,[])
    assert.equal(x.failures.length,1); assert.equal(x.failures[0][0],token); assert.ok(x.failures[0][1])
  })
}

test('real PDFium opens both pages but rejects page two above its text budget; no partial publication', async t => {
  const bytes = fixture({pages:['valid first page', 'x'.repeat(32_001)]})
  const doc = await openPdf(bytes)
  try {
    assert.equal(doc.numPages,2); assert.equal((await doc.page(1)).text,'valid first page')
    await assert.rejects(doc.page(2),{code:'PDF_PAGE_FAILED'})
  } finally { await doc.close() }
  const {x, kit, start, idle} = setup(t)
  kit.convert = async () => result(bytes); start(); await idle()
  assert.equal(x.failures.length,1); assert.deepEqual(x.stages,[]); assert.deepEqual(x.completed,[])
})

for (const outcome of ['invalid after staging', 'publication refused', 'known transaction rejection', 'commit outcome unknown']) {
  test(`staged output ownership: ${outcome}`, async t => {
    const {x, originals, store, start, idle} = setup(t)
    const put = originals.put
    originals.put = async bytes => {const blob = await put(bytes); if (outcome === 'invalid after staging') x.valid = false; return blob}
    store.complete = (...args) => {
      x.completed.push(args)
      if (outcome === 'known transaction rejection') throw new AssetError(422,'INVALID_OFFICE_RESULT')
      if (outcome === 'commit outcome unknown') throw Error('lost commit acknowledgement')
      return false
    }
    start(); await idle()
    assert.equal(x.stages.length,1); const key = x.stages[0].key, unknown = outcome === 'commit outcome unknown'
    assert.equal(x.completed.length, Number(outcome !== 'invalid after staging'))
    assert.deepEqual(x.discarded, unknown ? [] : [key]); assert.deepEqual(x.retained, unknown ? [key] : [])
  })
}

for (const reason of ['lease lost','unload']) test(`in-flight conversion aborts on ${reason}; no publication or terminal failure`, async t => {
  const {x, kit, start, idle} = setup(t)
  let signal; const release = Promise.withResolvers()
  kit.convert = async (_, s) => {
    signal = s
    return Promise.race([release.promise, new Promise((_, no) => {
      if (s.aborted) no(s.reason); else s.addEventListener('abort',()=>no(s.reason),{once:true})
    })])
  }
  const unload = start()
  try {
    await until(()=>signal,'converter admission'); x.valid = reason !== 'lease lost'
    const stopping = reason === 'unload' ? unload() : undefined
    await until(()=>signal.aborted,'abort before 15s lease expiry',12_000)
    if (stopping) await stopping; else await idle()
    assert.deepEqual(x.stages,[]); assert.deepEqual(x.completed,[]); assert.deepEqual(x.failures,[])
  } finally { release.resolve(result()); await unload() }
})
