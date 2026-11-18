import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { SessionActor } from './identity.ts'
import type { AiService } from './ai-service.ts'
import { AiError, aiText, onlyKeys } from './ai-tools.ts'
import { RecordsError } from './records.ts'

export function createAiHandler(options: { service(): AiService; actorFor(req: IncomingMessage): SessionActor | undefined; origin(): string | undefined }): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const requestId = randomUUID(), controller = new AbortController()
    const disconnect = (): void => { if (!res.writableEnded) controller.abort() }
    req.once('aborted', disconnect); res.once('close', disconnect)
    const send = (status: number, data: unknown): void => { if (res.destroyed) return; res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff'); res.end(JSON.stringify(data)) }
    try {
      const origin = options.origin()
      if (!origin || req.headers.host !== new URL(origin).host || req.headers.origin !== undefined && req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site' || req.method !== 'GET' && req.headers['x-knowledgeos-request'] !== '1') throw new AiError(403, 'CSRF_REJECTED')
      const url = new URL(req.url ?? '/', origin)
      if (url.search) throw new AiError(422, 'INPUT_INVALID')
      const actorNow = (): SessionActor | undefined => options.actorFor(req)
      const actor = actorNow()
      if (!actor) throw new AiError(401, 'AUTH_REQUIRED')
      const service = options.service()
      if (req.method === 'GET' && url.pathname === '/knowledge/v1/ai/status') { send(200, { data: service.status(), meta: { request_id: requestId } }); return }
      if (req.method !== 'POST' || !['/knowledge/v1/ai/prepare', '/knowledge/v1/ai/execute', '/knowledge/v1/ai/cancel'].includes(url.pathname)) throw new AiError(404, 'NOT_FOUND')
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new AiError(415, 'CONTENT_TYPE_INVALID')
      const chunks: Buffer[] = []; let bytes = 0
      for await (const raw of req) { const chunk = Buffer.from(raw as Uint8Array); bytes += chunk.length; if (bytes > 16_384) throw new AiError(413, 'PAYLOAD_TOO_LARGE'); chunks.push(chunk) }
      let body: Record<string, unknown>
      try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); body = value as Record<string, unknown> } catch { throw new AiError(400, 'INVALID_JSON') }
      const current = actorNow()
      if (!current || current.sessionId !== actor.sessionId) throw new AiError(401, 'AUTH_REQUIRED')
      if (url.pathname.endsWith('/prepare')) { send(200, { data: await service.prepare(current, body, controller.signal), meta: { request_id: requestId } }); return }
      if (url.pathname.endsWith('/execute')) { onlyKeys(body, ['prepared_id']); send(200, { data: await service.execute(current, actorNow, aiText(body.prepared_id, 80), controller.signal), meta: { request_id: requestId } }); return }
      onlyKeys(body, ['request_id']); service.cancel(current, aiText(body.request_id, 80)); send(200, { data: { state: 'cancelled' }, meta: { request_id: requestId } })
    } catch (error: unknown) {
      const safe = error instanceof AiError ? error : error instanceof RecordsError ? new AiError(503, error.code) : new AiError(500, 'INTERNAL_ERROR')
      send(safe.status, { code: safe.code, message: safe.code, request_id: requestId, retryable: ['MODEL_TIMEOUT', 'STORAGE_BUSY', 'PROVIDER_RATE_LIMITED'].includes(safe.code), safe_details: {} })
    } finally { req.removeListener('aborted', disconnect); res.removeListener('close', disconnect) }
  }
}
