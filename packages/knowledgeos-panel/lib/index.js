// src/host/index.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// src/host/status.ts
var EXPECTED_UPSTREAM_COMMIT = "39163dd30f703a79079e2d2446545cff3c453738";
function verifyUpstreamCommit(commit, expected = EXPECTED_UPSTREAM_COMMIT) {
  if (commit === void 0 || commit.length === 0) return null;
  return commit === expected;
}
function buildStatusPayload(observation) {
  const commit = observation.release?.commit;
  const version = observation.release?.version;
  return {
    schema_version: 1,
    product: "KnowledgeOS",
    upstream_commit: commit === void 0 || commit.length === 0 ? "unknown" : commit,
    upstream_version: version === void 0 || version.length === 0 ? "unknown" : version,
    expected_upstream_commit: EXPECTED_UPSTREAM_COMMIT,
    upstream_commit_verified: verifyUpstreamCommit(commit),
    host_instance_id: observation.instanceId,
    started_at: observation.startedAt,
    checked_at: observation.checkedAt,
    status: "ok"
  };
}

// src/host/config.ts
import { isAbsolute } from "node:path";
import Schema from "@deepseek-ai/schemastery";
var Config = Schema.object({
  dataDir: Schema.string()
});
function resolveDataDir(config) {
  if (config.dataDir === void 0) return void 0;
  if (config.dataDir.length === 0) throw new Error("knowledgeos-panel: config.dataDir must not be empty");
  if (!isAbsolute(config.dataDir)) {
    throw new Error("knowledgeos-panel: config.dataDir must be an absolute local path");
  }
  return config.dataDir;
}

// src/host/http.ts
import { randomUUID } from "node:crypto";

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

// src/host/http.ts
var MAX_REQUEST_BODY_BYTES = 16 * 1024;
var MAX_CONTENT_BYTES = 4096;
var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var ApiError = class extends Error {
  status;
  code;
  retryable;
  safeDetails;
  constructor(status, code, message, retryable = false, safeDetails = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.safeDetails = safeDetails;
  }
};
function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  for (const [name2, value] of Object.entries(extraHeaders)) res.setHeader(name2, value);
  res.end(body);
}
function sendApiError(res, requestId, error) {
  sendJson(res, error.status, {
    code: error.code,
    message: error.message,
    request_id: requestId,
    retryable: error.retryable,
    safe_details: error.safeDetails
  }, error.code === "METHOD_NOT_ALLOWED" ? { allow: String(error.safeDetails.allow ?? "") } : {});
}
function recordsErrorToApi(error) {
  switch (error.code) {
    case "STORAGE_BUSY":
      return new ApiError(503, "STORAGE_BUSY", "storage is busy; retry the same request", true);
    case "STORAGE_INCOMPATIBLE":
      return new ApiError(503, "STORAGE_INCOMPATIBLE", "storage is incompatible with this build");
    case "STORAGE_CLOSED":
    case "STORAGE_UNAVAILABLE":
      return new ApiError(503, "STORAGE_UNAVAILABLE", "storage is unavailable");
    default:
      return new ApiError(500, "INTERNAL_ERROR", "internal error");
  }
}
async function readBody(req, limit) {
  return await new Promise((resolve, reject) => {
    let settled = false;
    let total = 0;
    const chunks = [];
    const fail = (error) => {
      if (settled) return;
      settled = true;
      req.resume();
      reject(error);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > limit) {
        fail(new ApiError(413, "PAYLOAD_TOO_LARGE", "request body exceeds the limit"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on("error", () => {
      fail(new ApiError(400, "INVALID_JSON", "request body could not be read"));
    });
    req.on("aborted", () => {
      if (settled) return;
      settled = true;
      reject(new ApiError(400, "INVALID_JSON", "request was aborted"));
    });
  });
}
function requireJsonMediaType(req) {
  const raw = req.headers["content-type"];
  if (typeof raw !== "string") throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  const parts = raw.split(";").map((part) => part.trim().toLowerCase());
  if (parts[0] !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }
  const charset = parts.slice(1).find((part) => part.startsWith("charset="));
  if (charset !== void 0 && charset !== "charset=utf-8") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type charset must be utf-8");
  }
}
function requireIdempotencyKey(req) {
  const raw = req.headers["idempotency-key"];
  if (typeof raw !== "string" || !UUID_PATTERN.test(raw)) {
    throw new ApiError(422, "INPUT_INVALID", "Idempotency-Key must be a canonical lowercase UUID");
  }
  return raw;
}
function parseContent(body) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "request body is not valid UTF-8");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "request body is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ApiError(422, "INPUT_INVALID", "body must be a JSON object");
  }
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== "content") {
    throw new ApiError(422, "INPUT_INVALID", "body may contain only the content field");
  }
  const content = parsed.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new ApiError(422, "INPUT_INVALID", "content must be a non-empty string");
  }
  if (!content.isWellFormed()) {
    throw new ApiError(422, "INPUT_INVALID", "content must not contain lone Unicode surrogates");
  }
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes < 1 || bytes > MAX_CONTENT_BYTES) {
    throw new ApiError(422, "INPUT_INVALID", `content must be 1-${MAX_CONTENT_BYTES} UTF-8 bytes`);
  }
  return content;
}
function requestPath(req) {
  return new URL(req.url ?? "/", "http://localhost").pathname;
}
function createRecordsHandlers(service, basePath, log) {
  const create = async (req, res) => {
    const requestId = randomUUID();
    try {
      if (req.method !== "POST") {
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "method not allowed", false, { allow: "POST" });
      }
      requireJsonMediaType(req);
      const key = requireIdempotencyKey(req);
      const body = await readBody(req, MAX_REQUEST_BODY_BYTES);
      const content = parseContent(body);
      const result = service.create(key, content);
      if (result.kind === "conflict") {
        throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "idempotency key was used with different content");
      }
      sendJson(res, result.kind === "created" ? 201 : 200, {
        data: result.record,
        meta: { request_id: requestId, schema_version: 1 }
      });
    } catch (error) {
      if (res.writableEnded) return;
      if (error instanceof ApiError) {
        sendApiError(res, requestId, error);
        return;
      }
      if (error instanceof RecordsError) {
        sendApiError(res, requestId, recordsErrorToApi(error));
        return;
      }
      log(`knowledgeos-storage: request failed request_id=${requestId}`);
      sendApiError(res, requestId, new ApiError(500, "INTERNAL_ERROR", "internal error"));
    }
  };
  const read = async (req, res) => {
    const requestId = randomUUID();
    try {
      if (req.method !== "GET") {
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "method not allowed", false, { allow: "GET" });
      }
      const path = requestPath(req);
      const prefix = `${basePath}/`;
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) {
        throw new ApiError(404, "NOT_FOUND", "record not found");
      }
      const id = path.slice(prefix.length);
      if (!UUID_PATTERN.test(id)) {
        throw new ApiError(422, "INPUT_INVALID", "record id must be a canonical lowercase UUID");
      }
      const record = service.get(id);
      if (record === void 0) throw new ApiError(404, "NOT_FOUND", "record not found");
      sendJson(res, 200, {
        data: record,
        meta: { request_id: requestId, schema_version: 1 }
      });
    } catch (error) {
      if (res.writableEnded) return;
      if (error instanceof ApiError) {
        sendApiError(res, requestId, error);
        return;
      }
      if (error instanceof RecordsError) {
        sendApiError(res, requestId, recordsErrorToApi(error));
        return;
      }
      log(`knowledgeos-storage: request failed request_id=${requestId}`);
      sendApiError(res, requestId, new ApiError(500, "INTERNAL_ERROR", "internal error"));
    }
  };
  return { create, read };
}

// src/host/storage.ts
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash as createHash2 } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
var APPLICATION_ID = 1263489841;
var SCHEMA_VERSION = 1;
var PROBE_SUPPORTED_TABLES = ["schema_migrations", "storage_probe_records"];
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
function readDatabaseFacts(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const applicationId = Number(db.prepare("PRAGMA application_id").get()?.application_id ?? 0);
    const userVersion = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
    let ledger = [];
    if (tables.includes("schema_migrations")) {
      ledger = db.prepare("SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version").all();
    }
    return { applicationId, userVersion, tables, ledger };
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
    if (facts.applicationId === 0 && facts.userVersion === 0 && facts.tables.length === 0) return "blank";
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
    if (facts.tables.length !== expected.length || facts.tables.some((name2, index) => name2 !== expected[index])) {
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
    db.exec("PRAGMA busy_timeout=250");
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
      if (!committed) this.#rollback(db, error);
      throw error instanceof RecordsError ? error : new RecordsError("STORAGE_INCOMPATIBLE", "storage migration failed", false, { cause: error });
    }
  }
  #verify(db) {
    const applicationId = Number(db.prepare("PRAGMA application_id").get()?.application_id ?? 0);
    const userVersion = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
    const ledger = tables.includes("schema_migrations") ? db.prepare("SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version").all().map((row) => ({ version: Number(row.version), checksum: String(row.checksum), applied_at: String(row.applied_at) })) : [];
    this.#assertKnownSchema({ applicationId, userVersion, tables, ledger });
  }
  #rollback(db, original) {
    try {
      db.exec("ROLLBACK");
    } catch (rollbackError) {
      this.#state = "unavailable";
      this.#failure = new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: rollbackError });
      this.#log("knowledgeos-storage: rollback failed; writes disabled");
      void original;
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
      if (inTransaction) this.#rollback(db, error);
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
    try {
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.firstId, input.firstKey, createHash2("sha256").update(input.content).digest("hex"), input.content, (/* @__PURE__ */ new Date()).toISOString());
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.firstId, input.failingKey, createHash2("sha256").update(input.content).digest("hex"), input.content, (/* @__PURE__ */ new Date()).toISOString());
    } catch (error) {
      primaryCode = primarySqliteCode(error);
      db.exec("ROLLBACK");
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

// src/host/index.ts
var name = "knowledgeos-panel";
var inject = ["webServer", "clientModules"];
var STATUS_PATH = "/knowledgeos/status";
var RECORDS_PATH = "/knowledgeos/foundation/records";
var RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff"
};
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function apply(ctx, config = {}) {
  const instanceId = globalThis.crypto.randomUUID();
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const log = (message) => {
    console.log(message);
  };
  ctx.effect(() => {
    const readRelease = () => {
      try {
        return ctx.clientModules.graph().release;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`knowledgeos-panel: reading host release failed: ${message}`);
        return void 0;
      }
    };
    return ctx.webServer.register({
      kind: "exact",
      path: STATUS_PATH,
      auth: "required",
      resource: async () => {
        const payload = buildStatusPayload({
          release: readRelease(),
          instanceId,
          startedAt,
          checkedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        return new Response(JSON.stringify(payload), { status: 200, headers: RESPONSE_HEADERS });
      }
    });
  }, "knowledgeos-panel: read-only status route");
  const dataDir = resolveDataDir(config);
  const storage = dataDir === void 0 ? void 0 : new ProbeStorage({
    dataDir,
    log
  });
  if (storage === void 0) log("knowledgeos-storage: unconfigured");
  let closing = false;
  const inFlight = /* @__PURE__ */ new Set();
  const service = {
    create(idempotencyKey, content) {
      if (closing) throw new RecordsError("STORAGE_CLOSED", "storage is closing");
      if (storage === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "storage is not configured");
      return createProbeRecord(storage, {
        newId: () => randomUUID2(),
        now: () => (/* @__PURE__ */ new Date()).toISOString()
      }, { idempotencyKey, content });
    },
    get(id) {
      if (closing) throw new RecordsError("STORAGE_CLOSED", "storage is closing");
      if (storage === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "storage is not configured");
      return getProbeRecord(storage, id);
    }
  };
  const handlers = createRecordsHandlers(service, RECORDS_PATH, log);
  const wrap = (handler) => {
    return (req, res) => {
      const pending = handler(req, res);
      inFlight.add(pending);
      void pending.finally(() => {
        inFlight.delete(pending);
      });
      return pending;
    };
  };
  ctx.effect(() => {
    const disposeCreate = ctx.webServer.register({
      kind: "exact",
      path: RECORDS_PATH,
      auth: "required",
      handler: wrap(handlers.create)
    });
    const disposeRead = ctx.webServer.register({
      kind: "prefix",
      path: RECORDS_PATH,
      auth: "required",
      handler: wrap(handlers.read)
    });
    return async () => {
      closing = true;
      disposeCreate();
      disposeRead();
      if (inFlight.size > 0) {
        await Promise.race([Promise.allSettled([...inFlight]), wait(5e3)]);
      }
      storage?.close();
    };
  }, "knowledgeos-storage: records routes and connection");
}
export {
  Config,
  RECORDS_PATH,
  STATUS_PATH,
  apply,
  inject,
  name
};
