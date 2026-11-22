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
import { IdentityService } from './identity.ts'
import { buildAccountHtml, buildSetupHtml, businessCookieName, createIdentityHandlers, isIdentityRuntimeAvailable, isLoopbackAddress, readCookie } from './identity-http.ts'
import { createObjectHandlers } from './objects-http.ts'
import { startWorker } from './jobs.ts'
import { AiService } from './ai-service.ts'
import { createAiHandler } from './ai-http.ts'
import { buildAiHtml } from './ai-page.ts'
import { join } from 'node:path'
import { PdfOriginals } from './pdf-originals.ts'
import { libraryHandler } from './library-http.ts'
import { createNoteHandler } from './note-http.ts'
import { createRecallHandler } from './recall-http.ts'
import { createInvitationHandler } from './invitation-http.ts'
import { ReaderService } from './reader-http.ts'
import { render as renderReaderPage } from './reader-render.ts'
import { startParseWorker } from './parse-worker.ts'
import { startOfficeWorker } from './office-worker.ts'
import { openIndexPdf,openPdf,openReaderPdf } from './pdf-extractor.ts'
import {startWordSearchIndex} from './word-search-index.ts'
import { legacyWordSource } from './legacy-word-source.ts'
import type { LegacyWordSource } from './reader-http.ts'
import { buildLibraryHtml } from './library-page.ts'
import { buildReaderHtml } from './reader-page.ts'
import { buildNotesHtml } from './note-page.ts'
import { buildRecallHtml } from './recall-page.ts'
import { buildInvitationHtml } from './invitation-page.ts'

export { Config }

/** Cordis plugin name shown in Loader diagnostics. */
export const name = 'knowledgeos-panel'

/** Services this plugin needs before it registers routes. */
export const inject = ['webServer', 'clientModules', 'connection', 'connection.authentication']

/** FND-001 read-only runtime status. */
export const STATUS_PATH = '/knowledgeos/status'
/** FND-002 create path; the same prefix serves GET by id. */
export const RECORDS_PATH = '/knowledgeos/foundation/records'
export const ACCOUNT_PATH = '/knowledgeos/account'
export const SETUP_PATH = '/knowledgeos/setup'
export const IDENTITY_API_PATH = '/knowledge/v1'

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
  if (storage?.available) ctx.effect(() => startWorker(storage.jobs, log), 'knowledgeos-jobs: checkpoint worker')

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

  const webFacts = ctx.webServer as unknown as {
    host?: string
    port?: number
    protocol?: 'http:' | 'https:'
    getOrigin?: () => string
  }
  const actualOrigin = (): string | undefined => {
    try {
      const explicit = webFacts.getOrigin?.()
      if (explicit !== undefined) return explicit
    } catch { return undefined }
    return undefined
  }
  const sendIdentityUnavailable = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void => {
    if (req.method === 'GET' && req.url?.startsWith('/knowledgeos/account')) {
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(buildAccountHtml())
      return
    }
    res.statusCode = 503
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify({ code: 'STORAGE_UNAVAILABLE', message: 'storage is not configured', request_id: randomUUID(), retryable: true, safe_details: {} }))
  }

  const registerIdentityRoutes = (identityContext: Context): void => {
    const identityAvailable = (): boolean => {
      let connection: { authentication?: unknown; browserPeer?: { signal?: AbortSignal } }
      // The outer plugin context is the one covered by the bundle's nested
      // `connection.authentication` injection.  A callback scope created by
      // `ctx.inject(['connection'], ...)` may expose a lazy proxy that throws
      // when its nested properties are read, even though the live Connection
      // service is present.  Read the already injected outer service instead;
      // retain the guard so a shutting down/malformed Host reports 503 rather
      // than turning the request into an internal 500.
      try { connection = ctx.connection } catch { return false }
      return isIdentityRuntimeAvailable({ connection, host: webFacts.host, port: webFacts.port, protocol: webFacts.protocol, origin: actualOrigin() })
    }
    const identity = new IdentityService(storage as NonNullable<typeof storage>)
    // DSH resolves the endpoint and credentials; the plugin only takes route IDs.
    const route = () => config.ai ?? identityContext.get('agentDefaultModel')?.currentSelection() ?? {}
    let ai = new AiService(storage as NonNullable<typeof storage>, route())
    identityContext.inject(['llm', 'tools'], aiContext => {
      aiContext.effect(() => {
        ai.close()
        let active: AiService
        try { active = new AiService(storage as NonNullable<typeof storage>, route(), aiContext.llm, aiContext.tools) }
        catch { console.warn('knowledgeos-ai: TOOL_REGISTRATION_FAILED'); ai = new AiService(storage as NonNullable<typeof storage>, route()); return () => ai.close() }
        ai = active
        return () => { active.close(); if (ai === active) ai = new AiService(storage as NonNullable<typeof storage>, route()) }
      }, 'knowledgeos-ai: controlled tools')
    })
    const identityHandlers = createIdentityHandlers({
      service: identity,
      origin: actualOrigin,
      host: () => webFacts.host,
      protocol: () => webFacts.protocol ?? 'http:',
      isAvailable: identityAvailable,
    })
    const ownerSetupPage = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, peer?: unknown): void => {
      if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('allow', 'GET'); res.end(); return }
      if (!identityAvailable()) { res.statusCode = 503; res.setHeader('content-type', 'text/plain; charset=utf-8'); res.end('identity service is unavailable'); return }
      const principal = (peer as { principal?: { kind?: string } } | undefined)?.principal
      if (principal?.kind !== 'owner' || !isLoopbackAddress(req.socket?.remoteAddress) || !isLoopbackAddress(webFacts.host)) { res.statusCode = 403; res.end('forbidden'); return }
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(buildSetupHtml())
    }
    const accountPage = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void => {
      if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('allow', 'GET'); res.end(); return }
      if (!identityAvailable()) { res.statusCode = 503; res.setHeader('content-type', 'text/plain; charset=utf-8'); res.end('identity service is unavailable'); return }
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(buildAccountHtml().replace('</main>', '<p><a href="/knowledgeos/library">知识库</a> · <a href="/knowledgeos/ai">受控 AI 工具</a></p></main>'))
    }
    const withPeer = (handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, peer?: import('./identity-peer.ts').PeerScope) => Promise<void>) => {
      return (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, peer?: unknown): Promise<void> => {
        const pending = handler(req, res, peer as import('./identity-peer.ts').PeerScope | undefined)
        inFlight.add(pending)
        void pending.finally(() => { inFlight.delete(pending) })
        return pending
      }
    }
    let officeMount:symbol|undefined,readLegacyWord:LegacyWordSource|undefined
    if(storage?.available && dataDir){
      const office=storage.office,originals=new PdfOriginals(join(dataDir,'originals'))
      identityContext.inject(['officeKit'],scope=>{
        scope.effect(()=>{const stop=startOfficeWorker(office,originals,scope.officeKit,openPdf,log),mount=Symbol();officeMount=mount
          readLegacyWord=legacyWordSource(scope.officeKit,originals)
          return async()=>{if(officeMount===mount){officeMount=undefined;readLegacyWord=undefined}await stop()}
        },'knowledgeos-office: versioned conversion worker')
      })
    }
    identityContext.effect(() => {
      const disposers: Array<() => void> = []
      disposers.push(identityContext.webServer.register({ kind: 'exact', path: ACCOUNT_PATH, auth: 'anonymous', handler: accountPage }))
      if(storage && dataDir){
        const originals=new PdfOriginals(join(dataDir,'originals'))
        const reader=new ReaderService(storage.citations,originals,renderReaderPage,openReaderPdf,(s,check,signal)=>{
          if(!readLegacyWord)throw new Error('Office structure conversion unavailable')
          return readLegacyWord(s,check,signal)
        })
        const sessionFor=(req:import('node:http').IncomingMessage)=>{const origin=actualOrigin();if(!origin||!identityAvailable())return undefined;return identity.actor(readCookie(req,businessCookieName(identity.setupState.serviceId,origin)))}
        const handler=libraryHandler(storage.assets,originals,actualOrigin,sessionFor,storage.parses,storage.office,()=>!!officeMount,storage.archives,reader,storage.search)
        const notes=createNoteHandler(storage.notes,actualOrigin,sessionFor)
        disposers.push(identityContext.webServer.register({kind:'prefix',path:'/knowledge/v1/invitations',auth:'anonymous',handler:withPeer(createInvitationHandler(storage.invitations,actualOrigin,sessionFor))}))
        disposers.push(identityContext.webServer.register({kind:'exact',path:'/knowledgeos/invitations',auth:'anonymous',handler:(req,res)=>{
          if(req.method!=='GET'){res.writeHead(405,{allow:'GET'});res.end();return}
          res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'});res.end(buildInvitationHtml())
        }}))
        disposers.push(identityContext.webServer.register({kind:'prefix',path:'/knowledge/v1/recall',auth:'anonymous',handler:withPeer(createRecallHandler(storage.recall,actualOrigin,sessionFor))}))
        disposers.push(identityContext.webServer.register({kind:'exact',path:'/knowledgeos/recall',auth:'anonymous',handler:(req,res)=>{
          if(req.method!=='GET'){res.statusCode=405;res.end();return}
          res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'});res.end(buildRecallHtml())
        }}))
        disposers.push(identityContext.webServer.register({kind:'prefix',path:'/knowledge/v1/notes',auth:'anonymous',handler:withPeer(notes)}))
        disposers.push(identityContext.webServer.register({kind:'exact',path:'/knowledgeos/notes',auth:'anonymous',handler:(req,res)=>{
          if(req.method!=='GET'){res.writeHead(405,{allow:'GET'});res.end();return}
          res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'});res.end(buildNotesHtml())
        }}))
        if(storage.available)disposers.push(startParseWorker(storage.parses,originals,openPdf,log),startWordSearchIndex(storage.wordSearch,originals,openIndexPdf,log))
        disposers.push(identityContext.webServer.register({kind:'exact',path:'/knowledgeos/library',auth:'anonymous',handler:(req,res)=>{
          if(req.method!=='GET'){res.statusCode=405;res.end();return}res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('cache-control','no-store');res.end(buildLibraryHtml())
        }}))
        disposers.push(identityContext.webServer.register({kind:'exact',path:'/knowledgeos/reader',auth:'anonymous',handler:(req,res)=>{
          if(req.method!=='GET'){res.statusCode=405;res.end();return}res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('referrer-policy','no-referrer');res.end(buildReaderHtml())
        }}))
        disposers.push(identityContext.webServer.register({kind:'prefix',path:'/knowledge/v1/imports',auth:'anonymous',handler:withPeer(handler)}))
        disposers.push(identityContext.webServer.register({kind:'prefix',path:'/knowledge/v1/assets',auth:'anonymous',handler:withPeer(handler)}))
        disposers.push(identityContext.webServer.register({kind:'prefix',path:'/knowledge/v1/citations',auth:'anonymous',handler:withPeer(handler)}))
        disposers.push(identityContext.webServer.register({kind:'prefix',path:'/knowledge/v1/operations',auth:'anonymous',handler:withPeer(handler)}))
        disposers.push(identityContext.webServer.register({kind:'prefix',path:'/knowledge/v1/search',auth:'anonymous',handler:withPeer(handler)}))
      }
      disposers.push(identityContext.webServer.register({ kind: 'exact', path: '/knowledgeos/ai', auth: 'anonymous', handler: (req, res) => { if (req.method !== 'GET') { res.statusCode = 405; res.end(); return }; res.setHeader('content-type', 'text/html; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(buildAiHtml()) } }))
      const aiHandler = createAiHandler({ service: () => ai, origin: actualOrigin, actorFor: req => { const origin = actualOrigin(); if (origin === undefined || !identityAvailable()) return undefined; return identity.actor(readCookie(req, businessCookieName(identity.setupState.serviceId, origin))) } })
      disposers.push(identityContext.webServer.register({ kind: 'prefix', path: '/knowledge/v1/ai', auth: 'anonymous', handler: withPeer(async (req, res) => aiHandler(req, res)) }))
      disposers.push(identityContext.webServer.register({ kind: 'exact', path: SETUP_PATH, auth: 'required', handler: ownerSetupPage }))
      const routes: Array<{ path: string; auth: 'anonymous' | 'required'; handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, peer?: import('./identity-peer.ts').PeerScope) => Promise<void> }> = [
        { path: '/knowledge/v1/auth/status', auth: 'anonymous', handler: identityHandlers.status },
        { path: '/knowledge/v1/auth/bootstrap', auth: 'required', handler: identityHandlers.bootstrap },
        { path: '/knowledge/v1/auth/register', auth: 'anonymous', handler: identityHandlers.register },
        { path: '/knowledge/v1/auth/login', auth: 'anonymous', handler: identityHandlers.login },
        { path: '/knowledge/v1/auth/logout', auth: 'anonymous', handler: identityHandlers.logout },
        { path: '/knowledge/v1/me', auth: 'anonymous', handler: identityHandlers.me },
        { path: '/knowledge/v1/me/preferences', auth: 'anonymous', handler: identityHandlers.preferences },
        { path: '/knowledge/v1/spaces', auth: 'anonymous', handler: identityHandlers.spaces },
      ]
      for (const route of routes) disposers.push(identityContext.webServer.register({ kind: 'exact', path: route.path, auth: route.auth, handler: withPeer(route.handler) }))
      const objectHandler = createObjectHandlers({
        storage: storage as NonNullable<typeof storage>,
        actorFor: req => {
          const origin = actualOrigin(); if (origin === undefined) return undefined
          const token = readCookie(req, businessCookieName(identity.setupState.serviceId, origin))
          return identity.actor(token)
        },
        origin: actualOrigin,
      })
      disposers.push(identityContext.webServer.register({ kind: 'prefix', path: '/knowledge/v1/objects', auth: 'anonymous', handler: withPeer(async (req, res) => objectHandler(req, res)) }))
      disposers.push(identityContext.webServer.register({ kind: 'prefix', path: '/knowledge/v1/jobs', auth: 'anonymous', handler: withPeer(objectHandler) }))
      disposers.push(identityContext.webServer.register({ kind: 'prefix', path: '/knowledge/v1/projects', auth: 'anonymous', handler: withPeer(async (req, res) => objectHandler(req, res)) }))
      disposers.push(identityContext.webServer.register({ kind: 'prefix', path: '/knowledge/v1/grants', auth: 'anonymous', handler: withPeer(async (req, res) => objectHandler(req, res)) }))
      return async () => { ai.close(); for (const dispose of disposers) await dispose(); await identity.close() }
    }, 'knowledgeos-identity: account and business routes')
  }

  if (storage === undefined) {
    ctx.effect(() => {
      const disposers: Array<() => void> = []
      disposers.push(ctx.webServer.register({ kind: 'exact', path: ACCOUNT_PATH, auth: 'anonymous', handler: sendIdentityUnavailable }))
      disposers.push(ctx.webServer.register({ kind: 'exact', path: SETUP_PATH, auth: 'required', handler: sendIdentityUnavailable }))
      for (const path of ['/knowledge/v1/auth/status', '/knowledge/v1/auth/bootstrap', '/knowledge/v1/auth/register', '/knowledge/v1/auth/login', '/knowledge/v1/auth/logout', '/knowledge/v1/me', '/knowledge/v1/me/preferences', '/knowledge/v1/spaces']) {
        disposers.push(ctx.webServer.register({ kind: 'exact', path, auth: path.endsWith('/bootstrap') ? 'required' : 'anonymous', handler: sendIdentityUnavailable }))
      }
      return () => { for (const dispose of disposers) dispose() }
    }, 'knowledgeos-identity: unavailable routes')
  } else {
    ctx.inject(['connection', 'connection.authentication'], registerIdentityRoutes)
  }
}
