import { createHash } from 'node:crypto'
import { AssetError } from './asset-store.ts'

export const repositoryLimits = { files: 5000, blob: 512 * 1024, tree: 2 * 1024 * 1024 } as const
export const badRepository = () => new AssetError(422, 'INVALID_REPOSITORY_INPUT')
const invalidRemote = () => new AssetError(502, 'REPOSITORY_INVALID_RESPONSE')
const oversized = () => new AssetError(413, 'REPOSITORY_LIMIT_EXCEEDED')
const unavailable = () => new AssetError(503, 'REPOSITORY_UNAVAILABLE')
export const sha40 = /^[a-f0-9]{40}$/
const ownerPattern = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i
const repoPattern = /^[a-z0-9_.-]{1,100}$/i
const forbiddenPath = /[\p{Cc}\p{Cf}\p{Cs}\\]/u

export interface RepositoryName { owner: string; name: string }
export interface RepositoryIdentity extends RepositoryName { id: number; private: boolean }
export type RepositoryRef = { kind: 'branch' | 'tag' | 'commit'; value: string }
export interface RepositoryEntry {
  path: string; sha: string; kind: 'directory' | 'file' | 'symlink' | 'submodule'; size: number | null
}
export interface RepositoryPort {
  resolveRepository(name: RepositoryName): Promise<RepositoryIdentity>
  resolveRef(repo: RepositoryIdentity, ref: RepositoryRef): Promise<{ commit: string; tree: string }>
  readTree(repo: RepositoryIdentity, sha: string): Promise<RepositoryEntry[]>
  readBlob(repo: RepositoryIdentity, entry: RepositoryEntry): Promise<Buffer>
}

export function repositoryName(value: unknown): RepositoryName {
  if (typeof value !== 'string' || value.length > 160) throw badRepository()
  const pieces = value.replace(/^https:\/\/github\.com\//i, '').split('/')
  const [owner, name] = pieces
  if (pieces.length !== 2 || !owner || !name || !ownerPattern.test(owner) || !repoPattern.test(name) || name === '.' || name === '..') throw badRepository()
  return { owner, name }
}

export function repositoryRef(kind: unknown, value: unknown): RepositoryRef {
  if (typeof value !== 'string' || !value || value.length > 200) throw badRepository()
  if (kind === 'commit' && sha40.test(value)) return { kind, value }
  if ((kind === 'branch' || kind === 'tag') && /^[A-Za-z0-9_./-]+$/.test(value) && !value.includes('..') &&
      !value.endsWith('.') && !value.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'))) return { kind, value }
  throw badRepository()
}

export function isRepositoryPath(value: unknown): value is string {
  return typeof value === 'string' && !!value.length && Buffer.byteLength(value) <= 1024 && !forbiddenPath.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..')
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidRemote()
  return value as Record<string, unknown>
}
const remoteSha = (value: unknown) => {
  if (typeof value !== 'string' || !sha40.test(value)) throw invalidRemote()
  return value
}
export const repositorySlug = (repo: RepositoryName) => repo.owner + '/' + repo.name
const repoPath = (repo: RepositoryName) => '/repos/' + encodeURIComponent(repo.owner) + '/' + encodeURIComponent(repo.name)

export class GitHubRepository implements RepositoryPort {
  constructor(private readonly operation: AbortSignal, private readonly token?: string, private readonly transport: typeof fetch = fetch) {}

  private async get(path: string, limit: number) {
    const signal = AbortSignal.any([this.operation, AbortSignal.timeout(12_000)])
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      signal.throwIfAborted()
      const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'KnowledgeOS' }
      if (this.token) headers.authorization = 'Bearer ' + this.token
      const response = await this.transport('https://api.github.com' + path, { method: 'GET', redirect: 'manual', cache: 'no-store', signal, headers })
      reader = response.body?.getReader()
      if (response.status >= 300 && response.status < 400) throw new AssetError(502, 'REPOSITORY_REDIRECT_REJECTED')
      if (response.status === 429 || response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))
        throw new AssetError(429, 'REPOSITORY_RATE_LIMIT')
      if ([401, 403, 404].includes(response.status)) throw new AssetError(404, 'REMOTE_REPOSITORY_NOT_FOUND')
      if (!response.ok || !reader) throw unavailable()
      if (Number(response.headers.get('content-length')) > limit) throw oversized()
      let size = 0
      const parts: Uint8Array[] = []
      while (true) {
        signal.throwIfAborted()
        const treePart = await reader.read()
        if (treePart.done) break
        size += treePart.value.length
        if (size > limit) throw oversized()
        parts.push(treePart.value)
      }
      signal.throwIfAborted()
      try { return object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts, size)))) }
      catch { throw invalidRemote() }
    } catch (error) {
      if (this.operation.aborted) throw new AssetError(409, 'REPOSITORY_CANCELLED')
      if (signal.aborted) throw new AssetError(504, 'REPOSITORY_TIMEOUT')
      if (error instanceof AssetError) throw error
      throw unavailable()
    } finally { if (reader) void reader.cancel().catch(() => {}) }
  }

  async resolveRepository(name: RepositoryName) {
    const row = await this.get(repoPath(name), 128 * 1024)
    if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.private !== 'boolean') throw invalidRemote()
    if (!this.token && (row.private || row.visibility !== 'public')) throw new AssetError(404, 'REMOTE_REPOSITORY_NOT_FOUND')
    let canonical: RepositoryName
    try { canonical = repositoryName(row.full_name) } catch { throw invalidRemote() }
    if (row.full_name !== repositorySlug(canonical) || repositorySlug(canonical).toLowerCase() !== repositorySlug(name).toLowerCase()) throw invalidRemote()
    return { ...canonical, id: row.id, private: row.private }
  }

  async resolveRef(repo: RepositoryIdentity, ref: RepositoryRef) {
    const spec = ref.kind === 'commit' ? ref.value : 'refs/' + (ref.kind === 'branch' ? 'heads/' : 'tags/') + ref.value
    const row = await this.get(repoPath(repo) + '/commits/' + encodeURIComponent(spec), 2 * 1024 * 1024)
    const commit = remoteSha(row.sha)
    if (ref.kind === 'commit' && commit !== ref.value) throw invalidRemote()
    return { commit, tree: remoteSha(object(object(row.commit).tree).sha) }
  }

  async readTree(repo: RepositoryIdentity, sha: string): Promise<RepositoryEntry[]> {
    const row = await this.get(repoPath(repo) + '/git/trees/' + remoteSha(sha) + '?recursive=1', repositoryLimits.tree)
    if (row.sha !== sha || !Array.isArray(row.tree) || typeof row.truncated !== 'boolean') throw invalidRemote()
    if (row.truncated || row.tree.length > repositoryLimits.files) throw oversized()
    const seen = new Map<string, RepositoryEntry['kind']>()
    const entries = row.tree.map((candidate: unknown): RepositoryEntry => {
      const { path, sha, mode, type, size } = object(candidate)
      if (!isRepositoryPath(path) || seen.has(path)) throw invalidRemote()
      const kind = type === 'tree' && mode === '040000' ? 'directory' :
        type === 'commit' && mode === '160000' ? 'submodule' :
        type === 'blob' && mode === '120000' ? 'symlink' :
        type === 'blob' && (mode === '100644' || mode === '100755') ? 'file' : undefined
      if (!kind || (kind === 'file' && (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0))) throw invalidRemote()
      seen.set(path, kind)
      return { path, sha: remoteSha(sha), kind, size: kind === 'file' ? size as number : null }
    })
    for (const { path } of entries) {
      const separator = path.lastIndexOf('/')
      if (separator >= 0 && seen.get(path.slice(0, separator)) !== 'directory') throw invalidRemote()
    }
    return entries
  }

  async readBlob(repo: RepositoryIdentity, entry: RepositoryEntry): Promise<Buffer> {
    if (entry.kind !== 'file' || entry.size === null) throw new AssetError(422, 'REPOSITORY_NOT_REGULAR_FILE')
    if (entry.size > repositoryLimits.blob) throw oversized()
    const row = await this.get(repoPath(repo) + '/git/blobs/' + remoteSha(entry.sha), 800 * 1024)
    if (row.sha !== entry.sha || row.size !== entry.size || row.encoding !== 'base64' || typeof row.content !== 'string') throw invalidRemote()
    const encoded = row.content.replace(/\r?\n/g, '')
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.toString('base64') !== encoded || bytes.length !== entry.size ||
        createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') !== entry.sha) throw invalidRemote()
    return bytes
  }
}
