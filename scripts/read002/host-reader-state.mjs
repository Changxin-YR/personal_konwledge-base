// Author-run harness: isolated DSH, Chrome and SQLite; synthetic originals only.
// Usage: node scripts/read002/host-reader-state.mjs <commit> <entry-sha256> [evidence-parent]
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash, randomUUID} from 'node:crypto'
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {api, dbPath, entryCookie, login, sql} from '../fnd004/harness.mjs'
import {isolate, until} from '../lib002/a07-isolated-host.mjs'
import {knownPdf, textFor} from '../lib002/a07-known-pdf.mjs'
import {fixture as pdfFixture} from '../lib002/pdf-fixtures.mjs'
import {wordFixture} from '../read001/word-fixture.mjs'

const [candidate, entry, parent = tmpdir()] = process.argv.slice(2)
const root = fileURLToPath(new URL('../../', import.meta.url))
const self = 'scripts/read002/host-reader-state.mjs'
const pkg = 'packages/knowledgeos-panel'
const prior = 'fdac3b02fc5ac42eabef72374aee9b7050c942e3'
const sha = value => createHash('sha256').update(value).digest('hex')
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], {cwd: root})
assert.match(candidate, /^[a-f0-9]{40}$/)
assert.match(entry, /^[a-f0-9]{64}$/)
assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
const committed = git('ls-tree', candidate, '--', self).length > 0
const runnerHash = sha(readFileSync(join(root, self)))
if (committed) assert.equal(runnerHash, sha(git('show', `${candidate}:${self}`)))
const helpers = Object.fromEntries([
  'scripts/lib002/pdf-fixtures.mjs', 'scripts/read001/word-fixture.mjs',
].map(path => {
  const hash = sha(readFileSync(join(root, path)))
  assert.equal(hash, sha(git('show', `${candidate}:${path}`)), path)
  return [path, hash]
}))
mkdirSync(resolve(parent), {recursive: true})
const out = mkdtempSync(join(resolve(parent), 'read002-reader-state-'))
const report = {candidate_sha: candidate, entry_sha256: entry, runner_sha256: runnerHash,
  runner_committed: committed, independent_acceptance: false, helpers, status: 'NOT_RUN', cases: [], screens: [], fixtures: [], boots: []}
const prefix = '/knowledge/v1', password = randomUUID()
const base = doc => `/assets/${doc.id}/versions/${doc.version_id}`
const statePath = doc => `${base(doc)}/reader-state`
const marksPath = doc => `${base(doc)}/reader-bookmarks`
const outlinePath = doc => `${base(doc)}/reader-outline`
const invalidHash = '0'.repeat(64)
let host, browser, db, phase = 'binding', activePage, owner, member, admin

async function request(who, method, path, expected, payload, headers = {}, privateText = []) {
  const binary = Buffer.isBuffer(payload)
  const res = await fetch(host.base + prefix + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: {cookie: who.cookie, ...(method === 'GET' ? {} : {
      'x-knowledgeos-request': '1', 'x-knowledgeos-reader-actor': who.id,
    }), ...(payload !== undefined && !binary ? {'content-type': 'application/json'} : {}), ...headers},
    body: payload === undefined || binary ? payload : JSON.stringify(payload),
  })
  const status = res.status, raw = await res.text()
  assert([expected].flat().includes(status), `${method} ${path}: HTTP ${status}, expected ${expected}`)
  if (status === 204) { assert.equal(raw, ''); return }
  const json = JSON.parse(raw)
  if (status >= 400) {
    assert(!Object.hasOwn(json, 'data'), 'denial must not return a data payload')
    for (const secret of privateText) assert(!raw.includes(secret), 'denial disclosed fixture content')
    return status
  }
  assert(Object.hasOwn(json, 'data'), `${method} ${path}: missing data envelope`)
  return json.data
}

async function signIn(name) {
  const session = await login(host.port, name, password)
  assert.equal(session.response.status, 200)
  assert(session.cookie)
  const {id} = await request({cookie: session.cookie}, 'GET', '/me', 200)
  assert(id)
  return {name, id, cookie: session.cookie}
}

async function boot(initial = false) {
  const run = await host.start()
  assert(!report.boots.includes(run.pid), 'expected a new Host process')
  report.boots.push(run.pid)
  if (initial) {
    const {cookie} = await entryCookie(run.entry)
    for (const [endpoint, credential, name] of [['bootstrap', cookie, 'setup'], ['register', '', 'owner'], ['register', '', 'reader']]) {
      assert.equal((await api(host.port, credential, 'POST', `${prefix}/auth/${endpoint}`,
        {login_name: name, display_name: name, password})).status, 201, endpoint)
    }
  }
  ;[owner, member, admin] = await Promise.all(['owner', 'reader', 'setup'].map(signIn))
}

async function context(who) {
  const ctx = await browser.newContext({viewport: {width: 1280, height: 1000}, serviceWorkers: 'block'})
  ctx.setDefaultTimeout(12000)
  const p = await ctx.newPage()
  try {
    assert.equal((await ctx.cookies()).length, 0, 'expected a fresh browser context')
    await p.goto(host.base + '/knowledgeos/account')
    await p.locator('#login_name').fill(who.name)
    await p.locator('#login_password').fill(password)
    await p.locator('#login').click()
    await p.locator('#profile').waitFor()
    const me = await ctx.request.get(host.base + prefix + '/me')
    assert.equal(me.status(), 200)
    assert.equal((await me.json()).data.id, who.id)
    return ctx
  } catch (error) { await ctx.close(); throw error }
  finally { if (!p.isClosed()) await p.close() }
}

async function upload(name, type, bytes, previous) {
  const doc = await request(owner, 'POST', '/imports', 201, bytes, {
    'content-type': type, 'idempotency-key': randomUUID(), 'x-knowledgeos-filename': name,
    ...(previous ? {'x-knowledgeos-asset-id': previous.id, 'x-knowledgeos-expected-version': '1'} : {}),
  })
  assert.equal(doc.sha256, sha(bytes))
  if (previous) { assert.equal(doc.id, previous.id); assert.notEqual(doc.version_id, previous.version_id) }
  report.fixtures.push({name, sha256: doc.sha256, version_id: doc.version_id})
  return doc
}

async function parse(doc, pages) {
  await request(owner, 'POST', `/assets/${doc.id}/process`, 202, {version_id: doc.version_id})
  await until(() => {
    const rows = sql(db, 'SELECT state FROM pdf_pages WHERE version_id=?', [doc.version_id])
    assert(!rows.some(row => row.state === 'failed'), 'PDF fixture parse failed')
    return rows.length === pages && rows.every(row => ['ready', 'review'].includes(row.state))
  }, 'PDF fixture ready', 60000)
}

async function reader(who, doc, ordinal, conversion) {
  const q = new URLSearchParams({unit: ordinal, ...(conversion ? {conversion} : {})})
  const page = await request(who, 'GET', `${base(doc)}/reader?${q}`, 200)
  assert.equal(page.ordinal, ordinal)
  assert(['ready', 'review'].includes(page.state), `unit ${ordinal} is not readable`)
  assert.match(page.position_hash, /^[a-f0-9]{64}$/)
  if (conversion) assert.equal(page.conversion_id, conversion)
  return page
}

async function state(who, doc) {
  const data = await request(who, 'GET', statePath(doc), 200)
  assert.equal(data.actor_id, who.id)
  assert(Number.isSafeInteger(data.revision) && data.revision >= 0, 'invalid position revision')
  assert('position' in data && Array.isArray(data.bookmarks))
  return data
}

async function outline(who, doc, expected) {
  const data = await request(who, 'GET', outlinePath(doc), 200)
  assert.equal(data.actor_id, who.id)
  assert.deepEqual(data.items.map(({ordinal, title}) => ({ordinal, title})), expected)
}

const target = page => ({ordinal: page.ordinal, source_hash: page.position_hash,
  ...(page.conversion_id ? {conversion_id: page.conversion_id} : {})})
function assertTarget(actual, page, label) {
  assert(actual, `${label}: missing target`)
  assert.deepEqual([actual.ordinal, actual.source_hash, actual.conversion_id ?? null],
    [page.ordinal, page.position_hash, page.conversion_id ?? null], label)
}

function view(p, doc, page) {
  return p.waitForFunction(({version, ordinal, text, image}) => {
    const $ = selector => document.querySelector(selector)
    const original = $('#original img'), body = $('#text')
    const visible = e => !!e?.getClientRects().length
    return $('#number')?.value === String(ordinal) && $('#version')?.textContent.includes(version) &&
      ((image && visible(original) && original.naturalWidth > 0) || (visible(body) && body.textContent === text))
  }, {version: doc.version_id, ordinal: page.ordinal, text: page.text, image: Boolean(page.image)})
}

async function open(ctx, doc, page, params = {}) {
  const p = activePage = await ctx.newPage(), reads = [], writes = []
  const path = prefix + base(doc)
  p.on('request', req => {
    const url = new URL(req.url())
    if (req.method() === 'GET' && url.pathname === `${path}/reader`) {
      reads.push({ordinal: Number(url.searchParams.get('unit')), conversion: url.searchParams.get('conversion')})
    }
    if (req.method() === 'PUT' && url.pathname === `${path}/reader-state`) writes.push(req)
  })
  const q = new URLSearchParams({asset: doc.id, version: doc.version_id, ...params})
  await p.goto(`${host.base}/knowledgeos/reader?${q}`)
  await view(p, doc, page)
  await p.locator('#bookmark-add:not([disabled])').waitFor()
  assert.equal(reads[0]?.ordinal, page.ordinal, 'reader fetched a different unit before the intended target')
  if (page.conversion_id && params.conversion) assert.equal(reads[0]?.conversion, page.conversion_id)
  return {p, reads, writes}
}

const responseFor = (p, method, path) => p.waitForResponse(r =>
  r.request().method() === method && new URL(r.url()).pathname === prefix + path)
function verifyWrite(req, who, payload) {
  const headers = req.headers()
  assert.equal(headers['x-knowledgeos-request'], '1', 'missing write/CSRF header')
  assert.equal(headers['x-knowledgeos-reader-actor'], who.id, 'missing reader actor header')
  if (payload !== undefined) {
    const {conversion_id, ...other} = req.postDataJSON()
    assert.deepEqual({...other, ...(conversion_id != null ? {conversion_id} : {})}, payload)
  }
}

async function action(p, method, path, perform) {
  const [response] = await Promise.all([responseFor(p, method, path), perform()])
  return response
}

async function jump(p, ordinal) {
  await p.locator('#number').fill(String(ordinal))
  await p.locator('#number').press('Enter')
}

async function navigate(p, who, doc, page, perform = () => jump(p, page.ordinal)) {
  const before = await state(who, doc)
  const save = await action(p, 'PUT', statePath(doc), perform)
  verifyWrite(save.request(), who, {...target(page), expected_revision: before.revision})
  assert([200, 204].includes(save.status()), `position save HTTP ${save.status()}`)
  await view(p, doc, page)
  await p.locator('#bookmark-add:not([disabled])').waitFor()
  const after = await state(who, doc)
  assert.equal(after.revision, before.revision + 1)
  assertTarget(after.position, page, 'saved position via HTTP')
  return after
}

const bookmarkControl = (p, title) => p.locator('#bookmarks').getByText(title, {exact: true})
async function addBookmark(p, who, doc, page, title) {
  await p.locator('#bookmark-title').fill(title)
  const save = await action(p, 'POST', marksPath(doc), () => p.locator('#bookmark-add').click())
  assert([200, 201].includes(save.status()), `bookmark creation HTTP ${save.status()}`)
  verifyWrite(save.request(), who, {...target(page), title})
  const bookmark = (await state(who, doc)).bookmarks.find(mark => mark.title === title)
  assert.match(bookmark?.id ?? '', /^[a-f0-9-]{36}$/i)
  assertTarget(bookmark, page, 'created bookmark via HTTP')
  await bookmarkControl(p, title).waitFor()
  return bookmark
}

async function deleteBookmark(p, who, doc, bookmark) {
  const label = bookmarkControl(p, bookmark.title), path = `${marksPath(doc)}/${bookmark.id}`
  const row = p.locator('#bookmarks li').filter({has: p.getByRole('button', {name: bookmark.title, exact: true})})
  const res = await action(p, 'DELETE', path, () => row.getByRole('button', {name: /\u5220\u9664|delete/i}).click())
  assert([200, 204].includes(res.status()), `bookmark deletion HTTP ${res.status()}`)
  verifyWrite(res.request(), who)
  await label.waitFor({state: 'detached'})
  assert(!(await state(who, doc)).bookmarks.some(mark => mark.id === bookmark.id))
}

async function snap(p, label) {
  const file = `${label}.png`
  report.screens.push({file, sha256: sha(await p.screenshot({path: join(out, file)}))})
}

function persisted(doc) {
  return Object.fromEntries(['reading_positions', 'reading_bookmarks'].map(table => [table,
    sql(db, `SELECT * FROM ${table} WHERE version_id=? ORDER BY rowid`, [doc.version_id])]))
}

async function assertPersisted(who, doc, page) {
  const current = await state(who, doc)
  const {reading_positions: positions, reading_bookmarks: marks} = persisted(doc)
  const row = positions.find(r => r.user_id === who.id)
  assertTarget(current.position, page, 'HTTP position')
  assertTarget(row, page, 'SQLite position')
  assert.equal(row.revision, current.revision)
  assert.deepEqual(marks.filter(r => r.user_id === who.id).map(r => [r.id, r.title, r.ordinal, r.source_hash, r.conversion_id]),
    current.bookmarks.map(r => [r.id, r.title, r.ordinal, r.source_hash, r.conversion_id ?? null]))
  return current
}

async function restart() { await host.stop(); await boot() }

async function citation(doc, page) {
  assert(page.text.length > 5)
  const made = await request(owner, 'POST', '/citations', 201, {
    asset_id: doc.id, version_id: doc.version_id, ordinal: page.ordinal,
    start: 0, end: 5, source_hash: page.anchor,
  }, {'idempotency-key': randomUUID()})
  assert.equal((await request(owner, 'GET', `/citations/${made.id}/resolve`, 200)).quote, page.text.slice(0, 5))
  return made.id
}

async function mode(p, doc, page) {
  const status = await state(owner, doc)
  await p.locator('#structured').click()
  await p.locator('#text').waitFor({state: 'visible'})
  assert.equal(await p.locator('#text').textContent(), page.text)
  await p.locator('#paper').click()
  await p.locator('#original img').waitFor({state: 'visible'})
  await view(p, doc, page)
  assert.deepEqual(await state(owner, doc), status, 'switching mode changed saved state')
}

async function resumeCases() {
  const pdf = await upload('reader-outline.pdf', 'application/pdf', knownPdf('readstate'))
  const plain = await upload('reader-no-outline.pdf', 'application/pdf', pdfFixture({pages: ['Chapter 1', 'Chapter 2']}))
  const md = await upload('reader-outline.md', 'text/markdown', Buffer.from(
    '# Chapter Alpha\nAlpha passage\n```md\n# Not a chapter\n```\n## Chapter Beta\nBeta passage\n'))
  const multiline = await upload('multiline.md', 'text/markdown', Buffer.from('North\nand South\n===============\n\nWest\nand East\n-------------\n\n# Control\n'))
  await parse(plain, 2)
  const specs = [
    {doc: pdf, items: [{ordinal: 1, title: 'First unit'}, {ordinal: 4, title: 'Second unit'}], saved: 6, explicit: 2, title: 'PDF chapter bookmark'},
    {doc: md, items: [{ordinal: 1, title: 'Chapter Alpha'}, {ordinal: 4, title: 'Chapter Beta'}], saved: 5, explicit: 2, title: 'Markdown chapter bookmark'},
  ]
  let ctx = await context(owner)
  try {
    const pending = await ctx.newPage()
    await pending.goto(`${host.base}/knowledgeos/reader?asset=${pdf.id}&version=${pdf.version_id}`)
    const unavailable = pending.locator('#toc').getByRole('button', {name:'Second unit', exact:true})
    await unavailable.waitFor()
    assert(await unavailable.isDisabled(), 'an unprocessed PDF outline entry cannot offer a no-op jump')
    assert.match(await pending.locator('#toc').innerText(), /解析/)
    await snap(pending, 'outline-awaiting-processing')
    await pending.close()
    await parse(pdf, 6)
    const multilineItems = [{ordinal:1,title:'North and South'},{ordinal:3,title:'West and East'},{ordinal:5,title:'Control'}]
    await outline(owner, multiline, multilineItems)
    const headingPage = await open(ctx, multiline, await reader(owner, multiline, 1))
    await headingPage.p.locator('#toc').getByRole('button',{name:'West and East',exact:true}).waitFor()
    await headingPage.p.close()
    await outline(owner, plain, [])
    const noOutline = await open(ctx, plain, await reader(owner, plain, 2), {unit: 2})
    await noOutline.p.locator('#toc li').first().waitFor()
    assert.equal(await noOutline.p.locator('#toc button').count(), 0, 'PDF page text is not a table of contents')
    await noOutline.p.close()
    for (const spec of specs) {
      const {doc, items, saved, explicit, title} = spec
      await outline(owner, doc, items)
      spec.first = await reader(owner, doc, 1)
      spec.chapter = await reader(owner, doc, items[1].ordinal)
      spec.last = await reader(owner, doc, saved)
      spec.explicitPage = await reader(owner, doc, explicit)
      spec.citationId = await citation(doc, spec.first)
      const {p} = await open(ctx, doc, spec.first)
      const buttons = p.locator('#toc button')
      await until(async () => await buttons.count() >= items.length, 'table of contents buttons')
      assert.deepEqual((await buttons.allTextContents()).map(s => s.trim()), items.map(x => x.title))
      await navigate(p, owner, doc, spec.chapter, () => p.locator('#toc').getByRole('button', {name: items[1].title, exact: true}).click())
      spec.bookmark = await addBookmark(p, owner, doc, spec.chapter, title)
      await snap(p, doc === pdf ? 'pdf-toc-and-bookmark' : 'markdown-toc-and-bookmark')
      await navigate(p, owner, doc, spec.last)
      if (doc === pdf) await mode(p, doc, spec.last)
      spec.persisted = await assertPersisted(owner, doc, spec.last)
      await p.close()
    }
    await ctx.close()
    await restart()
    ctx = await context(owner)
    for (const {doc, first, last, chapter, explicitPage, citationId, bookmark, persisted: saved} of specs) {
      assert.deepEqual(await assertPersisted(owner, doc, last), saved, 'restart changed saved state')
      const resumed = await open(ctx, doc, last)
      assert.deepEqual([...new URL(resumed.p.url()).searchParams.keys()].sort(), ['asset', 'version'])
      await bookmarkControl(resumed.p, bookmark.title).waitFor()
      await snap(resumed.p, doc === pdf ? 'pdf-resumed' : 'markdown-resumed')
      await resumed.p.close()
      for (const [params, page] of [[{unit: explicitPage.ordinal}, explicitPage], [{citation: citationId}, first]]) {
        const explicit = await open(ctx, doc, page, params)
        if (params.citation) {
          if (page.image) {
            // Text mode reveals the citation mark even if glyph geometry is not available.
            await explicit.p.locator('#structured').click()
          }
          await explicit.p.locator('#text mark').waitFor()
        }
        assert.equal(explicit.writes.length, 0, 'initial explicit link autosaved')
        assert(explicit.reads.every(read => read.ordinal === page.ordinal), 'resume overrode explicit target')
        assert.deepEqual(await state(owner, doc), saved)
        await explicit.p.close()
      }
      const {p} = await open(ctx, doc, last)
      await bookmarkControl(p, bookmark.title).click()
      await view(p, doc, chapter)
      await deleteBookmark(p, owner, doc, bookmark)
      assert(!persisted(doc).reading_bookmarks.some(r => r.id === bookmark.id))
      await p.close()
    }
    // Leave a prior-version bookmark intact for the new-version check.
    const old = specs[1], beforeUpdate = await open(ctx, old.doc, old.chapter, {unit: old.chapter.ordinal})
    const kept = await addBookmark(beforeUpdate.p, owner, old.doc, old.chapter, 'Keep old version bookmark')
    await beforeUpdate.p.close()
    const newer = await upload('reader-outline.md', 'text/markdown', Buffer.from('# Replacement chapter\nFresh body\n'), old.doc)
    assert.equal((await state(owner, newer)).position, null)
    assert.deepEqual((await state(owner, newer)).bookmarks, [])
    const replacement = await open(ctx, newer, await reader(owner, newer, 1))
    assert.equal(await bookmarkControl(replacement.p, kept.title).count(), 0)
    await replacement.p.close()
    const oldLink = await open(ctx, old.doc, old.first, {unit: old.first.ordinal})
    await bookmarkControl(oldLink.p, kept.title).click()
    await view(oldLink.p, old.doc, old.chapter)
    await oldLink.p.close()
    await ctx.close()
    await restart()
    ctx = await context(owner)
    for (const spec of specs) {
      const after = await state(owner, spec.doc)
      assert(!after.bookmarks.some(b => b.id === spec.bookmark.id))
      const reopened = await open(ctx, spec.doc, await reader(owner, spec.doc, after.position.ordinal))
      assert.equal(await bookmarkControl(reopened.p, spec.title).count(), 0)
      await reopened.p.close()
    }
    return {asset_versions: specs.map(s => s.doc.version_id), new_version: newer.version_id, bookmark_deletion_restarts: true}
  } finally { await ctx.close() }
}

async function convert(doc) {
  const {id} = await request(owner, 'POST', `${base(doc)}/office/start`, 202, {}, {'idempotency-key': randomUUID()})
  await until(() => {
    const row = sql(db, 'SELECT state FROM office_conversions WHERE id=?', [id])[0]
    assert(row && !['failed', 'cancelled', 'superseded'].includes(row.state), 'Office conversion did not complete')
    return row.state === 'ready'
  }, 'real Office conversion', 180000)
  return id
}

async function renditionCase() {
  const long = 'STARTPAGE ' + 'a line of material for a natural page break '.repeat(155) + 'ENDPAGE'
  const doc = await upload('reader-rendition.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    wordFixture(['First paragraph', 'Second paragraph', 'Third paragraph', long, 'Final paragraph']))
  const oldId = await convert(doc), first = await reader(owner, doc, 1, oldId)
  assert(first.total > 1, 'Word fixture must span multiple pages')
  const last = await reader(owner, doc, first.total, oldId), ctx = await context(owner)
  try {
    const {p} = await open(ctx, doc, first, {unit: 1, conversion: oldId})
    await navigate(p, owner, doc, last)
    const mark = await addBookmark(p, owner, doc, last, 'Fixed Word rendition bookmark')
    const saved = await assertPersisted(owner, doc, last)
    await p.close()
    const newId = await convert(doc), current = await reader(owner, doc, 1)
    assert.notEqual(newId, oldId)
    assert.equal(current.conversion_id, newId)
    const invalidated = await state(owner, doc)
    assert.equal(invalidated.position, null, 'stale rendition must not be offered as a resume point')
    assert.equal(invalidated.revision, saved.revision)
    assert.deepEqual(invalidated.bookmarks, [mark])
    assertTarget(persisted(doc).reading_positions[0], last, 'stale position must not be rewritten')
    const fresh = await open(ctx, doc, current)
    assert(fresh.reads.every(read => read.ordinal === 1 && read.conversion !== oldId))
    await bookmarkControl(fresh.p, mark.title).click()
    await view(fresh.p, doc, last)
    await until(() => fresh.reads.some(read => read.ordinal === last.ordinal && read.conversion === oldId), 'fixed bookmark rendition request')
    const before = await state(owner, doc), snapshot = persisted(doc)
    await request(owner, 'PUT', statePath(doc), [409, 422],
      {...target(current), source_hash: invalidHash, expected_revision: before.revision})
    assert.deepEqual(await state(owner, doc), before)
    assert.deepEqual(persisted(doc), snapshot)
    return {version: doc.version_id, old_conversion: oldId, new_conversion: newId}
  } finally { await ctx.close() }
}

async function aclCase() {
  const doc = await upload('reader-acl.pdf', 'application/pdf', knownPdf('readacl'))
  const project = await request(owner, 'POST', '/projects', 201, {name: 'Reader ACL fixture'})
  for (const who of [member, admin]) {
    await request(owner, 'POST', `/projects/${project.id}/memberships`, 204, {user_id: who.id, role: 'member'})
  }
  const object = await request(owner, 'POST', '/objects', 201, {
    scope: 'project', project_id: project.id, object_type: 'asset', title: 'Shared PDF', body: 'Synthetic',
  })
  // READ-001's project asset fixture. Only seed the source this way, never personal reader state.
  const conn = new DatabaseSync(db)
  try {
    conn.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE')
    conn.prepare('INSERT INTO assets VALUES(?)').run(object.id)
    assert.equal(conn.prepare('UPDATE asset_versions SET asset_id=? WHERE id=? AND asset_id=?')
      .run(object.id, doc.version_id, doc.id).changes, 1)
    conn.exec('COMMIT')
  } finally { conn.close() }
  const shared = {...doc, id: object.id}, first = 1
  await parse(shared, 6)
  for (const path of [statePath(shared), outlinePath(shared), `${base(shared)}/reader?unit=1`]) {
    await request(member, 'GET', path, [403, 404])
  }
  const grants = []
  for (const who of [member, admin]) {
    grants.push(await request(owner, 'POST', '/grants', 201, {
      object_id: shared.id, subject_type: 'user', subject_id: who.id, action: 'read',
    }))
  }
  assert.equal((await state(member, shared)).position, null)
  const starting = await reader(owner, shared, first), ownerPage = await reader(owner, shared, 2), memberPage = await reader(member, shared, 4)
  const contexts = []
  try {
    const ownerCtx = await context(owner); contexts.push(ownerCtx)
    const owned = await open(ownerCtx, shared, starting)
    await navigate(owned.p, owner, shared, ownerPage)
    const ownerMark = await addBookmark(owned.p, owner, shared, ownerPage, 'Owner personal witness')
    await owned.p.close()

    const memberCtx = await context(member); contexts.push(memberCtx)
    const reading = await open(memberCtx, shared, starting)
    assert.equal(await bookmarkControl(reading.p, ownerMark.title).count(), 0)
    await navigate(reading.p, member, shared, memberPage)
    const memberMark = await addBookmark(reading.p, member, shared, memberPage, 'Member personal witness')
    const own = await assertPersisted(owner, shared, ownerPage), read = await assertPersisted(member, shared, memberPage)
    assert.deepEqual(own.bookmarks, [ownerMark]); assert.deepEqual(read.bookmarks, [memberMark])
    const privileged = await state(admin, shared)
    assert.equal(privileged.position, null); assert.deepEqual(privileged.bookmarks, [])
    const rows = persisted(shared)
    assert.equal(rows.reading_positions.length, 2); assert.equal(rows.reading_bookmarks.length, 2)
    const secrets = [ownerMark.title, memberMark.title, textFor('readacl', 4)]
    for (const [who, mark] of [[owner, memberMark], [member, ownerMark], [admin, ownerMark]]) {
      const path = `${marksPath(shared)}/${mark.id}`
      await request(who, 'DELETE', path, [403, 404], undefined, {}, secrets)
    }
    const put = {...target(memberPage), expected_revision: read.revision}
    await request(member, 'PUT', statePath(shared), [403, 409], put, {'x-knowledgeos-reader-actor': owner.id}, secrets)
    await request(member, 'PUT', statePath(shared), [400, 403], put, {'x-knowledgeos-request': ''}, secrets)
    assert.deepEqual(persisted(shared), rows)

    const p = reading.p
    await p.bringToFront()
    await bookmarkControl(p, memberMark.title).waitFor()
    await p.locator('#toc button').first().waitFor()
    await view(p, shared, memberPage)
    assert(await p.evaluate(() => !document.hidden && document.hasFocus()), 'revocation tab must stay foreground')
    await snap(p, 'before-revocation')
    const revokedAt = performance.now()
    await request(owner, 'POST', '/grants/revoke', 204, {grant_id: grants[0].id})
    await p.waitForFunction(() => {
      const $ = id => document.getElementById(id)
      return !document.hidden && document.hasFocus() && !$('toc')?.childElementCount &&
        !$('bookmarks')?.childElementCount && !$('text')?.textContent && !$('original')?.childElementCount
    }, null, {timeout: 8000})
    const clearedMs = Math.round(performance.now() - revokedAt)
    await snap(p, 'revoked-reader-cleared')
    for (const path of [outlinePath(shared), statePath(shared), `${base(shared)}/reader?unit=4`]) {
      await request(member, 'GET', path, [403, 404], undefined, {}, secrets)
    }
    await request(member, 'PUT', statePath(shared), [403, 404], put, {}, secrets)
    await request(member, 'POST', marksPath(shared), [403, 404], {...target(memberPage), title: 'Revoked retry'}, {}, secrets)
    await request(member, 'DELETE', `${marksPath(shared)}/${memberMark.id}`, [403, 404], undefined, {}, secrets)
    assert.deepEqual(await state(owner, shared), own)
    assert.deepEqual(persisted(shared), rows, 'denied or revoked operations changed personal rows')
    return {version: shared.version_id, revoked_tab_cleared_ms: clearedMs}
  } finally { await Promise.all(contexts.map(ctx => ctx.close())) }
}

async function raceCase() {
  const doc = await upload('reader-race.md', 'text/markdown', Buffer.from('# One\n# Two\n# Three\n# Four\n'))
  const pages = await Promise.all([1, 2, 3, 4].map(n => reader(owner, doc, n)))
  const contexts = []
  const url = host.base + prefix + statePath(doc)
  try {
    const a = await context(owner); contexts.push(a)
    const b = await context(owner); contexts.push(b)
    const {p: p1} = await open(a, doc, pages[0]), {p: p2} = await open(b, doc, pages[0])
    const initial = await state(owner, doc)
    let held, staleStatus, handlerError, release
    const gate = new Promise(ok => { release = ok })
    const intercept = async route => {
      if (route.request().method() !== 'PUT' || held) return route.continue()
      held = route.request()
      try {
        await gate
        const response = await route.fetch({timeout: 10000, maxRetries: 0})
        staleStatus = response.status()
        assert(!Object.hasOwn(await response.json(), 'data'))
        await route.fulfill({response})
      } catch (e) { handlerError = e; await route.abort().catch(() => {}) }
    }
    await p1.route(url, intercept)
    let newer
    try {
      await p1.bringToFront()
      await jump(p1, 2)
      await until(() => held, 'stale browser PUT held before Host')
      verifyWrite(held, owner, {...target(pages[1]), expected_revision: initial.revision})
      assert.deepEqual(await state(owner, doc), initial, 'held request already reached Host')
      await p2.bringToFront()
      newer = await navigate(p2, owner, doc, pages[2])
      release()
      await until(() => staleStatus !== undefined || handlerError, 'stale Host reply')
      if (handlerError) throw handlerError
      assert.equal(staleStatus, 409)
      assert.deepEqual(await assertPersisted(owner, doc, pages[2]), newer)
    } finally { release(); await p1.unrouteAll({behavior: 'wait'}) }

    await p1.bringToFront()
    const refresh = await action(p1, 'GET', statePath(doc), () => p1.locator('#refresh').click())
    assert.equal(refresh.status(), 200)
    assert.equal((await refresh.json()).data.revision, newer.revision)
    await p1.locator('#bookmark-add:not([disabled])').waitFor()
    const latest = await navigate(p1, owner, doc, pages[3])
    const savedRows = persisted(doc)
    const readingStatus = p1.locator('#reading-status')
    await readingStatus.evaluate(e => {
      window.__readerStateNotices = []
      new MutationObserver(() => window.__readerStateNotices.push(e.textContent.trim()))
        .observe(e, {childList: true, subtree: true, characterData: true})
    })
    let hits = 0
    const fail = route => {
      if (route.request().method() !== 'PUT') return route.continue()
      hits++
      return route.fulfill({status: 503, json: {code: 'TEST_TRANSIENT_SAVE_FAILURE'}})
    }
    await p1.route(url, fail)
    try {
      const failed = await action(p1, 'PUT', statePath(doc), () => jump(p1, 2))
      assert.equal(failed.status(), 503)
      verifyWrite(failed.request(), owner, {...target(pages[1]), expected_revision: latest.revision})
      await p1.waitForFunction(() => (window.__readerStateNotices ?? []).some(text =>
        /fail|not saved|could not|\u5931\u8d25|\u672a\u4fdd\u5b58|\u65e0\u6cd5\u4fdd\u5b58|\u672a\u80fd\u4fdd\u5b58|\u672a\u786e\u8ba4\u4fdd\u5b58/i.test(text)))
      assert(!(await p1.evaluate(() => window.__readerStateNotices)).some(text =>
        /success|^saved[.!]?$|\u4fdd\u5b58\u6210\u529f|\u5df2\u4fdd\u5b58/i.test(text)), 'failed save reported success')
      await snap(p1, 'position-save-failure')
      assert(hits > 0)
    } finally { await p1.unroute(url, fail) }
    assert.deepEqual(await state(owner, doc), latest)
    assert.deepEqual(persisted(doc), savedRows)
    const fresh = await context(owner); contexts.push(fresh)
    const reopened = await open(fresh, doc, pages[3])
    assert.equal(reopened.writes.length, 0)
    return {version: doc.version_id, stale_http: staleStatus, failed_http: 503, last_committed_revision: latest.revision}
  } finally { await Promise.all(contexts.map(ctx => ctx.close())) }
}

const ident = name => `"${name.replaceAll('"', '""')}"`
function snapshot(dir) {
  const conn = new DatabaseSync(dbPath(dir), {readOnly: true})
  try {
    const schema = conn.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all()
    const rows = Object.fromEntries(schema.filter(x => x.type === 'table').map(({name}) =>
      [name, conn.prepare(`SELECT * FROM ${ident(name)}`).all().sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)))]))
    return {schema, rows, version: conn.prepare('PRAGMA user_version').get().user_version,
      app: conn.prepare('PRAGMA application_id').get().application_id}
  } finally { conn.close() }
}

async function migrationCase() {
  const dir = mkdtempSync(join(tmpdir(), 'kos-read002-v15-'))
  const oldBundle = join(dir, 'read001-v15.mjs'), oldBytes = git('show', `${prior}:${pkg}/lib/test-support.js`)
  writeFileSync(oldBundle, oldBytes, {flag: 'wx'})
  const old = await import(pathToFileURL(oldBundle).href)
  const current = await import(pathToFileURL(join(root, pkg, 'lib/storage.js')).href)
  assert(current.SCHEMA_VERSION >= 16)
  assert.match(current.MIGRATION_V16_CHECKSUM, /^[a-f0-9]{64}$/)
  const storage = new old.ProbeStorage({dataDir: dir}), identity = new old.IdentityService(storage)
  let actor, witness
  try {
    assert(storage.available, storage.failure?.message)
    const creds = {loginName: 'migration', displayName: 'Synthetic migration', password}
    await identity.bootstrap(creds)
    const session = await identity.login({...creds, source: 'isolated'})
    actor = identity.actor(session.token)
    assert(actor)
    const text = 'preserved migration quotation', bytes = Buffer.from(text), hash = sha(bytes)
    const {receipt: doc} = storage.assets.publish(actor, {title: 'migration.txt', key: randomUUID()},
      {key: randomUUID() + '.txt', byteLength: bytes.length, sha256: hash}, {media: 'text/plain', encoding: 'utf-8',
        blocks: [{kind: 'paragraph', start: 0, end: text.length, text, anchor: hash}]})
    const {data} = storage.citations.create(actor, {
      asset_id: doc.id, version_id: doc.version_id, ordinal: 1, start: 0, end: 9, source_hash: hash,
    }, randomUUID())
    witness = storage.citations.resolve(actor, data.id)
    assert.equal(witness.quote, 'preserved')
    assert(witness.locator)
  } finally { await identity.close(); storage.close() }

  const before = snapshot(dir)
  assert.equal(before.version, 15)
  assert.equal(before.rows.citation_locators.length, 1)
  const broken = new current.ProbeStorage({dataDir: dir, failureAt: 'v16:after-schema'})
  try {
    assert.equal(broken.available, false)
    assert.match(broken.failure?.cause?.message ?? '', /v16:after-schema/)
  } finally { broken.close() }
  assert.deepEqual(snapshot(dir), before, 'failed v16 migration altered the v15 database')

  let upgraded
  for (let n = 0; n < 2; n++) {
    const next = new current.ProbeStorage({dataDir: dir})
    try {
      assert(next.available, next.failure?.message)
      assert.deepEqual(next.citations.resolve(actor, witness.id), witness)
      const after = snapshot(dir)
      assert.equal(after.version, current.SCHEMA_VERSION)
      assert.equal(after.app, before.app)
      const originalNames = new Set(before.schema.map(row=>row.name))
      assert.deepEqual(after.schema.filter(row => originalNames.has(row.name)), before.schema)
      const {reading_positions, reading_bookmarks, schema_migrations} = after.rows
      const original = Object.fromEntries(Object.keys(before.rows).map(name=>[name,after.rows[name]]))
      assert.deepEqual(reading_positions, []); assert.deepEqual(reading_bookmarks, [])
      const ledger = schema_migrations.toSorted((a, b) => a.version - b.version)
      assert.deepEqual(ledger.map(row=>row.version),Array.from({length:current.SCHEMA_VERSION},(_,i)=>i+1))
      const v16 = ledger.find(row=>row.version===16)
      assert.equal(v16.version, 16)
      assert.equal(v16.checksum, current.MIGRATION_V16_CHECKSUM)
      assert.deepEqual({...original, schema_migrations: schema_migrations.filter(row => row.version < 16)}, before.rows)
      assert.deepEqual(sql(dbPath(dir), 'PRAGMA foreign_key_check'), [])
      if (n === 0) upgraded = after
      else assert.deepEqual(after, upgraded)
    } finally { next.close() }
  }
  return {from: 15, to: current.SCHEMA_VERSION, checked_migration:16, prior_commit: prior, prior_bundle_sha256: sha(oldBytes), rollback_unchanged: true}
}

function diagnostic(error) {
  return {type: error.name, message: error.message.split('\n')[0].slice(0, 300),
    line: String(error.stack).match(/host-reader-state\.mjs:\d+/)?.[0]}
}

async function run(id, source, fn) {
  phase = id
  activePage = undefined
  const result = {id, source, status: 'NOT_RUN'}
  report.cases.push(result)
  try { result.actual = await fn(); result.status = 'PASS' }
  catch (error) {
    result.status = 'FAIL'; result.failure = diagnostic(error)
    if (activePage && !activePage.isClosed()) await snap(activePage, `${id}-failure`).catch(() => {})
  }
}

try {
  host = await isolate(candidate, entry)
  report.binding = host.facts
  await run('v15-to-v16-migration', 'candidate SQLite adapter with isolated v15 fixture', migrationCase)
  phase = 'Host and Chrome startup'
  await boot(true)
  db = dbPath(host.data)
  const {chromium} = await import(pathToFileURL(host.playwright).href)
  browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--disable-background-networking']})
  report.chrome = browser.version()
  await run('READ-002-T01', 'real Host, Chrome and SQLite', resumeCases)
  await run('READ-002-T02', 'real Host, Chrome and SQLite', aclCase)
  await run('same-version-Word-reconversion', 'real Host, Office conversion, Chrome and SQLite', renditionCase)
  await run('revision-race-and-failed-save', 'real Host and SQLite; two controlled Chrome network faults', raceCase)
  assert.deepEqual(sql(db, 'PRAGMA foreign_key_check'), [])
  assert.equal(sha(readFileSync(join(root, self))), runnerHash, 'runner changed during execution')
  report.status = report.cases.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL'
} catch (error) {
  report.status = 'FAIL'; report.failure = {phase, ...diagnostic(error)}
} finally {
  try { try { await browser?.close() } finally { await host?.stop() } }
  catch (error) { report.status = 'FAIL'; report.cleanup = diagnostic(error) }
  if (report.status === 'FAIL') process.exitCode = 1
  writeFileSync(join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(report.status, out)
}
