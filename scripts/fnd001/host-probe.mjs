#!/usr/bin/env node
/**
 * Probe the real Host route of the running DSH test profile.
 *
 * Usage:
 *   node scripts/fnd001/host-probe.mjs --base http://127.0.0.1:3099 --token <token> --out runs/<id>/status.json
 *
 * It first requests the browser entry URL, keeps the authenticated cookie, then
 * compares the unauthenticated and authenticated status responses. The cookie
 * is written only beside the evidence file and never printed.
 */
import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

const args = process.argv.slice(2)
function option(name) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

const base = option('base')
const token = option('token')
const out = option('out')
if (base === undefined || token === undefined || out === undefined) {
  console.error('usage: node scripts/fnd001/host-probe.mjs --base <origin> --token <token> --out <file>')
  process.exit(64)
}

const entry = new URL(base)
entry.searchParams.set('token', token)

const entryResponse = await fetch(entry, { redirect: 'manual' })
const setCookie = entryResponse.headers.getSetCookie?.() ?? []
const cookie = setCookie.map(value => value.split(';', 1)[0]).join('; ')
if (cookie.length === 0) {
  console.error(JSON.stringify({ result: 'FAIL', reason: 'entry URL returned no browser cookie', status: entryResponse.status, setCookie }, null, 2))
  process.exit(1)
}

const anonymous = await fetch(new URL('/knowledgeos/status', base), { headers: { accept: 'application/json' }, redirect: 'manual' })
const authenticated = await fetch(new URL('/knowledgeos/status', base), {
  headers: { accept: 'application/json', cookie },
  redirect: 'manual',
})
const body = await authenticated.text()
let payload
try {
  payload = JSON.parse(body)
} catch {
  payload = undefined
}

const evidence = {
  observed_at: new Date().toISOString(),
  base,
  entry_status: entryResponse.status,
  anonymous_status: anonymous.status,
  authenticated_status: authenticated.status,
  authenticated_content_type: authenticated.headers.get('content-type'),
  authenticated_cache_control: authenticated.headers.get('cache-control'),
  payload,
}
await mkdir(dirname(resolve(out)), { recursive: true })
await writeFile(resolve(out), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')

const failures = []
if (anonymous.status !== 401 && anonymous.status !== 403) failures.push(`anonymous request returned ${anonymous.status}, expected 401/403`)
if (authenticated.status !== 200) failures.push(`authenticated request returned ${authenticated.status}`)
if (payload === undefined) failures.push('authenticated body is not JSON')

if (failures.length > 0) {
  console.error(JSON.stringify({ result: 'FAIL', failures, evidence: resolve(out) }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ result: 'PASS', evidence: resolve(out), anonymous_status: anonymous.status, authenticated_status: authenticated.status }, null, 2))
