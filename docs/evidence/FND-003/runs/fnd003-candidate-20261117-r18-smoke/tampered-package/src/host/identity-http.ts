import { createHash, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PeerScope } from './identity-peer.ts'
import {
  IdentityError,
  IdentityService,
  MAX_REQUEST_BODY_BYTES,
  type PreferencePatch,
  type ProfileRecord,
  validateDisplayName,
  validateDomains,
  validateExpectedRevision,
  validateGoalText,
  validateLearningTracks,
  validateTimezone,
} from './identity.ts'

export interface IdentityHttpOptions {
  readonly service: IdentityService
  readonly origin: () => string | undefined
  readonly host: () => string | undefined
  readonly protocol: () => 'http:' | 'https:'
  readonly isAvailable: () => boolean
}

export interface IdentityRuntimeFacts {
  readonly connection?: { readonly authentication?: unknown; readonly browserPeer?: { readonly signal?: AbortSignal } }
  readonly host?: string
  readonly port?: number
  readonly protocol?: 'http:' | 'https:'
  readonly origin?: string
}

export interface IdentityHandlers {
  readonly status: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  readonly bootstrap: (req: IncomingMessage, res: ServerResponse, peer?: PeerScope) => Promise<void>
  readonly register: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  readonly login: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  readonly logout: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  readonly me: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  readonly preferences: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  readonly spaces: (req: IncomingMessage, res: ServerResponse) => Promise<void>
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryable = false, readonly headers: Record<string, string> = {}) { super(message); this.name = 'HttpError' }
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  if (res.writableEnded || res.destroyed) return
  res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff')
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value)
  res.end(JSON.stringify(payload))
}

function sendEmpty(res: ServerResponse, status: number, headers: Record<string, string> = {}): void {
  if (res.writableEnded || res.destroyed) return
  res.statusCode = status; res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff')
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value)
  res.end()
}

export function isLoopbackAddress(value: string | undefined): boolean {
  if (value === undefined) return false
  let unwrapped = value.trim().toLowerCase()
  if (unwrapped.startsWith('[') && unwrapped.endsWith(']')) unwrapped = unwrapped.slice(1, -1)
  const zone = unwrapped.indexOf('%')
  if (zone >= 0) unwrapped = unwrapped.slice(0, zone)
  if (isIP(unwrapped) === 4) {
    const octets = unwrapped.split('.').map(Number)
    return octets.length === 4 && octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255) && octets[0] === 127
  }
  if (isIP(unwrapped) !== 6) return false
  const ipv6 = unwrapped.includes('.')
    ? (() => {
        const at = unwrapped.lastIndexOf(':')
        const dotted = unwrapped.slice(at + 1).split('.').map(Number)
        if (dotted.length !== 4 || dotted.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return undefined
        return `${unwrapped.slice(0, at)}:${((dotted[0] << 8) | dotted[1]).toString(16)}:${((dotted[2] << 8) | dotted[3]).toString(16)}`
      })()
    : unwrapped
  if (ipv6 === undefined) return false
  const groups = ipv6.split('::')
  if (groups.length > 2) return false
  const left = groups[0] === '' ? [] : groups[0].split(':')
  const right = groups.length === 2 && groups[1] !== '' ? groups[1].split(':') : []
  if ([...left, ...right].some(item => !/^[0-9a-f]{1,4}$/u.test(item))) return false
  const missing = 8 - left.length - right.length
  if ((groups.length === 1 && missing !== 0) || (groups.length === 2 && missing < 1)) return false
  const expanded = groups.length === 1 ? left : [...left, ...Array(missing).fill('0'), ...right]
  if (expanded.length !== 8) return false
  const numbers = expanded.map(item => Number.parseInt(item, 16))
  const plainLoopback = numbers.slice(0, 7).every(item => item === 0) && numbers[7] === 1
  const mappedLoopback = numbers.slice(0, 5).every(item => item === 0) && numbers[5] === 0xffff && (numbers[6] >>> 8) === 127
  return plainLoopback || mappedLoopback
}

/**
 * Shared gate for every KnowledgeOS identity route. A configured host string
 * is insufficient: getOrigin() only succeeds after WebServer has bound its
 * real listener, so callers must provide the bound port and origin as well.
 */
export function isIdentityRuntimeAvailable(facts: IdentityRuntimeFacts): boolean {
  if (facts.connection?.authentication === undefined || facts.connection.browserPeer?.signal?.aborted === true) return false
  if (!isLoopbackAddress(facts.host)) return false
  if (facts.protocol !== 'http:' && facts.protocol !== 'https:') return false
  if (!Number.isInteger(facts.port) || (facts.port ?? 0) <= 0 || (facts.port ?? 0) > 65535) return false
  if (facts.origin === undefined) return false
  try {
    const parsed = new URL(facts.origin)
    if (parsed.protocol !== facts.protocol || !isLoopbackAddress(parsed.hostname)) return false
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
    return port === facts.port
  } catch { return false }
}

function requestPath(req: IncomingMessage): string { return new URL(req.url ?? '/', 'http://localhost').pathname }

function cookieName(serviceId: string, origin: string): string { return `kos_session_${createHash('sha256').update(`${serviceId}|${origin}`).digest('hex').slice(0, 16)}` }

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers.cookie
  if (typeof raw !== 'string') return undefined
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=') || undefined
  }
  return undefined
}

function cookieOptions(name: string, origin: string, protocol: 'http:' | 'https:', maxAge?: number): string {
  const secure = protocol === 'https:' ? '; Secure' : ''
  const age = maxAge === undefined ? '' : `; Max-Age=${String(maxAge)}`
  return `${name}=${maxAge === 0 ? '' : '{TOKEN}'}; Path=/knowledge/v1; HttpOnly; SameSite=Strict${secure}${age}`.replace('{TOKEN}', '')
}

function sessionCookie(name: string, token: string, origin: string, protocol: 'http:' | 'https:', maxAge: number): string {
  const secure = protocol === 'https:' ? '; Secure' : ''
  return `${name}=${token}; Path=/knowledge/v1; HttpOnly; SameSite=Strict${secure}; Max-Age=${String(maxAge)}`
}

function clearCookie(name: string, origin: string, protocol: 'http:' | 'https:'): string {
  const secure = protocol === 'https:' ? '; Secure' : ''
  return `${name}=; Path=/knowledge/v1; HttpOnly; SameSite=Strict${secure}; Max-Age=0`
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    let total = 0; let settled = false; const chunks: Buffer[] = []
    const fail = (error: Error): void => { if (settled) return; settled = true; req.resume(); reject(error) }
    req.on('data', (chunk: Buffer) => { if (settled) return; total += chunk.length; if (total > MAX_REQUEST_BODY_BYTES) { fail(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'request body exceeds the limit')); return }; chunks.push(chunk) })
    req.on('end', () => {
      if (settled) return; settled = true
      let text: string
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) } catch { reject(new HttpError(400, 'INVALID_JSON', 'request body is not valid UTF-8')); return }
      try { resolve(JSON.parse(text)) } catch { reject(new HttpError(400, 'INVALID_JSON', 'request body is not valid JSON')) }
    })
    req.on('error', () => fail(new HttpError(400, 'INVALID_JSON', 'request body could not be read')))
    req.on('aborted', () => fail(new HttpError(400, 'INVALID_JSON', 'request was aborted')))
  })
}

function bodyObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HttpError(422, 'INPUT_INVALID', 'body must be a JSON object')
  return value as Record<string, unknown>
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key))
  if (unknown.length > 0) throw new HttpError(422, 'INPUT_INVALID', 'body contains an unsupported field')
}

function requireJson(req: IncomingMessage): void {
  const raw = req.headers['content-type']
  if (typeof raw !== 'string' || raw.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json')
  const charset = raw.split(';').slice(1).map(item => item.trim().toLowerCase()).find(item => item.startsWith('charset='))
  if (charset !== undefined && charset !== 'charset=utf-8') throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type charset must be utf-8')
}

function requireMethod(req: IncomingMessage, method: string): void { if (req.method !== method) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'method not allowed', false, { allow: method }) }

function safeProfile(profile: ProfileRecord): Record<string, unknown> {
  return { id: profile.id, login_name: profile.loginName, display_name: profile.displayName, role: profile.role, status: profile.status, timezone: profile.timezone, planning_home_service_id: profile.planningHomeServiceId, domains: profile.domains, learning_tracks: profile.learningTracks, goal_text: profile.goalText, revision: profile.revision, personal_space_id: profile.personalSpaceId, created_at: profile.createdAt, updated_at: profile.updatedAt }
}

function requestSource(req: IncomingMessage): string { return req.socket?.remoteAddress ?? 'unknown' }

function requestSignal(req: IncomingMessage, res: ServerResponse): AbortSignal {
  const controller = new AbortController()
  req.once('aborted', () => controller.abort())
  req.once('close', () => { if (!req.complete) controller.abort() })
  res.once('close', () => { if (!res.writableFinished) controller.abort() })
  return controller.signal
}

export function createIdentityHandlers(options: IdentityHttpOptions): IdentityHandlers {
  const { service } = options
  const meta = (requestId: string): Record<string, unknown> => ({ request_id: requestId, service_id: service.setupState.serviceId, server_time: new Date().toISOString() })
  const withMeta = (requestId: string, data: unknown): Record<string, unknown> => ({ data, meta: meta(requestId) })
  const tokenFor = (req: IncomingMessage): string | undefined => {
    const origin = options.origin()
    if (origin === undefined) return undefined
    const state = service.setupState
    return readCookie(req, cookieName(state.serviceId, origin))
  }

  const assertAvailable = (): void => {
    if (!options.isAvailable() || options.origin() === undefined || options.host() === undefined) throw new HttpError(503, 'IDENTITY_UNAVAILABLE', 'identity service is unavailable', true)
  }

  const assertNoQuery = (req: IncomingMessage): void => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if ([...url.searchParams.keys()].length > 0) throw new HttpError(422, 'INPUT_INVALID', 'query parameters are not supported')
  }

  const assertTrust = (req: IncomingMessage, mutation: boolean): void => {
    const origin = options.origin()
    if (origin === undefined) throw new HttpError(503, 'IDENTITY_UNAVAILABLE', 'identity service is unavailable', true)
    const expectedHost = new URL(origin).host
    if (req.headers.host !== expectedHost) throw new HttpError(403, 'CSRF_REJECTED', 'request authority is not trusted')
    const suppliedOrigin = req.headers.origin
    if (suppliedOrigin !== undefined && suppliedOrigin !== origin) throw new HttpError(403, 'CSRF_REJECTED', 'request origin is not trusted')
    if (suppliedOrigin === 'null') throw new HttpError(403, 'CSRF_REJECTED', 'opaque origin is not trusted')
    const fetchSite = req.headers['sec-fetch-site']
    if (typeof fetchSite === 'string' && fetchSite.toLowerCase() === 'cross-site') throw new HttpError(403, 'CSRF_REJECTED', 'cross-site request is not trusted')
    if (mutation && req.headers['x-knowledgeos-request'] !== '1') throw new HttpError(403, 'CSRF_REJECTED', 'missing KnowledgeOS request header')
  }

  const actorFor = (req: IncomingMessage): ReturnType<IdentityService['actor']> => service.actor(tokenFor(req))
  const requireActor = (req: IncomingMessage): NonNullable<ReturnType<IdentityService['actor']>> => {
    const actor = actorFor(req); if (actor === undefined) throw new HttpError(401, 'SESSION_EXPIRED', 'business session is required'); return actor
  }

  const dispatch = async (req: IncomingMessage, res: ServerResponse, action: () => Promise<void> | void): Promise<void> => {
    const requestId = randomUUID()
    try { assertAvailable(); assertNoQuery(req); await action() } catch (error: unknown) {
      if (res.writableEnded) return
      let mapped: HttpError
      if (error instanceof HttpError) mapped = error
      else if (error instanceof IdentityError) {
        const status = error.code === 'INVALID_CREDENTIALS' ? 401 : error.code === 'AUTH_RATE_LIMITED' ? 429 : error.code === 'SETUP_REQUIRED' || error.code === 'ALREADY_INITIALIZED' || error.code === 'LOGIN_NAME_TAKEN' || error.code === 'REVISION_CONFLICT' ? 409 : error.code === 'INPUT_INVALID' ? 422 : 503
        mapped = new HttpError(status, error.code, error.message, error.retryable, error.code === 'AUTH_RATE_LIMITED' ? { 'retry-after': String(Math.max(1, Math.ceil((error.retryAfterMs ?? 60_000) / 1000))) } : {})
      } else if (error instanceof Error && ['STORAGE_UNAVAILABLE', 'STORAGE_INCOMPATIBLE', 'STORAGE_BUSY', 'STORAGE_CLOSED'].includes(String((error as unknown as { code?: unknown }).code))) {
        const code = String((error as unknown as { code: string }).code)
        mapped = new HttpError(503, code, 'storage is unavailable', true)
      } else { mapped = new HttpError(500, 'INTERNAL_ERROR', 'internal error') }
      if (mapped.status === 204) { sendEmpty(res, 204, mapped.headers); return }
      sendJson(res, mapped.status, { code: mapped.code, message: mapped.message, request_id: requestId, retryable: mapped.retryable, safe_details: {} }, mapped.headers)
    }
  }

  const status = async (req: IncomingMessage, res: ServerResponse): Promise<void> => dispatch(req, res, () => { requireMethod(req, 'GET'); assertTrust(req, false); const state = service.setupState; sendJson(res, 200, withMeta(randomUUID(), { setup_required: !state.initialized, available: true })) })

  const bootstrap = async (req: IncomingMessage, res: ServerResponse, peer?: PeerScope): Promise<void> => dispatch(req, res, async () => {
    requireMethod(req, 'POST'); assertTrust(req, true)
    if (!isLoopbackAddress(req.socket?.remoteAddress) || !isLoopbackAddress(options.host()) || peer?.principal?.kind !== 'owner') throw new HttpError(403, 'FORBIDDEN', 'owner loopback admission is required')
    const signal = requestSignal(req, res)
    requireJson(req); const body = bodyObject(await readBody(req)); assertKeys(body, ['login_name', 'password', 'display_name', 'timezone'])
    const user = await service.bootstrap({ loginName: body.login_name, password: body.password, displayName: body.display_name, timezone: body.timezone, source: requestSource(req), signal })
    sendJson(res, 201, withMeta(randomUUID(), safeProfile(user)))
  })

  const register = async (req: IncomingMessage, res: ServerResponse): Promise<void> => dispatch(req, res, async () => {
    requireMethod(req, 'POST'); assertTrust(req, true); const signal = requestSignal(req, res); requireJson(req); const body = bodyObject(await readBody(req)); assertKeys(body, ['login_name', 'password', 'display_name', 'timezone'])
    const user = await service.register({ loginName: body.login_name, password: body.password, displayName: body.display_name, timezone: body.timezone, source: requestSource(req), signal })
    sendJson(res, 201, withMeta(randomUUID(), safeProfile(user)))
  })

  const login = async (req: IncomingMessage, res: ServerResponse): Promise<void> => dispatch(req, res, async () => {
    requireMethod(req, 'POST'); assertTrust(req, true); const signal = requestSignal(req, res); requireJson(req); const body = bodyObject(await readBody(req)); assertKeys(body, ['login_name', 'password'])
    const result = await service.login({ loginName: body.login_name, password: body.password, oldToken: tokenFor(req), source: requestSource(req), signal })
    const origin = options.origin(); if (origin === undefined) throw new HttpError(503, 'IDENTITY_UNAVAILABLE', 'identity service is unavailable', true)
    const state = service.setupState; const name = cookieName(state.serviceId, origin); const maxAge = Math.floor((new Date(result.expiresAt).getTime() - Date.now()) / 1000)
    sendJson(res, 200, withMeta(randomUUID(), safeProfile(result.user)), { 'set-cookie': sessionCookie(name, result.token, origin, options.protocol(), maxAge) })
  })

  const logout = async (req: IncomingMessage, res: ServerResponse): Promise<void> => dispatch(req, res, async () => {
    requireMethod(req, 'POST'); assertTrust(req, true); requireJson(req); const body = bodyObject(await readBody(req)); assertKeys(body, [])
    service.logout(tokenFor(req)); const origin = options.origin(); if (origin === undefined) throw new HttpError(503, 'IDENTITY_UNAVAILABLE', 'identity service is unavailable', true)
    const state = service.setupState; const name = cookieName(state.serviceId, origin); sendEmpty(res, 204, { 'set-cookie': clearCookie(name, origin, options.protocol()) })
  })

  const me = async (req: IncomingMessage, res: ServerResponse): Promise<void> => dispatch(req, res, () => { requireMethod(req, 'GET'); assertTrust(req, false); const actor = requireActor(req); const profile = service.profile(actor.userId); if (profile === undefined) throw new HttpError(401, 'SESSION_EXPIRED', 'business session is required'); sendJson(res, 200, withMeta(randomUUID(), safeProfile(profile))) })

  const preferences = async (req: IncomingMessage, res: ServerResponse): Promise<void> => dispatch(req, res, async () => {
    requireMethod(req, 'PATCH'); assertTrust(req, true); const actor = requireActor(req); requireJson(req); const body = bodyObject(await readBody(req)); assertKeys(body, ['expected_revision', 'display_name', 'timezone', 'domains', 'learning_tracks', 'goal_text']); const expectedRevision = validateExpectedRevision(body.expected_revision)
    const patch: { displayName?: string; timezone?: string; domains?: readonly import('./identity.ts').Domain[]; learningTracks?: readonly import('./identity.ts').LearningTrack[]; goalText?: string } = {}
    if (body.display_name !== undefined) patch.displayName = validateDisplayName(body.display_name)
    if (body.timezone !== undefined) patch.timezone = validateTimezone(body.timezone)
    if (body.domains !== undefined) patch.domains = validateDomains(body.domains)
    if (body.learning_tracks !== undefined) patch.learningTracks = validateLearningTracks(body.learning_tracks)
    if (body.goal_text !== undefined) patch.goalText = validateGoalText(body.goal_text)
    if (Object.keys(patch).length === 0) throw new HttpError(422, 'INPUT_INVALID', 'at least one preference is required')
    sendJson(res, 200, withMeta(randomUUID(), safeProfile(service.preferences(actor.userId, expectedRevision, patch))))
  })

  const spaces = async (req: IncomingMessage, res: ServerResponse): Promise<void> => dispatch(req, res, () => { requireMethod(req, 'GET'); assertTrust(req, false); const actor = requireActor(req); const data = service.spaces(actor.userId).map(space => ({ id: space.id, service_id: space.serviceId, kind: space.kind, owner_user_id: space.ownerUserId, status: space.status, revision: space.revision, created_at: space.createdAt, updated_at: space.updatedAt })); sendJson(res, 200, withMeta(randomUUID(), data)) })

  return { status, bootstrap, register, login, logout, me, preferences, spaces }
}

function buildAccountHtmlLegacy(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnowledgeOS 账号</title><style>body{margin:0;background:#f4f8f8;color:#23333a;font-family:"Segoe UI","Microsoft YaHei UI",system-ui,sans-serif}main{max-width:880px;margin:0 auto;padding:32px 20px 56px}h1{margin:0 0 8px;font-size:28px}p{line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{background:#fff;border:1px solid #dce8e9;border-radius:14px;padding:20px;box-shadow:0 8px 24px #31535b12}label{display:block;margin:10px 0 5px;color:#597078;font-size:13px}input,textarea,select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c8d8da;border-radius:8px;font:inherit}textarea{min-height:90px}button{margin-top:14px;border:0;border-radius:8px;background:#3d7e86;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}button.secondary{background:#edf5f6;color:#315e65}small{color:#6b7d82}.message{padding:10px 12px;border-radius:8px;background:#edf5f6;margin:12px 0;white-space:pre-wrap}.hidden{display:none}.pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#edf5f6;color:#315e65;font-size:12px}</style></head><body><main><h1>KnowledgeOS 账号</h1><p id="state">正在读取本机业务身份…</p><div id="message" class="message hidden"></div><div class="grid"><section class="card"><h2>登录</h2><label>登录名</label><input id="login_name"><label>密码</label><input id="login_password" type="password"><button id="login">登录</button></section><section class="card"><h2>注册普通账号</h2><label>登录名</label><input id="register_name"><label>显示名称</label><input id="register_display"><label>密码（15–128 位）</label><input id="register_password" type="password"><button id="register">注册</button></section></div><section id="profile" class="card hidden" style="margin-top:16px"><h2>我的个人空间</h2><p id="who"></p><label>方向（逗号分隔）</label><input id="domains" placeholder="software_engineering,system_architecture"><label>学习主线（逗号分隔）</label><input id="tracks" placeholder="engineering_practice,architecture_exam"><label>目标</label><textarea id="goal"></textarea><label>时区</label><input id="timezone" value="Asia/Shanghai"><button id="save">保存个人偏好</button><button id="logout" class="secondary">退出</button></section></main><script>(async()=>{const $=id=>document.getElementById(id);let revision=1;let generation=0;const msg=(text,bad=false)=>{const el=$("message");el.textContent=text;el.className="message";el.style.background=bad?"#fbefee":"#edf5f6"};const call=async(path,options={})=>{const headers={...(options.headers||{})};if(options.method&&options.method!=="GET"){headers["content-type"]="application/json";headers["x-knowledgeos-request"]="1"}const r=await fetch(path,{...options,headers});let j;try{j=await r.json()}catch{}if(!r.ok)throw new Error(j?.message||("请求失败 "+r.status));return j};const load=async()=>{const requestGeneration=++generation;try{const j=await call("/knowledge/v1/me");if(requestGeneration!==generation)return;const u=j.data;revision=u.revision;$("state").textContent="已登录 · "+u.role;$("who").textContent=u.display_name+"（"+u.login_name+"） · 个人空间 "+u.personal_space_id;$("domains").value=(u.domains||[]).join(",");$("tracks").value=(u.learning_tracks||[]).join(",");$("goal").value=u.goal_text||"";$("timezone").value=u.timezone||"Asia/Shanghai";$("profile").className="card"}catch{if(requestGeneration!==generation)return;$("state").textContent="未登录，可注册或登录";$("profile").className="card hidden"}};$("login").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/login",{method:"POST",body:JSON.stringify({login_name:$("login_name").value,password:$("login_password").value})});if(requestGeneration!==generation)return;$("login_password").value="";await load();msg("登录成功")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("register").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/register",{method:"POST",body:JSON.stringify({login_name:$("register_name").value,display_name:$("register_display").value,password:$("register_password").value})});if(requestGeneration!==generation)return;$("register_password").value="";msg("注册成功，请登录")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("save").onclick=async()=>{const requestGeneration=generation;try{const j=await call("/knowledge/v1/me/preferences",{method:"PATCH",body:JSON.stringify({expected_revision:revision,domains:$("domains").value.split(",").map(x=>x.trim()).filter(Boolean),learning_tracks:$("tracks").value.split(",").map(x=>x.trim()).filter(Boolean),goal_text:$("goal").value,timezone:$("timezone").value})});if(requestGeneration!==generation)return;revision=j.data.revision;msg("个人偏好已保存")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("logout").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/logout",{method:"POST",body:"{}"});if(requestGeneration!==generation)return;$("profile").className="card hidden";$("state").textContent="已退出";$("who").textContent="";msg("已退出")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};await load()})()</script></body></html>`
}

export function buildAccountHtml(): string {
  const html = buildAccountHtmlLegacy()
  const script = String.raw`<script>(async()=>{const $=id=>document.getElementById(id);let revision=0,generation=0,authenticatedGeneration=0,canSave=false;const msg=(text,bad=false)=>{const el=$("message");el.textContent=text;el.className="message";el.style.background=bad?"#fbefee":"#edf5f6"};const clearProfile=()=>{revision=0;authenticatedGeneration=0;canSave=false;$("save").disabled=true;["who","domains","tracks","goal","timezone","login_password","register_password"].forEach(id=>{const el=$(id);if(el)el.value=""});$("profile").className="card hidden"};const stateFor=e=>e?.status===401?"未登录，可注册或登录":e?.status===429?"请求受限，请稍后再试":e?.status===503?"服务不可用，请稍后重试":"请求失败";const call=async(path,options={})=>{const headers={...(options.headers||{})};if(options.method&&options.method!=="GET"){headers["content-type"]="application/json";headers["x-knowledgeos-request"]="1"}const r=await fetch(path,{...options,headers});let j;try{j=await r.json()}catch{}if(!r.ok){const e=new Error(j?.message||("请求失败 "+r.status));e.status=r.status;throw e}return j};const load=async(existingGeneration)=>{const my=existingGeneration===undefined?++generation:existingGeneration;clearProfile();try{const j=await call("/knowledge/v1/me");if(my!==generation)return;const u=j.data;revision=u.revision;$("state").textContent="已登录 · "+u.role;$("who").textContent=u.display_name+"（"+u.login_name+"） · 个人空间 "+u.personal_space_id;$("domains").value=(u.domains||[]).join(",");$("tracks").value=(u.learning_tracks||[]).join(",");$("goal").value=u.goal_text||"";$("timezone").value=u.timezone||"Asia/Shanghai";authenticatedGeneration=my;canSave=true;$("save").disabled=false;$("profile").className="card"}catch(e){if(my!==generation)return;clearProfile();$("state").textContent=stateFor(e);msg(e?.message||"请求失败",true)}};$("login").onclick=async()=>{const loginName=$("login_name").value;const loginPassword=$("login_password").value;const my=++generation;clearProfile();$("state").textContent="正在登录…";try{await call("/knowledge/v1/auth/login",{method:"POST",body:JSON.stringify({login_name:loginName,password:loginPassword})});if(my!==generation)return;$("login_password").value="";await load(my);if(my===generation&&canSave)msg("登录成功")}catch(e){if(my!==generation)return;clearProfile();$("state").textContent=stateFor(e);msg(e?.message||"登录失败",true)}};$("register").onclick=async()=>{const my=++generation;try{await call("/knowledge/v1/auth/register",{method:"POST",body:JSON.stringify({login_name:$("register_name").value,display_name:$("register_display").value,password:$("register_password").value})});if(my!==generation)return;$("register_password").value="";msg("注册成功，请登录")}catch(e){if(my!==generation)return;msg(e?.message||"注册失败",true)}};$("save").onclick=async()=>{const my=authenticatedGeneration;if(!canSave||my!==generation)return;try{const j=await call("/knowledge/v1/me/preferences",{method:"PATCH",body:JSON.stringify({expected_revision:revision,domains:$("domains").value.split(",").map(x=>x.trim()).filter(Boolean),learning_tracks:$("tracks").value.split(",").map(x=>x.trim()).filter(Boolean),goal_text:$("goal").value,timezone:$("timezone").value})});if(my!==generation)return;revision=j.data.revision;msg("个人偏好已保存")}catch(e){if(my!==generation)return;if(e?.status===401||e?.status===503){clearProfile();$("state").textContent=stateFor(e)}msg(e?.message||"保存失败",true)}};$("logout").onclick=async()=>{const my=++generation;clearProfile();$("state").textContent="正在退出…";try{await call("/knowledge/v1/auth/logout",{method:"POST",body:"{}"});if(my!==generation)return;$("state").textContent="已退出";msg("已退出")}catch(e){if(my!==generation)return;$("state").textContent=stateFor(e);msg(e?.message||"退出失败",true)}};await load()})()</script>`
  return html.replace(/<script>[\s\S]*?<\/script>/, script)
}

export function buildSetupHtml(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnowledgeOS 初始化</title><style>body{margin:0;background:#f4f8f8;color:#23333a;font-family:"Segoe UI","Microsoft YaHei UI",system-ui,sans-serif}main{max-width:560px;margin:0 auto;padding:48px 20px}.card{background:#fff;border:1px solid #dce8e9;border-radius:14px;padding:24px}label{display:block;margin:12px 0 5px;color:#597078;font-size:13px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c8d8da;border-radius:8px;font:inherit}button{margin-top:16px;border:0;border-radius:8px;background:#3d7e86;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}.message{margin-top:12px;padding:10px;border-radius:8px;background:#edf5f6;white-space:pre-wrap}</style></head><body><main><section class="card"><h1>首次管理员初始化</h1><p>仅可信本机 DSH owner 可以完成一次初始化。</p><label>管理员登录名</label><input id="name"><label>显示名称</label><input id="display"><label>密码（15–128 位）</label><input id="password" type="password"><button id="submit">创建管理员</button><div id="message" class="message"></div></section></main><script>document.getElementById('submit').onclick=async()=>{const m=document.getElementById('message');try{const r=await fetch('/knowledge/v1/auth/bootstrap',{method:'POST',headers:{'content-type':'application/json','x-knowledgeos-request':'1'},body:JSON.stringify({login_name:document.getElementById('name').value,display_name:document.getElementById('display').value,password:document.getElementById('password').value})});const j=await r.json();if(!r.ok)throw new Error(j.message||('请求失败 '+r.status));document.getElementById('password').value='';m.textContent='初始化完成，请前往账号页登录。'}catch(e){m.textContent=e.message}}</script></body></html>`
}
