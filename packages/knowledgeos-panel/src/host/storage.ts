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
import { JOB_SCHEMA, JobStore, JobError } from './jobs.ts'
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
import { authorize, isGrantActive, type AuthorizationAction, type AuthorizationGrant, type AuthorizationTarget, type ProjectMembership, type ResourceScope } from './authorization.ts'
import type { CreateOutcome, ProbeRecord, ProbeStorePort } from './records.ts'
import { RecordsError } from './records.ts'
import {ASSET_SCHEMA, AssetStore, AssetError} from './asset-store.ts'
import {ZipStore} from './zip-store.ts'
import {PARSE_SCHEMA, ParseStore, type ParseTx} from './parse-store.ts'
import {TEXT_SCHEMA} from './text-schema.ts'
import {OFFICE_SCHEMA,OFFICE_AUTH_SCHEMA,OFFICE_HISTORY_SCHEMA} from './office-schema.ts'
import {OfficeStore} from './office-store.ts'
import {ZIP_SCHEMA} from './zip-schema.ts'
import {CITATION_SCHEMA,CitationStore} from './citation-store.ts'
import {READING_STATE_SCHEMA} from './reading-state.ts'
import {CITATION_LOCATOR_SCHEMA} from './citation-locator-schema.ts'

/** Fixed application identity written to PRAGMA application_id (KOS1). */
export const APPLICATION_ID = 0x4b4f5331
/** Current application schema version. */
export const SCHEMA_VERSION = 16
export const MIGRATION_V16_CHECKSUM = createHash('sha256').update(READING_STATE_SCHEMA).digest('hex')
export const MIGRATION_V15_CHECKSUM = createHash('sha256').update(CITATION_LOCATOR_SCHEMA).digest('hex')
export const MIGRATION_V13_CHECKSUM = createHash('sha256').update(ZIP_SCHEMA).digest('hex')
export const MIGRATION_V14_CHECKSUM = createHash('sha256').update(CITATION_SCHEMA).digest('hex')
export const MIGRATION_V12_CHECKSUM = createHash('sha256').update(OFFICE_HISTORY_SCHEMA).digest('hex')
export const MIGRATION_V11_CHECKSUM = createHash('sha256').update(OFFICE_AUTH_SCHEMA).digest('hex')
export const MIGRATION_V10_CHECKSUM = createHash('sha256').update(OFFICE_SCHEMA).digest('hex')
export const MIGRATION_V9_CHECKSUM = createHash('sha256').update(TEXT_SCHEMA).digest('hex')
export const MIGRATION_V8_CHECKSUM = createHash('sha256').update(PARSE_SCHEMA).digest('hex')
export const MIGRATION_V7_SQL = ASSET_SCHEMA
export const MIGRATION_V7_CHECKSUM = createHash('sha256').update(ASSET_SCHEMA).digest('hex')
export const MIGRATION_V6_SQL = JOB_SCHEMA
export const MIGRATION_V6_CHECKSUM = createHash('sha256').update(JOB_SCHEMA).digest('hex')
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

export const MIGRATION_V3_SQL = `CREATE TABLE knowledge_projects (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE project_memberships (
  project_id TEXT NOT NULL REFERENCES knowledge_projects(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('member', 'owner')),
  valid_from TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  PRIMARY KEY (project_id, user_id)
) STRICT;
CREATE TABLE knowledge_objects (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  space_id TEXT NOT NULL REFERENCES spaces(id),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('personal', 'project')),
  project_id TEXT REFERENCES knowledge_projects(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  object_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'deleted')),
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((scope_kind = 'personal' AND project_id IS NULL) OR (scope_kind = 'project' AND project_id IS NOT NULL))
) STRICT;
CREATE TABLE resource_grants (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  resource_type TEXT NOT NULL CHECK (resource_type = 'knowledge_object'),
  resource_id TEXT NOT NULL REFERENCES knowledge_objects(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'project')),
  subject_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('read', 'comment', 'edit', 'export', 'manage_share', 'delete', 'review', 'view_learning_records')),
  valid_from TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (resource_id, subject_type, subject_id, action)
) STRICT;
`
export const MIGRATION_V3_CHECKSUM = createHash('sha256').update(Buffer.from(MIGRATION_V3_SQL, 'utf8')).digest('hex')

/** v4 preserves every v3 grant row while allowing a new grant after revocation. */
export const MIGRATION_V4_SQL = `ALTER TABLE resource_grants RENAME TO resource_grants_v3;
CREATE TABLE resource_grants (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  resource_type TEXT NOT NULL CHECK (resource_type = 'knowledge_object'),
  resource_id TEXT NOT NULL REFERENCES knowledge_objects(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'project')),
  subject_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('read', 'comment', 'edit', 'export', 'manage_share', 'delete', 'review', 'view_learning_records')),
  valid_from TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, expires_at, revoked_at, created_at)
  SELECT id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, expires_at, revoked_at, created_at FROM resource_grants_v3;
CREATE UNIQUE INDEX resource_grants_active_subject_action_uq
  ON resource_grants (resource_id, subject_type, subject_id, action)
  WHERE revoked_at IS NULL;
DROP TABLE resource_grants_v3;
`
export const MIGRATION_V4_CHECKSUM = createHash('sha256').update(Buffer.from(MIGRATION_V4_SQL, 'utf8')).digest('hex')

/** Only the mutation receipt needed by the two FND-005 tools. */
export const MIGRATION_V5_SQL = `CREATE TABLE ai_tool_mutations (
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  object_id TEXT NOT NULL REFERENCES knowledge_objects(id),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (service_id, user_id, idempotency_key)
) STRICT;
`
export const MIGRATION_V5_CHECKSUM = createHash('sha256').update(MIGRATION_V5_SQL).digest('hex')

export const PROBE_SUPPORTED_TABLES = ['schema_migrations', 'storage_probe_records'] as const
export const IDENTITY_SUPPORTED_TABLES = [
  'auth_sessions', 'knowledge_objects', 'knowledge_projects', 'password_credentials', 'project_memberships', 'resource_grants', 'schema_migrations', 'service_identity', 'spaces', 'storage_probe_records', 'users',
] as const

export interface MigrationPlan {
  readonly version: number
  readonly sql: string
  readonly checksum: string
}

export const MIGRATION_V1: MigrationPlan = { version: 1, sql: MIGRATION_V1_SQL, checksum: MIGRATION_V1_CHECKSUM }
export const MIGRATION_V2: MigrationPlan = { version: 2, sql: MIGRATION_V2_SQL, checksum: MIGRATION_V2_CHECKSUM }
export const MIGRATION_V3: MigrationPlan = { version: 3, sql: MIGRATION_V3_SQL, checksum: MIGRATION_V3_CHECKSUM }
export const MIGRATION_V4: MigrationPlan = { version: 4, sql: MIGRATION_V4_SQL, checksum: MIGRATION_V4_CHECKSUM }
export const MIGRATION_V5: MigrationPlan = { version: 5, sql: MIGRATION_V5_SQL, checksum: MIGRATION_V5_CHECKSUM }

export interface ProbeStorageOptions {
  readonly dataDir: string
  readonly log?: (message: string) => void
  /** Test-only v1 migration override; never wired from HTTP/config. */
  readonly migrationOverride?: MigrationPlan
  /** Test-only fault point; never exposed through HTTP or trusted config. */
  readonly failureAt?:
    | 'v2:after-schema' | 'v2:after-identity' | 'v2:after-ledger'
    | 'bootstrap:after-credential' | 'bootstrap:after-user' | 'bootstrap:after-space' | 'bootstrap:after-identity'
    | 'register:after-credential' | 'register:after-user' | 'register:after-space'
    | 'v3:after-projects' | 'v3:after-memberships' | 'v3:after-objects' | 'v3:after-grants'
    | 'v4:after-rebuild' | 'v5:after-schema' | 'ai:after-update'
    | 'v6:after-schema' | 'job:after-result' | 'job:after-outbox' | 'event:after-receipt'
    | 'v7:after-schema'
    | 'v8:after-schema'
    | 'v9:after-schema'
    | 'v10:after-schema'
    | 'v11:after-schema'
    | 'v12:after-schema'
    | 'v13:after-schema'
    | 'v14:after-schema'
    | 'v15:after-schema'
    | 'v16:after-schema'
}

export interface DatabaseFacts {
  readonly applicationId: number
  readonly userVersion: number
  readonly tables: readonly string[]
  readonly objects: readonly { type: string; name: string }[]
  readonly ledger: readonly { version: number; checksum: string; applied_at: string }[]
}

export interface KnowledgeObjectRecord {
  readonly id: string
  readonly serviceId: string
  readonly spaceId: string
  readonly scope: ResourceScope
  readonly projectId?: string
  readonly ownerUserId: string
  readonly objectType: string
  readonly title: string
  readonly body: string
  readonly status: 'active' | 'deleted'
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ProjectRecord { readonly id: string; readonly serviceId: string; readonly ownerUserId: string; readonly name: string; readonly status: string; readonly createdAt: string; readonly updatedAt: string }

export interface GrantRecord extends AuthorizationGrant { readonly id: string; readonly serviceId: string; readonly resourceId: string; readonly resourceType: 'knowledge_object'; readonly createdAt: string }

export type UpdateObjectResult =
  | { readonly kind: 'updated'; readonly object: KnowledgeObjectRecord }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict'; readonly currentRevision: number }

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
  readonly #failureAt: ProbeStorageOptions['failureAt']
  #db: DatabaseSync | undefined
  #state: StorageState = 'unavailable'
  #failure: RecordsError | undefined
  #closed = false

  readonly #assetTx:ParseTx = (mode,op) => {
    let db:DatabaseSync
    try { db=this.#ensureReady();db.exec(mode==='write'?'BEGIN IMMEDIATE':'BEGIN') }
    catch(e){throw new AssetError(503,this.#mapError(e).code)} // No transaction began.
    try { const value=op(db,new Date().toISOString()); db.exec('COMMIT'); return value }
    catch(e){if(!this.#rollback(db))throw this.#failure;throw e instanceof AssetError?e:new AssetError(503,this.#mapError(e).code)}
  }
  #currentActor(session:{sessionId:string;userId:string},now:string) {
    const ref=this.#ensureReady().prepare('SELECT token_hash FROM auth_sessions WHERE id=? AND user_id=?').get(session.sessionId,session.userId)
    return ref?this.findActor(String(ref.token_hash),now):undefined
  }
  readonly assets = new AssetStore(this.#assetTx,(s,now)=>this.#currentActor(s,now), (actor,id,action,now)=>Boolean(this.authorizeObject(actor,id,action,now)))
  readonly archives = new ZipStore(this.#assetTx,(s,now)=>this.#currentActor(s,now),(a,id,now)=>Boolean(this.authorizeObject(a,id,'read',now)))
  readonly citations = new CitationStore(this.#assetTx,(s,now)=>this.#currentActor(s,now),(a,id,now)=>Boolean(this.authorizeObject(a,id,'read',now)))
  readonly office = new OfficeStore(this.#assetTx,(sessionId,userId,id,action,now)=>{
    const actor=this.#currentActor({sessionId,userId},now)
    return !!actor && !!this.authorizeObject(actor,id,action,now)
  })
  readonly parses = new ParseStore(this.#assetTx,(sessionId,userId,id,write,now)=>{
    const a=this.#currentActor({sessionId,userId},now)
    return Boolean(a && this.authorizeObject(a,id,'read',now) && (!write || this.authorizeObject(a,id,'edit',now)))
  })

  readonly jobs = new JobStore((op) => {
    const db = this.#ensureReady()
    try { db.exec('BEGIN IMMEDIATE') } catch (err) { throw this.#mapError(err) }
    try {
      const value = op(db, Date.now())
      db.exec('COMMIT')
      return value
    } catch (err) {
      if (!this.#rollback(db)) throw this.#failure
      throw err instanceof JobError ? err : this.#mapError(err)
    }
  }, (session, user, object, ms) => {
    const now = new Date(ms).toISOString()
    const ref = this.#ensureReady().prepare('SELECT token_hash FROM auth_sessions WHERE id=? AND user_id=?').get(session,user)
    const actor = ref && this.findActor(String(ref.token_hash),now)
    return actor && this.authorizeObject(actor,object,'read',now)?.revision
  }, point => this.#injectFailure(point))

  constructor(options: ProbeStorageOptions) {
    this.#dataDir = options.dataDir
    this.#log = options.log ?? (() => {})
    this.#migrationOverride = options.migrationOverride
    this.#failureAt = options.failureAt
    this.#open()
  }

  #injectFailure(point: NonNullable<ProbeStorageOptions['failureAt']>): void {
    if (this.#failureAt === point) throw new Error(`controlled storage failure at ${point}`)
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
        this.#migrateV3(db)
        this.#migrateV4(db)
      } else if (existing === 'v1') {
        this.#migrateV2(db)
        this.#migrateV3(db)
        this.#migrateV4(db)
      } else if (existing === 'v2') {
        this.#migrateV3(db)
        this.#migrateV4(db)
      } else if (existing === 'v3') {
        this.#migrateV4(db)
      }
      const priorVersion=existing==='blank'?0:Number(existing.slice(1))
      if (priorVersion<6) {
        if (existing !== 'v5') this.#migrateV5(db)
        this.#migrateV6(db)
      }
      if (priorVersion<7) this.#migrateV7(db)
      if (priorVersion<8) this.#migrateV8(db)
      if (priorVersion<9) this.#migrateV9(db)
      if (priorVersion<10) this.#migrateV10(db)
      if (priorVersion<11) this.#migrateV11(db)
      if (priorVersion<12) this.#migrateV12(db)
      if (priorVersion<13) this.#migrateV13(db)
      if (priorVersion<14) this.#migrateV14(db)
      if (priorVersion<15) this.#migrateV15(db)
      if (priorVersion<16) this.#migrateV16(db)
      this.#verify(db,SCHEMA_VERSION)
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

  #precheck(path: string): 'blank' | 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7' | 'v8' | 'v9' | 'v10' | 'v11' | 'v12' | 'v13' | 'v14' | 'v15' | 'v16' {
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
    if (facts.userVersion === 3) {
      this.#assertV3Schema(facts)
      const db = new DatabaseSync(path, { readOnly: true })
      try { this.#assertV3Definitions(db) } finally { db.close() }
      return 'v3'
    }
    if (facts.userVersion === 4) {
      this.#assertV4Schema(facts)
      const db = new DatabaseSync(path, { readOnly: true })
      try { this.#assertV4Definitions(db) } finally { db.close() }
      return 'v4'
    }
    if (facts.userVersion === 5) {
      this.#assertV5Schema(facts)
      const db = new DatabaseSync(path, { readOnly: true })
      try { this.#assertV2Definitions(db); this.#assertV4Definitions(db); this.#assertV5Definitions(db) } finally { db.close() }
      return 'v5'
    }
    if (facts.userVersion === 6 || facts.userVersion === 7 || facts.userVersion === 8 || facts.userVersion === 9 || facts.userVersion === 10 || facts.userVersion === 11 || facts.userVersion === 12 || facts.userVersion === 13 || facts.userVersion === 14 || facts.userVersion === 15 || facts.userVersion === 16) {
      const db = new DatabaseSync(path, { readOnly: true })
      try { this.#verify(db,facts.userVersion) } finally { db.close() }
      return `v${facts.userVersion}`
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
    const expected = ['auth_sessions', 'password_credentials', 'schema_migrations', 'service_identity', 'spaces', 'storage_probe_records', 'users'].sort()
    const actual = facts.objects.filter(object => object.type === 'table').map(object => object.name).sort()
    if (facts.objects.some(object => object.type !== 'table') || actual.join(',') !== expected.join(',')) throw new RecordsError('STORAGE_INCOMPATIBLE', 'database contains an unknown v2 schema')
    const v1 = facts.ledger.find(entry => entry.version === 1)
    const v2 = facts.ledger.find(entry => entry.version === 2)
    if (facts.ledger.length !== 2 || v1?.checksum !== MIGRATION_V1_CHECKSUM || v2?.checksum !== MIGRATION_V2_CHECKSUM) throw new RecordsError('STORAGE_INCOMPATIBLE', 'v2 migration ledger does not match this build')
  }

  #assertV3Schema(facts: DatabaseFacts): void {
    const expected = [...IDENTITY_SUPPORTED_TABLES].sort()
    const actual = facts.objects.filter(object => object.type === 'table').map(object => object.name).sort()
    if (facts.objects.some(object => object.type !== 'table') || actual.join(',') !== expected.join(',')) throw new RecordsError('STORAGE_INCOMPATIBLE', 'database contains an unknown v3 schema')
    const v1 = facts.ledger.find(entry => entry.version === 1)
    const v2 = facts.ledger.find(entry => entry.version === 2)
    const v3 = facts.ledger.find(entry => entry.version === 3)
    if (facts.ledger.length !== 3 || v1?.checksum !== MIGRATION_V1_CHECKSUM || v2?.checksum !== MIGRATION_V2_CHECKSUM || v3?.checksum !== MIGRATION_V3_CHECKSUM) throw new RecordsError('STORAGE_INCOMPATIBLE', 'v3 migration ledger does not match this build')
  }

  #assertV4Schema(facts: DatabaseFacts): void {
    const expected = [...IDENTITY_SUPPORTED_TABLES].sort()
    const actual = facts.objects.filter(object => object.type === 'table').map(object => object.name).sort()
    const unexpected = facts.objects.filter(object => object.type !== 'table' && !(object.type === 'index' && object.name === 'resource_grants_active_subject_action_uq'))
    if (unexpected.length !== 0 || actual.join(',') !== expected.join(',')) throw new RecordsError('STORAGE_INCOMPATIBLE', 'database contains an unknown v4 schema')
    const v1 = facts.ledger.find(entry => entry.version === 1)
    const v2 = facts.ledger.find(entry => entry.version === 2)
    const v3 = facts.ledger.find(entry => entry.version === 3)
    const v4 = facts.ledger.find(entry => entry.version === 4)
    if (facts.ledger.length !== 4 || v1?.checksum !== MIGRATION_V1_CHECKSUM || v2?.checksum !== MIGRATION_V2_CHECKSUM || v3?.checksum !== MIGRATION_V3_CHECKSUM || v4?.checksum !== MIGRATION_V4_CHECKSUM) throw new RecordsError('STORAGE_INCOMPATIBLE', 'v4 migration ledger does not match this build')
  }

  #assertV5Schema(facts: DatabaseFacts): void {
    const table = facts.objects.find(item => item.name === 'ai_tool_mutations')
    if (table?.type !== 'table' || facts.ledger.length !== 5 || facts.ledger[4]?.checksum !== MIGRATION_V5_CHECKSUM || facts.ledger[4]?.version !== 5) throw new RecordsError('STORAGE_INCOMPATIBLE', 'v5 migration ledger/schema does not match this build')
    this.#assertV4Schema({ ...facts, objects: facts.objects.filter(item => item.name !== 'ai_tool_mutations'), ledger: facts.ledger.slice(0, 4) })
  }

  #assertV5Definitions(db: DatabaseSync): void {
    const expected = new DatabaseSync(':memory:')
    try {
      expected.exec(MIGRATION_V5_SQL)
      const sql = (source: DatabaseSync): string => String((source.prepare("SELECT sql FROM sqlite_master WHERE name = 'ai_tool_mutations' AND type = 'table'").get() as { sql?: string } | undefined)?.sql ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
      if (sql(db) !== sql(expected)) throw new RecordsError('STORAGE_INCOMPATIBLE', 'v5 receipt constraints are not accepted')
    } finally { expected.close() }
  }

  #assertV2Definitions(db: DatabaseSync): void {
    const expected = new DatabaseSync(':memory:')
    try {
      expected.exec(MIGRATION_V2_SQL)
      const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
      const signature = (source: DatabaseSync, table: string): unknown => {
        const columns = (source.prepare(`PRAGMA table_info(${table})`).all() as Array<{ cid: number; name: string; type: string; notnull: number; pk: number }>).map(row => ({ cid: Number(row.cid), name: String(row.name), type: String(row.type), notnull: Number(row.notnull), pk: Number(row.pk) }))
        const indexes = (source.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string; unique: number; origin: string }>).map(index => ({
          unique: Number(index.unique), origin: String(index.origin), columns: (source.prepare(`PRAGMA index_info(${JSON.stringify(String(index.name))})`).all() as Array<{ seqno: number; name: string | null }>).map(row => ({ seqno: Number(row.seqno), name: row.name === null ? null : String(row.name) })),
        })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        const foreignKeys = (source.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<Record<string, unknown>>).map(row => ({ id: Number(row.id), seq: Number(row.seq), table: String(row.table), from: String(row.from), to: String(row.to), on_update: String(row.on_update), on_delete: String(row.on_delete), match: String(row.match) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        const sql = (source.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table) as { sql?: string | null } | undefined)?.sql ?? ''
        return { columns, indexes, foreignKeys, sql: normalize(sql) }
      }
      for (const table of ['password_credentials', 'users', 'service_identity', 'auth_sessions', 'spaces']) {
        const actual = signature(db, table)
        const expectedSignature = signature(expected, table)
        if (JSON.stringify(actual) !== JSON.stringify(expectedSignature)) throw new RecordsError('STORAGE_INCOMPATIBLE', `v2 table constraints are not accepted: ${table}`)
      }
    } finally { expected.close() }
  }

  #assertV3Definitions(db: DatabaseSync): void {
    const expected = new DatabaseSync(':memory:')
    try {
      expected.exec(MIGRATION_V2_SQL)
      expected.exec(MIGRATION_V3_SQL)
      const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
      for (const table of ['knowledge_projects', 'project_memberships', 'knowledge_objects', 'resource_grants']) {
        const actualSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table) as { sql?: string | null } | undefined)?.sql ?? ''
        const expectedSql = (expected.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table) as { sql?: string | null } | undefined)?.sql ?? ''
        if (normalize(actualSql) !== normalize(expectedSql)) throw new RecordsError('STORAGE_INCOMPATIBLE', `v3 table constraints are not accepted: ${table}`)
      }
    } finally { expected.close() }
  }

  #assertV4Definitions(db: DatabaseSync): void {
    const expected = new DatabaseSync(':memory:')
    try {
      expected.exec(MIGRATION_V2_SQL)
      expected.exec(MIGRATION_V3_SQL)
      expected.exec(MIGRATION_V4_SQL)
      const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
      for (const table of ['knowledge_projects', 'project_memberships', 'knowledge_objects', 'resource_grants']) {
        const actualSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table) as { sql?: string | null } | undefined)?.sql ?? ''
        const expectedSql = (expected.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table) as { sql?: string | null } | undefined)?.sql ?? ''
        if (normalize(actualSql) !== normalize(expectedSql)) throw new RecordsError('STORAGE_INCOMPATIBLE', `v4 table constraints are not accepted: ${table}`)
      }
      const actualIndex = (db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name = 'resource_grants_active_subject_action_uq'").get() as { name?: string; sql?: string } | undefined)
      const expectedIndex = (expected.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name = 'resource_grants_active_subject_action_uq'").get() as { name?: string; sql?: string } | undefined)
      if (actualIndex?.name !== expectedIndex?.name || normalize(actualIndex?.sql) !== normalize(expectedIndex?.sql)) throw new RecordsError('STORAGE_INCOMPATIBLE', 'v4 active grant uniqueness index is not accepted')
    } finally { expected.close() }
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
      this.#injectFailure('v2:after-schema')
      db.prepare('INSERT INTO service_identity (id, service_id, bootstrap_admin_user_id, initialized_at) VALUES (1, ?, NULL, NULL)').run(randomUUID())
      this.#injectFailure('v2:after-identity')
      db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)').run(2, MIGRATION_V2_CHECKSUM, new Date().toISOString())
      this.#injectFailure('v2:after-ledger')
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

  #migrateV3(db: DatabaseSync): void {
    let committed = false
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(MIGRATION_V3_SQL)
      this.#injectFailure('v3:after-projects')
      this.#injectFailure('v3:after-memberships')
      this.#injectFailure('v3:after-objects')
      this.#injectFailure('v3:after-grants')
      db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)').run(3, MIGRATION_V3_CHECKSUM, new Date().toISOString())
      db.exec('PRAGMA user_version = 3')
      db.exec('COMMIT'); committed = true
    } catch (error: unknown) {
      if (!committed && !this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      throw error instanceof RecordsError ? error : new RecordsError('STORAGE_INCOMPATIBLE', 'authorization migration failed', false, { cause: error })
    }
  }

  #migrateV4(db: DatabaseSync): void {
    let committed = false
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(MIGRATION_V4_SQL)
      this.#injectFailure('v4:after-rebuild')
      db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)').run(4, MIGRATION_V4_CHECKSUM, new Date().toISOString())
      db.exec('PRAGMA user_version = 4')
      db.exec('COMMIT'); committed = true
    } catch (error: unknown) {
      if (!committed && !this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      throw error instanceof RecordsError ? error : new RecordsError('STORAGE_INCOMPATIBLE', 'grant history migration failed', false, { cause: error })
    }
  }

  #migrateV5(db: DatabaseSync): void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(MIGRATION_V5_SQL)
      this.#injectFailure('v5:after-schema')
      db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)').run(5, MIGRATION_V5_CHECKSUM, new Date().toISOString())
      db.exec('PRAGMA user_version = 5')
      db.exec('COMMIT')
    } catch (error: unknown) {
      if (!this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      throw new RecordsError('STORAGE_INCOMPATIBLE', 'tool receipt migration failed', false, { cause: error })
    }
  }

  #migrateV6(db: DatabaseSync): void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(JOB_SCHEMA)
      this.#injectFailure('v6:after-schema')
      db.prepare('INSERT INTO schema_migrations VALUES(6,?,?)').run(MIGRATION_V6_CHECKSUM,new Date().toISOString())
      db.exec('PRAGMA user_version=6; COMMIT')
    } catch (err) {
      if (!this.#rollback(db)) throw this.#failure
      throw new RecordsError('STORAGE_INCOMPATIBLE','jobs migration failed',false,{cause:err})
    }
  }

  #migrateV7(db: DatabaseSync): void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(ASSET_SCHEMA);this.#injectFailure('v7:after-schema')
      db.prepare('INSERT INTO schema_migrations VALUES(7,?,?)').run(MIGRATION_V7_CHECKSUM,new Date().toISOString())
      db.exec('PRAGMA user_version=7; COMMIT')
    } catch(e){if(!this.#rollback(db))throw this.#failure;throw new RecordsError('STORAGE_INCOMPATIBLE','asset migration failed',false,{cause:e})}
  }

  #migrateV8(db: DatabaseSync): void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(PARSE_SCHEMA); this.#injectFailure('v8:after-schema')
      db.prepare('INSERT INTO schema_migrations VALUES(8,?,?)').run(MIGRATION_V8_CHECKSUM,new Date().toISOString())
      db.exec('PRAGMA user_version=8; COMMIT')
    } catch(e){if(!this.#rollback(db))throw this.#failure;throw new RecordsError('STORAGE_INCOMPATIBLE','parse migration failed',false,{cause:e})}
  }

  #migrateV9(db:DatabaseSync):void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec('PRAGMA defer_foreign_keys=ON');db.exec(TEXT_SCHEMA);this.#injectFailure('v9:after-schema')
      if(db.prepare('PRAGMA foreign_key_check').get())throw Error('broken reference')
      db.prepare('INSERT INTO schema_migrations VALUES(9,?,?)').run(MIGRATION_V9_CHECKSUM,new Date().toISOString())
      db.exec('PRAGMA user_version=9; COMMIT')
    }catch(e){if(!this.#rollback(db))throw this.#failure;throw new RecordsError('STORAGE_INCOMPATIBLE','text migration failed',false,{cause:e})}
  }

  #migrateV10(db:DatabaseSync):void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec('PRAGMA defer_foreign_keys=ON');db.exec(OFFICE_SCHEMA);this.#injectFailure('v10:after-schema')
      if(db.prepare('PRAGMA foreign_key_check').get())throw Error('broken reference')
      db.prepare('INSERT INTO schema_migrations VALUES(10,?,?)').run(MIGRATION_V10_CHECKSUM,new Date().toISOString())
      db.exec('PRAGMA user_version=10; COMMIT')
    }catch(e){if(!this.#rollback(db))throw this.#failure;throw new RecordsError('STORAGE_INCOMPATIBLE','office migration failed',false,{cause:e})}
  }

  #migrateV11(db:DatabaseSync):void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(OFFICE_AUTH_SCHEMA);this.#injectFailure('v11:after-schema')
      db.prepare('INSERT INTO schema_migrations VALUES(11,?,?)').run(MIGRATION_V11_CHECKSUM,new Date().toISOString())
      db.exec('PRAGMA user_version=11; COMMIT')
    }catch(e){if(!this.#rollback(db))throw this.#failure;throw new RecordsError('STORAGE_INCOMPATIBLE','office authorization migration failed',false,{cause:e})}
  }

  #migrateV12(db:DatabaseSync):void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(OFFICE_HISTORY_SCHEMA);this.#injectFailure('v12:after-schema')
      db.prepare('INSERT INTO schema_migrations VALUES(12,?,?)').run(MIGRATION_V12_CHECKSUM,new Date().toISOString())
      db.exec('PRAGMA user_version=12; COMMIT')
    }catch(e){if(!this.#rollback(db))throw this.#failure;throw new RecordsError('STORAGE_INCOMPATIBLE','office history index migration failed',false,{cause:e})}
  }

  #migrateV13(db:DatabaseSync):void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(ZIP_SCHEMA);this.#injectFailure('v13:after-schema')
      db.prepare('INSERT INTO schema_migrations VALUES(13,?,?)').run(MIGRATION_V13_CHECKSUM,new Date().toISOString())
      db.exec('PRAGMA user_version=13; COMMIT')
    }catch(e){if(!this.#rollback(db))throw this.#failure;throw new RecordsError('STORAGE_INCOMPATIBLE','ZIP import migration failed',false,{cause:e})}
  }

  #migrateV14(db:DatabaseSync):void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(CITATION_SCHEMA);this.#injectFailure('v14:after-schema')
      db.prepare('INSERT INTO schema_migrations VALUES(14,?,?)').run(MIGRATION_V14_CHECKSUM,new Date().toISOString())
      db.exec('PRAGMA user_version=14; COMMIT')
    }catch(e){if(!this.#rollback(db))throw this.#failure;throw new RecordsError('STORAGE_INCOMPATIBLE','citation migration failed',false,{cause:e})}
  }

  #migrateV15(db:DatabaseSync):void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(CITATION_LOCATOR_SCHEMA)
      this.#injectFailure('v15:after-schema')
      db.prepare('INSERT INTO schema_migrations VALUES(15,?,?)').run(MIGRATION_V15_CHECKSUM,new Date().toISOString())
      db.exec('PRAGMA user_version=15; COMMIT')
    }catch(e){if(!this.#rollback(db))throw this.#failure;throw new RecordsError('STORAGE_INCOMPATIBLE','citation locator migration failed',false,{cause:e})}
  }

  #migrateV16(db:DatabaseSync):void {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(READING_STATE_SCHEMA)
      this.#injectFailure('v16:after-schema')
      db.prepare('INSERT INTO schema_migrations VALUES(16,?,?)').run(MIGRATION_V16_CHECKSUM,new Date().toISOString())
      db.exec('PRAGMA user_version=16; COMMIT')
    }catch(e){if(!this.#rollback(db))throw this.#failure;throw new RecordsError('STORAGE_INCOMPATIBLE','reading state migration failed',false,{cause:e})}
  }

  #verify(db: DatabaseSync, version:6|7|8|9|10|11|12|13|14|15|16): void {
    const facts = readDatabaseFacts(this.databasePath)
    const checks=[MIGRATION_V6_CHECKSUM,MIGRATION_V7_CHECKSUM,MIGRATION_V8_CHECKSUM,MIGRATION_V9_CHECKSUM,MIGRATION_V10_CHECKSUM,MIGRATION_V11_CHECKSUM,MIGRATION_V12_CHECKSUM,MIGRATION_V13_CHECKSUM,MIGRATION_V14_CHECKSUM,MIGRATION_V15_CHECKSUM,MIGRATION_V16_CHECKSUM].slice(0,version-5)
    if(facts.applicationId!==APPLICATION_ID || facts.userVersion!==version || facts.ledger.length!==version || checks.some((hash,i)=>facts.ledger[i+5]?.version!==i+6||facts.ledger[i+5]?.checksum!==hash))throw new RecordsError('STORAGE_INCOMPATIBLE','database ownership/version verification failed')
    const reference = new DatabaseSync(':memory:')
    try {
      reference.exec(JOB_SCHEMA)
      if(version>=7)reference.exec(ASSET_SCHEMA)
      if(version>=8)reference.exec(PARSE_SCHEMA)
      if(version>=9)reference.exec(TEXT_SCHEMA)
      if(version>=10)reference.exec(OFFICE_SCHEMA)
      if(version>=11)reference.exec(OFFICE_AUTH_SCHEMA)
      if(version>=12)reference.exec(OFFICE_HISTORY_SCHEMA)
      if(version>=13)reference.exec(ZIP_SCHEMA)
      if(version>=14)reference.exec(CITATION_SCHEMA)
      if(version>=15)reference.exec(CITATION_LOCATOR_SCHEMA)
      if(version>=16)reference.exec(READING_STATE_SCHEMA)
      const definitions = reference.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all()
      for (const {name,sql} of definitions) {
        if (db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(name!)?.sql!==sql) throw new RecordsError('STORAGE_INCOMPATIBLE','jobs schema definition mismatch')
      }
      const names = new Set(definitions.map(x=>x.name))
      this.#assertV5Schema({...facts,ledger:facts.ledger.slice(0,5),objects:facts.objects.filter(x=>!names.has(x.name))})
    } finally { reference.close() }
    this.#assertV2Definitions(db)
    this.#assertV4Definitions(db)
    this.#assertV5Definitions(db)
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
      this.#injectFailure('bootstrap:after-credential')
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(userId, input.loginName, input.displayName, credentialId, input.timezone, serviceId, JSON.stringify(input.domains), JSON.stringify(input.learningTracks), input.goalText, now, now)
      this.#injectFailure('bootstrap:after-user')
      db.prepare(`INSERT INTO spaces (id, service_id, kind, owner_user_id, status, revision, created_at, updated_at) VALUES (?, ?, 'personal', ?, 'active', 1, ?, ?)`).run(spaceId, serviceId, userId, now, now)
      this.#injectFailure('bootstrap:after-space')
      db.prepare('UPDATE service_identity SET bootstrap_admin_user_id = ?, initialized_at = ? WHERE id = 1 AND initialized_at IS NULL').run(userId, now)
      this.#injectFailure('bootstrap:after-identity')
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
      this.#injectFailure('register:after-credential')
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(userId, input.loginName, input.displayName, credentialId, input.timezone, serviceId, JSON.stringify(input.domains), JSON.stringify(input.learningTracks), input.goalText, now, now)
      this.#injectFailure('register:after-user')
      db.prepare(`INSERT INTO spaces (id, service_id, kind, owner_user_id, status, revision, created_at, updated_at) VALUES (?, ?, 'personal', ?, 'active', 1, ?, ?)`).run(spaceId, serviceId, userId, now, now)
      this.#injectFailure('register:after-space')
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

  #objectRow(row: Record<string, unknown>): KnowledgeObjectRecord {
    return { id: String(row.id), serviceId: String(row.service_id), spaceId: String(row.space_id), scope: String(row.scope_kind) as ResourceScope, projectId: row.project_id == null ? undefined : String(row.project_id), ownerUserId: String(row.owner_user_id), objectType: String(row.object_type), title: String(row.title), body: String(row.body), status: String(row.status) as KnowledgeObjectRecord['status'], revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }
  }

  #objectTarget(row: KnowledgeObjectRecord): AuthorizationTarget { return { serviceId: row.serviceId, spaceId: row.spaceId, objectId: row.id, scope: row.scope, ownerUserId: row.ownerUserId, projectId: row.projectId, status: row.status } }

  #grants(db: DatabaseSync, objectId: string): AuthorizationGrant[] {
    return (db.prepare('SELECT subject_type, subject_id, action, valid_from, expires_at, revoked_at FROM resource_grants WHERE resource_type = \'knowledge_object\' AND resource_id = ?').all(objectId) as Record<string, unknown>[]).map(row => ({ subjectType: String(row.subject_type) as AuthorizationGrant['subjectType'], subjectId: String(row.subject_id), action: String(row.action) as AuthorizationAction, validFrom: String(row.valid_from), expiresAt: row.expires_at == null ? undefined : String(row.expires_at), revokedAt: row.revoked_at == null ? undefined : String(row.revoked_at) }))
  }

  #memberships(db: DatabaseSync, projectId: string): ProjectMembership[] {
    return (db.prepare('SELECT project_id, user_id, role, valid_from, expires_at, revoked_at FROM project_memberships WHERE project_id = ?').all(projectId) as Record<string, unknown>[]).map(row => ({ projectId: String(row.project_id), userId: String(row.user_id), role: String(row.role), validFrom: String(row.valid_from), expiresAt: row.expires_at == null ? undefined : String(row.expires_at), revokedAt: row.revoked_at == null ? undefined : String(row.revoked_at) }))
  }

  #loadObject(id: string): KnowledgeObjectRecord | undefined {
    const row = this.#ensureReady().prepare('SELECT id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at FROM knowledge_objects WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row === undefined ? undefined : this.#objectRow(row)
  }

  authorizeObject(actor: SessionActor, objectId: string, action: AuthorizationAction, now: string): KnowledgeObjectRecord | undefined {
    const db = this.#ensureReady(); const object = this.#loadObject(objectId)
    if (object === undefined) return undefined
    const allowed = authorize(actor, this.#objectTarget(object), action, now, this.#grants(db, object.id), object.projectId === undefined ? [] : this.#memberships(db, object.projectId))
    return allowed ? object : undefined
  }

  listObjects(actor: SessionActor, action: AuthorizationAction, now: string): KnowledgeObjectRecord[] {
    const db = this.#ensureReady(); const rows = db.prepare('SELECT id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at FROM knowledge_objects WHERE service_id = ? AND status = \'active\' ORDER BY created_at, id').all(actor.serviceId) as Record<string, unknown>[]
    return rows.map(row => this.#objectRow(row)).filter(object => authorize(actor, this.#objectTarget(object), action, now, this.#grants(db, object.id), object.projectId === undefined ? [] : this.#memberships(db, object.projectId)))
  }

  createProject(input: { readonly id: string; readonly serviceId: string; readonly ownerUserId: string; readonly name: string; readonly now: string }): ProjectRecord {
    const db = this.#ensureReady(); let tx = false
    try { db.exec('BEGIN IMMEDIATE'); tx = true; db.prepare('INSERT INTO knowledge_projects (id, service_id, owner_user_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, \'active\', ?, ?)').run(input.id, input.serviceId, input.ownerUserId, input.name, input.now, input.now); db.prepare('INSERT INTO project_memberships (project_id, user_id, role, valid_from) VALUES (?, ?, \'owner\', ?)').run(input.id, input.ownerUserId, input.now); db.exec('COMMIT'); tx = false; return { id: input.id, serviceId: input.serviceId, ownerUserId: input.ownerUserId, name: input.name, status: 'active', createdAt: input.now, updatedAt: input.now } } catch (error: unknown) { if (tx && !this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error }); throw this.#mapError(error) }
  }

  canManageProject(actor: SessionActor, projectId: string): boolean {
    const row = this.#ensureReady().prepare('SELECT service_id, owner_user_id, status FROM knowledge_projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined
    return row !== undefined && String(row.service_id) === actor.serviceId && String(row.owner_user_id) === actor.userId && String(row.status) === 'active'
  }

  canCreateProjectObject(actor: SessionActor, projectId: string, now: string): boolean {
    const db = this.#ensureReady()
    const project = db.prepare('SELECT service_id, status FROM knowledge_projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined
    if (project === undefined || String(project.service_id) !== actor.serviceId || String(project.status) !== 'active') return false
    return this.#memberships(db, projectId).some(item => item.userId === actor.userId && isGrantActive(item, now))
  }

  addProjectMembership(input: { readonly projectId: string; readonly userId: string; readonly role: string; readonly validFrom: string; readonly expiresAt?: string }): void {
    const db = this.#ensureReady(); try { db.prepare('INSERT INTO project_memberships (project_id, user_id, role, valid_from, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role, valid_from = excluded.valid_from, expires_at = excluded.expires_at, revoked_at = NULL').run(input.projectId, input.userId, input.role, input.validFrom, input.expiresAt ?? null) } catch (error: unknown) { throw this.#mapError(error) }
  }

  createObject(input: { readonly id: string; readonly serviceId: string; readonly spaceId: string; readonly scope: ResourceScope; readonly projectId?: string; readonly ownerUserId: string; readonly objectType: string; readonly title: string; readonly body: string; readonly now: string }): KnowledgeObjectRecord {
    const db = this.#ensureReady()
    if (input.scope === 'personal' && input.projectId !== undefined) throw new RecordsError('STORAGE_INCOMPATIBLE', 'personal object cannot reference a project')
    if (input.scope === 'project') {
      if (input.projectId === undefined) throw new RecordsError('STORAGE_INCOMPATIBLE', 'project object requires a project')
      const project = db.prepare('SELECT service_id, status FROM knowledge_projects WHERE id = ?').get(input.projectId) as Record<string, unknown> | undefined
      if (project === undefined || String(project.service_id) !== input.serviceId || String(project.status) !== 'active' || !this.#memberships(db, input.projectId).some(item => item.userId === input.ownerUserId && isGrantActive(item, input.now))) throw new RecordsError('STORAGE_INCOMPATIBLE', 'object owner is not an active project member')
    }
    let tx = false
    try { db.exec('BEGIN IMMEDIATE'); tx = true; db.prepare('INSERT INTO knowledge_objects (id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, \'active\', 1, ?, ?)').run(input.id, input.serviceId, input.spaceId, input.scope, input.projectId ?? null, input.ownerUserId, input.objectType, input.title, input.body, input.now, input.now); if (input.scope === 'project' && input.projectId !== undefined) { for (const action of ['read', 'comment', 'edit', 'export', 'manage_share', 'delete', 'review', 'view_learning_records'] as AuthorizationAction[]) db.prepare('INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, created_at) VALUES (?, ?, \'knowledge_object\', ?, \'user\', ?, ?, ?, ?)').run(randomUUID(), input.serviceId, input.id, input.ownerUserId, action, input.now, input.now) }; db.exec('COMMIT'); tx = false; const created = this.#loadObject(input.id); if (created === undefined) throw new RecordsError('STORAGE_UNAVAILABLE', 'created object could not be read'); return created } catch (error: unknown) { if (tx && !this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error }); throw this.#mapError(error) }
  }

  updateObject(actor: SessionActor, objectId: string, expectedRevision: number, patch: { readonly title?: string; readonly body?: string }, now: string): UpdateObjectResult {
    const db = this.#ensureReady()
    const current = this.authorizeObject(actor, objectId, 'edit', now)
    if (current === undefined) return { kind: 'not_found' }
    if (current.revision !== expectedRevision) return { kind: 'conflict', currentRevision: current.revision }
    const title = patch.title ?? current.title
    const body = patch.body ?? current.body
    const result = db.prepare('UPDATE knowledge_objects SET title = ?, body = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = \'active\'').run(title, body, now, objectId, expectedRevision)
    if (Number(result.changes) !== 1) {
      const latest = this.#loadObject(objectId)
      return latest === undefined || latest.status !== 'active' ? { kind: 'not_found' } : { kind: 'conflict', currentRevision: latest.revision }
    }
    const updated = this.#loadObject(objectId)
    return updated === undefined ? { kind: 'not_found' } : { kind: 'updated', object: updated }
  }

  /** Revalidate the original login inside the same transaction as ACL/version/receipt. */
  mutateObjectOnce(actor: SessionActor, input: { objectId: string; expectedRevision: number; title?: string; body?: string; key: string; digest: string }, now: string): { kind: 'updated' | 'replayed'; object: KnowledgeObjectRecord } | { kind: 'not_found' | 'session_expired' | 'conflict' | 'idempotency_conflict' } {
    const db = this.#ensureReady(); let tx = false
    try {
      db.exec('BEGIN IMMEDIATE'); tx = true
      // Lock acquisition may wait; authentication and ACL use commit-side time.
      now = new Date().toISOString()
      const session = db.prepare(`SELECT s.id FROM auth_sessions s JOIN users u ON u.id = s.user_id JOIN spaces p ON p.owner_user_id = u.id WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active' AND p.status = 'active' AND p.id = ? AND u.planning_home_service_id = ?`).get(actor.sessionId, actor.userId, now, actor.personalSpaceId, actor.serviceId)
      const finish = <T>(value: T): T => { db.exec('COMMIT'); tx = false; return value }
      if (session === undefined) return finish({ kind: 'session_expired' as const })
      const current = this.authorizeObject(actor, input.objectId, 'edit', now)
      if (current === undefined || this.authorizeObject(actor, input.objectId, 'read', now) === undefined) return finish({ kind: 'not_found' as const })
      const receipt = db.prepare('SELECT request_digest, result_json FROM ai_tool_mutations WHERE service_id = ? AND user_id = ? AND idempotency_key = ?').get(actor.serviceId, actor.userId, input.key) as { request_digest: string; result_json: string } | undefined
      if (receipt !== undefined) return finish(receipt.request_digest === input.digest ? { kind: 'replayed' as const, object: JSON.parse(receipt.result_json) as KnowledgeObjectRecord } : { kind: 'idempotency_conflict' as const })
      if (current.revision !== input.expectedRevision) return finish({ kind: 'conflict' as const })
      const changed = db.prepare("UPDATE knowledge_objects SET title = ?, body = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = 'active'").run(input.title ?? current.title, input.body ?? current.body, now, input.objectId, input.expectedRevision)
      if (Number(changed.changes) !== 1) return finish({ kind: 'conflict' as const })
      this.#injectFailure('ai:after-update')
      const object = this.#loadObject(input.objectId)!
      db.prepare('INSERT INTO ai_tool_mutations (service_id, user_id, idempotency_key, request_digest, object_id, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(actor.serviceId, actor.userId, input.key, input.digest, input.objectId, JSON.stringify(object), now)
      return finish({ kind: 'updated' as const, object })
    } catch (error: unknown) {
      if (tx && !this.#rollback(db)) throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      throw this.#mapError(error)
    }
  }

  deleteObject(actor: SessionActor, objectId: string, now: string): boolean { const object = this.authorizeObject(actor, objectId, 'delete', now); if (object === undefined) return false; const result = this.#ensureReady().prepare('UPDATE knowledge_objects SET status = \'deleted\', revision = revision + 1, updated_at = ? WHERE id = ? AND status = \'active\'').run(now, objectId); return Number(result.changes) === 1 }

  grantObject(actor: SessionActor, input: { readonly id: string; readonly objectId: string; readonly serviceId: string; readonly subjectType: 'user' | 'project'; readonly subjectId: string; readonly action: AuthorizationAction; readonly validFrom: string; readonly expiresAt?: string; readonly now: string }): GrantRecord | undefined {
    const db = this.#ensureReady()
    const object = this.authorizeObject(actor, input.objectId, 'manage_share', input.now)
    if (object === undefined || input.serviceId !== actor.serviceId) return undefined
    if (input.subjectType === 'project') {
      const project = db.prepare('SELECT service_id, status FROM knowledge_projects WHERE id = ?').get(input.subjectId) as Record<string, unknown> | undefined
      if (project === undefined || String(project.service_id) !== actor.serviceId || String(project.status) !== 'active') return undefined
    } else {
      const user = db.prepare('SELECT planning_home_service_id, status FROM users WHERE id = ?').get(input.subjectId) as Record<string, unknown> | undefined
      if (user === undefined || String(user.planning_home_service_id) !== actor.serviceId || String(user.status) !== 'active') return undefined
    }
    try {
      db.prepare('INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, expires_at, created_at) VALUES (?, ?, \'knowledge_object\', ?, ?, ?, ?, ?, ?, ?)').run(input.id, input.serviceId, input.objectId, input.subjectType, input.subjectId, input.action, input.validFrom, input.expiresAt ?? null, input.now)
      return { id: input.id, serviceId: input.serviceId, resourceType: 'knowledge_object', resourceId: input.objectId, subjectType: input.subjectType, subjectId: input.subjectId, action: input.action, validFrom: input.validFrom, expiresAt: input.expiresAt, createdAt: input.now }
    } catch (error: unknown) { throw this.#mapError(error) }
  }

  revokeGrant(actor: SessionActor, grantId: string, now: string): boolean {
    const db = this.#ensureReady()
    const grant = db.prepare('SELECT resource_id, service_id, revoked_at FROM resource_grants WHERE id = ?').get(grantId) as { resource_id?: string; service_id?: string; revoked_at?: string | null } | undefined
    if (grant?.resource_id === undefined || grant.service_id !== actor.serviceId || grant.revoked_at !== null || this.authorizeObject(actor, String(grant.resource_id), 'manage_share', now) === undefined) return false
    const result = db.prepare('UPDATE resource_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, grantId)
    return Number(result.changes) === 1
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
