/**
 * SQLite adapter for the KnowledgeOS business database.
 *
 * The adapter owns the single DatabaseSync connection, v1/v2 ownership checks,
 * migrations, identity transactions, and the original FND-002 probe records.
 * HTTP and application modules never receive the database handle.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type {
  CredentialMaterial,
  IdentityStore,
  LoginLookup,
  PreferencePatch,
  ProfileRecord,
  SessionActor,
  SpaceRecord,
  SetupState,
  UserCreateInput,
  UserRecord,
} from './identity.ts'
import type { CreateOutcome, ProbeRecord, ProbeStorePort } from './records.ts'
import { RecordsError } from './records.ts'

/** Fixed application identity written to PRAGMA application_id (KOS1). */
export const APPLICATION_ID = 0x4b4f5331
/** Current application schema version. */
export const SCHEMA_VERSION = 2
/** Historical v1 schema version used by FND-002 fixtures. */
export const PROBE_SCHEMA_VERSION = 1
export const BUSY_TIMEOUT_MS = 250
export const DATABASE_FILENAME = 'knowledgeos.sqlite'

export const MIGRATION_V1_SQL = `CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;
CREATE TABLE storage_probe_records (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_digest TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
`
export const MIGRATION_V1_CHECKSUM = createHash('sha256').update(Buffer.from(MIGRATION_V1_SQL, 'utf8')).digest('hex')

/** v2 schema bytes. The service identity row is inserted by the adapter. */
export const MIGRATION_V2_SQL = `CREATE TABLE password_credentials (
  id TEXT PRIMARY KEY,
  algorithm TEXT NOT NULL,
  version INTEGER NOT NULL,
  n INTEGER NOT NULL,
  r INTEGER NOT NULL,
  p INTEGER NOT NULL,
  maxmem INTEGER NOT NULL,
  salt BLOB NOT NULL,
  derived_key BLOB NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  login_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  credential_ref TEXT NOT NULL UNIQUE REFERENCES password_credentials(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  timezone TEXT NOT NULL,
  planning_home_service_id TEXT NOT NULL,
  domains TEXT NOT NULL,
  learning_tracks TEXT NOT NULL,
  goal_text TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE service_identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  service_id TEXT NOT NULL UNIQUE,
  bootstrap_admin_user_id TEXT UNIQUE REFERENCES users(id),
  initialized_at TEXT
) STRICT;
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;
CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  kind TEXT NOT NULL CHECK (kind = 'personal'),
  owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
`
export const MIGRATION_V2_CHECKSUM = createHash('sha256').update(Buffer.from(MIGRATION_V2_SQL, 'utf8')).digest('hex')

export const PROBE_SUPPORTED_TABLES = ['schema_migrations', 'storage_probe_records'] as const
export const IDENTITY_SUPPORTED_TABLES = [
  'auth_sessions', 'password_credentials', 'schema_migrations', 'service_identity', 'spaces', 'storage_probe_records', 'users',
] as const

export interface MigrationPlan {
  readonly version: number
  readonly sql: string
  readonly checksum: string
}

export const MIGRATION_V1: MigrationPlan = { version: 1, sql: MIGRATION_V1_SQL, checksum: MIGRATION_V1_CHECKSUM }
export const MIGRATION_V2: MigrationPlan = { version: 2, sql: MIGRATION_V2_SQL, checksum: MIGRATION_V2_CHECKSUM }

export interface ProbeStorageOptions {
  readonly dataDir: string
  readonly log?: (message: string) => void
  /** Test-only v1 migration override; never wired from HTTP/config. */
  readonly migrationOverride?: MigrationPlan
}

export interface DatabaseFacts {
  readonly applicationId: number
  readonly userVersion: number
  readonly tables: readonly string[]
  readonly objects: readonly { type: string; name: string }[]
  readonly ledger: readonly { version: number; checksum: string; applied_at: string }[]
}

interface StoredRow {
  readonly id: string
  readonly idempotency_key: string
  readonly request_digest: string
  readonly content: string
  readonly created_at: string
}

type StorageState = 'ready' | 'unavailable' | 'closed'

function primarySqliteCode(error: unknown): number | undefined {
  const code = (error as { errcode?: unknown } | null)?.errcode
  return typeof code === 'number' ? code & 0xff : undefined
}

function toRecord(row: StoredRow): ProbeRecord {
  return { id: row.id, content: row.content, created_at: row.created_at }
}

function readSchemaObjects(db: DatabaseSync): { type: string; name: string }[] {
  return (db.prepare('SELECT type, name FROM sqlite_master ORDER BY type, name').all() as { type: string; name: string }[])
    .filter(object => !object.name.startsWith('sqlite_'))
}

export function readDatabaseFacts(path: string): DatabaseFacts {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const applicationId = Number((db.prepare('PRAGMA application_id').get() as { application_id?: number } | undefined)?.application_id ?? 0)
    const userVersion = Number((db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0)
    const objects = readSchemaObjects(db)
    const tables = objects.filter(object => object.type === 'table').map(object => object.name)
    const ledger = tables.includes('schema_migrations')
      ? db.prepare('SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version').all() as { version: number; checksum: string; applied_at: string }[]
      : []
    return { applicationId, userVersion, tables, objects, ledger }
  } finally {
    db.close()
  }
}

function rowProfile(row: Record<string, unknown>): ProfileRecord {
  return {
    id: String(row.id),
    loginName: String(row.login_name),
    displayName: String(row.display_name),
    role: String(row.role) as ProfileRecord['role'],
    status: String(row.status) as ProfileRecord['status'],
    timezone: String(row.timezone),
    planningHomeServiceId: String(row.planning_home_service_id),
    domains: JSON.parse(String(row.domains)) as ProfileRecord['domains'],
    learningTracks: JSON.parse(String(row.learning_tracks)) as ProfileRecord['learningTracks'],
    goalText: String(row.goal_text),
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    personalSpaceId: String(row.personal_space_id),
  }
}

export class ProbeStorage implements ProbeStorePort, IdentityStore {
  readonly #dataDir: string
  readonly #log: (message: string) => void
  readonly #migrationOverride: MigrationPlan | undefined
  #db: DatabaseSync | undefined
  #state: StorageState = 'unavailable'
  #failure: RecordsError | undefined
  #closed = false

  constructor(options: ProbeStorageOptions) {
    this.#dataDir = options.dataDir
    this.#log = options.log ?? (() => {})
    this.#migrationOverride = options.migrationOverride
    this.#open()
  }

  get available(): boolean { return this.#state === 'ready' }
  get failure(): RecordsError | undefined { return this.#failure }
  get databasePath(): string { return join(this.#dataDir, DATABASE_FILENAME) }

  #open(): void {
    let db: DatabaseSync | undefined
    try {
      mkdirSync(this.#dataDir, { recursive: true })
      const path = this.databasePath
      const existing = existsSync(path) ? this.#precheck(path) : 'blank'
      db = new DatabaseSync(path)
      this.#configure(db)
      if (existing === 'blank') {
        this.#migrateV1(db)
        this.#migrateV2(db)
      } else if (existing === 'v1') {
        this.#migrateV2(db)
      }
      this.#verify(db)
      const facts = readDatabaseFacts(path)
      const pragmas = this.#readPragmas(db)
      this.#db = db
      this.#state = 'ready'
      this.#log(`knowledgeos-storage: opened node=${process.versions.node} sqlite=${pragmas.sqliteVersion} journal=${pragmas.journalMode} foreign_keys=${pragmas.foreignKeys} synchronous=${pragmas.synchronous} busy_timeout=${pragmas.busyTimeout} tables=${facts.tables.length}`)
    } catch (error: unknown) {
      try { db?.close() } catch { /* preserve original failure */ }
      this.#failure = error instanceof RecordsError ? error : new RecordsError('STORAGE_UNAVAILABLE', 'storage could not be opened', false, { cause: error })
      this.#state = 'unavailable'
      this.#log(`knowledgeos-storage: unavailable code=${this.#failure.code}`)
    }
  }

  #precheck(path: string): 'blank' | 'v1' | 'v2' {
    const facts = readDatabaseFacts(path)
    if (facts.applicationId === 0 && facts.userVersion === 0 && facts.objects.length === 0) return 'blank'
    if (facts.applicationId !== APPLICATION_ID) throw new RecordsError('STORAGE_INCOMPATIBLE', 'database belongs to another application')
    if (facts.userVersion > SCHEMA_VERSION) throw new RecordsError('STORAGE_INCOMPATIBLE', 'database schema is newer than this build')
    if (facts.userVersion === 1) {
      this.#assertV1Schema(facts)
      return 'v1'
    }
    if (facts.userVersion === 2) {
      this.#assertV2Schema(facts)
      const db = new DatabaseSync(path, { readOnly: true })
      try { this.#assertV2Definitions(db) } finally { db.close() }
      return 'v2'
    }
    throw new RecordsError('STORAGE_INCOMPATIBLE', 'database schema version is not supported')
  }

  #assertV1Schema(facts: DatabaseFacts): void {
    const expected = [...PROBE_SUPPORTED_TABLES].sort()
    const actual = facts.objects.filter(object => object.type === 'table').map(object => object.name).sort()
    if (facts.objects.some(object => object.type !== 'table') || actual.join(',') !== expected.join(',')) throw new RecordsError('STORAGE_INCOMPATIBLE', 'database contains an unknown v1 schema')
    const entry = facts.ledger[0]
    if (facts.ledger.length !== 1 || entry?.version !== 1 || entry.checksum !== MIGRATION_V1_CHECKSUM) throw new RecordsError('STORAGE_INCOMPATIBLE', 'v1 migration ledger does not match this build')
  }

  #assertV2Schema(facts: DatabaseFacts): void {
    const expected = [...IDENTITY_SUPPORTED_TABLES].sort()
    const actual = facts.objects.filter(object => object.type === 'table').map(object => object.name).sort()
    if (facts.objects.some(object => object.type !== 'table') || actual.join(',') !== expected.join(',')) throw new RecordsError('STORAGE_INCOMPATIBLE', 'database contains an unknown v2 schema')
    const v1 = facts.ledger.find(entry => entry.version === 1)
    const v2 = facts.ledger.find(entry => entry.version === 2)
    if (facts.ledger.length !== 2 || v1?.checksum !== MIGRATION_V1_CHECKSUM || v2?.checksum !== MIGRATION_V2_CHECKSUM) throw new RecordsError('STORAGE_INCOMPATIBLE', 'v2 migration ledger does not match this build')
  }

  #assertV2Definitions(db: DatabaseSync): void {
    const definitions = new Map((db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all() as { name: string; sql: string | null }[]).map(row => [row.name, row.sql ?? '']))
    const expectedColumns: Record<string, string[]> = {
      password_credentials: ['id', 'algorithm', 'version', 'n', 'r', 'p', 'maxmem', 'salt', 'derived_key', 'created_at'],
      users: ['id', 'login_name', 'display_name', 'credential_ref', 'role', 'status', 'timezone', 'planning_home_service_id', 'domains', 'learning_tracks', 'goal_text', 'revision', 'created_at', 'updated_at'],
      service_identity: ['id', 'service_id', 'bootstrap_admin_user_id', 'initialized_at'],
      auth_sessions: ['id', 'user_id', 'token_hash', 'created_at', 'expires_at', 'revoked_at'],
      spaces: ['id', 'service_id', 'kind', 'owner_user_id', 'status', 'revision', 'created_at', 'updated_at'],
    }
    for (const [table, columns] of Object.entries(expectedColumns)) {
      const actual = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(row => row.name)
      if (actual.join(',') !== columns.join(',')) throw new RecordsError('STORAGE_INCOMPATIBLE', `v2 table definition is not accepted: ${table}`)
    }
    const requiredFragments = [
      ['users', 'REFERENCES password_credentials'], ['users', "CHECK (role IN ('admin', 'member'))"], ['users', "CHECK (status IN ('active', 'disabled'))"],
      ['auth_sessions', 'REFERENCES users'], ['auth_sessions', 'token_hash TEXT NOT NULL UNIQUE'],
      ['spaces', 'REFERENCES service_identity(service_id)'], ['spaces', 'REFERENCES users(id)'], ["spaces", "CHECK (kind = 'personal')"],
      ['service_identity', 'CHECK (id = 1)'], ['password_credentials', 'derived_key BLOB NOT NULL'],
    ] as const
    for (const [table, fragment] of requiredFragments) if (!definitions.get(table)?.includes(fragment)) throw new RecordsError('STORAGE_INCOMPATIBLE', `v2 constraint definition is not accepted: ${table}`)
  }

  #configure(db: DatabaseSync): void {
    const journal = String((db.prepare('PRAGMA journal_mode=WAL').get() as { journal_mode?: string } | undefined)?.journal_mode ?? '').toLowerCase()
    if (journal !== 'wal') throw new RecordsError('STORAGE_INCOMPATIBLE', 'WAL journal mode is not available')
    db.exec('PRAGMA foreign_keys=ON')
    db.exec('PRAGMA synchronous=FULL')
    db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`)
  }

  #readPragmas(db: DatabaseSync): { journalMode: string; foreignKeys: number; synchronous: number; busyTimeout: number; sqliteVersion: string } {
    return {
      journalMode: String((db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string } | undefined)?.journal_mode ?? ''),
      foreignKeys: Number((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys?: number } | undefined)?.foreign_keys ?? 0),
      synchronous: Number((db.prepare('PRAGMA synchronous').get() as { synchronous?: number } | undefined)?.synchronous ?? -1),
      busyTimeout: Number((db.prepare('PRAGMA busy_timeout').get() as { timeout?: number } | undefined)?.timeout ?? -1),
      sqliteVersion: String((db.prepare('SELECT sqlite_version() AS version').get() as { version?: string } | undefined)?.version ?? 'unknown'),
    }
  }

  #migrateV1(db: DatabaseSync): void {
    const plan = this.#migrationOverride?.version === 1 ? this.#migrationOverride : MIGRATION_V1
    let committed = false
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(plan.sql)
      db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)').run(plan.version, plan.checksum, new Date().toISOString())
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`)
      db.exec('PRAGMA user_version = 1')
      db.exec('COMMIT'); committed = true
    } catch (error: unknown) {
      if (!committed) this.#rollback(db)
      throw error instanceof RecordsError ? error : new RecordsError('STORAGE_INCOMPATIBLE', 'storage migration failed', false, { cause: error })
    }
  }

  #migrateV2(db: DatabaseSync): void {
    let committed = false
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(MIGRATION_V2_SQL)
      db.prepare('INSERT INTO service_identity (id, service_id, bootstrap_admin_user_id, initialized_at) VALUES (1, ?, NULL, NULL)').run(randomUUID())
      db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)').run(2, MIGRATION_V2_CHECKSUM, new Date().toISOString())
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`)
      db.exec('PRAGMA user_version = 2')
      db.exec('COMMIT'); committed = true
    } catch (error: unknown) {
      if (!committed) {
        const rolledBack = this.#rollback(db)
        if (!rolledBack) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      }
      throw error instanceof RecordsError ? error : new RecordsError('STORAGE_INCOMPATIBLE', 'identity migration failed', false, { cause: error })
    }
  }

  #verify(db: DatabaseSync): void {
    const facts = readDatabaseFacts(this.databasePath)
    if (facts.applicationId !== APPLICATION_ID || facts.userVersion !== 2) throw new RecordsError('STORAGE_INCOMPATIBLE', 'database ownership/version verification failed')
    this.#assertV2Schema(facts)
    this.#assertV2Definitions(db)
    const identity = db.prepare('SELECT id, service_id, bootstrap_admin_user_id, initialized_at FROM service_identity').all() as Record<string, unknown>[]
    if (identity.length !== 1 || Number(identity[0]?.id) !== 1 || typeof identity[0]?.service_id !== 'string') throw new RecordsError('STORAGE_INCOMPATIBLE', 'service identity is not a singleton')
  }

  #rollback(db: DatabaseSync): boolean {
    try { db.exec('ROLLBACK'); return true } catch (error: unknown) {
      this.#state = 'unavailable'
      this.#failure = new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      return false
    }
  }

  #ensureReady(): DatabaseSync {
    if (this.#state === 'closed') throw new RecordsError('STORAGE_CLOSED', 'storage is closed')
    if (this.#state !== 'ready' || this.#db === undefined) throw this.#failure ?? new RecordsError('STORAGE_UNAVAILABLE', 'storage is unavailable')
    return this.#db
  }

  #mapError(error: unknown): RecordsError {
    if (error instanceof RecordsError) return error
    const primary = primarySqliteCode(error)
    if (primary === 5) return new RecordsError('STORAGE_BUSY', 'storage is busy', true, { cause: error })
    if (primary === 8 || primary === 14) return new RecordsError('STORAGE_UNAVAILABLE', 'storage is not writable', false, { cause: error })
    return new RecordsError('STORAGE_UNAVAILABLE', 'storage operation failed', false, { cause: error })
  }

  #selectByKey(db: DatabaseSync, key: string): StoredRow | undefined {
    return db.prepare('SELECT id, idempotency_key, request_digest, content, created_at FROM storage_probe_records WHERE idempotency_key = ?').get(key) as StoredRow | undefined
  }

  createOrReplay(input: { readonly id: string; readonly idempotencyKey: string; readonly digest: string; readonly content: string; readonly createdAt: string }): CreateOutcome {
    const db = this.#ensureReady(); let inTransaction = false
    try {
      db.exec('BEGIN IMMEDIATE'); inTransaction = true
      const existing = this.#selectByKey(db, input.idempotencyKey)
      if (existing !== undefined) {
        if (existing.request_digest === input.digest && existing.content === input.content) { db.exec('COMMIT'); inTransaction = false; return { kind: 'replayed', record: toRecord(existing) } }
        db.exec('ROLLBACK'); inTransaction = false; return { kind: 'conflict' }
      }
      db.prepare('INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)').run(input.id, input.idempotencyKey, input.digest, input.content, input.createdAt)
      db.exec('COMMIT'); inTransaction = false
      return { kind: 'created', record: { id: input.id, content: input.content, created_at: input.createdAt } }
    } catch (error: unknown) {
      if (inTransaction && !this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      if (primarySqliteCode(error) === 19) {
        const raced = this.#selectByKey(db, input.idempotencyKey)
        if (raced !== undefined) return raced.request_digest === input.digest && raced.content === input.content ? { kind: 'replayed', record: toRecord(raced) } : { kind: 'conflict' }
      }
      throw this.#mapError(error)
    }
  }

  getById(id: string): ProbeRecord | undefined {
    const db = this.#ensureReady()
    try {
      const row = db.prepare('SELECT id, idempotency_key, request_digest, content, created_at FROM storage_probe_records WHERE id = ?').get(id) as StoredRow | undefined
      return row === undefined ? undefined : toRecord(row)
    } catch (error: unknown) { throw this.#mapError(error) }
  }

  getSetupState(): SetupState {
    const db = this.#ensureReady()
    const row = db.prepare('SELECT service_id, bootstrap_admin_user_id, initialized_at FROM service_identity WHERE id = 1').get() as Record<string, unknown>
    return { serviceId: String(row.service_id), initialized: row.initialized_at !== null && row.initialized_at !== undefined, initializedAt: row.initialized_at === null || row.initialized_at === undefined ? undefined : String(row.initialized_at), bootstrapAdminUserId: row.bootstrap_admin_user_id === null || row.bootstrap_admin_user_id === undefined ? undefined : String(row.bootstrap_admin_user_id) }
  }

  #profileByUser(db: DatabaseSync, userId: string): ProfileRecord | undefined {
    const row = db.prepare(`SELECT u.*, s.id AS personal_space_id FROM users u JOIN spaces s ON s.owner_user_id = u.id AND s.kind = 'personal' WHERE u.id = ?`).get(userId) as Record<string, unknown> | undefined
    return row === undefined ? undefined : rowProfile(row)
  }

  bootstrap(input: UserCreateInput & { readonly credential: CredentialMaterial }): { kind: 'created'; user: UserRecord } | { kind: 'already_initialized' } {
    const db = this.#ensureReady(); let tx = false
    try {
      db.exec('BEGIN IMMEDIATE'); tx = true
      const state = db.prepare('SELECT service_id, initialized_at FROM service_identity WHERE id = 1').get() as Record<string, unknown>
      if (state.initialized_at !== null && state.initialized_at !== undefined) { db.exec('ROLLBACK'); tx = false; return { kind: 'already_initialized' } }
      const serviceId = String(state.service_id)
      const now = input.now; const userId = randomUUID(); const spaceId = randomUUID(); const credentialId = randomUUID()
      db.prepare('INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(credentialId, input.credential.algorithm, input.credential.version, input.credential.n, input.credential.r, input.credential.p, input.credential.maxmem, input.credential.salt, input.credential.derivedKey, now)
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(userId, input.loginName, input.displayName, credentialId, input.timezone, serviceId, JSON.stringify(input.domains), JSON.stringify(input.learningTracks), input.goalText, now, now)
      db.prepare(`INSERT INTO spaces (id, service_id, kind, owner_user_id, status, revision, created_at, updated_at) VALUES (?, ?, 'personal', ?, 'active', 1, ?, ?)`).run(spaceId, serviceId, userId, now, now)
      db.prepare('UPDATE service_identity SET bootstrap_admin_user_id = ?, initialized_at = ? WHERE id = 1 AND initialized_at IS NULL').run(userId, now)
      db.exec('COMMIT'); tx = false
      const user = this.#profileByUser(db, userId)
      if (user === undefined) throw new RecordsError('STORAGE_UNAVAILABLE', 'created administrator could not be read')
      return { kind: 'created', user }
    } catch (error: unknown) {
      if (tx && !this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      if (primarySqliteCode(error) === 19) return { kind: 'already_initialized' }
      throw this.#mapError(error)
    }
  }

  register(input: UserCreateInput & { readonly credential: CredentialMaterial }): { kind: 'created'; user: UserRecord } | { kind: 'setup_required' } | { kind: 'login_name_taken' } {
    const db = this.#ensureReady(); let tx = false
    try {
      db.exec('BEGIN IMMEDIATE'); tx = true
      const state = db.prepare('SELECT service_id, initialized_at FROM service_identity WHERE id = 1').get() as Record<string, unknown>
      if (state.initialized_at === null || state.initialized_at === undefined) { db.exec('ROLLBACK'); tx = false; return { kind: 'setup_required' } }
      const serviceId = String(state.service_id)
      const now = input.now; const userId = randomUUID(); const spaceId = randomUUID(); const credentialId = randomUUID()
      db.prepare('INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(credentialId, input.credential.algorithm, input.credential.version, input.credential.n, input.credential.r, input.credential.p, input.credential.maxmem, input.credential.salt, input.credential.derivedKey, now)
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(userId, input.loginName, input.displayName, credentialId, input.timezone, serviceId, JSON.stringify(input.domains), JSON.stringify(input.learningTracks), input.goalText, now, now)
      db.prepare(`INSERT INTO spaces (id, service_id, kind, owner_user_id, status, revision, created_at, updated_at) VALUES (?, ?, 'personal', ?, 'active', 1, ?, ?)`).run(spaceId, serviceId, userId, now, now)
      db.exec('COMMIT'); tx = false
      const user = this.#profileByUser(db, userId)
      if (user === undefined) throw new RecordsError('STORAGE_UNAVAILABLE', 'created user could not be read')
      return { kind: 'created', user }
    } catch (error: unknown) {
      if (tx && !this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      if (primarySqliteCode(error) === 19) {
        const exists = db.prepare('SELECT 1 AS value FROM users WHERE login_name = ?').get(input.loginName)
        if (exists !== undefined) return { kind: 'login_name_taken' }
      }
      throw this.#mapError(error)
    }
  }

  findLogin(loginName: string): LoginLookup | undefined {
    const db = this.#ensureReady()
    const row = db.prepare(`SELECT u.id, u.login_name, u.status, u.role, u.timezone, u.display_name, u.credential_ref, c.algorithm, c.version, c.n, c.r, c.p, c.maxmem, c.salt, c.derived_key FROM users u JOIN password_credentials c ON c.id = u.credential_ref WHERE u.login_name = ?`).get(loginName) as Record<string, unknown> | undefined
    if (row === undefined) return undefined
    return { userId: String(row.id), loginName: String(row.login_name), displayName: String(row.display_name), role: String(row.role) as LoginLookup['role'], status: String(row.status) as LoginLookup['status'], timezone: String(row.timezone), credential: { algorithm: String(row.algorithm), version: Number(row.version), n: Number(row.n), r: Number(row.r), p: Number(row.p), maxmem: Number(row.maxmem), salt: Buffer.from(row.salt as Uint8Array), derivedKey: Buffer.from(row.derived_key as Uint8Array) } }
  }

  createSession(input: { readonly sessionId: string; readonly userId: string; readonly tokenHash: string; readonly createdAt: string; readonly expiresAt: string; readonly revokeTokenHash?: string }): void {
    const db = this.#ensureReady(); let tx = false
    try {
      db.exec('BEGIN IMMEDIATE'); tx = true
      if (input.revokeTokenHash !== undefined) db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?').run(input.createdAt, input.revokeTokenHash, input.createdAt)
      db.prepare('INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)').run(input.sessionId, input.userId, input.tokenHash, input.createdAt, input.expiresAt)
      db.exec('COMMIT'); tx = false
    } catch (error: unknown) {
      if (tx && !this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      throw this.#mapError(error)
    }
  }

  findActor(tokenHash: string, now: string): SessionActor | undefined {
    const db = this.#ensureReady()
    const row = db.prepare(`SELECT s.id AS session_id, u.id AS user_id, u.role, u.status, u.planning_home_service_id AS service_id, p.id AS personal_space_id FROM auth_sessions s JOIN users u ON u.id = s.user_id JOIN spaces p ON p.owner_user_id = u.id AND p.kind = 'personal' WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active' AND p.status = 'active'`).get(tokenHash, now) as Record<string, unknown> | undefined
    if (row === undefined) return undefined
    return { sessionId: String(row.session_id), userId: String(row.user_id), role: String(row.role) as SessionActor['role'], serviceId: String(row.service_id), personalSpaceId: String(row.personal_space_id) }
  }

  revokeSession(tokenHash: string, now: string): boolean {
    const db = this.#ensureReady()
    const result = db.prepare('UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?').run(now, tokenHash)
    return Number(result.changes) > 0
  }

  getProfile(userId: string): ProfileRecord | undefined { return this.#profileByUser(this.#ensureReady(), userId) }

  getSpaces(userId: string): SpaceRecord[] {
    const db = this.#ensureReady()
    return (db.prepare(`SELECT id, service_id, kind, owner_user_id, status, revision, created_at, updated_at FROM spaces WHERE owner_user_id = ? AND kind = 'personal' AND status = 'active'`).all(userId) as Record<string, unknown>[]).map(row => ({ id: String(row.id), serviceId: String(row.service_id), kind: 'personal' as const, ownerUserId: String(row.owner_user_id), status: String(row.status), revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }))
  }

  updatePreferences(userId: string, expectedRevision: number, patch: PreferencePatch, now: string): { kind: 'updated'; user: ProfileRecord } | { kind: 'conflict'; user?: ProfileRecord } {
    const db = this.#ensureReady(); let tx = false
    try {
      db.exec('BEGIN IMMEDIATE'); tx = true
      const current = this.#profileByUser(db, userId)
      if (current === undefined) { db.exec('ROLLBACK'); tx = false; return { kind: 'conflict' } }
      const next = { ...current, ...patch, revision: current.revision + 1, updatedAt: now }
      const result = db.prepare('UPDATE users SET display_name = ?, timezone = ?, domains = ?, learning_tracks = ?, goal_text = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').run(next.displayName, next.timezone, JSON.stringify(next.domains), JSON.stringify(next.learningTracks), next.goalText, next.revision, now, userId, expectedRevision)
      if (Number(result.changes) !== 1) { db.exec('ROLLBACK'); tx = false; return { kind: 'conflict', user: this.#profileByUser(db, userId) } }
      db.exec('COMMIT'); tx = false
      const updated = this.#profileByUser(db, userId)
      if (updated === undefined) throw new RecordsError('STORAGE_UNAVAILABLE', 'updated user could not be read')
      return { kind: 'updated', user: updated }
    } catch (error: unknown) {
      if (tx && !this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      throw this.#mapError(error)
    }
  }

  /** Test-only transaction probe for FND-003 rollback evidence. */
  testOnlyTransactionFailure(input: { readonly firstId: string; readonly failingId: string; readonly firstKey: string; readonly failingKey: string; readonly content: string }): { rolledBack: boolean; primaryCode: number | undefined; rows: number } {
    const db = this.#ensureReady(); db.exec('BEGIN IMMEDIATE'); let primaryCode: number | undefined; let failed = false
    try {
      db.prepare('INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)').run(input.firstId, input.firstKey, createHash('sha256').update(input.content).digest('hex'), input.content, new Date().toISOString())
      db.prepare('INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)').run(input.firstId, input.failingKey, createHash('sha256').update(input.content).digest('hex'), input.content, new Date().toISOString())
    } catch (error: unknown) {
      failed = true; primaryCode = primarySqliteCode(error); if (!this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
    }
    if (!failed) { this.#rollback(db); throw new RecordsError('INTERNAL_ERROR', 'transaction probe did not fail') }
    const rows = Number((db.prepare('SELECT count(*) AS count FROM storage_probe_records WHERE id IN (?, ?)').get(input.firstId, input.failingId) as { count: number }).count)
    return { rolledBack: primaryCode === 19, primaryCode, rows }
  }

  /** Test-only identity transaction probe; never reachable from HTTP/config. */
  testOnlyIdentityTransactionFailure(input: { readonly userId: string; readonly duplicateUserId: string; readonly credentialId: string; readonly duplicateCredentialId: string; readonly loginName: string; readonly now: string }): { rolledBack: boolean; primaryCode: number | undefined; users: number; credentials: number; spaces: number; initialized: boolean } {
    const db = this.#ensureReady(); let primaryCode: number | undefined; let failed = false
    db.exec('BEGIN IMMEDIATE')
    try {
      const state = db.prepare('SELECT service_id FROM service_identity WHERE id = 1').get() as { service_id: string }
      db.prepare('INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(input.credentialId, 'scrypt', 1, 131072, 8, 1, 192 * 1024 * 1024, Buffer.alloc(16, 1), Buffer.alloc(32, 2), input.now)
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, '[]', '[]', '', 1, ?, ?)`)
        .run(input.userId, input.loginName, 'fixture', input.credentialId, 'Asia/Shanghai', state.service_id, input.now, input.now)
      db.prepare('INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(input.duplicateCredentialId, 'scrypt', 1, 131072, 8, 1, 192 * 1024 * 1024, Buffer.alloc(16, 3), Buffer.alloc(32, 4), input.now)
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, '[]', '[]', '', 1, ?, ?)`)
        .run(input.duplicateUserId, input.loginName, 'duplicate', input.duplicateCredentialId, 'Asia/Shanghai', state.service_id, input.now, input.now)
    } catch (error: unknown) {
      failed = true; primaryCode = primarySqliteCode(error)
      if (!this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
    }
    if (!failed) { this.#rollback(db); throw new RecordsError('INTERNAL_ERROR', 'identity transaction probe did not fail') }
    const users = Number((db.prepare('SELECT count(*) AS count FROM users WHERE id IN (?, ?)').get(input.userId, input.duplicateUserId) as { count: number }).count)
    const credentials = Number((db.prepare('SELECT count(*) AS count FROM password_credentials WHERE id IN (?, ?)').get(input.credentialId, input.duplicateCredentialId) as { count: number }).count)
    const spaces = Number((db.prepare('SELECT count(*) AS count FROM spaces WHERE owner_user_id IN (?, ?)').get(input.userId, input.duplicateUserId) as { count: number }).count)
    const identity = db.prepare('SELECT initialized_at FROM service_identity WHERE id = 1').get() as { initialized_at: string | null }
    return { rolledBack: primaryCode === 19, primaryCode, users, credentials, spaces, initialized: identity.initialized_at !== null }
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true; this.#state = 'closed'
    const db = this.#db; this.#db = undefined
    if (db !== undefined) { try { db.close(); this.#log('knowledgeos-storage: closed') } catch (error: unknown) { this.#log(`knowledgeos-storage: close failed code=${this.#mapError(error).code}`) } }
  }
}
