import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { COMMIT, FILES, REPOSITORY, SRC_TREE, SOURCES, TREE, TREE_FACTS, UNPINNED_BLOB, UNPINNED_PATH, gitOid, seedSnapshot } from './fixture.mjs'

function sessionActor(ProbeStorage, host, owner) {
  return owner.ctx.cookies(host.base + '/knowledge/v1/me').then(cookies => {
    const business = cookies.filter(cookie => /^kos_session_[0-9a-f]{16}$/.test(cookie.name) && cookie.path === '/knowledge/v1')
    assert.equal(business.length, 1, 'one isolated business session expected')
    const tokenHash = createHash('sha256').update(business[0].value).digest('hex')
    const storage = new ProbeStorage({ dataDir: host.data })
    const actor = storage.findActor(tokenHash, new Date().toISOString())
    assert(actor && actor.userId === owner.id)
    return { storage, actor }
  })
}

export async function seedOwner(ProbeStorage, host, owner) {
  const { storage, actor } = await sessionActor(ProbeStorage, host, owner)
  try {
    assert(storage.available)
    return seedSnapshot(storage, actor).id
  } finally { storage.close() }
}

export async function seedFiles(ProbeStorage, host, owner, snapshot) {
  const { storage, actor } = await sessionActor(ProbeStorage, host, owner)
  try {
    assert(storage.available)
    const signal = new AbortController().signal
    for (const selected of SOURCES) {
      const fixture = FILES.find(file => file.path === selected.path)
      const entry = TREE_FACTS.find(candidate => candidate.path === selected.path)
      assert(fixture && entry)
      storage.saveFile(actor, actor.userId, snapshot, { ...entry, sha: fixture.blob }, Buffer.from(fixture.source), signal)
    }
  } finally { storage.close() }
}

export function verifyDatabase(file, version, ownerId, snapshot, expectedFiles = 0) {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, version)
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    const snapshots = db.prepare('SELECT id,owner_id,owner_name,repository_name,is_private,ref_kind,ref_value,commit_sha,tree_sha,tree_json FROM repository_snapshots').all()
    assert.equal(snapshots.length, 1)
    const s = snapshots[0]
    assert.equal(s.id, snapshot); assert.equal(s.owner_id, ownerId)
    assert.equal(s.owner_name + '/' + s.repository_name, REPOSITORY)
    assert.equal(s.is_private, 0); assert.equal(s.ref_kind, 'commit'); assert.equal(s.ref_value, COMMIT)
    assert.equal(s.commit_sha, COMMIT); assert.equal(s.tree_sha, TREE)
    const expectedTree = TREE_FACTS.map(entry => {
      const fixture = FILES.find(file => file.path === entry.path)
      const sha = fixture?.blob ?? (entry.path === 'src' ? SRC_TREE : undefined)
      return sha ? { ...entry, sha } : { ...entry }
    })
    assert.deepEqual(JSON.parse(s.tree_json), expectedTree, 'tree shape')
    const files = db.prepare('SELECT snapshot_id,path,blob_sha,payload FROM repository_files ORDER BY path').all()
    assert.equal(files.length, expectedFiles)
    for (const row of files) {
      const fixture = FILES.find(file => file.path === row.path)
      assert(fixture && fixture.path !== UNPINNED_PATH); assert.equal(row.snapshot_id, snapshot); assert.equal(row.blob_sha, fixture.blob)
      const bytes = Buffer.from(row.payload); assert.equal(gitOid('blob', bytes), fixture.blob); assert.deepEqual(bytes, Buffer.from(fixture.source))
    }
    assert.equal(JSON.parse(s.tree_json).find(entry => entry.path === UNPINNED_PATH)?.sha, UNPINNED_BLOB)
    return { schema: version, integrity: 'ok', foreign_key_errors: 0, fixed_files: files.length, listed_unpinned: UNPINNED_PATH,
      commit: s.commit_sha, tree: s.tree_sha, paths: files.map(row => row.path), bytes: files.reduce((sum, row) => sum + Buffer.byteLength(row.payload), 0) }
  } finally { db.close() }
}
