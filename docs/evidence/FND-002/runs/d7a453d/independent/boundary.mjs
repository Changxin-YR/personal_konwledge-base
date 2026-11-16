#!/usr/bin/env node
/**
 * FND-002 independent verifier — live Host boundary / lifecycle checks.
 *
 * Written by the independent test/acceptance role (not the implementer).
 * Starts only the isolated fixed-source Host on port 3100 with the isolated
 * DSH_HOME and profile, then drives real HTTP with plain fetch and inspects the
 * real SQLite file with a separate read-only connection. Restores the profile
 * overlay at the end and never touches the desktop DSH instances.
 *
 * Usage:
 *   node docs/evidence/FND-002/runs/d7a453d/independent/boundary.mjs
 */
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('../../../../../..', import.meta.url)))
const RUN = join(REPO, 'docs', 'evidence', 'FND-002', 'runs', 'd7a453d')
const INDEP = join(RUN, 'independent')
const DSH_ROOT = join(REPO, '.cache', 'build', 'dsh-39163dd')
const HOME = join(REPO, '.cache', 'dsh-home-fnd002')
const OLD_HOME = join(REPO, '.cache', 'dsh-home-fnd001')
const PROFILE = 'knowledgeos-storage-test'
const PATCH = join(HOME, 'profiles', PROFILE, 'cordis.patch.yml')
const UPSTREAM = '39163dd30f703a79079e2d2446545cff3c453738'
const PORT = 3100
const BASE = `http://127.0.0.1:${PORT}`
const DATA = join(REPO, '.cache', 'knowledgeos-fnd002-data', 'indep-boundary')

const checks = []
const transcript = []
let failures = 0
function check(name, ok, actual) {
  checks.push({ name, ok: Boolean(ok), actual })
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${actual === undefined ? '' : ` :: ${JSON.stringify(actual)}`}`)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
mkdirSync(INDEP, { recursive: true })
const originalPatch = existsSync(PATCH) ? readFileSync(PATCH, 'utf8') : '[]\n'
writeFileSync(join(INDEP, 'profile-patch.original.yml'), originalPatch, 'utf8')

function redact(text) {
  return text
    .replace(/token=[A-Za-z0-9_\-]+/g, 'token=<redacted>')
    .replace(/dsh-auth=[^;'"\s]+/g, 'dsh-auth=<redacted>')
}

function patchText(dataDir, disabled = false) {
  return `# FND-002 independent verifier overlay (restored afterwards).\n`
    + `- id: knowledgeos-host\n`
    + `  config:\n`
    + `    dataDir: "${dataDir.replace(/\\/g, '/')}"\n`
    + (disabled ? '  disabled: true\n' : '')
}
function setPatch(dataDir, disabled = false) { writeFileSync(PATCH, patchText(dataDir, disabled), 'utf8') }

let child = null
let exited = null
let output = ''
const hostLogs = {}

async function startHost({ home = HOME, profile = PROFILE, label }) {
  output = ''
  child = spawn(process.execPath, [
    '--import', 'tsx/esm', 'apps/cli/src/bin.ts',
    '--profile', profile,
    '--port', String(PORT),
    '--no-open',
  ], {
    cwd: DSH_ROOT,
    env: { ...process.env, DSH_HOME: home, DSH_CLIENT_COMMIT_HASH: UPSTREAM },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  exited = new Promise(r => child.once('exit', r))
  const onData = chunk => { output += chunk.toString() }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const match = /dsh web:\s*(http:\/\/\S+)/.exec(output)
    if (match !== null) {
      const response = await fetch(match[1], { redirect: 'manual' })
      const cookies = (response.headers.getSetCookie?.() ?? []).map(v => v.split(';', 1)[0])
      return { entryUrl: match[1], cookie: cookies.join('; ') }
    }
    if (child.exitCode !== null) throw new Error(`host exited early ${child.exitCode}: ${output.slice(-3000)}`)
    await sleep(250)
  }
  throw new Error(`host did not start: ${output.slice(-3000)}`)
}

async function stopHost(label) {
  if (child === null) return
  if (child.exitCode === null) child.kill()
  await Promise.race([exited, sleep(15_000)])
  child = null
  if (label !== undefined) hostLogs[label] = output
  await sleep(900)
}

async function http(path, { method = 'GET', cookie, headers = {}, body, duplex } = {}) {
  const h = { ...headers }
  if (cookie !== undefined) h.cookie = cookie
  const init = { method, headers: h, body, redirect: 'manual' }
  if (duplex !== undefined) init.duplex = duplex
  const response = await fetch(new URL(path, BASE), init)
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: response.status, headers: response.headers, text, json }
}

const createHeaders = (key, extra = {}) => ({ 'content-type': 'application/json', 'idempotency-key': key, ...extra })
const key = () => crypto.randomUUID()

function roRows(dataDir) {
  const db = new DatabaseSync(join(dataDir, 'knowledgeos.sqlite'), { readOnly: true })
  try { return db.prepare('SELECT id, content, created_at, idempotency_key FROM storage_probe_records').all() } finally { db.close() }
}

try {
  // ------------------------------------ phase 1: configured profile auth/source/input boundaries
  rmSync(DATA, { recursive: true, force: true })
  mkdirSync(DATA, { recursive: true })
  setPatch(DATA)
  const { cookie } = await startHost({ label: 'phase1' })
  const cookieNames = cookie.split(';').map(part => part.trim().split('=', 1)[0]).filter(Boolean)
  check('live: entry cookie issued by the isolated Host', cookie.length > 0 && cookieNames.some(name => name.startsWith('dsh-auth')), cookieNames.map(name => `${name.slice(0, 8)}…`))

  const created = await http('/knowledgeos/foundation/records', {
    method: 'POST', cookie, headers: createHeaders(key()), body: JSON.stringify({ content: '独立验收 中文 "q" \'s\'\n第二行' }),
  })
  check('live: authenticated create is 201', created.status === 201, created.status)
  check('live: success body shape', created.json?.data?.id !== undefined && created.json?.meta?.schema_version === 1 && typeof created.json?.meta?.request_id === 'string', created.json?.meta)
  const id = created.json?.data?.id

  const storedRows = roRows(DATA)
  check('live: independent read-only SQLite sees the HTTP-created row', storedRows.length === 1 && storedRows[0].id === id && storedRows[0].content === created.json?.data?.content, storedRows)
  check('live: created_at is server UTC ISO 8601', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(created.json?.data?.created_at ?? ''), created.json?.data?.created_at)
  transcript.push({ step: 'authenticated-create', status: created.status, body: created.json })

  const anonGet = await http(`/knowledgeos/foundation/records/${id}`)
  const anonPost = await http('/knowledgeos/foundation/records', { method: 'POST', headers: createHeaders(key()), body: JSON.stringify({ content: 'anon' }) })
  const badCookie = await http('/knowledgeos/foundation/records', { method: 'POST', cookie: 'dsh-auth=invalid', headers: createHeaders(key()), body: JSON.stringify({ content: 'bad' }) })
  check('live: anonymous GET is 401', anonGet.status === 401, anonGet.status)
  check('live: anonymous POST is 401', anonPost.status === 401, anonPost.status)
  check('live: bad cookie POST is 401', badCookie.status === 401, badCookie.status)

  for (const [name, headers] of [['foreign-origin', { origin: 'https://evil.example' }], ['null-origin', { origin: 'null' }], ['cross-site', { 'sec-fetch-site': 'cross-site' }]]) {
    const response = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(key(), headers), body: JSON.stringify({ content: name }) })
    check(`live: valid cookie + ${name} is 403`, response.status === 403, response.status)
  }
  check('live: rejected sources wrote nothing', roRows(DATA).length === 1, roRows(DATA).length)

  const cli = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(key()), body: JSON.stringify({ content: 'cli-no-origin' }) })
  check('live: trusted CLI without Origin writes 201', cli.status === 201, cli.status)
  check('live: DB has exactly the two accepted rows', roRows(DATA).length === 2, roRows(DATA).length)

  const replayKey = key()
  const first = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(replayKey), body: JSON.stringify({ content: 'replay-me' }) })
  const replay = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(replayKey), body: JSON.stringify({ content: 'replay-me' }) })
  const conflict = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(replayKey), body: JSON.stringify({ content: 'different' }) })
  check('live: first create 201 / replay 200 same id+created_at', first.status === 201 && replay.status === 200 && replay.json?.data?.id === first.json?.data?.id && replay.json?.data?.created_at === first.json?.data?.created_at, [first.status, replay.status])
  check('live: same key different content is 409 IDEMPOTENCY_CONFLICT', conflict.status === 409 && conflict.json?.code === 'IDEMPOTENCY_CONFLICT' && conflict.json?.retryable === false, conflict.json)
  check('live: conflict did not overwrite the original', roRows(DATA).find(r => r.id === first.json?.data?.id)?.content === 'replay-me', true)

  const cKey = key()
  const [a, b] = await Promise.all([
    http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(cKey), body: JSON.stringify({ content: 'concurrent' }) }),
    http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(cKey), body: JSON.stringify({ content: 'concurrent' }) }),
  ])
  const statuses = [a.status, b.status].sort()
  const concurrentRows = roRows(DATA).filter(r => r.idempotency_key === cKey)
  check('live: concurrent same-key is 200+201', statuses.join(',') === '200,201', statuses)
  check('live: concurrent same-key persisted exactly one row', concurrentRows.length === 1, concurrentRows.length)

  const notFound = await http(`/knowledgeos/foundation/records/${key()}`, { cookie })
  const invalidJson = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(key()), body: '{' })
  check('live: unknown id is 404 NOT_FOUND', notFound.status === 404 && notFound.json?.code === 'NOT_FOUND', notFound.json)
  check('live: invalid JSON is 400 INVALID_JSON', invalidJson.status === 400 && invalidJson.json?.code === 'INVALID_JSON', invalidJson.json)
  for (const [name, response] of [['404', notFound], ['400', invalidJson]]) {
    const leaked = ['C:\\', 'SELECT', 'storage_probe_records', 'node:sqlite', '    at '].filter(token => response.text.includes(token))
    check(`live: ${name} error body leaks no path/SQL/stack`, leaked.length === 0, leaked)
  }

  const sqlText = `'"; DROP TABLE storage_probe_records; --\n"quoted" 中文`
  const sqlSaved = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(key()), body: JSON.stringify({ content: sqlText }) })
  const db = new DatabaseSync(join(DATA, 'knowledgeos.sqlite'), { readOnly: true })
  let tables, sqlStored
  try {
    tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name)
    sqlStored = db.prepare('SELECT content FROM storage_probe_records WHERE id = ?').get(sqlSaved.json?.data?.id ?? '')
  } finally { db.close() }
  check('live: SQL-looking text accepted 201 and stored verbatim', sqlSaved.status === 201 && sqlStored?.content === sqlText, { status: sqlSaved?.status, stored: sqlStored?.content })
  check('live: schema still only two application tables', tables.join(',') === 'schema_migrations,storage_probe_records', tables)

  // Exact response field sets (contract: one group only).
  const successKeys = Object.keys(created.json ?? {}).sort().join(',')
  const successDataKeys = Object.keys(created.json?.data ?? {}).sort().join(',')
  const successMetaKeys = Object.keys(created.json?.meta ?? {}).sort().join(',')
  check('live: success body is exactly data+meta with frozen sub-keys', successKeys === 'data,meta' && successDataKeys === 'content,created_at,id' && successMetaKeys === 'request_id,schema_version', { successKeys, successDataKeys, successMetaKeys })
  const errorKeys = Object.keys(notFound.json ?? {}).sort().join(',')
  check('live: error body is exactly the five frozen fields', errorKeys === 'code,message,request_id,retryable,safe_details', errorKeys)

  // Additional input-boundary cases from the frozen test plan (T08).
  const countBeforeExtras = roRows(DATA).length
  const getBefore = roRows(DATA).length
  await http(`/knowledgeos/foundation/records/${id}`, { cookie })
  check('live: GET does not write', roRows(DATA).length === getBefore, roRows(DATA).length)

  const noMedia = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: { 'idempotency-key': key() }, body: '{"content":"x"}' })
  check('live: missing Content-Type is 415', noMedia.status === 415 && noMedia.json?.code === 'UNSUPPORTED_MEDIA_TYPE', { status: noMedia.status, code: noMedia.json?.code })
  const badUtf8 = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(key()), body: Buffer.from([0xc3, 0x28]) })
  check('live: invalid UTF-8 bytes are 400 INVALID_JSON', badUtf8.status === 400 && badUtf8.json?.code === 'INVALID_JSON', { status: badUtf8.status, code: badUtf8.json?.code })

  const oneByte = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(key()), body: JSON.stringify({ content: 'a' }) })
  check('live: 1-byte content is accepted 201', oneByte.status === 201, oneByte.status)
  const maxBytes = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(key()), body: JSON.stringify({ content: 'a'.repeat(4096) }) })
  check('live: exactly 4096-byte content is accepted 201', maxBytes.status === 201, maxBytes.status)
  const emojiMax = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(key()), body: JSON.stringify({ content: '😀'.repeat(1024) }) })
  check('live: 4096-byte 4-byte-emoji content is accepted 201 (UTF-8 byte limit)', emojiMax.status === 201, emojiMax.status)
  const emojiOver = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(key()), body: JSON.stringify({ content: '😀'.repeat(1025) }) })
  check('live: 4100-byte emoji content is rejected 422', emojiOver.status === 422 && emojiOver.json?.code === 'INPUT_INVALID', emojiOver.status)

  // Chunked body over the limit: the actual read bytes matter, not Content-Length.
  const chunk = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"content":"'))
      controller.enqueue(new TextEncoder().encode(`${'a'.repeat(17_000)}`))
      controller.enqueue(new TextEncoder().encode('"}'))
      controller.close()
    },
  })
  const chunked = await http('/knowledgeos/foundation/records', { method: 'POST', cookie, headers: createHeaders(key()), body: chunk, duplex: 'half' })
  check('live: chunked body over 16384 bytes is 413 PAYLOAD_TOO_LARGE', chunked.status === 413 && chunked.json?.code === 'PAYLOAD_TOO_LARGE', { status: chunked.status, code: chunked.json?.code })

  // Unknown query parameters must not reach storage as behavior switches.
  const injected = await http('/knowledgeos/foundation/records?sql=DROP&force_fail=1&db_path=C%3A%2Fx&version=2', { method: 'POST', cookie, headers: createHeaders(key()), body: JSON.stringify({ content: 'query-injection' }) })
  check('live: query-parameter injection is not a fault switch (201 or clean rejection, never 500)', injected.status !== 500 && (injected.status === 201 || injected.status === 422 || injected.status === 404), injected.status)

  const putCollection = await http('/knowledgeos/foundation/records', { method: 'PUT', cookie, headers: createHeaders(key()), body: '{}' })
  const patchCollection = await http('/knowledgeos/foundation/records', { method: 'PATCH', cookie, headers: createHeaders(key()), body: '{}' })
  const deleteDetail = await http(`/knowledgeos/foundation/records/${id}`, { method: 'DELETE', cookie })
  const getCollection = await http('/knowledgeos/foundation/records', { cookie })
  check('live: PUT collection is 405 with Allow: POST', putCollection.status === 405 && (putCollection.headers.get('allow') ?? '').includes('POST'), { status: putCollection.status, allow: putCollection.headers.get('allow') })
  check('live: PATCH collection is 405 with Allow: POST', patchCollection.status === 405 && (patchCollection.headers.get('allow') ?? '').includes('POST'), { status: patchCollection.status, allow: patchCollection.headers.get('allow') })
  check('live: DELETE detail is 405 with Allow: GET', deleteDetail.status === 405 && (deleteDetail.headers.get('allow') ?? '').includes('GET'), { status: deleteDetail.status, allow: deleteDetail.headers.get('allow') })
  check('live: GET collection is 405', getCollection.status === 405, { status: getCollection.status, allow: getCollection.headers.get('allow') })
  const expectedRows = countBeforeExtras + 3 + (injected.status === 201 ? 1 : 0)
  check('live: accepted boundary writes are exactly the 3/4 expected rows', roRows(DATA).length === expectedRows, { actual: roRows(DATA).length, expected: expectedRows })

  // Cross-process concurrency for the same idempotency key (plan §7).
  const worker = join(INDEP, 'post-once.mjs')
  const runWorker = () => new Promise(resolveWorker => {
    const child = spawn(process.execPath, [worker], {
      env: { ...process.env, KOS_PORT: String(PORT), KOS_COOKIE: cookie, KOS_KEY: cKey2, KOS_CONTENT: 'concurrent-two-processes' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let text = ''
    child.stdout.on('data', data => { text += data.toString() })
    child.stderr.on('data', data => { text += data.toString() })
    child.on('exit', code => {
      let parsed
      try { parsed = JSON.parse(text.trim().split(/\r?\n/).pop()) } catch { parsed = undefined }
      resolveWorker({ code, parsed, text: text.slice(-500) })
    })
  })
  const cKey2 = key()
  const [w1, w2] = await Promise.all([runWorker(), runWorker()])
  const workerStatuses = [w1.parsed?.status, w2.parsed?.status].sort()
  const workerRows = roRows(DATA).filter(row => row.idempotency_key === cKey2)
  check('live: two independent processes, same key -> 200+201', workerStatuses.join(',') === '200,201', { statuses: workerStatuses, pids: [w1.parsed?.pid, w2.parsed?.pid] })
  check('live: two independent processes, same key -> exactly one row', workerRows.length === 1, workerRows.length)
  check('live: both process responses share one id/created_at', w1.parsed?.id !== undefined && w1.parsed?.id === w2.parsed?.id && w1.parsed?.created_at === w2.parsed?.created_at, { id1: w1.parsed?.id, id2: w2.parsed?.id })

  transcript.push({ step: 'phase1-checks', checks: checks.slice() })
  await stopHost('phase1')

  // ------------------------------------ phase 2: real close + reopen lifecycle (not a 404 shortcut)
  const lifecycleDir = join(DATA, 'lifecycle')
  rmSync(lifecycleDir, { recursive: true, force: true })
  mkdirSync(lifecycleDir, { recursive: true })
  setPatch(lifecycleDir)
  const lifecycleHost = await startHost({ label: 'phase2' })
  const lifecycleCookie = lifecycleHost.cookie
  const lifecycleCreated = await http('/knowledgeos/foundation/records', { method: 'POST', cookie: lifecycleCookie, headers: createHeaders(key()), body: JSON.stringify({ content: '生命周期 独立复核' }) })
  check('lifecycle: record created before unload', lifecycleCreated.status === 201, lifecycleCreated.status)
  const lifecycleId = lifecycleCreated.json?.data?.id
  const openedBefore = output.split('knowledgeos-storage: opened').length - 1
  setPatch(lifecycleDir, true)
  const closeDeadline = Date.now() + 20_000
  while (Date.now() < closeDeadline && !output.includes('knowledgeos-storage: closed')) await sleep(200)
  const closedCount = output.split('knowledgeos-storage: closed').length - 1
  check('lifecycle: storage opened once in this Host process before unload', openedBefore === 1, openedBefore)
  check('lifecycle: driver close log emitted exactly once on unload', closedCount === 1, closedCount)
  check('lifecycle: no "close failed" line', !output.includes('knowledgeos-storage: close failed'))
  const afterUnload = await http(`/knowledgeos/foundation/records/${lifecycleId}`, { cookie: lifecycleCookie })
  const afterUnloadWrite = await http('/knowledgeos/foundation/records', { method: 'POST', cookie: lifecycleCookie, headers: createHeaders(key()), body: JSON.stringify({ content: 'after-close' }) })
  const apiEnvelopeAfterUnload = afterUnload.json?.code !== undefined || afterUnloadWrite.json?.code !== undefined
  check('lifecycle: routes no longer serve this API after unload (not a 404 API answer; SPA fallback only)', !apiEnvelopeAfterUnload && afterUnloadWrite.status !== 201, { get: afterUnload.status, getType: afterUnload.headers.get('content-type'), post: afterUnloadWrite.status, postType: afterUnloadWrite.headers.get('content-type') })
  check('lifecycle: unload wrote nothing to the database', roRows(lifecycleDir).length === 1, roRows(lifecycleDir).length)
  await sleep(1000)
  check('lifecycle: still exactly one close after 1s (no repeated close)', (output.split('knowledgeos-storage: closed').length - 1) === 1, (output.split('knowledgeos-storage: closed').length - 1))

  setPatch(lifecycleDir, false)
  const reopenDeadline = Date.now() + 20_000
  while (Date.now() < reopenDeadline && (output.split('knowledgeos-storage: opened').length - 1) <= openedBefore) await sleep(200)
  const reopened = await http(`/knowledgeos/foundation/records/${lifecycleId}`, { cookie: lifecycleCookie })
  const reopenedWrite = await http('/knowledgeos/foundation/records', { method: 'POST', cookie: lifecycleCookie, headers: createHeaders(key()), body: JSON.stringify({ content: 'after-reopen' }) })
  const openedAfter = output.split('knowledgeos-storage: opened').length - 1
  check('lifecycle: storage reopened once after re-enable', openedAfter === 2, openedAfter)
  check('lifecycle: original record readable after reopen', reopened.status === 200 && reopened.json?.data?.id === lifecycleId, reopened.status)
  check('lifecycle: new write works after reopen', reopenedWrite.status === 201, reopenedWrite.status)
  check('lifecycle: DB preserved through unload/reload (2 rows)', roRows(lifecycleDir).length === 2, roRows(lifecycleDir).length)
  transcript.push({ step: 'lifecycle', closedCount, openedAfter })
  await stopHost('phase2')

  // ------------------------------------ phase 3: legacy profile without dataDir
  const old = await startHost({ home: OLD_HOME, profile: 'knowledgeos-test', label: 'phase3' })
  const oldPost = await http('/knowledgeos/foundation/records', { method: 'POST', cookie: old.cookie, headers: createHeaders(key()), body: JSON.stringify({ content: 'old-profile' }) })
  const oldGet = await http(`/knowledgeos/foundation/records/${key()}`, { cookie: old.cookie })
  const oldStatus = await http('/knowledgeos/status', { cookie: old.cookie })
  const oldDbPresent = existsSync(join(OLD_HOME, 'knowledgeos.sqlite'))
  check('legacy: no dataDir -> POST is 503 STORAGE_UNAVAILABLE', oldPost.status === 503 && oldPost.json?.code === 'STORAGE_UNAVAILABLE' && oldPost.json?.retryable === false, oldPost.json)
  check('legacy: no dataDir -> GET is 503 STORAGE_UNAVAILABLE', oldGet.status === 503 && oldGet.json?.code === 'STORAGE_UNAVAILABLE', oldGet.json)
  check('legacy: original /knowledgeos/status still 200 KnowledgeOS', oldStatus.status === 200 && oldStatus.json?.product === 'KnowledgeOS', oldStatus.json?.product)
  check('legacy: no business database created under the old DSH_HOME', oldDbPresent === false, oldDbPresent)
  transcript.push({ step: 'legacy-profile', post: oldPost.json, status: oldStatus.json?.product })
  await stopHost('phase3')
} catch (error) {
  check('independent boundary run completed without exception', false, String(error?.stack ?? error))
} finally {
  await stopHost()
  writeFileSync(PATCH, originalPatch, 'utf8')
  for (const [label, text] of Object.entries(hostLogs)) writeFileSync(join(INDEP, `host-${label}.log`), redact(text), 'utf8')
}

const result = { role: 'independent', port: PORT, data_dir: DATA.replace(REPO, '<repo>'), checks, failures, result: failures === 0 ? 'PASS' : 'FAIL', host_logs: Object.keys(hostLogs) }
writeFileSync(join(INDEP, 'boundary-summary.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
writeFileSync(join(INDEP, 'boundary-transcript.json'), `${JSON.stringify({ role: 'independent', transcript }, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ result: result.result, failures, checked: checks.length }, null, 2))
process.exit(failures === 0 ? 0 : 1)