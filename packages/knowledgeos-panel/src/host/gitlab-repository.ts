import { createHash } from 'node:crypto'
import { AssetError } from './asset-store.ts'
import {
  badRepository, invalidRemote, isRepositoryPath, oversized, remoteObject, remoteSha, repositoryJson, repositoryLimits, repositorySlug,
  type RepositoryEntry, type RepositoryIdentity, type RepositoryName, type RepositoryPort, type RepositoryRef,
} from './github-repository.ts'

const origin = 'https://gitlab.com/api/v4'
const segment = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/

export function gitLabName(value: unknown): RepositoryName {
  if (typeof value !== 'string' || value.length > 255) throw badRepository()
  const parts = value.replace(/^https:\/\/gitlab\.com\//i, '').split('/')
  if (parts.length < 2 || parts.some(part => !segment.test(part) || /\.(?:git|atom)$/i.test(part))) throw badRepository()
  const name = parts.pop()!
  return { owner: parts.join('/'), name }
}

interface TreeEntry extends RepositoryEntry { mode: string }

function parseTreeEntry(value: unknown): TreeEntry {
  const { id, path, mode, type, name } = remoteObject(value)
  if (!isRepositoryPath(path) || name !== path.split('/').at(-1)) throw invalidRemote()
  const kind = type === 'tree' && mode === '040000' ? 'directory' :
    type === 'commit' && mode === '160000' ? 'submodule' :
    type === 'blob' && mode === '120000' ? 'symlink' :
    type === 'blob' && (mode === '100644' || mode === '100755') ? 'file' : undefined
  if (!kind || typeof mode !== 'string') throw invalidRemote()
  return { path, mode, sha: remoteSha(id), kind, size: null }
}

function treeDigest(entries: readonly TreeEntry[]): string {
  const sorted = entries.map(entry => {
    const name = entry.path.slice(entry.path.lastIndexOf('/') + 1)
    return { entry, name, order: Buffer.from(name + (entry.kind === 'directory' ? '/' : '\0')) }
  }).sort((a, b) => Buffer.compare(a.order, b.order))
  const bytes = Buffer.concat(sorted.flatMap(({ entry, name }) => [
    Buffer.from(entry.mode.replace(/^0/, '') + ' ' + name + '\0'), Buffer.from(entry.sha, 'hex'),
  ]))
  return createHash('sha1').update('tree ' + bytes.length + '\0').update(bytes).digest('hex')
}

function validateTree(entries: ReadonlyMap<string, TreeEntry>) {
  const children = new Map<string, TreeEntry[]>()
  for (const entry of entries.values()) {
    const slash = entry.path.lastIndexOf('/')
    const parent = slash < 0 ? '' : entry.path.slice(0, slash)
    if (parent && entries.get(parent)?.kind !== 'directory') throw invalidRemote()
    const group = children.get(parent) ?? []
    group.push(entry)
    children.set(parent, group)
  }
  for (const entry of entries.values()) {
    if (entry.kind === 'directory' && entry.sha !== treeDigest(children.get(entry.path) ?? [])) throw invalidRemote()
  }
  return treeDigest(children.get('') ?? [])
}

export class GitLabRepository implements RepositoryPort {
  constructor(private readonly operation: AbortSignal, private readonly token?: string, private readonly transport: typeof fetch = fetch) {}

  private get(path: string, limit: number) {
    const headers: Record<string, string> = { accept: 'application/json', 'user-agent': 'KnowledgeOS' }
    if (this.token) headers['private-token'] = this.token
    return repositoryJson(origin + path, limit, this.operation, headers, this.transport)
  }

  async resolveRepository(name: RepositoryName) {
    const data = remoteObject(await this.get('/projects/' + encodeURIComponent(repositorySlug(name)), 128 * 1024))
    if (typeof data.id !== 'number' || !Number.isSafeInteger(data.id) || data.id <= 0 ||
        !['public', 'internal', 'private'].includes(String(data.visibility))) throw invalidRemote()
    const isPrivate = data.visibility !== 'public'
    if (!this.token && isPrivate) throw new AssetError(404, 'REMOTE_REPOSITORY_NOT_FOUND')
    let canonical: RepositoryName
    try { canonical = gitLabName(data.path_with_namespace) } catch { throw invalidRemote() }
    if (data.path_with_namespace !== repositorySlug(canonical) || repositorySlug(canonical).toLowerCase() !== repositorySlug(name).toLowerCase())
      throw invalidRemote()
    return { ...canonical, id: data.id, private: isPrivate }
  }

  async resolveSnapshot(repo: RepositoryIdentity, ref: RepositoryRef) {
    const base = '/projects/' + repo.id + '/repository/'
    const kind = ref.kind === 'commit' ? 'commits' : ref.kind === 'branch' ? 'branches' : 'tags'
    const selected = remoteObject(await this.get(base + kind + '/' + encodeURIComponent(ref.value), 128 * 1024))
    if (ref.kind !== 'commit' && selected.name !== ref.value) throw invalidRemote()
    const commit = remoteSha(ref.kind === 'commit' ? selected.id : remoteObject(selected.commit).id)
    if (ref.kind === 'commit' && commit !== ref.value) throw invalidRemote()
    const entries = new Map<string, TreeEntry>()
    let used = 0
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({ ref: commit, recursive: 'true', per_page: '100', page: String(page) })
      const batch = await this.get(base + 'tree?' + query, repositoryLimits.tree - used)
      if (!Array.isArray(batch) || batch.length > 100) throw invalidRemote()
      used += Buffer.byteLength(JSON.stringify(batch))
      if (used > repositoryLimits.tree || entries.size + batch.length > repositoryLimits.files) throw oversized()
      for (const item of batch) {
        const parsed = parseTreeEntry(item)
        if (entries.has(parsed.path)) throw invalidRemote()
        entries.set(parsed.path, parsed)
      }
      if (batch.length < 100) break
    }
    return { commit, tree: validateTree(entries), entries: Array.from(entries.values(), ({ mode: _mode, ...entry }) => entry) }
  }

  async readBlob(repo: RepositoryIdentity, entry: RepositoryEntry) {
    if (entry.kind !== 'file') throw new AssetError(422, 'REPOSITORY_NOT_REGULAR_FILE')
    const row = remoteObject(await this.get('/projects/' + repo.id + '/repository/blobs/' + remoteSha(entry.sha), 800 * 1024))
    if (row.sha !== entry.sha || typeof row.size !== 'number' || !Number.isSafeInteger(row.size) || row.size < 0 ||
        row.encoding !== 'base64' || typeof row.content !== 'string') throw invalidRemote()
    if (row.size > repositoryLimits.blob) throw oversized()
    const encoded = row.content.replace(/\r?\n/g, ''), bytes = Buffer.from(encoded, 'base64')
    if (bytes.toString('base64') !== encoded || bytes.length !== row.size ||
        (entry.size !== null && entry.size !== bytes.length) || createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') !== entry.sha)
      throw invalidRemote()
    return bytes
  }
}
