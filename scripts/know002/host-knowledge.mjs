import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [checkout, candidate, entry] = process.argv.slice(2)
assert(checkout && candidate && entry, 'node host-knowledge.mjs <frozen checkout> <candidate SHA> <entry SHA256>')
const root = resolve(checkout)
const load = file => import(pathToFileURL(join(root, file)).href)
const { api, dbPath, entryCookie } = await load('scripts/fnd004/harness.mjs')
const { candidateFacts } = await load('scripts/integrated-case-proof.mjs')
const { isolate } = await load('scripts/lib002/a07-isolated-host.mjs')
const { SCHEMA_VERSION } = await load('packages/knowledgeos-panel/lib/storage.js')
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
const hash = data => createHash('sha256').update(data).digest('hex')
assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
const fingerprint = candidateFacts(root, candidate)
assert.equal(fingerprint.entry_sha256, entry)
const runnerSha = hash(readFileSync(fileURLToPath(import.meta.url)))
assert.equal(runnerSha, hash(git('show', candidate + ':scripts/know002/host-knowledge.mjs')))
const out = mkdtempSync(join(tmpdir(), 'knowledgeos-know002-run-'))
const facts = {
  unit_id: 'KNOW-002', candidate_sha: candidate, ...fingerprint, runner_sha256: runnerSha,
  status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', A11: 'NOT_RUN', A12: 'NOT_RUN',
  checks: [], screens: [], boots: [],
}
const prefix = '/knowledge/v1'
const base = prefix + '/knowledge-items'
const web = '/knowledgeos/knowledge'
const originalQuote = '固定证据标记 K-042-V1'
const assetText = '温控算法以过去五次采样的平均值作基线。' + originalQuote + '。超过阈值时才记录告警。\n'
const noteText = '我建议先记录基线，再比较阈值，最后复查告警。'
const noteTitle = '原创温控复盘'
const assetDefinition = '以稳定采样值形成阈值比较基准。'
const privateSentinel = '受控派生 K-042 需要当前资料授权'
const independentSentinel = '独立原创 I-029 无资料依赖'
const password = randomUUID()
const headers = { 'content-type': 'application/json', 'x-knowledgeos-request': '1' }
const key = () => ({ 'idempotency-key': randomUUID() })
const privateType = 'concept'
const domain = 'software_engineering'
const external = []
let host, browser, phase
const ok = (id, details = {}) => facts.checks.push({ id, status: 'PASS', ...details })

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
  const { id } = (await me.json()).data
  return { id, context, page }
}
async function wire(actor, url, method = 'GET', data, extra = {}) {
  const res = await actor.context.request.fetch(host.base + url,
    { method, data, maxRedirects: 0, headers: { ...headers, 'x-knowledgeos-reader-actor': actor.id, ...extra } })
  const payload = await res.json()
  if (res.status() >= 400) assert.equal(payload.data, undefined)
  return { status: res.status(), data: payload.data, code: payload.code, publicBody: payload }
}
async function call(actor, url, method = 'GET', data, status = 200, extra = {}) {
  const result = await wire(actor, url, method, data, extra)
  assert((Array.isArray(status) ? status : [status]).includes(result.status), method + ' ' + url + ': ' + result.status + ' ' + (result.code ?? ''))
  return result.data
}
const create = (actor, data, receipt = key()) => call(actor, base, 'POST', data, 201, receipt)
const update = (actor, item, data, receipt = key()) => wire(actor, base + '/' + item.id + '/versions', 'POST', data, receipt)
const confirm = (actor, item) => call(actor, base + '/' + item.id + '/confirm', 'POST', { expected_revision: item.version }, [200, 201], key())
const detail = async (actor, id, rev) => (await call(actor, base + '/' + id + (rev ? '/versions/' + rev : ''))).item
const list = async actor => (await call(actor, base)).items
const spec = (title, definition, sources) => ({ kind: privateType, domain, title, definition, sources })
const revise = (item, definition, sources) => ({ expected_revision: item.version, title: item.title, definition, sources })
const reference = id => ({ type: 'citation', id })
const noteReference = note => ({ type: 'note', id: note.id, revision: note.revision })

function rows(sql, ...params) {
  const db = new DatabaseSync(dbPath(host.data), { readOnly: true })
  try { return db.prepare(sql).all(...params).map(row => ({ ...row })) }
  finally { db.close() }
}
function persistent() {
  const names = rows("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'knowledge_%' ORDER BY name")
    .map(row => row.name).filter(name => ['knowledge_items', 'knowledge_versions', 'knowledge_sources', 'knowledge_item_sources', 'knowledge_version_sources', 'knowledge_write_receipts'].includes(name))
  assert(names.includes('knowledge_items') && names.includes('knowledge_versions'))
  return Object.fromEntries(names.map(name => [name, rows('SELECT * FROM ' + name + ' ORDER BY rowid')]))
}
async function upload(owner, text, previous) {
  return call(owner, prefix + '/imports', 'POST', Buffer.from(text), 201, {
    ...key(), 'content-type': 'text/markdown', 'x-knowledgeos-filename': 'know002-evidence.md',
    ...(previous ? { 'x-knowledgeos-asset-id': previous.id, 'x-knowledgeos-expected-version': String(previous.version) } : {}),
  })
}
async function note(owner, title, body, citation) {
  return call(owner, prefix + '/notes', 'POST',
    { actor_id: owner.id, title, body, kind: 'plain', ...(citation ? { add_citation: citation } : {}) }, 201, key())
}
async function invite(owner, peer, asset) {
  const record = await call(owner, prefix + '/invitations', 'POST',
    { actor_id: owner.id, scope: 'object', target_id: asset.id, permission: 'read', days: 2, max_redemptions: 1 }, 201, key())
  await call(peer, prefix + '/invitations/redeem', 'POST', { actor_id: peer.id, token: record.token }, 201)
  return record
}
async function revoke(owner, invitation) {
  const path = prefix + '/invitations/' + invitation.id
  const prior = await call(owner, path)
  await call(owner, path + '/revoke', 'POST', { actor_id: owner.id, expected_revision: prior.revision }, 200, key())
}
const readerUrl = (doc, params = {}) => '/knowledgeos/reader?' + new URLSearchParams({ asset: doc.id, version: doc.version_id, ...params })
const resolveCitation = (actor, id) => call(actor, prefix + '/citations/' + id + '/resolve')
async function cite(owner, doc) {
  await owner.page.bringToFront()
  await owner.page.goto(host.base + readerUrl(doc, { unit: 1 }))
  const text = owner.page.locator('#text')
  await text.filter({ hasText: originalQuote }).waitFor()
  const { source, start, end, quote } = await text.evaluate((el, wanted) => {
    const source = el.textContent
    const start = source.indexOf(wanted), end = start + wanted.length
    const range = document.createRange()
    range.setStart(el.firstChild, start)
    range.setEnd(el.firstChild, end)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    return { source, start, end, quote: selection.toString() }
  }, originalQuote)
  assert.equal(quote, originalQuote)
  const result = await uiWrite(owner, prefix + '/citations', '#cite', [200, 201])
  const original = await resolveCitation(owner, result.id)
  assert.equal(original.asset_id, doc.id)
  assert.equal(original.version_id, doc.version_id)
  assert.equal(original.ordinal, 1)
  assert.equal(original.start, start)
  assert.equal(original.end, end)
  assert.equal(original.source_hash, hash(source))
  assert.equal(original.quote_hash, hash(quote))
  assert.equal(original.quote, originalQuote)
  return original
}
async function open(actor) {
  await actor.page.bringToFront()
  await actor.page.goto(host.base + web)
  await actor.page.locator('#entry-list').waitFor()
}
async function select(actor, title) {
  await actor.page.locator('#entry-list').getByText(title, { exact: true }).click()
  await actor.page.locator('#entry-detail').waitFor()
}
async function uiWrite(actor, path, selector, statuses) {
  const page = actor.page
  const pending = page.waitForResponse(r => r.url() === host.base + path && r.request().method() === 'POST')
  await page.locator(selector).click()
  const response = await pending
  const result = await response.json()
  assert(statuses.includes(response.status()), JSON.stringify({ status: response.status(), code: result.code }))
  const sent = response.request().headers()
  if (path.startsWith(base)) {
    assert.equal(sent['x-knowledgeos-request'], '1')
    assert.equal(sent['x-knowledgeos-reader-actor'], actor.id)
    assert.match(sent['idempotency-key'], /^[0-9a-f-]{36}$/)
  }
  return result.data
}
async function screenshot(page, name) {
  const data = await page.screenshot({ path: join(out, name), fullPage: true, animations: 'disabled' })
  facts.screens.push({ name, sha256: hash(data) })
}
function noPrivateBody(result, markers) {
  const serialized = JSON.stringify(result.publicBody)
  for (const marker of markers) assert(!serialized.includes(marker), 'protected metadata escaped ' + result.status)
}
const httpError = result => [400, 401, 403, 404, 409, 422].includes(result.status)
async function expectHidden(actor, path, method, data, markers, receipt) {
  const result = await wire(actor, path, method, data, receipt)
  assert([403, 404, 409].includes(result.status), method + ' ' + path + ' expected access rejection, got ' + result.status)
  noPrivateBody(result, markers)
  return result
}

try {
  phase = 'real loopback Host, Chrome and separate admin/member sessions'
  host = await isolate(candidate, entry)
  facts.binding = host.facts
  const started = await boot()
  const bootstrap = await entryCookie(started.entry)
  assert.equal((await api(host.port, bootstrap.cookie, 'POST', prefix + '/auth/bootstrap',
    { login_name: 'owner', display_name: 'Independent owner', password })).status, 201)
  assert.equal((await api(host.port, '', 'POST', prefix + '/auth/register',
    { login_name: 'peer', display_name: 'External reader', password })).status, 201)
  assert.equal(rows('PRAGMA user_version')[0].user_version, SCHEMA_VERSION)
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server'] })
  facts.chrome = browser.version()
  const owner = await login('owner')
  const peer = await login('peer')
  const doc = await upload(owner, assetText)
  const source = await cite(owner, doc)
  const privateNote = await note(owner, noteTitle, noteText)
  const invitation = await invite(owner, peer, doc)
  assert.equal((await resolveCitation(peer, source.id)).quote, originalQuote)
  await call(peer, prefix + '/notes/' + privateNote.id, 'GET', undefined, 404)

  phase = 'T01 create asset-derived concept from Chrome'
  const title = '温控基线'
  await open(owner)
  await owner.page.locator('#entry-title').fill(title)
  await owner.page.locator('#entry-definition').fill(assetDefinition)
  await owner.page.locator('#entry-kind').selectOption(privateType)
  await owner.page.locator('#entry-domain').selectOption(domain)
  await owner.page.locator('#entry-source-type').selectOption('citation')
  await owner.page.locator('#entry-source-id').fill(source.id)
  const made = (await uiWrite(owner, base, '#entry-save', [201])).item
  assert.equal(made.title, title)
  assert.equal(made.definition, assetDefinition)
  assert.equal(made.version, 1)
  assert.notEqual(made.confirmation_state, 'confirmed')
  const assetWitness = made.sources[0]
  for (const name of ['id', 'asset_id', 'version_id', 'ordinal', 'start', 'end', 'source_hash', 'quote_hash'])
    assert.equal(assetWitness[name], source[name])
  assert.equal(assetWitness.state, 'fixed')
  assert.equal(assetWitness.category, 'excerpt')
  assert.equal(assetWitness.href, readerUrl(doc, { citation: source.id }))
  assert.deepEqual(await detail(owner, made.id, 1), made)
  const beforeNote = persistent()
  assert(!JSON.stringify(beforeNote).includes(originalQuote))

  phase = 'T01 note-derived entry and cross-actor protection'
  const fromNote = (await create(owner, spec('原创知识复盘', '先观察，再比较，再复查。', [noteReference(privateNote)]))).item
  assert.equal(fromNote.version, 1)
  assert.notEqual(fromNote.confirmation_state, 'confirmed')
  assert.equal(fromNote.sources[0].id, privateNote.id)
  assert.equal(fromNote.sources[0].revision, privateNote.revision)
  assert.match(fromNote.sources[0].content_hash, /^[a-f0-9]{64}$/)
  assert.equal(fromNote.sources[0].href, '/knowledgeos/notes?note=' + privateNote.id)
  const afterNote = persistent()
  assert.equal(afterNote.knowledge_items.length, beforeNote.knowledge_items.length + 1)
  assert.equal(afterNote.knowledge_versions.length, beforeNote.knowledge_versions.length + 1)
  const invalid = await wire(peer, base, 'POST', spec('非法私人笔记使用', '无权正文', [noteReference(privateNote)]), key())
  assert(httpError(invalid), JSON.stringify(invalid))
  await expectHidden(peer, base + '/' + made.id, 'GET', undefined, [title, assetDefinition, source.id])
  await expectHidden(peer, base + '/' + made.id + '/versions/1', 'GET', undefined, [title, assetDefinition, source.id])
  await expectHidden(peer, base + '/' + made.id + '/confirm', 'POST', { expected_revision: 1 }, [title, assetDefinition], key())
  assert.deepEqual(persistent(), afterNote)
  await open(owner)
  await select(owner, title)
  assert.equal(await owner.page.locator('#entry-definition').inputValue(), assetDefinition)
  const checked = (await uiWrite(owner, base + '/' + made.id + '/confirm', '#entry-confirm', [200, 201])).item
  assert.equal(checked.version, 2)
  assert.equal(checked.definition, made.definition)
  assert.equal(checked.confirmation_state, 'confirmed')
  assert.equal(checked.confirmed_by, owner.id)
  assert(checked.confirmed_at)
  assert.deepEqual(checked.sources, made.sources)
  const retiredV1 = { ...made, is_current: false }
  const retiredV2 = { ...checked, is_current: false }
  assert.deepEqual(await detail(owner, made.id, 1), retiredV1)
  assert.deepEqual(await detail(owner, made.id, 2), checked)
  await owner.page.locator('#entry-version').waitFor()
  await screenshot(owner.page, 'knowledge-confirmed-fixed-source.png')
  facts.T01 = 'PASS'
  ok('actual_creation_note_witness_owner_scope_and_explicit_human_confirmation')

  phase = 'T02 competing corrections, exact replay and retained versions'
  const beforeVersions = persistent()
  const firstChange = revise(checked, '第一次纠正：采用稳定采样均值作基准。', [reference(source.id)])
  const secondChange = revise(checked, '第二次纠正：先验证采样再比较阈值。', [reference(source.id)])
  const keys = [key(), key()]
  const outcomes = await Promise.all([firstChange, secondChange].map((change, i) => update(owner, made, change, keys[i])))
  const winner = outcomes.findIndex(result => [200, 201].includes(result.status))
  assert(winner >= 0)
  const rejected = outcomes[1 - winner]
  assert.equal(rejected.status, 409)
  const changed = outcomes[winner].data.item
  assert.equal(changed.version, 3)
  assert.notEqual(changed.confirmation_state, 'confirmed')
  const afterVersions = persistent()
  assert.equal(afterVersions.knowledge_versions.length, beforeVersions.knowledge_versions.length + 1)
  const winningChange = [firstChange, secondChange][winner]
  assert.equal(changed.definition, winningChange.definition)
  const savedReplay = await update(owner, made, winningChange, keys[winner])
  assert.equal(savedReplay.status, 200)
  assert.deepEqual(savedReplay.data.item, changed)
  assert.equal((await update(owner, made, { ...winningChange, definition: 'Changed retry' }, keys[winner])).status, 409)
  const forged = await update(owner, made, { ...winningChange, expected_revision: changed.version, sources: [reference(randomUUID())] })
  assert(httpError(forged))
  assert.deepEqual(persistent(), afterVersions)
  assert.deepEqual(await detail(owner, made.id, 1), retiredV1)
  assert.deepEqual(await detail(owner, made.id, 2), retiredV2)

  phase = 'T02 old citation remains fixed and note revision cannot silently drift'
  const newer = await upload(owner, '这是 V2 正文，没有初始证据标记。\n', doc)
  assert.equal(newer.id, doc.id)
  assert.notEqual(newer.version_id, doc.version_id)
  assert.deepEqual(await detail(owner, made.id, 2), retiredV2)
  const sourceView = await owner.context.newPage()
  await sourceView.goto(host.base + readerUrl(doc, { citation: source.id }))
  await sourceView.locator('#text mark').waitFor()
  assert.equal(await sourceView.locator('#text mark').textContent(), originalQuote)
  assert.equal((await resolveCitation(owner, source.id)).version_id, doc.version_id)
  await sourceView.close()
  const editedNote = await call(owner, prefix + '/notes/' + privateNote.id, 'PATCH',
    { actor_id: owner.id, expected_revision: privateNote.revision, body: '笔记较新版正文 NOTE-V2' })
  assert.equal(editedNote.revision, privateNote.revision + 1)
  const noteWitness = await wire(owner, base + '/' + fromNote.id)
  assert([200, 404, 409].includes(noteWitness.status))
  noPrivateBody(noteWitness, ['笔记较新版正文 NOTE-V2'])
  if (noteWitness.status === 200) {
    const oldNote = noteWitness.data.item.sources[0]
    assert.equal(oldNote.id, privateNote.id)
    assert.equal(oldNote.revision, privateNote.revision)
    assert.equal(oldNote.content_hash, fromNote.sources[0].content_hash)
    assert.equal(oldNote.state, 'changed')
    assert.equal(oldNote.href, null)
  }

  phase = 'T02 same readable citation, independent item and remote material revocation'
  const peerTitle = '有期限的派生知识'
  const creationKey = key()
  const peerInput = spec(peerTitle, privateSentinel, [reference(source.id)])
  const tied = (await create(peer, peerInput, creationKey)).item
  const tiedConfirmed = (await confirm(peer, tied)).item
  const independent = (await create(peer, spec('独立对照经验', independentSentinel, []))).item
  const noteWithCitation = await note(peer, '相关资料笔记', '仅供自己引用的笔记', source.id)
  const noteSentinel = '关联笔记继承原资料的访问边界'
  const indirect = (await create(peer, spec('资料依赖的笔记条目', noteSentinel, [noteReference(noteWithCitation)]))).item
  assert.equal(indirect.sources[0].dependency_count, 1)
  assert.equal(tiedConfirmed.version, 2)
  assert.equal(tiedConfirmed.confirmed_by, peer.id)
  const peerRows = persistent()
  await open(peer)
  await select(peer, peerTitle)
  assert.equal(await peer.page.locator('#entry-definition').inputValue(), privateSentinel)
  await peer.page.evaluate(() => {
    if (document.visibilityState !== 'visible') throw Error('revocation requires an open foreground page')
    window.knowledgeFixtureVisibility = 0
    document.addEventListener('visibilitychange', () => window.knowledgeFixtureVisibility++)
  })
  await revoke(owner, invitation)
  await peer.page.waitForFunction(([body, heading]) => {
    const text = document.body.textContent
    return !text.includes(body) && !text.includes(heading) &&
      !Array.from(document.querySelectorAll('input,textarea')).some(el => el.value.includes(body) || el.value.includes(heading))
  }, [privateSentinel, peerTitle], { timeout: 12000 })
  assert.deepEqual(await peer.page.evaluate(() => [document.visibilityState, window.knowledgeFixtureVisibility]), ['visible', 0])
  const markers = [privateSentinel, peerTitle, originalQuote, source.id]
  const listed = await wire(peer, base)
  assert.equal(listed.status, 200)
  noPrivateBody(listed, [...markers, indirect.title, noteSentinel])
  await expectHidden(peer, base + '/' + tied.id, 'GET', undefined, markers)
  await expectHidden(peer, base + '/' + indirect.id, 'GET', undefined, [noteSentinel, source.id])
  await expectHidden(peer, base + '/' + tied.id + '/versions/1', 'GET', undefined, markers)
  await expectHidden(peer, base + '/' + tied.id + '/confirm', 'POST', { expected_revision: tiedConfirmed.version }, markers, key())
  await expectHidden(peer, base + '/' + tied.id + '/versions', 'POST', revise(tiedConfirmed, 'Stale write', [reference(source.id)]), markers, key())
  await expectHidden(peer, base, 'POST', peerInput, markers, creationKey)
  await expectHidden(owner, base + '/' + independent.id, 'GET', undefined, [independentSentinel])
  await expectHidden(owner, base + '/' + tied.id, 'GET', undefined, markers)
  await call(peer, prefix + '/citations/' + source.id + '/resolve', 'GET', undefined, 404)
  assert.equal((await resolveCitation(owner, source.id)).quote, originalQuote)
  assert.equal((await detail(peer, independent.id)).definition, independentSentinel)
  assert.deepEqual(persistent(), peerRows)
  await screenshot(peer.page, 'knowledge-revoked-foreground.png')

  phase = 'T02 restart and audit'
  await host.stop()
  await boot()
  const restarted = await login('owner')
  await open(restarted)
  await select(restarted, title)
  assert.equal(await restarted.page.locator('#entry-definition').inputValue(), changed.definition)
  assert.deepEqual(await detail(restarted, made.id, 2), retiredV2)
  assert.deepEqual(persistent(), peerRows)
  assert.deepEqual(rows('PRAGMA foreign_key_check'), [])
  assert.deepEqual(external, [])
  ok('historical_witnesses_parallel_revisions_replay_foreground_revocation_and_restart')
  facts.T02 = facts.status = 'PASS'
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
