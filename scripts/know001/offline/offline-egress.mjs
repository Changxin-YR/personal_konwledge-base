import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
const loopback = process.env.KO_TEST_LOOPBACK
assert.match(loopback, /^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/)
const original = globalThis.fetch
globalThis.fetch = async (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input)
  if (url.origin === loopback && !url.username && !url.password)
    return original(input, { ...options, redirect: 'error' })
  appendFileSync(join(process.env.KO_TERMS_CONTROL, 'blocked.jsonl'), '{"event":"external-fetch-denied"}\n')
  throw Error('KNOW001_OFFLINE_EGRESS_DENIED')
}
