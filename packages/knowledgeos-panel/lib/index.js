// src/host/index.ts
import { randomUUID as randomUUID8 } from "node:crypto";

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
  dataDir: Schema.string(),
  ai: Schema.object({ provider: Schema.string(), model: Schema.string(), maxCalls: Schema.number().min(1).max(64), timeoutMs: Schema.number().min(20).max(6e4), budgetUsd: Schema.number().min(0).max(1), inputUsdPerMillion: Schema.number().min(0), outputUsdPerMillion: Schema.number().min(0) })
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
  let text2;
  try {
    text2 = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "request body is not valid UTF-8");
  }
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "request body is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ApiError(422, "INPUT_INVALID", "body must be a JSON object");
  }
  const keys2 = Object.keys(parsed);
  if (keys2.length !== 1 || keys2[0] !== "content") {
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

// src/host/authorization.ts
var AUTH_ACTIONS = ["read", "comment", "edit", "export", "manage_share", "delete", "review", "view_learning_records"];
function isGrantActive(grant, now) {
  return grant.revokedAt === void 0 && grant.validFrom <= now && (grant.expiresAt === void 0 || now < grant.expiresAt);
}
function authorize(actor2, target, action2, now, grants = [], memberships = []) {
  if (target.status !== "active" || target.serviceId !== actor2.serviceId || target.spaceId !== actor2.personalSpaceId && target.scope === "personal") return false;
  if (target.scope === "personal") return target.ownerUserId === actor2.userId;
  if (target.projectId === void 0) return false;
  const member = memberships.some((item) => item.projectId === target.projectId && item.userId === actor2.userId && isGrantActive(item, now));
  if (!member) return false;
  return grants.some((item) => item.subjectType === "user" && item.subjectId === actor2.userId && item.action === action2 && isGrantActive(item, now)) || grants.some((item) => item.subjectType === "project" && item.subjectId === target.projectId && item.action === action2 && isGrantActive(item, now) && member);
}

// src/host/storage.ts
var APPLICATION_ID = 1263489841;
var SCHEMA_VERSION = 5;
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
var MIGRATION_V3_SQL = `CREATE TABLE knowledge_projects (
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
`;
var MIGRATION_V3_CHECKSUM = createHash2("sha256").update(Buffer.from(MIGRATION_V3_SQL, "utf8")).digest("hex");
var MIGRATION_V4_SQL = `ALTER TABLE resource_grants RENAME TO resource_grants_v3;
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
`;
var MIGRATION_V4_CHECKSUM = createHash2("sha256").update(Buffer.from(MIGRATION_V4_SQL, "utf8")).digest("hex");
var MIGRATION_V5_SQL = `CREATE TABLE ai_tool_mutations (
  service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  object_id TEXT NOT NULL REFERENCES knowledge_objects(id),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (service_id, user_id, idempotency_key)
) STRICT;
`;
var MIGRATION_V5_CHECKSUM = createHash2("sha256").update(MIGRATION_V5_SQL).digest("hex");
var PROBE_SUPPORTED_TABLES = ["schema_migrations", "storage_probe_records"];
var IDENTITY_SUPPORTED_TABLES = [
  "auth_sessions",
  "knowledge_objects",
  "knowledge_projects",
  "password_credentials",
  "project_memberships",
  "resource_grants",
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
  #failureAt;
  #db;
  #state = "unavailable";
  #failure;
  #closed = false;
  constructor(options) {
    this.#dataDir = options.dataDir;
    this.#log = options.log ?? (() => {
    });
    this.#migrationOverride = options.migrationOverride;
    this.#failureAt = options.failureAt;
    this.#open();
  }
  #injectFailure(point) {
    if (this.#failureAt === point) throw new Error(`controlled storage failure at ${point}`);
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
        this.#migrateV3(db);
        this.#migrateV4(db);
      } else if (existing === "v1") {
        this.#migrateV2(db);
        this.#migrateV3(db);
        this.#migrateV4(db);
      } else if (existing === "v2") {
        this.#migrateV3(db);
        this.#migrateV4(db);
      } else if (existing === "v3") {
        this.#migrateV4(db);
      }
      if (existing !== "v5") this.#migrateV5(db);
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
    if (facts.userVersion === 3) {
      this.#assertV3Schema(facts);
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        this.#assertV3Definitions(db);
      } finally {
        db.close();
      }
      return "v3";
    }
    if (facts.userVersion === 4) {
      this.#assertV4Schema(facts);
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        this.#assertV4Definitions(db);
      } finally {
        db.close();
      }
      return "v4";
    }
    if (facts.userVersion === 5) {
      this.#assertV5Schema(facts);
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        this.#assertV2Definitions(db);
        this.#assertV4Definitions(db);
        this.#assertV5Definitions(db);
      } finally {
        db.close();
      }
      return "v5";
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
    const expected = ["auth_sessions", "password_credentials", "schema_migrations", "service_identity", "spaces", "storage_probe_records", "users"].sort();
    const actual = facts.objects.filter((object) => object.type === "table").map((object) => object.name).sort();
    if (facts.objects.some((object) => object.type !== "table") || actual.join(",") !== expected.join(",")) throw new RecordsError("STORAGE_INCOMPATIBLE", "database contains an unknown v2 schema");
    const v1 = facts.ledger.find((entry) => entry.version === 1);
    const v2 = facts.ledger.find((entry) => entry.version === 2);
    if (facts.ledger.length !== 2 || v1?.checksum !== MIGRATION_V1_CHECKSUM || v2?.checksum !== MIGRATION_V2_CHECKSUM) throw new RecordsError("STORAGE_INCOMPATIBLE", "v2 migration ledger does not match this build");
  }
  #assertV3Schema(facts) {
    const expected = [...IDENTITY_SUPPORTED_TABLES].sort();
    const actual = facts.objects.filter((object) => object.type === "table").map((object) => object.name).sort();
    if (facts.objects.some((object) => object.type !== "table") || actual.join(",") !== expected.join(",")) throw new RecordsError("STORAGE_INCOMPATIBLE", "database contains an unknown v3 schema");
    const v1 = facts.ledger.find((entry) => entry.version === 1);
    const v2 = facts.ledger.find((entry) => entry.version === 2);
    const v3 = facts.ledger.find((entry) => entry.version === 3);
    if (facts.ledger.length !== 3 || v1?.checksum !== MIGRATION_V1_CHECKSUM || v2?.checksum !== MIGRATION_V2_CHECKSUM || v3?.checksum !== MIGRATION_V3_CHECKSUM) throw new RecordsError("STORAGE_INCOMPATIBLE", "v3 migration ledger does not match this build");
  }
  #assertV4Schema(facts) {
    const expected = [...IDENTITY_SUPPORTED_TABLES].sort();
    const actual = facts.objects.filter((object) => object.type === "table").map((object) => object.name).sort();
    const unexpected = facts.objects.filter((object) => object.type !== "table" && !(object.type === "index" && object.name === "resource_grants_active_subject_action_uq"));
    if (unexpected.length !== 0 || actual.join(",") !== expected.join(",")) throw new RecordsError("STORAGE_INCOMPATIBLE", "database contains an unknown v4 schema");
    const v1 = facts.ledger.find((entry) => entry.version === 1);
    const v2 = facts.ledger.find((entry) => entry.version === 2);
    const v3 = facts.ledger.find((entry) => entry.version === 3);
    const v4 = facts.ledger.find((entry) => entry.version === 4);
    if (facts.ledger.length !== 4 || v1?.checksum !== MIGRATION_V1_CHECKSUM || v2?.checksum !== MIGRATION_V2_CHECKSUM || v3?.checksum !== MIGRATION_V3_CHECKSUM || v4?.checksum !== MIGRATION_V4_CHECKSUM) throw new RecordsError("STORAGE_INCOMPATIBLE", "v4 migration ledger does not match this build");
  }
  #assertV5Schema(facts) {
    const table = facts.objects.find((item) => item.name === "ai_tool_mutations");
    if (table?.type !== "table" || facts.ledger.length !== 5 || facts.ledger[4]?.checksum !== MIGRATION_V5_CHECKSUM || facts.ledger[4]?.version !== 5) throw new RecordsError("STORAGE_INCOMPATIBLE", "v5 migration ledger/schema does not match this build");
    this.#assertV4Schema({ ...facts, objects: facts.objects.filter((item) => item.name !== "ai_tool_mutations"), ledger: facts.ledger.slice(0, 4) });
  }
  #assertV5Definitions(db) {
    const expected = new DatabaseSync(":memory:");
    try {
      expected.exec(MIGRATION_V5_SQL);
      const sql = (source) => String(source.prepare("SELECT sql FROM sqlite_master WHERE name = 'ai_tool_mutations' AND type = 'table'").get()?.sql ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (sql(db) !== sql(expected)) throw new RecordsError("STORAGE_INCOMPATIBLE", "v5 receipt constraints are not accepted");
    } finally {
      expected.close();
    }
  }
  #assertV2Definitions(db) {
    const expected = new DatabaseSync(":memory:");
    try {
      expected.exec(MIGRATION_V2_SQL);
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      const signature = (source, table) => {
        const columns = source.prepare(`PRAGMA table_info(${table})`).all().map((row) => ({ cid: Number(row.cid), name: String(row.name), type: String(row.type), notnull: Number(row.notnull), pk: Number(row.pk) }));
        const indexes = source.prepare(`PRAGMA index_list(${table})`).all().map((index) => ({
          unique: Number(index.unique),
          origin: String(index.origin),
          columns: source.prepare(`PRAGMA index_info(${JSON.stringify(String(index.name))})`).all().map((row) => ({ seqno: Number(row.seqno), name: row.name === null ? null : String(row.name) }))
        })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const foreignKeys = source.prepare(`PRAGMA foreign_key_list(${table})`).all().map((row) => ({ id: Number(row.id), seq: Number(row.seq), table: String(row.table), from: String(row.from), to: String(row.to), on_update: String(row.on_update), on_delete: String(row.on_delete), match: String(row.match) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const sql = source.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        return { columns, indexes, foreignKeys, sql: normalize(sql) };
      };
      for (const table of ["password_credentials", "users", "service_identity", "auth_sessions", "spaces"]) {
        const actual = signature(db, table);
        const expectedSignature = signature(expected, table);
        if (JSON.stringify(actual) !== JSON.stringify(expectedSignature)) throw new RecordsError("STORAGE_INCOMPATIBLE", `v2 table constraints are not accepted: ${table}`);
      }
    } finally {
      expected.close();
    }
  }
  #assertV3Definitions(db) {
    const expected = new DatabaseSync(":memory:");
    try {
      expected.exec(MIGRATION_V2_SQL);
      expected.exec(MIGRATION_V3_SQL);
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      for (const table of ["knowledge_projects", "project_memberships", "knowledge_objects", "resource_grants"]) {
        const actualSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        const expectedSql = expected.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        if (normalize(actualSql) !== normalize(expectedSql)) throw new RecordsError("STORAGE_INCOMPATIBLE", `v3 table constraints are not accepted: ${table}`);
      }
    } finally {
      expected.close();
    }
  }
  #assertV4Definitions(db) {
    const expected = new DatabaseSync(":memory:");
    try {
      expected.exec(MIGRATION_V2_SQL);
      expected.exec(MIGRATION_V3_SQL);
      expected.exec(MIGRATION_V4_SQL);
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      for (const table of ["knowledge_projects", "project_memberships", "knowledge_objects", "resource_grants"]) {
        const actualSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        const expectedSql = expected.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        if (normalize(actualSql) !== normalize(expectedSql)) throw new RecordsError("STORAGE_INCOMPATIBLE", `v4 table constraints are not accepted: ${table}`);
      }
      const actualIndex = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name = 'resource_grants_active_subject_action_uq'").get();
      const expectedIndex = expected.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name = 'resource_grants_active_subject_action_uq'").get();
      if (actualIndex?.name !== expectedIndex?.name || normalize(actualIndex?.sql) !== normalize(expectedIndex?.sql)) throw new RecordsError("STORAGE_INCOMPATIBLE", "v4 active grant uniqueness index is not accepted");
    } finally {
      expected.close();
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
      this.#injectFailure("v2:after-schema");
      db.prepare("INSERT INTO service_identity (id, service_id, bootstrap_admin_user_id, initialized_at) VALUES (1, ?, NULL, NULL)").run(randomUUID2());
      this.#injectFailure("v2:after-identity");
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(2, MIGRATION_V2_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      this.#injectFailure("v2:after-ledger");
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
  #migrateV3(db) {
    let committed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_V3_SQL);
      this.#injectFailure("v3:after-projects");
      this.#injectFailure("v3:after-memberships");
      this.#injectFailure("v3:after-objects");
      this.#injectFailure("v3:after-grants");
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(3, MIGRATION_V3_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version = 3");
      db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw error instanceof RecordsError ? error : new RecordsError("STORAGE_INCOMPATIBLE", "authorization migration failed", false, { cause: error });
    }
  }
  #migrateV4(db) {
    let committed = false;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_V4_SQL);
      this.#injectFailure("v4:after-rebuild");
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(4, MIGRATION_V4_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version = 4");
      db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw error instanceof RecordsError ? error : new RecordsError("STORAGE_INCOMPATIBLE", "grant history migration failed", false, { cause: error });
    }
  }
  #migrateV5(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATION_V5_SQL);
      this.#injectFailure("v5:after-schema");
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(5, MIGRATION_V5_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version = 5");
      db.exec("COMMIT");
    } catch (error) {
      if (!this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw new RecordsError("STORAGE_INCOMPATIBLE", "tool receipt migration failed", false, { cause: error });
    }
  }
  #verify(db) {
    const facts = readDatabaseFacts(this.databasePath);
    if (facts.applicationId !== APPLICATION_ID || facts.userVersion !== 5) throw new RecordsError("STORAGE_INCOMPATIBLE", "database ownership/version verification failed");
    this.#assertV5Schema(facts);
    this.#assertV2Definitions(db);
    this.#assertV4Definitions(db);
    this.#assertV5Definitions(db);
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
      this.#injectFailure("bootstrap:after-credential");
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?, ?, ?, ?, 1, ?, ?)`).run(userId, input.loginName, input.displayName, credentialId, input.timezone, serviceId, JSON.stringify(input.domains), JSON.stringify(input.learningTracks), input.goalText, now, now);
      this.#injectFailure("bootstrap:after-user");
      db.prepare(`INSERT INTO spaces (id, service_id, kind, owner_user_id, status, revision, created_at, updated_at) VALUES (?, ?, 'personal', ?, 'active', 1, ?, ?)`).run(spaceId, serviceId, userId, now, now);
      this.#injectFailure("bootstrap:after-space");
      db.prepare("UPDATE service_identity SET bootstrap_admin_user_id = ?, initialized_at = ? WHERE id = 1 AND initialized_at IS NULL").run(userId, now);
      this.#injectFailure("bootstrap:after-identity");
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
      this.#injectFailure("register:after-credential");
      db.prepare(`INSERT INTO users (id, login_name, display_name, credential_ref, role, status, timezone, planning_home_service_id, domains, learning_tracks, goal_text, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, ?, ?, ?, 1, ?, ?)`).run(userId, input.loginName, input.displayName, credentialId, input.timezone, serviceId, JSON.stringify(input.domains), JSON.stringify(input.learningTracks), input.goalText, now, now);
      this.#injectFailure("register:after-user");
      db.prepare(`INSERT INTO spaces (id, service_id, kind, owner_user_id, status, revision, created_at, updated_at) VALUES (?, ?, 'personal', ?, 'active', 1, ?, ?)`).run(spaceId, serviceId, userId, now, now);
      this.#injectFailure("register:after-space");
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
  #objectRow(row) {
    return { id: String(row.id), serviceId: String(row.service_id), spaceId: String(row.space_id), scope: String(row.scope_kind), projectId: row.project_id == null ? void 0 : String(row.project_id), ownerUserId: String(row.owner_user_id), objectType: String(row.object_type), title: String(row.title), body: String(row.body), status: String(row.status), revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }
  #objectTarget(row) {
    return { serviceId: row.serviceId, spaceId: row.spaceId, objectId: row.id, scope: row.scope, ownerUserId: row.ownerUserId, projectId: row.projectId, status: row.status };
  }
  #grants(db, objectId) {
    return db.prepare("SELECT subject_type, subject_id, action, valid_from, expires_at, revoked_at FROM resource_grants WHERE resource_type = 'knowledge_object' AND resource_id = ?").all(objectId).map((row) => ({ subjectType: String(row.subject_type), subjectId: String(row.subject_id), action: String(row.action), validFrom: String(row.valid_from), expiresAt: row.expires_at == null ? void 0 : String(row.expires_at), revokedAt: row.revoked_at == null ? void 0 : String(row.revoked_at) }));
  }
  #memberships(db, projectId) {
    return db.prepare("SELECT project_id, user_id, role, valid_from, expires_at, revoked_at FROM project_memberships WHERE project_id = ?").all(projectId).map((row) => ({ projectId: String(row.project_id), userId: String(row.user_id), role: String(row.role), validFrom: String(row.valid_from), expiresAt: row.expires_at == null ? void 0 : String(row.expires_at), revokedAt: row.revoked_at == null ? void 0 : String(row.revoked_at) }));
  }
  #loadObject(id) {
    const row = this.#ensureReady().prepare("SELECT id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at FROM knowledge_objects WHERE id = ?").get(id);
    return row === void 0 ? void 0 : this.#objectRow(row);
  }
  authorizeObject(actor2, objectId, action2, now) {
    const db = this.#ensureReady();
    const object = this.#loadObject(objectId);
    if (object === void 0) return void 0;
    const allowed = authorize(actor2, this.#objectTarget(object), action2, now, this.#grants(db, object.id), object.projectId === void 0 ? [] : this.#memberships(db, object.projectId));
    return allowed ? object : void 0;
  }
  listObjects(actor2, action2, now) {
    const db = this.#ensureReady();
    const rows = db.prepare("SELECT id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at FROM knowledge_objects WHERE service_id = ? AND status = 'active' ORDER BY created_at, id").all(actor2.serviceId);
    return rows.map((row) => this.#objectRow(row)).filter((object) => authorize(actor2, this.#objectTarget(object), action2, now, this.#grants(db, object.id), object.projectId === void 0 ? [] : this.#memberships(db, object.projectId)));
  }
  createProject(input) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      db.prepare("INSERT INTO knowledge_projects (id, service_id, owner_user_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").run(input.id, input.serviceId, input.ownerUserId, input.name, input.now, input.now);
      db.prepare("INSERT INTO project_memberships (project_id, user_id, role, valid_from) VALUES (?, ?, 'owner', ?)").run(input.id, input.ownerUserId, input.now);
      db.exec("COMMIT");
      tx = false;
      return { id: input.id, serviceId: input.serviceId, ownerUserId: input.ownerUserId, name: input.name, status: "active", createdAt: input.now, updatedAt: input.now };
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw this.#mapError(error);
    }
  }
  canManageProject(actor2, projectId) {
    const row = this.#ensureReady().prepare("SELECT service_id, owner_user_id, status FROM knowledge_projects WHERE id = ?").get(projectId);
    return row !== void 0 && String(row.service_id) === actor2.serviceId && String(row.owner_user_id) === actor2.userId && String(row.status) === "active";
  }
  canCreateProjectObject(actor2, projectId, now) {
    const db = this.#ensureReady();
    const project = db.prepare("SELECT service_id, status FROM knowledge_projects WHERE id = ?").get(projectId);
    if (project === void 0 || String(project.service_id) !== actor2.serviceId || String(project.status) !== "active") return false;
    return this.#memberships(db, projectId).some((item) => item.userId === actor2.userId && isGrantActive(item, now));
  }
  addProjectMembership(input) {
    const db = this.#ensureReady();
    try {
      db.prepare("INSERT INTO project_memberships (project_id, user_id, role, valid_from, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role, valid_from = excluded.valid_from, expires_at = excluded.expires_at, revoked_at = NULL").run(input.projectId, input.userId, input.role, input.validFrom, input.expiresAt ?? null);
    } catch (error) {
      throw this.#mapError(error);
    }
  }
  createObject(input) {
    const db = this.#ensureReady();
    if (input.scope === "personal" && input.projectId !== void 0) throw new RecordsError("STORAGE_INCOMPATIBLE", "personal object cannot reference a project");
    if (input.scope === "project") {
      if (input.projectId === void 0) throw new RecordsError("STORAGE_INCOMPATIBLE", "project object requires a project");
      const project = db.prepare("SELECT service_id, status FROM knowledge_projects WHERE id = ?").get(input.projectId);
      if (project === void 0 || String(project.service_id) !== input.serviceId || String(project.status) !== "active" || !this.#memberships(db, input.projectId).some((item) => item.userId === input.ownerUserId && isGrantActive(item, input.now))) throw new RecordsError("STORAGE_INCOMPATIBLE", "object owner is not an active project member");
    }
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      db.prepare("INSERT INTO knowledge_objects (id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)").run(input.id, input.serviceId, input.spaceId, input.scope, input.projectId ?? null, input.ownerUserId, input.objectType, input.title, input.body, input.now, input.now);
      if (input.scope === "project" && input.projectId !== void 0) {
        for (const action2 of ["read", "comment", "edit", "export", "manage_share", "delete", "review", "view_learning_records"]) db.prepare("INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, created_at) VALUES (?, ?, 'knowledge_object', ?, 'user', ?, ?, ?, ?)").run(randomUUID2(), input.serviceId, input.id, input.ownerUserId, action2, input.now, input.now);
      }
      ;
      db.exec("COMMIT");
      tx = false;
      const created = this.#loadObject(input.id);
      if (created === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "created object could not be read");
      return created;
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw this.#mapError(error);
    }
  }
  updateObject(actor2, objectId, expectedRevision, patch, now) {
    const db = this.#ensureReady();
    const current = this.authorizeObject(actor2, objectId, "edit", now);
    if (current === void 0) return { kind: "not_found" };
    if (current.revision !== expectedRevision) return { kind: "conflict", currentRevision: current.revision };
    const title = patch.title ?? current.title;
    const body = patch.body ?? current.body;
    const result = db.prepare("UPDATE knowledge_objects SET title = ?, body = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = 'active'").run(title, body, now, objectId, expectedRevision);
    if (Number(result.changes) !== 1) {
      const latest = this.#loadObject(objectId);
      return latest === void 0 || latest.status !== "active" ? { kind: "not_found" } : { kind: "conflict", currentRevision: latest.revision };
    }
    const updated = this.#loadObject(objectId);
    return updated === void 0 ? { kind: "not_found" } : { kind: "updated", object: updated };
  }
  /** Revalidate the original login inside the same transaction as ACL/version/receipt. */
  mutateObjectOnce(actor2, input, now) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      now = (/* @__PURE__ */ new Date()).toISOString();
      const session = db.prepare(`SELECT s.id FROM auth_sessions s JOIN users u ON u.id = s.user_id JOIN spaces p ON p.owner_user_id = u.id WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active' AND p.status = 'active' AND p.id = ? AND u.planning_home_service_id = ?`).get(actor2.sessionId, actor2.userId, now, actor2.personalSpaceId, actor2.serviceId);
      const finish = (value) => {
        db.exec("COMMIT");
        tx = false;
        return value;
      };
      if (session === void 0) return finish({ kind: "session_expired" });
      const current = this.authorizeObject(actor2, input.objectId, "edit", now);
      if (current === void 0 || this.authorizeObject(actor2, input.objectId, "read", now) === void 0) return finish({ kind: "not_found" });
      const receipt = db.prepare("SELECT request_digest, result_json FROM ai_tool_mutations WHERE service_id = ? AND user_id = ? AND idempotency_key = ?").get(actor2.serviceId, actor2.userId, input.key);
      if (receipt !== void 0) return finish(receipt.request_digest === input.digest ? { kind: "replayed", object: JSON.parse(receipt.result_json) } : { kind: "idempotency_conflict" });
      if (current.revision !== input.expectedRevision) return finish({ kind: "conflict" });
      const changed = db.prepare("UPDATE knowledge_objects SET title = ?, body = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = 'active'").run(input.title ?? current.title, input.body ?? current.body, now, input.objectId, input.expectedRevision);
      if (Number(changed.changes) !== 1) return finish({ kind: "conflict" });
      this.#injectFailure("ai:after-update");
      const object = this.#loadObject(input.objectId);
      db.prepare("INSERT INTO ai_tool_mutations (service_id, user_id, idempotency_key, request_digest, object_id, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(actor2.serviceId, actor2.userId, input.key, input.digest, input.objectId, JSON.stringify(object), now);
      return finish({ kind: "updated", object });
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw this.#mapError(error);
    }
  }
  deleteObject(actor2, objectId, now) {
    const object = this.authorizeObject(actor2, objectId, "delete", now);
    if (object === void 0) return false;
    const result = this.#ensureReady().prepare("UPDATE knowledge_objects SET status = 'deleted', revision = revision + 1, updated_at = ? WHERE id = ? AND status = 'active'").run(now, objectId);
    return Number(result.changes) === 1;
  }
  grantObject(actor2, input) {
    const db = this.#ensureReady();
    const object = this.authorizeObject(actor2, input.objectId, "manage_share", input.now);
    if (object === void 0 || input.serviceId !== actor2.serviceId) return void 0;
    if (input.subjectType === "project") {
      const project = db.prepare("SELECT service_id, status FROM knowledge_projects WHERE id = ?").get(input.subjectId);
      if (project === void 0 || String(project.service_id) !== actor2.serviceId || String(project.status) !== "active") return void 0;
    } else {
      const user = db.prepare("SELECT planning_home_service_id, status FROM users WHERE id = ?").get(input.subjectId);
      if (user === void 0 || String(user.planning_home_service_id) !== actor2.serviceId || String(user.status) !== "active") return void 0;
    }
    try {
      db.prepare("INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, expires_at, created_at) VALUES (?, ?, 'knowledge_object', ?, ?, ?, ?, ?, ?, ?)").run(input.id, input.serviceId, input.objectId, input.subjectType, input.subjectId, input.action, input.validFrom, input.expiresAt ?? null, input.now);
      return { id: input.id, serviceId: input.serviceId, resourceType: "knowledge_object", resourceId: input.objectId, subjectType: input.subjectType, subjectId: input.subjectId, action: input.action, validFrom: input.validFrom, expiresAt: input.expiresAt, createdAt: input.now };
    } catch (error) {
      throw this.#mapError(error);
    }
  }
  revokeGrant(actor2, grantId, now) {
    const db = this.#ensureReady();
    const grant = db.prepare("SELECT resource_id, service_id, revoked_at FROM resource_grants WHERE id = ?").get(grantId);
    if (grant?.resource_id === void 0 || grant.service_id !== actor2.serviceId || grant.revoked_at !== null || this.authorizeObject(actor2, String(grant.resource_id), "manage_share", now) === void 0) return false;
    const result = db.prepare("UPDATE resource_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now, grantId);
    return Number(result.changes) === 1;
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
  constructor(code, message, retryable = false, retryAfterMs) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
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
  #peakRunning = 0;
  #started = 0;
  #completed = 0;
  #queuedCancelled = 0;
  #queue = [];
  #closing = false;
  get running() {
    return this.#running;
  }
  get queued() {
    return this.#queue.length;
  }
  get peakRunning() {
    return this.#peakRunning;
  }
  get started() {
    return this.#started;
  }
  get completed() {
    return this.#completed;
  }
  get queuedCancelled() {
    return this.#queuedCancelled;
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
          this.#queuedCancelled += 1;
          reject(new DOMException("aborted", "AbortError"));
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  async #start(password, salt, signal) {
    this.#running += 1;
    this.#peakRunning = Math.max(this.#peakRunning, this.#running);
    this.#started += 1;
    try {
      return await new Promise((resolve, reject) => {
        nodeScrypt(password, salt, KDF_CONFIG.keyLen, { N: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem }, (error, derived) => {
          if (error) reject(error);
          else {
            this.#completed += 1;
            resolve(derived);
          }
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
var AuthRateLimiter = class _AuthRateLimiter {
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
  static ACCOUNT_WINDOW_MS = 15 * 60 * 1e3;
  static SOURCE_WINDOW_MS = 60 * 1e3;
  static SOURCE_LIMIT = 30;
  static ACCOUNT_FAILURE_LIMIT = 5;
  #retryAfter(bucket, windowMs, now) {
    if (bucket === void 0) return 1e3;
    return Math.max(1e3, bucket.windowStarted + windowMs - now);
  }
  check(loginName, source, now = Date.now()) {
    this.#prune(this.#byLogin, now, _AuthRateLimiter.ACCOUNT_WINDOW_MS);
    this.#prune(this.#bySource, now, _AuthRateLimiter.SOURCE_WINDOW_MS);
    const account = this.#byLogin.get(loginName);
    const client = this.#bySource.get(source);
    if ((account?.count ?? 0) >= _AuthRateLimiter.ACCOUNT_FAILURE_LIMIT) throw new IdentityError("AUTH_RATE_LIMITED", "authentication attempts are temporarily limited", true, this.#retryAfter(account, _AuthRateLimiter.ACCOUNT_WINDOW_MS, now));
    if ((client?.count ?? 0) >= _AuthRateLimiter.SOURCE_LIMIT) throw new IdentityError("AUTH_RATE_LIMITED", "authentication attempts are temporarily limited", true, this.#retryAfter(client, _AuthRateLimiter.SOURCE_WINDOW_MS, now));
  }
  /** Count every syntactically valid authentication attempt before KDF work. */
  attempt(loginName, source, now = Date.now()) {
    this.check(loginName, source, now);
    const current = this.#bySource.get(source);
    if (current === void 0 || now - current.windowStarted >= _AuthRateLimiter.SOURCE_WINDOW_MS) this.#bySource.set(source, { count: 1, windowStarted: now });
    else current.count += 1;
    this.#bound(this.#bySource);
  }
  failure(loginName, source, now = Date.now()) {
    const bump = (map, key, windowMs) => {
      const current = map.get(key);
      if (current === void 0 || now - current.windowStarted >= windowMs) map.set(key, { count: 1, windowStarted: now });
      else current.count += 1;
    };
    bump(this.#byLogin, loginName, _AuthRateLimiter.ACCOUNT_WINDOW_MS);
    this.#bound(this.#byLogin);
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
    this.#limiter.attempt(loginName, input.source ?? "bootstrap");
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
    this.#limiter.attempt(loginName, input.source ?? "register");
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
    this.#limiter.attempt(loginName, input.source);
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
import { isIP } from "node:net";
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
  let unwrapped = value.trim().toLowerCase();
  if (unwrapped.startsWith("[") && unwrapped.endsWith("]")) unwrapped = unwrapped.slice(1, -1);
  const zone = unwrapped.indexOf("%");
  if (zone >= 0) unwrapped = unwrapped.slice(0, zone);
  if (isIP(unwrapped) === 4) {
    const octets = unwrapped.split(".").map(Number);
    return octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) && octets[0] === 127;
  }
  if (isIP(unwrapped) !== 6) return false;
  const ipv6 = unwrapped.includes(".") ? (() => {
    const at = unwrapped.lastIndexOf(":");
    const dotted = unwrapped.slice(at + 1).split(".").map(Number);
    if (dotted.length !== 4 || dotted.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return void 0;
    return `${unwrapped.slice(0, at)}:${(dotted[0] << 8 | dotted[1]).toString(16)}:${(dotted[2] << 8 | dotted[3]).toString(16)}`;
  })() : unwrapped;
  if (ipv6 === void 0) return false;
  const groups = ipv6.split("::");
  if (groups.length > 2) return false;
  const left = groups[0] === "" ? [] : groups[0].split(":");
  const right = groups.length === 2 && groups[1] !== "" ? groups[1].split(":") : [];
  if ([...left, ...right].some((item) => !/^[0-9a-f]{1,4}$/u.test(item))) return false;
  const missing = 8 - left.length - right.length;
  if (groups.length === 1 && missing !== 0 || groups.length === 2 && missing < 1) return false;
  const expanded = groups.length === 1 ? left : [...left, ...Array(missing).fill("0"), ...right];
  if (expanded.length !== 8) return false;
  const numbers = expanded.map((item) => Number.parseInt(item, 16));
  const plainLoopback = numbers.slice(0, 7).every((item) => item === 0) && numbers[7] === 1;
  const mappedLoopback = numbers.slice(0, 5).every((item) => item === 0) && numbers[5] === 65535 && numbers[6] >>> 8 === 127;
  return plainLoopback || mappedLoopback;
}
function isIdentityRuntimeAvailable(facts) {
  if (facts.connection?.authentication === void 0 || facts.connection.browserPeer?.signal?.aborted === true) return false;
  if (!isLoopbackAddress(facts.host)) return false;
  if (facts.protocol !== "http:" && facts.protocol !== "https:") return false;
  if (!Number.isInteger(facts.port) || (facts.port ?? 0) <= 0 || (facts.port ?? 0) > 65535) return false;
  if (facts.origin === void 0) return false;
  try {
    const parsed = new URL(facts.origin);
    if (parsed.protocol !== facts.protocol || !isLoopbackAddress(parsed.hostname)) return false;
    const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
    return port === facts.port;
  } catch {
    return false;
  }
}
function businessCookieName(serviceId, origin) {
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
      let text2;
      try {
        text2 = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
      } catch {
        reject(new HttpError(400, "INVALID_JSON", "request body is not valid UTF-8"));
        return;
      }
      try {
        resolve(JSON.parse(text2));
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
function requestSignal(req, res) {
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());
  req.once("close", () => {
    if (!req.complete) controller.abort();
  });
  res.once("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}
function createIdentityHandlers(options) {
  const { service } = options;
  const meta = (requestId) => ({ request_id: requestId, service_id: service.setupState.serviceId, server_time: (/* @__PURE__ */ new Date()).toISOString() });
  const withMeta = (requestId, data) => ({ data, meta: meta(requestId) });
  const tokenFor = (req) => {
    const origin = options.origin();
    if (origin === void 0) return void 0;
    const state = service.setupState;
    return readCookie(req, businessCookieName(state.serviceId, origin));
  };
  const assertAvailable = () => {
    if (!options.isAvailable() || options.origin() === void 0 || options.host() === void 0) throw new HttpError(503, "IDENTITY_UNAVAILABLE", "identity service is unavailable", true);
  };
  const assertNoQuery = (req) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if ([...url.searchParams.keys()].length > 0) throw new HttpError(422, "INPUT_INVALID", "query parameters are not supported");
  };
  const assertTrust = (req, mutation) => {
    const origin = options.origin();
    if (origin === void 0) throw new HttpError(503, "IDENTITY_UNAVAILABLE", "identity service is unavailable", true);
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
    const actor2 = actorFor(req);
    if (actor2 === void 0) throw new HttpError(401, "SESSION_EXPIRED", "business session is required");
    return actor2;
  };
  const dispatch = async (req, res, action2) => {
    const requestId = randomUUID4();
    try {
      assertAvailable();
      assertNoQuery(req);
      await action2();
    } catch (error) {
      if (res.writableEnded) return;
      let mapped;
      if (error instanceof HttpError) mapped = error;
      else if (error instanceof IdentityError) {
        const status2 = error.code === "INVALID_CREDENTIALS" ? 401 : error.code === "AUTH_RATE_LIMITED" ? 429 : error.code === "SETUP_REQUIRED" || error.code === "ALREADY_INITIALIZED" || error.code === "LOGIN_NAME_TAKEN" || error.code === "REVISION_CONFLICT" ? 409 : error.code === "INPUT_INVALID" ? 422 : 503;
        mapped = new HttpError(status2, error.code, error.message, error.retryable, error.code === "AUTH_RATE_LIMITED" ? { "retry-after": String(Math.max(1, Math.ceil((error.retryAfterMs ?? 6e4) / 1e3))) } : {});
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
    const signal = requestSignal(req, res);
    requireJson(req);
    const body = bodyObject(await readBody2(req));
    assertKeys(body, ["login_name", "password", "display_name", "timezone"]);
    const user = await service.bootstrap({ loginName: body.login_name, password: body.password, displayName: body.display_name, timezone: body.timezone, source: requestSource(req), signal });
    sendJson2(res, 201, withMeta(randomUUID4(), safeProfile(user)));
  });
  const register = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    const signal = requestSignal(req, res);
    requireJson(req);
    const body = bodyObject(await readBody2(req));
    assertKeys(body, ["login_name", "password", "display_name", "timezone"]);
    const user = await service.register({ loginName: body.login_name, password: body.password, displayName: body.display_name, timezone: body.timezone, source: requestSource(req), signal });
    sendJson2(res, 201, withMeta(randomUUID4(), safeProfile(user)));
  });
  const login = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    const signal = requestSignal(req, res);
    requireJson(req);
    const body = bodyObject(await readBody2(req));
    assertKeys(body, ["login_name", "password"]);
    const result = await service.login({ loginName: body.login_name, password: body.password, oldToken: tokenFor(req), source: requestSource(req), signal });
    const origin = options.origin();
    if (origin === void 0) throw new HttpError(503, "IDENTITY_UNAVAILABLE", "identity service is unavailable", true);
    const state = service.setupState;
    const name2 = businessCookieName(state.serviceId, origin);
    const maxAge = Math.floor((new Date(result.expiresAt).getTime() - Date.now()) / 1e3);
    sendJson2(res, 200, withMeta(randomUUID4(), safeProfile(result.user)), { "set-cookie": sessionCookie(name2, result.token, origin, options.protocol(), maxAge) });
  });
  const logout = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    requireJson(req);
    const body = bodyObject(await readBody2(req));
    assertKeys(body, []);
    service.logout(tokenFor(req));
    const origin = options.origin();
    if (origin === void 0) throw new HttpError(503, "IDENTITY_UNAVAILABLE", "identity service is unavailable", true);
    const state = service.setupState;
    const name2 = businessCookieName(state.serviceId, origin);
    sendEmpty(res, 204, { "set-cookie": clearCookie(name2, origin, options.protocol()) });
  });
  const me = async (req, res) => dispatch(req, res, () => {
    requireMethod(req, "GET");
    assertTrust(req, false);
    const actor2 = requireActor(req);
    const profile = service.profile(actor2.userId);
    if (profile === void 0) throw new HttpError(401, "SESSION_EXPIRED", "business session is required");
    sendJson2(res, 200, withMeta(randomUUID4(), safeProfile(profile)));
  });
  const preferences = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "PATCH");
    assertTrust(req, true);
    const actor2 = requireActor(req);
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
    sendJson2(res, 200, withMeta(randomUUID4(), safeProfile(service.preferences(actor2.userId, expectedRevision, patch))));
  });
  const spaces = async (req, res) => dispatch(req, res, () => {
    requireMethod(req, "GET");
    assertTrust(req, false);
    const actor2 = requireActor(req);
    const data = service.spaces(actor2.userId).map((space) => ({ id: space.id, service_id: space.serviceId, kind: space.kind, owner_user_id: space.ownerUserId, status: space.status, revision: space.revision, created_at: space.createdAt, updated_at: space.updatedAt }));
    sendJson2(res, 200, withMeta(randomUUID4(), data));
  });
  return { status, bootstrap, register, login, logout, me, preferences, spaces };
}
function buildAccountHtmlLegacy() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnowledgeOS \u8D26\u53F7</title><style>body{margin:0;background:#f4f8f8;color:#23333a;font-family:"Segoe UI","Microsoft YaHei UI",system-ui,sans-serif}main{max-width:880px;margin:0 auto;padding:32px 20px 56px}h1{margin:0 0 8px;font-size:28px}p{line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{background:#fff;border:1px solid #dce8e9;border-radius:14px;padding:20px;box-shadow:0 8px 24px #31535b12}label{display:block;margin:10px 0 5px;color:#597078;font-size:13px}input,textarea,select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c8d8da;border-radius:8px;font:inherit}textarea{min-height:90px}button{margin-top:14px;border:0;border-radius:8px;background:#3d7e86;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}button.secondary{background:#edf5f6;color:#315e65}small{color:#6b7d82}.message{padding:10px 12px;border-radius:8px;background:#edf5f6;margin:12px 0;white-space:pre-wrap}.hidden{display:none}.pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#edf5f6;color:#315e65;font-size:12px}</style></head><body><main><h1>KnowledgeOS \u8D26\u53F7</h1><p id="state">\u6B63\u5728\u8BFB\u53D6\u672C\u673A\u4E1A\u52A1\u8EAB\u4EFD\u2026</p><div id="message" class="message hidden"></div><div class="grid"><section class="card"><h2>\u767B\u5F55</h2><label>\u767B\u5F55\u540D</label><input id="login_name"><label>\u5BC6\u7801</label><input id="login_password" type="password"><button id="login">\u767B\u5F55</button></section><section class="card"><h2>\u6CE8\u518C\u666E\u901A\u8D26\u53F7</h2><label>\u767B\u5F55\u540D</label><input id="register_name"><label>\u663E\u793A\u540D\u79F0</label><input id="register_display"><label>\u5BC6\u7801\uFF0815\u2013128 \u4F4D\uFF09</label><input id="register_password" type="password"><button id="register">\u6CE8\u518C</button></section></div><section id="profile" class="card hidden" style="margin-top:16px"><h2>\u6211\u7684\u4E2A\u4EBA\u7A7A\u95F4</h2><p id="who"></p><label>\u65B9\u5411\uFF08\u9017\u53F7\u5206\u9694\uFF09</label><input id="domains" placeholder="software_engineering,system_architecture"><label>\u5B66\u4E60\u4E3B\u7EBF\uFF08\u9017\u53F7\u5206\u9694\uFF09</label><input id="tracks" placeholder="engineering_practice,architecture_exam"><label>\u76EE\u6807</label><textarea id="goal"></textarea><label>\u65F6\u533A</label><input id="timezone" value="Asia/Shanghai"><button id="save">\u4FDD\u5B58\u4E2A\u4EBA\u504F\u597D</button><button id="logout" class="secondary">\u9000\u51FA</button></section></main><script>(async()=>{const $=id=>document.getElementById(id);let revision=1;let generation=0;const msg=(text,bad=false)=>{const el=$("message");el.textContent=text;el.className="message";el.style.background=bad?"#fbefee":"#edf5f6"};const call=async(path,options={})=>{const headers={...(options.headers||{})};if(options.method&&options.method!=="GET"){headers["content-type"]="application/json";headers["x-knowledgeos-request"]="1"}const r=await fetch(path,{...options,headers});let j;try{j=await r.json()}catch{}if(!r.ok)throw new Error(j?.message||("\u8BF7\u6C42\u5931\u8D25 "+r.status));return j};const load=async()=>{const requestGeneration=++generation;try{const j=await call("/knowledge/v1/me");if(requestGeneration!==generation)return;const u=j.data;revision=u.revision;$("state").textContent="\u5DF2\u767B\u5F55 \xB7 "+u.role;$("who").textContent=u.display_name+"\uFF08"+u.login_name+"\uFF09 \xB7 \u4E2A\u4EBA\u7A7A\u95F4 "+u.personal_space_id;$("domains").value=(u.domains||[]).join(",");$("tracks").value=(u.learning_tracks||[]).join(",");$("goal").value=u.goal_text||"";$("timezone").value=u.timezone||"Asia/Shanghai";$("profile").className="card"}catch{if(requestGeneration!==generation)return;$("state").textContent="\u672A\u767B\u5F55\uFF0C\u53EF\u6CE8\u518C\u6216\u767B\u5F55";$("profile").className="card hidden"}};$("login").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/login",{method:"POST",body:JSON.stringify({login_name:$("login_name").value,password:$("login_password").value})});if(requestGeneration!==generation)return;$("login_password").value="";await load();msg("\u767B\u5F55\u6210\u529F")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("register").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/register",{method:"POST",body:JSON.stringify({login_name:$("register_name").value,display_name:$("register_display").value,password:$("register_password").value})});if(requestGeneration!==generation)return;$("register_password").value="";msg("\u6CE8\u518C\u6210\u529F\uFF0C\u8BF7\u767B\u5F55")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("save").onclick=async()=>{const requestGeneration=generation;try{const j=await call("/knowledge/v1/me/preferences",{method:"PATCH",body:JSON.stringify({expected_revision:revision,domains:$("domains").value.split(",").map(x=>x.trim()).filter(Boolean),learning_tracks:$("tracks").value.split(",").map(x=>x.trim()).filter(Boolean),goal_text:$("goal").value,timezone:$("timezone").value})});if(requestGeneration!==generation)return;revision=j.data.revision;msg("\u4E2A\u4EBA\u504F\u597D\u5DF2\u4FDD\u5B58")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};$("logout").onclick=async()=>{const requestGeneration=++generation;try{await call("/knowledge/v1/auth/logout",{method:"POST",body:"{}"});if(requestGeneration!==generation)return;$("profile").className="card hidden";$("state").textContent="\u5DF2\u9000\u51FA";$("who").textContent="";msg("\u5DF2\u9000\u51FA")}catch(e){if(requestGeneration!==generation)return;msg(e.message,true)}};await load()})()</script></body></html>`;
}
function buildAccountHtml() {
  const html = buildAccountHtmlLegacy();
  const script = String.raw`<script>(async()=>{const $=id=>document.getElementById(id);let revision=0,generation=0,authenticatedGeneration=0,canSave=false;const msg=(text,bad=false)=>{const el=$("message");el.textContent=text;el.className="message";el.style.background=bad?"#fbefee":"#edf5f6"};const clearProfile=()=>{revision=0;authenticatedGeneration=0;canSave=false;$("save").disabled=true;["who","domains","tracks","goal","timezone","login_password","register_password"].forEach(id=>{const el=$(id);if(el)el.value=""});$("profile").className="card hidden"};const stateFor=e=>e?.status===401?"未登录，可注册或登录":e?.status===429?"请求受限，请稍后再试":e?.status===503?"服务不可用，请稍后重试":"请求失败";const call=async(path,options={})=>{const headers={...(options.headers||{})};if(options.method&&options.method!=="GET"){headers["content-type"]="application/json";headers["x-knowledgeos-request"]="1"}const r=await fetch(path,{...options,headers});let j;try{j=await r.json()}catch{}if(!r.ok){const e=new Error(j?.message||("请求失败 "+r.status));e.status=r.status;throw e}return j};const load=async(existingGeneration)=>{const my=existingGeneration===undefined?++generation:existingGeneration;clearProfile();try{const j=await call("/knowledge/v1/me");if(my!==generation)return;const u=j.data;revision=u.revision;$("state").textContent="已登录 · "+u.role;$("who").textContent=u.display_name+"（"+u.login_name+"） · 个人空间 "+u.personal_space_id;$("domains").value=(u.domains||[]).join(",");$("tracks").value=(u.learning_tracks||[]).join(",");$("goal").value=u.goal_text||"";$("timezone").value=u.timezone||"Asia/Shanghai";authenticatedGeneration=my;canSave=true;$("save").disabled=false;$("profile").className="card"}catch(e){if(my!==generation)return;clearProfile();$("state").textContent=stateFor(e);msg(e?.message||"请求失败",true)}};$("login").onclick=async()=>{const loginName=$("login_name").value;const loginPassword=$("login_password").value;const my=++generation;clearProfile();$("state").textContent="正在登录…";try{await call("/knowledge/v1/auth/login",{method:"POST",body:JSON.stringify({login_name:loginName,password:loginPassword})});if(my!==generation)return;$("login_password").value="";await load(my);if(my===generation&&canSave)msg("登录成功")}catch(e){if(my!==generation)return;clearProfile();$("state").textContent=stateFor(e);msg(e?.message||"登录失败",true)}};$("register").onclick=async()=>{const my=++generation;try{await call("/knowledge/v1/auth/register",{method:"POST",body:JSON.stringify({login_name:$("register_name").value,display_name:$("register_display").value,password:$("register_password").value})});if(my!==generation)return;$("register_password").value="";msg("注册成功，请登录")}catch(e){if(my!==generation)return;msg(e?.message||"注册失败",true)}};$("save").onclick=async()=>{const my=authenticatedGeneration;if(!canSave||my!==generation)return;try{const j=await call("/knowledge/v1/me/preferences",{method:"PATCH",body:JSON.stringify({expected_revision:revision,domains:$("domains").value.split(",").map(x=>x.trim()).filter(Boolean),learning_tracks:$("tracks").value.split(",").map(x=>x.trim()).filter(Boolean),goal_text:$("goal").value,timezone:$("timezone").value})});if(my!==generation)return;revision=j.data.revision;msg("个人偏好已保存")}catch(e){if(my!==generation)return;if(e?.status===401||e?.status===503){clearProfile();$("state").textContent=stateFor(e)}msg(e?.message||"保存失败",true)}};$("logout").onclick=async()=>{const my=++generation;clearProfile();$("state").textContent="正在退出…";try{await call("/knowledge/v1/auth/logout",{method:"POST",body:"{}"});if(my!==generation)return;$("state").textContent="已退出";msg("已退出")}catch(e){if(my!==generation)return;$("state").textContent=stateFor(e);msg(e?.message||"退出失败",true)}};await load()})()</script>`;
  return html.replace(/<script>[\s\S]*?<\/script>/, script);
}
function buildSetupHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnowledgeOS \u521D\u59CB\u5316</title><style>body{margin:0;background:#f4f8f8;color:#23333a;font-family:"Segoe UI","Microsoft YaHei UI",system-ui,sans-serif}main{max-width:560px;margin:0 auto;padding:48px 20px}.card{background:#fff;border:1px solid #dce8e9;border-radius:14px;padding:24px}label{display:block;margin:12px 0 5px;color:#597078;font-size:13px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c8d8da;border-radius:8px;font:inherit}button{margin-top:16px;border:0;border-radius:8px;background:#3d7e86;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}.message{margin-top:12px;padding:10px;border-radius:8px;background:#edf5f6;white-space:pre-wrap}</style></head><body><main><section class="card"><h1>\u9996\u6B21\u7BA1\u7406\u5458\u521D\u59CB\u5316</h1><p>\u4EC5\u53EF\u4FE1\u672C\u673A DSH owner \u53EF\u4EE5\u5B8C\u6210\u4E00\u6B21\u521D\u59CB\u5316\u3002</p><label>\u7BA1\u7406\u5458\u767B\u5F55\u540D</label><input id="name"><label>\u663E\u793A\u540D\u79F0</label><input id="display"><label>\u5BC6\u7801\uFF0815\u2013128 \u4F4D\uFF09</label><input id="password" type="password"><button id="submit">\u521B\u5EFA\u7BA1\u7406\u5458</button><div id="message" class="message"></div></section></main><script>document.getElementById('submit').onclick=async()=>{const m=document.getElementById('message');try{const r=await fetch('/knowledge/v1/auth/bootstrap',{method:'POST',headers:{'content-type':'application/json','x-knowledgeos-request':'1'},body:JSON.stringify({login_name:document.getElementById('name').value,display_name:document.getElementById('display').value,password:document.getElementById('password').value})});const j=await r.json();if(!r.ok)throw new Error(j.message||('\u8BF7\u6C42\u5931\u8D25 '+r.status));document.getElementById('password').value='';m.textContent='\u521D\u59CB\u5316\u5B8C\u6210\uFF0C\u8BF7\u524D\u5F80\u8D26\u53F7\u9875\u767B\u5F55\u3002'}catch(e){m.textContent=e.message}}</script></body></html>`;
}

// src/host/objects-http.ts
import { randomUUID as randomUUID5 } from "node:crypto";
var ObjectHttpError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
var json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(JSON.stringify(data));
};
var pathOf = (req) => new URL(req.url ?? "/", "http://localhost").pathname;
var safeObject = (object, includeBody = true) => ({ id: object.id, service_id: object.serviceId, space_id: object.spaceId, scope: object.scope, project_id: object.projectId, owner_user_id: object.ownerUserId, object_type: object.objectType, title: object.title, ...includeBody ? { body: object.body } : {}, status: object.status, revision: object.revision, created_at: object.createdAt, updated_at: object.updatedAt });
var readBody3 = async (req) => await new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > 16 * 1024) {
      reject(new ObjectHttpError(413, "PAYLOAD_TOO_LARGE", "request body exceeds the limit"));
      req.resume();
    } else chunks.push(chunk);
  });
  req.on("end", () => {
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
      resolve(value);
    } catch {
      reject(new ObjectHttpError(400, "INVALID_JSON", "request body is not valid JSON"));
    }
  });
  req.on("error", () => reject(new ObjectHttpError(400, "INVALID_JSON", "request body could not be read")));
});
var keys = (body, allowed) => {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new ObjectHttpError(422, "INPUT_INVALID", "body contains an unsupported field");
};
var action = (value) => {
  if (typeof value !== "string" || !AUTH_ACTIONS.includes(value)) throw new ObjectHttpError(422, "INPUT_INVALID", "action is invalid");
  return value;
};
var text = (value, name2, max) => {
  if (typeof value !== "string" || value.length < 1 || value.length > max || !value.isWellFormed()) throw new ObjectHttpError(422, "INPUT_INVALID", `${name2} is invalid`);
  return value;
};
function trust(req, origin, mutation) {
  if (origin === void 0 || req.headers.host !== new URL(origin).host) throw new ObjectHttpError(403, "CSRF_REJECTED", "request authority is not trusted");
  if (req.headers.origin !== void 0 && req.headers.origin !== origin) throw new ObjectHttpError(403, "CSRF_REJECTED", "request origin is not trusted");
  if (req.headers["sec-fetch-site"] === "cross-site") throw new ObjectHttpError(403, "CSRF_REJECTED", "cross-site request is not trusted");
  if (mutation && req.headers["x-knowledgeos-request"] !== "1") throw new ObjectHttpError(403, "CSRF_REJECTED", "missing KnowledgeOS request header");
  if (new URL(req.url ?? "/", origin).search) throw new ObjectHttpError(422, "INPUT_INVALID", "query parameters are not supported");
}
function actor(options, req) {
  const value = options.actorFor(req);
  if (value === void 0) throw new ObjectHttpError(401, "SESSION_EXPIRED", "business session is required");
  return value;
}
function createObjectHandlers(options) {
  return async (req, res) => {
    const requestId = randomUUID5();
    try {
      const path = pathOf(req);
      const segments = path.split("/").filter(Boolean);
      trust(req, options.origin(), req.method !== "GET");
      const current = actor(options, req);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (segments[2] === "projects" && segments.length === 3 && req.method === "POST") {
        const body = await readBody3(req);
        keys(body, ["name"]);
        const project = options.storage.createProject({ id: randomUUID5(), serviceId: current.serviceId, ownerUserId: current.userId, name: text(body.name, "name", 200), now });
        json(res, 201, { data: project, meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
        return;
      }
      if (segments[2] === "projects" && segments.length === 5 && segments[4] === "memberships" && req.method === "POST") {
        const body = await readBody3(req);
        keys(body, ["user_id", "role", "valid_from", "expires_at"]);
        const projectId = segments[3];
        if (!options.storage.canManageProject(current, projectId)) throw new ObjectHttpError(404, "NOT_FOUND", "project not found");
        options.storage.addProjectMembership({ projectId, userId: text(body.user_id, "user_id", 80), role: body.role === void 0 ? "member" : text(body.role, "role", 20), validFrom: body.valid_from === void 0 ? now : text(body.valid_from, "valid_from", 40), expiresAt: body.expires_at === void 0 ? void 0 : text(body.expires_at, "expires_at", 40) });
        res.statusCode = 204;
        res.end();
        return;
      }
      if (segments[2] === "objects") {
        if (segments.length === 3 && req.method === "GET") {
          json(res, 200, { data: options.storage.listObjects(current, "read", now).map((item) => safeObject(item, false)), meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
          return;
        }
        if (segments.length === 3 && req.method === "POST") {
          const body = await readBody3(req);
          keys(body, ["title", "body", "object_type", "scope", "project_id"]);
          const scope = body.scope ?? "personal";
          if (scope !== "personal" && scope !== "project") throw new ObjectHttpError(422, "INPUT_INVALID", "scope is invalid");
          const projectId = body.project_id === void 0 ? void 0 : text(body.project_id, "project_id", 80);
          if (scope === "project" && projectId === void 0) throw new ObjectHttpError(422, "INPUT_INVALID", "project_id is required for project objects");
          if (scope === "personal" && projectId !== void 0) throw new ObjectHttpError(422, "INPUT_INVALID", "project_id is not allowed for personal objects");
          if (scope === "project" && !options.storage.canCreateProjectObject(current, projectId, now)) throw new ObjectHttpError(404, "NOT_FOUND", "project not found");
          const title = text(body.title, "title", 200);
          const content = text(body.body, "body", 1e5);
          const object = options.storage.createObject({ id: randomUUID5(), serviceId: current.serviceId, spaceId: current.personalSpaceId, scope, projectId, ownerUserId: current.userId, objectType: body.object_type === void 0 ? "note" : text(body.object_type, "object_type", 80), title, body: content, now });
          json(res, 201, { data: safeObject(object), meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
          return;
        }
        const objectId = segments[3];
        if (objectId === void 0) throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
        if (segments.length === 4 && req.method === "GET") {
          const object = options.storage.authorizeObject(current, objectId, "read", now);
          if (object === void 0) throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
          json(res, 200, { data: safeObject(object), meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
          return;
        }
        if (segments.length === 4 && req.method === "PATCH") {
          const body = await readBody3(req);
          keys(body, ["expected_revision", "title", "body"]);
          if (!Number.isInteger(body.expected_revision) || Number(body.expected_revision) < 1) throw new ObjectHttpError(422, "INPUT_INVALID", "expected_revision is invalid");
          const result = options.storage.updateObject(current, objectId, Number(body.expected_revision), { title: body.title === void 0 ? void 0 : text(body.title, "title", 200), body: body.body === void 0 ? void 0 : text(body.body, "body", 1e5) }, now);
          if (result.kind === "not_found") throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
          if (result.kind === "conflict") throw new ObjectHttpError(409, "REVISION_CONFLICT", "object revision has changed");
          json(res, 200, { data: safeObject(result.object), meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
          return;
        }
        if (segments.length === 4 && req.method === "DELETE") {
          if (!options.storage.deleteObject(current, objectId, now)) throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
          res.statusCode = 204;
          res.end();
          return;
        }
        if (segments.length === 5 && segments[4] === "action" && req.method === "POST") {
          const body = await readBody3(req);
          keys(body, ["action"]);
          const wanted = action(body.action);
          if (options.storage.authorizeObject(current, objectId, wanted, now) === void 0) throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
          json(res, 200, { data: { allowed: true, action: wanted, object_id: objectId }, meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
          return;
        }
      }
      if (segments[2] === "grants" && segments.length === 3 && req.method === "POST") {
        const body = await readBody3(req);
        keys(body, ["object_id", "subject_type", "subject_id", "action", "valid_from", "expires_at"]);
        if (body.subject_type !== "user" && body.subject_type !== "project") throw new ObjectHttpError(422, "INPUT_INVALID", "subject_type is invalid");
        const grant = options.storage.grantObject(current, { id: randomUUID5(), objectId: text(body.object_id, "object_id", 80), serviceId: current.serviceId, subjectType: body.subject_type, subjectId: text(body.subject_id, "subject_id", 80), action: action(body.action), validFrom: body.valid_from === void 0 ? now : text(body.valid_from, "valid_from", 40), expiresAt: body.expires_at === void 0 ? void 0 : text(body.expires_at, "expires_at", 40), now });
        if (grant === void 0) throw new ObjectHttpError(404, "NOT_FOUND", "object not found");
        json(res, 201, { data: grant, meta: { request_id: requestId, service_id: current.serviceId, server_time: now } });
        return;
      }
      if (segments[2] === "grants" && segments.length === 4 && segments[3] === "revoke" && req.method === "POST") {
        const body = await readBody3(req);
        keys(body, ["grant_id", "id"]);
        const grantId = body.grant_id ?? body.id;
        if (grantId === void 0) throw new ObjectHttpError(422, "INPUT_INVALID", "grant_id is required");
        if (!options.storage.revokeGrant(current, text(grantId, "grant_id", 80), now)) throw new ObjectHttpError(404, "NOT_FOUND", "grant not found");
        res.statusCode = 204;
        res.end();
        return;
      }
      throw new ObjectHttpError(404, "NOT_FOUND", "route not found");
    } catch (error) {
      if (error instanceof ObjectHttpError) {
        json(res, error.status, { code: error.code, message: error.message, request_id: requestId, retryable: false, safe_details: {} });
        return;
      }
      if (error instanceof RecordsError) {
        json(res, 503, { code: error.code, message: "storage is unavailable", request_id: requestId, retryable: error.retryable, safe_details: {} });
        return;
      }
      json(res, 500, { code: "INTERNAL_ERROR", message: "internal error", request_id: requestId, retryable: false, safe_details: {} });
    }
  };
}

// src/host/ai-service.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

// src/host/ai-tools.ts
import { createHash as createHash5 } from "node:crypto";
var AiError = class extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
    this.name = "AiError";
  }
};
var TOOL_NAMES = ["knowledgeos_read_object", "knowledgeos_update_object"];
var TOOL_SCHEMAS = [
  { name: TOOL_NAMES[0], description: "Read the specified existing KnowledgeOS test object. Server enforces the logged-in user permissions.", parameters: { type: "object", properties: { object_id: { type: "string" } }, required: ["object_id"], additionalProperties: false } },
  { name: TOOL_NAMES[1], description: "Update the specified existing KnowledgeOS test object at expected_revision. Supply title and/or body. Server enforces identity, permissions, revision and idempotency.", parameters: { type: "object", properties: { object_id: { type: "string" }, expected_revision: { type: "integer", minimum: 1 }, title: { type: "string", minLength: 1, maxLength: 200 }, body: { type: "string", maxLength: 2e3 } }, required: ["object_id", "expected_revision"], additionalProperties: false } }
];
function aiText(value, max, empty = false) {
  if (typeof value !== "string" || !empty && value.length === 0 || value.length > max || !value.isWellFormed()) throw new AiError(422, "INPUT_INVALID");
  return value;
}
function onlyKeys(value, keys2) {
  if (Object.keys(value).some((key) => !keys2.includes(key))) throw new AiError(422, "INPUT_INVALID");
}
function toolArguments(call) {
  if (!TOOL_NAMES.includes(call.name)) throw new AiError(422, "TOOL_NOT_ALLOWED");
  if (call.arguments.length > 6e3) throw new AiError(422, "MODEL_OUTPUT_INVALID");
  let raw;
  try {
    raw = JSON.parse(call.arguments);
  } catch {
    throw new AiError(422, "MODEL_OUTPUT_INVALID");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AiError(422, "MODEL_OUTPUT_INVALID");
  const args = raw;
  onlyKeys(args, call.name === TOOL_NAMES[0] ? ["object_id"] : ["object_id", "expected_revision", "title", "body"]);
  const object_id = aiText(args.object_id, 80);
  if (call.name === TOOL_NAMES[0]) return { object_id };
  if (!Number.isSafeInteger(args.expected_revision) || Number(args.expected_revision) < 1 || args.title === void 0 && args.body === void 0) throw new AiError(422, "MODEL_OUTPUT_INVALID");
  return { object_id, expected_revision: Number(args.expected_revision), ...args.title === void 0 ? {} : { title: aiText(args.title, 200) }, ...args.body === void 0 ? {} : { body: aiText(args.body, 2e3, true) } };
}
function toolDigest(name2, input) {
  return createHash5("sha256").update(JSON.stringify([name2, input.object_id, input.expected_revision ?? null, input.title ?? null, input.body ?? null])).digest("hex");
}
function runBusinessTool(store, actor2, call, key, now) {
  const input = toolArguments(call);
  if (call.name === TOOL_NAMES[0]) {
    const object = store.authorizeObject(actor2, input.object_id, "read", now);
    return object === void 0 ? { ok: false, status: 404, code: "NOT_FOUND" } : { ok: true, status: 200, code: "READ", object };
  }
  const result = store.mutateObjectOnce(actor2, { objectId: input.object_id, expectedRevision: input.expected_revision, title: input.title, body: input.body, key, digest: toolDigest(call.name, input) }, now);
  if (result.kind === "updated" || result.kind === "replayed") return { ok: true, status: 200, code: result.kind === "updated" ? "UPDATED" : "REPLAYED", object: result.object, replayed: result.kind === "replayed" };
  const errors = { not_found: [404, "NOT_FOUND"], session_expired: [401, "AUTH_REQUIRED"], conflict: [409, "REVISION_CONFLICT"], idempotency_conflict: [409, "IDEMPOTENCY_CONFLICT"] };
  const [status, code] = errors[result.kind];
  return { ok: false, status, code };
}

// src/host/ai-service.ts
var SYSTEM = "Choose exactly one provided KnowledgeOS tool for the user instruction. Use only the specified target object and revision. Do not invent identities, permissions, SQL, paths or commands. Reading uses knowledgeos_read_object. Updating title/body uses knowledgeos_update_object. Do not claim success; the server will execute the tool. Return one tool call.";
function modelFailure(error) {
  if (error instanceof AiError) return error;
  const e = error;
  const f = e?.failure ?? e ?? {}, code = String(f.code ?? ""), message = String(f.message ?? "").toLowerCase();
  if (["MISSING_CREDENTIAL", "NO_CREDENTIAL_STORE"].includes(code)) return new AiError(503, "CREDENTIALS_MISSING");
  if (/QUOTA|BALANCE/.test(code) || f.status === 402) return new AiError(429, "QUOTA_EXHAUSTED");
  if (f.status === 403 || /PERMISSION/.test(code)) return new AiError(403, "PROVIDER_PERMISSION_DENIED");
  if (f.status === 401 || /AUTH|CREDENTIAL|API_KEY/.test(code)) return new AiError(502, "CREDENTIALS_INVALID");
  if (f.status === 404 || /MODEL_NOT_FOUND|UNKNOWN_MODEL|MODEL_UNSUPPORTED/.test(code)) return new AiError(404, "MODEL_NOT_FOUND");
  if (/NO_ADAPTER/.test(code)) return new AiError(503, "MODEL_NOT_CONFIGURED");
  if (/TIMEOUT/.test(code)) return new AiError(504, "MODEL_TIMEOUT");
  if (/ABORT/.test(code)) return new AiError(409, "CANCELLED");
  if (f.status === 429 || /RATE_LIMIT/.test(code)) return new AiError(429, message.includes("insufficient_quota") ? "QUOTA_EXHAUSTED" : "PROVIDER_RATE_LIMITED");
  if (!code && /missing|not configured|no api key|credential.*required/.test(message) && /key|credential|auth/.test(message)) return new AiError(503, "CREDENTIALS_MISSING");
  return new AiError(502, "MODEL_FAILED");
}
var AiService = class {
  constructor(store, config, llm, tools) {
    this.store = store;
    this.config = config;
    this.llm = llm;
    this.tools = tools;
    for (const [value, min, max, integer] of [[config.maxCalls ?? 8, 1, 64, true], [config.timeoutMs ?? 3e4, 100, 6e4, true], [config.budgetUsd ?? 0.1, 1e-3, 1, false]]) {
      if (!Number.isFinite(value) || value < min || value > max || integer && !Number.isSafeInteger(value)) throw new AiError(503, "AI_CONFIG_INVALID");
    }
    if (tools !== void 0) for (const schema of TOOL_SCHEMAS) this.#dispose.push(tools.register({
      ...schema,
      output: { schema: { type: "object" }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
      execute: async (args, exec) => {
        const bound = this.#scope.getStore();
        if (!bound || bound.call.id !== exec.callId || bound.call.name !== exec.name) return { ok: false, status: 403, code: "TOOL_CONTEXT_REQUIRED" };
        try {
          if (exec.signal.aborted) throw new AiError(409, "CANCELLED");
          const current = bound.actorNow();
          if (!current || current.sessionId !== bound.actor.sessionId || current.userId !== bound.actor.userId || current.serviceId !== bound.actor.serviceId) throw new AiError(401, "AUTH_REQUIRED");
          const call = { id: exec.callId, name: exec.name, arguments: JSON.stringify(args) };
          if (toolDigest(call.name, toolArguments(call)) !== toolDigest(bound.call.name, toolArguments(bound.call))) throw new AiError(403, "TOOL_CONTEXT_REQUIRED");
          const result = runBusinessTool(this.store, current, call, bound.key, (/* @__PURE__ */ new Date()).toISOString());
          bound.onResult(result);
          return JSON.parse(JSON.stringify(result));
        } catch (error) {
          if (error instanceof AiError || error instanceof RecordsError) return { ok: false, status: error instanceof AiError ? error.status : 503, code: error.code };
          throw error;
        }
      }
    }));
  }
  #scope = new AsyncLocalStorage();
  #prepared = /* @__PURE__ */ new Map();
  #pending = /* @__PURE__ */ new Map();
  #calls = 0;
  #reservedUsd = 0;
  #closed = false;
  #dispose = [];
  status() {
    return { provider: this.config.provider ?? null, model: this.config.model ?? null, configured: Boolean(this.config.provider && this.config.model && this.llm && this.tools), max_calls: this.config.maxCalls ?? 8, attempts: this.#calls, max_output_tokens: 512, timeout_ms: this.config.timeoutMs ?? 3e4, budget_usd: this.config.budgetUsd ?? 0.1, reserved_usd: this.#reservedUsd, usage: "reported_by_provider_when_available", state: this.#closed ? "stopped" : "ready" };
  }
  #sweep() {
    for (const [id, item] of this.#prepared) if (Date.now() >= item.expiresAt && item.state !== "executing") this.#prepared.delete(id);
  }
  async prepare(actor2, raw, signal) {
    onlyKeys(raw, ["request_id", "instruction", "object_id", "expected_revision", "idempotency_key"]);
    const instruction = aiText(raw.instruction, 2e3), objectId = aiText(raw.object_id, 80), requestId = aiText(raw.request_id, 80), key = aiText(raw.idempotency_key, 128);
    if (!Number.isSafeInteger(raw.expected_revision) || Number(raw.expected_revision) < 1) throw new AiError(422, "INPUT_INVALID");
    if (this.#closed || !this.llm || !this.tools || !this.config.provider || !this.config.model) throw new AiError(503, "MODEL_NOT_CONFIGURED");
    if (signal.aborted) throw new AiError(409, "CANCELLED");
    this.#sweep();
    if (this.#pending.has(requestId)) throw new AiError(409, "REQUEST_CONFLICT");
    if (this.#pending.size >= 4 || this.#prepared.size >= 100 || [...this.#pending.values()].some((p) => p.actor.userId === actor2.userId)) throw new AiError(429, "REQUEST_LIMIT");
    const controller = new AbortController();
    this.#pending.set(requestId, { actor: actor2, controller });
    const onAbort = () => controller.abort(new AiError(409, "CANCELLED"));
    signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new AiError(504, "MODEL_TIMEOUT")), this.config.timeoutMs ?? 3e4);
    let usage;
    try {
      const available = this.llm.listProviders().some((p) => p.id === this.config.provider);
      if (!available) throw new AiError(503, "MODEL_NOT_CONFIGURED");
      const catalog = await this.#abortable(this.llm.listModels(this.config.provider), controller.signal);
      if (catalog.length > 0 && !catalog.some((m) => m.id === this.config.model)) throw new AiError(404, "MODEL_NOT_FOUND");
      const prices = [this.config.inputUsdPerMillion, this.config.outputUsdPerMillion];
      if (prices.some((p) => p === void 0 || !Number.isFinite(p) || p < 0)) throw new AiError(503, "PRICE_BUDGET_NOT_CONFIGURED");
      const userText = JSON.stringify({ instruction, target_object_id: objectId, expected_revision: raw.expected_revision });
      const inputBound = Buffer.byteLength(JSON.stringify({ system: SYSTEM, messages: userText, tools: TOOL_SCHEMAS }), "utf8") + 2048;
      const reserve = (inputBound * prices[0] + 512 * prices[1]) / 1e6;
      if (this.#calls >= (this.config.maxCalls ?? 8) || this.#reservedUsd + reserve > (this.config.budgetUsd ?? 0.1)) throw new AiError(429, "MODEL_BUDGET_EXCEEDED");
      this.#calls++;
      this.#reservedUsd += reserve;
      const calls = [];
      let finish, outputBytes = 0;
      const stream = this.llm.stream({ provider: this.config.provider, model: this.config.model, system: SYSTEM, messages: [{ role: "user", content: [{ type: "text", text: userText }] }], tools: TOOL_SCHEMAS, maxTokens: 512, signal: controller.signal })[Symbol.asyncIterator]();
      try {
        while (true) {
          const next = await this.#abortable(stream.next(), controller.signal);
          if (next.done) break;
          const chunk = next.value;
          outputBytes += Buffer.byteLength(JSON.stringify(chunk), "utf8");
          if (outputBytes > 96e3 || finish !== void 0) throw new AiError(502, "MODEL_OUTPUT_INVALID");
          if (chunk.type === "block-end" && chunk.block?.type === "tool-call") {
            const b = chunk.block;
            if (!b.id || !b.name || typeof b.arguments !== "string") throw new AiError(502, "MODEL_OUTPUT_INVALID");
            calls.push({ id: b.id, name: b.name, arguments: b.arguments });
          }
          if (chunk.type === "usage") usage = chunk.usage;
          if (chunk.type === "finish") {
            finish = chunk.reason?.kind;
            if (controller.signal.aborted) throw controller.signal.reason;
            if (finish === "error" || finish === "aborted") throw modelFailure(chunk.reason?.failure);
          }
        }
      } finally {
        if (controller.signal.aborted) void stream.return?.().catch(() => {
        });
      }
      if (controller.signal.aborted) throw controller.signal.reason;
      if (finish !== "tool-calls" || calls.length !== 1) throw new AiError(502, "MODEL_OUTPUT_INVALID");
      const call = calls[0], args = toolArguments(call);
      if (args.object_id !== objectId || call.name === TOOL_NAMES[1] && args.expected_revision !== raw.expected_revision) throw new AiError(422, "MODEL_TARGET_MISMATCH");
      const prepared = { id: randomUUID6(), requestId, actor: actor2, key, call, expiresAt: Date.now() + 12e4, state: "prepared" };
      this.#prepared.set(prepared.id, prepared);
      return { ...this.#view(prepared), usage: usage ?? null };
    } catch (error) {
      throw controller.signal.aborted ? controller.signal.reason : modelFailure(error);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      this.#pending.delete(requestId);
    }
  }
  async #abortable(pending, signal) {
    if (signal.aborted) throw signal.reason;
    return await new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }
  #view(item) {
    return { prepared_id: item.id, request_id: item.requestId, provider: this.config.provider, model: this.config.model, state: item.state, tool: item.call.name, arguments: toolArguments(item.call), expires_at: new Date(item.expiresAt).toISOString() };
  }
  cancel(actor2, requestId) {
    const pending = this.#pending.get(requestId);
    if (pending && pending.actor.sessionId === actor2.sessionId) pending.controller.abort(new AiError(409, "CANCELLED"));
    for (const item of this.#prepared.values()) if (item.requestId === requestId && item.actor.sessionId === actor2.sessionId) {
      if (item.state === "executing") {
        if (item.committed) throw new AiError(409, "OPERATION_ALREADY_COMPLETED");
        item.execution?.abort(new AiError(409, "CANCELLED"));
      }
      if (item.state === "succeeded") throw new AiError(409, "OPERATION_ALREADY_COMPLETED");
      if (item.state === "prepared") {
        item.state = "failed";
        item.result = { ok: false, status: 409, code: "CANCELLED" };
      }
    }
  }
  async execute(actor2, actorNow, id, signal) {
    this.#sweep();
    const item = this.#prepared.get(id);
    if (this.#closed || !item || item.actor.sessionId !== actor2.sessionId || item.actor.userId !== actor2.userId) throw new AiError(404, "PREPARED_NOT_FOUND");
    if (signal.aborted) throw new AiError(409, "CANCELLED");
    if (item.state === "executing") throw new AiError(409, "REQUEST_IN_PROGRESS");
    if (item.state === "failed") throw new AiError(item.result?.status ?? 409, item.result?.code ?? "REQUEST_FAILED");
    item.state = "executing";
    const controller = new AbortController();
    item.execution = controller;
    item.committed = false;
    const abort = () => controller.abort(new AiError(409, "CANCELLED"));
    signal.addEventListener("abort", abort, { once: true });
    try {
      const batch = await this.#scope.run({ actor: actor2, actorNow, key: item.key, call: item.call, onResult: (result2) => {
        if (result2.ok && item.call.name === TOOL_NAMES[1]) item.committed = true;
      } }, () => this.tools.execute({ calls: [{ type: "tool-call", ...item.call }], signal: controller.signal, maxParallelToolCalls: 1 }));
      const response = batch.results[0];
      if (controller.signal.aborted) throw new AiError(409, item.committed ? "OPERATION_ALREADY_COMPLETED" : "CANCELLED");
      if (batch.results.length !== 1 || response?.callId !== item.call.id) throw new AiError(502, "TOOL_FAILED");
      if (response.result.isError) {
        const code = response.result.error?.info?.code ?? "";
        if (/ABORT|CANCEL/.test(code)) throw new AiError(409, item.committed ? "OPERATION_ALREADY_COMPLETED" : "CANCELLED");
        if (code === "TOOL_TIMEOUT") throw new AiError(504, "TOOL_TIMEOUT");
        if (["STORAGE_BUSY", "STORAGE_UNAVAILABLE"].includes(code)) throw new AiError(503, code);
        throw new AiError(502, "TOOL_FAILED");
      }
      const result = JSON.parse(response.result.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""));
      if (typeof result.ok !== "boolean" || !Number.isInteger(result.status) || typeof result.code !== "string") throw new AiError(502, "TOOL_FAILED");
      const current = actorNow();
      if (!current || current.sessionId !== actor2.sessionId || current.userId !== actor2.userId || current.serviceId !== actor2.serviceId) throw new AiError(401, "AUTH_REQUIRED");
      if (result.ok && !this.store.authorizeObject(current, toolArguments(item.call).object_id, "read", (/* @__PURE__ */ new Date()).toISOString())) throw new AiError(404, "NOT_FOUND");
      item.result = result;
      item.state = result.ok ? "succeeded" : "failed";
      if (!result.ok) throw new AiError(result.status, result.code);
      return { ...this.#view(item), result };
    } catch (error) {
      item.state = "failed";
      const safe = error instanceof AiError ? error : new AiError(502, "TOOL_FAILED");
      item.result = { ok: false, status: safe.status, code: safe.code };
      throw safe;
    } finally {
      signal.removeEventListener("abort", abort);
      delete item.execution;
    }
  }
  close() {
    this.#closed = true;
    for (const { controller } of this.#pending.values()) controller.abort(new AiError(409, "CANCELLED"));
    for (const item of this.#prepared.values()) item.execution?.abort(new AiError(409, "CANCELLED"));
    this.#prepared.clear();
    for (const dispose of this.#dispose) dispose();
  }
};

// src/host/ai-http.ts
import { randomUUID as randomUUID7 } from "node:crypto";
function createAiHandler(options) {
  return async (req, res) => {
    const requestId = randomUUID7(), controller = new AbortController();
    const disconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once("aborted", disconnect);
    res.once("close", disconnect);
    const send = (status, data) => {
      if (res.destroyed) return;
      res.statusCode = status;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.setHeader("x-content-type-options", "nosniff");
      res.end(JSON.stringify(data));
    };
    try {
      const origin = options.origin();
      if (!origin || req.headers.host !== new URL(origin).host || req.headers.origin !== void 0 && req.headers.origin !== origin || req.headers["sec-fetch-site"] === "cross-site" || req.method !== "GET" && req.headers["x-knowledgeos-request"] !== "1") throw new AiError(403, "CSRF_REJECTED");
      const url = new URL(req.url ?? "/", origin);
      if (url.search) throw new AiError(422, "INPUT_INVALID");
      const actorNow = () => options.actorFor(req);
      const actor2 = actorNow();
      if (!actor2) throw new AiError(401, "AUTH_REQUIRED");
      const service = options.service();
      if (req.method === "GET" && url.pathname === "/knowledge/v1/ai/status") {
        send(200, { data: service.status(), meta: { request_id: requestId } });
        return;
      }
      if (req.method !== "POST" || !["/knowledge/v1/ai/prepare", "/knowledge/v1/ai/execute", "/knowledge/v1/ai/cancel"].includes(url.pathname)) throw new AiError(404, "NOT_FOUND");
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new AiError(415, "CONTENT_TYPE_INVALID");
      const chunks = [];
      let bytes = 0;
      for await (const raw of req) {
        const chunk = Buffer.from(raw);
        bytes += chunk.length;
        if (bytes > 16384) throw new AiError(413, "PAYLOAD_TOO_LARGE");
        chunks.push(chunk);
      }
      let body;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        body = value;
      } catch {
        throw new AiError(400, "INVALID_JSON");
      }
      const current = actorNow();
      if (!current || current.sessionId !== actor2.sessionId) throw new AiError(401, "AUTH_REQUIRED");
      if (url.pathname.endsWith("/prepare")) {
        send(200, { data: await service.prepare(current, body, controller.signal), meta: { request_id: requestId } });
        return;
      }
      if (url.pathname.endsWith("/execute")) {
        onlyKeys(body, ["prepared_id"]);
        send(200, { data: await service.execute(current, actorNow, aiText(body.prepared_id, 80), controller.signal), meta: { request_id: requestId } });
        return;
      }
      onlyKeys(body, ["request_id"]);
      service.cancel(current, aiText(body.request_id, 80));
      send(200, { data: { state: "cancelled" }, meta: { request_id: requestId } });
    } catch (error) {
      const safe = error instanceof AiError ? error : error instanceof RecordsError ? new AiError(503, error.code) : new AiError(500, "INTERNAL_ERROR");
      send(safe.status, { code: safe.code, message: safe.code, request_id: requestId, retryable: ["MODEL_TIMEOUT", "STORAGE_BUSY", "PROVIDER_RATE_LIMITED"].includes(safe.code), safe_details: {} });
    } finally {
      req.removeListener("aborted", disconnect);
      res.removeListener("close", disconnect);
    }
  };
}

// src/host/ai-page.ts
function buildAiHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KnowledgeOS \xB7 \u53D7\u63A7 AI \u5DE5\u5177</title><style>
body{margin:0;background:#f4f8f8;color:#23333a;font:15px/1.65 "Segoe UI","Microsoft YaHei UI",sans-serif}main{max-width:860px;margin:auto;padding:30px 20px}.card{background:white;border:1px solid #dce8e9;border-radius:14px;padding:22px;margin:16px 0}label{display:block;margin:12px 0 4px}input,select,textarea{width:100%;box-sizing:border-box;font:inherit;padding:9px;border:1px solid #bbcfd2;border-radius:7px}textarea{min-height:90px}button{background:#3d7e86;color:white;border:0;border-radius:7px;padding:10px 15px;font:inherit;margin:12px 8px 0 0;cursor:pointer}button:disabled{opacity:.5;cursor:default}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#356f76}#status{font-weight:600}small{color:#597078}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #356f76;outline-offset:2px}</style></head><body><main>
<a href="/knowledgeos/account">\u8D26\u53F7\u4E0E\u767B\u5F55</a><h1>KnowledgeOS \xB7 \u53D7\u63A7 AI \u5DE5\u5177</h1><p id="who">\u6B63\u5728\u6838\u5BF9\u767B\u5F55\u2026</p>
<section class="card"><h2>\u6A21\u578B\u4E0E\u8BF7\u6C42</h2><p id="model">\u6B63\u5728\u8BFB\u53D6\u6A21\u578B\u914D\u7F6E\u2026</p><small id="budget"></small><p id="status" role="status" aria-live="polite">\u7B49\u5F85\u767B\u5F55</p></section>
<section class="card"><h2>\u6D4B\u8BD5\u77E5\u8BC6\u5BF9\u8C61</h2><label for="objects">\u9009\u62E9\u6709\u6743\u8BFB\u53D6\u7684\u5BF9\u8C61</label><select id="objects"></select><button id="refresh">\u5237\u65B0\u5BF9\u8C61\u5217\u8868</button><button id="read">\u91CD\u65B0\u8BFB\u53D6\u9A8C\u8BC1</button><pre id="object"></pre></section>
<section class="card"><h2>\u81EA\u7136\u8BED\u8A00\u64CD\u4F5C</h2><label for="target">\u76EE\u6807\u5BF9\u8C61 ID</label><input id="target"><label for="revision">\u9884\u671F\u7248\u672C expected_revision</label><input id="revision" type="number" min="1" value="1"><label for="key">\u64CD\u4F5C\u5E42\u7B49\u952E\uFF08\u91CD\u8BD5\u65F6\u4FDD\u6301\u76F8\u540C\uFF09</label><input id="key"><label for="instruction">\u6307\u4EE4</label><textarea id="instruction" placeholder="\u8BFB\u53D6\u8FD9\u4E2A\u5BF9\u8C61\uFF0C\u6216\u628A\u6807\u9898\u6539\u4E3A\u2026\u2026"></textarea><button id="prepare" disabled>\u63D0\u4EA4\u7ED9\u6A21\u578B</button><button id="execute" disabled>\u6267\u884C\u5DF2\u51C6\u5907\u5DE5\u5177</button><button id="cancel" disabled>\u53D6\u6D88\u8BF7\u6C42</button><pre id="tool"></pre><pre id="result"></pre></section>
</main><script>(()=>{const $=id=>document.getElementById(id);let prepared=null,requestId=null,busy=false,generation=0,userId=null,authenticated=false,configured=false;const state=t=>{$('status').textContent=t};const call=async(path,options={})=>{const r=await fetch(path,{...options,headers:{'content-type':'application/json','x-knowledgeos-request':'1'}});const j=await r.json();if(!r.ok){const e=new Error(j.code||('HTTP_'+r.status));e.status=r.status;throw e}return j.data};const post=(path,b)=>call(path,{method:'POST',body:JSON.stringify(b)});const clear=()=>{requestId=null;prepared=null;$('cancel').disabled=true;$('execute').disabled=true;$('object').textContent='';$('tool').textContent='';$('result').textContent='';$('objects').replaceChildren();$('target').value=''};const fail=e=>{state('\u5931\u8D25 \xB7 '+e.message);if(e.status===401){authenticated=false;generation++;clear();$('prepare').disabled=true;$('who').textContent='\u4E1A\u52A1\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55'}};const accept=async gen=>{if(gen!==generation)return false;try{const me=await call('/knowledge/v1/me');if(gen!==generation)return false;if(me.id!==userId){await load();return false}return true}catch(e){if(gen===generation)fail(e);return false}};const read=async()=>{const gen=generation,id=$('target').value;try{const object=await call('/knowledge/v1/objects/'+encodeURIComponent(id));if(!await accept(gen))return;$('object').textContent=JSON.stringify(object,null,2);$('revision').value=object.revision;state('\u91CD\u65B0\u8BFB\u53D6\u5B8C\u6210 \xB7 revision '+object.revision)}catch(e){if(gen===generation)fail(e)}};const list=async(previous)=>{const gen=generation;const objects=await call('/knowledge/v1/objects');if(!await accept(gen))return;$('objects').replaceChildren();for(const o of objects){const op=document.createElement('option');op.value=o.id;op.dataset.revision=String(o.revision);op.textContent=o.title+' \xB7 revision '+o.revision;$('objects').append(op)}const selected=objects.find(o=>o.id===previous)||objects[0];$('objects').value=selected?.id||'';$('target').value=selected?.id||'';$('revision').value=selected?.revision||1};const invalidateTarget=()=>{const oldRequest=requestId;if(oldRequest)void post('/knowledge/v1/ai/cancel',{request_id:oldRequest}).catch(()=>{});generation++;busy=false;prepared=null;requestId=null;$('execute').disabled=true;$('cancel').disabled=true;$('prepare').disabled=!authenticated||!configured;$('object').textContent='';$('tool').textContent='';$('result').textContent='';state(configured?'\u76EE\u6807\u6216\u8349\u7A3F\u5DF2\u53D8\u66F4\uFF0C\u8BF7\u91CD\u65B0\u63D0\u4EA4':'BLOCKED \xB7 MODEL_NOT_CONFIGURED')};$('objects').onchange=()=>{invalidateTarget();$('target').value=$('objects').value;$('revision').value=$('objects').selectedOptions[0]?.dataset.revision||'1'};for(const id of ['target','revision','key','instruction'])$(id).addEventListener('input',invalidateTarget);$('read').onclick=read;$('refresh').onclick=()=>{const previous=$('target').value;invalidateTarget();const gen=generation;list(previous).catch(e=>{if(gen===generation)fail(e)})};$('key').value=crypto.randomUUID();$('prepare').onclick=async()=>{if(busy||!authenticated||!configured)return;busy=true;const gen=generation;prepared=null;requestId=crypto.randomUUID();$('prepare').disabled=true;$('execute').disabled=true;$('cancel').disabled=false;$('tool').textContent='';$('result').textContent='';state('\u6A21\u578B\u8BF7\u6C42\u4E2D');try{const p=await post('/knowledge/v1/ai/prepare',{request_id:requestId,instruction:$('instruction').value,object_id:$('target').value,expected_revision:Number($('revision').value),idempotency_key:$('key').value});if(!await accept(gen))return;prepared=p;$('tool').textContent='\u6240\u7528\u5DE5\u5177\uFF1A'+p.tool+'\\n'+JSON.stringify(p.arguments,null,2);$('execute').disabled=false;state('\u5DF2\u51C6\u5907 \xB7 '+p.provider+' / '+p.model)}catch(e){if(gen===generation)fail(e)}finally{if(gen===generation){busy=false;$('prepare').disabled=!authenticated||!configured;$('cancel').disabled=prepared===null}}};$('execute').onclick=async()=>{if(!prepared||busy)return;const gen=generation;busy=true;$('execute').disabled=true;state('\u6B63\u5728\u91CD\u65B0\u5224\u6743\u5E76\u6267\u884C');try{const d=await post('/knowledge/v1/ai/execute',{prepared_id:prepared.prepared_id});if(!await accept(gen))return;$('result').textContent=JSON.stringify(d.result,null,2);state('\u6267\u884C\u6210\u529F \xB7 '+d.result.code+' \xB7 revision '+d.result.object.revision)}catch(e){if(gen===generation)fail(e)}finally{if(gen===generation){busy=false;$('cancel').disabled=true}}};$('cancel').onclick=async()=>{if(!requestId)return;const id=requestId,gen=++generation;prepared=null;$('execute').disabled=true;$('cancel').disabled=true;try{await post('/knowledge/v1/ai/cancel',{request_id:id});if(gen===generation)state('\u5DF2\u53D6\u6D88')}catch(e){if(gen===generation)fail(e)}finally{if(gen===generation){busy=false;$('prepare').disabled=!authenticated||!configured}}};const load=async()=>{const gen=++generation;busy=false;authenticated=false;clear();$('prepare').disabled=true;try{const me=await call('/knowledge/v1/me');const m=await call('/knowledge/v1/ai/status');if(gen!==generation)return;userId=me.id;authenticated=true;configured=m.configured;$('who').textContent='\u5DF2\u767B\u5F55 \xB7 '+me.display_name+'\uFF08'+me.login_name+'\uFF09';$('model').textContent='\u6A21\u578B\uFF1A'+(m.provider||'\u672A\u914D\u7F6E')+' / '+(m.model||'\u672A\u914D\u7F6E');$('budget').textContent='\u8F93\u51FA\u4E0A\u9650 '+m.max_output_tokens+' tokens \xB7 \u603B\u9884\u7B97 '+m.budget_usd+' USD \xB7 \u5DF2\u5C1D\u8BD5 '+m.attempts+'/'+m.max_calls+' \u6B21';await list();if(gen!==generation)return;$('prepare').disabled=!m.configured;state(m.configured?'\u5C31\u7EEA':'BLOCKED \xB7 MODEL_NOT_CONFIGURED')}catch(e){if(gen===generation)fail(e)}};document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void load()});void load()})()</script></body></html>`;
}

// src/host/index.ts
var name = "knowledgeos-panel";
var inject = ["webServer", "clientModules", "connection", "connection.authentication"];
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
        newId: () => randomUUID8(),
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
  const actualOrigin = () => {
    try {
      const explicit = webFacts.getOrigin?.();
      if (explicit !== void 0) return explicit;
    } catch {
      return void 0;
    }
    return void 0;
  };
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
    res.end(JSON.stringify({ code: "STORAGE_UNAVAILABLE", message: "storage is not configured", request_id: randomUUID8(), retryable: true, safe_details: {} }));
  };
  const registerIdentityRoutes = (identityContext) => {
    const identityAvailable = () => {
      let connection;
      try {
        connection = ctx.connection;
      } catch {
        return false;
      }
      return isIdentityRuntimeAvailable({ connection, host: webFacts.host, port: webFacts.port, protocol: webFacts.protocol, origin: actualOrigin() });
    };
    const identity = new IdentityService(storage);
    let ai = new AiService(storage, config.ai ?? {});
    identityContext.inject(["llm", "tools"], (aiContext) => {
      aiContext.effect(() => {
        ai.close();
        let active;
        try {
          active = new AiService(storage, config.ai ?? {}, aiContext.llm, aiContext.tools);
        } catch {
          console.warn("knowledgeos-ai: TOOL_REGISTRATION_FAILED");
          ai = new AiService(storage, config.ai ?? {});
          return () => ai.close();
        }
        ai = active;
        return () => {
          active.close();
          if (ai === active) ai = new AiService(storage, config.ai ?? {});
        };
      }, "knowledgeos-ai: controlled tools");
    });
    const identityHandlers = createIdentityHandlers({
      service: identity,
      origin: actualOrigin,
      host: () => webFacts.host,
      protocol: () => webFacts.protocol ?? "http:",
      isAvailable: identityAvailable
    });
    const ownerSetupPage = (req, res, peer) => {
      if (req.method !== "GET") {
        res.statusCode = 405;
        res.setHeader("allow", "GET");
        res.end();
        return;
      }
      if (!identityAvailable()) {
        res.statusCode = 503;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("identity service is unavailable");
        return;
      }
      const principal = peer?.principal;
      if (principal?.kind !== "owner" || !isLoopbackAddress(req.socket?.remoteAddress) || !isLoopbackAddress(webFacts.host)) {
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
      if (!identityAvailable()) {
        res.statusCode = 503;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("identity service is unavailable");
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(buildAccountHtml().replace("</main>", '<p><a href="/knowledgeos/ai">\u53D7\u63A7 AI \u5DE5\u5177</a></p></main>'));
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
    identityContext.effect(() => {
      const disposers = [];
      disposers.push(identityContext.webServer.register({ kind: "exact", path: ACCOUNT_PATH, auth: "anonymous", handler: accountPage }));
      disposers.push(identityContext.webServer.register({ kind: "exact", path: "/knowledgeos/ai", auth: "anonymous", handler: (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        ;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(buildAiHtml());
      } }));
      const aiHandler = createAiHandler({ service: () => ai, origin: actualOrigin, actorFor: (req) => {
        const origin = actualOrigin();
        if (origin === void 0 || !identityAvailable()) return void 0;
        return identity.actor(readCookie(req, businessCookieName(identity.setupState.serviceId, origin)));
      } });
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/ai", auth: "anonymous", handler: withPeer(async (req, res) => aiHandler(req, res)) }));
      disposers.push(identityContext.webServer.register({ kind: "exact", path: SETUP_PATH, auth: "required", handler: ownerSetupPage }));
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
      for (const route of routes) disposers.push(identityContext.webServer.register({ kind: "exact", path: route.path, auth: route.auth, handler: withPeer(route.handler) }));
      const objectHandler = createObjectHandlers({
        storage,
        actorFor: (req) => {
          const origin = actualOrigin();
          if (origin === void 0) return void 0;
          const token = readCookie(req, businessCookieName(identity.setupState.serviceId, origin));
          return identity.actor(token);
        },
        origin: actualOrigin
      });
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/objects", auth: "anonymous", handler: withPeer(async (req, res) => objectHandler(req, res)) }));
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/projects", auth: "anonymous", handler: withPeer(async (req, res) => objectHandler(req, res)) }));
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/grants", auth: "anonymous", handler: withPeer(async (req, res) => objectHandler(req, res)) }));
      return async () => {
        ai.close();
        for (const dispose of disposers) dispose();
        await identity.close();
      };
    }, "knowledgeos-identity: account and business routes");
  };
  if (storage === void 0) {
    ctx.effect(() => {
      const disposers = [];
      disposers.push(ctx.webServer.register({ kind: "exact", path: ACCOUNT_PATH, auth: "anonymous", handler: sendIdentityUnavailable }));
      disposers.push(ctx.webServer.register({ kind: "exact", path: SETUP_PATH, auth: "required", handler: sendIdentityUnavailable }));
      for (const path of ["/knowledge/v1/auth/status", "/knowledge/v1/auth/bootstrap", "/knowledge/v1/auth/register", "/knowledge/v1/auth/login", "/knowledge/v1/auth/logout", "/knowledge/v1/me", "/knowledge/v1/me/preferences", "/knowledge/v1/spaces"]) {
        disposers.push(ctx.webServer.register({ kind: "exact", path, auth: path.endsWith("/bootstrap") ? "required" : "anonymous", handler: sendIdentityUnavailable }));
      }
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, "knowledgeos-identity: unavailable routes");
  } else {
    ctx.inject(["connection", "connection.authentication"], registerIdentityRoutes);
  }
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
