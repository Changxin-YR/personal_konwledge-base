/**
 * Host half of the KnowledgeOS FND-001 bundle.
 *
 * One exact route exposes read-only runtime metadata to the packaged Client
 * panel. The route relies on the existing local DSH connection authentication:
 * the Web carrier defaults every named route to `required`, and this module
 * states that policy explicitly instead of inheriting it silently.
 */
import type { Context } from '@deepseek-ai/cordis'
import { buildStatusPayload } from './status.ts'

/** Cordis plugin name shown in Loader diagnostics. */
export const name = 'knowledgeos-panel'

/** Services this plugin needs before it registers the route. */
export const inject = ['webServer', 'clientModules']

/** The only path this bundle adds to the Host. */
export const STATUS_PATH = '/knowledgeos/status'

/** Response headers for the status resource. */
const RESPONSE_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
} as const

/**
 * Register the read-only status route and remove it with the plugin.
 * @param ctx - Host plugin context carrying WebServer and client-module services.
 */
export function apply(ctx: Context): void {
  const instanceId = globalThis.crypto.randomUUID()
  const startedAt = new Date().toISOString()

  ctx.effect(() => {
    /** Read the Host release without letting a composition failure break the route. */
    const readRelease = (): { version?: string; commit?: string } | undefined => {
      try {
        return ctx.clientModules.graph().release
      } catch (error: unknown) {
        // The composition failure is reported through the regular Loader diagnostics.
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`knowledgeos-panel: reading host release failed: ${message}`)
        return undefined
      }
    }

    const dispose = ctx.webServer.register({
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
    return dispose
  }, 'knowledgeos-panel: read-only status route')
}
