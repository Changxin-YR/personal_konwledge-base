import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Exact-build browser and SQLite harness for the independent and primary scenarios.
const [checkout, candidate, entry, fixtureFile, scenarioFile, label] = process.argv.slice(2)
assert(checkout && candidate && entry && fixtureFile && scenarioFile && ['main', 'independent'].includes(label),
  'node host-ontology.mjs <checkout> <candidate> <entry SHA> <controller> <scenario> <main|independent>')
const phaseName = process.env.KO_KNOW003_PHASE ?? 'local'
assert(['local', 'dry', 'live'].includes(phaseName))
const root = resolve(checkout)
const load = file => import(pathToFileURL(join(root, file)).href)
const { api, entryCookie } = await load('scripts/fnd004/harness.mjs')
const { candidateFacts } = await load('scripts/integrated-case-proof.mjs')
const { SCHEMA_VERSION } = await load('packages/knowledgeos-panel/lib/storage.js')
const fixture = await import(pathToFileURL(resolve(fixtureFile)).href)
const createFixture = fixture.createOntologyFixture ?? fixture.createFixture
const { run } = await import(pathToFileURL(resolve(scenarioFile)).href)
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
const hash = data => createHash('sha256').update(data).digest('hex')
assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
const fingerprint = candidateFacts(root, candidate)
assert.equal(fingerprint.entry_sha256, entry)
for (const file of [fileURLToPath(import.meta.url), resolve(fixtureFile), resolve(scenarioFile)]) {
  const path = relative(root, file).replaceAll('\\', '/')
  assert(path.startsWith('scripts/know003/'))
  assert.equal(hash(readFileSync(file)), hash(git('show', candidate + ':' + path)), 'runner files must match the frozen commit')
}
const runnerSha = hash(readFileSync(fileURLToPath(import.meta.url)))
const out = mkdtempSync(join(tmpdir(), 'knowledgeos-know003-run-'))
const facts = {
  unit_id: 'KNOW-003', candidate_sha: candidate, ...fingerprint, runner_sha256: runnerSha,
  controller_sha256: hash(readFileSync(resolve(fixtureFile))), scenario_sha256: hash(readFileSync(resolve(scenarioFile))),
  run_kind: label, model_phase: phaseName, status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', A11: 'NOT_RUN', A12: 'NOT_RUN',
  checks: [], screens: [], boots: [],
}
const prefix = '/knowledge/v1'
const ontology = prefix + '/ontology'
const knowledge = prefix + '/knowledge-items'
const assetText = '降级并限次重试可以帮助恢复间歇性采样中断。证据 K-003-ALPHA。\n'
const quote = '降级并限次重试可以帮助恢复间歇性采样中断。证据 K-003-ALPHA'
const password = randomUUID()
const headers = { 'content-type': 'application/json', 'x-knowledgeos-request': '1' }
const key = () => ({ 'idempotency-key': randomUUID() })
const external = []
const publicChecks = new Set()
let host, browser, phase
function step(description) { phase = description }
function ok(id, details = {}) { publicChecks.add(id); facts.checks.push({ id, status: 'PASS', ...details }) }
function rows(sql, ...params) {
  const db = new DatabaseSync(host.dbPath, { readOnly: true })
  try { return db.prepare(sql).all(...params).map(row => ({ ...row })) }
  finally { db.close() }
}
async function boot() {
  const started = await host.start()
  facts.boots.push(started.pid)
  return started
}
async function login(name) {
  const context = await browser.newContext({ timezoneId: 'Asia/Shanghai', viewport: { width: 1360, height: 940 }, serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === host.base) return route.continue()
    external.push(url.origin)
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  await page.goto(host.base + '/knowledgeos/account')
  await page.locator('#login_name').fill(name)
  await page.locator('#login_password').fill(password)
  await page.locator('#login').click()
  await page.locator('#profile').waitFor()
  const me = await context.request.get(host.base + prefix + '/me')
  assert.equal(me.status(), 200)
  return { id: (await me.json()).data.id, context, page }
}
async function wire(actor, url, method = 'GET', data, extra = {}) {
  const response = await actor.context.request.fetch(host.base + url, {
    method, data, maxRedirects: 0, headers: { ...headers, 'x-knowledgeos-reader-actor': actor.id, ...extra },
  })
  const payload = await response.json()
  if (response.status() >= 400) assert.equal(payload.data, undefined)
  return { status: response.status(), data: payload.data, code: payload.code, error: response.status() >= 400 ? payload : undefined }
}
async function call(actor, url, method = 'GET', data, expected = 200, extra = {}) {
  const result = await wire(actor, url, method, data, extra)
  assert((Array.isArray(expected) ? expected : [expected]).includes(result.status), method + ' ' + url + ': ' + result.status + ' ' + (result.code ?? ''))
  return result.data
}
async function capture(page, filename) {
  const bytes = await page.screenshot({ path: join(out, filename), fullPage: true, animations: 'disabled' })
  facts.screens.push({ name: filename, sha256: hash(bytes) })
}
async function uiWrite(actor, path, selector, statuses = [200, 201]) {
  const page = actor.page
  const pending = page.waitForResponse(response => response.url() === host.base + path && response.request().method() === 'POST')
  await page.locator(selector).click()
  const response = await pending
  const raw = await response.json()
  assert(statuses.includes(response.status()), JSON.stringify({ status: response.status(), code: raw.code }))
  return raw.data
}
async function upload(owner, text = assetText, previous, filename = 'know003-ontology-evidence.md') {
  return call(owner, prefix + '/imports', 'POST', Buffer.from(text), 201, {
    ...key(), 'content-type': 'text/markdown', 'x-knowledgeos-filename': filename,
    ...(previous ? { 'x-knowledgeos-asset-id': previous.id, 'x-knowledgeos-expected-version': String(previous.version) } : {}),
  })
}
async function cite(owner, asset, expected = quote) {
  const params = new URLSearchParams({ asset: asset.id, version: asset.version_id, unit: '1' })
  await owner.page.bringToFront()
  await owner.page.goto(host.base + '/knowledgeos/reader?' + params)
  const body = owner.page.locator('#text').filter({ hasText: expected })
  await body.waitFor()
  const selection = await body.evaluate((el, selected) => {
    const text = el.textContent, start = text.indexOf(selected), end = start + selected.length
    if (start < 0) throw Error('missing synthetic evidence')
    const range = document.createRange()
    range.setStart(el.firstChild, start)
    range.setEnd(el.firstChild, end)
    const current = window.getSelection()
    current.removeAllRanges()
    current.addRange(range)
    return { text, start, end }
  }, expected)
  const created = await uiWrite(owner, prefix + '/citations', '#cite')
  const witness = await call(owner, prefix + '/citations/' + created.id + '/resolve')
  assert.deepEqual([witness.asset_id, witness.version_id, witness.ordinal], [asset.id, asset.version_id, 1])
  assert.deepEqual([witness.start, witness.end, witness.quote], [selection.start, selection.end, expected])
  assert.equal(witness.source_hash, hash(selection.text))
  assert.equal(witness.quote_hash, hash(expected))
  return witness
}
async function item(owner, title, kind, sources = [], domain = 'software_engineering') {
  const result = await call(owner, knowledge, 'POST', { kind, domain, title, definition: '合成知识条目 ' + title, sources }, 201, key())
  const proposed = result.item
  assert.equal(proposed.confirmation_state, 'pending')
  const confirmed = (await call(owner, knowledge + '/' + proposed.id + '/confirm', 'POST',
    { expected_revision: proposed.version }, [200, 201], key())).item
  assert.equal(confirmed.confirmed_by, owner.id)
  assert.equal(confirmed.confirmation_state, 'confirmed')
  assert.equal(confirmed.version, proposed.version + 1)
  return confirmed
}
async function grant(owner, reader, asset) {
  const invitation = await call(owner, prefix + '/invitations', 'POST',
    { actor_id: owner.id, scope: 'object', target_id: asset.id, permission: 'read', days: 2, max_redemptions: 1 }, 201, key())
  await call(reader, prefix + '/invitations/redeem', 'POST', { actor_id: reader.id, token: invitation.token }, 201)
  return invitation
}
async function revoke(owner, invitation) {
  const url = prefix + '/invitations/' + invitation.id
  const before = await call(owner, url)
  await call(owner, url + '/revoke', 'POST', { actor_id: owner.id, expected_revision: before.revision }, 200, key())
}

try {
  step('isolate exact product, authentic separate identities and SQLite')
  host = await createFixture({ root, candidate, entry, out, helperPrefix: phaseName === 'local' ? undefined : 'scripts/know003/tokease' })
  const address = new URL(host.base)
  assert.equal(address.hostname, '127.0.0.1')
  assert.equal(address.protocol, 'http:')
  facts.binding = host.facts
  const started = await boot()
  const bootstrap = await entryCookie(started.entry)
  assert.equal((await api(Number(address.port), bootstrap.cookie, 'POST', prefix + '/auth/bootstrap',
    { login_name: 'owner', display_name: 'Ontology owner', password })).status, 201)
  assert.equal((await api(Number(address.port), '', 'POST', prefix + '/auth/register',
    { login_name: 'peer', display_name: 'Independent reader', password })).status, 201)
  assert.equal(rows('PRAGMA user_version')[0].user_version, SCHEMA_VERSION)
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server'] })
  facts.chrome = browser.version()
  const owner = await login('owner')
  const peer = await login('peer')
  const doc = await upload(owner)
  const witness = await cite(owner, doc)
  const protectedReference = [{ type: 'citation', id: witness.id }]
  const solution = await item(owner, '有限重试和降级', 'solution', protectedReference)
  const problem = await item(owner, '间歇性采样中断', 'case', protectedReference)
  const concept = await item(owner, '无关采样概念', 'concept')
  const foreignDomain = await item(owner, '不同领域案例', 'case', [], 'hardware_engineering')
  const peerPrivate = await item(peer, '成员私人终点 K-003-PRIVATE', 'case')
  ok('real_versioned_endpoints_and_fixed_evidence', { evidence_id: witness.id, source_version: doc.version_id })
  await run({
    assert, host, browser, owner, peer, doc, witness, solution, problem, concept, foreignDomain, peerPrivate,
    prefix, ontology, knowledge, step, ok, key, rows, wire, call, capture, uiWrite, boot, login, item, grant, revoke, upload, cite,
  })
  const checks = phaseName === 'local' ? ['A11_local_preflight','A12_source_change_preflight'] : ['A11']
  for (const needed of ['T01', 'T02', ...checks]) assert(publicChecks.has(needed), 'scenario did not demonstrate ' + needed)
  if (phaseName === 'live') await host.waitResponse()
  const proof = await host.proof()
  assert.equal(proof.real_inference_requests, phaseName === 'live' ? 1 : 0)
  assert.deepEqual(external, [])
  assert.deepEqual(rows('PRAGMA foreign_key_check'), [])
  assert(Array.isArray(proof.network_denials))
  assert(proof.network_denials.every(row => row.destination === 'windows_local_pipe'))
  if (phaseName === 'local') {
    const stages = ['valid-ontology-relation', 'malformed-ontology-output', 'forged-ontology-type', 'held-revoked-ontology-reply']
    assert.equal(proof.expectation_unconsumed, null)
    assert.equal(proof.local_sse_requests, stages.length)
    assert.equal(proof.expectations_armed, stages.length)
    assert.deepEqual(proof.requests.map(row => row.stage), stages)
    assert(proof.requests.every(row => row.tools === 0 && row.output_token_cap === 512))
    assert.deepEqual(proof.fixture_denials, [])
  } else {
    assert.equal(proof.expectations_armed, 1)
    assert.equal(proof.permit_consumed, true)
    assert.equal(proof.native_denials, 0)
    assert.equal(proof.outbound_tls_connect_attempts, phaseName === 'live' ? 1 : 0)
    assert.equal(proof.wire_calibrations, phaseName === 'dry' ? 1 : 0)
    assert.deepEqual(proof.transport_errors, [])
    if (phaseName === 'live') {
      assert.equal(proof.response_usage.length, 1)
      assert.equal(proof.response_usage[0].http_status, 200)
      assert.equal(proof.response_usage[0].finish, 'stop')
      assert(proof.response_usage[0].content_chars > 0)
      facts.A11 = 'PASS'
    }
  }
  facts.model = proof
  facts.T01 = facts.T02 = facts.status = 'PASS'
} catch (error) {
  facts.status = 'FAIL'
  facts.failure = { phase, message: String(error.message).slice(0, 900) }
  if (host) {
    try { facts.model = await host.proof() } catch { /* An incomplete Host cannot supply evidence. */ }
  }
  console.error(facts.failure)
  process.exitCode = 1
} finally {
  const save = () => writeFileSync(join(out, 'summary.json'), JSON.stringify(facts, null, 2) + '\n')
  facts.cleanup = 'NOT_RUN'
  save()
  const cleanup = Promise.allSettled([
    (async () => {
      if (!browser) return
      await Promise.all(browser.contexts().map(context => context.unrouteAll({ behavior: 'ignoreErrors' })))
      await browser.close()
    })(),
    (async () => { if (host?.close) await host.close(); else await host?.stop() })(),
  ])
  let timer
  const closed = await Promise.race([cleanup, new Promise(resolve => { timer = setTimeout(() => resolve(null), 25000) })])
  clearTimeout(timer)
  facts.cleanup = closed?.every(result => result.status === 'fulfilled') ? 'PASS' : 'FAIL'
  save()
  console.log(JSON.stringify({ status: facts.status, cleanup: facts.cleanup, dir: out }))
  if (facts.cleanup === 'FAIL') process.exit(1)
}
