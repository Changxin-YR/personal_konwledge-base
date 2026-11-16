#!/usr/bin/env node
/**
 * FND-002 independent verifier helper — one concurrent POST from its own process.
 *
 * Used twice by `boundary.mjs` to prove cross-process concurrent idempotency
 * (the frozen suite uses two in-process fetches). Configuration is passed via
 * environment so the cookie never appears on a command line.
 *
 * Env: KOS_PORT, KOS_COOKIE, KOS_KEY, KOS_CONTENT
 */
const port = process.env.KOS_PORT
const cookie = process.env.KOS_COOKIE
const key = process.env.KOS_KEY
const content = process.env.KOS_CONTENT

const response = await fetch(`http://127.0.0.1:${port}/knowledgeos/foundation/records`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': key, cookie },
  body: JSON.stringify({ content }),
})
const text = await response.text()
let json
try { json = JSON.parse(text) } catch { json = undefined }
process.stdout.write(`${JSON.stringify({
  pid: process.pid,
  status: response.status,
  id: json?.data?.id,
  created_at: json?.data?.created_at,
  code: json?.code,
})}\n`)
