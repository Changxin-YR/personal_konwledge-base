/**
 * Browser-side reader for the KnowledgeOS read-only Host status route.
 *
 * The panel never fabricates a successful response: only a 2xx JSON body that
 * passes the shape checks below becomes the ready state. Network failures,
 * non-2xx answers, timeouts, and malformed bodies all surface as errors.
 */

/** Host route the Host half of this bundle registers. */
export const STATUS_PATH = '/knowledgeos/status'

/** Default ceiling for one status request. */
export const STATUS_TIMEOUT_MS = 10_000

/** The validated status value the panel renders. */
export interface StatusPayload {
  readonly schema_version: number
  readonly product: string
  readonly upstream_commit: string
  readonly upstream_version: string
  readonly expected_upstream_commit: string
  readonly upstream_commit_verified: boolean | null
  readonly host_instance_id: string
  readonly started_at: string
  readonly checked_at: string
  readonly status: string
}

/** A status request that did not produce a usable payload. */
export class StatusRequestError extends Error {
  /** Stable reason the panel can branch on. */
  readonly kind: 'network' | 'http' | 'shape'

  constructor(kind: 'network' | 'http' | 'shape', message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StatusRequestError'
    this.kind = kind
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new StatusRequestError('shape', `Host 响应缺少字段 ${key}`)
  }
  return value
}

/**
 * Validate the wire value before any of it reaches render code.
 * @param value - JSON-decoded response body.
 * @returns the typed payload.
 * @throws {StatusRequestError} when a required field is missing or mistyped.
 */
export function parseStatusPayload(value: unknown): StatusPayload {
  if (!isRecord(value)) throw new StatusRequestError('shape', 'Host 响应不是 JSON 对象')
  const schemaVersion = value.schema_version
  if (schemaVersion !== 1) throw new StatusRequestError('shape', 'Host 响应结构版本不是 1')
  const verified = value.upstream_commit_verified
  if (verified !== true && verified !== false && verified !== null) {
    throw new StatusRequestError('shape', 'Host 响应的提交校验状态无效')
  }
  return {
    schema_version: 1,
    product: readString(value, 'product'),
    upstream_commit: readString(value, 'upstream_commit'),
    upstream_version: readString(value, 'upstream_version'),
    expected_upstream_commit: readString(value, 'expected_upstream_commit'),
    upstream_commit_verified: verified,
    host_instance_id: readString(value, 'host_instance_id'),
    started_at: readString(value, 'started_at'),
    checked_at: readString(value, 'checked_at'),
    status: readString(value, 'status'),
  }
}

/**
 * Read one status value from the Host.
 * @param signal - caller cancellation, fired when the panel unmounts or reloads.
 * @param timeoutMs - request ceiling; a timeout is reported as a network failure.
 * @returns the validated Host payload.
 * @throws {StatusRequestError} for transport, HTTP, timeout, and shape failures.
 */
export async function loadStatus(signal?: AbortSignal, timeoutMs = STATUS_TIMEOUT_MS): Promise<StatusPayload> {
  const controller = new AbortController()
  const onAbort = (): void => { controller.abort(signal?.reason) }
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => { controller.abort(new Error('timeout')) }, timeoutMs)
  try {
    let response: Response
    try {
      response = await fetch(STATUS_PATH, {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      })
    } catch (error: unknown) {
      if (signal?.aborted) throw error
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusRequestError('network', `无法连接本机 Host 服务：${message}`, { cause: error })
    }
    if (!response.ok) {
      throw new StatusRequestError('http', `Host 服务返回 HTTP ${response.status}`)
    }
    let body: unknown
    try {
      body = await response.json()
    } catch (error: unknown) {
      throw new StatusRequestError('shape', 'Host 响应不是合法 JSON', { cause: error })
    }
    return parseStatusPayload(body)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
