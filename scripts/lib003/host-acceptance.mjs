/** Frozen checkout only: node scripts/lib003/host-acceptance.mjs <full SHA> <entry SHA256> [evidence parent] */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const [candidate, hash, parent = join(root, '.cache/lib003-evidence')] = process.argv.slice(2)
assert(process.argv.length <= 5 && /^[a-f0-9]{40}$/.test(candidate) && /^[a-f0-9]{64}$/.test(hash),
  'Expected a full frozen commit and entry SHA-256')
mkdirSync(parent, { recursive: true }); const out = mkdtempSync(join(resolve(parent), 'lib003-'))
const report = { candidate, entry_sha256: hash, node: process.version, status: 'NOT_RUN',
  scope: { T01: 'NOT_RUN', T02: 'NOT_RUN' }, events: [] }
const save = () => writeFileSync(join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n')
const log = (event, facts = {}) => { report.events.push({ event, at: new Date().toISOString(), ...facts }); save() }
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const scope = ['scripts/lib003', 'scripts/lib002', 'scripts/fnd003', 'scripts/fnd004', 'scripts/fnd005']
function frozenScripts() {
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
  assert.equal(git('status', '--porcelain', '--untracked-files=all', '--', ...scope).length, 0)
  const helpers = {}
  for (const path of ['lib003/host-acceptance', 'lib003/acceptance-samples', 'lib002/a07-isolated-host',
    'lib002/a07-extractor-preload', 'lib002/a07-known-pdf', 'fnd003/harness', 'fnd004/harness', 'fnd005/candidate-live-binding',
    'fnd005/candidate-live-guards', 'fnd005/candidate-live-trace']) {
    const file = `scripts/${path}.mjs`, digest = sha(readFileSync(join(root, file)))
    assert.equal(digest, sha(git('show', `${candidate}:${file}`)), `unfrozen ${file}`); helpers[file] = digest
  }
  return helpers
}

const prefix = '/knowledge/v1', imports = prefix + '/imports', assets = prefix + '/assets', library = '/knowledgeos/library'
const version = r => `${assets}/${r.id}/versions/${r.version_id}`
const blocksUrl = (r, from) => `${version(r)}/blocks?from=${from}&limit=5`
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
let host, browser, owner, other, anon, page, samples, dbPath, testId, phase = 'binding'
const errors = []
const step = name => { phase = name; log('step', { test: testId, name }) }
const get = (ctx, path) => ctx.request.get(host.base + path, { maxRedirects: 0 })
async function data(res, expected = 200) {
  assert.equal(res.status(), expected); const body = await res.json(); assert.ok(body.data); return body.data
}
async function denied(res, expected) {
  assert.equal(res.status(), expected); const body = await res.json()
  assert.equal(body.data, undefined); assert.equal(typeof body.code, 'string'); return body.code
}
async function listing(ctx) { return (await data(await get(ctx, assets))).items }
async function signIn(ctx, name, password) {
  const p = await ctx.newPage(); p.on('pageerror', () => errors.push('uncaught page exception'))
  await p.goto(host.base + '/knowledgeos/account'); await p.locator('#login_name').fill(name)
  await p.locator('#login_password').fill(password); await p.locator('#login').click(); await p.locator('#profile').waitFor()
  assert.equal((await data(await get(ctx, prefix + '/me'))).login_name, name); return p
}
async function libraryPage(p) {
  assert.equal((await p.goto(host.base + library)).status(), 200)
  await p.getByText('资料已刷新。', { exact: true }).waitFor()
}
async function image(label, locator) {
  assert.equal(page.url(), host.base + library)
  const file = label + '.png', bytes = await locator.screenshot({ path: join(out, file) }); log('screenshot', { file, sha256: sha(bytes) })
}
const headers = (s, key, prev) => ({ 'x-knowledgeos-request': '1', 'content-type': s.media,
  'x-knowledgeos-filename': encodeURIComponent(s.title), 'idempotency-key': key,
  ...(s.hint && { 'x-knowledgeos-encoding': s.hint }),
  ...(prev && { 'x-knowledgeos-asset-id': prev.id, 'x-knowledgeos-expected-version': String(prev.version) }) })
const post = (ctx, bytes, h) => ctx.request.post(host.base + imports, { data: bytes, headers: h, maxRedirects: 0 })
async function upload(s, prev, reject = false) {
  await libraryPage(page); await page.getByLabel('导入格式').selectOption('text')
  if (prev) await page.getByLabel('导入到').selectOption(prev.id)
  await page.getByLabel('文本文件').setInputFiles({ name: s.title, mimeType: 'application/octet-stream', buffer: s.bytes })
  if (s.hint) await page.getByLabel('文本编码').selectOption(s.hint)
  const [res] = await Promise.all([page.waitForResponse(r => r.url() === host.base + imports && r.request().method() === 'POST'),
    page.getByRole('button', { name: '导入文本', exact: true }).click()])
  const actual = res.request().headers(), key = actual['idempotency-key']; assert.match(key, uuid)
  const h = headers(s, key, prev)
  for (const k of [...Object.keys(h), 'x-knowledgeos-encoding', 'x-knowledgeos-asset-id', 'x-knowledgeos-expected-version']) assert.equal(actual[k], h[k], k)
  if (reject) {
    // Chrome can withhold a rejected POST's body from DevTools. Observe the
    // UI denial, then read the error code through an authenticated HTTP peer.
    assert.equal(res.status(),422)
    const error = page.getByRole('status').filter({ hasText: '编码' }); await error.waitFor()
    const code=await denied(await post(owner,s.bytes,h),422);assert.equal(code,'TEXT_INVALID_ENCODING')
    await image(prev ? 'bad-encoding-append' : 'bad-encoding-new', error); log('rejected', { code, sha256: sha(s.bytes) }); return
  }
  const r = await data(res, 201); assert.match(r.id, uuid); assert.match(r.version_id, uuid)
  assert.equal(r.title, s.title); assert.equal(r.media_type, s.media); assert.equal(r.version, (prev?.version ?? 0) + 1)
  if (prev) { assert.equal(r.id, prev.id); assert.notEqual(r.version_id, prev.version_id) }
  assert.equal(r.sha256, sha(s.bytes)); assert.equal(r.byte_length, s.bytes.length)
  const receipt = page.getByRole('region', { name: '导入回执' }); await receipt.getByText(r.sha256, { exact: true }).waitFor()
  await receipt.getByText('v' + r.version, { exact: true }).waitFor(); assert.equal(await receipt.getByRole('link', { name: '导出 PDF' }).count(), 0)
  log('chrome-import', { receipt: r }); return { s, r, h }
}
async function readback({ s, r }) {
  for (const suffix of ['', '?download=1']) {
    const raw = await get(owner, version(r) + '/original' + suffix); assert.equal(raw.status(), 200)
    assert.deepEqual(await raw.body(), s.bytes); assert.equal(raw.headers()['content-disposition'].split(';')[0], suffix ? 'attachment' : 'inline')
    assert.equal(raw.headers()['content-type'].split(';')[0], suffix ? s.media : 'text/plain')
  }
  const blocks = []; let total
  do {
    const p = await data(await get(owner, blocksUrl(r, blocks.length + 1)))
    assert.equal(p.version_id, r.version_id); assert.equal(p.encoding, s.encoding)
    assert(Number.isSafeInteger(p.total) && p.total > 0 && p.total <= s.source.length)
    total ??= p.total; assert.equal(p.total, total); assert.equal(p.blocks.length, Math.min(5, total - blocks.length))
    blocks.push(...p.blocks)
  } while (blocks.length < total)
  samples.checkBlocks(s, blocks)
  log('version-read', { version_id: r.version_id, raw_sha256: sha(s.bytes), text_sha256: sha(s.source), encoding: s.encoding,
    blocks: total, offsets_and_anchors_sha256: sha(JSON.stringify(blocks.map(({ ordinal, kind, start, end, anchor }) => [ordinal, kind, start, end, anchor]))) })
  return blocks
}
async function inspectUi({ r, s }, blocks, label) {
  await libraryPage(page); const picker = page.getByLabel('文本版本'), list = page.getByRole('list', { name: '文本块' })
  const button = name => page.getByRole('button', { name, exact: true })
  async function show(from, action) {
    const [res] = await Promise.all([page.waitForResponse(rsp => rsp.url() === host.base + blocksUrl(r, from) && rsp.request().method() === 'GET'), action()])
    const expected = blocks.slice(from - 1, from + 4); assert.deepEqual((await data(res)).blocks, expected)
    const rows = list.getByRole('listitem')
    for (const [i, b] of expected.entries()) {
      await rows.nth(i).getByText(new RegExp(`偏移\\D*${b.start}\\D+${b.end}(?!\\d)`)).waitFor()
      if (b.text.trim()) assert((await rows.nth(i).innerText()).includes(b.text.trim().replaceAll('\r\n', '\n')) ||
        (await rows.nth(i).textContent()).includes(b.text.trim()), 'rendered block content')
    }
    assert.equal(await rows.count(), expected.length)
  }
  await show(1, () => picker.selectOption(r.version_id)); await list.getByText(s.literal, { exact: false }).waitFor()
  assert.equal(await list.locator('b').count(), 0); assert.equal(await button('上一页').isEnabled(), false)
  await image(label, list); await show(6, () => button('下一页').click()); await show(1, () => button('上一页').click())
}

// Compare committed metadata without relying on the new migration's internal table names.
function stored() {
  const db = new DatabaseSync(dbPath(host.data), { readOnly: true }); try {
    db.exec('BEGIN'); return Object.fromEntries(['assets', 'asset_versions', 'blobs', 'knowledge_objects'].map(name =>
      [name, db.prepare(`SELECT * FROM ${name} ORDER BY id`).all()]))
  } finally { db.close() }
}

try {
  report.helpers = frozenScripts(); samples = await import('./acceptance-samples.mjs')
  const { isolate } = await import('../lib002/a07-isolated-host.mjs')
  host = await isolate(candidate, hash); report.binding = host.facts
  assert.equal(host.facts.candidate_sha, candidate); assert.equal(host.facts.entry_sha256, hash)
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  const { api, dbPath: databasePath } = await import('../fnd004/harness.mjs'); dbPath = databasePath
  const { entryCookie } = await import('../fnd003/harness.mjs')
  step('boot and create fresh accounts'); const boot = await host.start(); log('loaded-host', { pid: boot.pid, entry_sha256: hash })
  const token = (await entryCookie(boot.entry)).cookie; assert(token)
  const suffix = randomUUID().slice(0, 8), alice = 'alice' + suffix, bob = 'bob' + suffix
  const alicePass = randomUUID(), bobPass = randomUUID()
  for (const [endpoint, cookie, name, password] of [['bootstrap', token, 'admin' + suffix, randomUUID()], ['register', '', alice, alicePass], ['register', '', bob, bobPass]]) {
    assert.equal((await api(host.port, cookie, 'POST', `${prefix}/auth/${endpoint}`, {
      login_name: name, display_name: name, password,
    })).status, 201)
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking'] })
  log('chrome', { version: browser.version() })
  const context = async () => { const c = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1160, height: 900 } }); c.setDefaultTimeout(10000); return c }
  owner = await context(); other = await context(); anon = await context()
  page = await signIn(owner, alice, alicePass); const otherPage = await signIn(other, bob, bobPass)
  assert.deepEqual(await listing(owner), []); assert.deepEqual(await listing(other), [])

  testId = 'T01'; step('Markdown, UTF-16 BOM and explicit GB18030')
  const versions = [], snapshots = new Map()
  for (const sample of [samples.first, samples.utf16, samples.gb]) {
    const input = await upload(sample); versions.push(input); snapshots.set(input.r.version_id, await readback(input))
  }
  const v1 = versions[0]; await inspectUi(v1, snapshots.get(v1.r.version_id), 'v1-reader')
  const { knownPdf } = await import('../lib002/a07-known-pdf.mjs')
  const pdfBytes = knownPdf('control'), pdf = await data(await post(owner, pdfBytes,
    headers({ title: 'control.pdf', media: 'application/pdf' }, randomUUID())), 201)
  assert.equal(pdf.sha256, sha(pdfBytes)); assert(!Object.hasOwn(pdf, 'media_type'), 'legacy PDF receipt shape')
  step('invalid encoding cannot publish a new asset or a version')
  const beforeBad = stored(), listBeforeBad = await listing(owner)
  for (const prev of [undefined, v1.r]) {
    await upload(samples.bad, prev, true); assert.deepEqual(stored(), beforeBad); assert.deepEqual(await listing(owner), listBeforeBad)
  }
  assert.deepEqual(await readback(v1), snapshots.get(v1.r.version_id)); assert.deepEqual(errors, [])
  report.scope.T01 = 'PASS'; save()

  testId = 'T02'; step('append same filename and replay both requests')
  const v2 = await upload(samples.updated, v1.r); versions.push(v2); assert.notEqual(v2.r.sha256, v1.r.sha256)
  snapshots.set(v2.r.version_id, await readback(v2)); assert.deepEqual(await readback(v1), snapshots.get(v1.r.version_id))
  // An intentional update with identical bytes and a fresh key is not a replay.
  const sameFile = await upload(samples.utf16, versions[1].r); versions.push(sameFile)
  const originalBlocks = snapshots.get(versions[1].r.version_id); assert.deepEqual(await readback(sameFile), originalBlocks)
  snapshots.set(sameFile.r.version_id, originalBlocks)
  const persisted = stored(), row = persisted.asset_versions.find(v => v.id === v2.r.version_id)
  assert.equal(row.parent_version_id, v1.r.version_id); assert.equal(persisted.assets.length, 4); assert.equal(persisted.asset_versions.length, 6)
  const expected = [pdf, ...versions.map(v => v.r)].sort((a, b) => a.version_id.localeCompare(b.version_id))
  const checkList = async () => assert.deepEqual((await listing(owner)).sort((a, b) => a.version_id.localeCompare(b.version_id)), expected)
  await checkList()
  for (const v of [v1, v2]) assert.deepEqual(await data(await post(owner, v.s.bytes, v.h)), v.r)
  await denied(await post(owner, v2.s.bytes, v1.h), 409)
  await denied(await post(owner, v2.s.bytes, { ...v2.h, 'idempotency-key': randomUUID() }), 409)
  assert.deepEqual(stored(), persisted); await checkList()
  log('replay-and-conflicts', { replay_http: 200, changed_bytes_http: 409, stale_version_http: 409, versions: persisted.asset_versions.length })

  step('cross-user and anonymous reads and appends')
  await libraryPage(otherPage); await otherPage.getByText('暂无资料', { exact: true }).waitFor()
  assert.deepEqual(await listing(other), []); await denied(await get(anon, assets), 401)
  for (const [ctx, status] of [[other, 404], [anon, 401]]) {
    for (const { r } of versions) for (const path of [blocksUrl(r, 1), version(r) + '/original', version(r) + '/original?download=1']) {
      await denied(await get(ctx, path), status)
    }
    await denied(await post(ctx, v2.s.bytes, headers(v2.s, randomUUID(), v2.r)), status)
    log('access-denied', { actor: ctx === other ? 'other-user' : 'anonymous', status, version_reads: versions.length * 3, append_denied: true })
  }
  assert.deepEqual(stored(), persisted)

  step('restart and reopen old and current versions')
  await host.stop(); const restarted = await host.start(); log('reloaded-host', { pid: restarted.pid, entry_sha256: hash })
  await checkList(); assert.deepEqual(stored(), persisted)
  for (const v of versions) assert.deepEqual(await readback(v), snapshots.get(v.r.version_id))
  await inspectUi(v1, snapshots.get(v1.r.version_id), 'old-version-after-restart')
  await inspectUi(v2, snapshots.get(v2.r.version_id), 'new-version-after-restart')
  assert.deepEqual(errors, []); assert.deepEqual(frozenScripts(), report.helpers)
  await browser.close(); browser = undefined; await host.stop()
  report.scope.T02 = report.status = 'PASS'
} catch (e) {
  process.exitCode = 1; report.status = testId ? 'FAIL' : 'BLOCKED'; if (testId) report.scope[testId] = 'FAIL'
  // Never publish exceptions containing cookies, entry URLs, request headers or database contents.
  report.failure = { phase, type: e.name, line: String(e.stack).match(/(?:host-acceptance|acceptance-samples|a07-isolated-host|candidate-live-binding)\.mjs:\d+/)?.[0] }
} finally {
  try { await browser?.close() } finally { try { await host?.stop() } finally { save(); console.log(report.status, report.failure ?? '', join(out, 'summary.json')) } }
}
