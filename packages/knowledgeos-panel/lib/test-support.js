// src/host/storage.ts
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash as createHash2 } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

// src/host/records.ts
import { createHash } from "node:crypto";
var RecordsError = class extends Error {
  /** Machine-readable code exposed in the API error body. */
  code;
  /** Whether a client may retry the same request. */
  retryable;
  constructor(code, message, retryable = false, options) {
    super(message, options);
    this.name = "RecordsError";
    this.code = code;
    this.retryable = retryable;
  }
};
function contentDigest(content) {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}
function createProbeRecord(port, deps, input) {
  return port.createOrReplay({
    id: deps.newId(),
    idempotencyKey: input.idempotencyKey,
    digest: contentDigest(input.content),
    content: input.content,
    createdAt: deps.now()
  });
}
function getProbeRecord(port, id) {
  return port.getById(id);
}

// src/host/storage.ts
var APPLICATION_ID = 1263489841;
var SCHEMA_VERSION = 1;
var PROBE_SCHEMA_VERSION = SCHEMA_VERSION;
var PROBE_SUPPORTED_TABLES = ["schema_migrations", "storage_probe_records"];
var BUSY_TIMEOUT_MS = 250;
var DATABASE_FILENAME = "knowledgeos.sqlite";
var MIGRATION_V1_SQL = `CREATE TABLE schema_migrations (
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
`;
var MIGRATION_V1_CHECKSUM = createHash2("sha256").update(Buffer.from(MIGRATION_V1_SQL, "utf8")).digest("hex");
var MIGRATION_V1 = {
  version: SCHEMA_VERSION,
  sql: MIGRATION_V1_SQL,
  checksum: MIGRATION_V1_CHECKSUM
};
function primarySqliteCode(error) {
  const code = error?.errcode;
  return typeof code === "number" ? code & 255 : void 0;
}
function toRecord(row) {
  return { id: row.id, content: row.content, created_at: row.created_at };
}
function readSchemaObjects(db) {
  return db.prepare("SELECT type, name FROM sqlite_master ORDER BY type, name").all().filter((object) => !object.name.startsWith("sqlite_"));
}
function readDatabaseFacts(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const applicationId = Number(db.prepare("PRAGMA application_id").get()?.application_id ?? 0);
    const userVersion = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    const objects = readSchemaObjects(db);
    const tables = objects.filter((object) => object.type === "table").map((object) => object.name);
    let ledger = [];
    if (tables.includes("schema_migrations")) {
      ledger = db.prepare("SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version").all();
    }
    return { applicationId, userVersion, tables, objects, ledger };
  } finally {
    db.close();
  }
}
var ProbeStorage = class {
  #dataDir;
  #log;
  #migration;
  #db;
  #state = "unavailable";
  #failure;
  #closed = false;
  constructor(options) {
    this.#dataDir = options.dataDir;
    this.#log = options.log ?? (() => {
    });
    this.#migration = options.migrationOverride ?? MIGRATION_V1;
    this.#open();
  }
  /** Whether this adapter can serve reads and writes. */
  get available() {
    return this.#state === "ready";
  }
  /** Current stable failure, when the adapter is unavailable. */
  get failure() {
    return this.#failure;
  }
  /** Database file path; used by tests, never returned by HTTP. */
  get databasePath() {
    return join(this.#dataDir, DATABASE_FILENAME);
  }
  #open() {
    let db;
    try {
      mkdirSync(this.#dataDir, { recursive: true });
      const path = this.databasePath;
      const existing = existsSync(path) ? this.#precheck(path) : "blank";
      db = new DatabaseSync(path);
      this.#configure(db);
      if (existing === "blank") this.#migrate(db);
      this.#verify(db);
      const facts = readDatabaseFacts(path);
      const pragmas = this.#readPragmas(db);
      this.#db = db;
      this.#state = "ready";
      this.#log(
        `knowledgeos-storage: opened node=${process.versions.node} sqlite=${pragmas.sqliteVersion} journal=${pragmas.journalMode} foreign_keys=${pragmas.foreignKeys} synchronous=${pragmas.synchronous} busy_timeout=${pragmas.busyTimeout} tables=${facts.tables.length}`
      );
    } catch (error) {
      try {
        db?.close();
      } catch {
      }
      this.#failure = error instanceof RecordsError ? error : new RecordsError("STORAGE_UNAVAILABLE", "storage could not be opened", false, { cause: error });
      this.#state = "unavailable";
      this.#log(`knowledgeos-storage: unavailable code=${this.#failure.code}`);
    }
  }
  #precheck(path) {
    const facts = readDatabaseFacts(path);
    if (facts.applicationId === 0 && facts.userVersion === 0 && facts.objects.length === 0) return "blank";
    if (facts.applicationId !== APPLICATION_ID) {
      throw new RecordsError("STORAGE_INCOMPATIBLE", "database belongs to another application");
    }
    if (facts.userVersion > SCHEMA_VERSION) {
      throw new RecordsError("STORAGE_INCOMPATIBLE", "database schema is newer than this build");
    }
    if (facts.userVersion !== SCHEMA_VERSION) {
      throw new RecordsError("STORAGE_INCOMPATIBLE", "database schema version is not supported");
    }
    this.#assertKnownSchema(facts);
    return "existing";
  }
  #assertKnownSchema(facts) {
    const expected = [...PROBE_SUPPORTED_TABLES];
    const onlyExpectedTables = facts.objects.length === expected.length && facts.objects.every((object, index) => object.type === "table" && object.name === expected[index]);
    if (!onlyExpectedTables) {
      throw new RecordsError("STORAGE_INCOMPATIBLE", "database contains an unknown schema");
    }
    const entry = facts.ledger[0];
    if (facts.ledger.length !== 1 || entry?.version !== SCHEMA_VERSION || entry.checksum !== MIGRATION_V1_CHECKSUM) {
      throw new RecordsError("STORAGE_INCOMPATIBLE", "migration ledger does not match this build");
    }
  }
  #configure(db) {
    const journal = String(db.prepare("PRAGMA journal_mode=WAL").get()?.journal_mode ?? "").toLowerCase();
    if (journal !== "wal") throw new RecordsError("STORAGE_INCOMPATIBLE", "WAL journal mode is not available");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec("PRAGMA synchronous=FULL");
    db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`);
  }
  #readPragmas(db) {
    return {
      journalMode: String(db.prepare("PRAGMA journal_mode").get()?.journal_mode ?? ""),
      foreignKeys: Number(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys ?? 0),
      synchronous: Number(db.prepare("PRAGMA synchronous").get()?.synchronous ?? -1),
      busyTimeout: Number(db.prepare("PRAGMA busy_timeout").get()?.timeout ?? -1),
      sqliteVersion: String(db.prepare("SELECT sqlite_version() AS version").get()?.version ?? "unknown")
    };
  }
  #migrate(db) {
    let committed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(this.#migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(this.#migration.version, this.#migration.checksum, (/* @__PURE__ */ new Date()).toISOString());
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      db.exec(`PRAGMA user_version = ${this.#migration.version}`);
      db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed) {
        const rolledBack = this.#rollback(db);
        if (!rolledBack) {
          throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
        }
      }
      throw error instanceof RecordsError ? error : new RecordsError("STORAGE_INCOMPATIBLE", "storage migration failed", false, { cause: error });
    }
  }
  #verify(db) {
    const applicationId = Number(db.prepare("PRAGMA application_id").get()?.application_id ?? 0);
    const userVersion = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    const objects = readSchemaObjects(db);
    const tables = objects.filter((object) => object.type === "table").map((object) => object.name);
    const ledger = tables.includes("schema_migrations") ? db.prepare("SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version").all().map((row) => ({ version: Number(row.version), checksum: String(row.checksum), applied_at: String(row.applied_at) })) : [];
    this.#assertKnownSchema({ applicationId, userVersion, tables, objects, ledger });
  }
  #rollback(db) {
    try {
      db.exec("ROLLBACK");
      return true;
    } catch (rollbackError) {
      this.#state = "unavailable";
      this.#failure = new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: rollbackError });
      this.#log("knowledgeos-storage: rollback failed; writes disabled");
      return false;
    }
  }
  #ensureReady() {
    if (this.#state === "closed") throw new RecordsError("STORAGE_CLOSED", "storage is closed");
    if (this.#state !== "ready" || this.#db === void 0) {
      throw this.#failure ?? new RecordsError("STORAGE_UNAVAILABLE", "storage is unavailable");
    }
    return this.#db;
  }
  #selectByKey(db, key) {
    return db.prepare(
      "SELECT id, idempotency_key, request_digest, content, created_at FROM storage_probe_records WHERE idempotency_key = ?"
    ).get(key);
  }
  #mapError(error) {
    if (error instanceof RecordsError) return error;
    const primary = primarySqliteCode(error);
    if (primary === 5) return new RecordsError("STORAGE_BUSY", "storage is busy", true, { cause: error });
    if (primary === 8 || primary === 14) {
      return new RecordsError("STORAGE_UNAVAILABLE", "storage is not writable", false, { cause: error });
    }
    return new RecordsError("STORAGE_UNAVAILABLE", "storage operation failed", false, { cause: error });
  }
  /**
   * Persist one record or replay/conflict on the same idempotency key.
   * @param input - server id, key, content digest, content, and creation time.
   * @returns created, replayed, or conflict.
   */
  createOrReplay(input) {
    const db = this.#ensureReady();
    let inTransaction = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
      const existing = this.#selectByKey(db, input.idempotencyKey);
      if (existing !== void 0) {
        if (existing.request_digest === input.digest && existing.content === input.content) {
          db.exec("COMMIT");
          inTransaction = false;
          return { kind: "replayed", record: toRecord(existing) };
        }
        db.exec("ROLLBACK");
        inTransaction = false;
        return { kind: "conflict" };
      }
      db.prepare(
        "INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(input.id, input.idempotencyKey, input.digest, input.content, input.createdAt);
      db.exec("COMMIT");
      inTransaction = false;
      return { kind: "created", record: { id: input.id, content: input.content, created_at: input.createdAt } };
    } catch (error) {
      if (inTransaction) {
        const rolledBack = this.#rollback(db);
        if (!rolledBack) {
          throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
        }
      }
      if (primarySqliteCode(error) === 19) {
        const raced = this.#selectByKey(db, input.idempotencyKey);
        if (raced !== void 0) {
          if (raced.request_digest === input.digest && raced.content === input.content) {
            return { kind: "replayed", record: toRecord(raced) };
          }
          return { kind: "conflict" };
        }
      }
      throw this.#mapError(error);
    }
  }
  /**
   * Read one record by id.
   * @param id - server-generated id.
   * @returns the record, or undefined.
   */
  getById(id) {
    const db = this.#ensureReady();
    try {
      const row = db.prepare(
        "SELECT id, idempotency_key, request_digest, content, created_at FROM storage_probe_records WHERE id = ?"
      ).get(id);
      return row === void 0 ? void 0 : toRecord(row);
    } catch (error) {
      throw this.#mapError(error);
    }
  }
  /**
   * Test-only transaction probe: insert one row, then force a primary-key
   * failure in the same transaction and roll the whole transaction back.
   * Never registered on an HTTP route.
   * @param input - two ids/keys and content for the controlled failure.
   * @returns the real SQLite error and the post-rollback row count.
   */
  testOnlyTransactionFailure(input) {
    const db = this.#ensureReady();
    db.exec("BEGIN IMMEDIATE");
    let primaryCode;
    let failed = false;
    try {
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.firstId, input.firstKey, createHash2("sha256").update(input.content).digest("hex"), input.content, (/* @__PURE__ */ new Date()).toISOString());
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.firstId, input.failingKey, createHash2("sha256").update(input.content).digest("hex"), input.content, (/* @__PURE__ */ new Date()).toISOString());
    } catch (error) {
      failed = true;
      primaryCode = primarySqliteCode(error);
      if (!this.#rollback(db)) {
        throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      }
    }
    if (!failed) {
      this.#rollback(db);
      throw new RecordsError("INTERNAL_ERROR", "transaction probe did not fail");
    }
    const rows = Number(db.prepare("SELECT count(*) AS count FROM storage_probe_records WHERE id IN (?, ?)").get(input.firstId, input.failingId).count);
    return { rolledBack: primaryCode === 19, primaryCode, rows };
  }
  /**
   * Close the connection once. Idempotent; the database file stays on disk.
   */
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#state = "closed";
    const db = this.#db;
    this.#db = void 0;
    if (db !== void 0) {
      try {
        db.close();
        this.#log("knowledgeos-storage: closed");
      } catch (error) {
        this.#log(`knowledgeos-storage: close failed code=${this.#mapError(error).code}`);
      }
    }
  }
};
export {
  APPLICATION_ID,
  BUSY_TIMEOUT_MS,
  DATABASE_FILENAME,
  MIGRATION_V1,
  MIGRATION_V1_CHECKSUM,
  MIGRATION_V1_SQL,
  PROBE_SCHEMA_VERSION,
  PROBE_SUPPORTED_TABLES,
  MIGRATION_V1 as PRODUCTION_MIGRATION,
  ProbeStorage,
  RecordsError,
  contentDigest,
  createProbeRecord,
  getProbeRecord,
  readDatabaseFacts
};
