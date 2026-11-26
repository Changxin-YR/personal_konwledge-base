import { AssetError } from './asset-store.ts'
import {
  badRepository, decodeRepositoryBlob, invalidRemote, oversized, parseRepositoryTree, remoteObject, remoteSha, repoPath,
  repositoryJson, repositoryLimits, repositorySlug,
  type RepositoryEntry, type RepositoryIdentity, type RepositoryName, type RepositoryPort, type RepositoryRef,
} from './github-repository.ts'

const origin = 'https://gitee.com/api/v5'
const ownerPattern = /^[a-z0-9_][a-z0-9_-]{0,99}$/i
const projectPattern = /^[a-z0-9_][a-z0-9_.-]{0,99}$/i

export function giteeName(value: unknown): RepositoryName {
  if (typeof value !== 'string' || value.length > 220) throw badRepository()
  const parts = value.replace(/^https:\/\/gitee\.com\//i, '').split('/')
  const [owner, name] = parts
  if (parts.length !== 2 || !owner || !name || !ownerPattern.test(owner) || !projectPattern.test(name)) throw badRepository()
  return { owner, name }
}

export class GiteeRepository implements RepositoryPort {
  constructor(private readonly operation: AbortSignal, private readonly token?: string, private readonly transport: typeof fetch = fetch) {}

  private async get(path: string, limit: number) {
    const headers: Record<string, string> = { accept: 'application/json', 'user-agent': 'KnowledgeOS' }
    if (this.token) headers.authorization = 'Bearer ' + this.token
    return remoteObject(await repositoryJson(origin + path, limit, this.operation, headers, this.transport))
  }

  async resolveRepository(name: RepositoryName) {
    const data = await this.get(repoPath(name), 128 * 1024)
    if (typeof data.id !== 'number' || !Number.isSafeInteger(data.id) || data.id <= 0 ||
        typeof data.private !== 'boolean' || typeof data.public !== 'boolean' || data.private && data.public) throw invalidRemote()
    const isPrivate = data.private || !data.public
    if (!this.token && isPrivate) throw new AssetError(404, 'REMOTE_REPOSITORY_NOT_FOUND')
    let canonical: RepositoryName
    try { canonical = giteeName(data.full_name) } catch { throw invalidRemote() }
    if (data.full_name !== repositorySlug(canonical) || repositorySlug(canonical).toLowerCase() !== repositorySlug(name).toLowerCase())
      throw invalidRemote()
    return { ...canonical, id: data.id, private: isPrivate }
  }

  async resolveSnapshot(repo: RepositoryIdentity, ref: RepositoryRef) {
    const path = repoPath(repo)
    const target = encodeURIComponent(ref.kind === 'tag' ? 'refs/tags/' + ref.value : ref.value)
    const row = await this.get(path + (ref.kind === 'branch' ? '/branches/' : '/commits/') + target, 256 * 1024)
    if (ref.kind === 'branch' && row.name !== ref.value) throw invalidRemote()
    const selected = ref.kind === 'branch' ? remoteObject(row.commit) : row
    const commit = remoteSha(selected.sha)
    if (ref.kind === 'commit' && commit !== ref.value) throw invalidRemote()
    const tree = remoteSha(remoteObject(remoteObject(selected.commit).tree).sha)
    const manifest = await this.get(path + '/git/trees/' + tree + '?recursive=1', repositoryLimits.tree)
    return { commit, tree, entries: parseRepositoryTree(manifest, tree, '40000', true) }
  }

  async readBlob(repo: RepositoryIdentity, entry: RepositoryEntry) {
    if (entry.kind !== 'file' || entry.size === null) throw new AssetError(422, 'REPOSITORY_NOT_REGULAR_FILE')
    if (entry.size > repositoryLimits.blob) throw oversized()
    return decodeRepositoryBlob(await this.get(repoPath(repo) + '/git/blobs/' + remoteSha(entry.sha), 800 * 1024), entry)
  }
}
