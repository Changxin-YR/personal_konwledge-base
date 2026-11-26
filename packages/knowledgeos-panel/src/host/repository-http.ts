import type { IncomingMessage, ServerResponse } from 'node:http'
import { AssetError } from './asset-store.ts'
import { badRepository, isRepositoryPath, repositoryName, repositoryRef } from './github-repository.ts'
import { gitLabName } from './gitlab-repository.ts'
import { UUID_PATTERN } from './http.ts'
import type { SessionActor } from './identity.ts'
import type { PeerScope } from './identity-peer.ts'
import { credentialAlias, type RepositoryService } from './repository-store.ts'

export const repositoryApi = '/knowledge/v1/repositories'
const maximumBody = 4096
async function body(req: IncomingMessage, fields: string[]): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new AssetError(415, 'JSON_REQUIRED')
  if (Number(req.headers['content-length']) > maximumBody) throw new AssetError(413, 'BODY_TOO_LARGE')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > maximumBody) { req.resume(); throw new AssetError(413, 'BODY_TOO_LARGE') }
    chunks.push(chunk)
  }
  let decoded
  try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size))) } catch { throw badRepository() }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded) || Object.keys(decoded).some(key => !fields.includes(key))) throw badRepository()
  return decoded
}
const id = (value: unknown) => { if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw badRepository(); return value }
const pathValue = (value: unknown) => { if (!isRepositoryPath(value)) throw badRepository(); return value }

export function createRepositoryHandler(service: RepositoryService, origin: () => string | undefined,
  actorFor: (req: IncomingMessage) => SessionActor | undefined, hostSignal: AbortSignal) {
  return async (req: IncomingMessage, res: ServerResponse, peer?: PeerScope) => {
    const disconnected = new AbortController()
    const close = () => { if (!res.writableFinished) disconnected.abort() }
    res.once('close', close)
    const signal = AbortSignal.any([hostSignal, disconnected.signal, ...(peer?.signal ? [peer.signal] : [])])
    const send = (status: number, data: unknown) => {
      if (res.destroyed) return
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      res.end(JSON.stringify(data))
    }
    try {
      const base = origin(), method = req.method
      if (!base || req.headers.host !== new URL(base).host || req.headers['sec-fetch-site'] === 'cross-site' ||
          req.headers.origin !== undefined && req.headers.origin !== base || method !== 'GET' && req.headers['x-knowledgeos-request'] !== '1')
        throw new AssetError(403, 'CSRF_REJECTED')
      const url = new URL(req.url ?? '/', base)
      if (url.origin !== base) throw new AssetError(403, 'CSRF_REJECTED')
      const actor = actorFor(req)
      if (!actor) throw new AssetError(401, 'AUTH_REQUIRED')
      const result = (status: number, output: object) => send(status, { data: { actor_id: actor.userId, ...output } })
      const parts = url.pathname.slice(repositoryApi.length).split('/')
      if (url.pathname === repositoryApi) {
        if (url.search) throw badRepository()
        if (method === 'GET') return result(200, { snapshots: service.store.list(actor) })
        if (method === 'POST') {
          const input = await body(req, ['actor_id', 'platform', 'repository', 'ref_kind', 'ref_value', 'credential_ref', 'path'])
          const platform = 'platform' in input ? input.platform : 'github'
          if (platform !== 'github' && platform !== 'gitlab') throw badRepository()
          const alias = 'credential_ref' in input ? input.credential_ref : ''
          if (typeof alias !== 'string' || alias && !credentialAlias.test(alias)) throw badRepository()
          const name = platform === 'gitlab' ? gitLabName(input.repository) : repositoryName(input.repository)
          const saved = await service.connect(actor, id(input.actor_id), name, repositoryRef(input.ref_kind, input.ref_value), alias, signal,
            'path' in input ? pathValue(input.path) : undefined, platform)
          return result(saved.replayed ? 200 : 201, saved)
        }
      } else if (url.pathname.startsWith(repositoryApi + '/') && (parts.length === 2 || parts.length === 3 && parts[2] === 'files')) {
        const snapshot = id(parts[1])
        if (method === 'GET' && parts.length === 2 && !url.search) return result(200, service.store.detail(actor, snapshot))
        if (parts.length === 3 && method === 'GET' && url.searchParams.size === 1 && url.searchParams.has('path'))
          return result(200, { file: service.store.file(actor, snapshot, pathValue(url.searchParams.get('path'))) })
        if (parts.length === 3 && method === 'POST' && !url.search) {
          const input = await body(req, ['actor_id', 'path'])
          return result(200, { file: await service.pin(actor, id(input.actor_id), snapshot, pathValue(input.path), signal) })
        }
      }
      throw new AssetError(404, 'NOT_FOUND')
    } catch (error) {
      send(error instanceof AssetError ? error.status : 503, { code: error instanceof AssetError ? error.code : 'REPOSITORY_UNAVAILABLE' })
    } finally { res.off('close', close) }
  }
}
