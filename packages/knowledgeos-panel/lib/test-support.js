// src/host/ai-service.ts
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

// src/host/ai-tools.ts
import { createHash } from "node:crypto";
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
function onlyKeys(value, keys) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new AiError(422, "INPUT_INVALID");
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
function toolDigest(name, input) {
  return createHash("sha256").update(JSON.stringify([name, input.object_id, input.expected_revision ?? null, input.title ?? null, input.body ?? null])).digest("hex");
}
function runBusinessTool(store, actor, call, key, now) {
  const input = toolArguments(call);
  if (call.name === TOOL_NAMES[0]) {
    const object = store.authorizeObject(actor, input.object_id, "read", now);
    return object === void 0 ? { ok: false, status: 404, code: "NOT_FOUND" } : { ok: true, status: 200, code: "READ", object };
  }
  const result = store.mutateObjectOnce(actor, { objectId: input.object_id, expectedRevision: input.expected_revision, title: input.title, body: input.body, key, digest: toolDigest(call.name, input) }, now);
  if (result.kind === "updated" || result.kind === "replayed") return { ok: true, status: 200, code: result.kind === "updated" ? "UPDATED" : "REPLAYED", object: result.object, replayed: result.kind === "replayed" };
  const errors = { not_found: [404, "NOT_FOUND"], session_expired: [401, "AUTH_REQUIRED"], conflict: [409, "REVISION_CONFLICT"], idempotency_conflict: [409, "IDEMPOTENCY_CONFLICT"] };
  const [status, code] = errors[result.kind];
  return { ok: false, status, code };
}

// src/host/records.ts
import { createHash as createHash2 } from "node:crypto";
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
  return createHash2("sha256").update(Buffer.from(content, "utf8")).digest("hex");
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
    for (const [value, min, max, integer] of [[config.maxCalls ?? 1, 1, Number.MAX_SAFE_INTEGER, true], [config.timeoutMs ?? 3e4, 100, 6e4, true], [config.budgetUsd ?? 0, 0, Number.MAX_VALUE, false]]) {
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
  async prepare(actor, raw, signal) {
    onlyKeys(raw, ["request_id", "instruction", "object_id", "expected_revision", "idempotency_key"]);
    const instruction = aiText(raw.instruction, 2e3), objectId = aiText(raw.object_id, 80), requestId = aiText(raw.request_id, 80), key = aiText(raw.idempotency_key, 128);
    if (!Number.isSafeInteger(raw.expected_revision) || Number(raw.expected_revision) < 1) throw new AiError(422, "INPUT_INVALID");
    if (this.#closed || !this.llm || !this.tools || !this.routeAllowed || !this.config.provider || !this.config.model) throw new AiError(503, "MODEL_NOT_CONFIGURED");
    if (signal.aborted) throw new AiError(409, "CANCELLED");
    this.#sweep();
    if (this.#pending.has(requestId)) throw new AiError(409, "REQUEST_CONFLICT");
    if (this.#pending.size >= 4 || this.#prepared.size >= 100 || [...this.#pending.values()].some((p) => p.actor.userId === actor.userId)) throw new AiError(429, "REQUEST_LIMIT");
    const controller = new AbortController();
    this.#pending.set(requestId, { actor, controller });
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
      const prepared = { id: randomUUID(), requestId, actor, key, call, expiresAt: Date.now() + 12e4, state: "prepared" };
      this.#prepared.set(prepared.id, prepared);
      return { ...this.#view(prepared), usage: usage ?? null };
    } catch (error) {
      throw controller.signal.aborted ? controller.signal.reason : modelFailure(error);
    } finally {
      if (attempted) {
        const counts = usage;
        const input = counts?.inputTokens, output = counts?.outputTokens;
        const valid = (x) => x !== void 0 && Number.isFinite(x) && x >= 0;
        if (valid(input)) this.#inputTokens += input;
        if (valid(output)) this.#outputTokens += output;
        if (valid(input) && valid(output) && valid(this.config.inputUsdPerMillion) && valid(this.config.outputUsdPerMillion)) this.#estimatedUsd += (input * this.config.inputUsdPerMillion + output * this.config.outputUsdPerMillion) / 1e6;
        else this.#unknownCostCalls++;
      }
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
  cancel(actor, requestId) {
    const pending = this.#pending.get(requestId);
    if (pending && pending.actor.sessionId === actor.sessionId) pending.controller.abort(new AiError(409, "CANCELLED"));
    for (const item of this.#prepared.values()) if (item.requestId === requestId && item.actor.sessionId === actor.sessionId) {
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
  async execute(actor, actorNow, id, signal) {
    this.#sweep();
    const item = this.#prepared.get(id);
    if (this.#closed || !item || item.actor.sessionId !== actor.sessionId || item.actor.userId !== actor.userId) throw new AiError(404, "PREPARED_NOT_FOUND");
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
      const batch = await this.#scope.run({ actor, actorNow, key: item.key, call: item.call, onResult: (result2) => {
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
      if (!current || current.sessionId !== actor.sessionId || current.userId !== actor.userId || current.serviceId !== actor.serviceId) throw new AiError(401, "AUTH_REQUIRED");
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

// src/host/storage.ts
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash as createHash4, randomUUID as randomUUID5 } from "node:crypto";
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
  enqueue(actor, object, revision, key) {
    return this.tx((db, now) => {
      const current = this.revision(actor.sessionId, actor.userId, object, now);
      if (current === void 0) throw new JobError(404, "NOT_FOUND");
      const prior = db.prepare("SELECT id,object_id,expected_revision FROM jobs WHERE user_id=? AND idempotency_key=?").get(actor.userId, key);
      if (prior) {
        if (prior.object_id !== object || prior.expected_revision !== revision) throw new JobError(409, "IDEMPOTENCY_CONFLICT");
        return String(prior.id);
      }
      if (current !== revision) throw new JobError(409, "REVISION_CONFLICT");
      const id = randomUUID2();
      db.prepare("INSERT INTO jobs(id,user_id,session_id,object_id,expected_revision,idempotency_key,state,available_at) VALUES(?,?,?,?,?,?,'queued',?)").run(id, actor.userId, actor.sessionId, object, revision, key, now);
      return id;
    });
  }
  inspect(actor, id, cancel = false) {
    return this.tx((db, now) => {
      const row = db.prepare("SELECT * FROM jobs WHERE id=? AND user_id=?").get(id, actor.userId);
      if (!row || this.revision(actor.sessionId, actor.userId, row.object_id, now) === void 0) throw new JobError(404, "NOT_FOUND");
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

// src/host/authorization.ts
var AUTH_ACTIONS = ["read", "comment", "edit", "export", "manage_share", "delete", "review", "view_learning_records"];
function isGrantActive(grant, now) {
  return grant.revokedAt === void 0 && grant.validFrom <= now && (grant.expiresAt === void 0 || now < grant.expiresAt);
}
function authorize(actor, target, action, now, grants = [], memberships = []) {
  if (target.status !== "active" || target.serviceId !== actor.serviceId || target.spaceId !== actor.personalSpaceId && target.scope === "personal") return false;
  if (target.scope === "personal") return target.ownerUserId === actor.userId;
  if (target.projectId === void 0) return false;
  const member = memberships.some((item) => item.projectId === target.projectId && item.userId === actor.userId && isGrantActive(item, now));
  if (!member) return false;
  return grants.some((item) => item.subjectType === "user" && item.subjectId === actor.userId && item.action === action && isGrantActive(item, now)) || grants.some((item) => item.subjectType === "project" && item.subjectId === target.projectId && item.action === action && isGrantActive(item, now) && member);
}

// src/host/asset-store.ts
import { createHash as createHash3, randomUUID as randomUUID3 } from "node:crypto";
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
    const actor = this.current(prior, now);
    if (!actor) throw new AssetError(401, "AUTH_REQUIRED");
    return actor;
  }
  check(actor, id, action, now) {
    if (!this.allowed(actor, id, action, now)) throw new AssetError(404, "ASSET_NOT_FOUND");
  }
  publish(prior, spec, blob, format) {
    const text = format && "blocks" in format ? format : void 0;
    return this.tx("write", (db, now) => {
      const actor = this.actor(prior, now), digest = createHash3("sha256").update(JSON.stringify([spec.title, spec.assetId ?? null, spec.expectedVersion ?? null, blob.sha256, blob.byteLength, ...text ? [text.media, text.encoding] : format ? [format.media] : []])).digest("hex");
      const prev = db.prepare("SELECT id,asset_id,request_digest FROM asset_versions WHERE created_by=? AND idempotency_key=?").get(actor.userId, spec.key);
      if (prev) {
        this.check(actor, String(prev.asset_id), "read", now);
        this.check(actor, String(prev.asset_id), "edit", now);
        if (prev.request_digest !== digest) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { receipt: receipt(db.prepare(receiptSQL + "WHERE v.id=?").get(prev.id)), replayed: true };
      }
      const id = spec.assetId ?? randomUUID3(), vid = randomUUID3(), bid = randomUUID3();
      let version = 1, parent = null;
      if (spec.assetId) {
        this.check(actor, id, "read", now);
        this.check(actor, id, "edit", now);
        const last = db.prepare("SELECT id,version FROM asset_versions WHERE asset_id=? ORDER BY version DESC LIMIT 1").get(id);
        if (!last) throw new AssetError(404, "ASSET_NOT_FOUND");
        if (last.version !== spec.expectedVersion) throw new AssetError(409, "VERSION_CONFLICT");
        version = Number(last.version) + 1;
        parent = String(last.id);
        db.prepare("UPDATE knowledge_objects SET revision=revision+1,updated_at=? WHERE id=?").run(now, id);
        db.prepare("UPDATE office_conversions SET state='superseded',lease_token=NULL,lease_until=NULL,failure_code='SOURCE_CHANGED',updated_at=? WHERE version_id=? AND state IN ('queued','running')").run(now, parent);
      } else {
        db.prepare(`INSERT INTO knowledge_objects (id,service_id,space_id,scope_kind,project_id,owner_user_id,object_type,title,body,status,revision,created_at,updated_at) VALUES (?,?,?,'personal',NULL,?,'asset',?,'','active',1,?,?)`).run(id, actor.serviceId, actor.personalSpaceId, actor.userId, spec.title, now, now);
        db.prepare("INSERT INTO assets VALUES (?)").run(id);
      }
      db.prepare("INSERT INTO blobs VALUES (?,?,?,?,?)").run(bid, blob.key, blob.sha256, blob.byteLength, format?.media ?? "application/pdf");
      db.prepare("INSERT INTO asset_versions VALUES (?,?,?,?,?,?,?,?,?,?)").run(vid, id, version, parent, bid, spec.title, actor.userId, now, spec.key, digest);
      if (text) {
        db.prepare("INSERT INTO text_versions VALUES(?,?,?)").run(vid, text.encoding, text.blocks.length);
        const insert = db.prepare("INSERT INTO text_blocks VALUES(?,?,?,?,?,?,?)");
        text.blocks.forEach((b, i) => insert.run(vid, i + 1, b.kind, b.start, b.end, b.text, b.anchor));
      }
      return { receipt: { id, title: spec.title, version_id: vid, version, sha256: blob.sha256, byte_length: blob.byteLength, ...format ? { media_type: format.media } : {} }, replayed: false };
    });
  }
  list(prior) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now);
      return db.prepare(receiptSQL + `JOIN knowledge_objects o ON o.id=v.asset_id
      WHERE o.owner_user_id=? AND o.service_id=? AND o.status='active'
      ORDER BY v.created_at DESC,v.version DESC,v.id`).all(actor.userId, actor.serviceId).filter((v) => this.allowed(actor, String(v.id), "read", now)).map(receipt);
    });
  }
  original(prior, id, versionId, download) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now);
      this.check(actor, id, "read", now);
      if (download) this.check(actor, id, "export", now);
      const r = db.prepare("SELECT b.storage_key,b.sha256,b.byte_length,b.media_type,t.encoding FROM asset_versions v JOIN blobs b ON b.id=v.blob_id LEFT JOIN text_versions t ON t.version_id=v.id WHERE v.asset_id=? AND v.id=?").get(id, versionId);
      if (!r) throw new AssetError(404, "ASSET_NOT_FOUND");
      return { key: String(r.storage_key), sha256: String(r.sha256), byteLength: Number(r.byte_length), ...r.media_type === "application/pdf" ? {} : { media: String(r.media_type) }, ...typeof r.encoding === "string" ? { encoding: r.encoding } : {} };
    });
  }
  blocks(prior, id, v, from, limit) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now);
      this.check(actor, id, "read", now);
      if (!Number.isSafeInteger(from) || from < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new AssetError(422, "INVALID_BLOCK_RANGE");
      const meta = db.prepare("SELECT encoding,block_count AS total FROM text_versions t JOIN asset_versions a ON a.id=t.version_id WHERE a.asset_id=? AND a.id=?").get(id, v);
      if (!meta) throw new AssetError(404, "ASSET_NOT_FOUND");
      return { version_id: v, ...meta, blocks: db.prepare("SELECT ordinal,kind,start,end,text,anchor FROM text_blocks WHERE version_id=? AND ordinal>=? ORDER BY ordinal LIMIT ?").all(v, from, limit) };
    });
  }
};

// src/host/parse-store.ts
import { randomUUID as randomUUID4 } from "node:crypto";
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
  operation(actor, v) {
    const id = this.tx("read", (db, now) => {
      const r = db.prepare("SELECT v.asset_id FROM pdf_parse_runs r JOIN asset_versions v ON v.id=r.version_id WHERE r.version_id=?").get(v);
      if (!r || !this.permit(actor.sessionId, actor.userId, String(r.asset_id), false, now)) throw new AssetError(404, "ASSET_NOT_FOUND");
      return String(r.asset_id);
    });
    return this.control(actor, id, v, "status");
  }
  pages(actor, id, v, from, limit) {
    if (!Number.isSafeInteger(from) || from < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new AssetError(422, "INVALID_PAGE_RANGE");
    return this.tx("read", (db, now) => {
      if (!this.permit(actor.sessionId, actor.userId, id, false, now) || !this.pdfVersion(db, id, v)) throw new AssetError(404, "ASSET_NOT_FOUND");
      const rows = db.prepare(`SELECT page,state,chapter,error,CASE WHEN state IN ('ready','review') THEN text ELSE NULL END AS text
        FROM pdf_pages WHERE version_id=? AND page>=? ORDER BY page LIMIT ?`).all(v, from, limit);
      return { version_id: v, from, pages: rows };
    });
  }
  control(actor, id, v, op, page) {
    return this.tx(op === "status" ? "read" : "write", (db, now) => {
      if (!this.permit(actor.sessionId, actor.userId, id, op !== "status", now) || !this.pdfVersion(db, id, v)) throw new AssetError(404, "ASSET_NOT_FOUND");
      const prev = db.prepare("SELECT state FROM pdf_parse_runs WHERE version_id=?").get(v);
      if (op === "start") {
        if (!prev) db.prepare("INSERT INTO pdf_parse_runs(version_id,session_id,user_id,state) VALUES(?,?,?,'queued')").run(v, actor.sessionId, actor.userId);
        else if (["failed", "cancelled"].includes(String(prev.state))) {
          db.prepare("UPDATE pdf_parse_runs SET session_id=?,user_id=?,state='queued',error=NULL,losses=0 WHERE version_id=?").run(actor.sessionId, actor.userId, v);
        }
      } else if (op === "cancel") {
        if (!prev || !["running", "queued", "cancelled"].includes(String(prev.state))) throw new AssetError(409, "PARSE_NOT_ACTIVE");
        db.prepare("UPDATE pdf_parse_runs SET state='cancelled',token=NULL,deadline=NULL,error='CANCELLED' WHERE version_id=?").run(v);
      } else if (op === "retry") {
        if (!prev || prev.state !== "partial" || !page || !db.prepare("UPDATE pdf_pages SET state='pending',error=NULL WHERE version_id=? AND page=? AND state IN ('failed','review')").run(v, page).changes) throw new AssetError(409, "PAGE_NOT_RETRYABLE");
        db.prepare("UPDATE pdf_parse_runs SET state='queued',session_id=?,user_id=?,error=NULL,losses=0 WHERE version_id=?").run(actor.sessionId, actor.userId, v);
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
      const token = randomUUID4();
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

// src/host/storage.ts
var APPLICATION_ID = 1263489841;
var SCHEMA_VERSION = 10;
var MIGRATION_V10_CHECKSUM = createHash4("sha256").update(OFFICE_SCHEMA).digest("hex");
var MIGRATION_V9_CHECKSUM = createHash4("sha256").update(TEXT_SCHEMA).digest("hex");
var MIGRATION_V8_CHECKSUM = createHash4("sha256").update(PARSE_SCHEMA).digest("hex");
var MIGRATION_V7_CHECKSUM = createHash4("sha256").update(ASSET_SCHEMA).digest("hex");
var MIGRATION_V6_CHECKSUM = createHash4("sha256").update(JOB_SCHEMA).digest("hex");
var PROBE_SCHEMA_VERSION = 1;
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
var MIGRATION_V2 = { version: 2, sql: MIGRATION_V2_SQL, checksum: MIGRATION_V2_CHECKSUM };
var MIGRATION_V3 = { version: 3, sql: MIGRATION_V3_SQL, checksum: MIGRATION_V3_CHECKSUM };
var MIGRATION_V4 = { version: 4, sql: MIGRATION_V4_SQL, checksum: MIGRATION_V4_CHECKSUM };
var MIGRATION_V5 = { version: 5, sql: MIGRATION_V5_SQL, checksum: MIGRATION_V5_CHECKSUM };
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
  assets = new AssetStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (actor, id, action, now) => Boolean(this.authorizeObject(actor, id, action, now)));
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
    const actor = ref && this.findActor(String(ref.token_hash), now);
    return actor && this.authorizeObject(actor, object, "read", now)?.revision;
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
      if (!["v6", "v7", "v8", "v9", "v10"].includes(existing)) {
        if (existing !== "v5") this.#migrateV5(db);
        this.#migrateV6(db);
      }
      if (!["v7", "v8", "v9", "v10"].includes(existing)) this.#migrateV7(db);
      if (!["v8", "v9", "v10"].includes(existing)) this.#migrateV8(db);
      if (!["v9", "v10"].includes(existing)) this.#migrateV9(db);
      if (existing !== "v10") this.#migrateV10(db);
      this.#verify(db, 10);
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
    if (facts.userVersion === 6 || facts.userVersion === 7 || facts.userVersion === 8 || facts.userVersion === 9 || facts.userVersion === 10) {
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
      db.prepare("INSERT INTO service_identity (id, service_id, bootstrap_admin_user_id, initialized_at) VALUES (1, ?, NULL, NULL)").run(randomUUID5());
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
  #verify(db, version) {
    const facts = readDatabaseFacts(this.databasePath);
    const checks = [MIGRATION_V6_CHECKSUM, MIGRATION_V7_CHECKSUM, MIGRATION_V8_CHECKSUM, MIGRATION_V9_CHECKSUM, MIGRATION_V10_CHECKSUM].slice(0, version - 5);
    if (facts.applicationId !== APPLICATION_ID || facts.userVersion !== version || facts.ledger.length !== version || checks.some((hash, i) => facts.ledger[i + 5]?.version !== i + 6 || facts.ledger[i + 5]?.checksum !== hash)) throw new RecordsError("STORAGE_INCOMPATIBLE", "database ownership/version verification failed");
    const reference = new DatabaseSync(":memory:");
    try {
      reference.exec(JOB_SCHEMA);
      if (version >= 7) reference.exec(ASSET_SCHEMA);
      if (version >= 8) reference.exec(PARSE_SCHEMA);
      if (version >= 9) reference.exec(TEXT_SCHEMA);
      if (version >= 10) reference.exec(OFFICE_SCHEMA);
      const definitions = reference.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
      for (const { name, sql } of definitions) {
        if (db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(name)?.sql !== sql) throw new RecordsError("STORAGE_INCOMPATIBLE", "jobs schema definition mismatch");
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
      const userId = randomUUID5();
      const spaceId = randomUUID5();
      const credentialId = randomUUID5();
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
      const userId = randomUUID5();
      const spaceId = randomUUID5();
      const credentialId = randomUUID5();
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
  authorizeObject(actor, objectId, action, now) {
    const db = this.#ensureReady();
    const object = this.#loadObject(objectId);
    if (object === void 0) return void 0;
    const allowed = authorize(actor, this.#objectTarget(object), action, now, this.#grants(db, object.id), object.projectId === void 0 ? [] : this.#memberships(db, object.projectId));
    return allowed ? object : void 0;
  }
  listObjects(actor, action, now) {
    const db = this.#ensureReady();
    const rows = db.prepare("SELECT id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at FROM knowledge_objects WHERE service_id = ? AND status = 'active' ORDER BY created_at, id").all(actor.serviceId);
    return rows.map((row) => this.#objectRow(row)).filter((object) => authorize(actor, this.#objectTarget(object), action, now, this.#grants(db, object.id), object.projectId === void 0 ? [] : this.#memberships(db, object.projectId)));
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
  canManageProject(actor, projectId) {
    const row = this.#ensureReady().prepare("SELECT service_id, owner_user_id, status FROM knowledge_projects WHERE id = ?").get(projectId);
    return row !== void 0 && String(row.service_id) === actor.serviceId && String(row.owner_user_id) === actor.userId && String(row.status) === "active";
  }
  canCreateProjectObject(actor, projectId, now) {
    const db = this.#ensureReady();
    const project = db.prepare("SELECT service_id, status FROM knowledge_projects WHERE id = ?").get(projectId);
    if (project === void 0 || String(project.service_id) !== actor.serviceId || String(project.status) !== "active") return false;
    return this.#memberships(db, projectId).some((item) => item.userId === actor.userId && isGrantActive(item, now));
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
        for (const action of ["read", "comment", "edit", "export", "manage_share", "delete", "review", "view_learning_records"]) db.prepare("INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, created_at) VALUES (?, ?, 'knowledge_object', ?, 'user', ?, ?, ?, ?)").run(randomUUID5(), input.serviceId, input.id, input.ownerUserId, action, input.now, input.now);
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
  updateObject(actor, objectId, expectedRevision, patch, now) {
    const db = this.#ensureReady();
    const current = this.authorizeObject(actor, objectId, "edit", now);
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
  mutateObjectOnce(actor, input, now) {
    const db = this.#ensureReady();
    let tx = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      tx = true;
      now = (/* @__PURE__ */ new Date()).toISOString();
      const session = db.prepare(`SELECT s.id FROM auth_sessions s JOIN users u ON u.id = s.user_id JOIN spaces p ON p.owner_user_id = u.id WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active' AND p.status = 'active' AND p.id = ? AND u.planning_home_service_id = ?`).get(actor.sessionId, actor.userId, now, actor.personalSpaceId, actor.serviceId);
      const finish = (value) => {
        db.exec("COMMIT");
        tx = false;
        return value;
      };
      if (session === void 0) return finish({ kind: "session_expired" });
      const current = this.authorizeObject(actor, input.objectId, "edit", now);
      if (current === void 0 || this.authorizeObject(actor, input.objectId, "read", now) === void 0) return finish({ kind: "not_found" });
      const receipt2 = db.prepare("SELECT request_digest, result_json FROM ai_tool_mutations WHERE service_id = ? AND user_id = ? AND idempotency_key = ?").get(actor.serviceId, actor.userId, input.key);
      if (receipt2 !== void 0) return finish(receipt2.request_digest === input.digest ? { kind: "replayed", object: JSON.parse(receipt2.result_json) } : { kind: "idempotency_conflict" });
      if (current.revision !== input.expectedRevision) return finish({ kind: "conflict" });
      const changed = db.prepare("UPDATE knowledge_objects SET title = ?, body = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = 'active'").run(input.title ?? current.title, input.body ?? current.body, now, input.objectId, input.expectedRevision);
      if (Number(changed.changes) !== 1) return finish({ kind: "conflict" });
      this.#injectFailure("ai:after-update");
      const object = this.#loadObject(input.objectId);
      db.prepare("INSERT INTO ai_tool_mutations (service_id, user_id, idempotency_key, request_digest, object_id, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(actor.serviceId, actor.userId, input.key, input.digest, input.objectId, JSON.stringify(object), now);
      return finish({ kind: "updated", object });
    } catch (error) {
      if (tx && !this.#rollback(db)) throw new RecordsError("STORAGE_UNAVAILABLE", "storage transaction state is unknown", false, { cause: error });
      throw this.#mapError(error);
    }
  }
  deleteObject(actor, objectId, now) {
    const object = this.authorizeObject(actor, objectId, "delete", now);
    if (object === void 0) return false;
    const result = this.#ensureReady().prepare("UPDATE knowledge_objects SET status = 'deleted', revision = revision + 1, updated_at = ? WHERE id = ? AND status = 'active'").run(now, objectId);
    return Number(result.changes) === 1;
  }
  grantObject(actor, input) {
    const db = this.#ensureReady();
    const object = this.authorizeObject(actor, input.objectId, "manage_share", input.now);
    if (object === void 0 || input.serviceId !== actor.serviceId) return void 0;
    if (input.subjectType === "project") {
      const project = db.prepare("SELECT service_id, status FROM knowledge_projects WHERE id = ?").get(input.subjectId);
      if (project === void 0 || String(project.service_id) !== actor.serviceId || String(project.status) !== "active") return void 0;
    } else {
      const user = db.prepare("SELECT planning_home_service_id, status FROM users WHERE id = ?").get(input.subjectId);
      if (user === void 0 || String(user.planning_home_service_id) !== actor.serviceId || String(user.status) !== "active") return void 0;
    }
    try {
      db.prepare("INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, expires_at, created_at) VALUES (?, ?, 'knowledge_object', ?, ?, ?, ?, ?, ?, ?)").run(input.id, input.serviceId, input.objectId, input.subjectType, input.subjectId, input.action, input.validFrom, input.expiresAt ?? null, input.now);
      return { id: input.id, serviceId: input.serviceId, resourceType: "knowledge_object", resourceId: input.objectId, subjectType: input.subjectType, subjectId: input.subjectId, action: input.action, validFrom: input.validFrom, expiresAt: input.expiresAt, createdAt: input.now };
    } catch (error) {
      throw this.#mapError(error);
    }
  }
  revokeGrant(actor, grantId, now) {
    const db = this.#ensureReady();
    const grant = db.prepare("SELECT resource_id, service_id, revoked_at FROM resource_grants WHERE id = ?").get(grantId);
    if (grant?.resource_id === void 0 || grant.service_id !== actor.serviceId || grant.revoked_at !== null || this.authorizeObject(actor, String(grant.resource_id), "manage_share", now) === void 0) return false;
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
import { createHash as createHash5, randomBytes, randomUUID as randomUUID6, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
var DOMAINS = ["software_engineering", "system_architecture", "hardware_engineering", "ai_development"];
var LEARNING_TRACKS = ["engineering_practice", "architecture_exam", "knowledge_accumulation"];
var DEFAULT_TIMEZONE = "Asia/Shanghai";
var SESSION_TTL_MS = 12 * 60 * 60 * 1e3;
var MAX_REQUEST_BODY_BYTES = 16 * 1024;
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
    this.#store.createSession({ sessionId: randomUUID6(), userId: lookup.userId, tokenHash: tokenHash(token), createdAt: createdAt.toISOString(), expiresAt, revokeTokenHash: input.oldToken ? tokenHash(input.oldToken) : void 0 });
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
import { createHash as createHash6, randomUUID as randomUUID7 } from "node:crypto";
import { isIP } from "node:net";
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
export {
  APPLICATION_ID,
  AUTH_ACTIONS,
  AiError,
  AiService,
  AuthRateLimiter,
  BUSY_TIMEOUT_MS,
  DATABASE_FILENAME,
  IdentityError,
  IdentityService,
  KdfScheduler,
  MIGRATION_V1,
  MIGRATION_V1_CHECKSUM,
  MIGRATION_V1_SQL,
  MIGRATION_V2,
  MIGRATION_V2_CHECKSUM,
  MIGRATION_V2_SQL,
  MIGRATION_V3,
  MIGRATION_V3_CHECKSUM,
  MIGRATION_V3_SQL,
  MIGRATION_V4,
  MIGRATION_V4_CHECKSUM,
  MIGRATION_V4_SQL,
  MIGRATION_V5,
  MIGRATION_V5_CHECKSUM,
  MIGRATION_V5_SQL,
  PROBE_SCHEMA_VERSION,
  PROBE_SUPPORTED_TABLES,
  MIGRATION_V1 as PRODUCTION_MIGRATION,
  ProbeStorage,
  RecordsError,
  SCHEMA_VERSION,
  authorize,
  contentDigest,
  createProbeRecord,
  derivePassword,
  getProbeRecord,
  isGrantActive,
  isIdentityRuntimeAvailable,
  isLoopbackAddress,
  modelFailure,
  readDatabaseFacts,
  runBusinessTool,
  tokenHash,
  toolArguments,
  toolDigest,
  validateDomains,
  validateLearningTracks,
  validateLoginName,
  validatePassword
};
