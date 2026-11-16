#!/usr/bin/env node
/**
 * Independent observation tool (not product code, not part of the candidate).
 * Scan one wire response for forbidden credential/environment/path/session text
 * as required by the FND-001 test plan section 4.4.
 */
import { readFile } from 'node:fs/promises'

const file = process.argv[2]
if (file === undefined) {
  console.error('usage: node forbidden-scan.mjs <response.json>')
  process.exit(64)
}
const raw = await readFile(file, 'utf8')
const payload = JSON.parse(raw)
const checks = []
const fail = (id, detail) => checks.push({ id, pass: false, detail })
const pass = id => checks.push({ id, pass: true })

const FIELDS = [
  'schema_version', 'product', 'upstream_commit', 'upstream_version',
  'expected_upstream_commit', 'upstream_commit_verified', 'host_instance_id',
  'started_at', 'checked_at', 'status',
]
const keys = Object.keys(payload)
if (keys.length === 10 && FIELDS.every(field => keys.includes(field))) pass('exactly 10 documented fields')
else fail('exactly 10 documented fields', keys.join(','))

const RULES = [
  ['credential words', /(token|cookie|secret|password|passwd|api[_-]?key|authorization|bearer|credential)/i],
  ['environment names', /(DSH_HOME|USERPROFILE|APPDATA|PATH=|NODE_OPTIONS)/],
  ['absolute paths', /[A-Za-z]:\\|\/(Users|home|root)\//],
  ['session content', /(session[_-]?id|messageId|conversationId|prompt|completion|transcript)/i],
  ['stack/internal', /(Traceback|node_modules|at\s+\S+\.(ts|js):\d+|<html)/i],
]
for (const [id, rule] of RULES) {
  const match = rule.exec(raw)
  if (match === null) pass(`no ${id}`)
  else fail(`no ${id}`, match[0])
}

const longOpaque = [...raw.matchAll(/"([^"]{65,})"/g)].filter(([, value]) => value !== payload.upstream_commit)
if (longOpaque.length === 0) pass('no unexplained long opaque strings')
else fail('no unexplained long opaque strings', longOpaque.map(([, v]) => `${v.length} chars`).join(','))

const types = {
  schema_version: typeof payload.schema_version === 'number' && payload.schema_version === 1,
  product: payload.product === 'KnowledgeOS',
  upstream_commit: payload.upstream_commit === '39163dd30f703a79079e2d2446545cff3c453738',
  expected_upstream_commit: payload.expected_upstream_commit === '39163dd30f703a79079e2d2446545cff3c453738',
  upstream_version: payload.upstream_version === '0.2.2-rc.3',
  upstream_commit_verified: payload.upstream_commit_verified === true,
  host_instance_id: typeof payload.host_instance_id === 'string' && payload.host_instance_id.length >= 8 && payload.host_instance_id.length <= 128 && !/\s|[/\\]/.test(payload.host_instance_id) && payload.host_instance_id !== 'unknown',
  started_at: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(payload.started_at) && !Number.isNaN(Date.parse(payload.started_at)),
  checked_at: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(payload.checked_at) && !Number.isNaN(Date.parse(payload.checked_at)),
  checked_not_before_started: Date.parse(payload.checked_at) >= Date.parse(payload.started_at),
  status: payload.status === 'ok',
}
for (const [id, ok] of Object.entries(types)) {
  if (ok) pass(`type/semantic ${id}`)
  else fail(`type/semantic ${id}`, JSON.stringify(payload[id]))
}

const result = { file, result: checks.every(c => c.pass) ? 'PASS' : 'FAIL', checks }
console.log(JSON.stringify(result, null, 2))
process.exit(result.result === 'PASS' ? 0 : 1)