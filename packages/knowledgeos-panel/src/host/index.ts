/**
 * Host half of the KnowledgeOS bundle.
 *
 * FND-001: one exact read-only runtime-status route.
 * FND-002: one exact POST plus one prefix GET over a real SQLite probe store.
 *
 * All routes use the existing local DSH connection authentication. Storage is
 * optional trusted config; without it the original status panel keeps working
 * and the persistence endpoints answer a stable unavailable error.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { buildStatusPayload } from './status.ts'
import { Config, resolveDataDir, type Config as KnowledgeOsConfig } from './config.ts'
import { createRecordsHandlers, type RecordsService } from './http.ts'
import { createProbeRecord, getProbeRecord, RecordsError, type CreateRecordResult } from './records.ts'
import { ProbeStorage } from './storage.ts'

export { Config }

/** Cordis plugin name shown in Loader diagnostics. */
export const name = 'knowledgeos-panel'

/** Services this plugin needs before it registers routes. */
export const inject = ['webServer', 'clientModules']

/** FND-001 read-only runtime status. */
export const STATUS_PATH = '/knowledgeos/status'
/** FND-002 create path; the same prefix serves GET by id. */
export const RECORDS_PATH = '/knowledgeos/foundation/records'

const RESPONSE_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
} as const

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Register the status and persistence routes and release storage with the plugin.
 * @param ctx - Host plugin context carrying WebServer and client-module services.
 * @param config - validated trusted plugin configuration.
 */
export function apply(ctx: Context, config: KnowledgeOsConfig = {}): void {
  const instanceId = globalThis.crypto.randomUUID()
  const startedAt = new Date().toISOString()
  const log = (message: string): void => { console.log(message) }

  ctx.effect(() => {
    /** Read the Host release without letting a composition failure break the route. */
    const readRelease = (): { version?: string; commit?: string } | undefined => {
      try {
        return ctx.clientModules.graph().release
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`knowledgeos-panel: reading host release failed: ${message}`)
        return undefined
      }
    }

    return ctx.webServer.register({
      kind: 'exact',
      path: STATUS_PATH,
      auth: 'required',
      resource: async (): Promise<Response> => {
        const payload = buildStatusPayload({
          release: readRelease(),
          instanceId,
          startedAt,
          checkedAt: new Date().toISOString(),
        })
        return new Response(JSON.stringify(payload), { status: 200, headers: RESPONSE_HEADERS })
      },
    })
  }, 'knowledgeos-panel: read-only status route')

  const dataDir = resolveDataDir(config)
  const storage = dataDir === undefined
    ? undefined
    : new ProbeStorage({
        dataDir,
        log,
      })
  if (storage === undefined) log('knowledgeos-storage: unconfigured')

  let closing = false
  const inFlight = new Set<Promise<void>>()
  const service: RecordsService = {
    create(idempotencyKey: string, content: string): CreateRecordResult {
      if (closing) throw new RecordsError('STORAGE_CLOSED', 'storage is closing')
      if (storage === undefined) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage is not configured')
      return createProbeRecord(storage, {
        newId: () => randomUUID(),
        now: () => new Date().toISOString(),
      }, { idempotencyKey, content })
    },
    get(id: string) {
      if (closing) throw new RecordsError('STORAGE_CLOSED', 'storage is closing')
      if (storage === undefined) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage is not configured')
      return getProbeRecord(storage, id)
    },
  }
  const handlers = createRecordsHandlers(service, RECORDS_PATH, log)
  const wrap = (handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>) => {
    return (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): Promise<void> => {
      const pending = handler(req, res)
      inFlight.add(pending)
      void pending.finally(() => { inFlight.delete(pending) })
      return pending
    }
  }

  ctx.effect(() => {
    const disposeCreate = ctx.webServer.register({
      kind: 'exact',
      path: RECORDS_PATH,
      auth: 'required',
      handler: wrap(handlers.create),
    })
    const disposeRead = ctx.webServer.register({
      kind: 'prefix',
      path: RECORDS_PATH,
      auth: 'required',
      handler: wrap(handlers.read),
    })
    return async () => {
      closing = true
      disposeCreate()
      disposeRead()
      if (inFlight.size > 0) {
        await Promise.race([Promise.allSettled([...inFlight]), wait(5_000)])
      }
      storage?.close()
    }
  }, 'knowledgeos-storage: records routes and connection')
}