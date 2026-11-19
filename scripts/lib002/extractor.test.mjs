import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { openPdf } from '../../packages/knowledgeos-panel/lib/pdf-extractor.js'
import { fixture } from './pdf-fixtures.mjs'

test('compressed page streams, indexed access, local chapters and image-only review', async t => {
  const bytes = fixture({pages: ['front', 'A', null, 'last'], unicode: true, bookmarks: [[2,'Part I'], [4,'Part II']]})
  const padded = Buffer.concat([Buffer.from('ignore'), bytes, Buffer.from('ignore')])
  const doc = await openPdf(padded.subarray(6, 6 + bytes.length))
  t.after(() => doc.close())
  assert.equal(doc.numPages, 4)
  assert.deepEqual(await doc.page(4), {text:'last', needsReview:false, chapter:'Part II'})
  assert.deepEqual(await doc.page(1), {text:'front', needsReview:false, chapter:''})
  assert.deepEqual(await doc.page(2), {text:'\u4e2d', needsReview:false, chapter:'Part I'})
  assert.deepEqual(await doc.page(3), {text:'', needsReview:true, chapter:'Part I'})
  assert.equal((await doc.page(2)).text, '\u4e2d')
  assert.deepEqual(padded.subarray(6, 6 + bytes.length), bytes)
})

test('bad inputs and page numbers reject; close cancels outstanding work and is idempotent', async t => {
  for (const input of [new Uint8Array(), 'file:///tmp/a.pdf', new Uint8Array(64*1024*1024 + 1), Buffer.from('%PDF-1.7\nnot a document')]) {
    await assert.rejects(openPdf(input))
  }
  const doc = await openPdf(fixture())
  t.after(() => doc.close())
  for (const n of [0, 3, 1.5, NaN, '1']) await assert.rejects(doc.page(n), /page number/i)
  const inflight = doc.page(1)
  const busy = assert.rejects(doc.page(2), /busy/i)
  const stopped = assert.rejects(inflight, /closed/i)
  await Promise.all([doc.close(), doc.close(), busy, stopped])
  await assert.rejects(doc.page(1), /closed/i)
})

test('URI actions are inert during extraction', async t => {
  let hits = 0
  const server = createServer((_req, res) => { hits++; res.end() })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const doc = await openPdf(fixture({link:'http://127.0.0.1:' + server.address().port + '/pdf-resource'}))
  try { assert.equal((await doc.page(1)).text, 'first') } finally { await doc.close() }
  assert.equal(hits, 0)
})

test('parent deadline invalidates handle and releases worker', async t => {
  const doc = await openPdf(fixture())
  t.after(() => doc.close())
  t.mock.timers.enable({apis:['setTimeout']})
  const timeout = assert.rejects(doc.page(1), {code:'PDF_HANDLE_CLOSED', message:/deadline/i})
  t.mock.timers.tick(30_000)
  await timeout
  await assert.rejects(doc.page(2), {code:'PDF_HANDLE_CLOSED'})
  await doc.close()
  const reopened = await openPdf(fixture())
  try { assert.equal((await reopened.page(2)).text, 'second') } finally { await reopened.close() }
})

test('page budget rejects without publishing truncated text or poisoning the next page', async t => {
  const doc = await openPdf(fixture({pages:['x'.repeat(32_001), 'caption'], withImage:true}))
  t.after(() => doc.close())
  await assert.rejects(doc.page(1), {code:'PDF_PAGE_FAILED', message:/page text length/i})
  assert.deepEqual(await doc.page(2), {text:'caption', needsReview:true, chapter:''})
})

test('bounded active handles, no wait queue, capacity restored on close', async t => {
  const first = await openPdf(fixture())
  t.after(() => first.close())
  const second = await openPdf(fixture())
  t.after(() => second.close())
  await assert.rejects(openPdf(fixture()), /busy/i)
  await first.close()
  const third = await openPdf(fixture())
  try { assert.equal((await third.page(1)).text, 'first') } finally { await third.close() }
})
