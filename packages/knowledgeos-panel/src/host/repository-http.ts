import type { IncomingMessage, ServerResponse } from 'node:http'
import { CodeExplanationError } from '../domain/code-explanation.ts'
import type { AiService } from './ai-service.ts'
import { AiError } from './ai-tools.ts'
import { codeLocation, explainPinnedCode, explainPinnedModule, readCodeCitation } from './repository-explanation.ts'
import { AssetError } from './asset-store.ts'
import { badRepository, isRepositoryPath, repositoryName, repositoryRef } from './github-repository.ts'
import { gitLabName } from './gitlab-repository.ts'
import { giteeName } from './gitee-repository.ts'
import { UUID_PATTERN } from './http.ts'
import type { SessionActor } from './identity.ts'
import type { PeerScope } from './identity-peer.ts'
import { credentialAlias, type RepositoryService } from './repository-store.ts'

export const repositoryApi = '/knowledge/v1/repositories'
async function body(req: IncomingMessage, fields: string[], maximumBody = 4096): Promise<Record<string, unknown>> {
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
const names = { github: repositoryName, gitlab: gitLabName, gitee: giteeName }

export function createRepositoryHandler(service: RepositoryService, origin: () => string | undefined,
  actorFor: (req: IncomingMessage) => SessionActor | undefined, hostSignal: AbortSignal, ai: () => AiService) {
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
          if (platform !== 'github' && platform !== 'gitlab' && platform !== 'gitee') throw badRepository()
          const alias = 'credential_ref' in input ? input.credential_ref : ''
          if (typeof alias !== 'string' || alias && !credentialAlias.test(alias)) throw badRepository()
          const name = names[platform](input.repository)
          const saved = await service.connect(actor, id(input.actor_id), name, repositoryRef(input.ref_kind, input.ref_value), alias, signal,
            'path' in input ? pathValue(input.path) : undefined, platform)
          return result(saved.replayed ? 200 : 201, saved)
        }
      } else if (parts.length === 3 && url.pathname.startsWith(repositoryApi + '/')) {
        const snapshot = id(parts[1])
        if (parts[2] === 'explain' && method === 'POST' && !url.search) {
          const input = await body(req, ['actor_id', 'path', 'commit', 'blob_sha', 'start_line', 'end_line', 'question'], 8192)
          const current = () => {
            const live = actorFor(req)
            if (!live || live.sessionId !== actor.sessionId || live.userId !== actor.userId || live.serviceId !== actor.serviceId) throw new AssetError(401, 'AUTH_REQUIRED')
            return live
          }
          const explanation = await explainPinnedCode(service.store, ai(), current, id(input.actor_id), snapshot, codeLocation(input), input.question, signal)
          return result(200, { explanation })
        }
        if (parts[2] === 'module-explain' && method === 'POST' && !url.search) {
          const input = await body(req, ['actor_id', 'sources', 'question'], 32_768)
          const current = () => {
            const live = actorFor(req)
            if (!live || live.sessionId !== actor.sessionId || live.userId !== actor.userId || live.serviceId !== actor.serviceId) throw new AssetError(401, 'AUTH_REQUIRED')
            return live
          }
          const explanation = await explainPinnedModule(service.store, ai(), current, id(input.actor_id), snapshot, input.sources, input.question, signal)
          return result(200, { explanation })
        }
        if (parts[2] === 'citation' && method === 'GET') {
          const keys = ['path', 'commit', 'blob_sha', 'start_line', 'end_line']
          const query = url.searchParams
          if (query.size !== keys.length || !keys.every(key => query.has(key))) throw badRepository()
          const number = (key: string) => /^[1-9]\d{0,8}$/.test(query.get(key)!) ? Number(query.get(key)) : NaN
          const location = codeLocation({ ...Object.fromEntries(query), start_line: number('start_line'), end_line: number('end_line') })
          return result(200, { citation: readCodeCitation(service.store, actor, snapshot, location) })
        }
        if (parts[2] !== 'files') throw new AssetError(404, 'NOT_FOUND')
        if (method === 'GET' && url.searchParams.size === 1 && url.searchParams.has('path'))
          return result(200, { file: service.store.file(actor, snapshot, pathValue(url.searchParams.get('path'))) })
        if (method === 'POST' && !url.search) {
          const input = await body(req, ['actor_id', 'path'])
          return result(200, { file: await service.pin(actor, id(input.actor_id), snapshot, pathValue(input.path), signal) })
        }
      } else if (parts.length === 2 && url.pathname.startsWith(repositoryApi + '/') && method === 'GET' && !url.search) {
        return result(200, service.store.detail(actor, id(parts[1])))
      }
      throw new AssetError(404, 'NOT_FOUND')
    } catch (error) {
      const known = error instanceof AssetError || error instanceof AiError || error instanceof CodeExplanationError
      send(known ? error.status : 503, { code: known ? error.code : 'REPOSITORY_UNAVAILABLE' })
    } finally { res.off('close', close) }
  }
}
