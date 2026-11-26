import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [checkout, candidate, entry, fixtureFile, scenarioFile, label] = process.argv.slice(2)
assert(checkout && candidate && entry && fixtureFile && scenarioFile && ['main','independent'].includes(label))
const root = resolve(checkout)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fromRoot = file => import(pathToFileURL(join(root, file)).href)
const { api, dbPath, entryCookie } = await fromRoot('scripts/fnd004/harness.mjs')
const { candidateFacts } = await fromRoot('scripts/integrated-case-proof.mjs')
const { until } = await fromRoot('scripts/lib002/a07-isolated-host.mjs')
const { SCHEMA_VERSION } = await fromRoot('packages/knowledgeos-panel/lib/storage.js')
const path = value => relative(root, resolve(value)).replaceAll('\\','/')
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
const files = [fileURLToPath(import.meta.url), resolve(fixtureFile), resolve(scenarioFile)]
assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
const fingerprint = candidateFacts(root, candidate)
assert.equal(fingerprint.entry_sha256, entry)
for (const file of files) {
  assert(path(file).startsWith('scripts/learn002/') || path(file).startsWith('scripts/know003/local-model/'))
  assert.equal(sha(readFileSync(file)), sha(git('show', candidate + ':' + path(file))), 'fixture/scenario not in frozen candidate')
}
const fixture = await import(pathToFileURL(resolve(fixtureFile)).href)
const { run } = await import(pathToFileURL(resolve(scenarioFile)).href)
const createFixture = fixture.createQuickFixture ?? fixture.createOntologyFixture ?? fixture.createFixture
const out = mkdtempSync(join(tmpdir(), 'knowledgeos-learn002-run-'))
const p = '/knowledge/v1'
const password = randomUUID()
const phaseName = process.env.KO_LEARN002_PHASE ?? 'local'
assert(['local','dry','live'].includes(phaseName))
const facts = {
  unit_id: 'LEARN-002', candidate_sha: candidate, ...fingerprint,
  runner_sha256: sha(readFileSync(files[0])), controller_sha256: sha(readFileSync(files[1])), scenario_sha256: sha(readFileSync(files[2])),
  run_kind: label, model_phase: phaseName, status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', A13: 'NOT_RUN', P05: 'NOT_RUN',
  checks: [], screens: [], boots: [], browser_denials: 0,
}
let host, browser, anonymous, phase
const step = label => { phase = label }
const pass = (id, fields = {}) => facts.checks.push({ id, status: 'PASS', ...fields })
const key = () => ({ 'idempotency-key': randomUUID() })
const headers = (actor, receipt = key()) => ({ 'x-knowledgeos-reader-actor': actor.id, ...receipt })

async function boot() {
  const started = await host.start()
  facts.boots.push(started.pid)
  return started
}
async function login(name) {
  const client = await browser.newContext({ viewport: { width: 1360, height: 940 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
  await client.route('**/*', route => {
    if (new URL(route.request().url()).origin === host.base) return route.continue()
    facts.browser_denials++
    return route.abort()
  })
  const page = await client.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(host.base + '/knowledgeos/account')
  const box = async (id, value) => page.locator(id).fill(value)
  await box('#login_name', name)
  await box('#login_password', password)
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url() === host.base + p + '/auth/login' && response.request().method() === 'POST'),
    page.locator('#login').click(),
  ])
  assert.equal(response.status(), 200)
  await page.locator('#profile').waitFor()
  const me = await client.request.get(host.base + p + '/me')
  assert.equal(me.status(), 200)
  return { ...(await me.json()).data, name, client, page }
}
function rows(sql, ...params) {
  const db = new DatabaseSync(host.dbPath ?? dbPath(host.data), { readOnly: true })
  try { return db.prepare(sql).all(...params).map(row => ({ ...row })) } finally { db.close() }
}
async function wire(actor, path, { method = 'GET', data, headers = {} } = {}) {
  assert(path.startsWith('/') && !path.startsWith('//'))
  const response = await (actor?.client ?? anonymous).request.fetch(host.base + path, {
    method, data, maxRedirects: 0, headers: { 'x-knowledgeos-request': '1', ...headers },
  })
  const raw = await response.text()
  const payload = raw ? JSON.parse(raw) : undefined
  if (response.status() >= 400) assert.equal(payload?.data, undefined)
  if (actor && payload?.data?.actor_id !== undefined) assert.equal(payload.data.actor_id, actor.id)
  return { status: response.status(), cache: response.headers()['cache-control'], raw, payload }
}
async function request(actor, path, opts, status = 200) {
  const response = await wire(actor, path, opts)
  assert([status].flat().includes(response.status), (opts?.method ?? 'GET') + ' ' + path + ' ' + (response.payload?.code ?? response.status))
  return response.payload?.data
}
async function upload(actor, file, bytes, type = 'text/markdown', previous) {
  const response = await actor.client.request.post(host.base + p + '/imports', {
    data: Buffer.from(bytes), maxRedirects: 0,
    headers: { ...key(), 'x-knowledgeos-request': '1', 'content-type': type, 'x-knowledgeos-filename': file,
      ...(previous ? { 'x-knowledgeos-asset-id': previous.id, 'x-knowledgeos-expected-version': String(previous.version) } : {}) },
  })
  assert.equal(response.status(), 201)
  const asset = (await response.json()).data
  assert.equal(asset.sha256, sha(bytes))
  if (previous) { assert.equal(asset.id, previous.id); assert.notEqual(asset.version_id, previous.version_id) }
  return asset
}
async function grantSource(owner, actor, asset) {
  const invitation = await request(owner, p + '/invitations', { method: 'POST', headers: key(), data: {
    actor_id: owner.id, scope: 'object', target_id: asset.id, permission: 'read', days: 2, max_redemptions: 1,
  } }, 201)
  await request(actor, p + '/invitations/redeem', { method: 'POST', data: { actor_id: actor.id, token: invitation.token } }, 201)
  return invitation
}
async function revokeSource(owner, invitation) {
  const path = p + '/invitations/' + invitation.id
  const { revision } = await request(owner, path)
  return request(owner, path + '/revoke', { method: 'POST', headers: key(), data: { actor_id: owner.id, expected_revision: revision } })
}
async function capture(page, name) {
  const bytes = await page.screenshot({ path: join(out,name+'.png'), fullPage:true, animations:'disabled' })
  facts.screens.push({ file: name+'.png', sha256: sha(bytes), bytes: bytes.length })
}
async function chromeWrite(actor, path, selector, expected = 201) {
  const [response] = await Promise.all([
    actor.page.waitForResponse(result => result.url() === host.base + path && result.request().method() === 'POST'),
    actor.page.locator(selector).click(),
  ])
  const payload = await response.json()
  assert([expected].flat().includes(response.status()), (payload.code ?? response.status) + ' in browser ' + path)
  return { data: payload.data, key: response.request().headers()['idempotency-key'], input: response.request().postDataJSON() }
}
async function stop() { await host?.stop() }

try {
  step('exact native candidate and isolated business accounts')
  host = await createFixture({ root, candidate, entry, out, helperPrefix: phaseName === 'local' ? undefined : 'scripts/learn002/tokease' })
  const first = await boot()
  const firstCookie = await entryCookie(first.entry)
  assert.equal((await api(host.port, firstCookie.cookie, 'POST', p + '/auth/bootstrap', { login_name:'owner',display_name:'Owner',password })).status, 201)
  for (const [login_name, display_name] of [['learner','Synthetic reader'],['outsider','Synthetic outsider']]) {
    assert.equal((await api(host.port, '', 'POST', p + '/auth/register', { login_name, display_name, password })).status, 201)
  }
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  browser = await chromium.launch({ channel:'chrome', headless:true, args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-proxy-server'] })
  facts.chrome = browser.version()
  anonymous = await browser.newContext({ serviceWorkers: 'block' })
  const owner = await login('owner'), learner = await login('learner'), outsider = await login('outsider')
  assert.equal(rows('PRAGMA user_version')[0].user_version, SCHEMA_VERSION)
  await run({ assert, host, phaseName, origin:host.base, owner, learner, outsider, p, sha, facts, step, pass, until,
    rows, headers, key, wire, request, upload, grantSource, revokeSource, capture, chromeWrite, login, boot, stop })
  if(phaseName === 'live') await host.waitResponse()
  facts.model = await host.proof()
  assert.equal(facts.model.real_inference_requests, phaseName === 'live' ? 1 : 0)
  if(phaseName==='local'){
    assert.equal(facts.model.expectation_unconsumed,null)
    assert.deepEqual(facts.model.fixture_denials,[])
    assert(facts.model.network_denials.every(row=>row.destination==='windows_local_pipe'))
  }else{
    assert.equal(facts.model.expectations_armed,1)
    assert.equal(facts.model.permit_consumed,true)
    assert.equal(facts.model.native_denials,0)
    assert.equal(facts.model.outbound_tls_connect_attempts,phaseName==='live'?1:0)
    assert.equal(facts.model.wire_calibrations,phaseName==='dry'?1:0)
    assert.equal(facts.model.requests.length,1)
    assert(facts.model.requests.every(row=>row.tools===0&&row.output_token_cap<=1536))
    assert(facts.model.network_denials.every(row=>row.destination==='windows_local_pipe'))
    assert.deepEqual(facts.model.transport_errors,[])
    if(phaseName==='live'){
      assert.equal(facts.model.response_usage.length,1)
      const response=facts.model.response_usage[0]
      assert.equal(response.http_status,200)
      assert.equal(response.finish,'stop')
      assert(response.content_chars>0)
    }
  }
  assert.equal(facts.browser_denials, 0)
  assert.deepEqual(rows('PRAGMA foreign_key_check'), [])
  for (const id of ['T01','T02']) assert(facts.checks.some(check => check.id === id))
  facts.T01 = facts.T02 = facts.status = 'PASS'
} catch (error) {
  facts.status = 'FAIL'
  facts.failure = { phase, message:String(error.message).slice(0,700) }
  if(host) { try { facts.model = await host.proof() } catch { /* No completed model transport evidence. */ } }
  console.error(facts.failure)
  process.exitCode = 1
} finally {
  const save = () => writeFileSync(join(out,'summary.json'),JSON.stringify(facts,null,2)+'\n')
  facts.cleanup = 'NOT_RUN'; save()
  const cleanup = Promise.allSettled([
    (async () => {
      if(!browser)return
      await Promise.all(browser.contexts().map(context => context.unrouteAll({ behavior:'ignoreErrors' })))
      await browser.close()
    })(),
    (async () => { if(host?.close)await host.close();else await host?.stop() })(),
  ])
  let timer
  const ended = await Promise.race([cleanup,new Promise(done=>{timer=setTimeout(()=>done(null),25000)})])
  clearTimeout(timer)
  facts.cleanup = ended?.every(result=>result.status==='fulfilled')?'PASS':'FAIL'
  save()
  console.log(JSON.stringify({ status:facts.status,cleanup:facts.cleanup,dir:out }))
  if(facts.cleanup==='FAIL')process.exit(1)
}
