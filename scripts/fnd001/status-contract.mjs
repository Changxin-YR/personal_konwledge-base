#!/usr/bin/env node
/**
 * Validate the FND-001 `/knowledgeos/status` wire contract.
 *
 * Usage:
 *   node scripts/fnd001/status-contract.mjs --mode same-instance a.json b.json
 *   node scripts/fnd001/status-contract.mjs --mode restart a.json b.json
 *
 * Exits 0 only when every assertion passes. The same-instance mode requires a
 * stable instance/start time and a strictly newer second query; the restart
 * mode requires a new instance id and a later start time.
 */
import { readFile } from 'node:fs/promises'

const FIELDS = [
  'schema_version', 'product', 'upstream_commit', 'upstream_version',
  'expected_upstream_commit', 'upstream_commit_verified',
  'host_instance_id', 'started_at', 'checked_at', 'status',
]

const EXPECTED_COMMIT = '39163dd30f703a79079e2d2446545cff3c453738'
const failures = []

function fail(message) {
  failures.push(message)
}

function parseTime(field, value) {
  const time = Date.parse(value)
  if (Number.isNaN(time)) fail(`${field} is not a parseable timestamp: ${JSON.stringify(value)}`)
  return time
}

function validate(payload, name) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    fail(`${name}: not a JSON object`)
    return
  }
  const keys = Object.keys(payload).sort()
  const expected = [...FIELDS].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail(`${name}: field set ${JSON.stringify(keys)} != ${JSON.stringify(expected)}`)
  }
  if (payload.schema_version !== 1) fail(`${name}: schema_version must be 1`)
  if (payload.product !== 'KnowledgeOS') fail(`${name}: product must be KnowledgeOS`)
  if (payload.expected_upstream_commit !== EXPECTED_COMMIT) fail(`${name}: expected_upstream_commit mismatch`)
  if (payload.upstream_commit !== EXPECTED_COMMIT) fail(`${name}: upstream_commit ${JSON.stringify(payload.upstream_commit)} != pinned commit`)
  if (payload.upstream_version !== '0.2.2-rc.3') fail(`${name}: upstream_version ${JSON.stringify(payload.upstream_version)} != 0.2.2-rc.3`)
  if (payload.upstream_commit_verified !== true) fail(`${name}: upstream_commit_verified must be true`)
  if (payload.status !== 'ok') fail(`${name}: status must be ok`)
  if (typeof payload.host_instance_id !== 'string' || payload.host_instance_id.length < 8) {
    fail(`${name}: host_instance_id is missing or too short`)
  }
  if (/\s|[/\\]/.test(payload.host_instance_id ?? '')) fail(`${name}: host_instance_id contains whitespace or a path separator`)
  const started = parseTime(`${name}.started_at`, payload.started_at)
  const checked = parseTime(`${name}.checked_at`, payload.checked_at)
  if (!Number.isNaN(started) && !Number.isNaN(checked) && checked < started) {
    fail(`${name}: checked_at is earlier than started_at`)
  }
  const serialized = JSON.stringify(payload)
  for (const forbidden of ['token', 'cookie', 'secret', 'password', 'authorization', 'process.env', 'C:\\', '/home/']) {
    if (serialized.toLowerCase().includes(forbidden.toLowerCase())) {
      fail(`${name}: response contains forbidden text ${JSON.stringify(forbidden)}`)
    }
  }
  return { started, checked }
}

const args = process.argv.slice(2)
const modeIndex = args.indexOf('--mode')
const mode = modeIndex >= 0 ? args[modeIndex + 1] : undefined
const files = args.filter((arg, index) => index !== modeIndex && index !== modeIndex + 1)
if (mode !== 'same-instance' && mode !== 'restart') {
  console.error('usage: node scripts/fnd001/status-contract.mjs --mode same-instance|restart <first.json> <second.json>')
  process.exit(64)
}
if (files.length !== 2) {
  console.error('expected exactly two JSON files')
  process.exit(64)
}

const [first, second] = await Promise.all(files.map(async file => JSON.parse(await readFile(file, 'utf8'))))
const firstTimes = validate(first, files[0])
const secondTimes = validate(second, files[1])

if (mode === 'same-instance') {
  if (first.host_instance_id !== second.host_instance_id) fail('same-instance: host_instance_id changed')
  if (first.started_at !== second.started_at) fail('same-instance: started_at changed')
  if (!(secondTimes.checked > firstTimes.checked)) fail('same-instance: checked_at did not advance')
} else {
  if (first.host_instance_id === second.host_instance_id) fail('restart: host_instance_id did not change')
  if (!(secondTimes.started > firstTimes.started)) fail('restart: started_at did not advance')
  if (!(secondTimes.checked >= secondTimes.started)) fail('restart: checked_at is earlier than started_at')
}

if (failures.length > 0) {
  console.error(JSON.stringify({ result: 'FAIL', mode, failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({
  result: 'PASS',
  mode,
  files,
  host_instance_id: second.host_instance_id,
  upstream_commit: second.upstream_commit,
  upstream_version: second.upstream_version,
  checked_at_first: first.checked_at,
  checked_at_second: second.checked_at,
}, null, 2))
