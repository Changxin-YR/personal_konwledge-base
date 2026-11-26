import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The operator-supplied controller provisions only an authorized isolated profile.
// Export createFixture({root,candidate,entry,out,fixtureSha256}) returning:
// { base: loopback origin, dbPath: absolute SQLite file, playwright: absolute entry,
//   start(): {entry,pid}, stop(), beforeExplain?(), proof(): {provider,model,real_inference_requests} }.
// start after stop must retain the same base and data; proof supplies cumulative
// safe egress evidence for the two requests, without prompt text or credentials.
// No controller is bundled here and no model calls run before an explicit launch.
const [checkout, candidate, entry, controller] = process.argv.slice(2)
assert(checkout && candidate && entry && controller,
  'node host-terms.mjs <frozen checkout> <candidate SHA> <entry SHA256> <authorized controller.mjs>')
const root = resolve(checkout)
const load = path => import(pathToFileURL(join(root, path)).href)
const { api, entryCookie } = await load('scripts/fnd004/harness.mjs')
const { candidateFacts } = await load('scripts/integrated-case-proof.mjs')
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
const hash = value => createHash('sha256').update(value).digest('hex')
assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
const controllerPath = relative(root, resolve(controller)).split(sep).join('/')
assert(['scripts/know001/term-controller.mjs','scripts/know001/offline/controller.mjs'].includes(controllerPath))
const controllerSha = hash(readFileSync(join(root, controllerPath)))
assert.equal(controllerSha, hash(git('show', candidate + ':' + controllerPath)))
const { createFixture } = await load(controllerPath)
assert.equal(typeof createFixture, 'function')
const fingerprint = candidateFacts(root, candidate)
assert.equal(fingerprint.entry_sha256, entry)
const runnerSha = hash(readFileSync(fileURLToPath(import.meta.url)))
assert.equal(runnerSha, hash(git('show', candidate + ':scripts/know001/host-terms.mjs')))
const fixturePath = 'scripts/know001/context-fixture.md'
const fixtureBody = readFileSync(join(root, fixturePath))
const fixtureSha256 = hash(fixtureBody)
assert.equal(fixtureSha256, hash(git('show', candidate + ':' + fixturePath)))
const out = mkdtempSync(join(tmpdir(), 'knowledgeos-know001-run-'))
const facts = {
  unit_id: 'KNOW-001', candidate_sha: candidate, ...fingerprint, runner_sha256: runnerSha, fixture_sha256: fixtureSha256, controller_sha256: controllerSha,
  status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', A10: 'NOT_RUN', P03: 'NOT_RUN', checks: [], screens: [], boots: [],
}

const prefix = '/knowledge/v1'
const terms = prefix + '/terms'
const selectedTerm = '索引'
const password = randomUUID()
const bodyHeaders = { 'content-type': 'application/json', 'x-knowledgeos-request': '1' }
const writeKey = () => ({ 'idempotency-key': randomUUID() })
const ok = (id, details = {}) => facts.checks.push({ id, status: 'PASS', ...details })
const fixtureKinds = [
  { name: 'database', locator: '数据库索引（database index）', concept: /数据结构|检索|查询|查找|扫描|定位记录/,
    plain: /检索|查询|查找|扫描|查阅|(?:快速|更快|加快).{0,12}(?:找到|定位)|目录.{0,20}(?:找|定位)/, context: /B-tree|查找记录|减少.{0,10}扫描/ },
  { name: 'array', locator: '数组索引（array index）', concept: /位置|编号|下标|元素/,
    plain: /位置|编号|下标|元素|第几|顺序/, context: /第一个元素|位置编号|从\s*0/ },
]
let host, browser, phase
const externalBrowser = []
const rows = (sql, ...args) => {
  const db = new DatabaseSync(host.dbPath, { readOnly: true })
  try { return db.prepare(sql).all(...args).map(row => ({ ...row })) }
  finally { db.close() }
}
const durable = () => ({
  terms: rows('SELECT * FROM saved_terms ORDER BY rowid'),
  citations: rows('SELECT COUNT(*) AS n FROM citations')[0].n,
})
const assetReader = ({ id, version_id }) => prefix + '/assets/' + id + '/versions/' + version_id + '/reader'
const plainReader = ({ id, version_id }) => '/knowledgeos/reader?' + new URLSearchParams({ asset: id, version: version_id })
const listPath = ({ id, version_id }) => terms + '?' + new URLSearchParams({ asset: id, version: version_id })
const actorHeader = actor => ({ 'x-knowledgeos-reader-actor': actor.id })
async function start() {
  const started = await host.start()
  facts.boots.push(started.pid)
  return started
}
async function login(name) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 940 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === host.base) return route.continue()
    externalBrowser.push(url.origin)
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  await page.goto(host.base + '/knowledgeos/account')
  await page.locator('#login_name').fill(name)
  await page.locator('#login_password').fill(password)
  await page.locator('#login').click()
  await page.locator('#profile').waitFor()
  const me = await context.request.get(host.base + prefix + '/me')
  assert.equal(me.status(), 200)
  return { context, page, id: (await me.json()).data.id }
}
async function call(actor, path, { method = 'GET', data, headers = {}, status = 200 } = {}) {
  const resp = await actor.context.request.fetch(host.base + path, { method, data, headers, maxRedirects: 0 })
  const result = await resp.json()
  const expected = Array.isArray(status) ? status : [status]
  assert(expected.includes(resp.status()), method + ' ' + path + ': ' + resp.status() + ' ' + (result.code ?? ''))
  if (resp.status() >= 400) {
    assert.equal(result.data, undefined)
    return { status: resp.status(), code: result.code }
  }
  return result.data
}
async function upload(owner, bytes, previous) {
  return call(owner, prefix + '/imports', {
    method: 'POST', data: bytes, status: 201, headers: {
      ...bodyHeaders, ...writeKey(), 'content-type': 'text/markdown', 'x-knowledgeos-filename': 'term-context-fixture.md',
      ...(previous ? { 'x-knowledgeos-asset-id': previous.id, 'x-knowledgeos-expected-version': String(previous.version) } : {}),
    },
  })
}
async function share(owner, peer, asset) {
  const invitation = await call(owner, prefix + '/invitations', {
    method: 'POST', data: { actor_id: owner.id, scope: 'object', target_id: asset.id, permission: 'read', days: 2, max_redemptions: 1 },
    status: 201, headers: { ...bodyHeaders, ...writeKey() },
  })
  await call(peer, prefix + '/invitations/redeem', {
    method: 'POST', data: { actor_id: peer.id, token: invitation.token }, status: 201, headers: bodyHeaders,
  })
}
async function open(owner, asset) {
  await owner.page.bringToFront()
  await owner.page.goto(host.base + plainReader(asset))
  await owner.page.locator('#text').waitFor()
}
const ordinal = async page => Number(await page.locator('#number').inputValue())
async function jump(page, source) {
  await page.locator('#number').fill(String(source.ordinal))
  await page.locator('#jump').getByRole('button', { name: '跳转', exact: true }).click()
  await page.locator('#text').filter({ hasText: source.locator }).waitFor()
  assert.equal(await page.locator('#text').textContent(), source.text)
  assert.equal(await ordinal(page), source.ordinal)
}
async function httpWrite(page, path, selector) {
  const matches = r => r.url() === host.base + path && r.method() === 'POST'
  const events = []
  const start = request => { if (matches(request)) events.push({ event: 'request' }) }
  const failure = request => { if (matches(request)) events.push({ event: 'requestfailed', code: request.failure()?.errorText }) }
  page.on('request', start)
  page.on('requestfailed', failure)
  try {
    const [response] = await Promise.all([
      page.waitForResponse(r => matches(r.request()), { timeout: 35000 }),
      page.locator(selector).click(),
    ])
    return { status: response.status(), data: await response.json(), request: response.request() }
  } catch (error) {
    const state = await page.evaluate(() => ({ hidden: document.hidden, ordinal: document.getElementById('number').value,
      term_hidden: document.getElementById('term-panel').hidden, status: document.getElementById('term-status').textContent })).catch(() => ({}))
    facts.http_failure = { path, events, ...state }
    await capture(page, 'term-request-failure.png').catch(() => {})
    throw error
  } finally {
    page.off('request', start)
    page.off('requestfailed', failure)
  }
}
async function capture(page, name) {
  const pixels = await page.screenshot({ path: join(out, name), fullPage: true, animations: 'disabled' })
  facts.screens.push({ name, sha256: hash(pixels) })
}
async function savedList(actor, asset) {
  const data = await call(actor, listPath(asset), { headers: actorHeader(actor) })
  const listing = Array.isArray(data) ? data : data.terms
  assert(Array.isArray(listing))
  return listing
}
async function readPosition(actor, asset) {
  const current = await call(actor, assetReader(asset) + '-state')
  assert.equal(current.actor_id, actor.id)
  return current.position
}
async function selectLast(page, needle) {
  return page.locator('#text').evaluate((node, needle) => {
    const whole = node.textContent
    const start = whole.lastIndexOf(needle)
    if (start < 0 || start <= whole.indexOf(needle)) throw Error('fixture term must repeat')
    const end = start + needle.length
    const find = offset => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      let text
      while ((text = walker.nextNode())) {
        if (offset <= text.length) return [text, offset]
        offset -= text.length
      }
      throw Error('cannot map tested DOM range')
    }
    const [first, firstOffset] = find(start)
    const [last, lastOffset] = find(end)
    const range = document.createRange()
    range.setStart(first, firstOffset)
    range.setEnd(last, lastOffset)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    return { start, end, quote: selection.toString(), scalarStart: [...whole.slice(0, start)].length }
  }, needle)
}
async function explain(owner, asset, source) {
  const page = owner.page
  const baseline = durable()
  const range = await selectLast(page, selectedTerm)
  assert.equal(range.quote, selectedTerm)
  assert(range.start > range.scalarStart, 'test fixture must discriminate UTF-16 from code points')
  const spec = {
    asset_id: asset.id, version_id: asset.version_id, ordinal: source.ordinal,
    start: range.start, end: range.end, source_hash: hash(source.text),
  }
  await host.beforeExplain?.({ stage: source.name === 'database' ? 'database-index' : 'array-index', spec, sourceText: source.text })
  const actual = await httpWrite(page, terms + '/explain', '#term-explain')
  assert.equal(actual.status, 200, actual.data.code)
  assert.equal(actual.request.headers()['x-knowledgeos-reader-actor'], owner.id)
  assert.deepEqual(actual.request.postDataJSON(), spec)
  const data = actual.data.data
  assert.match(data.explanation_id, /^[0-9a-f-]{36}$/)
  assert.equal(data.term, selectedTerm)
  assert.equal(data.source.quote, selectedTerm)
  assert.equal(data.source.quote_hash, hash(selectedTerm))
  for (const [name, value] of Object.entries(spec)) assert.equal(data.source[name], value)
  assert(data.source.excerpt.includes(selectedTerm) && source.text.includes(data.source.excerpt))
  await page.locator('#term-panel').waitFor()
  const result = {}
  for (const field of ['context', 'plain', 'professional', 'confusions', 'evidence']) {
    const node = page.locator('#term-' + field)
    await node.waitFor()
    result[field] = (await node.textContent()).trim()
    assert(result[field], field + ' is empty for ' + source.name)
  }
  assert.match(data.source.excerpt, source.context)
  assert.match(result.context, source.concept)
  assert.match(result.plain, source.plain)
  assert.match(result.professional, source.concept)
  const link = await page.locator('#term-origin').getAttribute('href')
  assert(link)
  const origin = new URL(link, host.base)
  assert.equal(origin.origin, host.base)
  assert.equal(origin.pathname, '/knowledgeos/reader')
  assert.equal(origin.searchParams.get('asset'), asset.id)
  assert.equal(origin.searchParams.get('version'), asset.version_id)
  if (origin.searchParams.has('match')) {
    assert.equal(origin.searchParams.get('unit'), String(source.ordinal))
    assert.equal(origin.searchParams.get('match'), [range.start, range.end, spec.source_hash].join(':'))
  } else {
    assert.match(origin.searchParams.get('citation') ?? '', /^[0-9a-f-]{36}$/)
  }
  assert.equal(await ordinal(page), source.ordinal)
  assert.deepEqual(durable(), baseline, 'explaining must never save a term or materialize a citation')
  await capture(page, source.name + '-term.png')
  return { data, result, spec, origin: origin.href }
}
async function proof() {
  const safe = await host.proof()
  assert.equal(typeof safe.provider, 'string')
  assert.match(safe.model, /^deepseek(?:[-/]|$)/i)
  const { mode, provider, model, real_inference_requests, fixture_dispatches, wire_calibrations, requests, endpoint, manifest_sha256 } = safe
  assert(['live','dry','CONTROLLED_FIXTURE'].includes(mode))
  assert.equal(real_inference_requests, mode === 'live' ? 2 : 0)
  if (mode === 'live') {
    assert.equal(provider, 'tokease'); assert.equal(model, 'deepseek-v4.1-flash-1017'); assert.equal(endpoint, 'https://tokease.cn/v1')
    assert.match(manifest_sha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(requests.map(r => r.stage), ['database-index','array-index'])
    assert(requests.every(r => r.output_token_cap === 1536 && /^[a-f0-9]{64}$/.test(r.request_sha256)))
  }
  if (mode === 'CONTROLLED_FIXTURE') assert.equal(fixture_dispatches, 2)
  if (mode === 'dry') {
    assert.equal(wire_calibrations, 2)
    assert(requests.every(r => r.output_token_cap === 1536))
  }
  return { mode, provider, model, real_inference_requests, fixture_dispatches, wire_calibrations, requests, endpoint, manifest_sha256 }
}

try {
  phase = 'bound Host and clean business users'
  host = await createFixture({ root, candidate, entry, out, fixtureSha256 })
  const hostUrl = new URL(host.base)
  assert.equal(hostUrl.protocol, 'http:')
  assert.equal(hostUrl.hostname, '127.0.0.1')
  assert.equal(hostUrl.origin, host.base)
  const started = await start()
  const bootstrap = await entryCookie(started.entry)
  assert.equal((await api(Number(hostUrl.port), bootstrap.cookie, 'POST', prefix + '/auth/bootstrap', {
    login_name: 'owner', display_name: 'Term reader', password,
  })).status, 201)
  assert.equal((await api(Number(hostUrl.port), '', 'POST', prefix + '/auth/register', {
    login_name: 'peer', display_name: 'Other reader', password,
  })).status, 201)
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server'] })
  facts.chrome = browser.version()
  const owner = await login('owner')
  const peer = await login('peer')
  const asset = await upload(owner, fixtureBody)
  assert(asset.id && asset.version_id)
  await share(owner, peer, asset)
  const blocks = rows('SELECT ordinal,text FROM text_blocks WHERE version_id=? ORDER BY ordinal', asset.version_id)
  const sources = fixtureKinds.map(kind => {
    const matches = blocks.filter(row => row.text.includes(kind.locator))
    assert.equal(matches.length, 1)
    return { ...kind, ...matches[0] }
  })
  assert.notEqual(sources[0].ordinal, sources[1].ordinal)
  await call(peer, assetReader(asset) + '?unit=' + sources[0].ordinal)
  assert.deepEqual(await savedList(peer, asset), [])
  assert.deepEqual(await savedList(owner, asset), [])
  await open(owner, asset)

  phase = 'T01 first range: database, temporary only'
  await jump(owner.page, sources[0])
  const first = await explain(owner, asset, sources[0])
  assert.equal(durable().terms.length, 0)
  const peerSave = await call(peer, terms, {
    method: 'POST', data: { explanation_id: first.data.explanation_id },
    headers: { ...bodyHeaders, ...actorHeader(peer), ...writeKey() }, status: [401, 403, 404, 409],
  })
  assert(peerSave.code)
  assert.equal(durable().terms.length, 0)

  phase = 'T02 explicit save and same-request replay'
  const submitted = await httpWrite(owner.page, terms, '#term-save')
  assert([200, 201].includes(submitted.status), submitted.data.code)
  assert.equal(submitted.request.headers()['x-knowledgeos-reader-actor'], owner.id)
  assert.deepEqual(submitted.request.postDataJSON(), { explanation_id: first.data.explanation_id })
  const exact = submitted.request.headers()['idempotency-key']
  assert(submitted.data.data?.term?.id)
  const savedAt = durable()
  assert.equal(savedAt.terms.length, 1)
  const savedText = JSON.stringify(savedAt.terms[0])
  for (const marker of [asset.version_id, first.spec.source_hash]) assert(savedText.includes(marker))
  const replay = await call(owner, terms, {
    method: 'POST', data: { explanation_id: first.data.explanation_id },
    status: [200, 201], headers: { ...bodyHeaders, ...actorHeader(owner), ...(exact ? { 'idempotency-key': exact } : {}) },
  })
  assert.equal(replay.replayed, true)
  assert.equal(replay.term.id, submitted.data.data.term.id)
  assert.deepEqual(durable(), savedAt)
  const firstList = await savedList(owner, asset)
  assert.equal(firstList.length, 1)
  assert.deepEqual(await savedList(peer, asset), [])
  if (await owner.page.locator('#term-panel').isVisible()) await owner.page.locator('#term-close').click()

  phase = 'T01 same exact word in the array passage'
  await jump(owner.page, sources[1])
  await owner.page.waitForFunction(async endpoint => {
    const response = await fetch(endpoint, { cache: 'no-store' })
    return (await response.json()).data?.position?.ordinal === Number(document.getElementById('number').value)
  }, assetReader(asset) + '-state')
  const beforeClose = await readPosition(owner, asset)
  const second = await explain(owner, asset, sources[1])
  assert.notEqual(first.spec.source_hash, second.spec.source_hash)
  assert.notEqual(first.data.explanation_id, second.data.explanation_id)
  assert.notEqual(first.result.plain, second.result.plain)
  assert.notEqual(first.result.professional, second.result.professional)
  assert.deepEqual(durable(), savedAt)
  facts.model = await proof()
  const usage = await call(owner, prefix + '/ai/status')
  assert.equal(usage.attempts, 2)
  assert.equal(usage.provider, facts.model.provider)
  assert.equal(usage.model, facts.model.model)
  facts.model_usage = { reported_input_tokens: usage.reported_input_tokens, reported_output_tokens: usage.reported_output_tokens,
    known_estimated_usd: usage.known_estimated_usd, unknown_cost_calls: usage.unknown_cost_calls }
  if (facts.model.mode === 'live') facts.T01 = 'PASS'
  ok('same_term_distinct_contexts_and_utf16_anchors', { sources: [first.spec, second.spec], lookup_created_no_term_rows: true })

  phase = 'T02 abandon and restore the actual reader position'
  await owner.page.locator('#term-close').click()
  await owner.page.locator('#term-panel').waitFor({ state: 'hidden' })
  assert.equal(await ordinal(owner.page), sources[1].ordinal)
  assert.deepEqual(await readPosition(owner, asset), beforeClose)
  assert.deepEqual(durable(), savedAt)
  assert.deepEqual(await savedList(owner, asset), firstList)
  const short = blocks.find(row => row.text.trim() === '索引。')
  assert(short, 'fixture must contain a genuinely insufficient block')
  await call(owner, terms + '/explain', {
    method: 'POST', data: { ...first.spec, ordinal: short.ordinal, start: 0, end: selectedTerm.length, source_hash: hash(short.text) },
    headers: { ...bodyHeaders, ...actorHeader(owner) }, status: 422,
  }).then(error => assert.equal(error.code, 'TERM_SOURCE_INSUFFICIENT'))
  await call(owner, terms + '/explain', {
    method: 'POST', data: { ...first.spec, source_hash: 'f'.repeat(64) },
    headers: { ...bodyHeaders, ...actorHeader(owner) }, status: 409,
  })
  const emoji = sources[0].text.indexOf('🧪')
  assert(emoji >= 0)
  await call(owner, terms + '/explain', {
    method: 'POST', data: { ...first.spec, start: emoji + 1, end: emoji + 2 },
    headers: { ...bodyHeaders, ...actorHeader(owner) }, status: 422,
  })
  assert.deepEqual(durable(), savedAt)
  await open(owner, asset)
  await owner.page.locator('#text').filter({ hasText: sources[1].locator }).waitFor()
  assert.equal(await ordinal(owner.page), sources[1].ordinal)
  await owner.page.locator('#terms-open').click()
  await owner.page.locator('#term-list').waitFor()
  assert.match(await owner.page.locator('#term-list').textContent(), /索引/)
  assert.deepEqual(durable(), savedAt)
  await host.stop()
  await start()
  const resumed = await login('owner')
  await open(resumed, asset)
  await resumed.page.locator('#text').filter({ hasText: sources[1].locator }).waitFor()
  assert.equal(await ordinal(resumed.page), sources[1].ordinal)
  assert.deepEqual(await readPosition(resumed, asset), beforeClose)
  assert.deepEqual(await savedList(resumed, asset), firstList)
  assert.deepEqual(durable(), savedAt)

  phase = 'T02 saved fixed source can be opened and still binds the old version'
  const newer = await upload(resumed, Buffer.from('# New version\n\nReplacement without the term.\n', 'utf8'), asset)
  assert.equal(newer.id, asset.id)
  assert.notEqual(newer.version_id, asset.version_id)
  assert.deepEqual(await savedList(resumed, asset), firstList)
  const original = await resumed.context.newPage()
  await original.goto(first.origin)
  const highlight = original.locator('#text mark')
  await highlight.waitFor()
  assert.equal(await highlight.textContent(), selectedTerm)
  assert.equal(await original.locator('#text').textContent(), sources[0].text)
  assert.equal(await ordinal(original), sources[0].ordinal)
  assert.equal(new URL(original.url()).searchParams.get('version'), asset.version_id)
  await capture(original, 'term-fixed-source-return.png')
  assert.deepEqual(durable(), savedAt)
  assert.deepEqual(rows('PRAGMA foreign_key_check'), [])
  assert.deepEqual(externalBrowser, [])
  assert.deepEqual(await proof(), facts.model)
  ok('explicit_save_personal_scope_replay_and_fixed_source_after_restart', { saved_count: 1, discarded_count: 1, resumed_ordinal: beforeClose.ordinal })
  facts.status = 'PASS'
  if (facts.model.mode === 'live') facts.T02 = 'PASS'
} catch (error) {
  facts.status = 'FAIL'
  facts.failure = { phase, message: String(error.message).slice(0, 900) }
  throw error
} finally {
  try { await browser?.close() }
  finally {
    try { await host?.stop() }
    finally {
      writeFileSync(join(out, 'summary.json'), JSON.stringify(facts, null, 2) + '\n')
      console.log(JSON.stringify({ status: facts.status, dir: out }))
    }
  }
}
