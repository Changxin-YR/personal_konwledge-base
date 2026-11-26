import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [checkout, candidate, entry, scenarioPath, label] = process.argv.slice(2)
assert(checkout && candidate && entry && scenarioPath && ['main', 'independent'].includes(label),
  'node host-transfer.mjs <checkout> <candidate> <entry SHA-256> <scenario> <main|independent>')
const root = resolve(checkout), script = fileURLToPath(import.meta.url), scenario = resolve(scenarioPath)
const load = path => import(pathToFileURL(join(root, path)).href)
const { api, dbPath, entryCookie } = await load('scripts/fnd004/harness.mjs')
const { candidateFacts } = await load('scripts/integrated-case-proof.mjs')
const { isolate } = await load('scripts/lib002/a07-isolated-host.mjs')
const { SCHEMA_VERSION } = await load('packages/knowledgeos-panel/lib/storage.js')
const { run } = await import(pathToFileURL(scenario).href)
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
const digest = data => createHash('sha256').update(data).digest('hex')
assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
const fingerprint = candidateFacts(root, candidate)
assert.equal(fingerprint.entry_sha256, entry)
for (const file of [script, scenario]) {
  const path = relative(root, file).replaceAll('\\', '/')
  assert(path.startsWith('scripts/learn005/'), 'acceptance runner and scenario must be in the frozen candidate')
  assert.equal(digest(readFileSync(file)), digest(git('show', candidate + ':' + path)), 'acceptance code does not match frozen candidate')
}

const out = mkdtempSync(join(tmpdir(), 'knowledgeos-learn005-run-'))
const facts = {
  unit_id: 'LEARN-005', candidate_sha: candidate, ...fingerprint,
  runner_sha256: digest(readFileSync(script)), scenario_sha256: digest(readFileSync(scenario)),
  run_kind: label, model_phase: 'offline',
  status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', A15: 'NOT_RUN',
  checks: [], screens: [], boots: [], egress: { browser_denied: 0, host_non_loopback_requests: 0, real_model_requests: 0 },
}
const prefix = '/knowledge/v1'
const password = randomUUID()
const marker = { 'x-knowledgeos-request': '1' }
const idempotency = () => ({ 'idempotency-key': randomUUID() })
const turn = 'LEARN005_FIXTURE_SOURCE'
const clockStart = Date.parse('2026-11-26T03:00:00.000Z')
let time = clockStart
let host, browser, anonymous, active = false, phase = 'isolating candidate'
function step(message) { phase = message }
function pass(id, details = {}) { facts.checks.push({ id, status: 'PASS', ...details }) }
const hostEgress = []
async function stopHost() {
  if (!host || !active) return
  const trace = host.repositoryEvents()
  hostEgress.push(...trace)
  await host.stop()
  active = false
}
async function boot() {
  active = true
  const started = await host.start()
  facts.boots.push(started.pid)
  return started
}
async function clock(at) {
  assert(Number.isSafeInteger(at) && at >= time)
  host.clock(at)
  time = at
  facts.clock_points ??= []
  facts.clock_points.push(new Date(at).toISOString())
  if (browser) {
    await Promise.all(browser.contexts().flatMap(context =>
      context.pages().filter(page => !page.isClosed()).map(page => page.clock.setFixedTime(new Date(at)))))
  }
}
const now = () => time
function readRows(sql, ...params) {
  const db = new DatabaseSync(dbPath(host.data), { readOnly: true })
  try { return db.prepare(sql).all(...params).map(row => ({ ...row })) }
  finally { db.close() }
}
function writeFixture(sql) {
  const db = new DatabaseSync(dbPath(host.data))
  try { db.exec(sql) }
  finally { db.close() }
}
async function capture(page, name) {
  const bytes = await page.screenshot({ path: join(out, name + '.png'), fullPage: true, animations: 'disabled' })
  facts.screens.push({ file: name + '.png', sha256: digest(bytes), bytes: bytes.length })
}
async function login(name) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block',
  })
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === host.base) return route.continue()
    facts.egress.browser_denied++
    return route.abort()
  })
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date(time))
  page.setDefaultTimeout(12000)
  await page.goto(host.base + '/knowledgeos/account')
  await page.locator('#login_name').fill(name)
  await page.locator('#login_password').fill(password)
  const [response] = await Promise.all([
    page.waitForResponse(value => value.url() === host.base + prefix + '/auth/login' && value.request().method() === 'POST'),
    page.locator('#login').click(),
  ])
  assert.equal(response.status(), 200, 'synthetic account login failed')
  await page.locator('#profile').waitFor()
  const me = await context.request.get(host.base + prefix + '/me')
  assert.equal(me.status(), 200)
  return { name, ...(await me.json()).data, context, page }
}
async function wire(actor, path, method = 'GET', data, headers = {}) {
  assert(path.startsWith('/'))
  const client = actor?.context.request ?? anonymous.request
  const response = await client.fetch(host.base + path, { method, data, headers: { ...marker, ...headers }, maxRedirects: 0 })
  const body = response.status() === 204 ? '' : await response.text()
  let payload
  try { payload = body ? JSON.parse(body) : undefined }
  catch { throw Error(method + ' ' + path + ' returned a non-JSON body') }
  return { status: response.status(), payload, cache: response.headers()['cache-control'], raw: body }
}
async function request(actor, path, method = 'GET', data, { status = 200, code, headers } = {}) {
  const result = await wire(actor, path, method, data, headers)
  assert.equal(result.status, status, method + ' ' + path + ' ' + (result.payload?.code ?? ''))
  if (code) assert.equal(result.payload?.code, code)
  if (status >= 400) {
    assert.equal(result.payload?.data, undefined)
    return result
  }
  if (result.payload?.data?.actor_id !== undefined) assert.equal(result.payload.data.actor_id, actor.id)
  return result.payload?.data
}
async function currentProject(owner, members, outsider, name = 'LEARN005 synthetic collaboration') {
  const project = await request(owner, prefix + '/projects', 'POST', { name }, { status: 201 })
  const invitation = await request(owner, prefix + '/invitations', 'POST', {
    actor_id: owner.id, scope: 'project', target_id: project.id, permission: 'member', days: 2, max_redemptions: members.length,
  }, { status: 201, headers: idempotency() })
  for (const actor of members) {
    await request(actor, prefix + '/invitations/redeem', 'POST', { actor_id: actor.id, token: invitation.token }, { status: 201 })
  }
  const rosterPath = prefix + '/project-tasks/projects/' + project.id + '/members'
  for (const actor of members) {
    const data = await request(actor, rosterPath)
    assert.equal(data.project.id, project.id)
    assert.equal(data.project.can_manage, false)
    assert(data.project.members.some(member => member.id === actor.id && member.role === 'member'))
  }
  const outsiderResult = await wire(outsider, rosterPath)
  assert.equal(outsiderResult.status, 404)
  assert.equal(outsiderResult.payload?.data, undefined)
  return project
}
async function shareSource(owner, members, asset) {
  const invitation = await request(owner, prefix + '/invitations', 'POST', {
    actor_id: owner.id, scope: 'object', target_id: asset.id, permission: 'read', days: 2, max_redemptions: members.length,
  }, { status: 201, headers: idempotency() })
  for (const actor of members) {
    await request(actor, prefix + '/invitations/redeem', 'POST', { actor_id: actor.id, token: invitation.token }, { status: 201 })
  }
  return invitation
}
async function source(owner, word = turn) {
  const text = word + '\nThe testing source has stable first and later attempts.\n'
  const response = await owner.context.request.post(host.base + prefix + '/imports', {
    headers: { ...marker, ...idempotency(), 'content-type': 'text/plain', 'x-knowledgeos-filename': word.toLowerCase() + '.txt' },
    data: Buffer.from(text, 'utf8'), maxRedirects: 0,
  })
  assert.equal(response.status(), 201)
  const asset = (await response.json()).data
  const query = new URLSearchParams({ asset: asset.id, version: asset.version_id, unit: '1' })
  await owner.page.goto(host.base + '/knowledgeos/reader?' + query)
  const content = owner.page.locator('#text')
  await content.filter({ hasText: word }).waitFor()
  await content.evaluate((element, word) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode, offset = node.textContent.indexOf(word)
      if (offset < 0) continue
      const range = document.createRange()
      range.setStart(node, offset)
      range.setEnd(node, offset + word.length)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
      return
    }
    throw Error('source marker is unavailable to the visible reader')
  }, word)
  const [selected] = await Promise.all([
    owner.page.waitForResponse(value => value.url() === host.base + prefix + '/citations' && value.request().method() === 'POST'),
    owner.page.locator('#cite').click(),
  ])
  assert([200, 201].includes(selected.status()))
  const citation = (await selected.json()).data
  assert.equal(citation.asset_id, asset.id)
  assert.equal(citation.version_id, asset.version_id)
  assert.equal(citation.quote_hash, digest(word))
  return { asset, citation, text_sha256: digest(text) }
}
async function upgradeSource(owner, asset, markerText) {
  const response = await owner.context.request.post(host.base + prefix + '/imports', {
    headers: { ...marker, ...idempotency(), 'content-type': 'text/plain', 'x-knowledgeos-filename': 'learn001-updated-source.txt',
      'x-knowledgeos-asset-id': asset.id, 'x-knowledgeos-expected-version': String(asset.version) },
    data: Buffer.from(markerText, 'utf8'), maxRedirects: 0,
  })
  assert.equal(response.status(), 201)
  const updated = (await response.json()).data
  assert.equal(updated.id, asset.id)
  assert.equal(updated.version, asset.version + 1)
  assert.notEqual(updated.version_id, asset.version_id)
  return updated
}
async function finish() {
  const save = () => writeFileSync(join(out, 'summary.json'), JSON.stringify(facts, null, 2) + '\n')
  facts.cleanup = 'NOT_RUN'
  save()
  const actions = Promise.allSettled([
    (async () => {
      if (!browser) return
      await Promise.all(browser.contexts().map(context => context.unrouteAll({ behavior: 'ignoreErrors' })))
      await browser.close()
    })(),
    stopHost(),
  ])
  let timer
  const closed = await Promise.race([actions, new Promise(resolve => { timer = setTimeout(() => resolve(null), 25000) })])
  clearTimeout(timer)
  facts.cleanup = closed?.every(value => value.status === 'fulfilled') ? 'PASS' : 'FAIL'
  facts.egress.host_non_loopback_requests = hostEgress.length
  save()
  console.log(JSON.stringify({ status: facts.status, cleanup: facts.cleanup, dir: out }))
  if (facts.cleanup === 'FAIL') process.exit(1)
}

try {
  host = await isolate(candidate, entry, { repositoryTraffic: 'fixture-only', businessClock:clockStart })
  const first = await boot()
  const initial = await entryCookie(first.entry)
  assert.equal((await api(host.port, initial.cookie, 'POST', prefix + '/auth/bootstrap', { login_name: 'owner', display_name: 'Synthetic project owner', password })).status, 201)
  for (const [name, display] of [['learner-a', 'First synthetic learner'], ['learner-b', 'Second synthetic learner'], ['outsider', 'Synthetic outsider']]) {
    assert.equal((await api(host.port, '', 'POST', prefix + '/auth/register', { login_name: name, display_name: display, password })).status, 201)
  }
  assert.equal(readRows('PRAGMA user_version')[0].user_version, SCHEMA_VERSION)
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server'] })
  anonymous = await browser.newContext({ serviceWorkers: 'block' })
  facts.chrome = browser.version()
  step('distinct browser identities and actual active memberships')
  const owner = await login('owner'), learnerA = await login('learner-a'), learnerB = await login('learner-b'), outsider = await login('outsider')
  assert.equal(new Set([owner.id, learnerA.id, learnerB.id, outsider.id]).size, 4)
  const project = await currentProject(owner, [learnerA, learnerB], outsider)
  const evidence = await source(owner)
  const sourceGrantA = await shareSource(owner, [learnerA], evidence.asset)
  const sourceGrantB = await shareSource(owner, [learnerB], evidence.asset)
  for (const actor of [learnerA, learnerB]) {
    const reader = await wire(actor, prefix + '/citations/' + evidence.citation.id + '/resolve')
    assert.equal(reader.status, 200)
  }
  const outsiderSource = await wire(outsider, prefix + '/citations/' + evidence.citation.id + '/resolve')
  assert.equal(outsiderSource.status, 404)
  pass('real_project_acl_and_reader_source', { sqlite_schema: SCHEMA_VERSION, source_quote_sha256: evidence.citation.quote_hash })
  await run({ assert, base: host.base, prefix, owner, learnerA, learnerB, outsider, project, evidence, sourceGrantA, sourceGrantB, step, pass,
    request, wire, idempotency, readRows, writeFixture, capture, login, boot, stopHost, currentProject, shareSource, source, upgradeSource, clock,now })
  for (const id of ['T01', 'T02']) assert(facts.checks.some(check => check.id === id))
  assert.equal(host.repositoryEvents().length + hostEgress.length, 0, 'no non-loopback Host fetches allowed')
  assert.equal(facts.egress.browser_denied, 0, 'browser attempted an external request')
  assert.deepEqual(readRows('PRAGMA foreign_key_check'), [])
  facts.T01 = facts.T02 = facts.status = 'PASS'
} catch (error) {
  facts.status = 'FAIL'
  facts.failure = { phase, message: String(error.message).slice(0, 500) }
  console.error(facts.failure)
  process.exitCode = 1
} finally { await finish() }
