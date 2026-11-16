/**
 * SQLite adapter for the FND-002 storage probe.
 *
 * Owns one `DatabaseSync` connection, the database ownership/version precheck,
 * the atomic v1 migration, parameterized SQL, short transactions, and close.
 * `node:sqlite` is imported only here; HTTP and the application case do not see
 * SQL or database handles.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { CreateOutcome, ProbeRecord, ProbeStorePort } from './records.ts'
import { RecordsError } from './records.ts'

/** Fixed application identity written to `PRAGMA application_id` (KOS1). */
export const APPLICATION_ID = 0x4b4f5331
/** Application schema version written to `PRAGMA user_version`. */
export const SCHEMA_VERSION = 1
/** Alias used by test helpers. */
export const PROBE_SCHEMA_VERSION = SCHEMA_VERSION
/** The only user tables this application owns. */
export const PROBE_SUPPORTED_TABLES = ['schema_migrations', 'storage_probe_records'] as const
/** Busy wait applied to the write connection. */
export const BUSY_TIMEOUT_MS = 250
/** Fixed database filename inside the trusted data directory. */
export const DATABASE_FILENAME = 'knowledgeos.sqlite'

/** Canonical v1 migration SQL; its bytes are the checksum source. */
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

/** SHA-256 of {@link MIGRATION_V1_SQL} in UTF-8. */
export const MIGRATION_V1_CHECKSUM = createHash('sha256').update(Buffer.from(MIGRATION_V1_SQL, 'utf8')).digest('hex')

/** One migration plan; tests may pass a failing plan, production never does. */
export interface MigrationPlan {
  readonly version: number
  readonly sql: string
  readonly checksum: string
}

/** The production v1 migration. */
export const MIGRATION_V1: MigrationPlan = {
  version: SCHEMA_VERSION,
  sql: MIGRATION_V1_SQL,
  checksum: MIGRATION_V1_CHECKSUM,
}

/** Inputs accepted by the SQLite adapter constructor. */
export interface ProbeStorageOptions {
  /** Trusted absolute data directory; the adapter creates it if missing. */
  readonly dataDir: string
  /** Safe diagnostic sink; must not receive SQL text or credentials. */
  readonly log?: (message: string) => void
  /** Test-only migration override. Never wired from Host configuration or HTTP. */
  readonly migrationOverride?: MigrationPlan
}

/** Raw facts used by tests and by the ownership/version precheck. */
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

/**
 * Read ownership/version facts from one database file.
 * @param path - database file path.
 * @returns raw facts with no writes.
 */
export function readDatabaseFacts(path: string): DatabaseFacts {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const applicationId = Number((db.prepare('PRAGMA application_id').get() as { application_id?: number } | undefined)?.application_id ?? 0)
    const userVersion = Number((db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0)
    const objects = (db.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as { type: string; name: string }[])
      .map(row => ({ type: row.type, name: row.name }))
    const tables = objects.filter(object => object.type === 'table').map(object => object.name)
    let ledger: { version: number; checksum: string; applied_at: string }[] = []
    if (tables.includes('schema_migrations')) {
      ledger = db.prepare('SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version').all() as typeof ledger
    }
    return { applicationId, userVersion, tables, objects, ledger }
  } finally {
    db.close()
  }
}

/**
 * One SQLite-backed probe store for the lifetime of one plugin instance.
 */
export class ProbeStorage implements ProbeStorePort {
  readonly #dataDir: string
  readonly #log: (message: string) => void
  readonly #migration: MigrationPlan
  #db: DatabaseSync | undefined
  #state: StorageState = 'unavailable'
  #failure: RecordsError | undefined
  #closed = false

  constructor(options: ProbeStorageOptions) {
    this.#dataDir = options.dataDir
    this.#log = options.log ?? (() => {})
    this.#migration = options.migrationOverride ?? MIGRATION_V1
    this.#open()
  }

  /** Whether this adapter can serve reads and writes. */
  get available(): boolean {
    return this.#state === 'ready'
  }

  /** Current stable failure, when the adapter is unavailable. */
  get failure(): RecordsError | undefined {
    return this.#failure
  }

  /** Database file path; used by tests, never returned by HTTP. */
  get databasePath(): string {
    return join(this.#dataDir, DATABASE_FILENAME)
  }

  #open(): void {
    let db: DatabaseSync | undefined
    try {
      mkdirSync(this.#dataDir, { recursive: true })
      const path = this.databasePath
      const existing = existsSync(path) ? this.#precheck(path) : 'blank'
      db = new DatabaseSync(path)
      this.#configure(db)
      if (existing === 'blank') this.#migrate(db)
      this.#verify(db)
      const facts = readDatabaseFacts(path)
      const pragmas = this.#readPragmas(db)
      this.#db = db
      this.#state = 'ready'
      this.#log(
        `knowledgeos-storage: opened node=${process.versions.node} sqlite=${pragmas.sqliteVersion} `
        + `journal=${pragmas.journalMode} foreign_keys=${pragmas.foreignKeys} synchronous=${pragmas.synchronous} `
        + `busy_timeout=${pragmas.busyTimeout} tables=${facts.tables.length}`,
      )
    } catch (error: unknown) {
      try { db?.close() } catch { /* the open failure is the reported cause */ }
      this.#failure = error instanceof RecordsError
        ? error
        : new RecordsError('STORAGE_UNAVAILABLE', 'storage could not be opened', false, { cause: error })
      this.#state = 'unavailable'
      this.#log(`knowledgeos-storage: unavailable code=${this.#failure.code}`)
    }
  }

  #precheck(path: string): 'blank' | 'existing' {
    const facts = readDatabaseFacts(path)
    if (facts.applicationId === 0 && facts.userVersion === 0 && facts.objects.length === 0) return 'blank'
    if (facts.applicationId !== APPLICATION_ID) {
      throw new RecordsError('STORAGE_INCOMPATIBLE', 'database belongs to another application')
    }
    if (facts.userVersion > SCHEMA_VERSION) {
      throw new RecordsError('STORAGE_INCOMPATIBLE', 'database schema is newer than this build')
    }
    if (facts.userVersion !== SCHEMA_VERSION) {
      throw new RecordsError('STORAGE_INCOMPATIBLE', 'database schema version is not supported')
    }
    this.#assertKnownSchema(facts)
    return 'existing'
  }

  #assertKnownSchema(facts: DatabaseFacts): void {
    const expected = [...PROBE_SUPPORTED_TABLES]
    const onlyExpectedTables = facts.objects.length === expected.length
      && facts.objects.every((object, index) => object.type === 'table' && object.name === expected[index])
    if (!onlyExpectedTables) {
      throw new RecordsError('STORAGE_INCOMPATIBLE', 'database contains an unknown schema')
    }
    const entry = facts.ledger[0]
    if (facts.ledger.length !== 1 || entry?.version !== SCHEMA_VERSION || entry.checksum !== MIGRATION_V1_CHECKSUM) {
      throw new RecordsError('STORAGE_INCOMPATIBLE', 'migration ledger does not match this build')
    }
  }

  #configure(db: DatabaseSync): void {
    const journal = String((db.prepare('PRAGMA journal_mode=WAL').get() as { journal_mode?: string } | undefined)?.journal_mode ?? '').toLowerCase()
    if (journal !== 'wal') throw new RecordsError('STORAGE_INCOMPATIBLE', 'WAL journal mode is not available')
    db.exec('PRAGMA foreign_keys=ON')
    db.exec('PRAGMA synchronous=FULL')
    db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`)
  }

  #readPragmas(db: DatabaseSync): {
    journalMode: string
    foreignKeys: number
    synchronous: number
    busyTimeout: number
    sqliteVersion: string
  } {
    return {
      journalMode: String((db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string } | undefined)?.journal_mode ?? ''),
      foreignKeys: Number((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys?: number } | undefined)?.foreign_keys ?? 0),
      synchronous: Number((db.prepare('PRAGMA synchronous').get() as { synchronous?: number } | undefined)?.synchronous ?? -1),
      busyTimeout: Number((db.prepare('PRAGMA busy_timeout').get() as { timeout?: number } | undefined)?.timeout ?? -1),
      sqliteVersion: String((db.prepare('SELECT sqlite_version() AS version').get() as { version?: string } | undefined)?.version ?? 'unknown'),
    }
  }

  #migrate(db: DatabaseSync): void {
    let committed = false
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(this.#migration.sql)
      db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)')
        .run(this.#migration.version, this.#migration.checksum, new Date().toISOString())
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`)
      db.exec(`PRAGMA user_version = ${this.#migration.version}`)
      db.exec('COMMIT')
      committed = true
    } catch (error: unknown) {
      if (!committed) {
        const rolledBack = this.#rollback(db)
        if (!rolledBack) {
          throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
        }
      }
      throw error instanceof RecordsError
        ? error
        : new RecordsError('STORAGE_INCOMPATIBLE', 'storage migration failed', false, { cause: error })
    }
  }

  #verify(db: DatabaseSync): void {
    const applicationId = Number((db.prepare('PRAGMA application_id').get() as { application_id?: number } | undefined)?.application_id ?? 0)
    const userVersion = Number((db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0)
    const objects = (db.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as { type: string; name: string }[])
      .map(row => ({ type: row.type, name: row.name }))
    const tables = objects.filter(object => object.type === 'table').map(object => object.name)
    const ledger = tables.includes('schema_migrations')
      ? (db.prepare('SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version').all() as Record<string, unknown>[])
          .map(row => ({ version: Number(row.version), checksum: String(row.checksum), applied_at: String(row.applied_at) }))
      : []
    this.#assertKnownSchema({ applicationId, userVersion, tables, objects, ledger })
  }

  #rollback(db: DatabaseSync): boolean {
    try {
      db.exec('ROLLBACK')
      return true
    } catch (rollbackError: unknown) {
      this.#state = 'unavailable'
      this.#failure = new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: rollbackError })
      this.#log('knowledgeos-storage: rollback failed; writes disabled')
      return false
    }
  }

  #ensureReady(): DatabaseSync {
    if (this.#state === 'closed') throw new RecordsError('STORAGE_CLOSED', 'storage is closed')
    if (this.#state !== 'ready' || this.#db === undefined) {
      throw this.#failure ?? new RecordsError('STORAGE_UNAVAILABLE', 'storage is unavailable')
    }
    return this.#db
  }

  #selectByKey(db: DatabaseSync, key: string): StoredRow | undefined {
    return db.prepare(
      'SELECT id, idempotency_key, request_digest, content, created_at FROM storage_probe_records WHERE idempotency_key = ?',
    ).get(key) as StoredRow | undefined
  }

  #mapError(error: unknown): RecordsError {
    if (error instanceof RecordsError) return error
    const primary = primarySqliteCode(error)
    if (primary === 5) return new RecordsError('STORAGE_BUSY', 'storage is busy', true, { cause: error })
    if (primary === 8 || primary === 14) {
      return new RecordsError('STORAGE_UNAVAILABLE', 'storage is not writable', false, { cause: error })
    }
    return new RecordsError('STORAGE_UNAVAILABLE', 'storage operation failed', false, { cause: error })
  }

  /**
   * Persist one record or replay/conflict on the same idempotency key.
   * @param input - server id, key, content digest, content, and creation time.
   * @returns created, replayed, or conflict.
   */
  createOrReplay(input: {
    readonly id: string
    readonly idempotencyKey: string
    readonly digest: string
    readonly content: string
    readonly createdAt: string
  }): CreateOutcome {
    const db = this.#ensureReady()
    let inTransaction = false
    try {
      db.exec('BEGIN IMMEDIATE')
      inTransaction = true
      const existing = this.#selectByKey(db, input.idempotencyKey)
      if (existing !== undefined) {
        if (existing.request_digest === input.digest && existing.content === input.content) {
          db.exec('COMMIT')
          inTransaction = false
          return { kind: 'replayed', record: toRecord(existing) }
        }
        db.exec('ROLLBACK')
        inTransaction = false
        return { kind: 'conflict' }
      }
      db.prepare(
        'INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(input.id, input.idempotencyKey, input.digest, input.content, input.createdAt)
      db.exec('COMMIT')
      inTransaction = false
      return { kind: 'created', record: { id: input.id, content: input.content, created_at: input.createdAt } }
    } catch (error: unknown) {
      if (inTransaction) {
        const rolledBack = this.#rollback(db)
        if (!rolledBack) {
          throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
        }
      }
      if (primarySqliteCode(error) === 19) {
        // A concurrent request may have committed the same key first.
        const raced = this.#selectByKey(db, input.idempotencyKey)
        if (raced !== undefined) {
          if (raced.request_digest === input.digest && raced.content === input.content) {
            return { kind: 'replayed', record: toRecord(raced) }
          }
          return { kind: 'conflict' }
        }
      }
      throw this.#mapError(error)
    }
  }

  /**
   * Read one record by id.
   * @param id - server-generated id.
   * @returns the record, or undefined.
   */
  getById(id: string): ProbeRecord | undefined {
    const db = this.#ensureReady()
    try {
      const row = db.prepare(
        'SELECT id, idempotency_key, request_digest, content, created_at FROM storage_probe_records WHERE id = ?',
      ).get(id) as StoredRow | undefined
      return row === undefined ? undefined : toRecord(row)
    } catch (error: unknown) {
      throw this.#mapError(error)
    }
  }

  /**
   * Test-only transaction probe: insert one row, then force a primary-key
   * failure in the same transaction and roll the whole transaction back.
   * Never registered on an HTTP route.
   * @param input - two ids/keys and content for the controlled failure.
   * @returns the real SQLite error and the post-rollback row count.
   */
  testOnlyTransactionFailure(input: {
    readonly firstId: string
    readonly failingId: string
    readonly firstKey: string
    readonly failingKey: string
    readonly content: string
  }): { rolledBack: boolean; primaryCode: number | undefined; rows: number } {
    const db = this.#ensureReady()
    db.exec('BEGIN IMMEDIATE')
    let primaryCode: number | undefined
    let failed = false
    try {
      db.prepare('INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(input.firstId, input.firstKey, createHash('sha256').update(input.content).digest('hex'), input.content, new Date().toISOString())
      // Same primary key: a deterministic constraint failure after the first write.
      db.prepare('INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(input.firstId, input.failingKey, createHash('sha256').update(input.content).digest('hex'), input.content, new Date().toISOString())
    } catch (error: unknown) {
      failed = true
      primaryCode = primarySqliteCode(error)
      if (!this.#rollback(db)) {
        throw new RecordsError('STORAGE_UNAVAILABLE', 'storage transaction state is unknown', false, { cause: error })
      }
    }
    if (!failed) {
      this.#rollback(db)
      throw new RecordsError('INTERNAL_ERROR', 'transaction probe did not fail')
    }
    const rows = Number((db.prepare('SELECT count(*) AS count FROM storage_probe_records WHERE id IN (?, ?)').get(input.firstId, input.failingId) as { count: number }).count)
    return { rolledBack: primaryCode === 19, primaryCode, rows }
  }

  /**
   * Close the connection once. Idempotent; the database file stays on disk.
   */
  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#state = 'closed'
    const db = this.#db
    this.#db = undefined
    if (db !== undefined) {
      try {
        db.close()
        this.#log('knowledgeos-storage: closed')
      } catch (error: unknown) {
        this.#log(`knowledgeos-storage: close failed code=${this.#mapError(error).code}`)
      }
    }
  }
}
