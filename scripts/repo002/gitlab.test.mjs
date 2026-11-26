import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { seed } from '../fnd006/independent/common.mjs'
import { ProbeStorage, SCHEMA_VERSION, MIGRATION_V34_CHECKSUM } from '../../packages/knowledgeos-panel/lib/storage.js'
import { GitLabRepository, gitLabName } from '../../packages/knowledgeos-panel/src/host/gitlab-repository.ts'

const signal = new AbortController().signal
const commit = 'a'.repeat(40)
const bytes = Buffer.from('original bytes')
const sha = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
const name = { owner: 'group/subgroup', name: 'project' }
const repo = { ...name, id: 17, private: false }
const branch = { kind: 'branch', value: 'test' }
const sourceEntry = { path: 'README', kind: 'file', size: bytes.length, sha }

test('GitLab checks immutable refs, recursive pagination, malformed trees and object bytes', async () => {
  assert.deepEqual(gitLabName('https://gitlab.com/group/subgroup/project'), name)
  for (const bad of ['https://gitlab.com.invalid/x/y', 'group/../project', 'group//project', 'group/project?ref=x'])
    assert.throws(() => gitLabName(bad), { code: 'INVALID_REPOSITORY_INPUT' })
  const seen = []
  const file = path => ({ id: sha, name: path.split('/').at(-1), path, mode: '100644', type: 'blob' })
  const first = Array.from({ length: 100 }, (_, i) => file('p' + i))
  let tail = []
  const adapter = new GitLabRepository(signal, undefined, async (input, init) => {
    const url = new URL(input)
    seen.push(url)
    assert.equal(url.origin, 'https://gitlab.com')
    assert.equal(init.method, 'GET')
    assert.equal(init.redirect, 'manual')
    if (url.pathname.endsWith('/projects/group%2Fsubgroup%2Fproject'))
      return Response.json({ id: 17, path_with_namespace: 'group/subgroup/project', visibility: 'public' })
    if (url.pathname.endsWith('/tags/release')) return Response.json({ name: 'release', commit: { id: commit } })
    if (url.pathname.includes('/commits/')) return Response.json({ id: 'b'.repeat(40) })
    if (url.pathname.endsWith('/tree')) {
      assert.equal(url.searchParams.get('ref'), commit)
      return Response.json(url.searchParams.get('page') === '1' ? first : tail)
    }
    return Response.json({ sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') })
  })
  assert.deepEqual(await adapter.resolveRepository(name), repo)
  const tag = { kind: 'tag', value: 'release' }
  const snapshot = await adapter.resolveSnapshot(repo, tag)
  assert.equal(snapshot.commit, commit)
  assert.equal(snapshot.entries.length, 100)
  assert.deepEqual(seen.filter(url => url.pathname.endsWith('/tree')).map(url => url.searchParams.get('page')), ['1', '2'])
  assert.deepEqual(await adapter.readBlob(repo, { ...sourceEntry, size: null }), bytes)
  await assert.rejects(adapter.readBlob(repo, { ...sourceEntry, size: 1 }), { code: 'REPOSITORY_INVALID_RESPONSE' })
  await assert.rejects(adapter.readBlob(repo, { ...sourceEntry, kind: 'submodule' }), { code: 'REPOSITORY_NOT_REGULAR_FILE' })
  tail = [file('p0')]
  await assert.rejects(adapter.resolveSnapshot(repo, tag), { code: 'REPOSITORY_INVALID_RESPONSE' })
  tail = [{ id: commit, name: 'dir', path: 'dir', mode: '040000', type: 'tree' }, file('dir/sub')]
  await assert.rejects(adapter.resolveSnapshot(repo, tag), { code: 'REPOSITORY_INVALID_RESPONSE' })
  await assert.rejects(adapter.resolveSnapshot(repo, { kind: 'commit', value: commit }), { code: 'REPOSITORY_INVALID_RESPONSE' })
  for (const [status, headers, code] of [
    [302, { location: 'https://example.invalid/' }, 'REPOSITORY_REDIRECT_REJECTED'],
    [403, { 'ratelimit-remaining': '0' }, 'REPOSITORY_RATE_LIMIT'],
    [403, {}, 'REMOTE_REPOSITORY_NOT_FOUND'],
    [429, {}, 'REPOSITORY_RATE_LIMIT'],
  ]) {
    let requests = 0
    const failing = new GitLabRepository(signal, undefined, async () => { requests++; return new Response(null, { status, headers }) })
    await assert.rejects(failing.resolveRepository(name), { code })
    assert.equal(requests, 1)
  }
})

test('v34 rollback preserves GitHub blobs and platform scopes identical remote IDs and SHAs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kos-repo002-'))
  const oldModule = join(dir, 'v33.mjs')
  writeFileSync(oldModule, execFileSync('git', ['show', 'c9d20f8:packages/knowledgeos-panel/lib/test-support.js']))
  const old = await import(pathToFileURL(oldModule).href)
  const { actor } = await seed(old, dir)
  const original = new old.ProbeStorage({ dataDir: dir })
  const github = { ...repo, owner: 'group' }
  const revision = { commit, tree: 'b'.repeat(40) }
  const saved = original.repositories.saveSnapshot(actor, actor.userId, github, branch, '', revision, [sourceEntry], signal, { entry: sourceEntry, bytes })
  original.close()
  const db = new DatabaseSync(join(dir, 'knowledgeos.sqlite'), { readOnly: true })
  const rows = table => db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all().map(row => ({ ...row }))
  const previous = rows('repository_snapshots'), previousFiles = rows('repository_files'), ledger = rows('schema_migrations')
  let storage
  try {
    storage = new ProbeStorage({ dataDir: dir, failureAt: 'v34:after-schema' })
    assert.equal(storage.available, false)
    storage.close()
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 33)
    assert.deepEqual(rows('repository_snapshots'), previous)
    assert.deepEqual(rows('repository_files'), previousFiles)
    assert.deepEqual(rows('schema_migrations'), ledger)
    storage = new ProbeStorage({ dataDir: dir })
    assert(storage.available)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION)
    assert.deepEqual(rows('schema_migrations').slice(0, 33), ledger)
    assert.equal(rows('schema_migrations')[33].checksum, MIGRATION_V34_CHECKSUM)
    assert.deepEqual(rows('repository_snapshots'), [{ ...previous[0], platform: 'github' }])
    assert.deepEqual(rows('repository_files'), previousFiles)
    assert.deepEqual(storage.repositories.detail(actor, saved.snapshot.id).snapshot, saved.snapshot)
    const entry = { ...sourceEntry, size: null }
    const gitlab = storage.repositories.saveSnapshot(actor, actor.userId, repo, branch, '', revision, [entry], signal, { entry, bytes }, 'gitlab')
    assert.notEqual(gitlab.snapshot.id, saved.snapshot.id)
    assert.equal(storage.repositories.file(actor, gitlab.snapshot.id, entry.path).text, bytes.toString())
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { storage?.close(); db.close() }
})
