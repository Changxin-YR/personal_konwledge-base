// Usage: node scripts/read003/host-annotations.mjs <commit> <entry-sha256> [evidence-parent]
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash, randomUUID} from 'node:crypto'
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {api, dbPath, entryCookie, login, sql} from '../fnd004/harness.mjs'
import {isolate} from '../lib002/a07-isolated-host.mjs'

const [candidate, entry, parent = tmpdir()] = process.argv.slice(2)
const root = fileURLToPath(new URL('../../', import.meta.url))
const self = 'scripts/read003/host-annotations.mjs', pkg = 'packages/knowledgeos-panel'
const prior = '08889f97a612b34ae205f0dfa3af6064c3585f19'
const sha = value => createHash('sha256').update(value).digest('hex')
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], {cwd: root})
assert.match(candidate, /^[a-f0-9]{40}$/)
assert.match(entry, /^[a-f0-9]{64}$/)
assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
const runner = sha(readFileSync(join(root, self)))
const committed = git('ls-tree', candidate, '--', self).length > 0
if (committed) assert.equal(runner, sha(git('show', `${candidate}:${self}`)))
mkdirSync(resolve(parent), {recursive: true})
const out = mkdtempSync(join(resolve(parent), 'read003-annotations-'))
const report = {candidate_sha: candidate, entry_sha256: entry, runner_sha256: runner,
  runner_committed: committed, independent_acceptance: false, status: 'NOT_RUN', cases: [], screens: [], boots: []}
const prefix = '/knowledge/v1', password = randomUUID()
const base = doc => `/assets/${doc.id}/versions/${doc.version_id}`
const annotations = (doc, unit = 1, id, conversion) => `${base(doc)}/reader-annotations${id ? '/' + id : ''}?${
  new URLSearchParams({unit, ...(conversion ? {conversion} : {})})}`
const phrase = 'repeat me', source = `First ${phrase}; then ${phrase} here.`, start = source.lastIndexOf(phrase)
const edit = '\u7f16\u8f91', locate = '\u5b9a\u4f4d', deletion = '\u5220\u9664'
const names = ['owner', 'reader', 'commenter']
let host, browser, chromium, db, owner, reader, commenter, phase = 'binding'

async function req(who, method, path, expected, body, headers = {}, secrets = []) {
  const binary = Buffer.isBuffer(body)
  const r = await fetch(host.base + prefix + path, {method, redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: {cookie: who.cookie, ...(method === 'GET' ? {} : {'x-knowledgeos-request': '1', 'x-knowledgeos-reader-actor': who.id}),
      ...(body !== undefined && !binary ? {'content-type': 'application/json'} : {}), ...headers},
    body: binary || body === undefined ? body : JSON.stringify(body)})
  assert([expected].flat().includes(r.status), `${method} ${path}: HTTP ${r.status}, expected ${expected}`)
  if (r.status === 204) return
  const raw = await r.text(), json = JSON.parse(raw)
  if (r.status >= 400) {
    assert(!Object.hasOwn(json, 'data'), 'denial carried a data payload')
    for (const secret of secrets) assert(!raw.includes(secret), 'denial exposed fixture content')
    return json.code
  }
  assert(Object.hasOwn(json, 'data'), 'missing data envelope')
  return json.data
}

async function boot(initial = false) {
  const {entry: url, pid} = await host.start()
  assert(!report.boots.includes(pid), 'expected a new process after restart')
  report.boots.push(pid)
  if (initial) {
    const {cookie} = await entryCookie(url)
    for (const [endpoint, session, name] of [['bootstrap', cookie, 'setup'], ...names.map(n => ['register', '', n])]) {
      const response = await api(host.port, session, 'POST', `${prefix}/auth/${endpoint}`, {login_name: name, display_name: name, password})
      assert.equal(response.status, 201)
    }
  }
  ;[owner, reader, commenter] = await Promise.all(names.map(async name => {
    const session = await login(host.port, name, password)
    assert.equal(session.response.status, 200); assert(session.cookie)
    const {id} = await req(session, 'GET', '/me', 200); assert(id)
    return {name, id, cookie: session.cookie}
  }))
}

const launch = () => chromium.launch({channel: 'chrome', headless: true, args: ['--disable-background-networking']})
async function context(who, chrome = browser) {
  const ctx = await chrome.newContext({viewport: {width: 1280, height: 960}, serviceWorkers: 'block'})
  ctx.setDefaultTimeout(12000)
  const p = await ctx.newPage()
  try {
    assert.equal((await ctx.cookies()).length, 0)
    await p.goto(host.base + '/knowledgeos/account')
    await p.locator('#login_name').fill(who.name)
    await p.locator('#login_password').fill(password)
    await p.locator('#login').click()
    await p.locator('#profile').waitFor()
    const response = await ctx.request.get(host.base + prefix + '/me')
    assert.equal(response.status(), 200)
    assert.equal((await response.json()).data.id, who.id)
    await p.close()
    return ctx
  } catch (error) { await ctx.close(); throw error }
}

async function upload(name, text = `${source}\n\nUnrelated block.`, previous) {
  const bytes = Buffer.from(text)
  const doc = await req(owner, 'POST', '/imports', 201, bytes, {'content-type': 'text/markdown',
    'idempotency-key': randomUUID(), 'x-knowledgeos-filename': name,
    ...(previous ? {'x-knowledgeos-asset-id': previous.id, 'x-knowledgeos-expected-version': '1'} : {})})
  assert.equal(doc.sha256, sha(bytes))
  if (previous) { assert.equal(doc.id, previous.id); assert.notEqual(doc.version_id, previous.version_id) }
  return doc
}

async function list(who, doc, unit = 1) {
  const data = await req(who, 'GET', annotations(doc, unit), 200)
  assert.equal(data.actor_id, who.id)
  assert.equal(typeof data.can_comment, 'boolean'); assert.equal(typeof data.can_share, 'boolean')
  assert(Array.isArray(data.items))
  return data
}

const row = (p, id) => p.locator(`#annotation-items [data-annotation-id="${id}"]`)
const control = (r, name) => r.getByRole('button', {name, exact: true})
async function open(ctx, doc, unit = 1, text = source) {
  const p = await ctx.newPage()
  const query = new URLSearchParams({asset: doc.id, version: doc.version_id, unit})
  await p.goto(`${host.base}/knowledgeos/reader?${query}`)
  await p.locator('#text').waitFor({state: 'visible'})
  assert((await p.locator('#text').textContent()).startsWith(text))
  assert.equal(await p.locator('#number').inputValue(), String(unit))
  assert((await p.locator('#version').textContent()).includes(doc.version_id))
  return p
}

const waitResponse = (p, method, path) => p.waitForResponse(r => r.request().method() === method && r.url() === host.base + prefix + path)
async function exchange(p, method, path, click) {
  const [r] = await Promise.all([waitResponse(p, method, path), click()]); return r
}
function checkWrite(r, who, status, body) {
  assert.equal(r.status(), status, r.url())
  const headers = r.request().headers()
  assert.equal(headers['x-knowledgeos-request'], '1'); assert.equal(headers['x-knowledgeos-reader-actor'], who.id)
  assert.deepEqual(r.request().postDataJSON(), body)
}

async function show(p, doc, unit = 1) {
  const r = await exchange(p, 'GET', annotations(doc, unit), () => p.locator('#annotations-toggle').click())
  assert.equal(r.status(), 200)
  await p.locator('#annotation-items li').first().waitFor()
}

async function draft(p, body, visibility = 'private') {
  // A DOM Range picks the second occurrence by offsets, not by matching the selected text.
  await p.locator('#text').evaluate((el, {start, width}) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), range = document.createRange()
    const boundary = at => {
      walker.currentNode = el
      for (let n; (n = walker.nextNode()); at -= n.length) if (at <= n.length) return [n, at]
      throw new Error('fixture selection not found')
    }
    range.setStart(...boundary(start)); range.setEnd(...boundary(start + width))
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range)
  }, {start, width: phrase.length})
  assert.equal(await p.evaluate(() => getSelection().toString()), phrase)
  await p.locator('#annotate:not([disabled])').click()
  await p.locator('#annotation-body').fill(body)
  await p.locator('#annotation-visibility').selectOption(visibility)
}

async function add(p, who, doc, body, visibility = 'private') {
  await draft(p, body, visibility)
  const r = await exchange(p, 'POST', annotations(doc), () => p.locator('#annotation-submit').click())
  assert.equal(r.status(), 201)
  const item = (await r.json()).data
  checkWrite(r, who, 201, {citation_id: item.citation_id, body, visibility})
  assert.deepEqual([item.ordinal, item.start, item.end, item.visibility, item.revision, item.can_edit],
    [1, start, start + phrase.length, visibility, 1, true])
  assert.equal(item.body, body)
  await row(p, item.id).waitFor()
  await p.locator('#annotation-body').waitFor({state: 'hidden'})
  return item
}

async function cite(who, doc) {
  const d = await req(who, 'GET', `${base(doc)}/reader?unit=1`, 200)
  return req(who, 'POST', '/citations', 201, {asset_id: doc.id, version_id: doc.version_id,
    ordinal: 1, start, end: start + phrase.length, source_hash: d.anchor}, {'idempotency-key': randomUUID()})
}

const rows = doc => sql(db, `SELECT a.*,c.asset_id,c.version_id,c.ordinal,c.start,c.end,c.source_hash
  FROM reader_annotations a JOIN citations c ON c.id=a.citation_id WHERE c.version_id=? ORDER BY a.rowid`, [doc.version_id])
async function witness(who, doc, item, project = null) {
  assert.deepEqual((await list(who, doc)).items.find(m => m.id === item.id), item)
  const r = rows(doc).find(r => r.id === item.id)
  assert.deepEqual([r.asset_id, r.version_id, r.author_id, r.project_id], [doc.id, doc.version_id, who.id, project])
  for (const key of ['citation_id', 'ordinal', 'start', 'end', 'source_hash', 'body', 'revision']) assert.equal(r[key], item[key], key)
  const c = await req(who, 'GET', `/citations/${item.citation_id}/resolve`, 200)
  assert.deepEqual([c.asset_id, c.version_id, c.ordinal, c.start, c.end, c.source_hash, c.quote],
    [doc.id, doc.version_id, 1, start, start + phrase.length, item.source_hash, phrase])
}

async function snap(p, label) {
  const file = `${label}.png`
  report.screens.push({file, sha256: sha(await p.screenshot({path: join(out, file)}))})
}

async function editDraft(p, item, body) {
  await control(row(p, item.id), edit).click()
  assert.equal(await p.locator('#annotation-body').inputValue(), item.body)
  await p.locator('#annotation-body').fill(body)
}

async function patchFromBrowser(p, doc, item, body, status = 200) {
  const expected = {body, expected_revision: item.revision}
  const r = await exchange(p, 'PATCH', annotations(doc, 1, item.id), () => p.locator('#annotation-submit').click())
  checkWrite(r, owner, status, expected)
  const json = await r.json()
  if (status === 409) {
    assert.equal(json.code, 'ANNOTATION_REVISION_CONFLICT'); assert(!Object.hasOwn(json, 'data'))
    return
  }
  assert.deepEqual(json.data, {...item, body, revision: item.revision + 1})
  await p.locator('#annotation-body').waitFor({state: 'hidden'})
  return json.data
}

async function lifecycle() {
  const doc = await upload('annotation-lifecycle.md'), deny = [403, 404]
  const initial = '<b data-fixture="annotation">This stays plain text</b> & notes'
  const expectedRange = [start, start + phrase.length]
  let ctx = await context(owner), other, otherCtx, item
  try {
    const access = await list(owner, doc)
    assert.equal(access.can_comment, true); assert.equal(access.can_share, false)
    assert.deepEqual(access.items, [])
    const p = await open(ctx, doc)
    item = await add(p, owner, doc, initial)
    await witness(owner, doc, item)
    await req(reader, 'GET', annotations(doc), deny, undefined, {}, [initial, source])
    const spec = {citation_id: item.citation_id, body: 'Scope probe', visibility: 'project'}
    assert.equal(await req(owner, 'POST', annotations(doc), 422, spec), 'ANNOTATION_SCOPE_UNAVAILABLE')
    await ctx.close()
    await host.stop(); await boot()
    ctx = await context(owner)
    const first = await open(ctx, doc)
    await show(first, doc)
    assert.equal(await row(first, item.id).locator('p').textContent(), initial)
    assert.equal(await row(first, item.id).locator('p *').count(), 0, 'annotation body was rendered as markup')
    await control(row(first, item.id), locate).click()
    const mark = first.locator('#text mark')
    await mark.waitFor()
    const highlight = await mark.evaluate(m => {
      const before = document.createRange(); before.selectNodeContents(m.parentElement); before.setEndBefore(m)
      const start = before.toString().length
      return {start, end: start + m.textContent.length, text: m.textContent}
    })
    assert.deepEqual(highlight, {start: expectedRange[0], end: expectedRange[1], text: phrase})
    await witness(owner, doc, item)
    await snap(first, 'fixed-annotation-plain-text')

    const newerText = `${source} New revision.`, newer = await upload('annotation-lifecycle.md', newerText, doc)
    for (const [wrongDoc, unit, text] of [[doc, 3, 'Unrelated block.'], [newer, 1, newerText]]) {
      const wrong = await open(ctx, wrongDoc, unit, text)
      await show(wrong, wrongDoc, unit)
      assert.equal(await row(wrong, item.id).count(), 0)
      assert.deepEqual((await list(owner, wrongDoc, unit)).items, [])
      await req(owner, 'POST', annotations(wrongDoc, unit), deny, {...spec, visibility: 'private'})
      await req(owner, 'PATCH', annotations(wrongDoc, unit, item.id), deny, {body: 'Wrong target', expected_revision: 1})
      await wrong.close()
    }
    await first.close()
    const stale = await open(ctx, doc)
    await show(stale, doc)
    // Independent headless Chrome processes keep both pages visible, so the
    // reader's deliberate background privacy lock does not clear the stale draft.
    other = await launch(); otherCtx = await context(owner, other)
    const winner = await open(otherCtx, doc)
    await show(winner, doc)
    const latestBody = 'Other tab saved this first.', draftBody = 'My unsubmitted local draft.'
    await editDraft(stale, item, draftBody)
    await editDraft(winner, item, latestBody)
    let latest = await patchFromBrowser(winner, doc, item, latestBody)
    await witness(owner, doc, latest)
    assert(await stale.evaluate(() => !document.hidden), 'stale tab must remain visible')
    assert.equal(await stale.locator('#annotation-body').inputValue(), draftBody)
    await patchFromBrowser(stale, doc, item, draftBody, 409)
    await stale.locator('#annotation-rebase').waitFor()
    assert.match(await stale.locator('#annotation-status').textContent(), /\u8349\u7a3f\u5df2\u4fdd\u7559|conflict/i)
    assert.equal(await stale.locator('#annotation-body').inputValue(), draftBody)
    assert(await stale.locator('#annotation-submit').isDisabled())
    await witness(owner, doc, latest)
    await snap(stale, 'annotation-revision-conflict')
    assert.equal(await req(owner, 'DELETE', annotations(doc, 1, item.id), 409, {expected_revision: item.revision}),
      'ANNOTATION_REVISION_CONFLICT')
    await stale.locator('#annotation-rebase').click()
    await stale.locator('#annotation-rebase').waitFor({state: 'hidden'})
    assert.equal(await stale.locator('#annotation-body').inputValue(), draftBody)
    await witness(owner, doc, latest)
    latest = await patchFromBrowser(stale, doc, latest, draftBody)
    await witness(owner, doc, latest)
    await other.close(); other = undefined
    await ctx.close()

    await host.stop(); await boot()
    ctx = await context(owner)
    const restored = await open(ctx, doc)
    await show(restored, doc)
    assert.equal(await row(restored, item.id).locator('p').textContent(), draftBody)
    await witness(owner, doc, latest)
    restored.once('dialog', async dialog => { await dialog.accept() })
    const deleted = await exchange(restored, 'DELETE', annotations(doc, 1, item.id), () => control(row(restored, item.id), deletion).click())
    checkWrite(deleted, owner, 200, {expected_revision: latest.revision})
    await row(restored, item.id).waitFor({state: 'detached'})
    assert.deepEqual((await list(owner, doc)).items, []); assert.deepEqual(rows(doc), [])
    return {version: doc.version_id, new_version: newer.version_id, range: expectedRange, conflict_http: 409, last_revision: latest.revision}
  } finally { await Promise.all([ctx?.close(), other?.close()]) }
}

async function attachedSource() {
  const doc = await upload('annotation-project.md')
  const project = await req(owner, 'POST', '/projects', 201, {name: 'Annotation project fixture'})
  for (const who of [reader, commenter]) await req(owner, 'POST', `/projects/${project.id}/memberships`, 204, {user_id: who.id, role: 'member'})
  const object = await req(owner, 'POST', '/objects', 201, {scope: 'project', project_id: project.id,
    object_type: 'asset', title: 'Attached annotation source', body: 'Synthetic fixture'})
  // Source attachment only, as in READ-002. All grants and annotation writes use business HTTP.
  const conn = new DatabaseSync(db)
  try {
    conn.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE')
    conn.prepare('INSERT INTO assets VALUES(?)').run(object.id)
    assert.equal(conn.prepare('UPDATE asset_versions SET asset_id=? WHERE id=? AND asset_id=?')
      .run(object.id, doc.version_id, doc.id).changes, 1)
    conn.exec('COMMIT')
  } finally { conn.close() }
  return {doc: {...doc, id: object.id}, project: project.id}
}

async function permissions() {
  const {doc, project} = await attachedSource(), deny = [403, 404]
  const grant = (who, action) => req(owner, 'POST', '/grants', 201, {object_id: doc.id,
    subject_type: 'user', subject_id: who.id, action})
  await req(reader, 'GET', annotations(doc), deny, undefined, {}, [source])
  await grant(commenter, 'comment')
  await req(commenter, 'GET', annotations(doc), deny, undefined, {}, [source])
  await grant(reader, 'read')
  const commenterRead = await grant(commenter, 'read')
  const contexts = []
  const tab = async who => { const ctx = await context(who); contexts.push(ctx); return open(ctx, doc) }
  try {
    const own = await tab(owner), priv = await add(own, owner, doc, 'Private project-source annotation')
    await witness(owner, doc, priv)
    await own.close()
    const write = await tab(commenter)
    const allowed = await list(commenter, doc)
    assert.equal(allowed.can_comment, true); assert.equal(allowed.can_share, true)
    assert.deepEqual(allowed.items, [])
    const shared = await add(write, commenter, doc, 'Published to the source project', 'project')
    await witness(commenter, doc, shared, project)
    const readOnly = await list(reader, doc)
    assert.equal(readOnly.can_comment, false); assert.equal(readOnly.can_share, false)
    assert.deepEqual(readOnly.items, [{...shared, can_edit: false}])
    assert.deepEqual((await list(owner, doc)).items, [priv, {...shared, can_edit: false}])
    const view = await tab(reader)
    await show(view, doc)
    await row(view, shared.id).waitFor()
    assert.equal(await row(view, priv.id).count(), 0)
    assert.equal(await control(row(view, shared.id), edit).count(), 0)
    assert.equal(await control(row(view, shared.id), deletion).count(), 0)
    await snap(view, 'project-read-only-annotations')
    await view.close()
    const before = rows(doc), secrets = [priv.body, shared.body, source]
    const readerCitation = await cite(reader, doc)
    for (const visibility of ['private', 'project']) {
      await req(reader, 'POST', annotations(doc), deny, {citation_id: readerCitation.id, body: 'Read-only write', visibility}, {}, secrets)
    }
    for (const [who, target] of [[commenter, priv], [reader, priv], [reader, shared], [owner, shared]]) {
      const path = annotations(doc, 1, target.id), expected_revision = target.revision
      await req(who, 'PATCH', path, deny, {body: 'Unauthorized edit', expected_revision}, {}, secrets)
      await req(who, 'DELETE', path, deny, {expected_revision}, {}, secrets)
    }
    const post = {citation_id: shared.citation_id, body: 'Rejected scope probe', visibility: 'project'}
    await req(commenter, 'POST', annotations(doc), 422, {...post, project_id: randomUUID()}, {}, secrets)
    await req(commenter, 'POST', annotations(doc), 409, post, {'x-knowledgeos-reader-actor': owner.id}, secrets)
    await req(commenter, 'POST', annotations(doc), 403, post, {'x-knowledgeos-request': ''}, secrets)
    assert.deepEqual(rows(doc), before)

    // Open a clean foreground tab before creating the unsaved draft used by the revocation check.
    await write.close()
    const live = await tab(commenter)
    await live.bringToFront(); await show(live, doc)
    const unsaved = 'Unsaved textarea contents, revoke before submit.'
    await editDraft(live, shared, unsaved)
    assert(await live.evaluate(() => !document.hidden && document.hasFocus()))
    await snap(live, 'annotation-before-read-revocation')
    const at = performance.now()
    await req(owner, 'POST', '/grants/revoke', 204, {grant_id: commenterRead.id})
    await live.waitForFunction(() => {
      const $ = id => document.getElementById(id)
      return !document.hidden && document.hasFocus() && $('annotations').hidden &&
        !$('annotation-items').childElementCount && !$('annotation-body').value && !$('text').textContent
    }, null, {timeout: 8000})
    const cleared = Math.round(performance.now() - at)
    await snap(live, 'annotation-after-read-revocation')
    await req(commenter, 'GET', annotations(doc), deny, undefined, {}, secrets)
    await req(commenter, 'POST', annotations(doc), deny, post, {}, secrets)
    const path = annotations(doc, 1, shared.id), expected_revision = shared.revision
    await req(commenter, 'PATCH', path, deny, {body: unsaved, expected_revision}, {}, secrets)
    await req(commenter, 'DELETE', path, deny, {expected_revision}, {}, secrets)
    assert.deepEqual(rows(doc), before)
    assert.deepEqual((await list(reader, doc)).items, readOnly.items)
    return {version: doc.version_id, project, foreground_clear_ms: cleared}
  } finally { await Promise.all(contexts.map(ctx => ctx.close())) }
}

function snapshot(path) {
  const conn = new DatabaseSync(path, {readOnly: true})
  try {
    const schema = conn.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all()
    const rows = Object.fromEntries(schema.filter(x => x.type === 'table').map(({name}) =>
      [name, conn.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all()]))
    return {schema, rows, version: conn.prepare('PRAGMA user_version').get().user_version,
      app: conn.prepare('PRAGMA application_id').get().application_id}
  } finally { conn.close() }
}

async function migration() {
  const dir = mkdtempSync(join(tmpdir(), 'kos-read003-v16-')), path = dbPath(dir), oldBundle = join(dir, 'v16.mjs')
  const bytes = git('show', `${prior}:${pkg}/lib/test-support.js`)
  writeFileSync(oldBundle, bytes, {flag: 'wx'})
  const old = await import(pathToFileURL(oldBundle).href)
  const current = await import(pathToFileURL(join(root, pkg, 'lib/storage.js')).href)
  assert.equal(current.SCHEMA_VERSION, 17)
  const storage = new old.ProbeStorage({dataDir: dir}), identity = new old.IdentityService(storage)
  let actor, t, citation, navigation
  try {
    assert(storage.available, storage.failure?.message)
    const creds = {loginName: 'migration', displayName: 'Synthetic migration', password}
    await identity.bootstrap(creds)
    const session = await identity.login({...creds, source: 'isolated'})
    actor = identity.actor(session.token); assert(actor)
    const hash = sha(source)
    const {receipt: doc} = storage.assets.publish(actor, {title: 'migration.md', key: randomUUID()},
      {key: randomUUID() + '.md', byteLength: Buffer.byteLength(source), sha256: hash}, {media: 'text/markdown',
        encoding: 'utf-8', blocks: [{kind: 'paragraph', start: 0, end: source.length, text: source, anchor: hash}]})
    t = {asset_id: doc.id, version_id: doc.version_id, ordinal: 1}
    const point = {...t, source_hash: hash}
    const {data} = storage.citations.create(actor, {...point, start, end: start + phrase.length}, randomUUID())
    storage.citations.savePosition(actor, point, 0, actor.userId)
    storage.citations.addBookmark(actor, point, 'Existing bookmark', actor.userId)
    navigation = storage.citations.navigation(actor, t)
    citation = storage.citations.resolve(actor, data.id)
    assert(citation.locator); assert.equal(citation.quote, phrase)
    assert.equal(navigation.revision, 1); assert.equal(navigation.bookmarks.length, 1)
  } finally { await identity.close(); storage.close() }

  const before = snapshot(path)
  assert.equal(before.version, 16)
  const broken = new current.ProbeStorage({dataDir: dir, failureAt: 'v17:after-schema'})
  try {
    assert.equal(broken.available, false)
    assert.match(broken.failure?.cause?.message ?? '', /v17:after-schema/)
  } finally { broken.close() }
  assert.deepEqual(snapshot(path), before, 'failed v17 migration changed the v16 DB')
  let upgraded
  for (let boot = 0; boot < 2; boot++) {
    const next = new current.ProbeStorage({dataDir: dir})
    try {
      assert(next.available, next.failure?.message)
      assert.deepEqual(next.citations.navigation(actor, t), navigation)
      assert.deepEqual(next.citations.resolve(actor, citation.id), citation)
      const after = snapshot(path), {reader_annotations, schema_migrations, ...legacy} = after.rows
      assert.equal(after.version, 17); assert.equal(after.app, before.app)
      assert.deepEqual(after.schema.filter(r => r.tbl_name !== 'reader_annotations'), before.schema)
      assert.deepEqual(reader_annotations, [])
      const ledger = schema_migrations.at(-1)
      assert.equal(ledger.version, 17); assert.match(ledger.checksum, /^[a-f0-9]{64}$/)
      assert.equal(ledger.checksum, current.MIGRATION_V17_CHECKSUM)
      assert.deepEqual({...legacy, schema_migrations: schema_migrations.slice(0, -1)}, before.rows)
      assert.deepEqual(sql(path, 'PRAGMA foreign_key_check'), [])
      if (boot === 0) upgraded = after
      else assert.deepEqual(after, upgraded)
    } finally { next.close() }
  }
  return {from: 16, to: 17, prior_sha: prior, prior_bundle_sha256: sha(bytes), rollback_unchanged: true}
}

const diagnostic = error => ({type: error.name, message: error.message.split('\n')[0].slice(0, 300),
  line: String(error.stack).match(/host-annotations\.mjs:\d+/)?.[0]})
async function run(id, source, fn) {
  phase = id
  const result = {id, source, status: 'NOT_RUN'}
  report.cases.push(result)
  try { result.actual = await fn(); result.status = 'PASS' }
  catch (error) { result.status = 'FAIL'; result.failure = diagnostic(error) }
}

try {
  host = await isolate(candidate, entry)
  report.binding = host.facts
  await run('v16-to-v17-migration', 'candidate SQLite adapter with isolated v16 fixture', migration)
  phase = 'Host and Chrome startup'
  await boot(true)
  db = dbPath(host.data)
  ;({chromium} = await import(pathToFileURL(host.playwright).href))
  browser = await launch(); report.chrome = browser.version()
  await run('READ-003-T01', 'real Host, Chrome and SQLite', lifecycle)
  await run('READ-003-T02', 'real Host, Chrome and SQLite', permissions)
  assert.deepEqual(sql(db, 'PRAGMA foreign_key_check'), [])
  assert.equal(sha(readFileSync(join(root, self))), runner, 'runner changed during execution')
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
