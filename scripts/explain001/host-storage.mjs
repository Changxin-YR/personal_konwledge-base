import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { BLOB, COMMIT, PATH, SOURCE, TREE, UNPINNED_BLOB, UNPINNED_PATH, gitOid, seedSnapshot } from './fixture.mjs'

export async function seedOwner(ProbeStorage, host, owner) {
  // Resolve only this fresh business login, by its scoped cookie on the isolated Host.
  const cookies = await owner.ctx.cookies(host.base + '/knowledge/v1/me')
  const business = cookies.filter(cookie => /^kos_session_[0-9a-f]{16}$/.test(cookie.name) && cookie.path === '/knowledge/v1')
  assert.equal(business.length, 1, 'one isolated business session expected')
  const tokenHash = createHash('sha256').update(business[0].value).digest('hex')
  const storage = new ProbeStorage({ dataDir: host.data })
  try {
    assert(storage.available)
    const actor = storage.findActor(tokenHash, new Date().toISOString())
    assert(actor && actor.userId === owner.id)
    return seedSnapshot(storage, actor).id
  } finally { storage.close() }
}
export function verifyDatabase(file, version, ownerId, snapshot) {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, version)
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    const snapshots = db.prepare('SELECT id,owner_id,owner_name,repository_name,is_private,ref_kind,ref_value,commit_sha,tree_sha,tree_json FROM repository_snapshots').all()
    assert.equal(snapshots.length, 1)
    const s = snapshots[0]
    assert.equal(s.id, snapshot); assert.equal(s.owner_id, ownerId)
    assert.equal(s.owner_name + '/' + s.repository_name, 'fixture-lab/shipping-rules')
    assert.equal(s.is_private, 0); assert.equal(s.ref_kind, 'commit'); assert.equal(s.ref_value, COMMIT)
    assert.equal(s.commit_sha, COMMIT); assert.equal(s.tree_sha, TREE)
    const tree = JSON.parse(s.tree_json)
    assert.equal(tree.find(entry => entry.path === PATH)?.sha, BLOB)
    assert.equal(tree.find(entry => entry.path === UNPINNED_PATH)?.sha, UNPINNED_BLOB)
    const files = db.prepare('SELECT snapshot_id,path,blob_sha,payload FROM repository_files').all()
    assert.equal(files.length, 1); const row = files[0]
    assert.equal(row.snapshot_id, snapshot); assert.equal(row.path, PATH); assert.equal(row.blob_sha, BLOB)
    const bytes = Buffer.from(row.payload); assert.equal(gitOid('blob', bytes), BLOB); assert.deepEqual(bytes, Buffer.from(SOURCE))
    return { schema: version, integrity: 'ok', foreign_key_errors: 0, fixed_files: 1, listed_unpinned: UNPINNED_PATH,
      commit: s.commit_sha, tree: s.tree_sha, path: row.path, blob: row.blob_sha, bytes: bytes.length }
  } finally { db.close() }
}
