#!/usr/bin/env node
/** Quick FND-002 HTTP smoke against the running isolated Host. */
import { entryCookie, request } from './harness.mjs'

const entry = process.argv[2]
if (!entry) {
  console.error('usage: node scripts/fnd002/http-smoke.mjs <entry-url>')
  process.exit(64)
}
const { cookie } = await entryCookie(entry)
const key = crypto.randomUUID()
const create = await request({
  port: 3100,
  method: 'POST',
  path: '/knowledgeos/foundation/records',
  cookie,
  headers: { 'content-type': 'application/json', 'idempotency-key': key },
  body: JSON.stringify({ content: '冒烟记录 "quoted"\n第二行' }),
})
console.log('create', create.status, create.text)
const replay = await request({
  port: 3100,
  method: 'POST',
  path: '/knowledgeos/foundation/records',
  cookie,
  headers: { 'content-type': 'application/json', 'idempotency-key': key },
  body: JSON.stringify({ content: '冒烟记录 "quoted"\n第二行' }),
})
console.log('replay', replay.status, replay.text)
const id = create.json?.data?.id
const read = await request({ port: 3100, path: `/knowledgeos/foundation/records/${id}`, cookie })
console.log('read', read.status, read.text)
const anon = await request({ port: 3100, path: `/knowledgeos/foundation/records/${id}` })
console.log('anonymous', anon.status, anon.text)
const bad = await request({
  port: 3100,
  method: 'POST',
  path: '/knowledgeos/foundation/records',
  cookie,
  headers: { 'content-type': 'application/json', 'idempotency-key': key },
  body: JSON.stringify({ content: 'different' }),
})
console.log('conflict', bad.status, bad.text)