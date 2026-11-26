import type { IncomingMessage, ServerResponse } from 'node:http'
import { AssetError } from './asset-store.ts'
import { UUID_PATTERN } from './http.ts'
import { DOMAINS, type Domain, type SessionActor } from './identity.ts'
import { knowledgeKinds, type KnowledgeDraft, type KnowledgeKind, type KnowledgeSourceInput, type KnowledgeStore } from './knowledge-store.ts'

export const knowledgeApi = '/knowledge/v1/knowledge-items'
const invalid = () => new AssetError(422, 'INVALID_KNOWLEDGE_INPUT')
const draftFields = ['title','definition','plain_explanation','context','sources']

function object(value: unknown, allowed: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw invalid()
  return value as Record<string, unknown>
}

function uuid(value: unknown) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw invalid()
  return value
}

function revision(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) throw invalid()
  return value
}

function text(value: unknown, max: number, optional = false) {
  if (value === undefined && optional) return ''
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || !optional && !value.trim()) throw invalid()
  return value.trim()
}

function draft(value: Record<string, unknown>): KnowledgeDraft {
  if (!Array.isArray(value.sources) || value.sources.length > 8) throw invalid()
  const seen = new Set<string>()
  const sources: KnowledgeSourceInput[] = value.sources.map(source => {
    const raw = object(source, ['type','id','revision'])
    const id = uuid(raw.id)
    if (raw.type !== 'note' && raw.type !== 'term' && raw.type !== 'citation') throw invalid()
    const identity = raw.type + ':' + id
    if (seen.has(identity)) throw invalid()
    seen.add(identity)
    if (raw.type === 'note') return { type: raw.type, id, revision: revision(raw.revision) }
    if ('revision' in raw) throw invalid()
    return { type: raw.type, id }
  })
  return { title: text(value.title, 160), definition: text(value.definition, 4000),
    plain_explanation: text(value.plain_explanation, 2000, true), context: text(value.context, 2000, true), sources }
}

async function body(req: IncomingMessage) {
  const limit = 48_000, parts: Buffer[] = []
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new AssetError(415, 'JSON_REQUIRED')
  if (Number(req.headers['content-length']) > limit) throw new AssetError(413, 'BODY_TOO_LARGE')
  let total = 0
  for await (const part of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.from(part); total += bytes.length
    if (total > limit) { req.resume(); throw new AssetError(413, 'BODY_TOO_LARGE') }
    parts.push(bytes)
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts, total))) as unknown }
  catch { throw invalid() }
}

export function createKnowledgeHandler(store: KnowledgeStore, origin: () => string | undefined, actorFor: (req: IncomingMessage) => SessionActor | undefined) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, data: object) => {
      if (res.destroyed) return
      res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff' })
      res.end(JSON.stringify(data))
    }
    try {
      const base = origin(), method = req.method
      if (!base || req.headers.host !== new URL(base).host || req.headers['sec-fetch-site'] === 'cross-site' ||
          (req.headers.origin !== undefined && req.headers.origin !== base) || (method !== 'GET' && req.headers['x-knowledgeos-request'] !== '1'))
        throw new AssetError(403, 'CSRF_REJECTED')
      const url = new URL(req.url ?? '/', base)
      if (url.origin !== base) throw new AssetError(403, 'CSRF_REJECTED')
      if (url.search) throw invalid()
      const actor = actorFor(req)
      if (!actor) throw new AssetError(401, 'AUTH_REQUIRED')
      const success = (status: number, output: object) => send(status, { data: { actor_id: actor.userId, ...output } })
      const suffix = url.pathname.slice(knowledgeApi.length)
      const item = /^\/([a-f0-9-]+)(?:\/(confirm|versions)(?:\/([1-9][0-9]{0,15}))?)?$/.exec(suffix)
      if (method === 'GET') {
        if (url.pathname === knowledgeApi) return success(200, { items: store.list(actor) })
        if (item && item[2] !== 'confirm') {
          const id = uuid(item[1])
          if (item[2] === 'versions' && item[3] === undefined) return success(200, { versions: store.history(actor, id) })
          return success(200, { item: store.get(actor, id, item[3] === undefined ? undefined : revision(Number(item[3]))) })
        }
      }
      if (method === 'POST' && (url.pathname === knowledgeApi || item && item[2] && !item[3])) {
        if (uuid(req.headers['x-knowledgeos-reader-actor']) !== actor.userId) throw new AssetError(409, 'ACTOR_CHANGED')
        const key = uuid(req.headers['idempotency-key']), raw = await body(req), current = actorFor(req)
        if (res.destroyed) return
        if (!current || current.sessionId !== actor.sessionId || current.userId !== actor.userId || current.serviceId !== actor.serviceId)
          throw new AssetError(401, 'AUTH_REQUIRED')
        if (url.pathname === knowledgeApi) {
          const data = object(raw, ['kind','domain',...draftFields])
          if (!knowledgeKinds.includes(data.kind as KnowledgeKind) || !DOMAINS.includes(data.domain as Domain)) throw invalid()
          const result = store.create(current, key, { ...draft(data), kind: data.kind as KnowledgeKind, domain: data.domain as Domain })
          return success(result.replayed ? 200 : 201, result)
        }
        const id = uuid(item![1]), confirm = item![2] === 'confirm'
        const data = object(raw, confirm ? ['expected_revision'] : ['expected_revision',...draftFields])
        const result = store.update(current, key, id, revision(data.expected_revision), confirm ? undefined : draft(data))
        return success(result.replayed ? 200 : 201, result)
      }
      throw new AssetError(404, 'NOT_FOUND')
    } catch (error) {
      send(error instanceof AssetError ? error.status : 503, { code: error instanceof AssetError ? error.code : 'KNOWLEDGE_UNAVAILABLE' })
    }
  }
}
