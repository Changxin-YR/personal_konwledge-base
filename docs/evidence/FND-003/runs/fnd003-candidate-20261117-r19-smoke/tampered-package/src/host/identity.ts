import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'

export const DOMAINS = ['software_engineering', 'system_architecture', 'hardware_engineering', 'ai_development'] as const
export const LEARNING_TRACKS = ['engineering_practice', 'architecture_exam', 'knowledge_accumulation'] as const
export type Domain = typeof DOMAINS[number]
export type LearningTrack = typeof LEARNING_TRACKS[number]
export type UserRole = 'admin' | 'member'
export type UserStatus = 'active' | 'disabled'

export const DEFAULT_TIMEZONE = 'Asia/Shanghai'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const MAX_REQUEST_BODY_BYTES = 16 * 1024
export const KDF_CONFIG = {
  algorithm: 'scrypt',
  version: 1,
  n: 131072,
  r: 8,
  p: 1,
  maxmem: 192 * 1024 * 1024,
  keyLen: 32,
  saltBytes: 16,
} as const

export interface ProfileRecord {
  readonly id: string
  readonly loginName: string
  readonly displayName: string
  readonly role: UserRole
  readonly status: UserStatus
  readonly timezone: string
  readonly planningHomeServiceId: string
  readonly domains: readonly Domain[]
  readonly learningTracks: readonly LearningTrack[]
  readonly goalText: string
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly personalSpaceId: string
}

export type UserRecord = ProfileRecord

export interface SetupState {
  readonly serviceId: string
  readonly initialized: boolean
  readonly initializedAt?: string
  readonly bootstrapAdminUserId?: string
}

export interface SpaceRecord {
  readonly id: string
  readonly serviceId: string
  readonly kind: 'personal'
  readonly ownerUserId: string
  readonly status: string
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CredentialMaterial {
  readonly algorithm: string
  readonly version: number
  readonly n: number
  readonly r: number
  readonly p: number
  readonly maxmem: number
  readonly salt: Buffer
  readonly derivedKey: Buffer
}

export interface UserCreateInput {
  readonly loginName: string
  readonly displayName: string
  readonly timezone: string
  readonly domains: readonly Domain[]
  readonly learningTracks: readonly LearningTrack[]
  readonly goalText: string
  readonly now: string
}

export interface LoginLookup {
  readonly userId: string
  readonly loginName: string
  readonly displayName: string
  readonly role: UserRole
  readonly status: UserStatus
  readonly timezone: string
  readonly credential: CredentialMaterial
}

export interface SessionActor {
  readonly sessionId: string
  readonly userId: string
  readonly role: UserRole
  readonly serviceId: string
  readonly personalSpaceId: string
}

export interface PreferencePatch {
  readonly displayName?: string
  readonly timezone?: string
  readonly domains?: readonly Domain[]
  readonly learningTracks?: readonly LearningTrack[]
  readonly goalText?: string
}

export interface IdentityStore {
  getSetupState(): SetupState
  bootstrap(input: UserCreateInput & { readonly credential: CredentialMaterial }): { kind: 'created'; user: UserRecord } | { kind: 'already_initialized' }
  register(input: UserCreateInput & { readonly credential: CredentialMaterial }): { kind: 'created'; user: UserRecord } | { kind: 'setup_required' } | { kind: 'login_name_taken' }
  findLogin(loginName: string): LoginLookup | undefined
  createSession(input: { readonly sessionId: string; readonly userId: string; readonly tokenHash: string; readonly createdAt: string; readonly expiresAt: string; readonly revokeTokenHash?: string }): void
  findActor(tokenHash: string, now: string): SessionActor | undefined
  revokeSession(tokenHash: string, now: string): boolean
  getProfile(userId: string): ProfileRecord | undefined
  getSpaces(userId: string): SpaceRecord[]
  updatePreferences(userId: string, expectedRevision: number, patch: PreferencePatch, now: string): { kind: 'updated'; user: ProfileRecord } | { kind: 'conflict'; user?: ProfileRecord }
}

export class IdentityError extends Error {
  constructor(
    readonly code: 'STORAGE_UNAVAILABLE' | 'SETUP_REQUIRED' | 'ALREADY_INITIALIZED' | 'LOGIN_NAME_TAKEN' | 'INVALID_CREDENTIALS' | 'REVISION_CONFLICT' | 'AUTH_RATE_LIMITED' | 'INPUT_INVALID',
    message: string,
    readonly retryable = false,
    readonly retryAfterMs?: number,
  ) { super(message); this.name = 'IdentityError' }
}

export function normalizeLoginName(value: string): string {
  return value.trim().toLowerCase()
}

export function validateLoginName(value: unknown): string {
  if (typeof value !== 'string') throw new IdentityError('INPUT_INVALID', 'login_name must be a string')
  const normalized = normalizeLoginName(value)
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) throw new IdentityError('INPUT_INVALID', 'login_name must be 3-64 ASCII characters')
  return normalized
}

export function validateDisplayName(value: unknown): string {
  if (typeof value !== 'string' || !value.isWellFormed()) throw new IdentityError('INPUT_INVALID', 'display_name is invalid')
  const count = [...value].length
  if (count < 1 || count > 80 || Buffer.byteLength(value, 'utf8') > 320) throw new IdentityError('INPUT_INVALID', 'display_name length is invalid')
  return value
}

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || !value.isWellFormed()) throw new IdentityError('INPUT_INVALID', 'password is invalid')
  const count = [...value].length
  if (count < 15 || count > 128 || Buffer.byteLength(value, 'utf8') > 512) throw new IdentityError('INPUT_INVALID', 'password length is invalid')
  return value
}

export function validateTimezone(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100) throw new IdentityError('INPUT_INVALID', 'timezone is invalid')
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
  } catch { throw new IdentityError('INPUT_INVALID', 'timezone is invalid') }
  return value
}

function validateEnumList<T extends string>(value: unknown, allowed: readonly T[], label: string): readonly T[] {
  if (!Array.isArray(value) || value.length > allowed.length || value.some(item => typeof item !== 'string' || !allowed.includes(item as T))) throw new IdentityError('INPUT_INVALID', `${label} is invalid`)
  const unique = [...new Set(value as T[])]
  if (unique.length !== value.length) throw new IdentityError('INPUT_INVALID', `${label} contains duplicates`)
  return unique
}

export function validateDomains(value: unknown): readonly Domain[] { return validateEnumList(value, DOMAINS, 'domains') }
export function validateLearningTracks(value: unknown): readonly LearningTrack[] { return validateEnumList(value, LEARNING_TRACKS, 'learning_tracks') }

export function validateGoalText(value: unknown): string {
  if (typeof value !== 'string' || !value.isWellFormed() || Buffer.byteLength(value, 'utf8') > 2000) throw new IdentityError('INPUT_INVALID', 'goal_text is invalid')
  return value
}

export function validateExpectedRevision(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) throw new IdentityError('INPUT_INVALID', 'expected_revision is invalid')
  return Number(value)
}

export function tokenHash(token: string): string { return createHash('sha256').update(token, 'utf8').digest('hex') }
export function makeToken(): string { return randomBytes(32).toString('base64url') }

export class KdfScheduler {
  readonly #maxRunning = 2
  readonly #maxQueued = 8
  #running = 0
  #peakRunning = 0
  #started = 0
  #completed = 0
  #queuedCancelled = 0
  readonly #queue: Array<{ password: string; salt: Buffer; signal?: AbortSignal; resolve: (value: Buffer) => void; reject: (error: unknown) => void }> = []
  #closing = false

  get running(): number { return this.#running }
  get queued(): number { return this.#queue.length }
  get peakRunning(): number { return this.#peakRunning }
  get started(): number { return this.#started }
  get completed(): number { return this.#completed }
  get queuedCancelled(): number { return this.#queuedCancelled }

  async derive(password: string, salt: Buffer, signal?: AbortSignal): Promise<Buffer> {
    if (this.#closing) throw new IdentityError('STORAGE_UNAVAILABLE', 'password service is closing', true)
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    if (this.#running >= this.#maxRunning && this.#queue.length >= this.#maxQueued) throw new IdentityError('AUTH_RATE_LIMITED', 'authentication work is busy', true)
    if (this.#running < this.#maxRunning) return await this.#start(password, salt, signal)
    return await new Promise<Buffer>((resolve, reject) => {
      const item = { password, salt, signal, resolve, reject }
      this.#queue.push(item)
      const onAbort = (): void => {
        const index = this.#queue.indexOf(item)
        if (index !== -1) { this.#queue.splice(index, 1); this.#queuedCancelled += 1; reject(new DOMException('aborted', 'AbortError')) }
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  async #start(password: string, salt: Buffer, signal?: AbortSignal): Promise<Buffer> {
    this.#running += 1
    this.#peakRunning = Math.max(this.#peakRunning, this.#running)
    this.#started += 1
    try {
      return await new Promise<Buffer>((resolve, reject) => {
        nodeScrypt(password, salt, KDF_CONFIG.keyLen, { N: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem }, (error, derived) => {
          if (error) reject(error)
          else { this.#completed += 1; resolve(derived) }
        })
      })
    } finally {
      this.#running -= 1
      const next = this.#queue.shift()
      if (next !== undefined) {
        if (next.signal?.aborted) next.reject(new DOMException('aborted', 'AbortError'))
        else void this.#start(next.password, next.salt, next.signal).then(next.resolve, next.reject)
      }
    }
  }

  async close(): Promise<void> {
    this.#closing = true
    for (const item of this.#queue.splice(0)) item.reject(new DOMException('aborted', 'AbortError'))
    while (this.#running > 0) await new Promise(resolve => setTimeout(resolve, 5))
  }
}

export async function derivePassword(scheduler: KdfScheduler, password: string, signal?: AbortSignal): Promise<CredentialMaterial> {
  const salt = randomBytes(KDF_CONFIG.saltBytes)
  const derivedKey = await scheduler.derive(password, salt, signal)
  return { algorithm: KDF_CONFIG.algorithm, version: KDF_CONFIG.version, n: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem, salt, derivedKey }
}

export async function verifyPassword(scheduler: KdfScheduler, password: string, credential: CredentialMaterial, signal?: AbortSignal): Promise<boolean> {
  if (credential.algorithm !== KDF_CONFIG.algorithm || credential.version !== KDF_CONFIG.version || credential.n !== KDF_CONFIG.n || credential.r !== KDF_CONFIG.r || credential.p !== KDF_CONFIG.p || credential.maxmem !== KDF_CONFIG.maxmem || credential.salt.length !== KDF_CONFIG.saltBytes || credential.derivedKey.length !== KDF_CONFIG.keyLen) return false
  const derived = await scheduler.derive(password, credential.salt, signal)
  return derived.length === credential.derivedKey.length && timingSafeEqual(derived, credential.derivedKey)
}

interface FailureBucket { count: number; windowStarted: number }

export class AuthRateLimiter {
  readonly #byLogin = new Map<string, FailureBucket>()
  readonly #bySource = new Map<string, FailureBucket>()
  readonly #maxKeys = 4096
  #prune(map: Map<string, FailureBucket>, now: number, windowMs: number): void {
    for (const [key, bucket] of map) if (now - bucket.windowStarted >= windowMs) map.delete(key)
  }
  #bound(map: Map<string, FailureBucket>): void {
    while (map.size > this.#maxKeys) {
      const key = map.keys().next().value as string | undefined
      if (key === undefined) break
      map.delete(key)
    }
  }
  static readonly ACCOUNT_WINDOW_MS = 15 * 60 * 1000
  static readonly SOURCE_WINDOW_MS = 60 * 1000
  static readonly SOURCE_LIMIT = 30
  static readonly ACCOUNT_FAILURE_LIMIT = 5

  #retryAfter(bucket: FailureBucket | undefined, windowMs: number, now: number): number {
    if (bucket === undefined) return 1_000
    return Math.max(1_000, bucket.windowStarted + windowMs - now)
  }

  check(loginName: string, source: string, now = Date.now()): void {
    this.#prune(this.#byLogin, now, AuthRateLimiter.ACCOUNT_WINDOW_MS); this.#prune(this.#bySource, now, AuthRateLimiter.SOURCE_WINDOW_MS)
    const account = this.#byLogin.get(loginName); const client = this.#bySource.get(source)
    if ((account?.count ?? 0) >= AuthRateLimiter.ACCOUNT_FAILURE_LIMIT) throw new IdentityError('AUTH_RATE_LIMITED', 'authentication attempts are temporarily limited', true, this.#retryAfter(account, AuthRateLimiter.ACCOUNT_WINDOW_MS, now))
    if ((client?.count ?? 0) >= AuthRateLimiter.SOURCE_LIMIT) throw new IdentityError('AUTH_RATE_LIMITED', 'authentication attempts are temporarily limited', true, this.#retryAfter(client, AuthRateLimiter.SOURCE_WINDOW_MS, now))
  }

  /** Count every syntactically valid authentication attempt before KDF work. */
  attempt(loginName: string, source: string, now = Date.now()): void {
    this.check(loginName, source, now)
    const current = this.#bySource.get(source)
    if (current === undefined || now - current.windowStarted >= AuthRateLimiter.SOURCE_WINDOW_MS) this.#bySource.set(source, { count: 1, windowStarted: now })
    else current.count += 1
    this.#bound(this.#bySource)
  }
  failure(loginName: string, source: string, now = Date.now()): void {
    const bump = (map: Map<string, FailureBucket>, key: string, windowMs: number): void => {
      const current = map.get(key)
      if (current === undefined || now - current.windowStarted >= windowMs) map.set(key, { count: 1, windowStarted: now })
      else current.count += 1
    }
    bump(this.#byLogin, loginName, AuthRateLimiter.ACCOUNT_WINDOW_MS); this.#bound(this.#byLogin)
  }
}

export class IdentityService {
  readonly #store: IdentityStore
  readonly #kdf: KdfScheduler
  readonly #limiter: AuthRateLimiter

  constructor(store: IdentityStore, options: { readonly kdf?: KdfScheduler; readonly limiter?: AuthRateLimiter } = {}) {
    this.#store = store; this.#kdf = options.kdf ?? new KdfScheduler(); this.#limiter = options.limiter ?? new AuthRateLimiter()
  }

  get setupState(): SetupState { return this.#store.getSetupState() }
  get scheduler(): KdfScheduler { return this.#kdf }

  async bootstrap(input: { loginName: unknown; displayName: unknown; password: unknown; timezone?: unknown; domains?: unknown; learningTracks?: unknown; goalText?: unknown; signal?: AbortSignal; source?: string }): Promise<UserRecord> {
    const loginName = validateLoginName(input.loginName); const displayName = validateDisplayName(input.displayName); const password = validatePassword(input.password)
    const timezone = validateTimezone(input.timezone ?? DEFAULT_TIMEZONE); const domains = validateDomains(input.domains ?? []); const learningTracks = validateLearningTracks(input.learningTracks ?? []); const goalText = validateGoalText(input.goalText ?? '')
    this.#limiter.attempt(loginName, input.source ?? 'bootstrap')
    const credential = await derivePassword(this.#kdf, password, input.signal)
    if (input.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const result = this.#store.bootstrap({ loginName, displayName, timezone, domains, learningTracks, goalText, now: new Date().toISOString(), credential })
    if (result.kind === 'already_initialized') throw new IdentityError('ALREADY_INITIALIZED', 'service is already initialized')
    return result.user
  }

  async register(input: { loginName: unknown; displayName: unknown; password: unknown; timezone?: unknown; domains?: unknown; learningTracks?: unknown; goalText?: unknown; signal?: AbortSignal; source?: string }): Promise<UserRecord> {
    const loginName = validateLoginName(input.loginName); const displayName = validateDisplayName(input.displayName); const password = validatePassword(input.password)
    const timezone = validateTimezone(input.timezone ?? DEFAULT_TIMEZONE); const domains = validateDomains(input.domains ?? []); const learningTracks = validateLearningTracks(input.learningTracks ?? []); const goalText = validateGoalText(input.goalText ?? '')
    this.#limiter.attempt(loginName, input.source ?? 'register')
    const credential = await derivePassword(this.#kdf, password, input.signal)
    if (input.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const result = this.#store.register({ loginName, displayName, timezone, domains, learningTracks, goalText, now: new Date().toISOString(), credential })
    if (result.kind === 'setup_required') throw new IdentityError('SETUP_REQUIRED', 'service setup is required')
    if (result.kind === 'login_name_taken') throw new IdentityError('LOGIN_NAME_TAKEN', 'login name is already in use')
    return result.user
  }

  async login(input: { loginName: unknown; password: unknown; oldToken?: string; source: string; signal?: AbortSignal }): Promise<{ user: ProfileRecord; token: string; expiresAt: string }> {
    const loginName = validateLoginName(input.loginName); const password = validatePassword(input.password)
    this.#limiter.attempt(loginName, input.source)
    const lookup = this.#store.findLogin(loginName)
    let valid = false
    try {
      valid = await verifyPassword(this.#kdf, password, lookup?.credential ?? { algorithm: 'scrypt', version: 1, n: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem, salt: Buffer.alloc(KDF_CONFIG.saltBytes), derivedKey: Buffer.alloc(KDF_CONFIG.keyLen) }, input.signal)
    } catch (error) {
      if (error instanceof IdentityError && error.code === 'AUTH_RATE_LIMITED') throw error
      valid = false
    }
    if (input.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    if (!lookup || lookup.status !== 'active' || !valid) { this.#limiter.failure(loginName, input.source); throw new IdentityError('INVALID_CREDENTIALS', 'invalid credentials') }
    const token = makeToken(); const createdAt = new Date(); const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString()
    this.#store.createSession({ sessionId: randomUUID(), userId: lookup.userId, tokenHash: tokenHash(token), createdAt: createdAt.toISOString(), expiresAt, revokeTokenHash: input.oldToken ? tokenHash(input.oldToken) : undefined })
    const user = this.#store.getProfile(lookup.userId)
    if (user === undefined) throw new IdentityError('STORAGE_UNAVAILABLE', 'user profile unavailable')
    return { user, token, expiresAt }
  }

  actor(token: string | undefined, now = new Date().toISOString()): SessionActor | undefined { return token === undefined ? undefined : this.#store.findActor(tokenHash(token), now) }
  profile(userId: string): ProfileRecord | undefined { return this.#store.getProfile(userId) }
  spaces(userId: string): SpaceRecord[] { return this.#store.getSpaces(userId) }
  logout(token: string | undefined): void { if (token !== undefined) this.#store.revokeSession(tokenHash(token), new Date().toISOString()) }
  preferences(userId: string, expectedRevision: number, patch: PreferencePatch): ProfileRecord { const result = this.#store.updatePreferences(userId, expectedRevision, patch, new Date().toISOString()); if (result.kind === 'conflict') throw new IdentityError('REVISION_CONFLICT', 'profile revision has changed'); return result.user }
  async close(): Promise<void> { await this.#kdf.close() }
}
