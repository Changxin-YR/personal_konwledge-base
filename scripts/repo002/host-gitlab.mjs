import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [checkout, candidate, entry] = process.argv.slice(2)
assert(checkout && candidate && entry, 'usage: node host-gitlab.mjs <frozen checkout> <candidate SHA> <entry SHA256>')
const root = resolve(checkout)
const load = path => import(pathToFileURL(join(root, path)).href)
const { api, dbPath, entryCookie } = await load('scripts/fnd004/harness.mjs')
const { candidateFacts } = await load('scripts/integrated-case-proof.mjs')
const { isolate } = await load('scripts/lib002/a07-isolated-host.mjs')
const { SCHEMA_VERSION } = await load('packages/knowledgeos-panel/lib/storage.js')
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
const fingerprint = candidateFacts(root, candidate)
assert.equal(fingerprint.entry_sha256, entry)
const runnerSha = hash(readFileSync(fileURLToPath(import.meta.url)))
const runnerPath = 'scripts/repo002/host-gitlab.mjs'
assert.equal(runnerSha, hash(git('show', candidate + ':' + runnerPath)))
const out = mkdtempSync(join(tmpdir(), 'knowledgeos-repo002-run-'))
const facts = {
  unit_id: 'REPO-002', candidate_sha: candidate, ...fingerprint, runner_sha256: runnerSha,
  scope: 'real public GitLab through isolated Host/Chrome/SQLite, local credential-binding errors',
  status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', A19: 'NOT_RUN', private_gitlab: 'BLOCKED',
  checks: [], traffic: [], screens: [], boots: [],
}

const scope = '/knowledge/v1'
const prefix = scope + '/repositories'
const pagePath = '/knowledgeos/repositories'
const repo = 'gitlab-org/gitlab-test'
const remote = '/api/v4/projects/72724'
const repoByName = '/api/v4/projects/gitlab-org%2fgitlab-test'
const readme = 'README.md'
const missing = 'knowledgeos-repo002-missing-ref'
const password = randomUUID()
const marker = { 'x-knowledgeos-request': '1' }
const matrix = [
  {
    ref: 'master', commit: 'ddd0f15ae83993f5cb66a927a28673882e99100b', tree: '7dc7f517af9a53aa9817a6b8c33dc94371a7cdad',
    blob: 'ea20973903d3800ac659d503596f9105f0a7423f', size: 833, sha256: '471500105a0881cd0208d791494f59e1d5b973a9229c63792208befd91a57e3e', entries: 59,
  },
  {
    ref: 'branch-merged', commit: '498214de67004b1da3d820901307bed2a68a8ef6', tree: '06a736b30226509bcb4bae41df06c9be8f93a716',
    blob: 'faaf198af3a36dbf41961466703cc1d47c61d051', size: 55, sha256: '0753d44b11c2fa87069a0b674072fc449f1462decf49aff1bd52e975d44690ef', entries: 54,
  },
]
let host, browser, phase, origin
const externalBrowser = []
const ok = (id, details = {}) => facts.checks.push({ id, status: 'PASS', ...details })
const input = (actor, extra = {}) => ({ actor_id: actor.id, platform: 'gitlab', repository: repo, ref_kind: 'branch', ref_value: 'master', ...extra })
const treeUrl = sha => 'https://gitlab.com/' + repo + '/-/tree/' + sha
const blobUrl = sha => 'https://gitlab.com/' + repo + '/-/blob/' + sha + '/' + readme
const savedRoute = snap => '/' + snap.id + '/files?path=' + readme
const treeButton = page => page.locator('#tree').getByRole('button', { name: readme, exact: true })

function rows(sql, ...args) {
  const db = new DatabaseSync(dbPath(host.data), { readOnly: true })
  try { return db.prepare(sql).all(...args).map(row => ({ ...row })) }
  finally { db.close() }
}
const snapshots = () => rows('SELECT * FROM repository_snapshots ORDER BY id')
const files = () => rows('SELECT * FROM repository_files ORDER BY snapshot_id,path')
function pathOf(event) {
  const { pathname } = new URL(event.path, 'https://gitlab.com')
  return pathname.startsWith('/api/v4/') ? pathname : '/api/v4' + pathname
}
function metadata(event) {
  return [repoByName, remote].includes(pathOf(event).toLowerCase())
}
function assertAllowed(events) {
  for (const event of events) {
    assert.equal(event.method, 'GET')
    assert(event.outcome !== 'denied', JSON.stringify(event))
    const path = pathOf(event)
    assert(metadata(event) || [
      remote + '/repository/branches/master', remote + '/repository/branches/branch-merged',
      remote + '/repository/branches/' + missing, remote + '/repository/tree',
      ...matrix.map(item => remote + '/repository/commits/' + item.commit),
      ...matrix.map(item => remote + '/repository/blobs/' + item.blob),
    ].includes(path), path)
  }
}
function assertOldPin(events, expected) {
  assertAllowed(events)
  assert(events.length >= 2 && events.length <= 3, JSON.stringify(events))
  assert(metadata(events[0]), 'verify repository identity before pinning')
  const blob = events.filter(event => pathOf(event).includes('/blobs/'))
  assert.equal(blob.length, 1)
  assert.equal(pathOf(blob[0]), remote + '/repository/blobs/' + expected.blob)
  assert.equal(blob[0].status, 200)
  assert(events.every(event => metadata(event) || event === blob[0]))
}

async function boot(options) {
  const started = await host.start([], options)
  facts.boots.push(started.pid)
  return started
}
async function login(loginName, viewport = { width: 1360, height: 940 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    externalBrowser.push(url.origin)
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(16000)
  await page.goto(origin + '/knowledgeos/account')
  await page.locator('#login_name').fill(loginName)
  await page.locator('#login_password').fill(password)
  await page.locator('#login').click()
  await page.locator('#profile').waitFor()
  const response = await context.request.get(origin + scope + '/me')
  assert.equal(response.status(), 200)
  const { id } = (await response.json()).data
  return { page, context, id }
}
async function call(actor, path = '', method = 'GET', data, statuses = 200, code) {
  const response = await actor.context.request.fetch(origin + prefix + path, { method, data, headers: marker, maxRedirects: 0 })
  const result = await response.json()
  const expected = Array.isArray(statuses) ? statuses : [statuses]
  assert(expected.includes(response.status()), method + ' ' + path + ': ' + response.status() + ' ' + result.code)
  if (response.status() >= 400) {
    assert.equal(result.data, undefined)
    if (code) assert.equal(result.code, code)
    return { status: response.status(), code: result.code }
  }
  assert.equal(result.data.actor_id, actor.id)
  return result.data
}
async function open(actor) {
  await actor.page.bringToFront()
  await actor.page.goto(origin + '/knowledgeos/library')
  await actor.page.getByRole('link', { name: '仓库与代码' }).click()
  await actor.page.locator('#workspace').waitFor()
  return actor.page
}
async function connect(page, expected, seedFile = false) {
  await page.locator('#platform').selectOption('gitlab')
  await page.locator('#repository').fill(repo)
  await page.locator('#ref-kind').selectOption('branch')
  await page.locator('#ref').fill(expected.ref)
  if (seedFile) {
    await page.locator('#connect summary').click()
    await page.locator('#initial-path').fill(readme)
  }
  const pending = page.waitForResponse(r => r.url() === origin + prefix && r.request().method() === 'POST')
  await page.locator('#save').click()
  const response = await pending
  const value = await response.json()
  assert.equal(response.status(), 201, JSON.stringify(value))
  const sent = response.request().postDataJSON()
  assert.equal(sent.platform, 'gitlab')
  assert.equal(sent.ref_value, expected.ref)
  const { snapshot } = value.data
  assert.equal(snapshot.platform, 'gitlab')
  assert.equal(snapshot.commit, expected.commit, 'Public branch moved or response is not the expected ref. Reconfirm the named fixture before rerunning.')
  assert.equal(snapshot.tree, expected.tree)
  assert.equal(snapshot.repository, repo)
  assert.equal(snapshot.ref_kind, 'branch')
  assert.equal(snapshot.ref_value, expected.ref)
  assert.equal(snapshot.source_url, treeUrl(expected.commit))
  await page.waitForFunction(sha => !document.getElementById('detail').hidden && document.getElementById('commit').textContent === sha, expected.commit)
  assert.equal(await page.locator('#tree-link').getAttribute('href'), treeUrl(expected.commit))
  if (seedFile) {
    await page.locator('#file').waitFor()
    await page.waitForFunction(() => !document.getElementById('save').disabled)
  }
  return snapshot
}
async function select(page, expected) {
  await page.locator('#snapshots button').filter({ hasText: expected.commit.slice(0, 12) }).click()
  await page.waitForFunction(sha => document.getElementById('commit').textContent === sha, expected.commit)
}
function verifyTree(row, expected, owner) {
  assert.equal(row.platform, 'gitlab')
  assert.equal(row.remote_id, 72724)
  assert.equal(row.owner_id, owner.id)
  assert.equal(row.is_private, 0)
  assert.equal(row.credential_ref, '')
  assert.equal(row.commit_sha, expected.commit)
  assert.equal(row.tree_sha, expected.tree)
  const entries = JSON.parse(row.tree_json)
  assert.equal(entries.length, expected.entries)
  assert.equal(entries.find(item => item.path === readme)?.sha, expected.blob)
  const gitlinks = entries.filter(item => item.kind === 'submodule')
  assert.equal(gitlinks.length, 3)
  return gitlinks
}
async function verifyFile(owner, snap, expected) {
  const file = (await call(owner, savedRoute(snap))).file
  const row = files().find(item => item.snapshot_id === snap.id)
  const bytes = Buffer.from(row.payload)
  assert.equal(row.blob_sha, expected.blob)
  assert.equal(file.sha, expected.blob)
  assert.equal(file.path, readme)
  assert.equal(file.size, expected.size)
  assert.equal(file.source_url, blobUrl(expected.commit))
  assert.equal(hash(bytes), expected.sha256)
  assert.equal(createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'), expected.blob)
  assert.equal(file.text, bytes.toString('utf8'))
  return file
}
async function capture(page, name) {
  const bytes = await page.screenshot({ path: join(out, name), fullPage: true, animations: 'disabled' })
  facts.screens.push({ name, sha256: hash(bytes) })
}

try {
  phase = 'bound DSH Host and two business sessions'
  host = await isolate(candidate, entry, { repositoryTraffic: 'gitlab-public' })
  origin = host.base
  facts.binding = host.facts
  const started = await boot()
  const bootstrap = await entryCookie(started.entry)
  assert.equal((await api(host.port, bootstrap.cookie, 'POST', scope + '/auth/bootstrap',
    { login_name: 'owner', display_name: 'Repository owner', password })).status, 201)
  assert.equal((await api(host.port, '', 'POST', scope + '/auth/register',
    { login_name: 'peer', display_name: 'Unrelated member', password })).status, 201)
  assert.equal(rows('PRAGMA user_version')[0].user_version, SCHEMA_VERSION)
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server'] })
  facts.chrome = browser.version()
  const owner = await login('owner')
  const peer = await login('peer')
  const page = await open(owner)
  assert.equal(await page.locator('#platform').inputValue(), 'github')

  phase = 'T01 GitLab branch A tree, then B before pinning A'
  const [a, b] = matrix
  const beforeA = host.repositoryEvents().length
  const first = await connect(page, a)
  const aTraffic = host.repositoryEvents().slice(beforeA)
  assertAllowed(aTraffic)
  assert(aTraffic.some(event => pathOf(event) === remote + '/repository/branches/master' && event.status === 200))
  assert(aTraffic.some(event => pathOf(event) === remote + '/repository/tree' && event.status === 200 &&
    new URL(event.path, 'https://gitlab.com').searchParams.get('ref') === a.commit))
  assert(aTraffic.every(event => !pathOf(event).includes('/blobs/')))
  const firstRow = snapshots().find(row => row.id === first.id)
  const gitlinks = verifyTree(firstRow, a, owner)
  for (const { path } of gitlinks) assert.equal(await page.locator('#tree').getByRole('button', { name: path, exact: true }).count(), 0)
  assert.deepEqual(files(), [])
  await page.waitForFunction(() => !document.getElementById('save').disabled)
  const second = await connect(page, b, true)
  assert.notEqual(first.id, second.id)
  const secondRow = snapshots().find(row => row.id === second.id)
  verifyTree(secondRow, b, owner)
  await verifyFile(owner, second, b)
  assert.deepEqual(snapshots().find(row => row.id === first.id), firstRow)
  assert.equal(files().find(row => row.snapshot_id === first.id), undefined)
  const beforePin = host.repositoryEvents().length
  await select(page, a)
  await treeButton(page).click()
  await page.locator('#file').waitFor()
  const oldFile = await verifyFile(owner, first, a)
  assertOldPin(host.repositoryEvents().slice(beforePin), a)
  assert.equal(await page.locator('#file-text').textContent(), oldFile.text)
  assert.equal(await page.locator('#file-text *').count(), 0)
  assert.equal(await page.locator('#blob-link').getAttribute('href'), blobUrl(a.commit))
  const replay = await call(owner, '', 'POST', input(owner, { ref_kind: 'commit', ref_value: a.commit }))
  assert.equal(replay.replayed, true)
  assert.deepEqual(replay.snapshot, first)
  assert.equal(snapshots().length, 2)
  assert.deepEqual(externalBrowser, [])
  ok('two_gitlab_commits_and_late_old_blob_pin', { fixture: repo, a, b, browser_external_attempts: 0 })
  await capture(page, 'gitlab-old-fixed-file.png')

  phase = 'T01 restart reads the previous pinned bytes without new requests'
  facts.traffic.push(...host.repositoryEvents())
  await host.stop()
  await boot({ repositoryCredentials: [{
    actorId: owner.id, platform: 'gitlab', repository: repo, alias: 'gitlab_test_only', credentialRef: 'KO_GITLAB_TEST_ONLY',
  }] })
  const restarted = await login('owner', { width: 420, height: 920 })
  const narrow = await open(restarted)
  await select(narrow, a)
  await treeButton(narrow).click()
  await narrow.locator('#file').waitFor()
  assert.equal(await narrow.locator('#file-text').textContent(), oldFile.text)
  assert.equal(await narrow.locator('#file-text *').count(), 0)
  assert.equal(await narrow.locator('#blob-link').getAttribute('href'), blobUrl(a.commit))
  assert.deepEqual(host.repositoryEvents(), [])
  assert(await narrow.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'repository page overflow')
  await capture(narrow, 'gitlab-restart-mobile.png')
  ok('restart_reads_file_and_tree_with_zero_upstream_calls')
  facts.T01 = 'PASS'

  phase = 'T02 native alias boundary and genuinely missing public ref'
  const oldSnapshots = snapshots()
  const oldFiles = files()
  assert.deepEqual((await call(peer)).snapshots, [])
  await call(peer, '/' + first.id, 'GET', undefined, 404, 'NOT_FOUND')
  await call(peer, savedRoute(first), 'GET', undefined, 404, 'NOT_FOUND')
  await call(peer, '/' + first.id + '/files', 'POST', { actor_id: peer.id, path: readme }, 404, 'NOT_FOUND')
  await call(peer, '', 'POST', input(peer, { credential_ref: 'gitlab_test_only' }), 404, 'NOT_FOUND')
  await call(restarted, '', 'POST', input(restarted, { credential_ref: 'gitlab_test_only' }), 503, 'REPOSITORY_CREDENTIAL_UNCONFIGURED')
  await call(restarted, '', 'POST', input(restarted, { credential_ref: 'gitlab_unbound' }), 404, 'NOT_FOUND')
  const wrongAlias = await call(restarted, '', 'POST', input(restarted, { credential_ref: 'github_unbound' }), [404, 422])
  const wrongToken = await call(restarted, '', 'POST', input(restarted, { token: 'not-a-real-token' }), 422, 'INVALID_REPOSITORY_INPUT')
  assert.deepEqual(host.repositoryEvents(), [])
  const missingResponse = await call(restarted, '', 'POST', input(restarted, { ref_value: missing }), 404, 'REMOTE_REPOSITORY_NOT_FOUND')
  const missingEvents = host.repositoryEvents()
  assertAllowed(missingEvents)
  assert.equal(missingEvents.length, 2)
  assert(metadata(missingEvents[0]))
  assert.equal(pathOf(missingEvents[1]), remote + '/repository/branches/' + missing)
  assert.equal(missingEvents[1].status, 404)
  assert.deepEqual(snapshots(), oldSnapshots)
  assert.deepEqual(files(), oldFiles)
  assert.deepEqual(rows('PRAGMA foreign_key_check'), [])
  assert.deepEqual(externalBrowser, [])
  facts.traffic.push(...missingEvents)
  ok('local_aliases_denied_without_egress_and_real_gitlab_ref_404', { wrong_alias_status: wrongAlias.status, raw_token_status: wrongToken.status, missing_status: missingResponse.status })
  facts.T02 = facts.status = 'PASS'
} catch (error) {
  facts.status = 'FAIL'
  facts.failure = { phase, message: String(error.message).slice(0, 900) }
  throw error
} finally {
  if (host) {
    try {
      const events = host.repositoryEvents()
      if (events.length && facts.status !== 'PASS') facts.last_boot_traffic = events
    } catch { /* The Host can fail before creating its trace directory. */ }
  }
  try { await browser?.close() }
  finally {
    try { await host?.stop() }
    finally {
      writeFileSync(join(out, 'summary.json'), JSON.stringify(facts, null, 2) + '\n')
      console.log(JSON.stringify({ status: facts.status, dir: out }))
    }
  }
}
