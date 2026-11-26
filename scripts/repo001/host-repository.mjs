import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { api, dbPath, entryCookie } from '../fnd004/harness.mjs'
import { candidateFacts } from '../integrated-case-proof.mjs'
import { isolate, until } from '../lib002/a07-isolated-host.mjs'
import { SCHEMA_VERSION } from '../../packages/knowledgeos-panel/lib/storage.js'

const [candidate, entry, mode] = process.argv.slice(2), root = fileURLToPath(new URL('../../', import.meta.url))
assert(mode === undefined || mode === '--fixture-regression')
const fixtureOnly = mode === '--fixture-regression'
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
const hash = value => createHash('sha256').update(value).digest('hex')
const self = 'scripts/repo001/host-repository.mjs'
assert.match(candidate ?? '', /^[a-f0-9]{40}$/); assert.match(entry ?? '', /^[a-f0-9]{64}$/)
assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
const runner_sha256 = hash(readFileSync(join(root, self)))
assert.equal(runner_sha256, hash(git('show', candidate + ':' + self)))
const { tree, source_tree, entry_sha256, build_sha256 } = candidateFacts(root, candidate)
assert.equal(entry_sha256, entry)
const parent = join(root, '.cache/repo001-host')
mkdirSync(parent, { recursive: true })
const out = mkdtempSync(join(parent, 'run-'))
git('check-ignore', '--', join(out, 'summary.json'))
const facts = { unit_id: 'REPO-001', candidate_sha: candidate, tree, source_tree, entry_sha256, build_sha256, runner_sha256,
  scope: fixtureOnly ? 'isolated DSH Host/Chrome/SQLite fixtures only; not unit acceptance' : 'real public GitHub + isolated DSH Host/Chrome/SQLite, bounded fixtures for negative cases',
  status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', A19: 'NOT_RUN', private_github: 'NOT_RUN', checks: [], screens: [], boots: [], traffic: [] }
let host, browser, phase, test, origin
const password = randomUUID(), scope = '/knowledge/v1', prefix = scope + '/repositories', pagePath = '/knowledgeos/repositories'
const repo = 'octocat/Hello-World', readme = 'README', marker = { 'x-knowledgeos-request': '1' }
const pass = (id, details = {}) => facts.checks.push({ id, status: 'PASS', ...details })
const compare = async path => {
  const response = await fetch('https://api.github.com/repos/' + repo + path, { redirect: 'error', signal: AbortSignal.timeout(12_000),
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } })
  assert.equal(response.status, 200, 'independent GitHub read ' + path)
  return response.json()
}
function read(statement, ...params) {
  const db = new DatabaseSync(dbPath(host.data), { readOnly: true })
  try { return db.prepare(statement).all(...params).map(row => ({ ...row })) } finally { db.close() }
}
async function boot() { const start = await host.start(); facts.boots.push(start.pid); return start }
async function capture(page, name) {
  const pixels = await page.screenshot({ path: join(out, name), fullPage: true, animations: 'disabled' })
  facts.screens.push({ name, sha256: hash(pixels) })
}
const external = []
async function login(loginName, viewport = { width: 1360, height: 940 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    external.push(url.origin); return route.abort()
  })
  const page = await context.newPage(); page.setDefaultTimeout(15000)
  await page.goto(origin + '/knowledgeos/account')
  await page.locator('#login_name').fill(loginName); await page.locator('#login_password').fill(password)
  await page.locator('#login').click(); await page.locator('#profile').waitFor()
  const id = (await (await context.request.get(origin + scope + '/me')).json()).data.id
  return { context, page, id }
}
async function call(actor, route = '', method = 'GET', data, status = 200, error) {
  const response = await actor.context.request.fetch(origin + prefix + route, { method, data, headers: marker, maxRedirects: 0 })
  const result = await response.json()
  assert.equal(response.status(), status, method + ' ' + route + ': ' + result.code)
  if (error) { assert.equal(result.code, error); assert.equal(result.data, undefined); return }
  assert.equal(result.data.actor_id, actor.id)
  return result.data
}
const input = (actor, repository, ref_value = 'main', rest) => ({ actor_id: actor.id, repository, ref_kind: 'branch', ref_value, ...rest })
const treeButton = (page, name) => page.locator('#tree').getByRole('button', { name, exact: true })
const savedFile = path => '/files?path=' + encodeURIComponent(path)
async function submit(actor, repository, ref, path) {
  const { page } = actor
  await page.locator('#repository').fill(repository); await page.locator('#ref').fill(ref)
  if (path !== undefined) { await page.locator('summary').click(); await page.locator('#initial-path').fill(path) }
  const response = page.waitForResponse(r => r.url() === origin + prefix && r.request().method() === 'POST')
  await page.locator('#save').click(); const result = await response
  assert.equal(result.status(), 201, await result.text())
  const { snapshot } = (await result.json()).data
  await page.waitForFunction(sha => !document.getElementById('detail').hidden && document.getElementById('commit').textContent === sha, snapshot.commit)
  return snapshot
}
const snapshots = () => read('SELECT id,owner_id,remote_id,is_private,credential_ref,ref_kind,ref_value,commit_sha,tree_sha,tree_json FROM repository_snapshots ORDER BY id')
const files = () => read('SELECT snapshot_id,path,blob_sha,payload FROM repository_files ORDER BY snapshot_id,path')

try {
  phase = 'boot and business identities'
  host = await isolate(candidate, entry, { repositoryTraffic: fixtureOnly ? 'fixture-only' : true }); origin = host.base; facts.binding = host.facts
  const start = await boot(), ownerCookie = await entryCookie(start.entry)
  assert.equal((await api(host.port, ownerCookie.cookie, 'POST', scope + '/auth/bootstrap', { login_name: 'owner', display_name: 'Owner', password })).status, 201)
  assert.equal((await api(host.port, '', 'POST', scope + '/auth/register', { login_name: 'peer', display_name: 'Peer', password })).status, 201)
  assert.equal(read('PRAGMA user_version')[0].user_version, SCHEMA_VERSION)
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server'] })
  facts.chrome = browser.version()

  phase = 'library navigation and initial snapshot'
  const owner = await login('owner'), peer = await login('peer'), { page } = owner
  await page.goto(origin + '/knowledgeos/library')
  await page.getByText('更多知识库工具', { exact: true }).click()
  await page.getByRole('link', { name: '仓库与代码' }).click()
  await page.locator('#workspace').waitFor()
  let first, restored
  const initialPath = fixtureOnly ? 'README.md' : readme
  if (fixtureOnly) {
    first = await submit(owner, 'synthetic/sample', 'main', initialPath)
    await page.locator('#file').waitFor({state:'visible'})
    restored = owner
  } else {
    test = 'T01'
    first = await submit(owner, 'https://github.com/' + repo, 'master')
    const meta = await compare(''), ref = await compare('/commits/refs%2Fheads%2Fmaster')
    const fixedTree = await compare('/git/trees/' + ref.commit.tree.sha + '?recursive=1')
    const treeEntry = fixedTree.tree.find(row => row.path === readme)
    const upstreamBlob = await compare('/git/blobs/' + treeEntry.sha), content = Buffer.from(upstreamBlob.content, 'base64')
    assert.equal(first.commit, ref.sha); assert.equal(first.tree, fixedTree.sha)
    assert.equal(await page.locator('#tree-link').getAttribute('href'), 'https://github.com/' + repo + '/tree/' + ref.sha)
    const firstRow = snapshots().find(row => row.id === first.id)
    assert.equal(firstRow.remote_id, meta.id); assert.equal(firstRow.is_private, 0); assert.equal(firstRow.credential_ref, ''); assert.equal(firstRow.owner_id, owner.id)
    assert.equal(firstRow.commit_sha, ref.sha); assert.equal(firstRow.tree_sha, fixedTree.sha)
    assert.deepEqual(JSON.parse(firstRow.tree_json).map(row => [row.path, row.sha]), fixedTree.tree.map(row => [row.path, row.sha]))

    phase = 'different ref preserves original record'
    await page.locator('#ref').fill('test')
    const beforeChange = host.repositoryEvents().length
    assert.equal(await page.locator('#commit').textContent(), first.commit)
    assert.equal(host.repositoryEvents().length, beforeChange)
    const next = await submit(owner, repo, 'test', 'CONTRIBUTING.md')
    await page.waitForFunction(() => !document.getElementById('file').hidden && document.getElementById('file-path').textContent === 'CONTRIBUTING.md')
    assert.notEqual(next.commit, first.commit); assert.notEqual(next.id, first.id)
    assert.deepEqual(snapshots().find(row => row.id === first.id), firstRow)
    assert.equal(files().find(row => row.snapshot_id === first.id), undefined)
    const beforePin = host.repositoryEvents().length
    await page.locator('#snapshots button').filter({ hasText: first.commit.slice(0, 12) }).click()
    await treeButton(page, readme).click(); await page.locator('#file').waitFor()
    const fixedFile = (await call(owner, '/' + first.id + savedFile(readme))).file
    const firstPayload = files().find(row => row.snapshot_id === first.id)
    assert.deepEqual(host.repositoryEvents().slice(beforePin).map(event => event.path), ['/repos/' + repo, '/repos/' + repo + '/git/blobs/' + treeEntry.sha])
    assert.equal(fixedFile.sha, treeEntry.sha); assert.equal(fixedFile.text, content.toString('utf8'))
    assert.equal(await page.locator('#file-text').textContent(), fixedFile.text)
    assert.equal(await page.locator('#blob-link').getAttribute('href'), 'https://github.com/' + repo + '/blob/' + ref.sha + '/' + readme)
    assert.deepEqual(Buffer.from(firstPayload.payload), content); assert.equal(firstPayload.blob_sha, upstreamBlob.sha)
    pass('real_git_cross_read', { repository: repo, commit: ref.sha, tree: fixedTree.sha, blob: upstreamBlob.sha, path: readme, sha256: hash(content), first_pinned_after_ref_change: true })
    await capture(page, 'github-desktop.png')
    facts.traffic.push(...host.repositoryEvents()); await host.stop(); await boot()
    phase = 'restart and new Chrome context proves persisted tree and bytes without remote calls'
    restored = await login('owner', { width: 420, height: 920 })
    await restored.page.goto(origin + pagePath); await restored.page.locator('#workspace').waitFor()
    await restored.page.locator('#snapshots button').filter({ hasText: first.commit.slice(0, 12) }).click()
    await treeButton(restored.page, readme).click(); await restored.page.locator('#file').waitFor()
    assert.equal(await restored.page.locator('#commit').textContent(), first.commit)
    assert.equal(await restored.page.locator('#file-text').textContent(), content.toString('utf8'))
    assert.deepEqual(host.repositoryEvents(), [])
    assert(await restored.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile horizontal overflow')
    await capture(restored.page, 'github-mobile.png')
    assert.equal(await restored.page.locator('#credential').getAttribute('autocomplete'), 'off')
    pass('restart_reread', { archived_commit: first.commit, different_commit: next.commit, network_reads: 0 })
    facts.T01 = 'PASS'
  }

  test = fixtureOnly ? undefined : 'T02'; phase = 'authorization, invalid upstream and atomic failures'
  const baseSnapshots = snapshots(), baseFiles = files(), baseline = host.repositoryEvents().length
  assert.deepEqual((await call(peer)).snapshots, [])
  await call(peer, '/' + first.id, 'GET', undefined, 404, 'NOT_FOUND')
  await call(peer, '/' + first.id + savedFile(initialPath), 'GET', undefined, 404, 'NOT_FOUND')
  await call(peer, '/' + first.id + '/files', 'POST', { actor_id: peer.id, path: initialPath }, 404, 'NOT_FOUND')
  await call(peer, '', 'POST', input(owner, repo, 'master'), 409, 'ACTOR_MISMATCH')
  await call(owner, '', 'POST', input(owner, 'https://example.invalid/a/b'), 422, 'INVALID_REPOSITORY_INPUT')
  await call(owner, '', 'POST', input(owner, repo, '../refs'), 422, 'INVALID_REPOSITORY_INPUT')
  await call(owner, '', 'POST', input(owner, repo, 'master', { credential_ref: 'github_unbound' }), 404, 'NOT_FOUND')
  await call(owner, '', 'POST', input(owner, repo, 'master', { token: 'synthetic_not_a_secret' }), 422, 'INVALID_REPOSITORY_INPUT')
  assert.equal(host.repositoryEvents().length, baseline)
  for (const [name, code, error, rest] of [
    ['missing', 404, 'REMOTE_REPOSITORY_NOT_FOUND'], ['redirect', 502, 'REPOSITORY_REDIRECT_REJECTED'],
    ['unsafe-path', 502, 'REPOSITORY_INVALID_RESPONSE'], ['truncated', 413, 'REPOSITORY_LIMIT_EXCEEDED'],
    ['too-large', 413, 'REPOSITORY_LIMIT_EXCEEDED'], ['broken-blob', 502, 'REPOSITORY_INVALID_RESPONSE', { path: 'README.md' }],
    ['transport', 503, 'REPOSITORY_UNAVAILABLE'], ['unavailable', 503, 'REPOSITORY_UNAVAILABLE'], ['rate', 429, 'REPOSITORY_RATE_LIMIT'],
    ['secondary-rate', 429, 'REPOSITORY_RATE_LIMIT'],
  ]) await call(owner, '', 'POST', input(owner, 'synthetic/' + name, 'main', rest), code, error)
  assert.deepEqual(snapshots(), baseSnapshots); assert.deepEqual(files(), baseFiles)
  const pending = restored.page.evaluate(async body => {
    const controller = new AbortController(); window.cancelRepository = () => controller.abort()
    try { return (await fetch('/knowledge/v1/repositories', { method: 'POST', body: JSON.stringify(body), signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-knowledgeos-request': '1' } })).status } catch (e) { return e.name }
  }, input(owner, 'synthetic/cancel'))
  await until(() => host.repositoryEvents().some(row => row.path === '/repos/synthetic/cancel'), 'upstream cancel arrival')
  await restored.page.evaluate(() => window.cancelRepository()); assert.equal(await pending, 'AbortError')
  await until(() => host.repositoryEvents().some(row => row.outcome === 'cancelled'), 'upstream cancel observed')
  assert.deepEqual(snapshots(), baseSnapshots); assert.deepEqual(files(), baseFiles)
  pass('authorization_and_failure_atomicity', { remote_for_acl_denials: 0 })

  phase = 'repository content isolation and no external browser requests'
  const literal = fixtureOnly ? first : await submit(restored, 'synthetic/sample', 'main')
  if (!fixtureOnly) await treeButton(restored.page, 'README.md').click()
  await restored.page.waitForFunction(() => document.getElementById('file-text').textContent.includes('<b>Literal Git content</b>'))
  assert.equal(await restored.page.locator('#file-text b, #file-text a, #file-text img').count(), 0)
  assert.equal(await treeButton(restored.page, 'linked').count(), 0); assert.equal(await treeButton(restored.page, 'nested').count(), 0)
  const beforeReject = host.repositoryEvents().length
  for (const path of ['linked', 'nested']) await call(owner, '/' + literal.id + '/files', 'POST', { actor_id: owner.id, path }, 422, 'REPOSITORY_NOT_REGULAR_FILE')
  assert.equal(host.repositoryEvents().length, beforeReject); assert.deepEqual(external, [])
  assert.deepEqual(read('PRAGMA foreign_key_check'), [])
  await capture(restored.page, 'literal-content.png')
  phase = 'foreground revalidation hides and discards stale account content'
  const visibility = (page, state) => page.evaluate(state => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
  await visibility(restored.page, 'hidden')
  assert.equal(await restored.page.locator('#workspace').isVisible(), false)
  await visibility(restored.page, 'visible'); await restored.page.locator('#file').waitFor({state:'visible'})
  await visibility(restored.page, 'hidden')
  const peerLogin = await restored.context.request.post(origin + scope + '/auth/login', {data:{login_name:'peer',password},headers:marker})
  assert.equal(peerLogin.status(), 200)
  const startedCheck = Promise.withResolvers(), rejectCheck = Promise.withResolvers()
  await restored.page.route(origin + prefix, async route => {
    startedCheck.resolve(); await rejectCheck.promise; await route.abort('failed')
  }, {times:1})
  await visibility(restored.page, 'visible')
  let deadline
  try { await Promise.race([startedCheck.promise, new Promise((_, fail) => { deadline = setTimeout(() => fail(Error('foreground revalidation did not arrive')), 8000) })]) }
  finally { clearTimeout(deadline) }
  assert.equal(await restored.page.locator('#workspace').isVisible(), false)
  rejectCheck.resolve(); await restored.page.locator('#login').waitFor()
  assert.equal(await restored.page.locator('#file-text').textContent(), '')
  const switched = {context:restored.context,id:peer.id}
  assert.deepEqual((await call(switched)).snapshots, [])
  await restored.page.reload(); await restored.page.locator('#workspace').waitFor()
  assert.equal(await restored.page.locator('#snapshots button').count(), 0)
  pass('foreground_identity_fail_closed')
  facts.traffic.push(...host.repositoryEvents())
  const real = facts.traffic.filter(row => row.outcome === 'github')
  assert(fixtureOnly ? real.length === 0 : real.length >= 10)
  assert(real.every(row => row.method === 'GET' && row.status === 200)); assert(facts.traffic.every(row => row.outcome !== 'denied'))
  pass('content_inert_and_egress_allowlisted', { github_read_requests: real.length, external_browser_requests: external.length })
  if (!fixtureOnly) facts.T02 = 'PASS'
  facts.status = 'PASS'
} catch (error) {
  if (test) facts[test] = 'FAIL'; facts.status = 'FAIL'; facts.failure = { phase, message: String(error.message).slice(0, 450) }
  throw error
} finally {
  await browser?.close(); await host?.stop()
  writeFileSync(join(out, 'summary.json'), JSON.stringify(facts, null, 2) + '\n')
  console.log(JSON.stringify({ status: facts.status, T01: facts.T01, T02: facts.T02, out }))
}
