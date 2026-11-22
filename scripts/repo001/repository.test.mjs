import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { seed } from '../fnd006/independent/common.mjs'
import { ProbeStorage, SCHEMA_VERSION, MIGRATION_V28_CHECKSUM,MIGRATION_V29_CHECKSUM } from '../../packages/knowledgeos-panel/lib/storage.js'
import { GitHubRepository, repositoryName, repositoryRef, isRepositoryPath } from '../../packages/knowledgeos-panel/src/host/github-repository.ts'

test('v28 rolls back atomically, preserves v27 notes and binds immutable files to the owner and commit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kos-repo001-')), oldPath = join(dir, 'v27.mjs')
  writeFileSync(oldPath, execFileSync('git', ['show', '99dc650a513cf1aa1dd663d417225b5738bf09f0:packages/knowledgeos-panel/lib/test-support.js']))
  const old = await import(pathToFileURL(oldPath).href), { actor } = await seed(old, dir)
  const previous = new old.ProbeStorage({ dataDir: dir })
  const note = previous.notes.create(actor, actor.userId, randomUUID(), { kind: 'plain', title: 'Existing', body: 'Keep the data' }).data
  previous.close()
  const db = new DatabaseSync(join(dir, 'knowledgeos.sqlite'), { readOnly: true })
  const version = () => db.prepare('PRAGMA user_version').get().user_version
  const all = (tab, order = 'rowid') => db.prepare('SELECT * FROM ' + tab + ' ORDER BY ' + order).all()
  const schema = all('sqlite_schema'), ledger = all('schema_migrations'), notes = all('notes')
  let s
  try {
    assert.equal(version(), 27)
    s = new ProbeStorage({ dataDir: dir, failureAt: 'v28:after-schema' })
    assert.equal(s.available, false); assert.match(s.failure.cause.message, /v28:after-schema/); s.close()
    assert.equal(version(), 27); assert.deepEqual(all('schema_migrations'), ledger); assert.deepEqual(all('sqlite_schema'), schema)
    s = new ProbeStorage({ dataDir: dir }); assert(s.available); assert.equal(version(), SCHEMA_VERSION)
    const migrated = all('schema_migrations')
    assert.equal(migrated[28].checksum, MIGRATION_V29_CHECKSUM); assert.equal(migrated[27].checksum, MIGRATION_V28_CHECKSUM)
    assert.deepEqual(migrated.slice(0,27), ledger)
    assert.deepEqual(all('notes'), notes); assert.equal(s.notes.get(actor, note.id).body, 'Keep the data')
    const remote = { owner: 'Synthetic', name: 'repo', id: 1, private: false }, ref = {kind:'branch',value:'test'}
    const revision = { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }, signal = new AbortController()
    const bytes = Buffer.from('synthetic'), sha = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
    const entry = { path: 'README', kind: 'file', size: bytes.length, sha }
    assert.throws(() => s.repositories.saveSnapshot(actor, actor.userId, remote, ref, '', revision, [], signal.signal, {entry, bytes}), {code:'REPOSITORY_INVALID_RESPONSE'})
    assert.deepEqual(all('repository_snapshots'), [])
    const save = () => s.repositories.saveSnapshot(actor, actor.userId, remote, ref, '', revision, [entry], signal.signal, {entry, bytes})
    const {snapshot} = save(); assert.deepEqual(save(), {snapshot,replayed:true})
    assert.equal(s.repositories.file(actor, snapshot.id, 'README').text, 'synthetic')
    assert.throws(() => s.repositories.list({...actor,userId:randomUUID()}), {code:'AUTH_REQUIRED'})
    signal.abort(); assert.throws(save, {code:'REPOSITORY_CANCELLED'})
    s.close(); s = new ProbeStorage({dataDir:dir}); assert.equal(s.repositories.file(actor,snapshot.id,'README').sha,sha)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { s?.close(); db.close() }
})

test('adapter rejects ambiguous paths, verifies body size and digest, and never follows redirects', async () => {
  assert.throws(() => repositoryName('https://github.com.invalid/x/y'), {code:'INVALID_REPOSITORY_INPUT'})
  assert.throws(() => repositoryRef('commit', '1234567'), {code:'INVALID_REPOSITORY_INPUT'})
  assert.throws(() => repositoryRef('tag', '../heads/main'), {code:'INVALID_REPOSITORY_INPUT'})
  for(const bad of ['x/../y','x\\z','/x','x//z','x\u0000y','x\u202ey'])assert(!isRepositoryPath(bad))
  assert(isRepositoryPath('src/a # % b.ts'))
  const signal = new AbortController(), name = {owner:'synthetic',name:'repo'}, repo = {...name,id:1,private:false}
  let requests=0
  const redirect = new GitHubRepository(signal.signal, undefined, async (url, options) => {
    requests++; assert.equal(url,'https://api.github.com/repos/synthetic/repo'); assert.equal(options.method,'GET'); assert.equal(options.redirect,'manual')
    return Response.redirect('https://example.invalid/')
  })
  await assert.rejects(redirect.resolveRepository(name),{code:'REPOSITORY_REDIRECT_REJECTED'}); assert.equal(requests,1)
  const treeSha='b'.repeat(40), entry={path:'file',kind:'file',size:1,sha:'a'.repeat(40)}
  const invalid = new GitHubRepository(signal.signal, undefined, async url => url.includes('/trees/')
    ? Response.json({sha:treeSha,truncated:false,tree:[{type:'blob',mode:'100644',path:'ghost/file',size:1,sha:entry.sha}]})
    : Response.json({size:1,sha:entry.sha,encoding:'base64',content:'YQ=='}))
  await assert.rejects(invalid.readTree(repo,treeSha),{code:'REPOSITORY_INVALID_RESPONSE'})
  await assert.rejects(invalid.readBlob(repo,entry),{code:'REPOSITORY_INVALID_RESPONSE'})
  const bounded = new GitHubRepository(signal.signal, undefined, async () => new Response(new Uint8Array(2*1024*1024+1)))
  await assert.rejects(bounded.readTree(repo,treeSha),{code:'REPOSITORY_LIMIT_EXCEEDED'})
  signal.abort(); await assert.rejects(invalid.readTree(repo,treeSha),{code:'REPOSITORY_CANCELLED'})
})
