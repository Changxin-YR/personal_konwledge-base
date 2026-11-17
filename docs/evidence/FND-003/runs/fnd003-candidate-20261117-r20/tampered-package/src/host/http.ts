/**
 * HTTP boundary for the FND-002 records probe.
 *
 * Owns method/media/body/field validation, stable error mapping, and the exact
 * success body. It never accepts SQL, paths, migration versions, identity, or
 * fault switches from the client.
 */
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CreateRecordResult, ProbeRecord } from './records.ts'
import { RecordsError } from './records.ts'

/** Maximum bytes read from a create request body. */
export const MAX_REQUEST_BODY_BYTES = 16 * 1024
/** Maximum content bytes after strict UTF-8 decoding. */
export const MAX_CONTENT_BYTES = 4096
/** Canonical lowercase UUID shape used for ids and idempotency keys. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Stable API error with its HTTP mapping. */
export class ApiError extends Error {
  readonly status: number
  readonly code:
    | 'INVALID_JSON'
    | 'INPUT_INVALID'
    | 'PAYLOAD_TOO_LARGE'
    | 'UNSUPPORTED_MEDIA_TYPE'
    | 'METHOD_NOT_ALLOWED'
    | 'NOT_FOUND'
    | 'IDEMPOTENCY_CONFLICT'
    | 'STORAGE_BUSY'
    | 'STORAGE_UNAVAILABLE'
    | 'STORAGE_INCOMPATIBLE'
    | 'INTERNAL_ERROR'
  readonly retryable: boolean
  readonly safeDetails: Record<string, string>

  constructor(
    status: number,
    code: ApiError['code'],
    message: string,
    retryable = false,
    safeDetails: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryable = retryable
    this.safeDetails = safeDetails
  }
}

/** The service surface the HTTP handlers call. */
export interface RecordsService {
  /** Create or replay one record. */
  create(idempotencyKey: string, content: string): CreateRecordResult
  /** Read one record. */
  get(id: string): ProbeRecord | undefined
}

/** Handler set registered by the composition root. */
export interface RecordsHandlers {
  readonly create: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  readonly read: (req: IncomingMessage, res: ServerResponse) => Promise<void>
}

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  if (res.writableEnded || res.destroyed) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value)
  res.end(body)
}

function sendApiError(res: ServerResponse, requestId: string, error: ApiError): void {
  sendJson(res, error.status, {
    code: error.code,
    message: error.message,
    request_id: requestId,
    retryable: error.retryable,
    safe_details: error.safeDetails,
  }, error.code === 'METHOD_NOT_ALLOWED' ? { allow: String(error.safeDetails.allow ?? '') } : {})
}

function recordsErrorToApi(error: RecordsError): ApiError {
  switch (error.code) {
    case 'STORAGE_BUSY':
      return new ApiError(503, 'STORAGE_BUSY', 'storage is busy; retry the same request', true)
    case 'STORAGE_INCOMPATIBLE':
      return new ApiError(503, 'STORAGE_INCOMPATIBLE', 'storage is incompatible with this build')
    case 'STORAGE_CLOSED':
    case 'STORAGE_UNAVAILABLE':
      return new ApiError(503, 'STORAGE_UNAVAILABLE', 'storage is unavailable')
    default:
      return new ApiError(500, 'INTERNAL_ERROR', 'internal error')
  }
}

/** Read at most `limit` bytes; exceeding the limit rejects but drains the rest. */
async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    let settled = false
    let total = 0
    const chunks: Buffer[] = []
    const fail = (error: ApiError): void => {
      if (settled) return
      settled = true
      req.resume()
      reject(error)
    }
    req.on('data', (chunk: Buffer) => {
      if (settled) return
      total += chunk.length
      if (total > limit) {
        fail(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'request body exceeds the limit'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })
    req.on('error', () => {
      fail(new ApiError(400, 'INVALID_JSON', 'request body could not be read'))
    })
    req.on('aborted', () => {
      if (settled) return
      settled = true
      reject(new ApiError(400, 'INVALID_JSON', 'request was aborted'))
    })
  })
}

function requireJsonMediaType(req: IncomingMessage): void {
  const raw = req.headers['content-type']
  if (typeof raw !== 'string') throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json')
  const parts = raw.split(';').map(part => part.trim().toLowerCase())
  if (parts[0] !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json')
  }
  const charset = parts.slice(1).find(part => part.startsWith('charset='))
  if (charset !== undefined && charset !== 'charset=utf-8') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type charset must be utf-8')
  }
}

function requireIdempotencyKey(req: IncomingMessage): string {
  const raw = req.headers['idempotency-key']
  if (typeof raw !== 'string' || !UUID_PATTERN.test(raw)) {
    throw new ApiError(422, 'INPUT_INVALID', 'Idempotency-Key must be a canonical lowercase UUID')
  }
  return raw
}

function parseContent(body: Buffer): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'request body is not valid UTF-8')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'request body is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ApiError(422, 'INPUT_INVALID', 'body must be a JSON object')
  }
  const keys = Object.keys(parsed)
  if (keys.length !== 1 || keys[0] !== 'content') {
    throw new ApiError(422, 'INPUT_INVALID', 'body may contain only the content field')
  }
  const content = (parsed as { content?: unknown }).content
  if (typeof content !== 'string' || content.length === 0) {
    throw new ApiError(422, 'INPUT_INVALID', 'content must be a non-empty string')
  }
  if (!content.isWellFormed()) {
    throw new ApiError(422, 'INPUT_INVALID', 'content must not contain lone Unicode surrogates')
  }
  const bytes = Buffer.byteLength(content, 'utf8')
  if (bytes < 1 || bytes > MAX_CONTENT_BYTES) {
    throw new ApiError(422, 'INPUT_INVALID', `content must be 1-${MAX_CONTENT_BYTES} UTF-8 bytes`)
  }
  return content
}

function requestPath(req: IncomingMessage): string {
  return new URL(req.url ?? '/', 'http://localhost').pathname
}

/**
 * Build the POST and GET handlers.
 * @param service - record application service.
 * @param basePath - exact create path and prefix read path.
 * @param log - safe diagnostic sink.
 * @returns the two handlers.
 */
export function createRecordsHandlers(
  service: RecordsService,
  basePath: string,
  log: (message: string) => void,
): RecordsHandlers {
  const create = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const requestId = randomUUID()
    try {
      if (req.method !== 'POST') {
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'method not allowed', false, { allow: 'POST' })
      }
      requireJsonMediaType(req)
      const key = requireIdempotencyKey(req)
      const body = await readBody(req, MAX_REQUEST_BODY_BYTES)
      const content = parseContent(body)
      const result = service.create(key, content)
      if (result.kind === 'conflict') {
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'idempotency key was used with different content')
      }
      sendJson(res, result.kind === 'created' ? 201 : 200, {
        data: result.record,
        meta: { request_id: requestId, schema_version: 1 },
      })
    } catch (error: unknown) {
      if (res.writableEnded) return
      if (error instanceof ApiError) {
        sendApiError(res, requestId, error)
        return
      }
      if (error instanceof RecordsError) {
        sendApiError(res, requestId, recordsErrorToApi(error))
        return
      }
      log(`knowledgeos-storage: request failed request_id=${requestId}`)
      sendApiError(res, requestId, new ApiError(500, 'INTERNAL_ERROR', 'internal error'))
    }
  }

  const read = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const requestId = randomUUID()
    try {
      if (req.method !== 'GET') {
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'method not allowed', false, { allow: 'GET' })
      }
      const path = requestPath(req)
      const prefix = `${basePath}/`
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) {
        throw new ApiError(404, 'NOT_FOUND', 'record not found')
      }
      const id = path.slice(prefix.length)
      if (!UUID_PATTERN.test(id)) {
        throw new ApiError(422, 'INPUT_INVALID', 'record id must be a canonical lowercase UUID')
      }
      const record = service.get(id)
      if (record === undefined) throw new ApiError(404, 'NOT_FOUND', 'record not found')
      sendJson(res, 200, {
        data: record,
        meta: { request_id: requestId, schema_version: 1 },
      })
    } catch (error: unknown) {
      if (res.writableEnded) return
      if (error instanceof ApiError) {
        sendApiError(res, requestId, error)
        return
      }
      if (error instanceof RecordsError) {
        sendApiError(res, requestId, recordsErrorToApi(error))
        return
      }
      log(`knowledgeos-storage: request failed request_id=${requestId}`)
      sendApiError(res, requestId, new ApiError(500, 'INTERNAL_ERROR', 'internal error'))
    }
  }

  return { create, read }
}