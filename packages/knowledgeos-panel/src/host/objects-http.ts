import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SessionActor } from './identity.ts'
import { AUTH_ACTIONS, type AuthorizationAction, type ResourceScope } from './authorization.ts'
import { type KnowledgeObjectRecord, type ProbeStorage } from './storage.ts'
import { RecordsError } from './records.ts'

export interface ObjectHttpOptions {
  readonly storage: ProbeStorage
  readonly actorFor: (req: IncomingMessage) => SessionActor | undefined
  readonly origin: () => string | undefined
}

class ObjectHttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message) } }
const json = (res: ServerResponse, status: number, data: unknown): void => { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff'); res.end(JSON.stringify(data)) }
const pathOf = (req: IncomingMessage): string => new URL(req.url ?? '/', 'http://localhost').pathname
const safeObject = (object: KnowledgeObjectRecord, includeBody = true): Record<string, unknown> => ({ id: object.id, service_id: object.serviceId, space_id: object.spaceId, scope: object.scope, project_id: object.projectId, owner_user_id: object.ownerUserId, object_type: object.objectType, title: object.title, ...(includeBody ? { body: object.body } : {}), status: object.status, revision: object.revision, created_at: object.createdAt, updated_at: object.updatedAt })
const readBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => await new Promise((resolve, reject) => { const chunks: Buffer[] = []; let size = 0; req.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 16 * 1024) { reject(new ObjectHttpError(413, 'PAYLOAD_TOO_LARGE', 'request body exceeds the limit')); req.resume() } else chunks.push(chunk) }); req.on('end', () => { try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(); resolve(value as Record<string, unknown>) } catch { reject(new ObjectHttpError(400, 'INVALID_JSON', 'request body is not valid JSON')) } }); req.on('error', () => reject(new ObjectHttpError(400, 'INVALID_JSON', 'request body could not be read'))) })
const keys = (body: Record<string, unknown>, allowed: readonly string[]): void => { if (Object.keys(body).some(key => !allowed.includes(key))) throw new ObjectHttpError(422, 'INPUT_INVALID', 'body contains an unsupported field') }
const action = (value: unknown): AuthorizationAction => { if (typeof value !== 'string' || !(AUTH_ACTIONS as readonly string[]).includes(value)) throw new ObjectHttpError(422, 'INPUT_INVALID', 'action is invalid'); return value as AuthorizationAction }
const text = (value: unknown, name: string, max: number): string => { if (typeof value !== 'string' || value.length < 1 || value.length > max || !value.isWellFormed()) throw new ObjectHttpError(422, 'INPUT_INVALID', `${name} is invalid`); return value }

function trust(req: IncomingMessage, origin: string | undefined, mutation: boolean): void {
  if (origin === undefined || req.headers.host !== new URL(origin).host) throw new ObjectHttpError(403, 'CSRF_REJECTED', 'request authority is not trusted')
  if (req.headers.origin !== undefined && req.headers.origin !== origin) throw new ObjectHttpError(403, 'CSRF_REJECTED', 'request origin is not trusted')
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new ObjectHttpError(403, 'CSRF_REJECTED', 'cross-site request is not trusted')
  if (mutation && req.headers['x-knowledgeos-request'] !== '1') throw new ObjectHttpError(403, 'CSRF_REJECTED', 'missing KnowledgeOS request header')
  if (new URL(req.url ?? '/', origin).search) throw new ObjectHttpError(422, 'INPUT_INVALID', 'query parameters are not supported')
}

function actor(options: ObjectHttpOptions, req: IncomingMessage): SessionActor { const value = options.actorFor(req); if (value === undefined) throw new ObjectHttpError(401, 'SESSION_EXPIRED', 'business session is required'); return value }

export function createObjectHandlers(options: ObjectHttpOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const requestId = randomUUID()
    try {
      const path = pathOf(req); const segments = path.split('/').filter(Boolean); trust(req, options.origin(), req.method !== 'GET')
      const current = actor(options, req); const now = new Date().toISOString()
      if (segments[2] === 'projects' && segments.length === 3 && req.method === 'POST') { const body = await readBody(req); keys(body, ['name']); const project = options.storage.createProject({ id: randomUUID(), serviceId: current.serviceId, ownerUserId: current.userId, name: text(body.name, 'name', 200), now }); json(res, 201, { data: project, meta: { request_id: requestId, service_id: current.serviceId, server_time: now } }); return }
      if (segments[2] === 'projects' && segments.length === 5 && segments[4] === 'memberships' && req.method === 'POST') { const body = await readBody(req); keys(body, ['user_id', 'role', 'valid_from', 'expires_at']); const projectId = segments[3]; if (!options.storage.canManageProject(current, projectId)) throw new ObjectHttpError(404, 'NOT_FOUND', 'project not found'); options.storage.addProjectMembership({ projectId, userId: text(body.user_id, 'user_id', 80), role: body.role === undefined ? 'member' : text(body.role, 'role', 20), validFrom: body.valid_from === undefined ? now : text(body.valid_from, 'valid_from', 40), expiresAt: body.expires_at === undefined ? undefined : text(body.expires_at, 'expires_at', 40) }); res.statusCode = 204; res.end(); return }
      if (segments[2] === 'objects') {
        if (segments.length === 3 && req.method === 'GET') { json(res, 200, { data: options.storage.listObjects(current, 'read', now).map(item => safeObject(item, false)), meta: { request_id: requestId, service_id: current.serviceId, server_time: now } }); return }
        if (segments.length === 3 && req.method === 'POST') {
          const body = await readBody(req)
          keys(body, ['title', 'body', 'object_type', 'scope', 'project_id'])
          const scope = (body.scope ?? 'personal') as ResourceScope
          if (scope !== 'personal' && scope !== 'project') throw new ObjectHttpError(422, 'INPUT_INVALID', 'scope is invalid')
          const projectId = body.project_id === undefined ? undefined : text(body.project_id, 'project_id', 80)
          if (scope === 'project' && projectId === undefined) throw new ObjectHttpError(422, 'INPUT_INVALID', 'project_id is required for project objects')
          if (scope === 'personal' && projectId !== undefined) throw new ObjectHttpError(422, 'INPUT_INVALID', 'project_id is not allowed for personal objects')
          if (scope === 'project' && !options.storage.canCreateProjectObject(current, projectId as string, now)) throw new ObjectHttpError(404, 'NOT_FOUND', 'project not found')
          const title = text(body.title, 'title', 200)
          const content = text(body.body, 'body', 100_000)
          const object = options.storage.createObject({ id: randomUUID(), serviceId: current.serviceId, spaceId: current.personalSpaceId, scope, projectId, ownerUserId: current.userId, objectType: body.object_type === undefined ? 'note' : text(body.object_type, 'object_type', 80), title, body: content, now })
          json(res, 201, { data: safeObject(object), meta: { request_id: requestId, service_id: current.serviceId, server_time: now } }); return
        }
        const objectId = segments[3]; if (objectId === undefined) throw new ObjectHttpError(404, 'NOT_FOUND', 'object not found')
        if (segments.length === 4 && req.method === 'GET') { const object = options.storage.authorizeObject(current, objectId, 'read', now); if (object === undefined) throw new ObjectHttpError(404, 'NOT_FOUND', 'object not found'); json(res, 200, { data: safeObject(object), meta: { request_id: requestId, service_id: current.serviceId, server_time: now } }); return }
        if (segments.length === 4 && req.method === 'PATCH') {
          const body = await readBody(req)
          keys(body, ['expected_revision', 'title', 'body'])
          if (!Number.isInteger(body.expected_revision) || Number(body.expected_revision) < 1) throw new ObjectHttpError(422, 'INPUT_INVALID', 'expected_revision is invalid')
          const result = options.storage.updateObject(current, objectId, Number(body.expected_revision), { title: body.title === undefined ? undefined : text(body.title, 'title', 200), body: body.body === undefined ? undefined : text(body.body, 'body', 100_000) }, now)
          if (result.kind === 'not_found') throw new ObjectHttpError(404, 'NOT_FOUND', 'object not found')
          if (result.kind === 'conflict') throw new ObjectHttpError(409, 'REVISION_CONFLICT', 'object revision has changed')
          json(res, 200, { data: safeObject(result.object), meta: { request_id: requestId, service_id: current.serviceId, server_time: now } }); return
        }
        if (segments.length === 4 && req.method === 'DELETE') { if (!options.storage.deleteObject(current, objectId, now)) throw new ObjectHttpError(404, 'NOT_FOUND', 'object not found'); res.statusCode = 204; res.end(); return }
        if (segments.length === 5 && segments[4] === 'action' && req.method === 'POST') { const body = await readBody(req); keys(body, ['action']); const wanted = action(body.action); if (options.storage.authorizeObject(current, objectId, wanted, now) === undefined) throw new ObjectHttpError(404, 'NOT_FOUND', 'object not found'); json(res, 200, { data: { allowed: true, action: wanted, object_id: objectId }, meta: { request_id: requestId, service_id: current.serviceId, server_time: now } }); return }
      }
      if (segments[2] === 'grants' && segments.length === 3 && req.method === 'POST') { const body = await readBody(req); keys(body, ['object_id', 'subject_type', 'subject_id', 'action', 'valid_from', 'expires_at']); if (body.subject_type !== 'user' && body.subject_type !== 'project') throw new ObjectHttpError(422, 'INPUT_INVALID', 'subject_type is invalid'); const grant = options.storage.grantObject(current, { id: randomUUID(), objectId: text(body.object_id, 'object_id', 80), serviceId: current.serviceId, subjectType: body.subject_type, subjectId: text(body.subject_id, 'subject_id', 80), action: action(body.action), validFrom: body.valid_from === undefined ? now : text(body.valid_from, 'valid_from', 40), expiresAt: body.expires_at === undefined ? undefined : text(body.expires_at, 'expires_at', 40), now }); if (grant === undefined) throw new ObjectHttpError(404, 'NOT_FOUND', 'object not found'); json(res, 201, { data: grant, meta: { request_id: requestId, service_id: current.serviceId, server_time: now } }); return }
      if (segments[2] === 'grants' && segments.length === 4 && segments[3] === 'revoke' && req.method === 'POST') {
        const body = await readBody(req)
        keys(body, ['grant_id', 'id'])
        const grantId = body.grant_id ?? body.id
        if (grantId === undefined) throw new ObjectHttpError(422, 'INPUT_INVALID', 'grant_id is required')
        if (!options.storage.revokeGrant(current, text(grantId, 'grant_id', 80), now)) throw new ObjectHttpError(404, 'NOT_FOUND', 'grant not found')
        res.statusCode = 204; res.end(); return
      }
      throw new ObjectHttpError(404, 'NOT_FOUND', 'route not found')
    } catch (error: unknown) {
      if (error instanceof ObjectHttpError) { json(res, error.status, { code: error.code, message: error.message, request_id: requestId, retryable: false, safe_details: {} }); return }
      if (error instanceof RecordsError) { json(res, 503, { code: error.code, message: 'storage is unavailable', request_id: requestId, retryable: error.retryable, safe_details: {} }); return }
      json(res, 500, { code: 'INTERNAL_ERROR', message: 'internal error', request_id: requestId, retryable: false, safe_details: {} })
    }
  }
}
