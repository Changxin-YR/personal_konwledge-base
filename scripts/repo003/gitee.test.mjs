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
import { ProbeStorage, SCHEMA_VERSION, MIGRATION_V35_CHECKSUM } from '../../packages/knowledgeos-panel/lib/storage.js'
import { GiteeRepository, giteeName } from '../../packages/knowledgeos-panel/src/host/gitee-repository.ts'

const objectSha = (kind, bytes) => createHash('sha1').update(kind + ' ' + bytes.length + '\0').update(bytes).digest('hex')
const treeSha = (nameAndMode, sha) => objectSha('tree', Buffer.concat([Buffer.from(nameAndMode + '\0'), Buffer.from(sha, 'hex')]))
const controller = new AbortController()
const repo = { owner: 'oschina', name: 'repo', id: 17, private: false }
const bytes = Buffer.from('固定的字节')
const blob = objectSha('blob', bytes), commit = 'a'.repeat(40)
const dirSha = treeSha('100644 README', blob), tree = treeSha('40000 docs', dirSha)
const manifest = [
  { path: 'docs', mode: '40000', type: 'tree', sha: dirSha, size: 0 },
  { path: 'docs/README', mode: '100644', type: 'blob', sha: blob, size: bytes.length },
]
const entry = { path: 'docs/README', kind: 'file', size: bytes.length, sha: blob }
const branch = { kind: 'branch', value: 'main' }

test('Gitee uses namespaced tags, canonical identity and exact digests', async () => {
  assert.deepEqual(giteeName('https://gitee.com/oschina/repo'), { owner: 'oschina', name: 'repo' })
  assert.throws(() => giteeName('https://gitee.com.invalid/a/b'), { code: 'INVALID_REPOSITORY_INPUT' })
  let inputs = []
  let entries = manifest
  let badBlob = false
  const adapter = new GiteeRepository(controller.signal, undefined, async (input, init) => {
    const url = new URL(input)
    assert.equal(url.origin, 'https://gitee.com')
    assert.equal(init.method, 'GET')
    assert.equal(init.redirect, 'manual')
    inputs.push(url.pathname + url.search)
    if (url.pathname.endsWith('/oschina/repo')) return Response.json({
      id: repo.id, full_name: 'oschina/repo', owner: { login: 'another-slug' }, private: false, public: true,
    })
    if (url.pathname.includes('/commits/')) return Response.json({ sha: commit, commit: { tree: { sha: tree } } })
    if (url.pathname.includes('/git/trees/')) return Response.json({ sha: tree, tree: entries, truncated: false })
    return Response.json({ sha: blob, encoding: 'base64', size: bytes.length,
      content: (badBlob ? Buffer.alloc(bytes.length) : bytes).toString('base64') })
  })
  assert.deepEqual(await adapter.resolveRepository(repo), repo)
  const tag = { kind: 'tag', value: 'release' }
  const result = await adapter.resolveSnapshot(repo, tag)
  assert.equal(result.commit, commit)
  assert.equal(result.tree, tree)
  assert.deepEqual(result.entries.at(-1), entry)
  assert.deepEqual(inputs, [
    '/api/v5/repos/oschina/repo', '/api/v5/repos/oschina/repo/commits/refs%2Ftags%2Frelease',
    '/api/v5/repos/oschina/repo/git/trees/' + tree + '?recursive=1',
  ])
  assert.deepEqual(await adapter.readBlob(repo, entry), bytes)
  badBlob = true
  await assert.rejects(adapter.readBlob(repo, entry), { code: 'REPOSITORY_INVALID_RESPONSE' })
  entries = [manifest[0]]
  await assert.rejects(adapter.resolveSnapshot(repo, tag), { code: 'REPOSITORY_INVALID_RESPONSE' })
  entries = []
  await assert.rejects(adapter.resolveSnapshot(repo, tag), { code: 'REPOSITORY_INVALID_RESPONSE' })
})

test('v35 preserves both providers through rollback and adds scoped Gitee rows', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kos-repo003-migration-'))
  const oldModule = join(dir, 'v34.mjs')
  writeFileSync(oldModule, execFileSync('git', ['show', '77eeaae:packages/knowledgeos-panel/lib/test-support.js']))
  const old = await import(pathToFileURL(oldModule).href)
  const { actor } = await seed(old, dir)
  const original = new old.ProbeStorage({ dataDir: dir })
  const save = (s, platform) => s.repositories.saveSnapshot(actor, actor.userId, repo, branch, '', { commit, tree },
    [entry], controller.signal, { entry, bytes }, platform)
  const previous = ['github', 'gitlab'].map(platform => save(original, platform).snapshot)
  original.close()
  const db = new DatabaseSync(join(dir, 'knowledgeos.sqlite'), { readOnly: true })
  const table = name => db.prepare('SELECT * FROM ' + name + ' ORDER BY rowid').all()
  const snapshots = table('repository_snapshots'), files = table('repository_files'), ledger = table('schema_migrations')
  let storage
  try {
    storage = new ProbeStorage({ dataDir: dir, failureAt: 'v35:after-schema' })
    assert.equal(storage.available, false); storage.close()
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 34)
    assert.deepEqual(table('repository_snapshots'), snapshots)
    assert.deepEqual(table('repository_files'), files)
    assert.deepEqual(table('schema_migrations'), ledger)
    storage = new ProbeStorage({ dataDir: dir })
    assert(storage.available)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION)
    assert.deepEqual(table('repository_snapshots'), snapshots)
    assert.deepEqual(table('repository_files'), files)
    assert.deepEqual(table('schema_migrations').slice(0, 34), ledger)
    assert.equal(table('schema_migrations')[34].checksum, MIGRATION_V35_CHECKSUM)
    const current = save(storage, 'gitee').snapshot
    assert.equal(current.source_url, 'https://gitee.com/oschina/repo/tree/' + commit)
    assert.equal(new Set([current.id, ...previous.map(snapshot => snapshot.id)]).size, 3)
    for (const snapshot of [current, ...previous])
      assert.equal(storage.repositories.file(actor, snapshot.id, entry.path).text, bytes.toString())
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { storage?.close(); db.close() }
})
