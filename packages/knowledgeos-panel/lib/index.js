// src/host/index.ts
import { randomUUID as randomUUID15 } from "node:crypto";

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
  ai: Schema.object({ provider: Schema.string(), model: Schema.string(), maxCalls: Schema.number().min(1), timeoutMs: Schema.number().min(20).max(6e4), budgetUsd: Schema.number().min(0), inputUsdPerMillion: Schema.number().min(0), outputUsdPerMillion: Schema.number().min(0) })
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
async function readBody(req, limit2) {
  return await new Promise((resolve2, reject2) => {
    let settled = false;
    let total = 0;
    const chunks = [];
    const fail = (error) => {
      if (settled) return;
      settled = true;
      req.resume();
      reject2(error);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > limit2) {
        fail(new ApiError(413, "PAYLOAD_TOO_LARGE", "request body exceeds the limit"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve2(Buffer.concat(chunks));
    });
    req.on("error", () => {
      fail(new ApiError(400, "INVALID_JSON", "request body could not be read"));
    });
    req.on("aborted", () => {
      if (settled) return;
      settled = true;
      reject2(new ApiError(400, "INVALID_JSON", "request was aborted"));
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
import { createHash as createHash4, randomUUID as randomUUID7 } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

// src/host/jobs.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var JOB_SCHEMA = `CREATE TABLE jobs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES auth_sessions(id),
  object_id TEXT NOT NULL REFERENCES knowledge_objects(id), expected_revision INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled')), attempts INTEGER NOT NULL DEFAULT 0,
  checkpoint INTEGER NOT NULL DEFAULT 0 CHECK(checkpoint IN (0,1)), lease_token TEXT UNIQUE, lease_until INTEGER,
  available_at INTEGER NOT NULL, last_error TEXT, UNIQUE(user_id,idempotency_key),
  CHECK((state='running')=(lease_token IS NOT NULL)), CHECK((state='running')=(lease_until IS NOT NULL))
) STRICT;
CREATE INDEX jobs_ready ON jobs(state,available_at);
CREATE TABLE job_runs (job_id TEXT NOT NULL REFERENCES jobs(id), attempt INTEGER NOT NULL, worker TEXT NOT NULL,
  started_at INTEGER NOT NULL, start_checkpoint INTEGER NOT NULL, ended_at INTEGER, outcome TEXT, PRIMARY KEY(job_id,attempt)) STRICT;
CREATE TABLE job_results (job_id TEXT PRIMARY KEY REFERENCES jobs(id), input_revision INTEGER NOT NULL) STRICT;
CREATE TABLE outbox (event_id TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE REFERENCES job_results(job_id), created_at INTEGER NOT NULL,
  delivered_at INTEGER, failures INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, last_error TEXT) STRICT;
CREATE TABLE event_receipts (consumer_name TEXT NOT NULL, event_id TEXT NOT NULL REFERENCES outbox(event_id), PRIMARY KEY(consumer_name,event_id)) STRICT;
`;
var JobError = class extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
};
var JobStore = class {
  constructor(tx, revision, fault) {
    this.tx = tx;
    this.revision = revision;
    this.fault = fault;
  }
  enqueue(actor2, object, revision, key) {
    return this.tx((db, now) => {
      const current = this.revision(actor2.sessionId, actor2.userId, object, now);
      if (current === void 0) throw new JobError(404, "NOT_FOUND");
      const prior = db.prepare("SELECT id,object_id,expected_revision FROM jobs WHERE user_id=? AND idempotency_key=?").get(actor2.userId, key);
      if (prior) {
        if (prior.object_id !== object || prior.expected_revision !== revision) throw new JobError(409, "IDEMPOTENCY_CONFLICT");
        return String(prior.id);
      }
      if (current !== revision) throw new JobError(409, "REVISION_CONFLICT");
      const id = randomUUID2();
      db.prepare("INSERT INTO jobs(id,user_id,session_id,object_id,expected_revision,idempotency_key,state,available_at) VALUES(?,?,?,?,?,?,'queued',?)").run(id, actor2.userId, actor2.sessionId, object, revision, key, now);
      return id;
    });
  }
  inspect(actor2, id, cancel = false) {
    return this.tx((db, now) => {
      const row = db.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").get(id, actor2.userId);
      if (!row || this.revision(actor2.sessionId, actor2.userId, row.object_id, now) === void 0) throw new JobError(404, "NOT_FOUND");
      if (cancel && ["succeeded", "failed"].includes(row.state)) throw new JobError(409, "JOB_TERMINAL");
      if (cancel && row.state !== "cancelled") this.end(db, row, "cancelled", "CANCELLED", now);
      const summary = db.prepare("SELECT id,state,attempts,checkpoint,last_error,expected_revision FROM jobs WHERE id=?").get(id);
      const runs = db.prepare("SELECT attempt,start_checkpoint,started_at,ended_at,outcome FROM job_runs WHERE job_id=? ORDER BY attempt").all(id);
      const delivery = db.prepare("SELECT delivered_at,failures,retry_at,last_error FROM outbox WHERE job_id=?").get(id);
      return { ...summary, runs, delivery: delivery ?? null };
    });
  }
  end(db, row, state, reason, now) {
    db.prepare("UPDATE job_runs SET ended_at=?,outcome=? WHERE job_id=? AND attempt=? AND ended_at IS NULL").run(now, reason ?? state, row.id, row.attempts);
    db.prepare("UPDATE jobs SET state=?,lease_token=NULL,lease_until=NULL,last_error=?,available_at=? WHERE id=?").run(state, reason, now + (state === "queued" ? 250 : 0), row.id);
  }
  claim(worker) {
    return this.tx((db, now) => {
      const lost = db.prepare("SELECT * FROM jobs WHERE state='running' AND lease_until<=? ORDER BY lease_until LIMIT 1").get(now);
      if (lost) this.end(db, lost, lost.attempts >= 3 ? "failed" : "queued", "LEASE_EXPIRED", now);
      const row = db.prepare("SELECT * FROM jobs WHERE state='queued' AND available_at<=? ORDER BY available_at,id LIMIT 1").get(now);
      if (!row) return void 0;
      const token = randomUUID2();
      db.prepare("UPDATE jobs SET state='running',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?").run(token, now + 3e3, row.id);
      db.prepare("INSERT INTO job_runs(job_id,attempt,worker,started_at,start_checkpoint) VALUES(?,?,?,?,?)").run(row.id, row.attempts + 1, worker, now, row.checkpoint);
      return { id: row.id, token, checkpoint: row.checkpoint };
    });
  }
  renew(token) {
    return this.tx((db, now) => db.prepare("UPDATE jobs SET lease_until=? WHERE state='running' AND lease_token=? AND lease_until>?").run(now + 3e3, token, now).changes === 1);
  }
  step(token) {
    return this.tx((db, now) => {
      const row = db.prepare("SELECT * FROM jobs WHERE state='running' AND lease_token=? AND lease_until>?").get(token, now);
      if (!row) return "lost";
      const revision = this.revision(row.session_id, row.user_id, row.object_id, now);
      if (revision !== row.expected_revision) {
        this.end(db, row, "failed", revision === void 0 ? "AUTH_REVOKED" : "REVISION_CONFLICT", now);
        return "failed";
      }
      if (row.checkpoint === 0) {
        db.prepare("UPDATE jobs SET checkpoint=1 WHERE id=?").run(row.id);
        return "checkpoint";
      }
      db.prepare("INSERT INTO job_results(job_id,input_revision) VALUES(?,?)").run(row.id, revision);
      this.fault("job:after-result");
      db.prepare("INSERT INTO outbox(event_id,job_id,created_at) VALUES(?,?,?)").run(randomUUID2(), row.id, now);
      this.fault("job:after-outbox");
      this.end(db, row, "succeeded", null, now);
      return "succeeded";
    });
  }
  retry(token) {
    this.tx((db, now) => {
      const row = db.prepare("SELECT * FROM jobs WHERE lease_token=? AND lease_until>?").get(token, now);
      if (row) this.end(db, row, row.attempts >= 3 ? "failed" : "queued", "WORKER_ERROR", now);
    });
  }
  receive(db, event, now) {
    const entry = db.prepare("SELECT delivered_at,failures,retry_at FROM outbox WHERE event_id=?").get(event);
    if (!entry || Number(entry.failures) >= 3 || Number(entry.retry_at) > now) return false;
    db.exec("SAVEPOINT consume_event");
    try {
      const inserted = db.prepare("INSERT INTO event_receipts(consumer_name,event_id) VALUES('probe',?) ON CONFLICT DO NOTHING").run(event);
      if (inserted.changes === 1) this.fault("event:after-receipt");
      db.prepare("UPDATE outbox SET delivered_at=COALESCE(delivered_at,?),last_error=NULL WHERE event_id=?").run(now, event);
      db.exec("RELEASE consume_event");
      return inserted.changes === 1;
    } catch {
      db.exec("ROLLBACK TO consume_event; RELEASE consume_event");
      db.prepare("UPDATE outbox SET failures=failures+1,retry_at=?,last_error='CONSUMER_FAILED' WHERE event_id=?").run(now + 250 * (1 + Number(entry.failures)), event);
      return false;
    }
  }
  consume(event) {
    return this.tx((db, now) => this.receive(db, event, now));
  }
  dispatch() {
    return this.tx((db, now) => {
      const event = db.prepare("SELECT event_id FROM outbox WHERE delivered_at IS NULL AND failures<3 AND retry_at<=? ORDER BY created_at LIMIT 1").get(now);
      return event ? this.receive(db, String(event.event_id), now) : false;
    });
  }
};
function startWorker(store, log) {
  const worker = randomUUID2();
  let token;
  const timer = setInterval(() => {
    try {
      store.dispatch();
      if (!token) token = store.claim(worker)?.token;
      else if (!store.renew(token) || store.step(token) !== "checkpoint") token = void 0;
    } catch {
      log("knowledgeos-jobs: worker transaction failed");
      if (token) {
        try {
          store.retry(token);
        } catch {
        }
        token = void 0;
      }
    }
  }, 500);
  timer.unref();
  return () => clearInterval(timer);
}

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

// src/host/asset-store.ts
import { createHash as createHash2, randomUUID as randomUUID3 } from "node:crypto";
var ASSET_SCHEMA = `CREATE TABLE blobs (
  id TEXT PRIMARY KEY, storage_key TEXT UNIQUE NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0), media_type TEXT NOT NULL CHECK(media_type='application/pdf')
) STRICT;
CREATE TABLE assets (id TEXT PRIMARY KEY REFERENCES knowledge_objects(id)) STRICT;
CREATE TABLE asset_versions (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), version INTEGER NOT NULL CHECK(version>0),
  parent_version_id TEXT REFERENCES asset_versions(id), blob_id TEXT NOT NULL UNIQUE REFERENCES blobs(id),
  original_name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, UNIQUE(asset_id,version), UNIQUE(created_by,idempotency_key)
) STRICT;`;
var AssetError = class extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
};
var receiptSQL = `SELECT v.asset_id AS id,v.original_name AS title,v.id AS version_id,v.version,b.sha256,b.byte_length,b.media_type FROM asset_versions v JOIN blobs b ON b.id=v.blob_id `;
function receipt(row) {
  const { media_type, ...rest } = row;
  return media_type === "application/pdf" ? rest : { ...rest, media_type };
}
var AssetStore = class {
  constructor(tx, current, allowed) {
    this.tx = tx;
    this.current = current;
    this.allowed = allowed;
  }
  actor(prior, now) {
    const actor2 = this.current(prior, now);
    if (!actor2) throw new AssetError(401, "AUTH_REQUIRED");
    return actor2;
  }
  check(actor2, id, action2, now) {
    if (!this.allowed(actor2, id, action2, now)) throw new AssetError(404, "ASSET_NOT_FOUND");
  }
  publish(prior, spec, blob, format, onPublish) {
    const text2 = format && "blocks" in format ? format : void 0;
    return this.tx("write", (db, now) => {
      const actor2 = this.actor(prior, now), digest2 = createHash2("sha256").update(JSON.stringify([spec.title, spec.assetId ?? null, spec.expectedVersion ?? null, blob.sha256, blob.byteLength, ...text2 ? [text2.media, text2.encoding] : format ? [format.media] : []])).digest("hex");
      const prev = db.prepare("SELECT id,asset_id,request_digest FROM asset_versions WHERE created_by=? AND idempotency_key=?").get(actor2.userId, spec.key);
      if (prev) {
        this.check(actor2, String(prev.asset_id), "read", now);
        this.check(actor2, String(prev.asset_id), "edit", now);
        if (prev.request_digest !== digest2) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        const r = receipt(db.prepare(receiptSQL + "WHERE v.id=?").get(prev.id));
        onPublish?.(db, actor2, r);
        return { receipt: r, replayed: true };
      }
      const id = spec.assetId ?? randomUUID3(), vid = randomUUID3(), bid = randomUUID3();
      let version = 1, parent = null;
      if (spec.assetId) {
        this.check(actor2, id, "read", now);
        this.check(actor2, id, "edit", now);
        const last = db.prepare("SELECT id,version FROM asset_versions WHERE asset_id=? ORDER BY version DESC LIMIT 1").get(id);
        if (!last) throw new AssetError(404, "ASSET_NOT_FOUND");
        if (last.version !== spec.expectedVersion) throw new AssetError(409, "VERSION_CONFLICT");
        version = Number(last.version) + 1;
        parent = String(last.id);
        db.prepare("UPDATE knowledge_objects SET revision=revision+1,updated_at=? WHERE id=?").run(now, id);
        db.prepare("UPDATE office_conversions SET state='superseded',lease_token=NULL,lease_until=NULL,failure_code='SOURCE_CHANGED',updated_at=? WHERE version_id=? AND state IN ('queued','running')").run(now, parent);
      } else {
        db.prepare(`INSERT INTO knowledge_objects (id,service_id,space_id,scope_kind,project_id,owner_user_id,object_type,title,body,status,revision,created_at,updated_at) VALUES (?,?,?,'personal',NULL,?,'asset',?,'','active',1,?,?)`).run(id, actor2.serviceId, actor2.personalSpaceId, actor2.userId, spec.title, now, now);
        db.prepare("INSERT INTO assets VALUES (?)").run(id);
      }
      db.prepare("INSERT INTO blobs VALUES (?,?,?,?,?)").run(bid, blob.key, blob.sha256, blob.byteLength, format?.media ?? "application/pdf");
      db.prepare("INSERT INTO asset_versions VALUES (?,?,?,?,?,?,?,?,?,?)").run(vid, id, version, parent, bid, spec.title, actor2.userId, now, spec.key, digest2);
      if (text2) {
        db.prepare("INSERT INTO text_versions VALUES(?,?,?)").run(vid, text2.encoding, text2.blocks.length);
        const insert = db.prepare("INSERT INTO text_blocks VALUES(?,?,?,?,?,?,?)");
        text2.blocks.forEach((b, i) => insert.run(vid, i + 1, b.kind, b.start, b.end, b.text, b.anchor));
      }
      const published = { id, title: spec.title, version_id: vid, version, sha256: blob.sha256, byte_length: blob.byteLength, ...format ? { media_type: format.media } : {} };
      onPublish?.(db, actor2, published);
      return { receipt: published, replayed: false };
    });
  }
  list(prior) {
    return this.tx("read", (db, now) => {
      const actor2 = this.actor(prior, now);
      return db.prepare(receiptSQL + `JOIN knowledge_objects o ON o.id=v.asset_id
      WHERE o.owner_user_id=? AND o.service_id=? AND o.status='active'
      ORDER BY v.created_at DESC,v.version DESC,v.id`).all(actor2.userId, actor2.serviceId).filter((v) => this.allowed(actor2, String(v.id), "read", now)).map(receipt);
    });
  }
  original(prior, id, versionId, download) {
    return this.tx("read", (db, now) => {
      const actor2 = this.actor(prior, now);
      this.check(actor2, id, "read", now);
      if (download) this.check(actor2, id, "export", now);
      const r = db.prepare("SELECT b.storage_key,b.sha256,b.byte_length,b.media_type,t.encoding FROM asset_versions v JOIN blobs b ON b.id=v.blob_id LEFT JOIN text_versions t ON t.version_id=v.id WHERE v.asset_id=? AND v.id=?").get(id, versionId);
      if (!r) throw new AssetError(404, "ASSET_NOT_FOUND");
      return { key: String(r.storage_key), sha256: String(r.sha256), byteLength: Number(r.byte_length), ...r.media_type === "application/pdf" ? {} : { media: String(r.media_type) }, ...typeof r.encoding === "string" ? { encoding: r.encoding } : {} };
    });
  }
  blocks(prior, id, v, from, limit2) {
    return this.tx("read", (db, now) => {
      const actor2 = this.actor(prior, now);
      this.check(actor2, id, "read", now);
      if (!Number.isSafeInteger(from) || from < 1 || !Number.isSafeInteger(limit2) || limit2 < 1 || limit2 > 10) throw new AssetError(422, "INVALID_BLOCK_RANGE");
      const meta = db.prepare("SELECT encoding,block_count AS total FROM text_versions t JOIN asset_versions a ON a.id=t.version_id WHERE a.asset_id=? AND a.id=?").get(id, v);
      if (!meta) throw new AssetError(404, "ASSET_NOT_FOUND");
      return { version_id: v, ...meta, blocks: db.prepare("SELECT ordinal,kind,start,end,text,anchor FROM text_blocks WHERE version_id=? AND ordinal>=? ORDER BY ordinal LIMIT ?").all(v, from, limit2) };
    });
  }
};

// src/host/zip-store.ts
import { createHash as createHash3, randomUUID as randomUUID4 } from "node:crypto";
var notFound = () => new AssetError(404, "IMPORT_NOT_FOUND");
var uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var ZipStore = class {
  constructor(tx, current, readable) {
    this.tx = tx;
    this.current = current;
    this.readable = readable;
  }
  actor(prior, now) {
    const a = this.current(prior, now);
    if (!a) throw new AssetError(401, "AUTH_REQUIRED");
    return a;
  }
  owned(db, a, id) {
    const row = db.prepare("SELECT id,title,storage_key,sha256,byte_length FROM zip_imports WHERE id=? AND owner_id=?").get(id, a.userId);
    if (!row) throw notFound();
    return row;
  }
  stage(prior, spec, blob, members) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now), old = db.prepare("SELECT * FROM zip_imports WHERE owner_id=? AND upload_key=?").get(a.userId, spec.key);
      if (old) {
        if (old.sha256 !== blob.sha256 || old.byte_length !== blob.byteLength || old.title !== spec.title) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { id: String(old.id), replayed: true };
      }
      const id = randomUUID4();
      db.prepare("INSERT INTO zip_imports VALUES(?,?,?,?,?,?,?,?)").run(id, a.userId, spec.key, spec.title, blob.key, blob.sha256, blob.byteLength, now);
      const insert = db.prepare(`INSERT INTO zip_entries(id,import_id,ordinal,name,path,byte_length,compressed_size,media_type,reason,state,publish_key) VALUES(?,?,?,?,?,?,?,?,?,'available',?)`);
      for (const m of members) insert.run(randomUUID4(), id, m.ordinal, m.name, m.path, m.size, m.compressedSize, m.media, m.reason, randomUUID4());
      return { id, replayed: false };
    });
  }
  list(prior) {
    return this.tx("read", (db, now) => db.prepare("SELECT id,title,byte_length,sha256,created_at FROM zip_imports WHERE owner_id=? ORDER BY created_at DESC,id").all(this.actor(prior, now).userId));
  }
  source(prior, id) {
    return this.tx("read", (db, now) => {
      const r = this.owned(db, this.actor(prior, now), id);
      return { key: String(r.storage_key), sha256: String(r.sha256), byteLength: Number(r.byte_length) };
    });
  }
  manifest(prior, id) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), r = this.owned(db, a, id);
      const rows = db.prepare(`SELECT e.id,e.name,e.path,e.byte_length AS size,e.compressed_size,e.media_type,e.reason,e.state,e.error,
      v.asset_id,v.id AS version_id,v.version,v.original_name,b.sha256,b.byte_length FROM zip_entries e
      LEFT JOIN asset_versions v ON v.id=e.version_id LEFT JOIN blobs b ON b.id=v.blob_id WHERE e.import_id=? ORDER BY e.ordinal`).all(id);
      const entries = rows.map(({ asset_id, version_id, version, original_name, sha256, byte_length, ...e }) => {
        const receipt2 = asset_id && this.readable(a, String(asset_id), now) ? { id: asset_id, version_id, version, title: original_name, sha256, byte_length, media_type: e.media_type } : void 0;
        return { ...e, ...receipt2 ? { receipt: receipt2 } : {} };
      });
      const state = rows.some((x) => x.state === "selected") ? "selected" : rows.some((x) => x.state === "failed") ? "partial" : rows.some((x) => x.state === "imported") ? "imported" : "staged";
      return { id, title: r.title, byte_length: r.byte_length, sha256: r.sha256, state, entries };
    });
  }
  select(prior, id, key, ids) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now);
      this.owned(db, a, id);
      if (!uuid.test(key) || !Array.isArray(ids) || !ids.length || ids.length > 512 || ids.some((x) => typeof x !== "string" || !uuid.test(x)) || new Set(ids).size !== ids.length) throw new AssetError(422, "INVALID_SELECTION");
      const canonical = JSON.stringify([...ids].sort()), digest2 = createHash3("sha256").update(canonical).digest("hex");
      const seen = db.prepare("SELECT import_id,selection_digest FROM zip_selections WHERE owner_id=? AND request_key=?").get(a.userId, key);
      if (seen && (seen.import_id !== id || seen.selection_digest !== digest2)) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
      const get = db.prepare("SELECT id,ordinal,path,media_type,reason,state,publish_key FROM zip_entries WHERE import_id=? AND id=?");
      const members = ids.map((entry) => {
        const r = get.get(id, entry);
        if (!r || r.reason !== null || !r.media_type) throw new AssetError(422, "INVALID_SELECTION");
        return { id: entry, ordinal: Number(r.ordinal), path: String(r.path), media: String(r.media_type), key: String(r.publish_key), imported: r.state === "imported" };
      });
      if (!seen) db.prepare("INSERT INTO zip_selections VALUES(?,?,?,?,?,?,?)").run(randomUUID4(), id, a.userId, key, digest2, canonical, now);
      const mark = db.prepare("UPDATE zip_entries SET state='selected',error=NULL WHERE import_id=? AND id=? AND state IN ('available','failed')");
      for (const entry of ids) mark.run(id, entry);
      return members.sort((a2, b) => a2.ordinal - b.ordinal);
    });
  }
  failure(prior, id, entry, code) {
    this.tx("write", (db, now) => {
      this.owned(db, this.actor(prior, now), id);
      db.prepare("UPDATE zip_entries SET state='failed',error=? WHERE import_id=? AND id=? AND state='selected'").run(code, id, entry);
    });
  }
  // Called inside AssetStore.publish's transaction; never open a nested transaction.
  publication(id, entry, key) {
    return (db, a, r) => {
      this.owned(db, a, id);
      const updated = db.prepare(`UPDATE zip_entries SET state='imported',version_id=?,error=NULL WHERE import_id=? AND id=? AND publish_key=?
      AND (state='selected' OR (state='imported' AND version_id=?))`).run(r.version_id, id, entry, key, r.version_id);
      if (updated.changes !== 1) throw new AssetError(409, "SELECTION_CHANGED");
    };
  }
};

// src/host/parse-store.ts
import { randomUUID as randomUUID5 } from "node:crypto";
var PARSE_SCHEMA = `CREATE TABLE pdf_parse_runs (
  version_id TEXT PRIMARY KEY REFERENCES asset_versions(id), session_id TEXT NOT NULL REFERENCES auth_sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL CHECK(state IN ('queued','running','complete','partial','failed','cancelled')),
  total INTEGER NOT NULL DEFAULT 0 CHECK(total BETWEEN 0 AND 10000), token TEXT UNIQUE, deadline INTEGER,
  losses INTEGER NOT NULL DEFAULT 0, error TEXT, CHECK ((state='running')=(token IS NOT NULL)), CHECK ((token IS NULL)=(deadline IS NULL))
) STRICT;
CREATE TABLE pdf_pages (
  version_id TEXT NOT NULL REFERENCES pdf_parse_runs(version_id), page INTEGER NOT NULL CHECK(page>=1),
  state TEXT NOT NULL CHECK(state IN ('pending','ready','review','failed')), chapter TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '', error TEXT, generation INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(version_id,page)
) STRICT;
CREATE INDEX pdf_pending ON pdf_pages(version_id,state,page);`;
var leaseMs = 15e3;
var ParseStore = class {
  constructor(tx, permit) {
    this.tx = tx;
    this.permit = permit;
  }
  operation(actor2, v) {
    const id = this.tx("read", (db, now) => {
      const r = db.prepare("SELECT v.asset_id FROM pdf_parse_runs r JOIN asset_versions v ON v.id=r.version_id WHERE r.version_id=?").get(v);
      if (!r || !this.permit(actor2.sessionId, actor2.userId, String(r.asset_id), false, now)) throw new AssetError(404, "ASSET_NOT_FOUND");
      return String(r.asset_id);
    });
    return this.control(actor2, id, v, "status");
  }
  pages(actor2, id, v, from, limit2) {
    if (!Number.isSafeInteger(from) || from < 1 || !Number.isSafeInteger(limit2) || limit2 < 1 || limit2 > 10) throw new AssetError(422, "INVALID_PAGE_RANGE");
    return this.tx("read", (db, now) => {
      if (!this.permit(actor2.sessionId, actor2.userId, id, false, now) || !this.pdfVersion(db, id, v)) throw new AssetError(404, "ASSET_NOT_FOUND");
      const rows = db.prepare(`SELECT page,state,chapter,error,CASE WHEN state IN ('ready','review') THEN text ELSE NULL END AS text
        FROM pdf_pages WHERE version_id=? AND page>=? ORDER BY page LIMIT ?`).all(v, from, limit2);
      return { version_id: v, from, pages: rows };
    });
  }
  control(actor2, id, v, op, page) {
    return this.tx(op === "status" ? "read" : "write", (db, now) => {
      if (!this.permit(actor2.sessionId, actor2.userId, id, op !== "status", now) || !this.pdfVersion(db, id, v)) throw new AssetError(404, "ASSET_NOT_FOUND");
      const prev = db.prepare("SELECT state FROM pdf_parse_runs WHERE version_id=?").get(v);
      if (op === "start") {
        if (!prev) db.prepare("INSERT INTO pdf_parse_runs(version_id,session_id,user_id,state) VALUES(?,?,?,'queued')").run(v, actor2.sessionId, actor2.userId);
        else if (["failed", "cancelled"].includes(String(prev.state))) {
          db.prepare("UPDATE pdf_parse_runs SET session_id=?,user_id=?,state='queued',error=NULL,losses=0 WHERE version_id=?").run(actor2.sessionId, actor2.userId, v);
        }
      } else if (op === "cancel") {
        if (!prev || !["running", "queued", "cancelled"].includes(String(prev.state))) throw new AssetError(409, "PARSE_NOT_ACTIVE");
        db.prepare("UPDATE pdf_parse_runs SET state='cancelled',token=NULL,deadline=NULL,error='CANCELLED' WHERE version_id=?").run(v);
      } else if (op === "retry") {
        if (!prev || prev.state !== "partial" || !page || !db.prepare("UPDATE pdf_pages SET state='pending',error=NULL WHERE version_id=? AND page=? AND state IN ('failed','review')").run(v, page).changes) throw new AssetError(409, "PAGE_NOT_RETRYABLE");
        db.prepare("UPDATE pdf_parse_runs SET state='queued',session_id=?,user_id=?,error=NULL,losses=0 WHERE version_id=?").run(actor2.sessionId, actor2.userId, v);
      }
      const run = db.prepare("SELECT state,total,error FROM pdf_parse_runs WHERE version_id=?").get(v);
      return { state: run?.state ?? "idle", total: run?.total ?? 0, error: run?.error ?? null, pages: db.prepare("SELECT page,state,chapter,error FROM pdf_pages WHERE version_id=? ORDER BY page").all(v) };
    });
  }
  pdfVersion(db, id, v) {
    return db.prepare("SELECT 1 FROM asset_versions a JOIN blobs b ON b.id=a.blob_id WHERE a.asset_id=? AND a.id=? AND b.media_type='application/pdf'").get(id, v);
  }
  claim() {
    if (!this.tx("read", (db, now) => db.prepare("SELECT 1 FROM pdf_parse_runs WHERE state='queued' OR (state='running' AND deadline<=?) LIMIT 1").get(Date.parse(now)))) return;
    return this.tx("write", (db, now) => {
      const ms = Date.parse(now);
      db.prepare(`UPDATE pdf_parse_runs SET state=CASE WHEN losses>=3 THEN 'failed' ELSE 'queued' END,losses=losses+1,
        token=NULL,deadline=NULL,error='LEASE_EXPIRED' WHERE state='running' AND deadline<=?`).run(ms);
      const r = db.prepare(`SELECT r.version_id,r.session_id,r.user_id,v.asset_id,b.storage_key,b.sha256,b.byte_length
        FROM pdf_parse_runs r JOIN asset_versions v ON v.id=r.version_id JOIN blobs b ON b.id=v.blob_id WHERE r.state='queued' ORDER BY r.rowid LIMIT 1`).get();
      if (!r) return;
      const version = String(r.version_id);
      if (!this.permit(String(r.session_id), String(r.user_id), String(r.asset_id), true, now)) {
        db.prepare("UPDATE pdf_parse_runs SET state='failed',error='AUTHORIZATION_LOST' WHERE version_id=?").run(version);
        return;
      }
      const token = randomUUID5();
      db.prepare("UPDATE pdf_parse_runs SET state='running',token=?,deadline=?,error=NULL WHERE version_id=?").run(token, ms + leaseMs, version);
      return { version, token, key: String(r.storage_key), sha256: String(r.sha256), byteLength: Number(r.byte_length) };
    });
  }
  leased(token, op) {
    return this.tx("write", (db, now) => {
      const ms = Date.parse(now), r = db.prepare(`SELECT r.*,v.asset_id FROM pdf_parse_runs r JOIN asset_versions v ON v.id=r.version_id
        WHERE token=? AND state='running' AND deadline>?`).get(token, ms);
      if (!r) return void 0;
      if (!this.permit(String(r.session_id), String(r.user_id), String(r.asset_id), true, now)) {
        db.prepare("UPDATE pdf_parse_runs SET state='failed',token=NULL,deadline=NULL,error='AUTHORIZATION_LOST' WHERE token=?").run(token);
        return void 0;
      }
      return op(db, String(r.version_id), ms);
    });
  }
  renew(token) {
    return this.leased(token, (db, _v, ms) => Boolean(db.prepare("UPDATE pdf_parse_runs SET deadline=? WHERE token=?").run(ms + leaseMs, token).changes));
  }
  initialize(token, total) {
    if (!Number.isSafeInteger(total) || total < 1 || total > 1e4) throw Error("PAGE_COUNT_LIMIT");
    return this.leased(token, (db, v) => {
      const before = Number(db.prepare("SELECT total FROM pdf_parse_runs WHERE version_id=?").get(v).total);
      if (before && before !== total) throw Error("PAGE_COUNT_CHANGED");
      if (!before) {
        db.prepare("UPDATE pdf_parse_runs SET total=? WHERE version_id=?").run(total, v);
        const insert = db.prepare("INSERT INTO pdf_pages(version_id,page,state) VALUES(?,?,'pending')");
        for (let p = 1; p <= total; p++) insert.run(v, p);
      }
      return true;
    });
  }
  next(token) {
    return this.leased(token, (db, v) => {
      const pending = db.prepare("SELECT page FROM pdf_pages WHERE version_id=? AND state='pending' ORDER BY page LIMIT 1").get(v);
      if (pending) return Number(pending.page);
      db.prepare(`UPDATE pdf_parse_runs SET state=CASE WHEN EXISTS(SELECT 1 FROM pdf_pages WHERE version_id=? AND state IN ('failed','review'))
      THEN 'partial' ELSE 'complete' END,token=NULL,deadline=NULL,error=NULL WHERE version_id=?`).run(v, v);
      return null;
    });
  }
  publish(token, page, result) {
    return this.leased(token, (db, v) => {
      if (result && (result.text.length > 262144 || result.chapter.length > 512)) throw Error("PAGE_OUTPUT_LIMIT");
      const state = result ? result.needsReview || !result.text.trim() ? "review" : "ready" : "failed";
      const wrote = db.prepare(`UPDATE pdf_pages SET state=?,text=?,chapter=?,error=?,generation=generation+1
      WHERE version_id=? AND page=? AND state='pending'`).run(state, result?.text ?? "", result?.chapter ?? "", result ? null : "PAGE_EXTRACTION_FAILED", v, page);
      if (wrote.changes) db.prepare("UPDATE pdf_parse_runs SET losses=0 WHERE version_id=?").run(v);
      return Boolean(wrote.changes);
    });
  }
  fail(token) {
    return this.leased(token, (db, v) => db.prepare("UPDATE pdf_parse_runs SET state='failed',token=NULL,deadline=NULL,error='DOCUMENT_UNAVAILABLE' WHERE version_id=?").run(v));
  }
};

// src/host/text-schema.ts
var TEXT_SCHEMA = `CREATE TEMP TABLE kos_prior_blobs AS SELECT id,storage_key,sha256,byte_length,media_type FROM blobs;
DROP TABLE blobs;
CREATE TABLE blobs (
  id TEXT PRIMARY KEY, storage_key TEXT UNIQUE NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0), media_type TEXT NOT NULL CHECK(media_type IN ('application/pdf','text/plain','text/markdown'))
) STRICT;
INSERT INTO blobs SELECT id,storage_key,sha256,byte_length,media_type FROM kos_prior_blobs;
DROP TABLE kos_prior_blobs;
CREATE TABLE text_versions (version_id TEXT PRIMARY KEY REFERENCES asset_versions(id), encoding TEXT NOT NULL, block_count INTEGER NOT NULL CHECK(block_count>=0)) STRICT;
CREATE TABLE text_blocks (version_id TEXT NOT NULL REFERENCES text_versions(version_id), ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  kind TEXT NOT NULL, start INTEGER NOT NULL CHECK(start>=0), end INTEGER NOT NULL CHECK(end>=start), text TEXT NOT NULL, anchor TEXT NOT NULL,
  PRIMARY KEY(version_id,ordinal)) STRICT;`;

// src/host/office-schema.ts
var WORD_MEDIA = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword"
};
var OFFICE_HISTORY_SCHEMA = `CREATE INDEX office_history_version ON office_conversions(version_id);
CREATE INDEX office_history_ready ON office_conversions(version_id) WHERE state='ready';
CREATE INDEX office_history_notes ON office_quality_notes(conversion_id);`;
var OFFICE_AUTH_SCHEMA = `CREATE TABLE office_authorizations (
  conversion_id TEXT PRIMARY KEY REFERENCES office_conversions(id),
  session_id TEXT NOT NULL REFERENCES auth_sessions(id)
) STRICT;`;
var OFFICE_SCHEMA = `CREATE TEMP TABLE kos_office_prior_blobs AS SELECT * FROM blobs;
DROP TABLE blobs;
CREATE TABLE blobs (
  id TEXT PRIMARY KEY, storage_key TEXT UNIQUE NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0), media_type TEXT NOT NULL CHECK(media_type IN ('application/pdf','text/plain','text/markdown','${WORD_MEDIA.docx}','${WORD_MEDIA.doc}'))
) STRICT;
INSERT INTO blobs SELECT id,storage_key,sha256,byte_length,media_type FROM kos_office_prior_blobs;
DROP TABLE kos_office_prior_blobs;
CREATE TABLE office_conversions (
  id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES asset_versions(id),
  actor_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','ready','cancelled','failed','superseded')),
  lease_token TEXT, lease_until TEXT, attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt>=0),
  result_blob_id TEXT UNIQUE REFERENCES blobs(id), page_count INTEGER, missing_fonts TEXT, failure_code TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(actor_id,request_key),
  CHECK((state='running')=(lease_token IS NOT NULL) AND (state='running')=(lease_until IS NOT NULL)),
  CHECK((state='ready')=(result_blob_id IS NOT NULL)),
  CHECK((state='ready' AND page_count IS NOT NULL AND page_count>0 AND missing_fonts IS NOT NULL)
     OR (state!='ready' AND page_count IS NULL AND missing_fonts IS NULL))
) STRICT;
CREATE UNIQUE INDEX office_one_active ON office_conversions(version_id) WHERE state IN ('queued','running');
CREATE TABLE office_quality_notes (
  id TEXT PRIMARY KEY, conversion_id TEXT NOT NULL REFERENCES office_conversions(id),
  author_id TEXT NOT NULL REFERENCES users(id), page INTEGER NOT NULL CHECK(page>=1),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), created_at TEXT NOT NULL,
  request_key TEXT NOT NULL, UNIQUE(author_id,request_key)
) STRICT;`;

// src/host/office-store.ts
import { randomUUID as randomUUID6 } from "node:crypto";
var historyLimit = 10;
var conversionFields = "id,state,page_count,missing_fonts,failure_code";
var missing = () => new AssetError(404, "ASSET_NOT_FOUND");
var keyPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
var checkKey = (key) => {
  if (!keyPattern.test(key) || key.length !== 36) throw new AssetError(422, "INVALID_IDEMPOTENCY_KEY");
};
var deadline = (now) => new Date(Date.parse(now) + 15e3).toISOString();
var due = "state='queued' OR (state='running' AND lease_until<=?)";
var sourceSQL = `SELECT v.asset_id,v.id AS version_id,b.media_type,b.sha256,b.byte_length,b.storage_key,
  NOT EXISTS(SELECT 1 FROM asset_versions n WHERE n.asset_id=v.asset_id AND n.version>v.version) AS head
  FROM asset_versions v JOIN blobs b ON b.id=v.blob_id WHERE v.id=? AND b.media_type IN (?,?)`;
var OfficeStore = class {
  constructor(tx, permit) {
    this.tx = tx;
    this.permit = permit;
  }
  sourceRow(db, v) {
    return db.prepare(sourceSQL).get(v, WORD_MEDIA.doc, WORD_MEDIA.docx);
  }
  access(db, now, a, id, v, action2) {
    if (!this.permit(a.sessionId, a.userId, id, "read", now) || action2 !== "read" && !this.permit(a.sessionId, a.userId, id, action2, now)) throw missing();
    const row = this.sourceRow(db, v);
    if (!row || row.asset_id !== id) throw missing();
    return row;
  }
  list(a, id, v, options = {}) {
    return this.tx("read", (db, now) => {
      this.access(db, now, a, id, v, "read");
      const { before, conversion, notes_before } = options;
      if (Object.keys(options).some((k) => !["before", "conversion", "notes_before"].includes(k)) || [before, conversion, notes_before].some((x) => x !== void 0 && (typeof x !== "string" || x.length !== 36 || !keyPattern.test(x))) || before && conversion || notes_before && !conversion) throw new AssetError(422, "INVALID_HISTORY_CURSOR");
      const seek = (sql, cursor, parent) => {
        const row = db.prepare(sql).get(cursor, parent);
        if (!row) throw missing();
        return row.rowid;
      };
      const notePos = notes_before ? seek("SELECT rowid FROM office_quality_notes WHERE id=? AND conversion_id=?", notes_before, conversion) : void 0;
      const notes = db.prepare(`SELECT id,page,body FROM office_quality_notes WHERE conversion_id=? ${notePos === void 0 ? "" : "AND rowid<?"} ORDER BY rowid DESC LIMIT ?`);
      const present = (r) => {
        const page = notes.all(r.id, ...notePos === void 0 ? [] : [notePos], historyLimit + 1);
        const more2 = page.length > historyLimit;
        if (more2) page.pop();
        return {
          ...r,
          missing_fonts: r.missing_fonts ? JSON.parse(String(r.missing_fonts)) : [],
          ...more2 ? { notes_next_before: page.at(-1).id } : {},
          notes: page.reverse()
        };
      };
      const select = `SELECT ${conversionFields} FROM office_conversions WHERE version_id=?`;
      if (conversion) {
        const row = db.prepare(select + " AND id=?").get(v, conversion);
        if (!row) throw missing();
        return { version_id: v, conversions: [present(row)] };
      }
      const pos = before ? seek("SELECT rowid FROM office_conversions WHERE id=? AND version_id=?", before, v) : void 0;
      const rows = db.prepare(select + (before ? " AND rowid<?" : "") + " ORDER BY rowid DESC LIMIT ?").all(v, ...pos === void 0 ? [] : [pos], historyLimit + 1);
      const more = rows.length > historyLimit;
      if (more) rows.pop();
      const ready = db.prepare(select + " AND state='ready' ORDER BY rowid DESC LIMIT 1").get(v);
      return {
        version_id: v,
        conversions: rows.map(present),
        ...more ? { next_before: rows.at(-1).id } : {},
        ...ready && !rows.some((r) => r.id === ready.id) ? { latest_ready: present(ready) } : {}
      };
    });
  }
  start(a, id, v, key, available = true) {
    return this.tx("write", (db, now) => {
      const row = this.access(db, now, a, id, v, "edit");
      checkKey(key);
      const prev = db.prepare("SELECT id,version_id,state FROM office_conversions WHERE actor_id=? AND request_key=?").get(a.userId, key);
      if (prev) {
        if (prev.version_id !== v) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { id: String(prev.id), state: String(prev.state), replayed: true };
      }
      if (!row.head) throw new AssetError(409, "SOURCE_CHANGED");
      if (db.prepare("SELECT 1 FROM office_conversions WHERE version_id=? AND state IN ('queued','running')").get(v)) throw new AssetError(409, "CONVERSION_IN_PROGRESS");
      if (!available) throw new AssetError(503, "OFFICE_UNAVAILABLE");
      const cid = randomUUID6();
      db.prepare("INSERT INTO office_conversions(id,version_id,actor_id,request_key,state,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?)").run(cid, v, a.userId, key, now, now);
      db.prepare("INSERT INTO office_authorizations VALUES(?,?)").run(cid, a.sessionId);
      return { id: cid, state: "queued", replayed: false };
    });
  }
  cancel(a, id, v, cid) {
    return this.tx("write", (db, now) => {
      this.access(db, now, a, id, v, "edit");
      const row = db.prepare("SELECT state FROM office_conversions WHERE id=? AND version_id=?").get(cid, v);
      if (!row) throw missing();
      if (row.state !== "cancelled") {
        if (row.state !== "running" && row.state !== "queued") throw new AssetError(409, "CONVERSION_NOT_ACTIVE");
        db.prepare("UPDATE office_conversions SET state='cancelled',failure_code='CANCELLED',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(now, cid);
      }
      return { id: cid, state: "cancelled" };
    });
  }
  result(a, id, v, cid, download) {
    return this.tx("read", (db, now) => {
      this.access(db, now, a, id, v, download ? "export" : "read");
      const row = db.prepare("SELECT b.storage_key,b.byte_length,b.sha256 FROM office_conversions c JOIN blobs b ON b.id=c.result_blob_id WHERE c.id=? AND c.version_id=? AND c.state='ready' AND b.media_type='application/pdf'").get(cid, v);
      if (!row) throw missing();
      return { key: String(row.storage_key), byteLength: Number(row.byte_length), sha256: String(row.sha256) };
    });
  }
  note(a, id, v, cid, key, page, body) {
    return this.tx("write", (db, now) => {
      this.access(db, now, a, id, v, "edit");
      checkKey(key);
      const row = db.prepare("SELECT page_count FROM office_conversions WHERE id=? AND version_id=? AND state='ready'").get(cid, v);
      if (!row) throw missing();
      if (!Number.isSafeInteger(page) || page < 1 || page > Number(row.page_count) || typeof body !== "string" || !body.trim() || body.length > 2e3 || body.includes("\0")) throw new AssetError(422, "INVALID_QUALITY_NOTE");
      const prev = db.prepare("SELECT id,conversion_id,page,body FROM office_quality_notes WHERE author_id=? AND request_key=?").get(a.userId, key);
      if (prev) {
        if (prev.conversion_id !== cid || prev.page !== page || prev.body !== body) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { id: String(prev.id), replayed: true };
      }
      const note = randomUUID6();
      db.prepare("INSERT INTO office_quality_notes VALUES(?,?,?,?,?,?,?)").run(note, cid, a.userId, page, body, now, key);
      return { id: note, replayed: false };
    });
  }
  claim() {
    if (!this.tx("read", (db, now) => db.prepare(`SELECT 1 FROM office_conversions WHERE ${due} LIMIT 1`).get(now))) return;
    return this.tx("write", (db, now) => {
      const row = db.prepare(`SELECT id,attempt FROM office_conversions WHERE ${due} ORDER BY rowid LIMIT 1`).get(now);
      if (!row) return;
      if (Number(row.attempt) >= 3) {
        db.prepare("UPDATE office_conversions SET state='failed',failure_code='LEASE_EXPIRED',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(now, row.id);
        return;
      }
      const token = randomUUID6();
      db.prepare("UPDATE office_conversions SET state='running',attempt=attempt+1,lease_token=?,lease_until=?,updated_at=? WHERE id=?").run(token, deadline(now), now, row.id);
      return this.authority(db, now, token) ? { token } : void 0;
    });
  }
  authority(db, now, token) {
    const row = db.prepare(`SELECT c.id,c.actor_id,c.version_id,a.session_id FROM office_conversions c LEFT JOIN office_authorizations a ON a.conversion_id=c.id
      WHERE c.state='running' AND c.lease_token=? AND c.lease_until>?`).get(token, now);
    if (!row) return;
    const source = this.sourceRow(db, String(row.version_id)), session = String(row.session_id), user = String(row.actor_id), asset = String(source?.asset_id);
    if (!source?.head || !row.session_id || !this.permit(session, user, asset, "read", now) || !this.permit(session, user, asset, "edit", now)) {
      db.prepare("UPDATE office_conversions SET state=?,failure_code=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(source?.head ? "failed" : "superseded", source?.head ? "AUTHORIZATION_LOST" : "SOURCE_CHANGED", now, row.id);
      return;
    }
    return { assetId: asset, versionId: String(row.version_id), key: String(source.storage_key), sha256: String(source.sha256), byteLength: Number(source.byte_length), extension: source.media_type === WORD_MEDIA.doc ? "doc" : "docx" };
  }
  source(token) {
    return this.tx("write", (db, now) => this.authority(db, now, token));
  }
  renew(token) {
    return this.tx("write", (db, now) => !!this.authority(db, now, token) && !!db.prepare("UPDATE office_conversions SET lease_until=? WHERE lease_token=?").run(deadline(now), token).changes);
  }
  complete(token, blob, pageCount, fonts) {
    return this.tx("write", (db, now) => {
      if (!this.authority(db, now, token)) return false;
      if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 1e4 || !Number.isSafeInteger(blob.byteLength) || blob.byteLength <= 0 || blob.byteLength > 64 * 1024 * 1024 || !Array.isArray(fonts) || fonts.length > 1024 || fonts.some((f) => typeof f !== "string" || f.length > 512)) throw new AssetError(422, "INVALID_OFFICE_RESULT");
      const bid = randomUUID6();
      db.prepare("INSERT INTO blobs VALUES(?,?,?,?,'application/pdf')").run(bid, blob.key, blob.sha256, blob.byteLength);
      db.prepare("UPDATE office_conversions SET state='ready',result_blob_id=?,page_count=?,missing_fonts=?,failure_code=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE lease_token=?").run(bid, pageCount, JSON.stringify(fonts), now, token);
      return true;
    });
  }
  fail(token, code) {
    this.tx("write", (db, now) => {
      if (!this.authority(db, now, token)) return;
      db.prepare("UPDATE office_conversions SET state='failed',failure_code=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE lease_token=?").run(/^[a-zA-Z0-9_-]{1,64}$/.test(code) ? code : "CONVERSION_FAILED", now, token);
    });
  }
};

// src/host/zip-schema.ts
var ZIP_SCHEMA = `CREATE TABLE zip_imports (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), upload_key TEXT NOT NULL,
  title TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0), created_at TEXT NOT NULL,
  UNIQUE(owner_id,upload_key)
) STRICT;
CREATE INDEX zip_import_owner ON zip_imports(owner_id);
CREATE TABLE zip_entries (
  id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES zip_imports(id), ordinal INTEGER NOT NULL CHECK(ordinal>=0),
  name TEXT NOT NULL, path TEXT NOT NULL, byte_length INTEGER NOT NULL CHECK(byte_length>=0),
  compressed_size INTEGER NOT NULL CHECK(compressed_size>=0), media_type TEXT, reason TEXT,
  state TEXT NOT NULL CHECK(state IN ('available','selected','imported','failed')),
  publish_key TEXT NOT NULL UNIQUE, version_id TEXT UNIQUE REFERENCES asset_versions(id), error TEXT,
  CHECK((state='imported')=(version_id IS NOT NULL)), CHECK((state='failed')=(error IS NOT NULL)),
  CHECK(reason IS NULL OR state='available'), UNIQUE(import_id,ordinal), UNIQUE(import_id,path)
) STRICT;
CREATE TABLE zip_selections (
  id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES zip_imports(id), owner_id TEXT NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL, selection_digest TEXT NOT NULL CHECK(length(selection_digest)=64), member_ids TEXT NOT NULL CHECK(json_valid(member_ids) AND json_type(member_ids)='array'), created_at TEXT NOT NULL,
  UNIQUE(owner_id,request_key)
) STRICT;`;

// src/host/storage.ts
var APPLICATION_ID = 1263489841;
var SCHEMA_VERSION = 13;
var MIGRATION_V13_CHECKSUM = createHash4("sha256").update(ZIP_SCHEMA).digest("hex");
var MIGRATION_V12_CHECKSUM = createHash4("sha256").update(OFFICE_HISTORY_SCHEMA).digest("hex");
var MIGRATION_V11_CHECKSUM = createHash4("sha256").update(OFFICE_AUTH_SCHEMA).digest("hex");
var MIGRATION_V10_CHECKSUM = createHash4("sha256").update(OFFICE_SCHEMA).digest("hex");
var MIGRATION_V9_CHECKSUM = createHash4("sha256").update(TEXT_SCHEMA).digest("hex");
var MIGRATION_V8_CHECKSUM = createHash4("sha256").update(PARSE_SCHEMA).digest("hex");
var MIGRATION_V7_CHECKSUM = createHash4("sha256").update(ASSET_SCHEMA).digest("hex");
var MIGRATION_V6_CHECKSUM = createHash4("sha256").update(JOB_SCHEMA).digest("hex");
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
var MIGRATION_V1_CHECKSUM = createHash4("sha256").update(Buffer.from(MIGRATION_V1_SQL, "utf8")).digest("hex");
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
var MIGRATION_V2_CHECKSUM = createHash4("sha256").update(Buffer.from(MIGRATION_V2_SQL, "utf8")).digest("hex");
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
var MIGRATION_V3_CHECKSUM = createHash4("sha256").update(Buffer.from(MIGRATION_V3_SQL, "utf8")).digest("hex");
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
var MIGRATION_V4_CHECKSUM = createHash4("sha256").update(Buffer.from(MIGRATION_V4_SQL, "utf8")).digest("hex");
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
var MIGRATION_V5_CHECKSUM = createHash4("sha256").update(MIGRATION_V5_SQL).digest("hex");
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
  #assetTx = (mode, op) => {
    let db;
    try {
      db = this.#ensureReady();
      db.exec(mode === "write" ? "BEGIN IMMEDIATE" : "BEGIN");
    } catch (e) {
      throw new AssetError(503, this.#mapError(e).code);
    }
    try {
      const value = op(db, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("COMMIT");
      return value;
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw e instanceof AssetError ? e : new AssetError(503, this.#mapError(e).code);
    }
  };
  #currentActor(session, now) {
    const ref = this.#ensureReady().prepare("SELECT token_hash FROM auth_sessions WHERE id=? AND user_id=?").get(session.sessionId, session.userId);
    return ref ? this.findActor(String(ref.token_hash), now) : void 0;
  }
  assets = new AssetStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (actor2, id, action2, now) => Boolean(this.authorizeObject(actor2, id, action2, now)));
  archives = new ZipStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (a, id, now) => Boolean(this.authorizeObject(a, id, "read", now)));
  office = new OfficeStore(this.#assetTx, (sessionId, userId, id, action2, now) => {
    const actor2 = this.#currentActor({ sessionId, userId }, now);
    return !!actor2 && !!this.authorizeObject(actor2, id, action2, now);
  });
  parses = new ParseStore(this.#assetTx, (sessionId, userId, id, write, now) => {
    const a = this.#currentActor({ sessionId, userId }, now);
    return Boolean(a && this.authorizeObject(a, id, "read", now) && (!write || this.authorizeObject(a, id, "edit", now)));
  });
  jobs = new JobStore((op) => {
    const db = this.#ensureReady();
    try {
      db.exec("BEGIN IMMEDIATE");
    } catch (err) {
      throw this.#mapError(err);
    }
    try {
      const value = op(db, Date.now());
      db.exec("COMMIT");
      return value;
    } catch (err) {
      if (!this.#rollback(db)) throw this.#failure;
      throw err instanceof JobError ? err : this.#mapError(err);
    }
  }, (session, user, object, ms) => {
    const now = new Date(ms).toISOString();
    const ref = this.#ensureReady().prepare("SELECT token_hash FROM auth_sessions WHERE id=? AND user_id=?").get(session, user);
    const actor2 = ref && this.findActor(String(ref.token_hash), now);
    return actor2 && this.authorizeObject(actor2, object, "read", now)?.revision;
  }, (point) => this.#injectFailure(point));
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
      const priorVersion = existing === "blank" ? 0 : Number(existing.slice(1));
      if (priorVersion < 6) {
        if (existing !== "v5") this.#migrateV5(db);
        this.#migrateV6(db);
      }
      if (priorVersion < 7) this.#migrateV7(db);
      if (priorVersion < 8) this.#migrateV8(db);
      if (priorVersion < 9) this.#migrateV9(db);
      if (priorVersion < 10) this.#migrateV10(db);
      if (priorVersion < 11) this.#migrateV11(db);
      if (priorVersion < 12) this.#migrateV12(db);
      if (priorVersion < 13) this.#migrateV13(db);
      this.#verify(db, 13);
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
    if (facts.userVersion === 6 || facts.userVersion === 7 || facts.userVersion === 8 || facts.userVersion === 9 || facts.userVersion === 10 || facts.userVersion === 11 || facts.userVersion === 12 || facts.userVersion === 13) {
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        this.#verify(db, facts.userVersion);
      } finally {
        db.close();
      }
      return `v${facts.userVersion}`;
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
      db.prepare("INSERT INTO service_identity (id, service_id, bootstrap_admin_user_id, initialized_at) VALUES (1, ?, NULL, NULL)").run(randomUUID7());
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
  #migrateV6(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(JOB_SCHEMA);
      this.#injectFailure("v6:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(6,?,?)").run(MIGRATION_V6_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=6; COMMIT");
    } catch (err) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "jobs migration failed", false, { cause: err });
    }
  }
  #migrateV7(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(ASSET_SCHEMA);
      this.#injectFailure("v7:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(7,?,?)").run(MIGRATION_V7_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=7; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "asset migration failed", false, { cause: e });
    }
  }
  #migrateV8(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(PARSE_SCHEMA);
      this.#injectFailure("v8:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(8,?,?)").run(MIGRATION_V8_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=8; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "parse migration failed", false, { cause: e });
    }
  }
  #migrateV9(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("PRAGMA defer_foreign_keys=ON");
      db.exec(TEXT_SCHEMA);
      this.#injectFailure("v9:after-schema");
      if (db.prepare("PRAGMA foreign_key_check").get()) throw Error("broken reference");
      db.prepare("INSERT INTO schema_migrations VALUES(9,?,?)").run(MIGRATION_V9_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=9; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "text migration failed", false, { cause: e });
    }
  }
  #migrateV10(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("PRAGMA defer_foreign_keys=ON");
      db.exec(OFFICE_SCHEMA);
      this.#injectFailure("v10:after-schema");
      if (db.prepare("PRAGMA foreign_key_check").get()) throw Error("broken reference");
      db.prepare("INSERT INTO schema_migrations VALUES(10,?,?)").run(MIGRATION_V10_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=10; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "office migration failed", false, { cause: e });
    }
  }
  #migrateV11(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(OFFICE_AUTH_SCHEMA);
      this.#injectFailure("v11:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(11,?,?)").run(MIGRATION_V11_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=11; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "office authorization migration failed", false, { cause: e });
    }
  }
  #migrateV12(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(OFFICE_HISTORY_SCHEMA);
      this.#injectFailure("v12:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(12,?,?)").run(MIGRATION_V12_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=12; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "office history index migration failed", false, { cause: e });
    }
  }
  #migrateV13(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(ZIP_SCHEMA);
      this.#injectFailure("v13:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(13,?,?)").run(MIGRATION_V13_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=13; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "ZIP import migration failed", false, { cause: e });
    }
  }
  #verify(db, version) {
    const facts = readDatabaseFacts(this.databasePath);
    const checks = [MIGRATION_V6_CHECKSUM, MIGRATION_V7_CHECKSUM, MIGRATION_V8_CHECKSUM, MIGRATION_V9_CHECKSUM, MIGRATION_V10_CHECKSUM, MIGRATION_V11_CHECKSUM, MIGRATION_V12_CHECKSUM, MIGRATION_V13_CHECKSUM].slice(0, version - 5);
    if (facts.applicationId !== APPLICATION_ID || facts.userVersion !== version || facts.ledger.length !== version || checks.some((hash, i) => facts.ledger[i + 5]?.version !== i + 6 || facts.ledger[i + 5]?.checksum !== hash)) throw new RecordsError("STORAGE_INCOMPATIBLE", "database ownership/version verification failed");
    const reference = new DatabaseSync(":memory:");
    try {
      reference.exec(JOB_SCHEMA);
      if (version >= 7) reference.exec(ASSET_SCHEMA);
      if (version >= 8) reference.exec(PARSE_SCHEMA);
      if (version >= 9) reference.exec(TEXT_SCHEMA);
      if (version >= 10) reference.exec(OFFICE_SCHEMA);
      if (version >= 11) reference.exec(OFFICE_AUTH_SCHEMA);
      if (version >= 12) reference.exec(OFFICE_HISTORY_SCHEMA);
      if (version >= 13) reference.exec(ZIP_SCHEMA);
      const definitions = reference.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
      for (const { name: name2, sql } of definitions) {
        if (db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(name2)?.sql !== sql) throw new RecordsError("STORAGE_INCOMPATIBLE", "jobs schema definition mismatch");
      }
      const names = new Set(definitions.map((x) => x.name));
      this.#assertV5Schema({ ...facts, ledger: facts.ledger.slice(0, 5), objects: facts.objects.filter((x) => !names.has(x.name)) });
    } finally {
      reference.close();
    }
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
      const userId = randomUUID7();
      const spaceId = randomUUID7();
      const credentialId = randomUUID7();
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
      const userId = randomUUID7();
      const spaceId = randomUUID7();
      const credentialId = randomUUID7();
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
        for (const action2 of ["read", "comment", "edit", "export", "manage_share", "delete", "review", "view_learning_records"]) db.prepare("INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, created_at) VALUES (?, ?, 'knowledge_object', ?, 'user', ?, ?, ?, ?)").run(randomUUID7(), input.serviceId, input.id, input.ownerUserId, action2, input.now, input.now);
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
      const receipt2 = db.prepare("SELECT request_digest, result_json FROM ai_tool_mutations WHERE service_id = ? AND user_id = ? AND idempotency_key = ?").get(actor2.serviceId, actor2.userId, input.key);
      if (receipt2 !== void 0) return finish(receipt2.request_digest === input.digest ? { kind: "replayed", object: JSON.parse(receipt2.result_json) } : { kind: "idempotency_conflict" });
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
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.firstId, input.firstKey, createHash4("sha256").update(input.content).digest("hex"), input.content, (/* @__PURE__ */ new Date()).toISOString());
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.firstId, input.failingKey, createHash4("sha256").update(input.content).digest("hex"), input.content, (/* @__PURE__ */ new Date()).toISOString());
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
import { createHash as createHash5, randomBytes, randomUUID as randomUUID8, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
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
  return createHash5("sha256").update(token, "utf8").digest("hex");
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
    return await new Promise((resolve2, reject2) => {
      const item = { password, salt, signal, resolve: resolve2, reject: reject2 };
      this.#queue.push(item);
      const onAbort = () => {
        const index = this.#queue.indexOf(item);
        if (index !== -1) {
          this.#queue.splice(index, 1);
          this.#queuedCancelled += 1;
          reject2(new DOMException("aborted", "AbortError"));
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
      return await new Promise((resolve2, reject2) => {
        nodeScrypt(password, salt, KDF_CONFIG.keyLen, { N: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem }, (error, derived) => {
          if (error) reject2(error);
          else {
            this.#completed += 1;
            resolve2(derived);
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
    while (this.#running > 0) await new Promise((resolve2) => setTimeout(resolve2, 5));
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
    let valid2 = false;
    try {
      valid2 = await verifyPassword(this.#kdf, password, lookup?.credential ?? { algorithm: "scrypt", version: 1, n: KDF_CONFIG.n, r: KDF_CONFIG.r, p: KDF_CONFIG.p, maxmem: KDF_CONFIG.maxmem, salt: Buffer.alloc(KDF_CONFIG.saltBytes), derivedKey: Buffer.alloc(KDF_CONFIG.keyLen) }, input.signal);
    } catch (error) {
      if (error instanceof IdentityError && error.code === "AUTH_RATE_LIMITED") throw error;
      valid2 = false;
    }
    if (input.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (!lookup || lookup.status !== "active" || !valid2) {
      this.#limiter.failure(loginName, input.source);
      throw new IdentityError("INVALID_CREDENTIALS", "invalid credentials");
    }
    const token = makeToken();
    const createdAt = /* @__PURE__ */ new Date();
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString();
    this.#store.createSession({ sessionId: randomUUID8(), userId: lookup.userId, tokenHash: tokenHash(token), createdAt: createdAt.toISOString(), expiresAt, revokeTokenHash: input.oldToken ? tokenHash(input.oldToken) : void 0 });
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
import { createHash as createHash6, randomUUID as randomUUID9 } from "node:crypto";
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
  const missing2 = 8 - left.length - right.length;
  if (groups.length === 1 && missing2 !== 0 || groups.length === 2 && missing2 < 1) return false;
  const expanded = groups.length === 1 ? left : [...left, ...Array(missing2).fill("0"), ...right];
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
  return `kos_session_${createHash6("sha256").update(`${serviceId}|${origin}`).digest("hex").slice(0, 16)}`;
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
  return await new Promise((resolve2, reject2) => {
    let total = 0;
    let settled = false;
    const chunks = [];
    const fail = (error) => {
      if (settled) return;
      settled = true;
      req.resume();
      reject2(error);
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
        reject2(new HttpError(400, "INVALID_JSON", "request body is not valid UTF-8"));
        return;
      }
      try {
        resolve2(JSON.parse(text2));
      } catch {
        reject2(new HttpError(400, "INVALID_JSON", "request body is not valid JSON"));
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
    const requestId = randomUUID9();
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
    sendJson2(res, 200, withMeta(randomUUID9(), { setup_required: !state.initialized, available: true }));
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
    sendJson2(res, 201, withMeta(randomUUID9(), safeProfile(user)));
  });
  const register = async (req, res) => dispatch(req, res, async () => {
    requireMethod(req, "POST");
    assertTrust(req, true);
    const signal = requestSignal(req, res);
    requireJson(req);
    const body = bodyObject(await readBody2(req));
    assertKeys(body, ["login_name", "password", "display_name", "timezone"]);
    const user = await service.register({ loginName: body.login_name, password: body.password, displayName: body.display_name, timezone: body.timezone, source: requestSource(req), signal });
    sendJson2(res, 201, withMeta(randomUUID9(), safeProfile(user)));
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
    sendJson2(res, 200, withMeta(randomUUID9(), safeProfile(result.user)), { "set-cookie": sessionCookie(name2, result.token, origin, options.protocol(), maxAge) });
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
    sendJson2(res, 200, withMeta(randomUUID9(), safeProfile(profile)));
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
    sendJson2(res, 200, withMeta(randomUUID9(), safeProfile(service.preferences(actor2.userId, expectedRevision, patch))));
  });
  const spaces = async (req, res) => dispatch(req, res, () => {
    requireMethod(req, "GET");
    assertTrust(req, false);
    const actor2 = requireActor(req);
    const data = service.spaces(actor2.userId).map((space) => ({ id: space.id, service_id: space.serviceId, kind: space.kind, owner_user_id: space.ownerUserId, status: space.status, revision: space.revision, created_at: space.createdAt, updated_at: space.updatedAt }));
    sendJson2(res, 200, withMeta(randomUUID9(), data));
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
import { randomUUID as randomUUID10 } from "node:crypto";
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
var readBody3 = async (req) => await new Promise((resolve2, reject2) => {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > 16 * 1024) {
      reject2(new ObjectHttpError(413, "PAYLOAD_TOO_LARGE", "request body exceeds the limit"));
      req.resume();
    } else chunks.push(chunk);
  });
  req.on("end", () => {
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
      resolve2(value);
    } catch {
      reject2(new ObjectHttpError(400, "INVALID_JSON", "request body is not valid JSON"));
    }
  });
  req.on("error", () => reject2(new ObjectHttpError(400, "INVALID_JSON", "request body could not be read")));
});
var keys = (body, allowed) => {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new ObjectHttpError(422, "INPUT_INVALID", "body contains an unsupported field");
};
var action = (value) => {
  if (typeof value !== "string" || !AUTH_ACTIONS.includes(value)) throw new ObjectHttpError(422, "INPUT_INVALID", "action is invalid");
  return value;
};
var text = (value, name2, max2) => {
  if (typeof value !== "string" || value.length < 1 || value.length > max2 || !value.isWellFormed()) throw new ObjectHttpError(422, "INPUT_INVALID", `${name2} is invalid`);
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
    const requestId = randomUUID10();
    try {
      const path = pathOf(req);
      const segments = path.split("/").filter(Boolean);
      trust(req, options.origin(), req.method !== "GET");
      const current = actor(options, req);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (segments[2] === "jobs") {
        if (segments.length === 3 && req.method === "POST") {
          const body = await readBody3(req);
          keys(body, ["object_id", "expected_revision", "idempotency_key"]);
          if (!Number.isSafeInteger(body.expected_revision) || Number(body.expected_revision) < 1) throw new JobError(422, "INPUT_INVALID");
          const id = options.storage.jobs.enqueue(current, text(body.object_id, "object_id", 80), Number(body.expected_revision), text(body.idempotency_key, "idempotency_key", 128));
          json(res, 202, { data: { id } });
          return;
        }
        const cancel = segments.length === 5 && segments[4] === "cancel" && req.method === "POST";
        if (segments[3] && (cancel || segments.length === 4 && req.method === "GET")) {
          json(res, 200, { data: options.storage.jobs.inspect(current, segments[3], cancel) });
          return;
        }
      }
      if (segments[2] === "projects" && segments.length === 3 && req.method === "POST") {
        const body = await readBody3(req);
        keys(body, ["name"]);
        const project = options.storage.createProject({ id: randomUUID10(), serviceId: current.serviceId, ownerUserId: current.userId, name: text(body.name, "name", 200), now });
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
          const object = options.storage.createObject({ id: randomUUID10(), serviceId: current.serviceId, spaceId: current.personalSpaceId, scope, projectId, ownerUserId: current.userId, objectType: body.object_type === void 0 ? "note" : text(body.object_type, "object_type", 80), title, body: content, now });
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
        const grant = options.storage.grantObject(current, { id: randomUUID10(), objectId: text(body.object_id, "object_id", 80), serviceId: current.serviceId, subjectType: body.subject_type, subjectId: text(body.subject_id, "subject_id", 80), action: action(body.action), validFrom: body.valid_from === void 0 ? now : text(body.valid_from, "valid_from", 40), expiresAt: body.expires_at === void 0 ? void 0 : text(body.expires_at, "expires_at", 40), now });
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
      if (error instanceof JobError) {
        json(res, error.status, { code: error.code, request_id: requestId });
        return;
      }
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
import { randomUUID as randomUUID11 } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

// src/host/ai-tools.ts
import { createHash as createHash7 } from "node:crypto";
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
function aiText(value, max2, empty = false) {
  if (typeof value !== "string" || !empty && value.length === 0 || value.length > max2 || !value.isWellFormed()) throw new AiError(422, "INPUT_INVALID");
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
  return createHash7("sha256").update(JSON.stringify([name2, input.object_id, input.expected_revision ?? null, input.title ?? null, input.body ?? null])).digest("hex");
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
    for (const [value, min, max2, integer] of [[config.maxCalls ?? 1, 1, Number.MAX_SAFE_INTEGER, true], [config.timeoutMs ?? 3e4, 100, 6e4, true], [config.budgetUsd ?? 0, 0, Number.MAX_VALUE, false]]) {
      if (!Number.isFinite(value) || value < min || value > max2 || integer && !Number.isSafeInteger(value)) throw new AiError(503, "AI_CONFIG_INVALID");
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
  #estimatedUsd = 0;
  #unknownCostCalls = 0;
  #inputTokens = 0;
  #outputTokens = 0;
  get routeAllowed() {
    return Boolean(this.config.provider && /^(?:deepseek[-/]|deepseek$)/i.test(this.config.model ?? ""));
  }
  #closed = false;
  #dispose = [];
  status() {
    return { provider: this.config.provider ?? null, model: this.config.model ?? null, configured: Boolean(this.routeAllowed && this.llm && this.tools), attempts: this.#calls, timeout_ms: this.config.timeoutMs ?? 3e4, budget_usd: this.config.budgetUsd ?? null, known_estimated_usd: this.#estimatedUsd, unknown_cost_calls: this.#unknownCostCalls, reported_input_tokens: this.#inputTokens, reported_output_tokens: this.#outputTokens, budget_warning: this.config.budgetUsd !== void 0 && this.#estimatedUsd > this.config.budgetUsd || this.config.maxCalls !== void 0 && this.#calls > this.config.maxCalls, state: this.#closed ? "stopped" : "ready" };
  }
  #sweep() {
    for (const [id, item] of this.#prepared) if (Date.now() >= item.expiresAt && item.state !== "executing") this.#prepared.delete(id);
  }
  async prepare(actor2, raw, signal) {
    onlyKeys(raw, ["request_id", "instruction", "object_id", "expected_revision", "idempotency_key"]);
    const instruction = aiText(raw.instruction, 2e3), objectId = aiText(raw.object_id, 80), requestId = aiText(raw.request_id, 80), key = aiText(raw.idempotency_key, 128);
    if (!Number.isSafeInteger(raw.expected_revision) || Number(raw.expected_revision) < 1) throw new AiError(422, "INPUT_INVALID");
    if (this.#closed || !this.llm || !this.tools || !this.routeAllowed || !this.config.provider || !this.config.model) throw new AiError(503, "MODEL_NOT_CONFIGURED");
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
    let attempted = false;
    try {
      const available = this.llm.listProviders().some((p) => p.id === this.config.provider);
      if (!available) throw new AiError(503, "MODEL_NOT_CONFIGURED");
      const catalog = await this.#abortable(this.llm.listModels(this.config.provider), controller.signal);
      if (catalog.length > 0 && !catalog.some((m) => m.id === this.config.model)) throw new AiError(404, "MODEL_NOT_FOUND");
      const userText = JSON.stringify({ instruction, target_object_id: objectId, expected_revision: raw.expected_revision });
      this.#calls++;
      attempted = true;
      const calls = [];
      let finish, outputBytes = 0;
      const stream = this.llm.stream({ provider: this.config.provider, model: this.config.model, system: SYSTEM, messages: [{ role: "user", content: [{ type: "text", text: userText }] }], tools: TOOL_SCHEMAS, signal: controller.signal })[Symbol.asyncIterator]();
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
      const prepared = { id: randomUUID11(), requestId, actor: actor2, key, call, expiresAt: Date.now() + 12e4, state: "prepared" };
      this.#prepared.set(prepared.id, prepared);
      return { ...this.#view(prepared), usage: usage ?? null };
    } catch (error) {
      throw controller.signal.aborted ? controller.signal.reason : modelFailure(error);
    } finally {
      if (attempted) {
        const counts = usage;
        const input = counts?.inputTokens, output = counts?.outputTokens;
        const valid2 = (x) => x !== void 0 && Number.isFinite(x) && x >= 0;
        if (valid2(input)) this.#inputTokens += input;
        if (valid2(output)) this.#outputTokens += output;
        if (valid2(input) && valid2(output) && valid2(this.config.inputUsdPerMillion) && valid2(this.config.outputUsdPerMillion)) this.#estimatedUsd += (input * this.config.inputUsdPerMillion + output * this.config.outputUsdPerMillion) / 1e6;
        else this.#unknownCostCalls++;
      }
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      this.#pending.delete(requestId);
    }
  }
  async #abortable(pending, signal) {
    if (signal.aborted) throw signal.reason;
    return await new Promise((resolve2, reject2) => {
      const abort = () => reject2(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      pending.then(resolve2, reject2).finally(() => signal.removeEventListener("abort", abort));
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
import { randomUUID as randomUUID12 } from "node:crypto";
function createAiHandler(options) {
  return async (req, res) => {
    const requestId = randomUUID12(), controller = new AbortController();
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
</main><script>(()=>{const $=id=>document.getElementById(id);let prepared=null,requestId=null,busy=false,generation=0,userId=null,authenticated=false,configured=false;const state=t=>{$('status').textContent=t};const call=async(path,options={})=>{const r=await fetch(path,{...options,headers:{'content-type':'application/json','x-knowledgeos-request':'1'}});const j=await r.json();if(!r.ok){const e=new Error(j.code||('HTTP_'+r.status));e.status=r.status;throw e}return j.data};const post=(path,b)=>call(path,{method:'POST',body:JSON.stringify(b)});const clear=()=>{requestId=null;prepared=null;$('cancel').disabled=true;$('execute').disabled=true;$('object').textContent='';$('tool').textContent='';$('result').textContent='';$('objects').replaceChildren();$('target').value=''};const fail=e=>{state('\u5931\u8D25 \xB7 '+e.message);if(e.status===401){authenticated=false;generation++;clear();$('prepare').disabled=true;$('who').textContent='\u4E1A\u52A1\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55'}};const accept=async gen=>{if(gen!==generation)return false;try{const me=await call('/knowledge/v1/me');if(gen!==generation)return false;if(me.id!==userId){await load();return false}return true}catch(e){if(gen===generation)fail(e);return false}};const read=async()=>{const gen=generation,id=$('target').value;try{const object=await call('/knowledge/v1/objects/'+encodeURIComponent(id));if(!await accept(gen))return;$('object').textContent=JSON.stringify(object,null,2);$('revision').value=object.revision;const op=Array.from($('objects').options).find(o=>o.value===object.id);if(op){op.dataset.revision=String(object.revision);op.textContent=object.title+' \xB7 revision '+object.revision}state('\u91CD\u65B0\u8BFB\u53D6\u5B8C\u6210 \xB7 revision '+object.revision)}catch(e){if(gen===generation)fail(e)}};const list=async(previous)=>{const gen=generation;const objects=await call('/knowledge/v1/objects');if(!await accept(gen))return;$('objects').replaceChildren();for(const o of objects){const op=document.createElement('option');op.value=o.id;op.dataset.revision=String(o.revision);op.textContent=o.title+' \xB7 revision '+o.revision;$('objects').append(op)}const selected=objects.find(o=>o.id===previous)||objects[0];$('objects').value=selected?.id||'';$('target').value=selected?.id||'';$('revision').value=selected?.revision||1};const invalidateTarget=()=>{const oldRequest=requestId;if(oldRequest)void post('/knowledge/v1/ai/cancel',{request_id:oldRequest}).catch(()=>{});generation++;busy=false;prepared=null;requestId=null;$('execute').disabled=true;$('cancel').disabled=true;$('prepare').disabled=!authenticated||!configured;$('object').textContent='';$('tool').textContent='';$('result').textContent='';state(configured?'\u76EE\u6807\u6216\u8349\u7A3F\u5DF2\u53D8\u66F4\uFF0C\u8BF7\u91CD\u65B0\u63D0\u4EA4':'BLOCKED \xB7 MODEL_NOT_CONFIGURED')};$('objects').onchange=()=>{invalidateTarget();$('target').value=$('objects').value;$('revision').value=$('objects').selectedOptions[0]?.dataset.revision||'1'};for(const id of ['target','revision','key','instruction'])$(id).addEventListener('input',invalidateTarget);$('read').onclick=read;$('refresh').onclick=()=>{const previous=$('target').value;invalidateTarget();const gen=generation;list(previous).catch(e=>{if(gen===generation)fail(e)})};$('key').value=crypto.randomUUID();$('prepare').onclick=async()=>{if(busy||!authenticated||!configured)return;busy=true;const gen=generation;prepared=null;requestId=crypto.randomUUID();$('prepare').disabled=true;$('execute').disabled=true;$('cancel').disabled=false;$('tool').textContent='';$('result').textContent='';state('\u6A21\u578B\u8BF7\u6C42\u4E2D');try{const p=await post('/knowledge/v1/ai/prepare',{request_id:requestId,instruction:$('instruction').value,object_id:$('target').value,expected_revision:Number($('revision').value),idempotency_key:$('key').value});if(!await accept(gen))return;prepared=p;$('tool').textContent='\u6240\u7528\u5DE5\u5177\uFF1A'+p.tool+'\\n'+JSON.stringify(p.arguments,null,2);$('execute').disabled=false;state('\u5DF2\u51C6\u5907 \xB7 '+p.provider+' / '+p.model)}catch(e){if(gen===generation)fail(e)}finally{if(gen===generation){busy=false;$('prepare').disabled=!authenticated||!configured;$('cancel').disabled=prepared===null}}};$('execute').onclick=async()=>{if(!prepared||busy)return;const gen=generation;busy=true;$('execute').disabled=true;state('\u6B63\u5728\u91CD\u65B0\u5224\u6743\u5E76\u6267\u884C');try{const d=await post('/knowledge/v1/ai/execute',{prepared_id:prepared.prepared_id});if(!await accept(gen))return;$('result').textContent=JSON.stringify(d.result,null,2);state('\u6267\u884C\u6210\u529F \xB7 '+d.result.code+' \xB7 revision '+d.result.object.revision)}catch(e){if(gen===generation)fail(e)}finally{if(gen===generation){busy=false;$('cancel').disabled=true}}};$('cancel').onclick=async()=>{if(!requestId)return;const id=requestId,gen=++generation;prepared=null;$('execute').disabled=true;$('cancel').disabled=true;try{await post('/knowledge/v1/ai/cancel',{request_id:id});if(gen===generation)state('\u5DF2\u53D6\u6D88')}catch(e){if(gen===generation)fail(e)}finally{if(gen===generation){busy=false;$('prepare').disabled=!authenticated||!configured}}};const load=async()=>{const gen=++generation;busy=false;authenticated=false;clear();$('prepare').disabled=true;try{const me=await call('/knowledge/v1/me');const m=await call('/knowledge/v1/ai/status');if(gen!==generation)return;userId=me.id;authenticated=true;configured=m.configured;$('who').textContent='\u5DF2\u767B\u5F55 \xB7 '+me.display_name+'\uFF08'+me.login_name+'\uFF09';$('model').textContent='\u6A21\u578B\uFF1A'+(m.provider||'\u672A\u914D\u7F6E')+' / '+(m.model||'\u672A\u914D\u7F6E');$('budget').textContent='\u5DF2\u5C1D\u8BD5 '+m.attempts+' \u6B21 \xB7 \u5DF2\u62A5\u544A\u7528\u91CF '+m.reported_input_tokens+' / '+m.reported_output_tokens+' tokens \xB7 \u8D39\u7528\u672A\u77E5 '+m.unknown_cost_calls+' \u6B21'+(m.budget_warning?' \xB7 \u5DF2\u8D85\u8FC7\u63D0\u9192\u9608\u503C':'');await list();if(gen!==generation)return;$('prepare').disabled=!m.configured;state(m.configured?'\u5C31\u7EEA':'BLOCKED \xB7 MODEL_NOT_CONFIGURED')}catch(e){if(gen===generation)fail(e)}};document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void load()});void load()})()</script></body></html>`;
}

// src/host/index.ts
import { join as join3 } from "node:path";

// src/host/pdf-originals.ts
import { createHash as createHash8, randomUUID as randomUUID13 } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import { dirname, join as join2, resolve } from "node:path";

// src/host/word-original.ts
import { crc32, createInflateRaw } from "node:zlib";
var WordInputError = class extends Error {
  constructor() {
    super("INVALID_WORD");
  }
};
var invalid = () => {
  throw new WordInputError();
};
var isWordMedia = (media) => media === WORD_MEDIA.docx || media === WORD_MEDIA.doc;
function checkWordEnvelope(b, media) {
  if (media === WORD_MEDIA.doc) {
    if (b.length < 512 || b.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1" || b.readUInt16LE(28) !== 65534 || ![9, 12].includes(b.readUInt16LE(30))) invalid();
    return [];
  }
  if (b.length < 22 || b.readUInt32LE(0) !== 67324752) invalid();
  let e = b.length - 22;
  const floor = Math.max(0, e - 65535);
  while (e >= floor && (b.readUInt32LE(e) !== 101010256 || e + 22 + b.readUInt16LE(e + 20) !== b.length)) e--;
  if (e < floor || b.readUInt32LE(e + 4) !== 0) invalid();
  const entries = b.readUInt16LE(e + 10), length = b.readUInt32LE(e + 12);
  let pos = b.readUInt32LE(e + 16), expanded = 0;
  if (!entries || entries > 8192 || entries !== b.readUInt16LE(e + 8) || pos + length !== e) invalid();
  const central = pos, names = /* @__PURE__ */ new Set(), members = [];
  for (let i = 0; i < entries; i++) {
    if (pos + 46 > e || b.readUInt32LE(pos) !== 33639248) invalid();
    const n = b.readUInt16LE(pos + 28), next = pos + 46 + n + b.readUInt16LE(pos + 30) + b.readUInt16LE(pos + 32), local = b.readUInt32LE(pos + 42);
    if (!n || next > e || local + 30 > central || b.readUInt32LE(local) !== 67324752 || b.readUInt16LE(pos + 34) !== 0) invalid();
    const name2 = b.subarray(pos + 46, pos + 46 + n), key = name2.toString("utf8"), start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    if (b.readUInt16LE(local + 26) !== n || !name2.equals(b.subarray(local + 30, local + 30 + n)) || names.has(key) || start + b.readUInt32LE(pos + 20) > central) invalid();
    if (b.readUInt16LE(pos + 8) & 1 || b.readUInt16LE(local + 6) & 1 || ![0, 8].includes(b.readUInt16LE(pos + 10)) || b.readUInt16LE(local + 8) !== b.readUInt16LE(pos + 10)) invalid();
    expanded += b.readUInt32LE(pos + 24);
    if (expanded > 256 * 1024 * 1024) invalid();
    members.push({ start, packed: b.readUInt32LE(pos + 20), size: b.readUInt32LE(pos + 24), method: b.readUInt16LE(pos + 10), crc: b.readUInt32LE(pos + 16) });
    names.add(key);
    pos = next;
  }
  if (pos !== e || !["[Content_Types].xml", "_rels/.rels", "word/document.xml"].every((k) => names.has(k))) invalid();
  return members;
}
async function verifyWordBytes(b, media) {
  const members = checkWordEnvelope(b, media);
  let remaining = 256 * 1024 * 1024;
  for (const m of members) {
    const packed = b.subarray(m.start, m.start + m.packed);
    if (!m.method) {
      if (m.packed !== m.size || m.size > remaining || crc32(packed) !== m.crc) invalid();
      remaining -= m.size;
      continue;
    }
    const decoder = createInflateRaw({ chunkSize: 32768 });
    let actual = 0, crc = 0;
    try {
      decoder.end(packed);
      for await (const chunk of decoder) {
        actual += chunk.length;
        remaining -= chunk.length;
        if (actual > m.size || remaining < 0) invalid();
        crc = crc32(chunk, crc);
      }
      if (actual !== m.size || crc !== m.crc || decoder.bytesWritten !== m.packed) invalid();
    } catch {
      invalid();
    } finally {
      decoder.destroy();
    }
  }
}

// src/host/pdf-originals.ts
var MAX = 64 * 1024 * 1024;
var KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:pdf|txt|docx?|zip)$/;
var digest = (b) => createHash8("sha256").update(b).digest("hex");
var PdfInputError = class extends Error {
  code = "PDF_INVALID_INPUT";
  constructor() {
    super("Invalid PDF envelope");
    this.name = "PdfInputError";
    this.stack = `${this.name}: ${this.message}`;
  }
};
var PdfStorageError = class extends Error {
  code = "PDF_ORIGINAL_UNAVAILABLE";
  constructor() {
    super("PDF original unavailable");
    this.name = "PdfStorageError";
    this.stack = `${this.name}: ${this.message}`;
  }
};
var invalid2 = () => new PdfInputError();
var unavailable = () => new PdfStorageError();
function xrefStream(head) {
  const obj = /^[1-9]\d*[ \t\r\n]+\d+[ \t\r\n]+obj[ \t\r\n]*<</.exec(head);
  if (!obj) return false;
  const token = /[\x00\t\n\f\r ]+|%[^\r\n]*|<<|>>|\[|\]|\(|<[\da-fA-F\x00\t\n\f\r ]*>|\/?[^\x00\t\n\f\r ()<>\[\]\/%]+/y;
  token.lastIndex = obj[0].length;
  const ends = [">>"];
  let type = false, found = false;
  for (let m; m = token.exec(head); ) {
    const s = m[0];
    if (/^[%\x00\t\n\f\r ]/.test(s)) continue;
    if (ends.length === 1 && type && s === "/XRef") found = true;
    type = ends.length === 1 && s === "/Type";
    if (s === "<<" || s === "[") ends.push(s === "<<" ? ">>" : "]");
    else if (s === ">>" || s === "]") {
      if (ends.pop() !== s) return false;
      if (!ends.length) return found && /^[ \t\r\n]*stream(?:\r\n|\n)/.test(head.slice(token.lastIndex));
    } else if (s === "(") {
      let depth = 1, pos = token.lastIndex;
      while (depth && pos < head.length) {
        const ch = head[pos++];
        if (ch === "\\") pos++;
        else if (ch === "(") depth++;
        else if (ch === ")") depth--;
      }
      token.lastIndex = pos;
    }
  }
  return false;
}
function checkEnvelope(b) {
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(b.toString("latin1", 0, 10))) throw invalid2();
  const tail = Math.max(0, b.length - 4096);
  const footer = /[\r\n]startxref[ \t]*[\r\n]+[ \t]*(\d{1,16})[ \t]*[\r\n]+%%EOF[\x00\t\n\f\r ]*$/.exec(b.toString("latin1", tail));
  if (!footer) throw invalid2();
  const offset = Number(footer[1]), end = tail + footer.index;
  if (offset < 9 || offset >= end || !/[\x00\t\n\f\r ]/.test(String.fromCharCode(b[offset - 1]))) throw invalid2();
  const head = b.toString("latin1", offset, Math.min(end, offset + 16384));
  if (/^xref[ \t\r\n]+\d+[ \t]+[1-9]\d*[ \t]*[\r\n]+\d{10} \d{5} [nf](?=[ \t\r\n])/.test(head)) return;
  if (!xrefStream(head)) throw invalid2();
}
var statOpts = { bigint: true };
var same = (a, b) => a.ino !== 0n && a.ino === b.ino && a.dev === b.dev && a.birthtimeNs === b.birthtimeNs;
var hasCode = (e, code) => e?.code === code;
var noFollow = constants.O_NOFOLLOW ?? 0;
async function syncDirectory(path) {
  if (process.platform === "win32") return;
  const dir = await fs.open(path, constants.O_RDONLY | constants.O_DIRECTORY | noFollow);
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}
async function checkedDirectory(path, create) {
  let stat;
  try {
    stat = await fs.lstat(path, statOpts);
  } catch (e) {
    if (!create || !hasCode(e, "ENOENT") || dirname(path) === path) throw e;
    const parent = dirname(path);
    await checkedDirectory(parent, true);
    try {
      await fs.mkdir(path, { mode: 448 });
    } catch (e2) {
      if (!hasCode(e2, "EEXIST")) throw e2;
    }
    await syncDirectory(parent);
    stat = await fs.lstat(path, statOpts);
  }
  if (!stat.isDirectory() || stat.ino === 0n || await fs.realpath(path) !== path) throw unavailable();
  return stat;
}
var PdfOriginals = class {
  #root;
  #rootId;
  #pending = /* @__PURE__ */ new Map();
  constructor(rootDir) {
    if (typeof rootDir !== "string" || !rootDir) throw unavailable();
    this.#root = resolve(rootDir);
    if (process.platform === "win32" && !/^[A-Za-z]:\\/.test(this.#root)) throw unavailable();
  }
  async #directory(create = false) {
    const stat = await checkedDirectory(this.#root, create && !this.#rootId);
    if (this.#rootId && !same(this.#rootId, stat)) throw unavailable();
    this.#rootId = stat;
  }
  async #file(path) {
    const stat = await fs.lstat(path, statOpts);
    if (!stat.isFile() || stat.ino === 0n || await fs.realpath(path) !== path) throw unavailable();
    return stat;
  }
  async #unlinkOwned(path, id, stillOwned = () => true) {
    await this.#directory();
    const stat = await this.#file(path);
    if (!same(id, stat)) throw unavailable();
    if (stillOwned()) await fs.unlink(path);
  }
  async put(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX) throw invalid2();
    const data = Buffer.from(bytes);
    checkEnvelope(data);
    try {
      return await this.#write(data, "pdf");
    } catch {
      throw unavailable();
    }
  }
  async putText(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX) throw unavailable();
    try {
      return await this.#write(Buffer.from(bytes), "txt");
    } catch {
      throw unavailable();
    }
  }
  async putWord(bytes, media) {
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX) throw unavailable();
    const data = Buffer.from(bytes);
    await verifyWordBytes(data, media);
    try {
      return await this.#write(data, media === WORD_MEDIA.doc ? "doc" : "docx");
    } catch {
      throw unavailable();
    }
  }
  async putArchive(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX) throw unavailable();
    try {
      return await this.#write(Buffer.from(bytes), "zip");
    } catch {
      throw unavailable();
    }
  }
  async #write(data, extension) {
    const sha256 = digest(data);
    await this.#directory(true);
    const stage = join2(this.#root, `.${randomUUID13()}.pending`);
    const key = `${randomUUID13()}.${extension}`, final = join2(this.#root, key);
    const file = await fs.open(stage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 384);
    let id, staged = true, linked = false;
    try {
      try {
        id = await file.stat(statOpts);
        await file.writeFile(data);
        if ((await file.stat(statOpts)).size !== BigInt(data.length)) throw unavailable();
        await file.sync();
        await this.#directory();
        if (!same(id, await this.#file(stage))) throw unavailable();
        await fs.link(stage, final);
        linked = true;
        await this.#unlinkOwned(stage, id);
        staged = false;
        await file.sync();
        const published = await this.#file(final);
        if (!same(id, published) || published.nlink !== 1n || published.size !== BigInt(data.length)) throw unavailable();
      } finally {
        await file.close();
      }
      await syncDirectory(this.#root);
      this.#pending.set(key, { id, discarding: false });
      return { key, sha256, byteLength: data.length };
    } catch (failure) {
      if (id && linked) await this.#unlinkOwned(final, id);
      if (id && staged) await this.#unlinkOwned(stage, id);
      throw failure;
    }
  }
  async read(key, expectedSha, expectedSize) {
    try {
      if (typeof key !== "string" || key.length !== (key.endsWith(".docx") ? 41 : 40) || !KEY.test(key) || typeof expectedSha !== "string" || expectedSha.length !== 64 || !/^[0-9a-f]+$/.test(expectedSha) || !Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX) throw unavailable();
      await this.#directory();
      const path = join2(this.#root, key), before = await this.#file(path);
      if (before.nlink !== 1n || before.size !== BigInt(expectedSize)) throw unavailable();
      const file = await fs.open(path, constants.O_RDONLY | noFollow | (constants.O_NONBLOCK ?? 0));
      try {
        const stat = await file.stat(statOpts);
        if (!same(before, stat) || stat.size !== before.size || stat.nlink !== 1n) throw unavailable();
        const data = Buffer.allocUnsafe(expectedSize);
        for (let pos = 0; pos < expectedSize; ) {
          const { bytesRead } = await file.read(data, pos, expectedSize - pos, pos);
          if (!bytesRead) throw unavailable();
          pos += bytesRead;
        }
        await this.#directory();
        const after = await this.#file(path);
        if (!same(stat, after) || after.size !== stat.size || after.nlink !== 1n || digest(data) !== expectedSha) throw unavailable();
        if (key.endsWith(".pdf")) checkEnvelope(data);
        return data;
      } finally {
        await file.close();
      }
    } catch {
      throw unavailable();
    }
  }
  /** Surrender this instance's rollback permission. No I/O and safe to repeat. */
  retain(key) {
    this.#pending.delete(key);
  }
  async discard(key) {
    const entry = this.#pending.get(key);
    if (!entry || entry.discarding) return;
    entry.discarding = true;
    try {
      await this.#unlinkOwned(join2(this.#root, key), entry.id, () => this.#pending.get(key) === entry);
      await syncDirectory(this.#root);
    } catch (e) {
      if (!hasCode(e, "ENOENT")) throw unavailable();
    } finally {
      entry.discarding = false;
    }
    this.#pending.delete(key);
  }
};

// src/host/library-http.ts
import { randomUUID as randomUUID14 } from "node:crypto";

// src/host/text-document.ts
import { createHash as createHash9 } from "node:crypto";
var MAX_BYTES = 8 * 1024 * 1024;
var MAX_BLOCKS = 16384;
var messages = {
  TEXT_INVALID_INPUT: "Expected text bytes and a supported text media type",
  TEXT_TOO_LARGE: "Text exceeds the byte or structural block limit",
  TEXT_UNSUPPORTED_ENCODING: "Unsupported text encoding",
  TEXT_INVALID_ENCODING: "Invalid text bytes or conflicting byte order mark",
  TEXT_BINARY: "Unexpected binary control character in text"
};
var TextInputError = class extends Error {
  code;
  constructor(code) {
    super(messages[code]);
    this.name = "TextInputError";
    this.code = code;
  }
};
function bomEncoding(bytes) {
  const [a, b, c, d] = bytes;
  if (a === 255 && b === 254 && c === 0 && d === 0 || a === 0 && b === 0 && c === 254 && d === 255) throw new TextInputError("TEXT_UNSUPPORTED_ENCODING");
  if (a === 255 && b === 254) return "utf-16le";
  if (a === 254 && b === 255) return "utf-16be";
  if (a === 239 && b === 187 && c === 191) return "utf-8";
}
function selectEncoding(bom, requested) {
  if (requested === void 0) return bom ?? "utf-8";
  if (typeof requested !== "string" || requested.length > 64) throw new TextInputError("TEXT_UNSUPPORTED_ENCODING");
  const label = requested.trim().toLowerCase();
  const enc = label === "utf8" ? "utf-8" : label;
  if (enc !== "utf-8" && enc !== "utf-16le" && enc !== "utf-16be" && enc !== "gb18030")
    throw new TextInputError("TEXT_UNSUPPORTED_ENCODING");
  if (bom && bom !== enc) throw new TextInputError("TEXT_INVALID_ENCODING");
  return enc;
}
function indexBlocks(source, markdown) {
  const blocks = [];
  let start = 0, pending, fence = "";
  function flush(end) {
    if (!pending) return;
    if (blocks.length >= MAX_BLOCKS) throw new TextInputError("TEXT_TOO_LARGE");
    const text2 = source.slice(start, end);
    const anchor = createHash9("sha256").update(text2, "utf8").digest("hex");
    blocks.push({ kind: pending, start, end, text: text2, anchor });
    start = end;
    pending = void 0;
  }
  for (let pos = 0; pos < source.length; ) {
    let eol = pos;
    while (eol < source.length && source.charCodeAt(eol) !== 10 && source.charCodeAt(eol) !== 13) eol++;
    let end = eol;
    if (source[end] === "\r") end++;
    if (source[end] === "\n") end++;
    const line = source.slice(pos, eol);
    const marker = markdown ? /^ {0,3}(`{3,}|~{3,})/.exec(line) : null;
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && /^[ \t]*$/.test(line.slice(marker[0].length))) {
        flush(end);
        fence = "";
      }
    } else if (marker && (marker[1][0] === "~" || !line.includes("`", marker[0].length))) {
      flush(pos);
      pending = "code";
      fence = marker[1];
    } else if (markdown && /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) {
      flush(pos);
      pending = "heading";
      flush(end);
    } else if (markdown && pending === "paragraph" && /^ {0,3}(?:=+|-+)[ \t]*$/.test(line)) {
      pending = "heading";
      flush(end);
    } else {
      const kind = /^[ \t]*$/.test(line) ? "blank" : "paragraph";
      if (pending !== kind) flush(pos);
      pending = kind;
    }
    pos = end;
  }
  flush(source.length);
  return blocks;
}
function decodeText(bytes, media, requestedEncoding) {
  if (!(bytes instanceof Uint8Array) || media !== "text/plain" && media !== "text/markdown")
    throw new TextInputError("TEXT_INVALID_INPUT");
  if (bytes.byteLength > MAX_BYTES) throw new TextInputError("TEXT_TOO_LARGE");
  const encoding = selectEncoding(bomEncoding(bytes), requestedEncoding);
  let decoder;
  try {
    decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: false });
  } catch {
    throw new TextInputError("TEXT_UNSUPPORTED_ENCODING");
  }
  let text2;
  try {
    text2 = decoder.decode(bytes);
  } catch {
    throw new TextInputError("TEXT_INVALID_ENCODING");
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text2)) throw new TextInputError("TEXT_BINARY");
  return { encoding, blocks: indexBlocks(text2, media === "text/markdown") };
}

// src/host/zip-reader.ts
import { crc32 as crc322, createInflateRaw as createInflateRaw2 } from "node:zlib";
var MiB = 1024 * 1024;
var ZIP_LIMITS = Object.freeze({
  archiveBytes: 64 * MiB,
  memberBytes: 64 * MiB,
  expandedBytes: 128 * MiB,
  entries: 512,
  pathBytes: 1024,
  pathDepth: 16,
  archiveDepth: 0
});
var ZipInputError = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "ZipInputError";
  }
};
function reject(code) {
  throw new ZipInputError(code);
}
function valid(condition) {
  if (!condition) reject("ZIP_MALFORMED");
}
function limit(condition) {
  if (!condition) reject("ZIP_LIMIT_EXCEEDED");
}
function active(signal) {
  if (signal?.aborted) reject("ZIP_CANCELLED");
}
var utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
var mediaTypes = /* @__PURE__ */ new Map([
  ["pdf", "application/pdf"],
  ["doc", WORD_MEDIA.doc],
  ["docx", WORD_MEDIA.docx],
  ["md", "text/markdown"],
  ["markdown", "text/markdown"],
  ["txt", "text/plain"]
]);
var nestedName = /\.(?:zipx?|7z|rar|tar|tgz|gz|bz2|xz|jar|war)$/i;
var forbidden = /[\\/:*?"<>|\p{Cc}\p{Cf}]/u;
var reserved = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|(?:COM|LPT)[1-9])(?: *\.|$)/iu;
function manifestPath(name2, directory, seen) {
  const parts = (directory ? name2.slice(0, -1) : name2).split("/");
  limit(parts.length <= ZIP_LIMITS.pathDepth);
  let key = "", original = "";
  for (const [i, part] of parts.entries()) {
    const normal = part.normalize("NFKC");
    if (!normal || forbidden.test(normal) || /[. ]$/.test(normal) || reserved.test(normal) || /~[0-9]+(?:\.|$)/i.test(normal)) reject("ZIP_UNSAFE_PATH");
    limit(Buffer.byteLength(part) <= 255);
    const last = i === parts.length - 1, dir = !last || directory;
    original += "/" + part;
    key += "/" + normal.toUpperCase();
    const old = seen.get(key);
    if (old && (old.original !== original || old.directory !== dir || last && old.explicit)) reject("ZIP_PATH_ALIAS");
    seen.set(key, { original, directory: dir, explicit: last || !!old?.explicit });
  }
  return parts.join("/").normalize("NFC");
}
function checkExtras(b, pos, end) {
  while (pos < end) {
    valid(pos + 4 <= end);
    const tag = b.readUInt16LE(pos), length = b.readUInt16LE(pos + 2);
    pos += 4;
    valid(pos + length <= end);
    if (![21589, 30837, 10].includes(tag)) reject("ZIP_UNSUPPORTED_FEATURE");
    if (tag === 10 && !(length === 32 && b.readUInt32LE(pos) === 0 && b.readUInt16LE(pos + 4) === 1 && b.readUInt16LE(pos + 6) === 24)) reject("ZIP_UNSUPPORTED_FEATURE");
    pos += length;
  }
}
function findEnd(b) {
  for (let pos = b.length - 22, floor = Math.max(0, pos - 65535); pos >= floor; --pos) {
    if (b.readUInt32LE(pos) === 101010256 && pos + 22 + b.readUInt16LE(pos + 20) === b.length) return pos;
  }
  return reject("ZIP_MALFORMED");
}
function parse(bytes) {
  valid(Buffer.isBuffer(bytes));
  limit(bytes.length <= ZIP_LIMITS.archiveBytes);
  if (bytes.buffer instanceof SharedArrayBuffer) reject("ZIP_UNSUPPORTED_FEATURE");
  const b = bytes, end = findEnd(b), count = b.readUInt16LE(end + 10), central = b.readUInt32LE(end + 16);
  if (b.readUInt32LE(end + 4) !== 0 || count === 65535 || central === 4294967295) reject("ZIP_UNSUPPORTED_FEATURE");
  valid(b.readUInt16LE(end + 8) === count && central + b.readUInt32LE(end + 12) === end);
  limit(count <= ZIP_LIMITS.entries);
  let pos = central, expanded = 0;
  const seen = /* @__PURE__ */ new Map(), records = [];
  for (let ordinal = 0; ordinal < count; ++ordinal) {
    valid(pos + 46 <= end && b.readUInt32LE(pos) === 33639248);
    const flags = b.readUInt16LE(pos + 8), method = b.readUInt16LE(pos + 10), crc = b.readUInt32LE(pos + 16), compressedSize = b.readUInt32LE(pos + 20), size = b.readUInt32LE(pos + 24), n = b.readUInt16LE(pos + 28), x = b.readUInt16LE(pos + 30), extraEnd = pos + 46 + n + x, next = extraEnd + b.readUInt16LE(pos + 32), local = b.readUInt32LE(pos + 42);
    if (flags & ~(2056 | (method === 8 ? 6 : 0)) || method !== 0 && method !== 8 || b.readUInt16LE(pos + 34) !== 0 || [compressedSize, size, local].includes(4294967295)) reject("ZIP_UNSUPPORTED_FEATURE");
    valid(n > 0 && next <= end && local + 30 <= central && b.readUInt32LE(local) === 67324752);
    expanded += size;
    limit(n <= ZIP_LIMITS.pathBytes && size <= ZIP_LIMITS.memberBytes && expanded <= ZIP_LIMITS.expandedBytes);
    const raw = b.subarray(pos + 46, pos + 46 + n);
    if (!(flags & 2048) && raw.some((byte) => byte >= 128)) reject("ZIP_UNSUPPORTED_FEATURE");
    let name2;
    try {
      name2 = utf8.decode(raw);
    } catch {
      return reject("ZIP_MALFORMED");
    }
    const directory = name2.endsWith("/"), attrs = b.readUInt32LE(pos + 38), kind = attrs >>> 16 & 61440;
    if (![0, 3, 10, 19].includes(b[pos + 5])) reject("ZIP_UNSUPPORTED_FEATURE");
    if (attrs & 1096 || kind !== 0 && kind !== (directory ? 16384 : 32768) || (attrs & 16) !== 0 && !directory) reject("ZIP_UNSAFE_TYPE");
    const path = manifestPath(name2, directory, seen);
    if (!directory && nestedName.test(path)) reject("ZIP_NESTED_ARCHIVE");
    valid(!directory || size === 0 && crc === 0);
    valid(method !== 0 || size === compressedSize);
    checkExtras(b, pos + 46 + n, extraEnd);
    const start = local + 30 + n + b.readUInt16LE(local + 28), dataEnd = start + compressedSize;
    valid(dataEnd <= central && b.readUInt16LE(local + 26) === n && raw.equals(b.subarray(local + 30, local + 30 + n)));
    valid(b.readUInt16LE(local + 6) === flags && b.readUInt16LE(local + 8) === method && b.readUInt16LE(local + 4) === b.readUInt16LE(pos + 6));
    checkExtras(b, local + 30 + n, start);
    const descriptor = (flags & 8) !== 0;
    for (const [off, expected] of [[14, crc], [18, compressedSize], [22, size]]) {
      const value = b.readUInt32LE(local + off);
      valid(value === expected || descriptor && value === 0);
    }
    let recordEnd = dataEnd;
    if (descriptor) {
      valid(recordEnd + 12 <= central);
      if (b.readUInt32LE(recordEnd) === 134695760) recordEnd += 4;
      valid(recordEnd + 12 <= central && b.readUInt32LE(recordEnd) === crc && b.readUInt32LE(recordEnd + 4) === compressedSize && b.readUInt32LE(recordEnd + 8) === size);
      recordEnd += 12;
    }
    const ext = /\.([a-z]+)$/i.exec(path)?.[1]?.toLowerCase(), media = !directory && ext && mediaTypes.get(ext) || null;
    records.push({
      entry: { ordinal, name: name2, path, size, compressedSize, media, reason: directory ? "ZIP_DIRECTORY" : media ? null : "ZIP_UNSUPPORTED_MEDIA" },
      local,
      start,
      end: recordEnd,
      method,
      crc
    });
    pos = next;
  }
  valid(pos === end);
  let tail = 0;
  for (const r of [...records].sort((a, b2) => a.local - b2.local)) {
    valid(r.local === tail);
    tail = r.end;
  }
  valid(tail === central);
  return records;
}
function inspectZip(bytes) {
  return parse(bytes).map((r) => r.entry);
}
function selectable(records, ordinal) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= records.length) reject("ZIP_INVALID_SELECTION");
  const r = records[ordinal];
  if (r.entry.reason) reject(r.entry.reason);
  return r;
}
function checkContainer(bytes, media) {
  const sig = bytes.length >= 4 ? bytes.readUInt32LE(0) : 0;
  if ([67324752, 101010256, 134695760].includes(sig)) {
    if (media === WORD_MEDIA.docx) {
      try {
        checkWordEnvelope(bytes, WORD_MEDIA.docx);
        return;
      } catch {
      }
    }
    reject("ZIP_NESTED_ARCHIVE");
  }
  if (bytes.subarray(0, 2).equals(Buffer.from([31, 139])) || bytes.subarray(0, 6).toString("hex") === "377abcaf271c" || bytes.subarray(0, 6).toString("hex") === "fd377a585a00" || bytes.subarray(0, 4).toString("hex") === "52617221") reject("ZIP_NESTED_ARCHIVE");
}
async function decode(packed, r, signal) {
  active(signal);
  const { size, media } = r.entry;
  let output;
  if (r.method === 0) {
    if (crc322(packed) !== r.crc) reject("ZIP_INTEGRITY");
    output = Buffer.from(packed);
  } else {
    output = Buffer.allocUnsafe(size);
    const stream = createInflateRaw2({ chunkSize: 32 * 1024 }), abort = () => {
      stream.destroy();
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      stream.end(packed);
      let written = 0, crc = 0;
      for await (const chunk of stream) {
        active(signal);
        if (chunk.length > size - written) reject("ZIP_INTEGRITY");
        chunk.copy(output, written);
        written += chunk.length;
        crc = crc322(chunk, crc);
      }
      active(signal);
      if (written !== size || stream.bytesWritten !== packed.length || crc !== r.crc) reject("ZIP_INTEGRITY");
    } catch {
      active(signal);
      return reject("ZIP_INTEGRITY");
    } finally {
      signal?.removeEventListener("abort", abort);
      stream.destroy();
    }
  }
  checkContainer(output, media);
  return output;
}
async function readZipMember(bytes, ordinal, signal) {
  active(signal);
  const r = selectable(parse(bytes), ordinal), slice = bytes.subarray(r.start, r.start + r.entry.compressedSize);
  return decode(r.method === 0 ? slice : Buffer.from(slice), r, signal);
}
async function preflightZipSelection(bytes, ordinals, signal) {
  active(signal);
  const records = parse(bytes);
  if (!Array.isArray(ordinals) || !ordinals.length || ordinals.length > records.length || new Set(ordinals).size !== ordinals.length) reject("ZIP_INVALID_SELECTION");
  const selected = Array.from(ordinals, (i) => selectable(records, i)), snapshot = Buffer.from(bytes);
  for (const r of selected) await decode(snapshot.subarray(r.start, r.start + r.entry.compressedSize), r, signal);
}

// src/host/library-http.ts
var uuid2 = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
var max = 64 * 1024 * 1024;
async function processInput(req) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
  let count = 0;
  const parts = [];
  for await (const chunk of req) {
    const b = Buffer.from(chunk);
    count += b.length;
    if (count > 1024) throw new AssetError(413, "BODY_TOO_LARGE");
    parts.push(b);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new AssetError(422, "INVALID_PROCESS");
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((k) => !["version_id", "page"].includes(k)) || typeof value.version_id !== "string" || !uuid2.test(value.version_id) || "page" in value && (!Number.isSafeInteger(value.page) || value.page < 1 || value.page > 1e4)) throw new AssetError(422, "INVALID_PROCESS");
  return value;
}
async function receive(req, emptyCode, limit2) {
  const declared = req.headers["content-length"];
  if (declared !== void 0 && (!/^\d+$/.test(declared) || Number(declared) > limit2)) throw new AssetError(413, "FILE_TOO_LARGE");
  const chunks = [];
  let count = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    count += b.length;
    if (count > limit2) throw new AssetError(413, "FILE_TOO_LARGE");
    chunks.push(b);
  }
  if (!count) throw new AssetError(422, emptyCode);
  return Buffer.concat(chunks, count);
}
function specFor(req) {
  const key = req.headers["idempotency-key"], name2 = req.headers["x-knowledgeos-filename"], assetId = req.headers["x-knowledgeos-asset-id"], version = req.headers["x-knowledgeos-expected-version"];
  if (typeof key !== "string" || !uuid2.test(key) || typeof name2 !== "string" || name2.length > 2200) throw new AssetError(422, "INVALID_IMPORT");
  let title;
  try {
    title = decodeURIComponent(name2).trim().normalize("NFC");
  } catch {
    throw new AssetError(422, "INVALID_FILENAME");
  }
  if (!title || title.length > 200 || /[\\/\x00-\x1f\x7f]/u.test(title)) throw new AssetError(422, "INVALID_FILENAME");
  if (assetId === void 0 && version === void 0) return { title, key };
  if (typeof assetId !== "string" || !uuid2.test(assetId) || typeof version !== "string" || !/^\d{1,9}$/.test(version) || Number(version) < 1) throw new AssetError(422, "INVALID_VERSION");
  return { title, key, assetId, expectedVersion: Number(version) };
}
function inputError(e) {
  if (e instanceof TextInputError) return new AssetError(e.code === "TEXT_TOO_LARGE" ? 413 : 422, e.code);
  if (e instanceof WordInputError) return new AssetError(422, "INVALID_WORD");
  if (e instanceof PdfInputError) return new AssetError(422, "INVALID_PDF");
  if (e instanceof ZipInputError) return new AssetError(e.code === "ZIP_LIMIT_EXCEEDED" ? 413 : 422, e.code);
}
async function publishInput(store, originals, current, spec, bytes, media, encoding, hook) {
  const word = isWordMedia(media), isText = media === "text/plain" || media === "text/markdown";
  if (!isText && !word && media !== "application/pdf") throw new AssetError(415, "UNSUPPORTED_MEDIA_TYPE");
  const text2 = isText ? { media, ...decodeText(bytes, media, encoding) } : void 0;
  const blob = text2 ? await originals.putText(bytes) : word ? await originals.putWord(bytes, media) : await originals.put(bytes);
  let result;
  try {
    result = store.publish(current(), spec, blob, word ? { media } : text2, hook);
  } catch (e) {
    if (e instanceof AssetError) await originals.discard(blob.key);
    else originals.retain(blob.key);
    throw e;
  }
  if (result.replayed) {
    await originals.discard(blob.key);
    const old = store.original(current(), result.receipt.id, result.receipt.version_id, false);
    await originals.read(old.key, old.sha256, old.byteLength);
  } else originals.retain(blob.key);
  store.original(current(), result.receipt.id, result.receipt.version_id, false);
  return result;
}
function libraryHandler(store, originals, origin, actorFor, parses, office, officeAvailable = () => true, archives) {
  let transfers = 0;
  return async (req, res) => {
    const requestId = randomUUID14();
    let transfer = false, handlerDone = false, responseDone = false;
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    const json2 = (status, payload) => {
      if (!res.destroyed) {
        res.statusCode = status;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify(payload));
      }
    };
    const release = () => {
      if (transfer && handlerDone && responseDone) {
        transfers--;
        transfer = false;
      }
    };
    const reserve = () => {
      if (transfers >= 2) throw new AssetError(429, "TRANSFER_BUSY");
      transfers++;
      transfer = true;
      const sent = () => {
        responseDone = true;
        res.off("finish", sent);
        res.off("close", sent);
        release();
      };
      res.once("finish", sent);
      res.once("close", sent);
      if (res.destroyed || res.writableFinished) sent();
    };
    try {
      const host = origin();
      if (!host || req.headers.host !== new URL(host).host || req.headers["sec-fetch-site"] === "cross-site" || req.headers.origin !== void 0 && req.headers.origin !== host || req.method !== "GET" && req.headers["x-knowledgeos-request"] !== "1") throw new AssetError(403, "CSRF_REJECTED");
      const actor2 = actorFor(req);
      if (!actor2) throw new AssetError(401, "AUTH_REQUIRED");
      const current = () => {
        const a = actorFor(req);
        if (!a || a.sessionId !== actor2.sessionId) throw new AssetError(401, "AUTH_REQUIRED");
        return a;
      };
      const url = new URL(req.url ?? "/", host);
      if (url.origin !== host) throw new AssetError(403, "CSRF_REJECTED");
      if (req.method === "GET" && url.pathname === "/knowledge/v1/assets" && !url.search) {
        json2(200, { data: { items: store.list(actor2) }, request_id: requestId });
        return;
      }
      const op = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/office(?:\/(start)|\/([a-f0-9-]+)\/(cancel|notes|pdf))?$/.exec(url.pathname);
      if (office && op && uuid2.test(op[1]) && uuid2.test(op[2]) && (!op[4] || uuid2.test(op[4]))) {
        const id = op[1], v = op[2], cid = op[4], command = op[3] ?? op[5], key = req.headers["idempotency-key"];
        const send = (status, data) => json2(status, { data, request_id: requestId });
        if (req.method === "GET" && !command) {
          const keys2 = [...url.searchParams.keys()];
          if (new Set(keys2).size !== keys2.length) throw new AssetError(422, "INVALID_HISTORY_CURSOR");
          send(200, office.list(current(), id, v, Object.fromEntries(url.searchParams)));
          return;
        }
        if (req.method === "POST" && command === "start" && !url.search) {
          const r = office.start(current(), id, v, typeof key === "string" ? key : "", officeAvailable());
          send(r.replayed ? 200 : 202, r);
          return;
        }
        if (req.method === "POST" && command === "cancel" && !url.search) {
          send(200, office.cancel(current(), id, v, cid));
          return;
        }
        if (req.method === "POST" && command === "notes" && !url.search) {
          if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
          const bytes = await receive(req, "INVALID_QUALITY_NOTE", 16384);
          let input;
          try {
            input = JSON.parse(bytes.toString("utf8"));
          } catch {
            throw new AssetError(422, "INVALID_QUALITY_NOTE");
          }
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((k) => !["body", "page"].includes(k))) throw new AssetError(422, "INVALID_QUALITY_NOTE");
          const r = office.note(current(), id, v, cid, typeof key === "string" ? key : "", input.page, input.body);
          send(r.replayed ? 200 : 201, r);
          return;
        }
        if (req.method === "GET" && command === "pdf" && (!url.search || url.search === "?download=1")) {
          reserve();
          const download = !!url.search, result = () => office.result(current(), id, v, cid, download), ref = result();
          const bytes = await originals.read(ref.key, ref.sha256, ref.byteLength);
          result();
          res.setHeader("content-type", "application/pdf");
          res.setHeader("content-length", bytes.length);
          res.setHeader("content-security-policy", "sandbox; default-src 'none'");
          res.setHeader("content-disposition", `${download ? "attachment" : "inline"}; filename="preview.pdf"`);
          res.end(bytes);
          return;
        }
      }
      if (archives && !url.search) {
        const archive = /^\/knowledge\/v1\/imports\/([a-f0-9-]+)\/(entries|selection)$/.exec(url.pathname);
        if (req.method === "GET" && url.pathname === "/knowledge/v1/imports") {
          json2(200, { data: { items: archives.list(current()) }, request_id: requestId });
          return;
        }
        if (archive && uuid2.test(archive[1])) {
          const id = archive[1];
          if (req.method === "GET" && archive[2] === "entries") {
            json2(200, { data: archives.manifest(current(), id), request_id: requestId });
            return;
          }
          if (req.method === "POST" && archive[2] === "selection") {
            const key = req.headers["idempotency-key"];
            if (typeof key !== "string" || !uuid2.test(key)) throw new AssetError(422, "INVALID_SELECTION");
            if (req.headers["content-type"]?.split(";")[0] !== "application/json") throw new AssetError(415, "JSON_REQUIRED");
            reserve();
            const body = await receive(req, "INVALID_SELECTION", 24 * 1024);
            let input;
            try {
              input = JSON.parse(body.toString("utf8"));
            } catch {
              throw new AssetError(422, "INVALID_SELECTION");
            }
            if (!input || typeof input !== "object" || Object.keys(input).length !== 1 || !Array.isArray(input.entry_ids)) throw new AssetError(422, "INVALID_SELECTION");
            const ref = archives.source(current(), id), items = archives.select(current(), id, key, input.entry_ids), pending = items.filter((e) => !e.imported);
            if (pending.length) {
              const bytes = await originals.read(ref.key, ref.sha256, ref.byteLength);
              try {
                await preflightZipSelection(bytes, pending.map((e) => e.ordinal));
              } catch (e) {
                if (e instanceof ZipInputError) for (const m of pending) archives.failure(current(), id, m.id, e.code);
                throw e;
              }
              for (const m of pending) {
                current();
                const content = await readZipMember(bytes, m.ordinal), title = m.path.split("/").at(-1);
                if (title.length > 200) {
                  archives.failure(current(), id, m.id, "INVALID_FILENAME");
                  continue;
                }
                try {
                  await publishInput(store, originals, current, { title, key: m.key }, content, m.media, void 0, archives.publication(id, m.id, m.key));
                } catch (e) {
                  const invalid3 = inputError(e);
                  if (!invalid3) throw e;
                  archives.failure(current(), id, m.id, invalid3.code);
                }
              }
            }
            json2(200, { data: archives.manifest(current(), id), request_id: requestId });
            return;
          }
        }
      }
      if (req.method === "POST" && url.pathname === "/knowledge/v1/imports" && !url.search) {
        const media = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
        if (media === "application/zip" && archives) {
          const spec2 = specFor(req);
          if (spec2.assetId || req.headers["x-knowledgeos-encoding"] !== void 0) throw new AssetError(422, "INVALID_IMPORT");
          reserve();
          const bytes2 = await receive(req, "ZIP_MALFORMED", max);
          current();
          const members = inspectZip(bytes2), blob = await originals.putArchive(bytes2);
          let staged;
          try {
            staged = archives.stage(current(), spec2, blob, members);
          } catch (e) {
            if (e instanceof AssetError) await originals.discard(blob.key);
            else originals.retain(blob.key);
            throw e;
          }
          if (staged.replayed) {
            await originals.discard(blob.key);
            const ref = archives.source(current(), staged.id);
            await originals.read(ref.key, ref.sha256, ref.byteLength);
          } else originals.retain(blob.key);
          json2(staged.replayed ? 200 : 201, { data: archives.manifest(current(), staged.id), request_id: requestId });
          return;
        }
        const word = isWordMedia(media), isText = media === "text/plain" || media === "text/markdown";
        if (media !== "application/pdf" && !isText && !word) throw new AssetError(415, "UNSUPPORTED_MEDIA_TYPE");
        const encoding = req.headers["x-knowledgeos-encoding"];
        if (encoding !== void 0 && (typeof encoding !== "string" || !isText)) throw new AssetError(422, "TEXT_UNSUPPORTED_ENCODING");
        const spec = specFor(req);
        reserve();
        const bytes = await receive(req, isText ? "TEXT_INVALID_INPUT" : word ? "INVALID_WORD" : "INVALID_PDF", isText ? MAX_BYTES : max);
        current();
        const result = await publishInput(store, originals, current, spec, bytes, media, encoding);
        json2(result.replayed ? 200 : 201, { data: result.receipt, request_id: requestId });
        return;
      }
      const parse3 = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/parse(?:\/(start|cancel|retry\/([1-9]\d{0,4})))?$/.exec(url.pathname);
      const processPath = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/process$/.exec(url.pathname);
      const pagesPath = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/pages$/.exec(url.pathname);
      const operation = /^\/knowledge\/v1\/operations\/([a-f0-9-]+)$/.exec(url.pathname);
      const blockPath = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/blocks$/.exec(url.pathname);
      if (blockPath && req.method === "GET" && uuid2.test(blockPath[1]) && uuid2.test(blockPath[2])) {
        const keys2 = [...url.searchParams.keys()];
        if (keys2.some((k) => !["from", "limit"].includes(k)) || new Set(keys2).size !== keys2.length) throw new AssetError(422, "INVALID_BLOCK_RANGE");
        json2(200, { data: store.blocks(current(), blockPath[1], blockPath[2], Number(url.searchParams.get("from") ?? 1), Number(url.searchParams.get("limit") ?? 5)), request_id: requestId });
        return;
      }
      const respond = (v, data, asyncRequest) => {
        const active3 = ["queued", "running"].includes(String(data.state)), location = "/knowledge/v1/operations/" + v;
        if (asyncRequest && active3) res.setHeader("location", location);
        json2(asyncRequest && active3 ? 202 : 200, { data: { ...data, operation_id: v, status_url: location, cancellable: active3 }, request_id: requestId });
      };
      if (operation && parses && req.method === "GET" && !url.search && uuid2.test(operation[1])) {
        respond(operation[1], parses.operation(current(), operation[1]), false);
        return;
      }
      if (processPath && parses && req.method === "POST" && !url.search && uuid2.test(processPath[1])) {
        const { version_id: v, page } = await processInput(req);
        respond(v, parses.control(current(), processPath[1], v, page ? "retry" : "start", page), true);
        return;
      }
      if (pagesPath && parses && req.method === "GET" && uuid2.test(pagesPath[1]) && uuid2.test(pagesPath[2])) {
        const keys2 = [...url.searchParams.keys()];
        if (keys2.some((k) => !["from", "limit"].includes(k)) || new Set(keys2).size !== keys2.length) throw new AssetError(422, "INVALID_PAGE_RANGE");
        const from = Number(url.searchParams.get("from") ?? 1), limit2 = Number(url.searchParams.get("limit") ?? 5);
        json2(200, { data: parses.pages(current(), pagesPath[1], pagesPath[2], from, limit2), request_id: requestId });
        return;
      }
      if (parse3 && parses && !url.search && uuid2.test(parse3[1]) && uuid2.test(parse3[2]) && req.method === (parse3[3] ? "POST" : "GET")) {
        const op2 = parse3[4] ? "retry" : parse3[3] === "start" ? "start" : parse3[3] === "cancel" ? "cancel" : "status";
        respond(parse3[2], parses.control(current(), parse3[1], parse3[2], op2, parse3[4] ? Number(parse3[4]) : void 0), op2 === "start" || op2 === "retry");
        return;
      }
      const path = /^\/knowledge\/v1\/assets\/([a-f0-9-]+)\/versions\/([a-f0-9-]+)\/original$/.exec(url.pathname);
      if (req.method === "GET" && path && uuid2.test(path[1]) && uuid2.test(path[2]) && (!url.search || url.search === "?download=1")) {
        reserve();
        const download = Boolean(url.search), original = () => store.original(current(), path[1], path[2], download), r = original();
        const word = isWordMedia(r.media), ext = word ? r.media === WORD_MEDIA.doc ? "doc" : "docx" : r.media === "text/plain" ? "txt" : r.media === "text/markdown" ? "md" : "pdf";
        if (word && !download) throw new AssetError(422, "WORD_DOWNLOAD_REQUIRED");
        const bytes = await originals.read(r.key, r.sha256, r.byteLength);
        original();
        res.statusCode = 200;
        res.setHeader("content-type", word ? r.media : r.media ? `${download ? r.media : "text/plain"}; charset=${r.encoding}` : "application/pdf");
        res.setHeader("content-security-policy", "sandbox; default-src 'none'");
        res.setHeader("content-disposition", `${download ? "attachment" : "inline"}; filename="document.${ext}"`);
        res.setHeader("content-length", bytes.length);
        res.end(bytes);
        return;
      }
      throw new AssetError(404, "NOT_FOUND");
    } catch (e) {
      const error = e instanceof AssetError ? e : inputError(e) ?? new AssetError(503, "ORIGINAL_UNAVAILABLE");
      json2(error.status, { code: error.code, message: error.code, request_id: requestId });
    } finally {
      handlerDone = true;
      release();
    }
  };
}

// src/host/parse-worker.ts
function startParseWorker(store, originals, open, log) {
  let stopped = false, pending;
  async function tick() {
    const job = store.claim();
    if (!job) return;
    let doc, active3 = true;
    const heart = setInterval(() => {
      try {
        if (!store.renew(job.token)) active3 = false;
      } catch {
        active3 = false;
      }
    }, 4e3);
    try {
      const bytes = await originals.read(job.key, job.sha256, job.byteLength);
      if (stopped || !active3 || !store.renew(job.token)) return;
      doc = await open(bytes);
      if (stopped || !active3 || !store.initialize(job.token, doc.numPages)) return;
      let consecutiveFailures = 0;
      while (!stopped && active3) {
        const page = store.next(job.token);
        if (page == null) break;
        if (!doc) {
          if (consecutiveFailures >= 3) {
            store.fail(job.token);
            break;
          }
          doc = await open(bytes);
          if (!store.initialize(job.token, doc.numPages)) break;
        }
        let result;
        try {
          result = await doc.page(page);
          consecutiveFailures = 0;
        } catch {
          result = null;
          consecutiveFailures++;
          await doc.close();
          doc = void 0;
        }
        if (stopped || !active3 || !store.publish(job.token, page, result)) break;
        await new Promise((resolve2) => setImmediate(resolve2));
      }
    } catch {
      if (!stopped && active3) store.fail(job.token);
    } finally {
      clearInterval(heart);
      await doc?.close();
    }
  }
  const timer = setInterval(() => {
    if (!stopped && !pending) pending = tick().catch(() => log("knowledgeos-parse: worker temporarily unavailable")).finally(() => {
      pending = void 0;
    });
  }, 500);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}

// src/host/office-worker.ts
var maxPdf = 64 * 1024 * 1024;
var knownCodes = /* @__PURE__ */ new Set(["input-too-large", "output-too-large", "invalid-document", "unsupported-format", "invalid-output", "timeout", "unavailable", "failed", "busy", "source-changed", "invalid-request"]);
var same2 = (a, b) => a.assetId === b.assetId && a.versionId === b.versionId && a.key === b.key && a.sha256 === b.sha256 && a.byteLength === b.byteLength && a.extension === b.extension;
function startOfficeWorker(store, originals, kit, openPdf2, log) {
  let stopped = false, pending, active3;
  async function tick() {
    const job = store.claim();
    if (!job) return;
    const { token } = job, controller = new AbortController();
    active3 = controller;
    const source = () => {
      controller.signal.throwIfAborted();
      const s = store.source(token);
      if (!s) {
        controller.abort();
        controller.signal.throwIfAborted();
        throw Error("source unavailable");
      }
      return s;
    };
    const heartbeat = setInterval(() => {
      try {
        if (!store.renew(token)) controller.abort();
      } catch {
        controller.abort();
      }
    }, 2e3);
    heartbeat.unref();
    let stage, doc, phase = "SOURCE_UNAVAILABLE";
    try {
      const initial = source(), checked = () => {
        const s = source();
        if (!same2(initial, s)) throw Error("source changed");
        return s;
      };
      phase = "CONVERSION_FAILED";
      const result = await kit.convert({ extension: initial.extension, priority: "background", source: {
        key: `knowledgeos:${initial.assetId}:${initial.versionId}`,
        version: initial.sha256,
        bytes: initial.byteLength,
        read: async (signal, maxBytes) => {
          signal.throwIfAborted();
          const s = checked();
          if (!Number.isSafeInteger(maxBytes) || maxBytes < s.byteLength) throw Error("source exceeds reservation");
          const bytes = await originals.read(s.key, s.sha256, s.byteLength);
          signal.throwIfAborted();
          const after = checked();
          return { bytes, version: after.sha256 };
        }
      } }, controller.signal);
      checked();
      phase = "INVALID_OFFICE_RESULT";
      if (!(result.pdf instanceof Uint8Array) || !result.pdf.byteLength || result.pdf.byteLength > maxPdf || !Array.isArray(result.missingFonts) || result.missingFonts.length > 1024 || result.missingFonts.some((f) => typeof f !== "string" || f.length > 512)) throw Error("invalid result");
      doc = await openPdf2(result.pdf);
      const pages = doc.numPages;
      if (!Number.isSafeInteger(pages) || pages < 1 || pages > 1e4) throw Error("invalid page count");
      for (let n = 1; n <= pages; n++) {
        controller.signal.throwIfAborted();
        await doc.page(n);
      }
      await doc.close();
      doc = void 0;
      checked();
      phase = "RESULT_STORAGE_UNAVAILABLE";
      stage = await originals.put(result.pdf);
      checked();
      let committed;
      try {
        committed = store.complete(token, stage, pages, result.missingFonts);
      } catch (e) {
        if (!(e instanceof AssetError)) {
          originals.retain(stage.key);
          stage = void 0;
        }
        throw e;
      }
      if (committed) {
        originals.retain(stage.key);
        stage = void 0;
      }
    } catch (e) {
      if (!stopped && !controller.signal.aborted) {
        const code = e?.code;
        store.fail(token, typeof code === "string" && knownCodes.has(code) ? code : phase);
      }
    } finally {
      clearInterval(heartbeat);
      active3 = void 0;
      try {
        if (stage) await originals.discard(stage.key);
      } finally {
        await doc?.close();
      }
    }
  }
  const timer = setInterval(() => {
    if (!stopped && !pending) pending = tick().catch(() => log("knowledgeos-office: worker temporarily unavailable")).finally(() => {
      pending = void 0;
    });
  }, 300);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    active3?.abort();
    await pending;
  };
}

// src/host/pdf-extractor.ts
import { readFile } from "node:fs/promises";
import { Worker, parentPort, workerData } from "node:worker_threads";
var MiB2 = 1024 * 1024;
var MAX_BYTES2 = 64 * MiB2;
var MAX_MEMORY = 256 * MiB2;
var MAX_PAGES = 1e4;
var MAX_CHARS = 32e3;
var MAX_BOOKMARKS = 2048;
var MAX_TITLE_BYTES = 512;
var DEADLINE_MS = 15e3;
var MAX_WORKERS = 2;
var role = "knowledgeos:pdf-extractor:v1";
var active2 = 0;
function pdfError(code, message) {
  return Object.assign(new Error(message), { code });
}
async function openPdf(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_BYTES2)
    throw pdfError("PDF_OPEN_FAILED", "Invalid PDF input size or type");
  if (active2 >= MAX_WORKERS) throw pdfError("PDF_BUSY", "PDF extractor busy");
  const copy = new Uint8Array(bytes);
  const worker = new Worker(new URL("./pdf-extractor.js", import.meta.url), {
    workerData: role,
    env: {},
    execArgv: [],
    resourceLimits: { maxOldGenerationSizeMb: 48, maxYoungGenerationSizeMb: 8 }
  });
  active2++;
  let pending;
  let closing;
  const close = () => {
    if (!closing) {
      closing = worker.terminate().then(() => {
      }).finally(() => {
        active2--;
      });
      pending?.({ error: "PDF closed", fatal: true });
    }
    return closing;
  };
  function fail(error) {
    pending?.({ error, fatal: true });
    void close();
  }
  worker.on("message", (msg) => {
    pending?.(msg);
    if ("error" in msg && msg.fatal) void close();
  });
  worker.on("error", () => fail("PDF worker failed"));
  worker.on("exit", () => fail("PDF worker exited"));
  function request(input) {
    if (closing) return Promise.reject(pdfError("PDF_HANDLE_CLOSED", "PDF closed"));
    if (pending) return Promise.reject(pdfError("PDF_BUSY", "PDF extractor busy"));
    return new Promise((resolve2, reject2) => {
      const timer = setTimeout(() => fail("PDF parser deadline exceeded"), DEADLINE_MS);
      pending = (msg) => {
        clearTimeout(timer);
        pending = void 0;
        if ("error" in msg) {
          const code = typeof input !== "number" ? "PDF_OPEN_FAILED" : msg.fatal ? "PDF_HANDLE_CLOSED" : "PDF_PAGE_FAILED";
          reject2(pdfError(code, msg.error));
        } else resolve2(msg.value);
      };
      try {
        worker.postMessage(input, typeof input === "number" ? [] : [input.buffer]);
      } catch {
        fail("PDF worker unavailable");
      }
    });
  }
  try {
    const numPages = await request(copy);
    return { numPages, close, async page(n) {
      if (!Number.isInteger(n) || n < 1 || n > numPages) throw new RangeError("Invalid PDF page number");
      return await request(n);
    } };
  } catch (error) {
    await close();
    throw error;
  }
}
async function loadEngine() {
  const binary = await readFile(new URL("./pdfium.wasm", import.meta.url));
  const module = await WebAssembly.compile(binary);
  let api;
  const abort = () => {
    throw new Error("PDF parser stopped");
  };
  const env = {
    _abort_js: abort,
    __assert_fail: abort,
    _emscripten_throw_longjmp: abort,
    emscripten_date_now: () => 0,
    _tzset_js: abort,
    _localtime_js: abort,
    _gmtime_js: abort,
    _emscripten_memcpy_js: (to, from, len) => {
      new Uint8Array(api.memory.buffer).copyWithin(to, from, from + len);
    },
    emscripten_resize_heap: (size) => {
      const old = api.memory.buffer.byteLength;
      if (size >>> 0 > MAX_MEMORY) throw new Error("PDF parser memory limit");
      const target = Math.min(MAX_MEMORY, Math.max(size >>> 0, old + 8 * MiB2));
      api.memory.grow(Math.ceil((target - old) / 65536));
      return 1;
    }
  };
  for (const { name: name2, module: ns } of WebAssembly.Module.imports(module)) {
    if (ns === "env" && /^invoke_[vi]+$/.test(name2))
      env[name2] = (i, ...args) => api.__indirect_function_table.get(i)(...args);
  }
  for (const op of ["openat", "fcntl64", "ioctl", "fstat64", "stat64", "newfstatat", "lstat64", "getdents64", "unlinkat", "rmdir", "ftruncate64"])
    env["__syscall_" + op] = () => -44;
  const wasi = {};
  for (const op of ["fd_close", "fd_write", "fd_read", "fd_sync", "fd_seek", "environ_get", "environ_sizes_get"])
    wasi[op] = () => 76;
  const instance = await WebAssembly.instantiate(module, { env, wasi_snapshot_preview1: wasi });
  api = instance.exports;
  api.emscripten_stack_init();
  api.__wasm_call_ctors();
  api.FPDF_InitLibrary();
  return api;
}
function allocate(api, n) {
  const ptr = api.malloc(n);
  if (!ptr) throw new Error("PDF parser allocation failed");
  return ptr;
}
function chapters(api, doc, pages) {
  const titles = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set();
  const buf = allocate(api, MAX_TITLE_BYTES);
  try {
    for (let bm = api.FPDFBookmark_GetFirstChild(doc, 0); bm; bm = api.FPDFBookmark_GetNextSibling(doc, bm)) {
      if (seen.has(bm) || seen.size >= MAX_BOOKMARKS) return /* @__PURE__ */ new Map();
      seen.add(bm);
      let dest = api.FPDFBookmark_GetDest(doc, bm);
      if (!dest) {
        const action2 = api.FPDFBookmark_GetAction(bm);
        if (action2 && api.FPDFAction_GetType(action2) === 1) dest = api.FPDFAction_GetDest(doc, action2);
      }
      if (!dest) continue;
      const n = api.FPDFDest_GetDestPageIndex(doc, dest) + 1;
      if (n < 1 || n > pages || titles.has(n)) continue;
      const len = api.FPDFBookmark_GetTitle(bm, buf, MAX_TITLE_BYTES);
      if (len < 4 || len > MAX_TITLE_BYTES || len % 2) continue;
      const title = new TextDecoder("utf-16le").decode(new Uint8Array(api.memory.buffer, buf, len - 2)).replace(/[\p{Cc}\p{Cf}]/gu, " ").trim();
      if (title) titles.set(n, title);
    }
    return titles;
  } finally {
    api.free(buf);
  }
}
var PageFailure = class extends Error {
};
async function parse2(bytes) {
  const api = await loadEngine(), ptr = allocate(api, bytes.length);
  new Uint8Array(api.memory.buffer, ptr, bytes.length).set(bytes);
  const doc = api.FPDF_LoadMemDocument(ptr, bytes.length, 0);
  if (!doc) throw new Error("Invalid or password-protected PDF");
  if (api.FPDF_GetSecurityHandlerRevision(doc) >= 0) throw new Error("Encrypted PDF is not supported");
  const numPages = api.FPDF_GetPageCount(doc);
  if (numPages < 1 || numPages > MAX_PAGES) throw new Error("Invalid or excessive PDF page count");
  const titles = chapters(api, doc, numPages);
  const labels = [""];
  for (let i = 1; i <= numPages; i++) labels.push(titles.get(i) ?? labels[i - 1]);
  function page(n) {
    const p = api.FPDF_LoadPage(doc, n - 1);
    if (!p) throw new PageFailure("Failed to load PDF page");
    try {
      const tp = api.FPDFText_LoadPage(p);
      if (!tp) throw new PageFailure("Failed to load PDF page text");
      try {
        const count = api.FPDFText_CountChars(tp);
        if (count < 0 || count > MAX_CHARS) throw new PageFailure("Invalid or excessive PDF page text length");
        const objects = api.FPDFPage_CountObjects(p);
        let text2 = "", needsReview = objects < 0 || objects > 4096;
        for (let i = 0; i < objects && !needsReview; i++) {
          const type = api.FPDFPageObj_GetType(api.FPDFPage_GetObject(p, i));
          needsReview = type === 0 || type === 3 || type === 5;
        }
        for (let i = 0; i < count; i++) {
          const ch = api.FPDFText_GetUnicode(tp, i);
          if (api.FPDFText_HasUnicodeMapError(tp, i) !== 0 || !ch || ch > 1114111) needsReview = true;
          text2 += ch && ch <= 1114111 ? String.fromCodePoint(ch) : "\uFFFD";
        }
        text2 = text2.toWellFormed().replace(/\r\n?/g, "\n").trim();
        needsReview ||= !text2 || /[\ufffd\p{Co}\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text2);
        return { text: text2, needsReview, chapter: labels[n] };
      } finally {
        api.FPDFText_ClosePage(tp);
      }
    } finally {
      api.FPDF_ClosePage(p);
    }
  }
  return { numPages, page };
}
if (parentPort && workerData === role) {
  const port = parentPort;
  let document;
  port.on("message", async (input) => {
    try {
      if (typeof input !== "number") {
        document = await parse2(input);
        port.postMessage({ value: document.numPages });
      } else port.postMessage({ value: document.page(input) });
    } catch (err) {
      const error = err instanceof Error ? err.message : "PDF parser failed";
      port.postMessage({ error, fatal: !(err instanceof PageFailure) });
    }
  });
}

// src/host/library-page.ts
function buildLibraryHtml() {
  return String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PDF 资料库 · KnowledgeOS</title><style>
*{box-sizing:border-box}body{margin:0;color:#223638;background:#f8faf9;font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif}header{background:#fff;border-bottom:1px solid #d2ddda}header>div,main{max-width:900px;margin:auto;padding:0 22px}header>div,nav,.bar,.links{display:flex;align-items:center;gap:18px;flex-wrap:wrap}header>div{justify-content:space-between;min-height:54px;padding-block:8px}header strong{color:#18565a;font-size:19px}a{color:#176166;text-underline-offset:3px}main{padding-block:24px}h1,h2,p,dl{margin:0}h1{font-size:26px}h2{font-size:18px}section{margin-top:20px;border-top:1px solid #cbd9d6;padding-top:16px}.bar{justify-content:space-between;gap:8px}.muted,dt,small{color:#536866}#who{overflow-wrap:anywhere}form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) auto;align-items:end;gap:12px;margin-top:12px}label{display:grid;gap:5px;font-weight:600}input,select,button{font:inherit}input,select{width:100%;min-width:0;color:inherit;background:white;border:1px solid #889f9c;border-radius:5px;padding:7px;height:42px}input::file-selector-button{border:0;border-right:1px solid #ccd8d5;background:white;color:#18565a;margin-right:8px;padding:2px 8px 2px 0}button{border:1px solid #698c88;border-radius:5px;padding:6px 12px;background:white;color:#215c5c;cursor:pointer}button[type=submit]{background:#226461;color:white;height:42px}button:disabled,input:disabled,select:disabled{opacity:.6;cursor:default}:focus-visible{outline:3px solid #176d92;outline-offset:3px}#status{margin-top:12px;border-left:3px solid #9ebcb4;padding-left:9px;color:#354d48}#status[data-error]{border-color:#ae622e;color:#794019}#receipt{border-color:#669d90}.entry{padding:12px 0;overflow-wrap:anywhere}.entry+.entry{border-top:1px solid #dde5e2}.entry strong{display:block}.entry dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:3px 12px;margin:5px 0}.entry dd{margin:0}.hash{font:13px/1.7 Consolas,monospace}.links{gap:15px;margin-top:6px}#list>p{padding-block:12px}[hidden]{display:none!important}@media(max-width:640px){header>div,main{padding-inline:14px}main{padding-top:18px}form{grid-template-columns:minmax(0,1fr)}form button{justify-self:start}nav{gap:12px}}
#parse-picker{margin:8px 0;max-width:36rem}#parse-panel{overflow-wrap:anywhere}#parse-panel .links{gap:8px}#parse-pages{list-style:none;margin:8px 0;padding:0}#parse-pages li{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;border-top:1px solid #dde5e2;padding:6px 0}#parse-pages strong{min-width:5em}#parse-pages small{flex-basis:100%}#parse-note{color:#794019}
#mode-picker,#block-picker{max-width:36rem;margin-top:8px}#encoding-picker{grid-column:1/-1;max-width:24rem}#blocks li{padding-block:6px;border-bottom:1px solid #dde5e2}#blocks pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:3px 0;font:inherit}#reader{overflow-wrap:anywhere}
#office{overflow-wrap:anywhere}#office-version{max-width:36rem}#office-notes li{white-space:pre-wrap}#office-note-form{grid-template-columns:minmax(5rem,7rem) minmax(0,1fr) auto}#office-body{font:inherit;min-width:0;width:100%;resize:vertical;padding:6px;border:1px solid #889f9c;border-radius:5px}@media(max-width:640px){#office-note-form{grid-template-columns:minmax(0,1fr)}}
#zip{overflow-wrap:anywhere}#zip-resume{max-width:36rem}#zip-entries{list-style:none;padding:0}#zip-entries li{border-bottom:1px solid #dde5e2;padding:8px 0}#zip-entries label{display:flex;align-items:center;gap:8px}#zip-entries input{width:18px;height:18px;flex:none}#zip-entries small{display:block}
</style></head><body>
<header><div><strong>KnowledgeOS</strong><nav aria-label="业务导航"><a href="/knowledgeos/account">账号与登录</a><a href="/knowledgeos/ai">AI 工具</a></nav></div></header>
<main><div class="bar"><h1>PDF 资料库</h1><span id="who" class="muted"></span></div>
<section aria-labelledby="import-heading"><h2 id="import-heading">导入原件</h2>
<label id="mode-picker">导入格式<select id="mode" disabled><option value="pdf">PDF</option><option value="text">Markdown / 纯文本</option><option value="word">Word</option><option value="zip">ZIP 压缩包</option></select></label>
<form id="import"><label id="encoding-picker" hidden>文本编码<select id="encoding" disabled><option value="">自动识别</option><option value="utf-8">UTF-8</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option><option value="gb18030">GB18030</option></select></label>
<label>导入到<select id="target" disabled><option value="">新建资料</option></select></label>
<label><span id="file-label">PDF 文件</span><input id="file" type="file" accept=".pdf,application/pdf" disabled></label>
<button id="submit" type="submit" disabled>导入 PDF</button></form>
<p id="status" role="status" aria-live="polite" aria-atomic="true">正在核对登录…</p></section>
<section id="zip" aria-labelledby="zip-heading" hidden><h2 id="zip-heading">压缩包清单</h2>
<label>继续处理压缩包<select id="zip-resume"></select></label><div class="links"><button id="zip-refresh" type="button">刷新清单</button></div>
<p id="zip-status" role="status"></p><div id="zip-panel" hidden><strong id="zip-title"></strong><p id="zip-meta" class="muted"></p>
<ul id="zip-entries" aria-label="压缩包成员"></ul><div class="links"><button id="zip-commit" type="button">导入所选文件</button><span id="zip-count"></span></div></div></section>
<section id="receipt" aria-labelledby="receipt-heading" hidden><h2 id="receipt-heading">导入回执</h2><div id="result"></div></section>
<section id="office" aria-labelledby="office-heading" hidden><h2 id="office-heading">Word 转换与质量核对</h2>
<label for="office-version">Word 版本</label><select id="office-version"></select>
<div id="office-panel" hidden><p id="office-status" aria-live="polite" aria-atomic="true"></p>
<div class="links"><button id="office-action" type="button" hidden></button><button id="office-refresh" type="button">刷新转换状态</button></div>
<div id="office-result" hidden><h3>可用转换结果</h3><p id="office-quality"></p>
<div class="links"><a id="office-preview" target="_blank" rel="noopener">预览转换 PDF</a><a id="office-download" download>下载转换 PDF</a></div>
<h3>逐页质量记录</h3><ol id="office-notes" aria-label="逐页质量记录"></ol>
<button id="office-older-notes" type="button" hidden>查看更早质量记录</button>
<form id="office-note-form"><label>页码<input type="number" id="office-page" min="1" step="1" required></label>
<label>质量问题<textarea id="office-body" rows="2" required></textarea></label><button type="submit" id="office-save">保存质量记录</button></form></div>
<section id="office-history" aria-label="转换历史" hidden><h3>转换历史</h3><ol id="office-attempts"></ol>
<div class="links"><button id="office-older" type="button" hidden>更早转换</button><button id="office-newest" type="button" hidden>返回最近转换</button></div></section>
<section id="office-detail" aria-label="历史质量记录" hidden><h3 id="office-detail-title" tabindex="-1">历史质量记录</h3>
<a id="office-detail-pdf" target="_blank" rel="noopener">预览此记录的 PDF</a><ol id="office-detail-notes"></ol>
<div class="links"><button id="office-detail-older" type="button" hidden>更早记录</button><button id="office-detail-newest" type="button" hidden>最新记录</button>
<button id="office-detail-close" type="button">关闭历史记录</button></div></section><p id="office-nav-status" role="status"></p></div></section>
<section id="reader" aria-labelledby="reader-heading" hidden><h2 id="reader-heading">文本回读</h2>
<label id="block-picker">文本版本<select id="block-version"></select></label>
<p id="block-summary" aria-live="polite"></p><ol id="blocks" aria-label="文本块"></ol>
<div id="block-nav" class="links" hidden><button id="block-prev" type="button">上一页</button><button id="block-next" type="button">下一页</button></div>
<button id="block-retry" type="button" hidden>重试读取</button></section>
<section id="parse" aria-labelledby="parse-heading" hidden><h2 id="parse-heading">解析进度</h2>
<label id="parse-picker">资料版本<select id="parse-version"></select></label>
<div id="parse-panel" hidden><p id="parse-summary" aria-live="polite"></p><p id="parse-note" aria-live="polite"></p>
<div class="links"><button id="parse-action" type="button" hidden></button><button id="parse-refresh" type="button">刷新进度</button></div>
<ul id="parse-pages" aria-label="分章节页状态"></ul><div class="links" id="parse-nav" hidden><button id="parse-prev" type="button">上一组</button><span id="parse-range"></span><button id="parse-next" type="button">下一组</button></div></div></section>
<section aria-labelledby="list-heading"><div class="bar"><h2 id="list-heading">我的资料</h2><button id="refresh" type="button">刷新资料</button></div><div id="list"></div></section></main>
<script>(()=>{
'use strict';
const $ = id => document.getElementById(id);
const api = '/knowledge/v1/', file = $('file'), target = $('target');
const mode=$('mode'), encoding=$('encoding'), textTypes={md:'text/markdown',txt:'text/plain'};
const textMode=()=>mode.value==='text';
const wordTypes={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',doc:'application/msword'};
const wordMode=()=>mode.value==='word';
const zipMode=()=>mode.value==='zip';
function fileType(blob){
  if(!blob)return null;
  if(zipMode())return /\.zip$/i.test(blob.name)?'application/zip':null;
  const ext=/\.(pdf|md|txt|docx?)$/i.exec(blob.name)?.[1].toLowerCase();
  return textMode()?textTypes[ext] || null:wordMode()?wordTypes[ext] || null:ext==='pdf'?'application/pdf':null;
}
function drawMode(){
  const text=textMode(), word=wordMode();$('file-label').textContent=text?'文本文件':word?'Word 文件':'PDF 文件';
  file.accept=text?'.md,.txt,text/markdown,text/plain':word?['.docx','.doc',...Object.values(wordTypes)].join(','):'.pdf,application/pdf';
  $('encoding-picker').hidden=!text;$('submit').textContent=text?'导入文本':word?'导入 Word':'导入 PDF';
  target.parentElement.hidden=zipMode();$('zip').hidden=!zipMode();
  if(zipMode()){$('file-label').textContent='ZIP 文件';file.accept='.zip,application/zip';$('submit').textContent='预览压缩包'}
}
let owner = null, generation = 0, busy = false, ready = false, key = null, conflict = false, rows = [];
function status(text,error=false){ $('status').textContent=text; $('status').toggleAttribute('data-error',error) }
function controls(){
  mode.disabled = file.disabled = target.disabled = !ready || busy;
  encoding.disabled = file.disabled || !textMode();
  $('office-version').disabled = $('block-version').disabled = $('parse-version').disabled = !ready || busy;
  $('submit').disabled = file.disabled || !key || conflict;
  $('refresh').disabled = busy;
  if(zipMode()){target.disabled=true;zipControls()}
}
function clearDraft(){ file.value=''; encoding.value=''; key=null; conflict=false }
function clearPrivate(){
  clearZip();clearOffice();clearParse();clearReader();mode.value='pdf';drawMode();
  owner=null; ready=false; rows=[]; clearDraft(); target.replaceChildren(new Option('新建资料',''));
  $('who').textContent=''; $('receipt').hidden=true; $('result').replaceChildren(); $('list').replaceChildren();
}
function signedOut(){ ++generation; busy=false; clearPrivate(); controls(); status('请先登录：前往「账号与登录」，登录后刷新资料。',true) }
function problem(http){ return Object.assign(new Error(),{http}) }
async function request(path,options,readBody=true){
  const r=await fetch(api+path,{credentials:'same-origin',cache:'no-store',redirect:'error',...options});
  if(!r.ok) throw problem(r.status);
  if(readBody)return (await r.json()).data;
}
async function me(){ const m=await request('me'); if(!m || typeof m.id!=='string' || !m.id)throw problem(502); return m }
// Every asynchronous commit belongs to both an operation and the same session principal.
async function confirmOwner(gen){
  return checkOwnerWhile(()=>gen===generation);
}
async function checkOwnerWhile(current){
  if(!current())return false;
  const m=await me(); if(!current())return false;
  if(m.id!==owner){ void load(true); return false } return true;
}
function fail(e,gen,upload){
  if(gen!==generation)return;
  if(e.http===401){signedOut();return}
  if(e.http===403 || e.http===404){
    ++generation; busy=false; clearPrivate(); controls(); status('资料不可访问。请核对账号和权限，再刷新资料。',true); return;
  }
  if(!upload){status('无法读取资料。请检查连接后刷新资料。',true);return}
  const format=zipMode()?'ZIP 压缩包':textMode()?'文本文件':wordMode()?'Word 文件':'PDF';
  const hint={400:'文件或导入信息无效，请重新选择'+format+'。',409:'资料或请求状态已变化，请刷新资料后核对版本再导入。',413:'文件过大，请重新选择较小的'+format+'。',415:'格式不受支持，请重新选择'+format+'。',422:textMode()?'无法导入此文本，请核对编码或重新选择文件。':'无法导入此文件，请重新选择有效的 PDF。',507:'存储空间不足，请联系管理员释放空间后重试。'};
  if(e.http===409)conflict=true;
  status(zipMode() && e.http===422?'压缩包无效或超出安全限制，未导入任何文件。':wordMode() && e.http===422?'无法导入此 Word 文件，请核对原件后重新选择。':hint[e.http] || '未收到有效回执。请检查连接或服务状态，保留当前选择并重试。',true);
}
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
function record(r){
  if(!r || !uuid.test(r.id) || !uuid.test(r.version_id) || typeof r.title!=='string' || !Number.isSafeInteger(r.version) || r.version<1 || !Number.isSafeInteger(r.byte_length) || r.byte_length<0 || !/^[a-f\d]{64}$/i.test(r.sha256))throw problem(502);
  return {...r,media_type:r.media_type===undefined?'application/pdf':r.media_type};
}
const isPdf=r=>r.media_type==='application/pdf', isText=r=>Object.values(textTypes).includes(r.media_type);
const isWord=r=>Object.values(wordTypes).includes(r.media_type);
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function entry(r){
  const node=el('div',null,'entry'), meta=el('dl'), links=el('div',null,'links');
  for(const [label,value] of [['版本','v'+r.version],['大小',r.byte_length+' 字节'],['SHA-256',r.sha256]])
    meta.append(el('dt',label),el('dd',value,label==='SHA-256'?'hash':''));
  const path=api+'assets/'+r.id+'/versions/'+r.version_id+'/original';
  if(isPdf(r)){const view=el('a','查看原件');view.href=path;view.target='_blank';view.rel='noopener';links.append(view)}
  const save=el('a',isPdf(r)?'导出 PDF':'导出原件');save.href=path+'?download=1';save.download='';links.append(save);
  node.append(el('strong',r.title),meta,links);return node;
}
function head(id){return rows.find(r=>r.id===id)}
const archive=$('zip-resume'), zipStates={available:'可选择',selected:'待导入',imported:'已导入',failed:'导入失败'};
let zipSeq=0, manifest=null, picked=new Set(), retrySelection=null;
function clearManifest(){
  manifest=null;picked.clear();retrySelection=null;$('zip-panel').hidden=true;
  for(const id of ['zip-title','zip-meta','zip-status','zip-count','zip-entries'])$(id).replaceChildren();
}
function clearZip(){++zipSeq;clearManifest();archive.replaceChildren(new Option('选择压缩包',''))}
function zipControls(){
  archive.disabled=$('zip-refresh').disabled=busy || !ready;
  $('zip-commit').disabled=busy || !ready || !manifest || !picked.size;
  $('zip-commit').textContent=retrySelection?'重试上次提交':'导入所选文件';
  $('zip-count').textContent='已勾选 '+picked.size+' 项';
  for(const input of $('zip-entries').querySelectorAll('input'))input.disabled=busy || !ready || !!retrySelection || input.dataset.eligible!=='yes';
}
function zipHeader(d){
  if(!d || !uuid.test(d.id) || typeof d.title!=='string' || !/^[a-f\d]{64}$/i.test(d.sha256))throw problem(502);
  return d;
}
const zipSize=n=>Number.isSafeInteger(n)&&n>=0;
function showManifest(d,expected,previous=new Set()){
  zipHeader(d);if((expected && d.id!==expected) || typeof d.state!=='string' || !zipSize(d.byte_length) || !Array.isArray(d.entries))throw problem(502);
  const seen=new Set(),counts={selected:0,imported:0,failed:0},next=new Set();
  const nodes=d.entries.map(e=>{
    if(!e || !uuid.test(e.id) || seen.has(e.id) || typeof e.path!=='string' || typeof e.name!=='string' ||
      !zipSize(e.size) || !zipSize(e.compressed_size) || !Object.hasOwn(zipStates,e.state) ||
      !(e.reason===null || typeof e.reason==='string') || !(e.media_type===null || typeof e.media_type==='string'))throw problem(502);
    seen.add(e.id);if(Object.hasOwn(counts,e.state))counts[e.state]++;
    const eligible=e.reason===null && e.state!=='imported',li=el('li'),label=el('label'),input=el('input');
    input.type='checkbox';input.value=e.id;input.dataset.eligible=eligible?'yes':'no';
    input.checked=eligible && (e.state==='selected' || previous.has(e.id));if(input.checked)next.add(e.id);
    input.onchange=()=>{if(manifest!==d || !eligible || busy || retrySelection)return;if(input.checked)picked.add(e.id);else picked.delete(e.id);zipControls()};
    label.append(input,el('span',e.path));li.append(label,el('small','原始名称：'+e.name+' · '+e.size+' 字节（压缩后 '+e.compressed_size+' 字节）'+(e.media_type?' · '+e.media_type:'')));
    li.append(el('span',e.reason!==null?'不可导入：'+e.reason:zipStates[e.state]+(e.error?'：'+e.error:'')));
    if(e.state==='imported' && e.receipt)li.append(entry(record(e.receipt)));
    return li;
  });
  const opt=Array.from(archive.options).find(o=>o.value===d.id);if(opt)opt.textContent=d.title+' · '+d.state;else archive.add(new Option(d.title+' · '+d.state,d.id));archive.value=d.id;
  manifest=d;picked=next;retrySelection=null;$('zip-title').textContent=d.title;$('zip-meta').textContent=d.byte_length+' 字节 · SHA-256 '+d.sha256;
  $('zip-status').textContent='共 '+nodes.length+' 项 · 待导入 '+counts.selected+' · 已导入 '+counts.imported+' · 失败 '+counts.failed;
  $('zip-entries').replaceChildren(...nodes);$('zip-panel').hidden=false;zipControls();
}
async function readZip(id=''){
  if(!zipMode() || !ready || busy)return;
  const seq=++zipSeq,current=()=>seq===zipSeq && zipMode();clearManifest();$('zip-status').textContent='正在读取清单…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=await request(id?'imports/'+id+'/entries':'imports');if(!await checkOwnerWhile(current))return;
    if(id)showManifest(data,id);
    else{
      if(!Array.isArray(data?.items))throw problem(502);
      const opts=data.items.map(zipHeader).map(d=>new Option(d.title+(typeof d.state==='string'?' · '+d.state:''),d.id));
      archive.replaceChildren(new Option('选择压缩包',''),...opts);$('zip-status').textContent=opts.length?'请选择要继续处理的压缩包。':'暂无压缩包。';
    }
  }catch(e){if(!current())return;if([401,403,404].includes(e.http))fail(e,generation,false);else $('zip-status').textContent='清单读取失败，请刷新重试。'}
}
archive.onchange=()=>void readZip(archive.value);$('zip-refresh').onclick=()=>void readZip(archive.value);
$('zip-commit').onclick=async()=>{
  if(!ready || busy || !zipMode() || !manifest || !picked.size)return;
  const id=manifest.id,gen=++generation,seq=++zipSeq,current=()=>seq===zipSeq && gen===generation;
  const attempt=retrySelection || {key:crypto.randomUUID(),ids:[...picked].sort()};retrySelection=attempt;
  busy=true;controls();$('zip-status').textContent='正在导入 '+attempt.ids.length+' 项…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=await request('imports/'+id+'/selection',{method:'POST',headers:{'x-knowledgeos-request':'1','content-type':'application/json','idempotency-key':attempt.key},body:JSON.stringify({entry_ids:attempt.ids})});
    if(!await checkOwnerWhile(current))return;
    showManifest(data,id,new Set(attempt.ids));
    // Only published receipts enter the ordinary version pickers, never a preview row.
    const added=data.entries.filter(e=>e.state==='imported' && e.receipt).map(e=>record(e.receipt));
    if(added.length){const ids=new Set(added.map(r=>r.version_id));clearOffice();clearReader();clearParse();renderRows([...added,...rows.filter(r=>!ids.has(r.version_id))],target.value)}
  }catch(e){if(!current())return;if([401,403,404].includes(e.http))fail(e,gen,false);
    else $('zip-status').textContent='未确认导入结果。可重试上次提交，或刷新清单核对已导入项。';
  }finally{if(current()){busy=false;controls()}}
};
const docStates={idle:'未开始',queued:'排队中',running:'解析中',complete:'解析完成',partial:'部分完成',failed:'解析失败',cancelled:'已取消'};
const pageStates={pending:'未处理',ready:'可用',review:'待复核',failed:'失败'};
const pageSize=25, parseVersion=$('parse-version'), writes=new Map();
let selection=null, pollTimer;
function clearParse(){
  clearTimeout(pollTimer);selection=null;parseVersion.replaceChildren();$('parse').hidden=true;resetPanel();
}
function resetPanel(){
  $('parse-panel').hidden=true;$('parse-action').hidden=true;$('parse-nav').hidden=true;
  $('parse-summary').textContent='';$('parse-note').textContent='';$('parse-pages').replaceChildren();$('parse-range').textContent='';
}
function progress(data){
  const nullableText=v=>v===null || typeof v==='string';
  if(!data || !Object.hasOwn(docStates,data.state) || !Number.isSafeInteger(data.total) || data.total<0 || !nullableText(data.error) || !Array.isArray(data.pages))throw problem(502);
  const seen=new Set(), counts={pending:0,ready:0,review:0,failed:0};
  for(const p of data.pages){
    if(!p || !Number.isSafeInteger(p.page) || p.page<1 || p.page>data.total || seen.has(p.page) || !Object.hasOwn(pageStates,p.state) || typeof p.chapter!=='string' || !nullableText(p.error))throw problem(502);
    seen.add(p.page);++counts[p.state];
  }
  return {...data,counts,pages:data.pages.sort((a,b)=>a.page-b.page)};
}
function activeJob(state){return state==='queued' || state==='running'}
function drawPages(s){
  const {pages,state}=s.data, last=Math.max(0,Math.ceil(pages.length/pageSize)-1);
  s.group=Math.min(last,Math.max(0,s.group));const from=s.group*pageSize, end=Math.min(from+pageSize,pages.length);
  const items=pages.slice(from,end).map(p=>{
    const li=el('li');li.append(el('strong','第 '+p.page+' 页'),el('span',pageStates[p.state]),el('span',p.chapter));
    if(state==='partial' && (p.state==='failed' || p.state==='review')){
      const retry=el('button','重试第 '+p.page+' 页');retry.type='button';retry.disabled=s.writing;
      retry.onclick=()=>requestProgress(s,'/retry/'+p.page);li.append(retry);
    }
    if(p.error)li.append(el('small',p.error));return li;
  });
  $('parse-pages').replaceChildren(...items);$('parse-nav').hidden=last===0;
  $('parse-prev').disabled=s.group===0;$('parse-next').disabled=s.group===last;
  $('parse-range').textContent=pages.length?'第 '+(from+1)+'–'+end+' 条，共 '+pages.length+' 条':'';
}
function drawProgress(s){
  const {state,total,counts,error}=s.data, action=$('parse-action');
  const summary=docStates[state]+' · 共 '+total+' 页'+Object.keys(pageStates).map(k=>' · '+pageStates[k]+' '+counts[k]).join('');
  if($('parse-summary').textContent!==summary)$('parse-summary').textContent=summary;
  $('parse-note').textContent=error || '';
  const labels={idle:'开始解析',queued:'取消解析',running:'取消解析',failed:'重新解析',cancelled:'继续解析'};
  action.hidden=!labels[state];action.textContent=labels[state] || '';action.disabled=action.hidden || s.writing;
  action.onclick=action.hidden?null:()=>requestProgress(s,activeJob(state)?'/cancel':'/start');drawPages(s);
}
async function requestProgress(s,action=''){
  if(selection!==s || s.writing)return;
  clearTimeout(pollTimer);const seq=++s.seq, current=()=>selection===s && s.seq===seq;
  s.writing=!!action;$('parse-refresh').disabled=true;
  if(s.writing){drawProgress(s);$('parse-note').textContent='正在提交…'}
  try{
    // Returning to a version while its previous POST is in flight must read after that write.
    if(writes.has(s.path))await writes.get(s.path);
    if(!await checkOwnerWhile(current))return;
    const req=request(s.path+action,action?{method:'POST',headers:{'x-knowledgeos-request':'1'}}:undefined);
    if(action)writes.set(s.path,req.catch(()=>{}));
    let data;try{data=await req}finally{if(action)writes.delete(s.path)}
    if(!await checkOwnerWhile(current))return;
    s.data=progress(data);s.writing=false;drawProgress(s);
    if(activeJob(s.data.state))pollTimer=setTimeout(()=>requestProgress(s),2000);
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    s.data=null;s.group=0;resetPanel();$('parse-panel').hidden=false;
    $('parse-note').textContent='无法确认当前解析状态。请刷新进度后再操作。';
  }finally{if(current()){s.writing=false;$('parse-refresh').disabled=false}}
}
parseVersion.onchange=()=>{
  clearTimeout(pollTimer);selection=null;resetPanel();const r=rows.find(row=>row.version_id===parseVersion.value);
  if(!r || !isPdf(r) || !ready || busy)return;
  selection={path:'assets/'+r.id+'/versions/'+r.version_id+'/parse',seq:0,group:0,writing:false,data:null};
  $('parse-panel').hidden=false;$('parse-summary').textContent='正在读取解析进度…';void requestProgress(selection);
};
$('parse-refresh').onclick=()=>{if(selection)void requestProgress(selection)};
for(const [id,delta] of [['parse-prev',-1],['parse-next',1]])$(id).onclick=()=>{if(selection?.data){selection.group+=delta;drawPages(selection)}};
const blockVersion=$('block-version'), blockLimit=5;
let blockRequest=null;
function resetBlocks(){
  blockRequest=null;$('block-summary').textContent='';$('blocks').replaceChildren();$('block-nav').hidden=$('block-retry').hidden=true;
}
function clearReader(){resetBlocks();blockVersion.replaceChildren();$('reader').hidden=true}
function validateBlocks(data,r,from){
  if(!data || data.version_id!==r.version_id || typeof data.encoding!=='string' || !Number.isSafeInteger(data.total) || data.total<0 ||
    from>Math.max(1,data.total) || !Array.isArray(data.blocks) || data.blocks.length!==Math.min(blockLimit,data.total-from+1))throw problem(502);
  for(const [i,b] of data.blocks.entries()){
    if(!b || b.ordinal!==from+i || typeof b.kind!=='string' || typeof b.text!=='string' ||
      !Number.isSafeInteger(b.start) || !Number.isSafeInteger(b.end) || b.start<0 || b.end<b.start)throw problem(502);
  }
}
async function readBlocks(r,from){
  resetBlocks();const req={r,from};blockRequest=req;const current=()=>blockRequest===req;
  $('block-summary').textContent='正在读取文本块…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=await request('assets/'+r.id+'/versions/'+r.version_id+'/blocks?from='+from+'&limit='+blockLimit);
    if(!await checkOwnerWhile(current))return;
    validateBlocks(data,r,from);
    const end=from+data.blocks.length-1;
    $('block-summary').textContent=data.encoding+' · '+(data.total?'第 '+from+'–'+end+' 块，共 '+data.total+' 块':'暂无文本块');
    $('blocks').start=from;$('blocks').replaceChildren(...data.blocks.map(b=>{
      const li=el('li');li.append(el('small',b.kind+' · 字符偏移 ['+b.start+', '+b.end+')'),el('pre',b.text));
      if(typeof b.anchor==='string' && b.anchor)li.append(el('small','锚点：'+b.anchor));return li;
    }));
    $('block-prev').disabled=from===1;$('block-next').disabled=end>=data.total;$('block-nav').hidden=data.total<=blockLimit;
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    $('block-summary').textContent='无法读取文本块。';$('block-retry').hidden=false;
  }
}
blockVersion.onchange=()=>{
  const r=rows.find(row=>row.version_id===blockVersion.value);
  if(r && isText(r) && ready && !busy)void readBlocks(r,1);else resetBlocks();
};
for(const [id,delta] of [['block-prev',-blockLimit],['block-next',blockLimit],['block-retry',0]]){
  $(id).onclick=()=>{if(blockRequest)void readBlocks(blockRequest.r,blockRequest.from+delta)};
}
const officeVersion=$('office-version'), officeWrites=new Map();
const officeStates={queued:'排队中',running:'转换中',ready:'转换完成',failed:'转换失败',cancelled:'已取消',superseded:'源版本已变化'};
let office=null;
function resetOfficeResult(){
  $('office-result').hidden=true;$('office-quality').textContent='';$('office-notes').replaceChildren();
  $('office-older-notes').hidden=true;
  $('office-preview').removeAttribute('href');$('office-download').removeAttribute('href');
  $('office-body').value='';$('office-page').value='1';
}
function resetOffice(){
  clearTimeout(office?.timer);office=null;resetOfficeHistory();resetOfficeResult();$('office-panel').hidden=true;
  $('office-status').textContent='';$('office-action').hidden=true;$('office-refresh').disabled=false;
}
function clearOffice(){resetOffice();officeVersion.replaceChildren();$('office').hidden=true}
function officeData(data,version){
  if(data?.version_id!==version || !Array.isArray(data.conversions) || data.conversions.length>10 ||
    (data.next_before!==undefined && (!uuid.test(data.next_before)||data.next_before!==data.conversions.at(-1)?.id)))throw problem(502);
  const ids=new Set();
  if(data.latest_ready!==undefined && data.latest_ready?.state!=='ready')throw problem(502);
  for(const c of [...data.conversions,...(data.latest_ready?[data.latest_ready]:[])]){
    if(!c || typeof c.id!=='string' || !/^[a-zA-Z0-9_-]+$/.test(c.id) || ids.has(c.id) || !Object.hasOwn(officeStates,c.state) ||
      (c.page_count!=null && (!Number.isSafeInteger(c.page_count) || c.page_count<0)) || (c.state==='ready' && !(c.page_count>0)) ||
      (c.failure_code!=null && typeof c.failure_code!=='string') || !Array.isArray(c.missing_fonts) || !c.missing_fonts.every(f=>typeof f==='string') ||
      !Array.isArray(c.notes) || c.notes.length>10 || !c.notes.every(n=>n && Number.isSafeInteger(n.page) && n.page>=1 && n.page<=c.page_count && typeof n.body==='string') ||
      (c.notes_next_before!==undefined && (!uuid.test(c.notes_next_before)||c.notes_next_before!==c.notes[0]?.id)))throw problem(502);
    ids.add(c.id);
  }
  return data;
}
function closeOfficeDetail(){
  $('office-detail').hidden=true;$('office-detail-title').textContent='历史质量记录';
  $('office-detail-notes').replaceChildren();$('office-detail-pdf').removeAttribute('href');
}
function resetOfficeHistory(){
  closeOfficeDetail();$('office-history').hidden=true;$('office-attempts').replaceChildren();$('office-nav-status').textContent='';
}
function drawAttempts(s){
  const page=s.history||s.head,history=$('office-history');
  history.hidden=!s.history && page.conversions.length<2 && !page.next_before;
  $('office-older').hidden=!page.next_before;$('office-newest').hidden=!s.history;
  // Don't replace focused controls on every live status poll.
  const key=JSON.stringify(page.conversions.map(c=>[c.id,c.state,c.failure_code]));if(key===s.historyKey)return;s.historyKey=key;
  $('office-attempts').replaceChildren(...page.conversions.map(c=>{
    const li=el('li',officeStates[c.state]+' · '+c.id+(c.failure_code?' · '+c.failure_code:''));
    if(c.state==='ready'){
      const b=el('button','查看质量记录');b.type='button';b.setAttribute('aria-label','查看质量记录：'+c.id);
      b.onclick=()=>readOfficePage(s,{conversion:c.id});li.append(' ',b);
    }
    return li;
  }));
}
const noteRows=c=>c.notes.map(n=>el('li','第 '+n.page+' 页：'+n.body));
async function readOfficePage(s,query){
  if(!s?.head)return;
  const token=++s.nav,current=()=>office===s && token===s.nav;
  $('office-nav-status').textContent='正在读取历史…';
  try{
    if(!await checkOwnerWhile(current))return;
    const data=officeData(await request(s.path+'?'+new URLSearchParams(query)),s.version);
    if(!await checkOwnerWhile(current))return;
    if(query.conversion){
      const c=data.conversions[0];if(data.conversions.length!==1 || c.id!==query.conversion || c.state!=='ready')throw problem(502);
      s.detail=c;$('office-detail-title').textContent='历史质量记录 · '+c.id;
      $('office-detail-pdf').href=api+s.path+'/'+c.id+'/pdf';$('office-detail-notes').replaceChildren(...noteRows(c));
      $('office-detail-older').hidden=!c.notes_next_before;$('office-detail-newest').hidden=!query.notes_before;
      $('office-detail').hidden=false;$('office-detail-title').focus();
    }else{
      s.history=data;s.detail=null;closeOfficeDetail();drawAttempts(s);
      $('office-newest').focus();
    }
    $('office-nav-status').textContent=query.conversion?'质量记录已刷新。':'已显示更早转换。';
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    $('office-nav-status').textContent='历史记录读取失败，请重试。';
  }
}
function officeControls(s){
  $('office-action').disabled=$('office-page').disabled=$('office-body').disabled=$('office-save').disabled=s.writing;
  $('office-refresh').disabled=s.writing;
}
function drawOffice(s,data){
  s.head=data;drawAttempts(s);
  const items=data.conversions,latest=items[0],result=data.latest_ready||items.find(c=>c.state==='ready');
  const statusText=latest?'最近一次：'+officeStates[latest.state]+(latest.failure_code?' · '+latest.failure_code:''):'尚未转换。';
  if($('office-status').textContent!==statusText)$('office-status').textContent=statusText;
  s.active=items.find(c=>activeJob(c.state));
  $('office-action').hidden=false;$('office-action').textContent=s.active?'取消转换':latest?'重新转换':'开始转换';
  // Bind the draft to the actual reviewed PDF, never silently move it to a new result.
  if(s.result?.id!==result?.id)resetOfficeResult();
  s.result=result;
  if(!result)return;
  const path=api+s.path+'/'+result.id+'/pdf';
  $('office-preview').href=path;$('office-download').href=path+'?download=1';
  $('office-result').hidden=false;$('office-page').max=String(result.page_count);
  $('office-quality').textContent=(result!==latest?'上一次可用结果':'当前可用结果')+' · '+result.page_count+' 页 · '+
    (result.missing_fonts.length?'缺失字体：'+result.missing_fonts.join('、'):'未报告缺失字体');
  $('office-notes').replaceChildren(...noteRows(result));$('office-older-notes').hidden=!result.notes_next_before;
}
$('office-older').onclick=()=>{const s=office;void readOfficePage(s,{before:(s.history||s.head).next_before})};
$('office-newest').onclick=()=>{const s=office;++s.nav;s.history=s.detail=null;closeOfficeDetail();drawAttempts(s);void syncOffice(s);$('office-nav-status').textContent='已返回最近转换。'};
$('office-older-notes').onclick=()=>{const c=office.result;void readOfficePage(office,{conversion:c.id,notes_before:c.notes_next_before})};
$('office-detail-older').onclick=()=>{const c=office.detail;void readOfficePage(office,{conversion:c.id,notes_before:c.notes_next_before})};
$('office-detail-newest').onclick=()=>void readOfficePage(office,{conversion:office.detail.id});
$('office-detail-close').onclick=()=>{++office.nav;office.detail=null;closeOfficeDetail();$('office-nav-status').textContent='';$('office-refresh').focus()};
async function syncOffice(s,action='',note=null){
  if(!s || s!==office || s.writing)return;
  clearTimeout(s.timer);const seq=++s.seq,current=()=>s===office && s.seq===seq;
  s.writing=!!action;officeControls(s);
  try{
    // A new selection of the same version must observe an already-dispatched write.
    if(officeWrites.has(s.path))await officeWrites.get(s.path);
    if(!await checkOwnerWhile(current))return;
    if(action){
      const headers={'x-knowledgeos-request':'1'};
      if(note || action==='/start')headers['idempotency-key']=crypto.randomUUID();
      if(note)headers['content-type']='application/json';
      const write=request(s.path+action,{method:'POST',headers,body:note?JSON.stringify(note):undefined},false);
      officeWrites.set(s.path,write.catch(()=>{}));
      try{await write}finally{officeWrites.delete(s.path)}
      if(!await checkOwnerWhile(current))return;
      if(note)$('office-body').value='';
    }
    const data=await request(s.path);
    if(!await checkOwnerWhile(current))return;
    drawOffice(s,officeData(data,s.version));
    if(s.active)s.timer=setTimeout(()=>syncOffice(s),2000);
  }catch(e){
    if(!current())return;
    if([401,403,404].includes(e.http)){fail(e,generation,false);return}
    ++s.nav;s.head=s.history=s.historyKey=s.detail=null;resetOfficeHistory();s.result=s.active=null;resetOfficeResult();$('office-action').hidden=true;
    $('office-status').textContent='无法确认转换状态，请刷新转换状态后再操作。';
  }finally{if(current()){s.writing=false;officeControls(s)}}
}
officeVersion.onchange=()=>{
  resetOffice();const r=rows.find(row=>row.version_id===officeVersion.value);
  if(!r || !isWord(r) || !ready || busy)return;
  office={version:r.version_id,path:'assets/'+r.id+'/versions/'+r.version_id+'/office',seq:0,nav:0,writing:false};
  $('office-panel').hidden=false;$('office-status').textContent='正在读取转换状态…';void syncOffice(office);
};
$('office-refresh').onclick=()=>void syncOffice(office);
$('office-action').onclick=()=>{if(office)void syncOffice(office,office.active?'/'+office.active.id+'/cancel':'/start')};
$('office-note-form').onsubmit=e=>{
  e.preventDefault();const r=office?.result,page=$('office-page').valueAsNumber,body=$('office-body').value.trim();
  if(!r || !Number.isSafeInteger(page) || page<1 || page>r.page_count)return;
  if(!body){$('office-body').focus();$('office-status').textContent='请输入质量问题。';return}
  void syncOffice(office,'/'+r.id+'/notes',{page,body});
};
function renderRows(items,selected){
  rows=items.slice().sort((a,b)=>b.version-a.version);
  const seen=new Set();target.replaceChildren(new Option('新建资料',''));
  for(const r of rows)if(!seen.has(r.id)){seen.add(r.id);target.add(new Option(r.title+' · v'+r.version,r.id))}
  target.value=seen.has(selected)?selected:'';
  $('list').replaceChildren(...(rows.length?rows.map(entry):[el('p','暂无资料','muted')]));
  for(const [select,section,predicate,prompt] of [[parseVersion,'parse',isPdf,'选择资料版本'],[blockVersion,'reader',isText,'选择文本版本'],[officeVersion,'office',isWord,'选择 Word 版本']]){
    const versions=rows.filter(predicate);select.replaceChildren(new Option(prompt,''),...versions.map(r=>new Option(r.title+' · v'+r.version,r.version_id)));
    $(section).hidden=!versions.length;
  }
}
async function load(reset=false){
  const gen=++generation;busy=true;clearZip();clearOffice();clearReader();clearParse();if(reset)clearPrivate();controls();status('正在读取资料…');
  try{
    const m=await me();if(gen!==generation)return;
    if(m.id!==owner)clearPrivate();owner=m.id;$('who').textContent=m.display_name || m.login_name || m.id;
    const selected=target.value, previous=head(selected), data=await request('assets');
    if(!await confirmOwner(gen))return;
    renderRows(data.items.map(record),selected);ready=true;
    if(conflict || (selected && head(selected)?.version!==previous?.version)){
      clearDraft();status('资料版本已刷新，请核对导入目标并重新选择文件。');
    }else status('资料已刷新。');
  }catch(e){if(gen===generation){ready=false;$('list').replaceChildren();fail(e,gen,false)}}
  finally{if(gen===generation){busy=false;controls();if(zipMode() && ready)void readZip()}}
}
function changed(){
  if(busy || !ready)return;
  ++generation;conflict=false;key=fileType(file.files[0])?crypto.randomUUID():null;controls();
  status(key?'文件已选择。':zipMode()?'请选择 .zip 压缩包。':textMode()?'请选择 .md 或 .txt 文本文件。':wordMode()?'请选择 .docx 或 .doc 文件。':'请选择 PDF 文件。',!!file.files[0] && !key);
}
mode.onchange=()=>{clearZip();clearDraft();drawMode();changed();if(zipMode())void readZip()};
for(const control of [file,target,encoding])control.addEventListener('change',changed);
$('refresh').onclick=()=>load();
$('import').onsubmit=async event=>{
  event.preventDefault();if(!ready || busy || conflict || !key || !file.files[0])return;
  const gen=++generation, selected=zipMode()?'':target.value, dest=head(selected), blob=file.files[0], type=fileType(blob);
  if(!type)return;if(zipMode()){++zipSeq;clearManifest();archive.value='';$('receipt').hidden=true}busy=true;controls();status(zipMode()?'正在上传并读取清单…':'正在导入…');
  try{
    if(!await confirmOwner(gen))return;
    const headers={'content-type':type,'x-knowledgeos-request':'1','x-knowledgeos-filename':encodeURIComponent(blob.name),'idempotency-key':key};
    if(textMode() && encoding.value)headers['x-knowledgeos-encoding']=encoding.value;
    if(selected){headers['x-knowledgeos-asset-id']=dest.id;headers['x-knowledgeos-expected-version']=String(dest.version)}
    const raw=await request('imports',{method:'POST',headers,body:blob});
    if(!await confirmOwner(gen))return;
    if(zipMode()){showManifest(raw);clearDraft();status('清单已就绪，请核对后选择文件。');return}
    const r=record(raw);clearDraft();clearOffice();clearParse();clearReader();renderRows([r,...rows.filter(old=>old.version_id!==r.version_id)],selected);
    $('result').replaceChildren(entry(r));$('receipt').hidden=false;status('导入成功，已接收 v'+r.version+'。');
  }catch(e){fail(e,gen,true)}finally{if(gen===generation){busy=false;controls()}}
};
function checkSession(){
  if(document.hidden)return;
  if(!owner){if(!busy)void load();return}
  const gen=generation;confirmOwner(gen).catch(e=>{if(gen!==generation)return;if(e.http===401)signedOut();else if(!busy)void load()});
}
window.addEventListener('focus',checkSession);document.addEventListener('visibilitychange',checkSession);
window.addEventListener('pageshow',e=>{if(e.persisted)void load(true)});
void load();
})()</script></body></html>`;
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
  return new Promise((resolve2) => setTimeout(resolve2, ms));
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
  if (storage?.available) ctx.effect(() => startWorker(storage.jobs, log), "knowledgeos-jobs: checkpoint worker");
  let closing = false;
  const inFlight = /* @__PURE__ */ new Set();
  const service = {
    create(idempotencyKey, content) {
      if (closing) throw new RecordsError("STORAGE_CLOSED", "storage is closing");
      if (storage === void 0) throw new RecordsError("STORAGE_UNAVAILABLE", "storage is not configured");
      return createProbeRecord(storage, {
        newId: () => randomUUID15(),
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
    res.end(JSON.stringify({ code: "STORAGE_UNAVAILABLE", message: "storage is not configured", request_id: randomUUID15(), retryable: true, safe_details: {} }));
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
    const route = () => config.ai ?? identityContext.get("agentDefaultModel")?.currentSelection() ?? {};
    let ai = new AiService(storage, route());
    identityContext.inject(["llm", "tools"], (aiContext) => {
      aiContext.effect(() => {
        ai.close();
        let active3;
        try {
          active3 = new AiService(storage, route(), aiContext.llm, aiContext.tools);
        } catch {
          console.warn("knowledgeos-ai: TOOL_REGISTRATION_FAILED");
          ai = new AiService(storage, route());
          return () => ai.close();
        }
        ai = active3;
        return () => {
          active3.close();
          if (ai === active3) ai = new AiService(storage, route());
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
      res.end(buildAccountHtml().replace("</main>", '<p><a href="/knowledgeos/library">\u77E5\u8BC6\u5E93</a> \xB7 <a href="/knowledgeos/ai">\u53D7\u63A7 AI \u5DE5\u5177</a></p></main>'));
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
    let officeMount;
    if (storage?.available && dataDir) {
      const office = storage.office, originals = new PdfOriginals(join3(dataDir, "originals"));
      identityContext.inject(["officeKit"], (scope) => {
        scope.effect(() => {
          const stop = startOfficeWorker(office, originals, scope.officeKit, openPdf, log), mount = Symbol();
          officeMount = mount;
          return async () => {
            if (officeMount === mount) officeMount = void 0;
            await stop();
          };
        }, "knowledgeos-office: versioned conversion worker");
      });
    }
    identityContext.effect(() => {
      const disposers = [];
      disposers.push(identityContext.webServer.register({ kind: "exact", path: ACCOUNT_PATH, auth: "anonymous", handler: accountPage }));
      if (storage && dataDir) {
        const originals = new PdfOriginals(join3(dataDir, "originals"));
        const handler = libraryHandler(storage.assets, originals, actualOrigin, (req) => {
          const origin = actualOrigin();
          if (!origin || !identityAvailable()) return void 0;
          return identity.actor(readCookie(req, businessCookieName(identity.setupState.serviceId, origin)));
        }, storage.parses, storage.office, () => !!officeMount, storage.archives);
        if (storage.available) disposers.push(startParseWorker(storage.parses, originals, openPdf, log));
        disposers.push(identityContext.webServer.register({ kind: "exact", path: "/knowledgeos/library", auth: "anonymous", handler: (req, res) => {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.end();
            return;
          }
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(buildLibraryHtml());
        } }));
        disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/imports", auth: "anonymous", handler: withPeer(handler) }));
        disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/assets", auth: "anonymous", handler: withPeer(handler) }));
        disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/operations", auth: "anonymous", handler: withPeer(handler) }));
      }
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
      for (const route2 of routes) disposers.push(identityContext.webServer.register({ kind: "exact", path: route2.path, auth: route2.auth, handler: withPeer(route2.handler) }));
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
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/jobs", auth: "anonymous", handler: withPeer(objectHandler) }));
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/projects", auth: "anonymous", handler: withPeer(async (req, res) => objectHandler(req, res)) }));
      disposers.push(identityContext.webServer.register({ kind: "prefix", path: "/knowledge/v1/grants", auth: "anonymous", handler: withPeer(async (req, res) => objectHandler(req, res)) }));
      return async () => {
        ai.close();
        for (const dispose of disposers) await dispose();
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
