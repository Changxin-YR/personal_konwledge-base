import { AssetError } from './asset-store.ts'
import { validateRepositoryTree, type TreeEntry } from './repository-tree.ts'
import {
  badRepository, decodeRepositoryBlob, invalidRemote, isRepositoryPath, oversized, remoteObject, remoteSha, repositoryJson, repositoryLimits, repositorySlug,
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
    return { commit, tree: validateRepositoryTree(entries), entries: Array.from(entries.values(), ({ mode: _mode, ...entry }) => entry) }
  }

  async readBlob(repo: RepositoryIdentity, entry: RepositoryEntry) {
    if (entry.kind !== 'file') throw new AssetError(422, 'REPOSITORY_NOT_REGULAR_FILE')
    const row = remoteObject(await this.get('/projects/' + repo.id + '/repository/blobs/' + remoteSha(entry.sha), 800 * 1024))
    return decodeRepositoryBlob(row, entry)
  }
}
