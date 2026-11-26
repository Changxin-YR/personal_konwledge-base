import { randomUUID } from 'node:crypto'
import { AssetError } from './asset-store.ts'
import type { SessionActor } from './identity.ts'
import type { ParseTx } from './parse-store.ts'
import { GitHubRepository, repositoryLimits, repositorySlug, type RepositoryEntry, type RepositoryIdentity, type RepositoryName, type RepositoryRef } from './github-repository.ts'
import { GitLabRepository } from './gitlab-repository.ts'

export const REPOSITORY_SCHEMA = `
CREATE TABLE repository_snapshots (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
  remote_id INTEGER NOT NULL, owner_name TEXT NOT NULL, repository_name TEXT NOT NULL,
  is_private INTEGER NOT NULL CHECK(is_private IN (0,1)), credential_ref TEXT NOT NULL,
  ref_kind TEXT NOT NULL CHECK(ref_kind IN ('branch','tag','commit')), ref_value TEXT NOT NULL,
  commit_sha TEXT NOT NULL CHECK(length(commit_sha)=40), tree_sha TEXT NOT NULL CHECK(length(tree_sha)=40),
  tree_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(service_id,owner_id,remote_id,is_private,credential_ref,commit_sha)
) STRICT;
CREATE TABLE repository_files (
  snapshot_id TEXT NOT NULL REFERENCES repository_snapshots(id), path TEXT NOT NULL,
  blob_sha TEXT NOT NULL CHECK(length(blob_sha)=40), payload BLOB NOT NULL,
  PRIMARY KEY(snapshot_id,path)
) STRICT;
`

export const REPOSITORY_PLATFORM_TABLES = `
CREATE TABLE repository_snapshots (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL CHECK(platform IN ('github','gitlab')),
  remote_id INTEGER NOT NULL, owner_name TEXT NOT NULL, repository_name TEXT NOT NULL,
  is_private INTEGER NOT NULL CHECK(is_private IN (0,1)), credential_ref TEXT NOT NULL,
  ref_kind TEXT NOT NULL CHECK(ref_kind IN ('branch','tag','commit')), ref_value TEXT NOT NULL,
  commit_sha TEXT NOT NULL CHECK(length(commit_sha)=40), tree_sha TEXT NOT NULL CHECK(length(tree_sha)=40),
  tree_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(service_id,owner_id,platform,remote_id,is_private,credential_ref,commit_sha)
) STRICT;
CREATE TABLE repository_files (
  snapshot_id TEXT NOT NULL REFERENCES repository_snapshots(id), path TEXT NOT NULL,
  blob_sha TEXT NOT NULL CHECK(length(blob_sha)=40), payload BLOB NOT NULL,
  PRIMARY KEY(snapshot_id,path)
) STRICT;
`

export const REPOSITORY_PLATFORM_SCHEMA = `
ALTER TABLE repository_files RENAME TO repository_files_v33;
ALTER TABLE repository_snapshots RENAME TO repository_snapshots_v33;
${REPOSITORY_PLATFORM_TABLES}
INSERT INTO repository_snapshots(id,service_id,owner_id,platform,remote_id,owner_name,repository_name,is_private,credential_ref,ref_kind,ref_value,commit_sha,tree_sha,tree_json,created_at)
SELECT id,service_id,owner_id,'github',remote_id,owner_name,repository_name,is_private,credential_ref,ref_kind,ref_value,commit_sha,tree_sha,tree_json,created_at
FROM repository_snapshots_v33;
INSERT INTO repository_files SELECT snapshot_id,path,blob_sha,payload FROM repository_files_v33;
DROP TABLE repository_files_v33;
DROP TABLE repository_snapshots_v33;
`

export type RepositoryPlatform = 'github' | 'gitlab'
export const credentialAlias = /^(?:github|gitlab)_[a-z0-9_]{1,48}$/
export interface RepositoryCredentialBinding {
  actorId: string; repository: string; alias: string; credentialRef: string; platform?: RepositoryPlatform
}
type ResolveCredential = (ref: string) => Promise<string | undefined>
interface SnapshotRow {
  id: string; platform: RepositoryPlatform; remote_id: number; owner_name: string; repository_name: string; is_private: number;
  credential_ref: string; ref_kind: RepositoryRef['kind']; ref_value: string; commit_sha: string;
  tree_sha: string; tree_json: string; created_at: string
}
const summaryColumns = 'id,platform,remote_id,owner_name,repository_name,is_private,credential_ref,ref_kind,ref_value,commit_sha,tree_sha,created_at'
const hidden = () => new AssetError(404, 'NOT_FOUND')
const checkSignal = (signal: AbortSignal) => { if (signal.aborted) throw new AssetError(409, 'REPOSITORY_CANCELLED') }
type Source = Pick<SnapshotRow, 'platform' | 'owner_name' | 'repository_name' | 'commit_sha'>
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')
const sourceUrl = (row: Source, type: 'tree' | 'blob') => {
  const repository = encodePath(row.owner_name + '/' + row.repository_name)
  const base = row.platform === 'gitlab' ? 'https://gitlab.com/' + repository + '/-' : 'https://github.com/' + repository
  return base + '/' + type + '/' + row.commit_sha
}
const summarize = (row: Omit<SnapshotRow, 'tree_json'>) => ({
  id: row.id, platform: row.platform, repository: row.owner_name + '/' + row.repository_name,
  private: !!row.is_private, credential_ref: row.credential_ref || null,
  ref_kind: row.ref_kind, ref_value: row.ref_value, commit: row.commit_sha, tree: row.tree_sha, created_at: row.created_at,
  source_url: sourceUrl(row, 'tree'),
})

const fileView = (row: Source, path: string, sha: string, bytes: Uint8Array) => {
  let text: string | null = null
  if (!bytes.includes(0)) {
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) } catch { /* Binary, not executable or rendered. */ }
  }
  return { path, sha, size: bytes.length, text,
    source_url: sourceUrl(row, 'blob') + '/' + encodePath(path) }
}

export class RepositoryStore {
  constructor(private readonly tx: ParseTx, private readonly currentActor: (session: SessionActor, now: string) => SessionActor | undefined) {}

  check(session: SessionActor, expected = session.userId) {
    return this.tx('read', (_, now) => this.actor(session, now, expected))
  }

  private actor(session: SessionActor, now: string, expected = session.userId) {
    const actor = this.currentActor(session, now)
    if (!actor) throw new AssetError(401, 'AUTH_REQUIRED')
    if (expected !== actor.userId) throw new AssetError(409, 'ACTOR_MISMATCH')
    return actor
  }

  list(session: SessionActor) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(session, now)
      return (db.prepare('SELECT ' + summaryColumns + ' FROM repository_snapshots WHERE service_id=? AND owner_id=? ORDER BY created_at DESC,id DESC')
        .all(actor.serviceId, actor.userId) as unknown as SnapshotRow[]).map(summarize)
    })
  }

  private row(db: import('node:sqlite').DatabaseSync, actor: SessionActor, id: string) {
    const row = db.prepare('SELECT * FROM repository_snapshots WHERE service_id=? AND owner_id=? AND id=?').get(actor.serviceId, actor.userId, id) as unknown as SnapshotRow | undefined
    if (!row) throw hidden()
    return row
  }

  detail(session: SessionActor, id: string) {
    return this.tx('read', (db, now) => {
      const row = this.row(db, this.actor(session, now), id)
      const entries = JSON.parse(row.tree_json) as RepositoryEntry[]
      const files = db.prepare('SELECT path FROM repository_files WHERE snapshot_id=? ORDER BY path').all(id).map(row => String(row.path))
      return { snapshot: summarize(row), entries, files }
    })
  }

  file(session: SessionActor, id: string, path: string) {
    return this.tx('read', (db, now) => {
      const row = this.row(db, this.actor(session, now), id)
      const saved = db.prepare('SELECT blob_sha,payload FROM repository_files WHERE snapshot_id=? AND path=?').get(id, path)
      if (!saved) throw hidden()
      return fileView(row, path, String(saved.blob_sha), saved.payload as Uint8Array)
    })
  }

  pendingFile(session: SessionActor, expected: string, id: string, path: string) {
    return this.tx('read', (db, now) => {
      const row = this.row(db, this.actor(session, now, expected), id)
      const entry = (JSON.parse(row.tree_json) as RepositoryEntry[]).find(candidate => candidate.path === path)
      if (!entry) throw hidden()
      return { row, entry }
    })
  }

  saveSnapshot(session: SessionActor, expected: string, remote: RepositoryIdentity, ref: RepositoryRef, alias: string,
    revision: { commit: string; tree: string }, entries: RepositoryEntry[], signal: AbortSignal, pinned?: { entry: RepositoryEntry; bytes: Buffer },
    platform: RepositoryPlatform = 'github') {
    return this.tx('write', (db, now) => {
      checkSignal(signal)
      const { userId, serviceId } = this.actor(session, now, expected)
      const existing = db.prepare('SELECT * FROM repository_snapshots WHERE service_id=? AND owner_id=? AND platform=? AND remote_id=? AND is_private=? AND credential_ref=? AND commit_sha=?')
        .get(serviceId, userId, platform, remote.id, Number(remote.private), alias, revision.commit) as unknown as SnapshotRow | undefined
      if (existing) {
        if (existing.tree_sha !== revision.tree) throw new AssetError(502, 'REPOSITORY_INVALID_RESPONSE')
        if (pinned) this.insertFile(db, { userId, serviceId }, existing, pinned.entry, pinned.bytes)
        return { snapshot: summarize(existing), replayed: true }
      }
      if (Number(db.prepare('SELECT count(*) AS total FROM repository_snapshots WHERE service_id=? AND owner_id=?').get(serviceId, userId)?.total) >= 25)
        throw new AssetError(409, 'REPOSITORY_SNAPSHOT_QUOTA')
      const row: SnapshotRow = { id: randomUUID(), platform, remote_id: remote.id, owner_name: remote.owner, repository_name: remote.name, is_private: Number(remote.private),
        credential_ref: alias, ref_kind: ref.kind, ref_value: ref.value, commit_sha: revision.commit, tree_sha: revision.tree, tree_json: JSON.stringify(entries), created_at: now }
      db.prepare('INSERT INTO repository_snapshots(id,service_id,owner_id,platform,remote_id,owner_name,repository_name,is_private,credential_ref,ref_kind,ref_value,commit_sha,tree_sha,tree_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id, serviceId, userId, platform, row.remote_id,
        row.owner_name, row.repository_name, row.is_private, alias, row.ref_kind, row.ref_value, row.commit_sha, row.tree_sha, row.tree_json, now)
      if (pinned) this.insertFile(db, { userId, serviceId }, row, pinned.entry, pinned.bytes)
      return { snapshot: summarize(row), replayed: false }
    })
  }

  saveFile(session: SessionActor, expected: string, id: string, entry: RepositoryEntry, bytes: Buffer, signal: AbortSignal) {
    return this.tx('write', (db, now) => {
      checkSignal(signal)
      const actor = this.actor(session, now, expected), row = this.row(db, actor, id)
      this.insertFile(db, actor, row, entry, bytes)
      return fileView(row, entry.path, entry.sha, bytes)
    })
  }

  private insertFile(db: import('node:sqlite').DatabaseSync, actor: Pick<SessionActor, 'serviceId' | 'userId'>, row: SnapshotRow, entry: RepositoryEntry, bytes: Buffer) {
    const treeEntry = (JSON.parse(row.tree_json) as RepositoryEntry[]).find(candidate => candidate.path === entry.path)
    const sizeMatches = treeEntry?.size === bytes.length || row.platform === 'gitlab' && treeEntry?.size === null
    if (!treeEntry || treeEntry.kind !== 'file' || treeEntry.sha !== entry.sha || !sizeMatches || bytes.length > repositoryLimits.blob)
      throw new AssetError(502, 'REPOSITORY_INVALID_RESPONSE')
    if (db.prepare('SELECT 1 FROM repository_files WHERE snapshot_id=? AND path=?').get(row.id, entry.path)) return
    const count = Number(db.prepare('SELECT count(*) AS total FROM repository_files WHERE snapshot_id=?').get(row.id)?.total)
    const used = Number(db.prepare('SELECT coalesce(sum(length(f.payload)),0) AS total FROM repository_files f JOIN repository_snapshots s ON s.id=f.snapshot_id WHERE s.service_id=? AND s.owner_id=?')
      .get(actor.serviceId, actor.userId)?.total)
    if (count >= 32 || used + bytes.length > 32 * 1024 * 1024) throw new AssetError(409, 'REPOSITORY_FILE_QUOTA')
    db.prepare('INSERT INTO repository_files VALUES(?,?,?,?)').run(row.id, entry.path, entry.sha, bytes)
  }
}

export class RepositoryService {
  private readonly busy = new Set<string>()
  constructor(readonly store: RepositoryStore, private readonly bindings: readonly RepositoryCredentialBinding[], private readonly resolve: ResolveCredential) {}

  private async client(actor: SessionActor, platform: RepositoryPlatform, name: RepositoryName, alias: string, signal: AbortSignal) {
    const Client = platform === 'gitlab' ? GitLabRepository : GitHubRepository
    if (!alias) return new Client(signal)
    if (!alias.startsWith(platform + '_')) throw hidden()
    const allowed = this.bindings.filter(binding => binding.actorId === actor.userId && binding.alias === alias && (binding.platform ?? 'github') === platform &&
      typeof binding.repository === 'string' && binding.repository.toLowerCase() === repositorySlug(name).toLowerCase())
    if (allowed.length !== 1) throw hidden()
    const ref = allowed[0]!.credentialRef
    const refPattern = platform === 'gitlab' ? /^KO_GITLAB_[A-Z0-9_]{1,64}$/ : /^KO_GITHUB_[A-Z0-9_]{1,64}$/
    const tokenPattern = platform === 'gitlab' ? /^glpat-[A-Za-z0-9_-]{16,250}$/ : /^(?:github_pat_|ghp_)[A-Za-z0-9_]{16,250}$/
    if (!refPattern.test(ref)) throw new AssetError(503, 'REPOSITORY_CREDENTIAL_UNCONFIGURED')
    let token: string | undefined
    try { token = await this.resolve(ref) } catch { /* Native credential errors must not escape. */ }
    if (!token || !tokenPattern.test(token)) throw new AssetError(503, 'REPOSITORY_CREDENTIAL_UNCONFIGURED')
    return new Client(signal, token)
  }

  private async run<T>(session: SessionActor, expected: string, operation: (actor: SessionActor) => Promise<T>) {
    const actor = this.store.check(session, expected)
    const key = actor.serviceId + ':' + actor.userId
    if (this.busy.has(key) || this.busy.size >= 8) throw new AssetError(429, 'REPOSITORY_BUSY')
    this.busy.add(key)
    try { return await operation(actor) } finally { this.busy.delete(key) }
  }

  connect(session: SessionActor, expected: string, name: RepositoryName, ref: RepositoryRef, alias: string, signal: AbortSignal, path?: string,
    platform: RepositoryPlatform = 'github') {
    return this.run(session, expected, async actor => {
      const source = await this.client(actor, platform, name, alias, signal)
      this.store.check(session, expected)
      const repository = await source.resolveRepository(name)
      const { entries, ...revision } = await source.resolveSnapshot(repository, ref)
      let pinned: { entry: RepositoryEntry; bytes: Buffer } | undefined
      if (path !== undefined) {
        const entry = entries.find(candidate => candidate.path === path)
        if (!entry) throw hidden()
        pinned = { entry, bytes: await source.readBlob(repository, entry) }
      }
      const confirmed = await source.resolveRepository(repository)
      if (confirmed.id !== repository.id || confirmed.private !== repository.private) throw new AssetError(409, 'REPOSITORY_CHANGED')
      return this.store.saveSnapshot(session, expected, repository, ref, alias, revision, entries, signal, pinned, platform)
    })
  }

  pin(session: SessionActor, expected: string, id: string, path: string, signal: AbortSignal) {
    return this.run(session, expected, async actor => {
      const { row, entry } = this.store.pendingFile(session, expected, id, path)
      if (entry.kind !== 'file') throw new AssetError(422, 'REPOSITORY_NOT_REGULAR_FILE')
      try { return this.store.file(session, id, path) } catch (error) {
        if (!(error instanceof AssetError) || error.status !== 404) throw error
      }
      const name = { owner: row.owner_name, name: row.repository_name }
      const source = await this.client(actor, row.platform, name, row.credential_ref, signal)
      this.store.check(session, expected)
      const repository = await source.resolveRepository(name)
      if (repository.id !== row.remote_id || Number(repository.private) !== row.is_private) throw new AssetError(409, 'REPOSITORY_CHANGED')
      const bytes = await source.readBlob(repository, entry)
      return this.store.saveFile(session, expected, id, entry, bytes, signal)
    })
  }
}
