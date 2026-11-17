// src/host/index.ts
import { randomUUID as randomUUID5 } from "node:crypto";

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
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
var APPLICATION_ID = 1263489841;
var SCHEMA_VERSION = 2;
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
var MIGRATION_V2_SQL = `CREATE TABLE password_credentials (
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
`;
var MIGRATION_V2_CHECKSUM = createHash2("sha256").update(Buffer.from(MIGRATION_V2_SQL, "utf8")).digest("hex");
var PROBE_SUPPORTED_TABLES = ["schema_migrations", "storage_probe_records"];
var IDENTITY_SUPPORTED_TABLES = [
  "auth_sessions",
  "password_credentials",
  "schema_migrations",
  "service_identity",
  "spaces",
  "storage_probe_records",
  "users"
];
var MIGRATION_V1 = { version: 1, sql: MIGRATION_V1_SQL, checksum: MIGRATION_V1_CHECKSUM };
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
    const ledger = tables.includes("schema_migrations") ? db.prepare("SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version").all() : [];
    return { applicationId, userVersion, tables, objects, ledger };
  } finally {
    db.close();
  }
}
function rowProfile(row) {
  return {
    id: String(row.id),
    loginName: String(row.login_name),
    displayName: String(row.display_name),
    role: String(row.role),
    status: String(row.status),
    timezone: String(row.timezone),
    planningHomeServiceId: String(row.planning_home_service_id),
    domains: JSON.parse(String(row.domains)),
    learningTracks: JSON.parse(String(row.learning_tracks)),
    goalText: String(row.goal_text),
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    personalSpaceId: String(row.personal_space_id)
  };
}
var ProbeStorage = class {
  #dataDir;
  #log;
  #migrationOverride;
  #db;
  #state = "unavailable";
  #failure;
  #closed = false;
  constructor(options) {
    this.#dataDir = options.dataDir;
    this.#log = options.log ?? (() => {
    });
    this.#migrationOverride = options.migrationOverride;
    this.#open();
  }
  get available() {
    return this.#state === "ready";
  }
  get failure() {
    return this.#failure;
  }
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
      if (existing === "blank") {
        this.#migrateV1(db);
        this.#migrateV2(db);
      } else if (existing === "v1") {
        this.#migrateV2(db);
      }
      this.#verify(db);
      const facts = readDatabaseFacts(path);
      const pragmas = this.#readPragmas(db);
      this.#db = db;
      this.#state = "ready";
      this.#log(`knowledgeos-storage: opened node=${process.versions.node} sqlite=${pragmas.sqliteVersion} journal=${pragmas.journalMode} foreign_keys=${pragmas.foreignKeys} synchronous=${pragmas.synchronous} busy_timeout=${pragmas.busyTimeout} tables=${facts.tables.length}`);
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
    if (facts.applicationId !== APPLICATION_ID) throw new RecordsError("STORAGE_INCOMPATIBLE", "database belongs to another application");
    if (facts.userVersion > SCHEMA_VERSION) throw new RecordsError("STORAGE_INCOMPATIBLE", "database schema is newer than this build");
    if (facts.userVersion === 1) {
      this.#assertV1Schema(facts);
      return "v1";
    }
    if (facts.userVersion === 2) {
      this.#assertV2Schema(facts);
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        this.#assertV2Definitions(db);
      } finally {
        db.close();
      }
      return "v2";
    }
    throw new RecordsError("STORAGE_INCOMPATIBLE", "database schema version is not supported");
  }
  #assertV1Schema(facts) {
    const expected = [...PROBE_SUPPORTED_TABLES].sort();
    const actual = facts.objects.filter((object) => object.type === "table").map((object) => object.name).sort();
    if (facts.objects.some((object) => object.type !== "table") || actual.join(",") !== expected.join(",")) throw new RecordsError("STORAGE_INCOMPATIBLE", "database contains an unknown v1 schema");
    const entry = facts.ledger[0];
    if (facts.ledger.length !== 1 || entry?.version !== 1 || entry.checksum !== MIGRATION_V1_CHECKSUM) throw new RecordsError("STORAGE_INCOMPATIBLE", "v1 migration ledger does not match this build");
  }
  #assertV2Schema(facts) {
    const expected = [...IDENTITY_SUPPORTED_TABLES].sort();
    const actual = facts.objects.filter((object) => object.type === "table").map((object) => object.name).sort();
    if (facts.objects.some((object) => object.type !== "table") || actual.join(",") !== expected.join(",")) throw new RecordsError("STORAGE_INCOMPATIBLE", "database contains an unknown v2 schema");
    const v1 = facts.ledger.find((entry) => entry.version === 1);
    const v2 = facts.ledger.find((entry) => entry.version === 2);
    if (facts.ledger.length !== 2 || v1?.checksum !== MIGRATION_V1_CHECKSUM || v2?.checksum !== MIGRATION_V2_CHECKSUM) throw new RecordsError("STORAGE_INCOMPATIBLE", "v2 migration ledger does not match this build");
  }
  #assertV2Definitions(db) {
    const definitions = new Map(db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all().map((row) => [row.name, row.sql ?? ""]));
    const expectedColumns = {
      password_credentials: ["id", "algorithm", "version", "n", "r", "p", "maxmem", "salt", "derived_key", "created_at"],
      users: ["id", "login_name", "display_name", "credential_ref", "role", "status", "timezone", "planning_home_service_id", "domains", "learning_tracks", "goal_text", "revision", "created_at", "updated_at"],
      service_identity: ["id", "service_id", "bootstrap_admin_user_id", "initialized_at"],
      auth_sessions: ["id", "user_id", "token_hash", "created_at", "expires_at", "revoked_at"],
      spaces: ["id", "service_id", "kind", "owner_user_id", "status", "revision", "created_at", "updated_at"]
    };
    for (const [table, columns] of Object.entries(expectedColumns)) {
      const actual = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
      if (actual.join(",") !== columns.join(",")) throw new RecordsError("STORAGE_INCOMPATIBLE", `v2 table definition is not accepted: ${table}`);
    }
    const requiredFragments = [
      ["users", "REFERENCES password_credentials"],
      ["users", "CHECK (role IN ('admin', 'member'))"],
      ["users", "CHECK (status IN ('active', 'disabled'))"],
      ["auth_sessions", "REFERENCES users"],
      ["auth_sessions", "token_hash TEXT NOT NULL UNIQUE"],
      ["spaces", "REFERENCES service_identity(service_id)"],
      ["spaces", "REFERENCES users(id)"],
      ["spaces", "CHECK (kind = 'personal')"],
      ["service_identity", "CHECK (id = 1)"],
      ["password_credentials", "derived_key BLOB NOT NULL"]
    ];
    for (const [table, fragment] of requiredFragments) if (!definitions.get(table)?.includes(fragment)) throw new RecordsError("STORAGE_INCOMPATIBLE", `v2 constraint definition is not accepted: ${table}`);
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
  #migrateV1(db) {
    const plan = this.#migrationOverride?.version === 1 ? this.#migrationOverride : MIGRATION_V1;
    let committed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(plan.sql);
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(plan.version, plan.checksum, (/* @__PURE__ */ new Date()).toISOString());
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      db.exec("PRAGMA user_version = 1");
      db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed) this.#rollback(db);
      throw error instanceof RecordsError ? error : new RecordsError("STORAGE_INCOMPATIBLE", "storage migration failed", false, { cause: error });
    }
  }
  #migrateV2(db) {
    let committed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_V2_SQL);
      db.prepare("INSERT INTO service_identity (id, service_id, bootstrap_admin_user_id, initialized_at) VALUES (1, ?, NULL, NULL)").run(randomUUID2());
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(2, MIGRATION_V2_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      db.exec("PRAGMA user_version = 2");
      db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed) {
        const rolledBack = this.#rollback(db);
        if (!rolledBack) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      }
      throw error instanceof RecordsError ? error : new RecordsError("STORAGE_INCOMPATIBLE", "identity migration failed", false, { cause: error });
    }
  }
  #verify(db) {
    const facts = readDatabaseFacts(this.databasePath);
    if (facts.applicationId !== APPLICATION_ID || facts.userVersion !== 2) throw new RecordsError("STORAGE_INCOMPATIBLE", "database ownership/version verification failed");
    this.#assertV2Schema(facts);
    this.#assertV2Definitions(db);
    const identity = db.prepare("SELECT id, service_id, bootstrap_admin_user_id, initialized_at FROM service_identity").all();
    if (identity.length !== 1 || Number(identity[0]?.id) !== 1 || typeof identity[0]?.service_id !== "string") throw new RecordsError("STORAGE_INCOMPATIBLE", "service identity is not a singleton");
  }
  #rollback(db) {
    try {
      db.exec("ROLLBACK");
      return true;
    } catch (error) {
      this.#state = "unavailable";
      this.#failure = new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      return false;
    }
  }
  #ensureReady() {
    if (this.#state === "closed") throw new RecordsError("STORAGE_CLOSED", "storage is closed");
    if (this.#state !== "ready" || this.#db === void 0) throw this.#failure ?? new RecordsError("STORAGE_UNAVAILABLE", "storage is unavailable");
    return this.#db;
  }
  #mapError(error) {
    if (error instanceof RecordsError) return error;
    const primary = primarySqliteCode(error);
    if (primary === 5) return new RecordsError("STORAGE_BUSY", "storage is busy", true, { cause: error });
    if (primary === 8 || primary === 14) return new RecordsError("STORAGE_UNAVAILABLE", "storage is not writable", false, { cause: error });
    return new RecordsError("STORAGE_UNAVAILABLE", "storage operation failed", false, { cause: error });
  }
  #selectByKey(db, key) {
    return db.prepare("SELECT id, idempotency_key, request_digest, content, created_at FROM storage_probe_records WHERE idempotency_key = ?").get(key);
  }
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
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.id, input.idempotencyKey, input.digest, input.content, input.createdAt);
      db.exec("COMMIT");
      inTransaction = false;
      return { kind: "created", record: { id: input.id, content: input.content, created_at: input.createdAt } };
    } catch (error) {
      if (inTransaction && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      if (primarySqliteCode(error) === 19) {
        const raced = this.#selectByKey(db, input.idempotencyKey);
        if (raced !== void 0) return raced.request_digest === input.digest && raced.content === input.content ? { kind: "replayed", record: toRecord(raced) } : { kind: "conflict" };
      }
      throw this.#mapError(error);
    }
  }
  getById(id) {
    const db = this.#ensureReady();
    try {
      const row = db.prepare("SELECT id, idempotency_key, request_digest, content, created_at FROM storage_probe_records WHERE id = ?").get(id);
      return row === void 0 ? void 0 : toRecord(row);
    } catch (error) {
      throw this.#mapError(error);
    }
  }
  getSetupState() {
    const db = this.#ensureReady();
    const row = db.prepare("SELECT service_id, bootstrap_admin_user_id, initialized_at FROM service_identity WHERE id = 1").get();
    return { serviceId: String(row.service_id), initialized: row.initialized_at !== null && row.initialized_at !== void 0, initializedAt: row.initialized_at === null || row.initialized_at === void 0 ? void 0 : String(row.initialized_at), bootstrapAdminUserId: row.bootstrap_admin_user_id === null || row.bootstrap_admin_user_id === void 0 ? void 0 : String(row.bootstrap_admin_user_id) };
  }
  #profileByUser(db, userId) {
    const row = db.prepare(`SELECT u.*, s.id AS personal_space_id FROM users u JOIN spaces s ON s.owner_user_id = u.id AND s.kind = 'personal' WHERE u.id = ?`).get(userId);
    return row === void 0 ? void 0 : rowProfile(row);
  }
  bootstrap(input) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      const state = db.prepare("SELECT service_id, initialized_at FROM service_identity WHERE id = 1").get();
      if (state.initialized_at !== null && state.initialized_at !== void 0) {
        db.exec("ROLLBACK");
        tx = false;
        return { kind: "already_initialized" };
      }
      const serviceId = String(state.service_id);
      const now = input.now;
      const userId = randomUUID2();
      const spaceId = randomUUID2();
      const credentialId = randomUUID2();
      db.prepare("INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(credentialId, input.credential.algorithm, input.credential.version, input.credential.n, input.credential.r, input.credential.p, input.credential.maxmem, input.credential.salt, input.credential.derivedKey, now);
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?, ?, ?, ?, 1, ?, ?)`).run(userId, input.loginName, input.displayName, credentialId, input.timezone, serviceId, JSON.stringify(input.domains), JSON.stringify(input.learningTracks), input.goalText, now, now);
      db.prepare(`INSERT INTO spaces (id, service_id, kind, owner_user_id, status, revision, created_at, updated_at) VALUES (?, ?, 'personal', ?, 'active', 1, ?, ?)`).run(spaceId, serviceId, userId, now, now);
      db.prepare("UPDATE service_identity SET bootstrap_admin_user_id = ?, initialized_at = ? WHERE id = 1 AND initialized_at IS NULL").run(userId, now);
      db.exec("COMMIT");
      tx = false;
      const user = this.#profileByUser(db, userId);
      if (user === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "created administrator could not be read");
      return { kind: "created", user };
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      if (primarySqliteCode(error) === 19) return { kind: "already_initialized" };
      throw this.#mapError(error);
    }
  }
  register(input) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      const state = db.prepare("SELECT service_id, initialized_at FROM service_identity WHERE id = 1").get();
      if (state.initialized_at === null || state.initialized_at === void 0) {
        db.exec("ROLLBACK");
        tx = false;
        return { kind: "setup_required" };
      }
      const serviceId = String(state.service_id);
      const now = input.now;
      const userId = randomUUID2();
      const spaceId = randomUUID2();
      const credentialId = randomUUID2();
      db.prepare("INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(credentialId, input.credential.algorithm, input.credential.version, input.credential.n, input.credential.r, input.credential.p, input.credential.maxmem, input.credential.salt, input.credential.derivedKey, now);
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, ?, ?, ?, 1, ?, ?)`).run(userId, input.loginName, input.displayName, credentialId, input.timezone, serviceId, JSON.stringify(input.domains), JSON.stringify(input.learningTracks), input.goalText, now, now);
      db.prepare(`INSERT INTO spaces (id, service_id, kind, owner_user_id, status, revision, created_at, updated_at) VALUES (?, ?, 'personal', ?, 'active', 1, ?, ?)`).run(spaceId, serviceId, userId, now, now);
      db.exec("COMMIT");
      tx = false;
      const user = this.#profileByUser(db, userId);
      if (user === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "created user could not be read");
      return { kind: "created", user };
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      if (primarySqliteCode(error) === 19) {
        const exists = db.prepare("SELECT 1 AS value FROM users WHERE login_name = ?").get(input.loginName);
        if (exists !== void 0) return { kind: "login_name_taken" };
      }
      throw this.#mapError(error);
    }
  }
  findLogin(loginName) {
    const db = this.#ensureReady();
    const row = db.prepare(`SELECT u.id, u.login_name, u.status, u.role, u.timezone, u.display_name, u.credential_ref, c.algorithm, c.version, c.n, c.r, c.p, c.maxmem, c.salt, c.derived_key FROM users u JOIN password_credentials c ON c.id = u.credential_ref WHERE u.login_name = ?`).get(loginName);
    if (row === void 0) return void 0;
    return { userId: String(row.id), loginName: String(row.login_name), displayName: String(row.display_name), role: String(row.role), status: String(row.status), timezone: String(row.timezone), credential: { algorithm: String(row.algorithm), version: Number(row.version), n: Number(row.n), r: Number(row.r), p: Number(row.p), maxmem: Number(row.maxmem), salt: Buffer.from(row.salt), derivedKey: Buffer.from(row.derived_key) } };
  }
  createSession(input) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      if (input.revokeTokenHash !== void 0) db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?").run(input.createdAt, input.revokeTokenHash, input.createdAt);
      db.prepare("INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)").run(input.sessionId, input.userId, input.tokenHash, input.createdAt, input.expiresAt);
      db.exec("COMMIT");
      tx = false;
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw this.#mapError(error);
    }
  }
  findActor(tokenHash2, now) {
    const db = this.#ensureReady();
    const row = db.prepare(`SELECT s.id AS session_id, u.id AS user_id, u.role, u.status, u.planning_home_service_id AS service_id, p.id AS personal_space_id FROM auth_sessions s JOIN users u ON u.id = s.user_id JOIN spaces p ON p.owner_user_id = u.id AND p.kind = 'personal' WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active' AND p.status = 'active'`).get(tokenHash2, now);
    if (row === void 0) return void 0;
    return { sessionId: String(row.session_id), userId: String(row.user_id), role: String(row.role), serviceId: String(row.service_id), personalSpaceId: String(row.personal_space_id) };
  }
  revokeSession(tokenHash2, now) {
    const db = this.#ensureReady();
    const result = db.prepare("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?").run(now, tokenHash2);
    return Number(result.changes) > 0;
  }
  getProfile(userId) {
    return this.#profileByUser(this.#ensureReady(), userId);
  }
  getSpaces(userId) {
    const db = this.#ensureReady();
    return db.prepare(`SELECT id, service_id, kind, owner_user_id, status, revision, created_at, updated_at FROM spaces WHERE owner_user_id = ? AND kind = 'personal' AND status = 'active'`).all(userId).map((row) => ({ id: String(row.id), serviceId: String(row.service_id), kind: "personal", ownerUserId: String(row.owner_user_id), status: String(row.status), revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
  }
  updatePreferences(userId, expectedRevision, patch, now) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      const current = this.#profileByUser(db, userId);
      if (current === void 0) {
        db.exec("ROLLBACK");
        tx = false;
        return { kind: "conflict" };
      }
      const next = { ...current, ...patch, revision: current.revision + 1, updatedAt: now };
      const result = db.prepare("UPDATE users SET display_name = ?, timezone = ?, domains = ?, learning_tracks = ?, goal_text = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?").run(next.displayName, next.timezone, JSON.stringify(next.domains), JSON.stringify(next.learningTracks), next.goalText, next.revision, now, userId, expectedRevision);
      if (Number(result.changes) !== 1) {
        db.exec("ROLLBACK");
        tx = false;
        return { kind: "conflict", user: this.#profileByUser(db, userId) };
      }
      db.exec("COMMIT");
      tx = false;
      const updated = this.#profileByUser(db, userId);
      if (updated === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "updated user could not be read");
      return { kind: "updated", user: updated };
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw this.#mapError(error);
    }
  }
  /** Test-only transaction probe for FND-003 rollback evidence. */
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
      if (!this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
    }
    if (!failed) {
      this.#rollback(db);
      throw new RecordsError("INTERNAL_ERROR", "transaction probe did not fail");
    }
    const rows = Number(db.prepare("SELECT count(*) AS count FROM storage_probe_records WHERE id IN (?, ?)").get(input.firstId, input.failingId).count);
    return { rolledBack: primaryCode === 19, primaryCode, rows };
  }
  /** Test-only identity transaction probe; never reachable from HTTP/config. */
  testOnlyIdentityTransactionFailure(input) {
    const db = this.#ensureReady();
    let primaryCode;
    let failed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      const state = db.prepare("SELECT service_id FROM service_identity WHERE id = 1").get();
      db.prepare("INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(input.credentialId, "scrypt", 1, 131072, 8, 1, 192 * 1024 * 1024, Buffer.alloc(16, 1), Buffer.alloc(32, 2), input.now);
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, '[]', '[]', '', 1, ?, ?)`).run(input.userId, input.loginName, "fixture", input.credentialId, "Asia/Shanghai", state.service_id, input.now, input.now);
      db.prepare("INSERT INTO password_credentials (id, algorithm, version, n, r, p, maxmem, salt, derived_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(input.duplicateCredentialId, "scrypt", 1, 131072, 8, 1, 192 * 1024 * 1024, Buffer.alloc(16, 3), Buffer.alloc(32, 4), input.now);
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, '[]', '[]', '', 1, ?, ?)`).run(input.duplicateUserId, input.loginName, "duplicate", input.duplicateCredentialId, "Asia/Shanghai", state.service_id, input.now, input.now);
    } catch (error) {
      failed = true;
      primaryCode = primarySqliteCode(error);
      if (!this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
    }
    if (!failed) {
      this.#rollback(db);
      throw new RecordsError("INTERNAL_ERROR", "identity transaction probe did not fail");
    }
    const users = Number(db.prepare("SELECT count(*) AS count FROM users WHERE id IN (?, ?)").get(input.userId, input.duplicateUserId).count);
    const credentials = Number(db.prepare("SELECT count(*) AS count FROM password_credentials WHERE id IN (?, ?)").get(input.credentialId, input.duplicateCredentialId).count);
    const spaces = Number(db.prepare("SELECT count(*) AS count FROM spaces WHERE owner_user_id IN (?, ?)").get(input.userId, input.duplicateUserId).count);
    const identity = db.prepare("SELECT initialized_at FROM service_identity WHERE id = 1").get();
    return { rolledBack: primaryCode === 19, primaryCode, users, credentials, spaces, initialized: identity.initialized_at !== null };
  }
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

// src/host/identity.ts
import { createHash as createHash3, randomBytes, randomUUID as randomUUID3, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
var DOMAINS = ["software_engineering", "system_architecture", "hardware_engineering", "ai_development"];
var LEARNING_TRACKS = ["engineering_practice", "architecture_exam", "knowledge_accumulation"];
var DEFAULT_TIMEZONE = "Asia/Shanghai";
var SESSION_TTL_MS = 12 * 60 * 60 * 1e3;
var MAX_REQUEST_BODY_BYTES2 = 16 * 1024;
var KDF_CONFIG = {
  algorithm: "scrypt",
  version: 1,
  n: 131072,
  r: 8,
  p: 1,
  maxmem: 192 * 1024 * 1024,
  keyLen: 32,
  saltBytes: 16
};
var IdentityError = class extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = "IdentityError";
  }
};
function normalizeLoginName(value) {
  return value.trim().toLowerCase();
}
function validateLoginName(value) {
  if (typeof value !== "string") throw new IdentityError("INPUT_INVALID", "login_name must be a string");
  const normalized = normalizeLoginName(value);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) throw new IdentityError("INPUT_INVALID", "login_name must be 3-64 ASCII characters");
  return normalized;
}
function validateDisplayName(value) {
  if (typeof value !== "string" || !value.isWellFormed()) throw new IdentityError("INPUT_INVALID", "display_name is invalid");
  const count = [...value].length;
  if (count < 1 || count > 80 || Buffer.byteLength(value, "utf8") > 320) throw new IdentityError("INPUT_INVALID", "display_name length is invalid");
  return value;
}
function validatePassword(value) {
  if (typeof value !== "string" || !value.isWellFormed()) throw new IdentityError("INPUT_INVALID", "password is invalid");
  const count = [...value].length;
  if (count < 15 || count > 128 || Buffer.byteLength(value, "utf8") > 512) throw new IdentityError("INPUT_INVALID", "password length is invalid");
  return value;
}
function validateTimezone(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) throw new IdentityError("INPUT_INVALID", "timezone is invalid");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw new IdentityError("INPUT_INVALID", "timezone is invalid");
  }
  return value;
}
function validateEnumList(value, allowed, label) {
  if (!Array.isArray(value) || value.length > allowed.length || value.some((item) => typeof item !== "string" || !allowed.includes(item))) throw new IdentityError("INPUT_INVALID", `${label} is invalid`);
  const unique = [...new Set(value)];
  if (unique.length !== value.length) throw new IdentityError("INPUT_INVALID", `${label} contains duplicates`);
  return unique;
}
function validateDomains(value) {
  return validateEnumList(value, DOMAINS, "domains");
}
function validateLearningTracks(value) {
  return validateEnumList(value, LEARNING_TRACKS, "learning_tracks");
}
function validateGoalText(value) {
  if (typeof value !== "string" || !value.isWellFormed() || Buffer.byteLength(value, "utf8") > 2e3) throw new IdentityError("INPUT_INVALID", "goal_text is invalid");
  return value;
}
function validateExpectedRevision(value) {
  if (!Number.isInteger(value) || Number(value) < 1) throw new IdentityError("INPUT_INVALID", "expected_revision is invalid");
  return Number(value);
}
function tokenHash(token) {
  return createHash3("sha256").update(token, "utf8").digest("hex");
}
function makeToken() {
  return randomBytes(32).toString("base64url");
}
var KdfScheduler = class {
  #maxRunning = 2;
  #maxQueued = 8;
  #running = 0;
  #queue = [];
  #closing = false;
  get running() {
    return this.#running;
  }
  get queued() {
    return this.#queue.length;
  }
  async derive(password, salt, signal) {
    if (this.#closing) throw new IdentityError("STORAGE_UNAVAILABLE", "password service is closing", true);
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (this.#running >= this.#maxRunning && this.#queue.length >= this.#maxQueued) throw new IdentityError("AUTH_RATE_LIMITED", "authentication work is busy", true);
    if (this.#running < this.#maxRunning) return await this.#start(password, salt, signal);
    return await new Promise((resolve, reject) => {
      const item = { password, salt, signal, resolve, reject };
      this.#queue.push(item);
      const onAbort = () => {
        const index = this.#queue.indexOf(item);
        if (index !== -1) {
          this.#queue.splice(index, 1);
          reject(new DOMException("aborted", "AbortError"));
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  async #start(password, salt, signal) {
    this.#running += 1;
    try {
      return await new Promise((resolve, reject) => {
        nodeScrypt(password, salt, KDF_CONFIG.keyLen, { N: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem }, (error, derived) => {
          if (error) reject(error);
          else resolve(derived);
        });
      });
    } finally {
      this.#running -= 1;
      const next = this.#queue.shift();
      if (next !== void 0) {
        if (next.signal?.aborted) next.reject(new DOMException("aborted", "AbortError"));
        else void this.#start(next.password, next.salt, next.signal).then(next.resolve, next.reject);
      }
    }
  }
  async close() {
    this.#closing = true;
    for (const item of this.#queue.splice(0)) item.reject(new DOMException("aborted", "AbortError"));
    while (this.#running > 0) await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
async function derivePassword(scheduler, password, signal) {
  const salt = randomBytes(KDF_CONFIG.saltBytes);
  const derivedKey = await scheduler.derive(password, salt, signal);
  return { algorithm: KDF_CONFIG.algorithm, version: KDF_CONFIG.version, n: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem, salt, derivedKey };
}
async function verifyPassword(scheduler, password, credential, signal) {
  if (credential.algorithm !== KDF_CONFIG.algorithm || credential.version !== KDF_CONFIG.version || credential.n !== KDF_CONFIG.n || credential.r !== KDF_CONFIG.r || credential.p !== KDF_CONFIG.p || credential.maxmem !== KDF_CONFIG.maxmem || credential.salt.length !== KDF_CONFIG.saltBytes || credential.derivedKey.length !== KDF_CONFIG.keyLen) return false;
  const derived = await scheduler.derive(password, credential.salt, signal);
  return derived.length === credential.derivedKey.length && timingSafeEqual(derived, credential.derivedKey);
}
var AuthRateLimiter = class {
  #byLogin = /* @__PURE__ */ new Map();
  #bySource = /* @__PURE__ */ new Map();
  #maxKeys = 4096;
  #prune(map, now, windowMs) {
    for (const [key, bucket] of map) if (now - bucket.windowStarted >= windowMs) map.delete(key);
  }
  #bound(map) {
    while (map.size > this.#maxKeys) {
      const key = map.keys().next().value;
      if (key === void 0) break;
      map.delete(key);
    }
  }
  check(loginName, source, now = Date.now()) {
    this.#prune(this.#byLogin, now, 15 * 60 * 1e3);
    this.#prune(this.#bySource, now, 60 * 1e3);
    const account = this.#byLogin.get(loginName);
    const client = this.#bySource.get(source);
    if ((account?.count ?? 0) >= 5 || (client?.count ?? 0) >= 30) throw new IdentityError("AUTH_RATE_LIMITED", "authentication attempts are temporarily limited", true);
  }
  failure(loginName, source, now = Date.now()) {
    const bump = (map, key, windowMs) => {
      const current = map.get(key);
      if (current === void 0 || now - current.windowStarted >= windowMs) map.set(key, { count: 1, windowStarted: now });
      else current.count += 1;
    };
    bump(this.#byLogin, loginName, 15 * 60 * 1e3);
    bump(this.#bySource, source, 60 * 1e3);
    this.#bound(this.#byLogin);
    this.#bound(this.#bySource);
  }
};
var IdentityService = class {
  #store;
  #kdf;
  #limiter;
  constructor(store, options = {}) {
    this.#store = store;
    this.#kdf = options.kdf ?? new KdfScheduler();
    this.#limiter = options.limiter ?? new AuthRateLimiter();
  }
  get setupState() {
    return this.#store.getSetupState();
  }
  get scheduler() {
    return this.#kdf;
  }
  async bootstrap(input) {
    const loginName = validateLoginName(input.loginName);
    const displayName = validateDisplayName(input.displayName);
    const password = validatePassword(input.password);
    const timezone = validateTimezone(input.timezone ?? DEFAULT_TIMEZONE);
    const domains = validateDomains(input.domains ?? []);
    const learningTracks = validateLearningTracks(input.learningTracks ?? []);
    const goalText = validateGoalText(input.goalText ?? "");
    this.#limiter.check(loginName, input.source ?? "bootstrap");
    const credential = await derivePassword(this.#kdf, password, input.signal);
    if (input.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const result = this.#store.bootstrap({ loginName, displayName, timezone, domains, learningTracks, goalText, now: (/* @__PURE__ */ new Date()).toISOString(), credential });
    if (result.kind === "already_initialized") throw new IdentityError("ALREADY_INITIALIZED", "service is already initialized");
    return result.user;
  }
  async register(input) {
    const loginName = validateLoginName(input.loginName);
    const displayName = validateDisplayName(input.displayName);
    const password = validatePassword(input.password);
    const timezone = validateTimezone(input.timezone ?? DEFAULT_TIMEZONE);
    const domains = validateDomains(input.domains ?? []);
    const learningTracks = validateLearningTracks(input.learningTracks ?? []);
    const goalText = validateGoalText(input.goalText ?? "");
    this.#limiter.check(loginName, input.source ?? "register");
    const credential = await derivePassword(this.#kdf, password, input.signal);
    if (input.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const result = this.#store.register({ loginName, displayName, timezone, domains, learningTracks, goalText, now: (/* @__PURE__ */ new Date()).toISOString(), credential });
    if (result.kind === "setup_required") throw new IdentityError("SETUP_REQUIRED", "service setup is required");
    if (result.kind === "login_name_taken") throw new IdentityError("LOGIN_NAME_TAKEN", "login name is already in use");
    return result.user;
  }
  async login(input) {
    const loginName = validateLoginName(input.loginName);
    const password = validatePassword(input.password);
    this.#limiter.check(loginName, input.source);
    const lookup = this.#store.findLogin(loginName);
    let valid = false;
    try {
      valid = await verifyPassword(this.#kdf, password, lookup?.credential ?? { algorithm: "scrypt", version: 1, n: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem, salt: Buffer.alloc(KDF_CONFIG.saltBytes), derivedKey: Buffer.alloc(KDF_CONFIG.keyLen) }, input.signal);
    } catch (error) {
      if (error instanceof IdentityError && error.code === "AUTH_RATE_LIMITED") throw error;
      valid = false;
    }
    if (input.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (!lookup || lookup.status !== "active" || !valid) {
      this.#limiter.failure(loginName, input.source);
      throw new IdentityError("INVALID_CREDENTIALS", "invalid credentials");
    }
    const token = makeToken();
    const createdAt = /* @__PURE__ */ new Date();
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString();
    this.#store.createSession({ sessionId: randomUUID3(), userId: lookup.userId, tokenHash: tokenHash(token), createdAt: createdAt.toISOString(), expiresAt, revokeTokenHash: input.oldToken ? tokenHash(input.oldToken) : void 0 });
    const user = this.#store.getProfile(lookup.userId);
    if (user === void 0) throw new IdentityError("STORAGE_UNAVAILABLE", "user profile unavailable");
    return { user, token, expiresAt };
  }
  actor(token, now = (/* @__PURE__ */ new Date()).toISOString()) {
    return token === void 0 ? void 0 : this.#store.findActor(tokenHash(token), now);
  }
  profile(userId) {
    return this.#store.getProfile(userId);
  }
  spaces(userId) {
    return this.#store.getSpaces(userId);
  }
  logout(token) {
    if (token !== void 0) this.#store.revokeSession(tokenHash(token), (/* @__PURE__ */ new Date()).toISOString());
  }
  preferences(userId, expectedRevision, patch) {
    const result = this.#store.updatePreferences(userId, expectedRevision, patch, (/* @__PURE__ */ new Date()).toISOString());
    if (result.kind === "conflict") throw new IdentityError("REVISION_CONFLICT", "profile revision has changed");
    return result.user;
  }
  async close() {
    await this.#kdf.close();
  }
};

// src/host/identity-http.ts
import { createHash as createHash4, randomUUID as randomUUID4 } from "node:crypto";
var HttpError = class extends Error {
  constructor(status, code, message, retryable = false, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.headers = headers;
    this.name = "HttpError";
  }
};
function sendJson2(res, status, payload, headers = {}) {
  if (res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(payload));
}
function sendEmpty(res, status, headers = {}) {
  if (res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end();
}
function isLoopbackAddress(value) {
  if (value === void 0) return false;
  const unwrapped = value.startsWith("::ffff:") ? value.slice(7) : value;
  if (/^127(?:\.\d{1,3}){3}$/.test(unwrapped)) return true;
  return unwrapped === "::1" || unwrapped === "0:0:0:0:0:0:0:1";
}
function cookieName(serviceId, origin) {
  return `kos_session_${createHash4("sha256").update(`${serviceId}|${origin}`).digest("hex").slice(0, 16)}`;
}
function readCookie(req, name2) {
  const raw = req.headers.cookie;
  if (typeof raw !== "string") return void 0;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name2) return rest.join("=") || void 0;
  }
  return void 0;
}
function sessionCookie(name2, token, origin, protocol, maxAge) {
  const secure = protocol === "https:" ? "; Secure" : "";
  return `${name2}=${token}; Path=/knowledge/v1; HttpOnly; SameSite=Strict${secure}; Max-Age=${String(maxAge)}`;
}
function clearCookie(name2, origin, protocol) {
  const secure = protocol === "https:" ? "; Secure" : "";
  return `${name2}=; Path=/knowledge/v1; HttpOnly; SameSite=Strict${secure}; Max-Age=0`;
}
async function readBody2(req) {
  return await new Promise((resolve, reject) => {
    let total = 0;
    let settled = false;
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
      if (total > MAX_REQUEST_BODY_BYTES2) {
        fail(new HttpError(413, "PAYLOAD_TOO_LARGE", "request body exceeds the limit"));
        return;
      }
      ;
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
      } catch {
        reject(new HttpError(400, "INVALID_JSON", "request body is not valid UTF-8"));
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, "INVALID_JSON", "request body is not valid JSON"));
      }
    });
    req.on("error", () => fail(new HttpError(400, "INVALID_JSON", "request body could not be read")));
    req.on("aborted", () => fail(new HttpError(400, "INVALID_JSON", "request was aborted")));
  });
}
function bodyObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpError(422, "INPUT_INVALID", "body must be a JSON object");
  return value;
}
function assertKeys(value, allowed) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new HttpError(422, "INPUT_INVALID", "body contains an unsupported field");
}
function requireJson(req) {
  const raw = req.headers["content-type"];
  if (typeof raw !== "string" || raw.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  const charset = raw.split(";").slice(1).map((item) => item.trim().toLowerCase()).find((item) => item.startsWith("charset="));
  if (charset !== void 0 && charset !== "charset=utf-8") throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type charset must be utf-8");
}
function requireMethod(req, method) {
  if (req.method !== method) throw new HttpError(405, "METHOD_NOT_ALLOWED", "method not allowed", false, { allow: method });
}
function safeProfile(profile) {
  return { id: profile.id, login_name: profile.loginName, display_name: profile.displayName, role: profile.role, status: profile.status, timezone: profile.timezone, planning_home_service_id: profile.planningHomeServiceId, domains: profile.domains, learning_tracks: profile.learningTracks, goal_text: profile.goalText, revision: profile.revision, personal_space_id: profile.personalSpaceId, created_at: profile.createdAt, updated_at: profile.updatedAt };
}
function requestSource(req) {
  return req.socket?.remoteAddress ?? "unknown";
}
function requestSignal(req) {
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());
  req.once("close", () => {
    if (!req.complete) controller.abort();
  });
  return controller.signal;
}
function createIdentityHandlers(options) {
  const { service } = options;
  const meta = (requestId) => ({ request_id: requestId, service_id: service.setupState.serviceId, server_time: (/* @__PURE__ */ new Date()).toISOString() });
  const withMeta = (requestId, data) => ({ data, meta: meta(requestId) });
  const tokenFor = (req) => {
    const state = service.setupState;
    return readCookie(req, cookieName(state.serviceId, options.origin()));
  };
  const assertTrust = (req, mutation) => {
    const origin = options.origin();
    const expectedHost = new URL(origin).host;
    if (req.headers.host !== expectedHost) throw new HttpError(403, "CSRF_REJECTED", "request authority is not trusted");
    const suppliedOrigin = req.headers.origin;
    if (suppliedOrigin !== void 0 && suppliedOrigin !== origin) throw new HttpError(403, "CSRF_REJECTED", "request origin is not trusted");
    if (suppliedOrigin === "null") throw new HttpError(403, "CSRF_REJECTED", "opaque origin is not trusted");
    const fetchSite = req.headers["sec-fetch-site"];
    if (typeof fetchSite === "string" && fetchSite.toLowerCase() === "cross-site") throw new HttpError(403, "CSRF_REJECTED", "cross-site request is not trusted");
    if (mutation && req.headers["x-knowledgeos-request"] !== "1") throw new HttpError(403, "CSRF_REJECTED", "missing KnowledgeOS request header");
  };
  const actorFor = (req) => service.actor(tokenFor(req));
  const requireActor = (req) => {
    const actor = actorFor(req);
    if (actor === void 0) throw new HttpError(401, "SESSION_EXPIRED", "business session is required");
    return actor;
  };
  const dispatch = async (req, res, action) => {
    const requestId = randomUUID4();
    try {
      await action();
    } catch (error) {
      if (res.writableEnded) return;
      let mapped;
      if (error instanceof HttpError) mapped = error;
      else if (error instanceof IdentityError) {
        const status2 = error.code === "INVALID_CREDENTIALS" ? 401 : error.code === "AUTH_RATE_LIMITED" ? 429 : error.code === "SETUP_REQUIRED" || error.code === "ALREADY_INITIALIZED" || error.code === "LOGIN_NAME_TAKEN" || error.code === "REVISION_CONFLICT" ? 409 : error.code === "INPUT_INVALID" ? 422 : 503;
        mapped = new HttpError(status2, error.code, error.message, error.retryable, error.code === "AUTH_RATE_LIMITED" ? { "retry-after": "60" } : {});
      } else if (error instanceof Error && ["STORAGE_UNAVAILABLE", "STORAGE_INCOMPATIBLE", "STORAGE_BUSY", "STORAGE_CLOSED"].includes(String(error.code))) {
        const code = String(error.code);
        mapped = new HttpError(503, code, "storage is unavailable", true);
      } else {
        mapped = new HttpError(500, "INTERNAL_ERROR", "internal error");
      }
      if (mapped.status === 204) {
        sendEmpty(res, 204, mapped.headers);
        return;
      }
      sendJson2(res, mapped.status, { code: mapped.code, message: mapped.message, request_id: requestId, retryable: mapped.retryable, safe_details: {} }, mapped.headers);
    }
  };
  const status = async (req, res) => dispatch(req, res, () => {
    requireMethod(req, "GET");
    assertTrust(req, false);
    const state = service.setupState;
    sendJson2(res, 200, withMeta(randomUUID4(), { setup_required: !state.initialized, available: true }));
  });
  const bootstrap = async (req, res, peer) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    if (!isLoopbackAddress(req.socket?.remoteAddress) || !isLoopbackAddress(options.host()) || peer?.principal?.kind !== "owner") throw new HttpError(403, "FORBIDDEN", "owner loopback admission is required");
    const signal = requestSignal(req);
    requireJson(req);
    const body = bodyObject(await readBody2(req));
    assertKeys(body, ["login_name", "password", "display_name", "timezone", "domains", "learning_tracks", "goal_text"]);
    const user = await service.bootstrap({ loginName: body.login_name, password: body.password, displayName: body.display_name, timezone: body.timezone, domains: body.domains, learningTracks: body.learning_tracks, goalText: body.goal_text, source: requestSource(req), signal });
    sendJson2(res, 201, withMeta(randomUUID4(), safeProfile(user)));
  });
  const register = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    const signal = requestSignal(req);
    requireJson(req);
    const body = bodyObject(await readBody2(req));
    assertKeys(body, ["login_name", "password", "display_name", "timezone", "domains", "learning_tracks", "goal_text"]);
    const user = await service.register({ loginName: body.login_name, password: body.password, displayName: body.display_name, timezone: body.timezone, domains: body.domains, learningTracks: body.learningTracks, goalText: body.goal_text, source: requestSource(req), signal });
    sendJson2(res, 201, withMeta(randomUUID4(), safeProfile(user)));
  });
  const login = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    const signal = requestSignal(req);
    requireJson(req);
    const body = bodyObject(await readBody2(req));
    assertKeys(body, ["login_name", "password"]);
    const result = await service.login({ loginName: body.login_name, password: body.password, oldToken: tokenFor(req), source: requestSource(req), signal });
    const state = service.setupState;
    const name2 = cookieName(state.serviceId, options.origin());
    const maxAge = Math.floor((new Date(result.expiresAt).getTime() - Date.now()) / 1e3);
    sendJson2(res, 200, withMeta(randomUUID4(), safeProfile(result.user)), { "set-cookie": sessionCookie(name2, result.token, options.origin(), options.protocol(), maxAge) });
  });
  const logout = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    requireJson(req);
    const body = bodyObject(await readBody2(req));
    assertKeys(body, []);
    service.logout(tokenFor(req));
    const state = service.setupState;
    const name2 = cookieName(state.serviceId, options.origin());
    sendEmpty(res, 204, { "set-cookie": clearCookie(name2, options.origin(), options.protocol()) });
  });
  const me = async (req, res) => dispatch(req, res, () => {
    requireMethod(req, "GET");
    assertTrust(req, false);
    const actor = requireActor(req);
    const profile = service.profile(actor.userId);
    if (profile === void 0) throw new HttpError(401, "SESSION_EXPIRED", "business session is required");
    sendJson2(res, 200, withMeta(randomUUID4(), safeProfile(profile)));
  });
  const preferences = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "PATCH");
    assertTrust(req, true);
    const actor = requireActor(req);
    requireJson(req);
    const body = bodyObject(await readBody2(req));
    assertKeys(body, ["expected_revision", "display_name", "timezone", "domains", "learning_tracks", "goal_text"]);
    const expectedRevision = validateExpectedRevision(body.expected_revision);
    const patch = {};
    if (body.display_name !== void 0) patch.displayName = validateDisplayName(body.display_name);
    if (body.timezone !== void 0) patch.timezone = validateTimezone(body.timezone);
    if (body.domains !== void 0) patch.domains = validateDomains(body.domains);
    if (body.learning_tracks !== void 0) patch.learningTracks = validateLearningTracks(body.learning_tracks);
    if (body.goal_text !== void 0) patch.goalText = validateGoalText(body.goal_text);
    if (Object.keys(patch).length === 0) throw new HttpError(422, "INPUT_INVALID", "at least one preference is required");
    sendJson2(res, 200, withMeta(randomUUID4(), safeProfile(service.preferences(actor.userId, expectedRevision, patch))));
  });
  const spaces = async (req, res) => dispatch(req, res, () => {
    requireMethod(req, "GET");
    assertTrust(req, false);
    const actor = requireActor(req);
    const data = service.spaces(actor.userId).map((space) => ({ id: space.id, service_id: space.serviceId, kind: space.kind, owner_user_id: space.ownerUserId, status: space.status, revision: space.revision, created_at: space.createdAt, updated_at: space.updatedAt }));
    sendJson2(res, 200, withMeta(randomUUID4(), data));
  });
  return { status, bootstrap, register, login, logout, me, preferences, spaces };
}
function buildAccountHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnowledgeOS \u8D26\u53F7</title><style>body{margin:0;background:#f4f8f8;color:#23333a;font-family:"Segoe UI","Microsoft YaHei UI",system-ui,sans-serif}main{max-width:880px;margin:0 auto;padding:32px 20px 56px}h1{margin:0 0 8px;font-size:28px}p{line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{background:#fff;border:1px solid #dce8e9;border-radius:14px;padding:20px;box-shadow:0 8px 24px #31535b12}label{display:block;margin:10px 0 5px;color:#597078;font-size:13px}input,textarea,select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c8d8da;border-radius:8px;font:inherit}textarea{min-height:90px}button{margin-top:14px;border:0;border-radius:8px;background:#3d7e86;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}button.secondary{background:#edf5f6;color:#315e65}small{color:#6b7d82}.message{padding:10px 12px;border-radius:8px;background:#edf5f6;margin:12px 0;white-space:pre-wrap}.hidden{display:none}.pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#edf5f6;color:#315e65;font-size:12px}</style></head><body><main><h1>KnowledgeOS \u8D26\u53F7</h1><p id="state">\u6B63\u5728\u8BFB\u53D6\u672C\u673A\u4E1A\u52A1\u8EAB\u4EFD\u2026</p><div id="message" class="message hidden"></div><div class="grid"><section class="card"><h2>\u767B\u5F55</h2><label>\u767B\u5F55\u540D</label><input id="login_name"><label>\u5BC6\u7801</label><input id="login_password" type="password"><button id="login">\u767B\u5F55</button></section><section class="card"><h2>\u6CE8\u518C\u666E\u901A\u8D26\u53F7</h2><label>\u767B\u5F55\u540D</label><input id="register_name"><label>\u663E\u793A\u540D\u79F0</label><input id="register_display"><label>\u5BC6\u7801\uFF0815\u2013128 \u4F4D\uFF09</label><input id="register_password" type="password"><button id="register">\u6CE8\u518C</button></section></div><section id="profile" class="card hidden" style="margin-top:16px"><h2>\u6211\u7684\u4E2A\u4EBA\u7A7A\u95F4</h2><p id="who"></p><label>\u65B9\u5411\uFF08\u9017\u53F7\u5206\u9694\uFF09</label><input id="domains" placeholder="software_engineering,system_architecture"><label>\u5B66\u4E60\u4E3B\u7EBF\uFF08\u9017\u53F7\u5206\u9694\uFF09</label><input id="tracks" placeholder="engineering_practice,architecture_exam"><label>\u76EE\u6807</label><textarea id="goal"></textarea><label>\u65F6\u533A</label><input id="timezone" value="Asia/Shanghai"><button id="save">\u4FDD\u5B58\u4E2A\u4EBA\u504F\u597D</button><button id="logout" class="secondary">\u9000\u51FA</button></section></main><script>(async()=>{const $=id=>document.getElementById(id);let revision=1;let generation=0;const msg=(text,bad=false)=>{const el=$("message");el.textContent=text;el.className="message";el.style.background=bad?"#fbefee":"#edf5f6"};const call=async(path,options={})=>{const headers={...(options.headers||{})};if(options.method&&options.method!=="GET"){headers["content-type"]="application/json";headers["x-knowledgeos-request"]="1"}const r=await fetch(path,{...options,headers});let j;try{j=await r.json()}catch{}if(!r.ok)throw new Error(j?.message||("\u8BF7\u6C42\u5931\u8D25 "+r.status));return j};const load=async()=>{const requestGeneration=++generation;try{const j=await call("/knowledge/v1/me");if(requestGeneration!==generation)return;const u=j.data;revision=u.revision;$("state").textContent="\u5DF2\u767B\u5F55 \xB7 "+u.role;$("who").textContent=u.display_name+"\uFF08"+u.login_name+"\uFF09 \xB7 \u4E2A\u4EBA\u7A7A\u95F4 "+u.personal_space_id;$("domains").value=(u.domains||[]).join(",");$("tracks").value=(u.learning_tracks||[]).join(",");$("goal").value=u.goal_text||"";$("timezone").value=u.timezone||"Asia/Shanghai";$("profile").className="card"}catch{if(requestGeneration!==generation)return;$("state").textContent="\u672A\u767B\u5F55\uFF0C\u53EF\u6CE8\u518C\u6216\u767B\u5F55";$("profile").className="card hidden"}};$("login").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/login",{method:"POST",body:JSON.stringify({login_name:$("login_name").value,password:$("login_password").value})});if(requestGeneration!==generation)return;$("login_password").value="";await load();msg("\u767B\u5F55\u6210\u529F")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("register").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/register",{method:"POST",body:JSON.stringify({login_name:$("register_name").value,display_name:$("register_display").value,password:$("register_password").value})});if(requestGeneration!==generation)return;$("register_password").value="";msg("\u6CE8\u518C\u6210\u529F\uFF0C\u8BF7\u767B\u5F55")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("save").onclick=async()=>{const requestGeneration=generation;try{const j=await call("/knowledge/v1/me/preferences",{method:"PATCH",body:JSON.stringify({expected_revision:revision,domains:$("domains").value.split(",").map(x=>x.trim()).filter(Boolean),learning_tracks:$("tracks").value.split(",").map(x=>x.trim()).filter(Boolean),goal_text:$("goal").value,timezone:$("timezone").value})});if(requestGeneration!==generation)return;revision=j.data.revision;msg("\u4E2A\u4EBA\u504F\u597D\u5DF2\u4FDD\u5B58")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("logout").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/logout",{method:"POST",body:"{}"});if(requestGeneration!==generation)return;$("profile").className="card hidden";$("state").textContent="\u5DF2\u9000\u51FA";$("who").textContent="";msg("\u5DF2\u9000\u51FA")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};await load()})()</script></body></html>`;
}
function buildSetupHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnowledgeOS \u521D\u59CB\u5316</title><style>body{margin:0;background:#f4f8f8;color:#23333a;font-family:"Segoe UI","Microsoft YaHei UI",system-ui,sans-serif}main{max-width:560px;margin:0 auto;padding:48px 20px}.card{background:#fff;border:1px solid #dce8e9;border-radius:14px;padding:24px}label{display:block;margin:12px 0 5px;color:#597078;font-size:13px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c8d8da;border-radius:8px;font:inherit}button{margin-top:16px;border:0;border-radius:8px;background:#3d7e86;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}.message{margin-top:12px;padding:10px;border-radius:8px;background:#edf5f6;white-space:pre-wrap}</style></head><body><main><section class="card"><h1>\u9996\u6B21\u7BA1\u7406\u5458\u521D\u59CB\u5316</h1><p>\u4EC5\u53EF\u4FE1\u672C\u673A DSH owner \u53EF\u4EE5\u5B8C\u6210\u4E00\u6B21\u521D\u59CB\u5316\u3002</p><label>\u7BA1\u7406\u5458\u767B\u5F55\u540D</label><input id="name"><label>\u663E\u793A\u540D\u79F0</label><input id="display"><label>\u5BC6\u7801\uFF0815\u2013128 \u4F4D\uFF09</label><input id="password" type="password"><button id="submit">\u521B\u5EFA\u7BA1\u7406\u5458</button><div id="message" class="message"></div></section></main><script>document.getElementById('submit').onclick=async()=>{const m=document.getElementById('message');try{const r=await fetch('/knowledge/v1/auth/bootstrap',{method:'POST',headers:{'content-type':'application/json','x-knowledgeos-request':'1'},body:JSON.stringify({login_name:document.getElementById('name').value,display_name:document.getElementById('display').value,password:document.getElementById('password').value})});const j=await r.json();if(!r.ok)throw new Error(j.message||('\u8BF7\u6C42\u5931\u8D25 '+r.status));document.getElementById('password').value='';m.textContent='\u521D\u59CB\u5316\u5B8C\u6210\uFF0C\u8BF7\u524D\u5F80\u8D26\u53F7\u9875\u767B\u5F55\u3002'}catch(e){m.textContent=e.message}}</script></body></html>`;
}

// src/host/index.ts
var name = "knowledgeos-panel";
var inject = ["webServer", "clientModules"];
var STATUS_PATH = "/knowledgeos/status";
var RECORDS_PATH = "/knowledgeos/foundation/records";
var ACCOUNT_PATH = "/knowledgeos/account";
var SETUP_PATH = "/knowledgeos/setup";
var IDENTITY_API_PATH = "/knowledge/v1";
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
        newId: () => randomUUID5(),
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
  const webFacts = ctx.webServer;
  const identity = storage === void 0 ? void 0 : new IdentityService(storage);
  const identityHandlers = identity === void 0 ? void 0 : createIdentityHandlers({
    service: identity,
    origin: () => webFacts.getOrigin?.() ?? `${webFacts.protocol ?? "http:"}//${webFacts.host ?? "127.0.0.1"}`,
    host: () => webFacts.host ?? "127.0.0.1",
    protocol: () => webFacts.protocol ?? "http:"
  });
  const sendIdentityUnavailable = (req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/knowledgeos/account")) {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(buildAccountHtml());
      return;
    }
    res.statusCode = 503;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ code: "STORAGE_UNAVAILABLE", message: "storage is not configured", request_id: randomUUID5(), retryable: true, safe_details: {} }));
  };
  const ownerSetupPage = (req, res, peer) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("allow", "GET");
      res.end();
      return;
    }
    const principal = peer?.principal;
    if (principal?.kind !== "owner" || !isLoopbackAddress(req.socket?.remoteAddress) || !isLoopbackAddress(webFacts.host?.split(":")[0])) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(buildSetupHtml());
  };
  const accountPage = (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("allow", "GET");
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(buildAccountHtml());
  };
  const withPeer = (handler) => {
    return (req, res, peer) => {
      const pending = handler(req, res, peer);
      inFlight.add(pending);
      void pending.finally(() => {
        inFlight.delete(pending);
      });
      return pending;
    };
  };
  ctx.effect(() => {
    const disposers = [];
    disposers.push(ctx.webServer.register({ kind: "exact", path: ACCOUNT_PATH, auth: "anonymous", handler: accountPage }));
    disposers.push(ctx.webServer.register({ kind: "exact", path: SETUP_PATH, auth: "required", handler: ownerSetupPage }));
    if (identityHandlers === void 0) {
      for (const path of ["/knowledge/v1/auth/status", "/knowledge/v1/auth/bootstrap", "/knowledge/v1/auth/register", "/knowledge/v1/auth/login", "/knowledge/v1/auth/logout", "/knowledge/v1/me", "/knowledge/v1/me/preferences", "/knowledge/v1/spaces"]) {
        disposers.push(ctx.webServer.register({ kind: "exact", path, auth: path.endsWith("/bootstrap") ? "required" : "anonymous", handler: sendIdentityUnavailable }));
      }
    } else {
      const routes = [
        { path: "/knowledge/v1/auth/status", auth: "anonymous", handler: identityHandlers.status },
        { path: "/knowledge/v1/auth/bootstrap", auth: "required", handler: identityHandlers.bootstrap },
        { path: "/knowledge/v1/auth/register", auth: "anonymous", handler: identityHandlers.register },
        { path: "/knowledge/v1/auth/login", auth: "anonymous", handler: identityHandlers.login },
        { path: "/knowledge/v1/auth/logout", auth: "anonymous", handler: identityHandlers.logout },
        { path: "/knowledge/v1/me", auth: "anonymous", handler: identityHandlers.me },
        { path: "/knowledge/v1/me/preferences", auth: "anonymous", handler: identityHandlers.preferences },
        { path: "/knowledge/v1/spaces", auth: "anonymous", handler: identityHandlers.spaces }
      ];
      for (const route of routes) disposers.push(ctx.webServer.register({ kind: "exact", path: route.path, auth: route.auth, handler: withPeer(route.handler) }));
    }
    return async () => {
      for (const dispose of disposers) dispose();
      await identity?.close();
    };
  }, "knowledgeos-identity: account and business routes");
}
export {
  ACCOUNT_PATH,
  Config,
  IDENTITY_API_PATH,
  RECORDS_PATH,
  SETUP_PATH,
  STATUS_PATH,
  apply,
  inject,
  name
};

