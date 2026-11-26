import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { createFixture } from './controller.mjs'
import { sentinel } from './adapter.mjs'

const [checkout, candidate, entry] = process.argv.slice(2)
assert(checkout && candidate && entry, 'usage: node held-revocation.mjs <frozen checkout> <SHA> <entry SHA256>')
const root = resolve(checkout)
const load = file => import(pathToFileURL(join(root, file)).href)
const { api, login, entryCookie } = await load('scripts/fnd004/harness.mjs')
const { candidateFacts } = await load('scripts/integrated-case-proof.mjs')
const fp = candidateFacts(root, candidate)
assert.equal(fp.entry_sha256, entry)
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
const hash = value => createHash('sha256').update(value).digest('hex')
const fixturePath = 'scripts/know001/context-fixture.md'
const fixture = readFileSync(join(root, fixturePath))
assert.equal(hash(fixture), hash(git('show', candidate + ':' + fixturePath)))
const output = mkdtempSync(join(tmpdir(), 'know001-held-proof-'))
const proof = { unit_id: 'KNOW-001', candidate_sha: candidate, ...fp, fixture_sha256: hash(fixture),
  scope: 'REAL_HOST_HTTP_SQLITE_CONTROLLED_MODEL_AFTER_DISPATCH_REVOCATION', status: 'NOT_RUN',
  real_inference_requests: 0, checks: [] }
let host, armed, pending
try {
  host = await createFixture({ root, candidate, entry, out: output, fixtureSha256: hash(fixture) })
  const port = Number(new URL(host.base).port), password = randomUUID()
  const { entry: link, pid } = await host.start()
  proof.host_pid = pid
  const bootstrap = await entryCookie(link)
  const call = (account, method, path, payload, headers) => api(port, account?.cookie ?? '', method, '/knowledge/v1' + path, payload, headers)
  const ownerName = 'termowner', readerName = 'termreader'
  assert.equal((await call(bootstrap, 'POST', '/auth/bootstrap', { login_name: ownerName, password, display_name: 'Term owner' })).status, 201)
  assert.equal((await call(null, 'POST', '/auth/register', { login_name: readerName, password, display_name: 'Term viewer' })).status, 201)
  const owner = await login(port, ownerName, password), viewer = await login(port, readerName, password)
  assert.equal(owner.response.status, 200)
  assert.equal(viewer.response.status, 200)
  const ownerId = (await call(owner, 'GET', '/me')).json.data.id, viewerId = (await call(viewer, 'GET', '/me')).json.data.id
  const imported = await fetch(host.base + '/knowledge/v1/imports', {
    method: 'POST', headers: { cookie: owner.cookie, 'content-type': 'text/markdown', 'x-knowledgeos-request': '1',
      'x-knowledgeos-filename': 'term-context-fixture.md', 'idempotency-key': randomUUID() },
    body: fixture, redirect: 'error',
  })
  assert.equal(imported.status, 201)
  const asset = (await imported.json()).data, accessPath = '/assets/' + asset.id + '/versions/' + asset.version_id + '/reader-access'
  const issued = await call(owner, 'POST', '/invitations', { actor_id: ownerId, scope: 'object',
    target_id: asset.id, permission: 'read', days: 2, max_redemptions: 1 }, { 'idempotency-key': randomUUID() })
  assert.equal(issued.status, 201)
  const i = issued.json.data
  assert.equal((await call(viewer, 'POST', '/invitations/redeem', { actor_id: viewerId, token: i.token })).status, 201)
  assert.equal((await call(viewer, 'GET', accessPath)).status, 200)
  const sqlite = new DatabaseSync(host.dbPath, { readOnly: true })
  function counts() {
    return ['saved_terms', 'citations'].map(table => sqlite.prepare('SELECT count(*) n FROM ' + table).get().n)
  }
  try {
    const rows = sqlite.prepare('SELECT ordinal,text FROM text_blocks WHERE version_id=? ORDER BY ordinal').all(asset.version_id)
    const fixtureBlock = rows.find(row => row.text.includes('数据库索引（database index）'))
    assert(fixtureBlock)
    const start = fixtureBlock.text.lastIndexOf('索引')
    assert(start > fixtureBlock.text.indexOf('索引'))
    const spec = { asset_id: asset.id, version_id: asset.version_id, ordinal: fixtureBlock.ordinal, start, end: start + 2,
      source_hash: hash(fixtureBlock.text) }
    const headers = { 'x-knowledgeos-reader-actor': viewerId }
    const baseline = counts()
    const malformed = await call(viewer, 'POST', '/terms/explain', { ...spec, source_hash: 'f'.repeat(64) }, headers)
    assert.equal(malformed.status, 409)
    assert.equal(host.proof().fixture_dispatches, 0)
    proof.checks.push({ id: 'bad_hash_denied_before_fixture_dispatch', status: 'PASS', http: 409, fixture_dispatches: 0 })
    armed = host.arm('hold')
    let settled = false
    pending = call(viewer, 'POST', '/terms/explain', spec, headers).finally(() => { settled = true })
    await host.waitEvent('stream-held', armed)
    assert(!settled)
    assert.equal(host.proof().fixture_dispatches, 1)
    const revoked = await call(owner, 'POST', '/invitations/' + i.id + '/revoke',
      { actor_id: ownerId, expected_revision: i.revision }, { 'idempotency-key': randomUUID() })
    assert.equal(revoked.status, 200)
    assert.equal((await call(viewer, 'GET', accessPath)).status, 404)
    assert(!settled)
    host.release(armed)
    const failure = await pending
    assert.equal(failure.status, 404)
    assert.equal(failure.json.code, 'SOURCE_NOT_FOUND')
    assert(!('data' in failure.json))
    for (const marker of [sentinel, fixtureBlock.text.slice(0, 16), asset.version_id, asset.id, 'explanation_id']) assert(!failure.text.includes(marker))
    assert.equal((await call(owner, 'GET', accessPath)).status, 200)
    assert.deepEqual(counts(), baseline)
    assert.equal(host.proof().external_fetch_denials, 0)
    await host.waitEvent('stream-closed', armed)
    proof.checks.push({ id: 'after_dispatch_source_revocation_suppresses_result', status: 'PASS',
      model_fixture_dispatches: 1, release_only_after_authentication_404: true, http: failure.status,
      response_code: failure.json.code, no_handle_or_source_disclosed: true, owner_reader_control: 200,
      no_saved_terms_or_citation_mutation: true })
    proof.fixture = host.proof()
    proof.status = 'PASS'
  } finally { sqlite.close() }
} catch (error) {
  proof.status = 'FAIL'
  proof.error = String(error.message).slice(0, 300)
  process.exitCode = 1
} finally {
  if (armed) host.release(armed)
  if (pending) await pending.catch(() => undefined)
  await host?.stop()
  writeFileSync(join(output, 'summary.json'), JSON.stringify(proof, null, 2) + '\n')
  console.log(JSON.stringify({ status: proof.status, dir: output }))
}
