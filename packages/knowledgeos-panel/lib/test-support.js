// src/host/ai-service.ts
import { randomUUID as randomUUID2 } from "node:crypto";
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
  const args2 = raw;
  onlyKeys(args2, call.name === TOOL_NAMES[0] ? ["object_id"] : ["object_id", "expected_revision", "title", "body"]);
  const object_id = aiText(args2.object_id, 80);
  if (call.name === TOOL_NAMES[0]) return { object_id };
  if (!Number.isSafeInteger(args2.expected_revision) || Number(args2.expected_revision) < 1 || args2.title === void 0 && args2.body === void 0) throw new AiError(422, "MODEL_OUTPUT_INVALID");
  return { object_id, expected_revision: Number(args2.expected_revision), ...args2.title === void 0 ? {} : { title: aiText(args2.title, 200) }, ...args2.body === void 0 ? {} : { body: aiText(args2.body, 2e3, true) } };
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

// src/host/asset-store.ts
import { createHash as createHash3, randomUUID } from "node:crypto";
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
  publish(prior, spec, blob, format, onPublish) {
    const text2 = format && "blocks" in format ? format : void 0;
    return this.tx("write", (db, now) => {
      const actor = this.actor(prior, now), digest3 = createHash3("sha256").update(JSON.stringify([spec.title, spec.assetId ?? null, spec.expectedVersion ?? null, blob.sha256, blob.byteLength, ...text2 ? [text2.media, text2.encoding] : format ? [format.media] : []])).digest("hex");
      const prev = db.prepare("SELECT id,asset_id,request_digest FROM asset_versions WHERE created_by=? AND idempotency_key=?").get(actor.userId, spec.key);
      if (prev) {
        this.check(actor, String(prev.asset_id), "read", now);
        this.check(actor, String(prev.asset_id), "edit", now);
        if (prev.request_digest !== digest3) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        const r = receipt(db.prepare(receiptSQL + "WHERE v.id=?").get(prev.id));
        onPublish?.(db, actor, r);
        return { receipt: r, replayed: true };
      }
      const id = spec.assetId ?? randomUUID(), vid = randomUUID(), bid = randomUUID();
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
      db.prepare("INSERT INTO asset_versions VALUES (?,?,?,?,?,?,?,?,?,?)").run(vid, id, version, parent, bid, spec.title, actor.userId, now, spec.key, digest3);
      if (text2) {
        db.prepare("INSERT INTO text_versions VALUES(?,?,?)").run(vid, text2.encoding, text2.blocks.length);
        const insert = db.prepare("INSERT INTO text_blocks VALUES(?,?,?,?,?,?,?)");
        text2.blocks.forEach((b, i) => insert.run(vid, i + 1, b.kind, b.start, b.end, b.text, b.anchor));
      }
      const published = { id, title: spec.title, version_id: vid, version, sha256: blob.sha256, byte_length: blob.byteLength, ...format ? { media_type: format.media } : {} };
      onPublish?.(db, actor, published);
      return { receipt: published, replayed: false };
    });
  }
  list(prior) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now);
      return db.prepare(receiptSQL + `JOIN knowledge_objects o ON o.id=v.asset_id
      WHERE o.service_id=? AND o.status='active' AND (o.owner_user_id=? OR EXISTS(
        SELECT 1 FROM invitations i JOIN invitation_redemptions r ON r.invitation_id=i.id
        WHERE i.object_id=o.id AND i.service_id=o.service_id AND r.user_id=? AND i.revoked_at IS NULL
          AND r.revoked_at IS NULL AND r.expires_at=i.expires_at AND r.expires_at>?))
      ORDER BY v.created_at DESC,v.version DESC,v.id`).all(actor.serviceId, actor.userId, actor.userId, now).filter((v) => this.allowed(actor, String(v.id), "read", now)).map(receipt);
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
      execute: async (args2, exec) => {
        const bound = this.#scope.getStore();
        if (!bound || bound.call.id !== exec.callId || bound.call.name !== exec.name) return { ok: false, status: 403, code: "TOOL_CONTEXT_REQUIRED" };
        try {
          if (exec.signal.aborted) throw new AiError(409, "CANCELLED");
          const current = bound.actorNow();
          if (!current || current.sessionId !== bound.actor.sessionId || current.userId !== bound.actor.userId || current.serviceId !== bound.actor.serviceId) throw new AiError(401, "AUTH_REQUIRED");
          const call = { id: exec.callId, name: exec.name, arguments: JSON.stringify(args2) };
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
    if (!this.tools) throw new AiError(503, "MODEL_NOT_CONFIGURED");
    this.#sweep();
    if (this.#prepared.size >= 100) throw new AiError(429, "REQUEST_LIMIT");
    const userText = JSON.stringify({ instruction, target_object_id: objectId, expected_revision: raw.expected_revision });
    const { calls, finish, usage } = await this.#infer(actor, requestId, SYSTEM, userText, signal, TOOL_SCHEMAS);
    if (finish !== "tool-calls" || calls.length !== 1) throw new AiError(502, "MODEL_OUTPUT_INVALID");
    const call = calls[0], args2 = toolArguments(call);
    if (args2.object_id !== objectId || call.name === TOOL_NAMES[1] && args2.expected_revision !== raw.expected_revision) throw new AiError(422, "MODEL_TARGET_MISMATCH");
    const prepared = { id: randomUUID2(), requestId, actor, key, call, expiresAt: Date.now() + 12e4, state: "prepared" };
    if (this.#closed || signal.aborted) throw new AiError(409, "CANCELLED");
    this.#prepared.set(prepared.id, prepared);
    return { ...this.#view(prepared), usage: usage ?? null };
  }
  async explainSelection(actor, system, userText, signal, authorize2) {
    const { text: text2, calls, finish } = await this.#infer(actor, randomUUID2(), system, userText, signal, [], authorize2);
    if (finish === "max-tokens") throw new AiError(502, "MODEL_OUTPUT_TRUNCATED");
    if (calls.length !== 0 || finish === "tool-calls") throw new AiError(502, "MODEL_OUTPUT_INVALID");
    if (finish !== "stop") throw new AiError(502, "MODEL_OUTPUT_INCOMPLETE");
    if (!text2.trim()) throw new AiError(502, "MODEL_OUTPUT_EMPTY");
    if (Buffer.byteLength(text2) > 12e3) throw new AiError(502, "MODEL_OUTPUT_INVALID");
    return { text: text2, provider: this.config.provider, model: this.config.model };
  }
  async #infer(actor, requestId, system, userText, signal, tools, authorize2) {
    if (this.#closed || !this.llm || !this.routeAllowed || !this.config.provider || !this.config.model) throw new AiError(503, "MODEL_NOT_CONFIGURED");
    if (signal.aborted) throw new AiError(409, "CANCELLED");
    if (this.#pending.has(requestId)) throw new AiError(409, "REQUEST_CONFLICT");
    if (this.#pending.size >= 4 || [...this.#pending.values()].some((p) => p.actor.userId === actor.userId)) throw new AiError(429, "REQUEST_LIMIT");
    const controller = new AbortController();
    this.#pending.set(requestId, { actor, controller });
    const onAbort = () => controller.abort(new AiError(409, "CANCELLED"));
    signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new AiError(504, "MODEL_TIMEOUT")), this.config.timeoutMs ?? 3e4);
    let usage;
    let attempted = false;
    try {
      const available2 = this.llm.listProviders().some((p) => p.id === this.config.provider);
      if (!available2) throw new AiError(503, "MODEL_NOT_CONFIGURED");
      const catalog = await this.#abortable(this.llm.listModels(this.config.provider), controller.signal);
      if (catalog.length > 0 && !catalog.some((m) => m.id === this.config.model)) throw new AiError(404, "MODEL_NOT_FOUND");
      const info = tools.length === 0 && this.llm.resolveModelInfo ? await this.#abortable(this.llm.resolveModelInfo(this.config.provider, this.config.model, controller.signal), controller.signal) : void 0;
      const canDisableThinking = info?.reasoning?.efforts.some((effort) => effort.id === "off") === true;
      const maxExplanationTokens = Math.min(1536, info?.defaultMaxTokens ?? 1536);
      authorize2?.();
      controller.signal.throwIfAborted();
      this.#calls++;
      attempted = true;
      const calls = [];
      let finish, outputBytes = 0, text2 = "", streamDone = false;
      const stream = this.llm.stream({
        provider: this.config.provider,
        model: this.config.model,
        system,
        messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
        tools,
        signal: controller.signal,
        ...tools.length ? {} : { maxTokens: maxExplanationTokens },
        ...canDisableThinking ? { reasoningEffort: "off" } : {}
      })[Symbol.asyncIterator]();
      try {
        while (true) {
          const next = await this.#abortable(stream.next(), controller.signal);
          if (next.done) {
            streamDone = true;
            break;
          }
          const chunk = next.value;
          outputBytes += Buffer.byteLength(JSON.stringify(chunk), "utf8");
          if (outputBytes > 96e3 || finish !== void 0) throw new AiError(502, "MODEL_OUTPUT_INVALID");
          if (chunk.type === "block-end" && chunk.block?.type === "tool-call") {
            const b = chunk.block;
            if (!b.id || !b.name || typeof b.arguments !== "string") throw new AiError(502, "MODEL_OUTPUT_INVALID");
            calls.push({ id: b.id, name: b.name, arguments: b.arguments });
          }
          if (chunk.type === "block-end" && chunk.block?.type === "text" && typeof chunk.block.text === "string") text2 += chunk.block.text;
          if (chunk.type === "usage") usage = chunk.usage;
          if (chunk.type === "finish") {
            finish = chunk.reason?.kind;
            if (controller.signal.aborted) throw controller.signal.reason;
            if (finish === "error" || finish === "aborted") throw modelFailure(chunk.reason?.failure);
          }
        }
      } finally {
        if (!streamDone) void stream.return?.().catch(() => {
        });
      }
      if (controller.signal.aborted) throw controller.signal.reason;
      return { finish, calls, text: text2, usage };
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error instanceof AssetError) throw error;
      throw modelFailure(error);
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
import { createHash as createHash19, randomUUID as randomUUID19 } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

// src/host/jobs.ts
import { randomUUID as randomUUID3 } from "node:crypto";
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
      const id = randomUUID3();
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
      const token2 = randomUUID3();
      db.prepare("UPDATE jobs SET state='running',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?").run(token2, now + 3e3, row.id);
      db.prepare("INSERT INTO job_runs(job_id,attempt,worker,started_at,start_checkpoint) VALUES(?,?,?,?,?)").run(row.id, row.attempts + 1, worker, now, row.checkpoint);
      return { id: row.id, token: token2, checkpoint: row.checkpoint };
    });
  }
  renew(token2) {
    return this.tx((db, now) => db.prepare("UPDATE jobs SET lease_until=? WHERE state='running' AND lease_token=? AND lease_until>?").run(now + 3e3, token2, now).changes === 1);
  }
  step(token2) {
    return this.tx((db, now) => {
      const row = db.prepare("SELECT * FROM jobs WHERE state='running' AND lease_token=? AND lease_until>?").get(token2, now);
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
      db.prepare("INSERT INTO outbox(event_id,job_id,created_at) VALUES(?,?,?)").run(randomUUID3(), row.id, now);
      this.fault("job:after-outbox");
      this.end(db, row, "succeeded", null, now);
      return "succeeded";
    });
  }
  retry(token2) {
    this.tx((db, now) => {
      const row = db.prepare("SELECT * FROM jobs WHERE lease_token=? AND lease_until>?").get(token2, now);
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
function horizon(rows, now) {
  let latest;
  for (const row of rows) {
    if (!isGrantActive(row, now)) continue;
    if (row.expiresAt === void 0) return null;
    if (latest === void 0 || row.expiresAt > latest) latest = row.expiresAt;
  }
  return latest;
}
function authorizationHorizon(actor, target2, action, now, grants = [], memberships = [], documentInvitations = []) {
  if (target2.status !== "active" || target2.serviceId !== actor.serviceId) return;
  const invited = action === "read" || action === "edit" ? documentInvitations.filter((item) => item.subjectType === "user" && item.subjectId === actor.userId && item.action === action) : [];
  if (target2.scope === "personal") return target2.spaceId === actor.personalSpaceId && target2.ownerUserId === actor.userId ? null : horizon(invited, now);
  if (target2.projectId === void 0) return;
  const member = horizon(memberships.filter((item) => item.projectId === target2.projectId && item.userId === actor.userId), now);
  if (member === void 0) return;
  const grant = horizon([...invited, ...grants.filter((item) => item.action === action && (item.subjectType === "user" && item.subjectId === actor.userId || item.subjectType === "project" && item.subjectId === target2.projectId))], now);
  if (grant === void 0) return;
  if (member === null) return grant;
  if (grant === null) return member;
  return grant < member ? grant : member;
}
function authorize(...args2) {
  return authorizationHorizon(...args2) !== void 0;
}

// src/host/search-store.ts
import { createHash as createHash4, randomUUID as randomUUID4 } from "node:crypto";

// src/host/search-lexical.ts
var segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
var token = /[\p{L}\p{N}\p{M}_]+(?:[.:/+\-]+[\p{L}\p{N}\p{M}_]+)*(?:\+\+|#)?/gu;
var bilingual = [
  ["deadlock", "\u6B7B\u9501"],
  ["mutex", "\u4E92\u65A5\u9501"],
  ["rollback", "\u56DE\u6EDA"],
  ["\u5B58\u53D6\u63A7\u5236\u6E05\u5355", "\u8BBF\u95EE\u63A7\u5236\u5217\u8868"]
];
var aliases = new Map(bilingual.flatMap(([a, b]) => [[a, [a, b]], [b, [b, a]]]));
var normalize = (s) => s.normalize("NFKC").toLowerCase();
function compileSearchQuery(raw) {
  if (raw.length > 256 || Array.from(raw).length > 128) throw new Error("INVALID_SEARCH_QUERY");
  const value = normalize(raw).trim().replace(/\(\)$/, "");
  const terms = [...new Set(value.match(token) ?? [])];
  if (!terms.length || terms.length > 12) throw new Error("INVALID_SEARCH_QUERY");
  return { terms: terms.map((term) => aliases.get(term) ?? [term]), phrase: value, normalized: terms.join(" ") };
}
function indexSearchText(source) {
  const parts = [], ranges = [];
  for (const { segment: segment2, index } of segmenter.segment(source)) {
    const value = normalize(segment2);
    parts.push(value);
    const range = { start: index, end: index + segment2.length };
    for (let i = 0; i < value.length; i++) ranges.push(range);
  }
  return { normalized: parts.join(""), ranges };
}
function matchSearchText(index, query) {
  const range = (at, length, score2) => ({ start: index.ranges[at].start, end: index.ranges[at + length - 1].end, score: score2 });
  const exact = index.normalized.indexOf(query.phrase);
  if (exact !== -1) return range(exact, query.phrase.length, 20 + 2 * query.terms.length);
  let first, score = 0;
  for (const variants of query.terms) {
    let found;
    for (const [i, text2] of variants.entries()) {
      const at = index.normalized.indexOf(text2);
      if (at !== -1) {
        found = range(at, text2.length, i === 0 ? 2 : 1);
        break;
      }
    }
    if (!found) return null;
    first ??= found;
    score += found.score;
  }
  return first ? { start: first.start, end: first.end, score } : null;
}

// src/host/search-store.ts
var SEARCH_SCHEMA = `CREATE TABLE search_queries (
  query_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), scope_filter TEXT NOT NULL,
  normalized_query TEXT NOT NULL, index_version TEXT NOT NULL, result_source_versions TEXT NOT NULL,
  ranking_inputs TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE INDEX search_queries_actor ON search_queries(actor_id,created_at);`;
var indexVersion = "lexical-nfkc-v2";
var maxWork = 4 * 1024 * 1024;
var maxSources = 2e4;
var maxResults = 30;
var maxCache = 256e3;
var sha = (text2) => createHash4("sha256").update(text2, "utf8").digest("hex");
var sourceSQL = `SELECT v.asset_id AS asset_id,v.id AS version_id,v.version,v.original_name AS title,
    p.page AS ordinal,p.chapter AS chapter,'pdf' AS kind,p.state AS state,p.text AS text,NULL AS conversion_id
  FROM asset_versions v JOIN pdf_pages p ON v.id=p.version_id WHERE v.asset_id IN (SELECT value FROM json_each(?))
    AND p.state IN ('ready','review') AND length(p.text)>0
  UNION ALL
  SELECT v.asset_id,v.id,v.version,v.original_name,b.ordinal,b.kind,'text','ready',b.text,NULL
  FROM asset_versions v JOIN text_blocks b ON v.id=b.version_id WHERE v.asset_id IN (SELECT value FROM json_each(?)) AND length(b.text)>0
  UNION ALL
  SELECT v.asset_id,v.id,v.version,v.original_name,p.page,'','office','ready',p.text,c.id
  FROM asset_versions v JOIN office_conversions c ON c.version_id=v.id JOIN word_search_runs r
    ON r.conversion_id=c.id AND r.result_blob_id=c.result_blob_id JOIN word_search_pages p ON p.conversion_id=c.id
  WHERE v.asset_id IN (SELECT value FROM json_each(?)) AND c.state='ready' AND p.page<=c.page_count`;
var SearchStore = class {
  constructor(tx, current, allowed) {
    this.tx = tx;
    this.current = current;
    this.allowed = allowed;
  }
  cache = /* @__PURE__ */ new Map();
  weight = 0;
  actor(a, now) {
    const current = this.current(a, now);
    if (!current) throw new AssetError(401, "AUTH_REQUIRED");
    return current;
  }
  indexed(hash4, text2) {
    const hit = this.cache.get(hash4);
    if (hit) {
      this.cache.delete(hash4);
      this.cache.set(hash4, hit);
      return hit.index;
    }
    const index = indexSearchText(text2), weight = index.ranges.length;
    if (weight > maxCache) return index;
    while (this.weight + weight > maxCache) {
      const key = this.cache.keys().next().value;
      this.weight -= this.cache.get(key).weight;
      this.cache.delete(key);
    }
    this.cache.set(hash4, { index, weight });
    this.weight += weight;
    return index;
  }
  search(prior, raw) {
    let query;
    try {
      query = compileSearchQuery(raw);
    } catch {
      throw new AssetError(422, "INVALID_SEARCH_QUERY");
    }
    const candidates = this.tx("read", (db, now) => {
      const a = this.actor(prior, now);
      const ids = db.prepare(`SELECT a.id FROM assets a JOIN knowledge_objects o ON a.id=o.id WHERE o.service_id=? AND o.status='active'`).all(a.serviceId).map((r) => String(r.id)).filter((id) => this.allowed(a, id, now));
      const bound = JSON.stringify(ids), results = [];
      let work = 0, sources2 = 0;
      for (const row of db.prepare(sourceSQL).iterate(bound, bound, bound)) {
        const { text: text2, conversion_id, ...source } = row;
        work += text2.length;
        if (work > maxWork || ++sources2 > maxSources) throw new AssetError(503, "SEARCH_WORK_LIMIT");
        const source_hash = sha(text2), match = matchSearchText(this.indexed(source_hash, text2), query);
        if (!match) continue;
        const from = Math.max(0, match.start - 70), to = Math.min(text2.length, match.end + 70);
        const snippet = text2.slice(from, to).replace(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/g, "");
        results.push({ ...source, ...conversion_id ? { conversion_id } : {}, ...match, source_hash, quote: text2.slice(match.start, match.end), snippet });
      }
      return results.sort((a2, b) => b.score - a2.score || a2.title.localeCompare(b.title, "zh-CN") || a2.asset_id.localeCompare(b.asset_id) || b.version - a2.version || a2.ordinal - b.ordinal || (a2.conversion_id ?? "").localeCompare(b.conversion_id ?? ""));
    });
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now), decisions = /* @__PURE__ */ new Map();
      const items = [];
      for (const item of candidates) {
        if (!decisions.has(item.asset_id)) decisions.set(item.asset_id, this.allowed(a, item.asset_id, now));
        if (!decisions.get(item.asset_id) || !this.unchanged(db, item)) continue;
        items.push(item);
        if (items.length === maxResults) break;
      }
      const query_id = randomUUID4(), scope_filter = "readable_parsed_assets";
      db.prepare("INSERT INTO search_queries VALUES(?,?,?,?,?,?,?,?)").run(
        query_id,
        a.userId,
        scope_filter,
        query.normalized,
        indexVersion,
        JSON.stringify([...new Set(items.map((i) => i.version_id))]),
        JSON.stringify(items.map(({ asset_id, version_id, ordinal, source_hash, kind, state, start, end, score, conversion_id }) => ({ asset_id, version_id, ordinal, source_hash, kind, state, start, end, score, conversion_id }))),
        now
      );
      return { query_id, actor_id: a.userId, count: items.length, items };
    });
  }
  revalidate(prior, queryId) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), row = db.prepare("SELECT ranking_inputs FROM search_queries WHERE query_id=? AND actor_id=?").get(queryId, a.userId);
      if (!row) throw new AssetError(404, "SEARCH_UNAVAILABLE");
      const sources2 = JSON.parse(String(row.ranking_inputs));
      if (sources2.some((s) => !this.allowed(a, s.asset_id, now) || !this.unchanged(db, s))) throw new AssetError(404, "SEARCH_UNAVAILABLE");
      return { actor_id: a.userId, query_id: queryId };
    });
  }
  unchanged(db, item) {
    const source = item.kind === "office" ? db.prepare(`SELECT p.text,c.state FROM office_conversions c JOIN asset_versions v ON v.id=c.version_id
      JOIN word_search_runs r ON r.conversion_id=c.id AND r.result_blob_id=c.result_blob_id JOIN word_search_pages p ON p.conversion_id=c.id
      WHERE v.asset_id=? AND v.id=? AND p.page=? AND c.id=? AND p.page<=c.page_count`).get(item.asset_id, item.version_id, item.ordinal, item.conversion_id ?? null) : item.kind === "pdf" ? db.prepare(`SELECT p.text,p.state FROM pdf_pages p JOIN asset_versions v ON v.id=p.version_id
      WHERE v.asset_id=? AND v.id=? AND p.page=?`).get(item.asset_id, item.version_id, item.ordinal) : db.prepare(`SELECT b.text,'ready' AS state FROM text_blocks b JOIN asset_versions v ON v.id=b.version_id
      WHERE v.asset_id=? AND v.id=? AND b.ordinal=?`).get(item.asset_id, item.version_id, item.ordinal);
    return source?.state === item.state && typeof source.text === "string" && sha(source.text) === item.source_hash;
  }
};

// src/host/word-search-index.ts
import { randomUUID as randomUUID5 } from "node:crypto";
var WORD_SEARCH_SCHEMA = `CREATE TABLE word_search_runs (
  conversion_id TEXT PRIMARY KEY REFERENCES office_conversions(id), result_blob_id TEXT NOT NULL REFERENCES blobs(id),
  state TEXT NOT NULL CHECK(state IN ('running','complete','failed')), next_page INTEGER NOT NULL CHECK(next_page>=1),
  attempts INTEGER NOT NULL CHECK(attempts>=0), token TEXT UNIQUE, lease_until TEXT,
  CHECK((state='running' AND token IS NOT NULL AND lease_until IS NOT NULL) OR
    (state!='running' AND token IS NULL AND lease_until IS NULL))
) STRICT;
CREATE TABLE word_search_pages (
  conversion_id TEXT NOT NULL REFERENCES word_search_runs(conversion_id), page INTEGER NOT NULL CHECK(page>=1),
  text TEXT NOT NULL CHECK(length(text)<=32000), PRIMARY KEY(conversion_id,page)
) STRICT;`;
var deadline = (now, ms = 2e4) => new Date(Date.parse(now) + ms).toISOString();
var sources = `FROM office_conversions c JOIN asset_versions v ON v.id=c.version_id
  JOIN knowledge_objects o ON o.id=v.asset_id JOIN blobs b ON b.id=c.result_blob_id`;
var eligible = `c.state='ready' AND o.status='active' AND b.media_type='application/pdf'`;
var due = `SELECT c.id,c.result_blob_id,c.page_count,b.storage_key,b.byte_length,b.sha256,r.next_page,r.attempts
  ${sources} LEFT JOIN word_search_runs r ON r.conversion_id=c.id WHERE ${eligible}
  AND (r.conversion_id IS NULL OR (r.result_blob_id=c.result_blob_id AND r.state='running' AND r.lease_until<=?))
  ORDER BY c.rowid LIMIT 1`;
var WordSearchIndex = class {
  constructor(tx) {
    this.tx = tx;
  }
  claim() {
    if (!this.tx("read", (db, now) => db.prepare(due).get(now))) return;
    return this.tx("write", (db, now) => {
      const r = db.prepare(due).get(now);
      if (!r) return;
      const attempts = Number(r.attempts ?? 0);
      if (attempts >= 3) {
        db.prepare("UPDATE word_search_runs SET state='failed',token=NULL,lease_until=NULL WHERE conversion_id=?").run(r.id);
        return;
      }
      const token2 = randomUUID5();
      db.prepare(`INSERT INTO word_search_runs VALUES(?,?,'running',1,1,?,?) ON CONFLICT(conversion_id) DO UPDATE SET
        attempts=attempts+1,token=excluded.token,lease_until=excluded.lease_until`).run(r.id, r.result_blob_id, token2, deadline(now));
      return {
        token: token2,
        key: String(r.storage_key),
        sha256: String(r.sha256),
        byteLength: Number(r.byte_length),
        total: Number(r.page_count),
        next: Number(r.next_page ?? 1)
      };
    });
  }
  publish(token2, page, text2, quality) {
    return this.tx("write", (db, now) => {
      const r = db.prepare(`SELECT c.id,c.page_count,c.result_blob_id ${sources} JOIN word_search_runs r ON r.conversion_id=c.id
      WHERE ${eligible} AND r.state='running' AND r.result_blob_id=c.result_blob_id AND r.token=? AND r.lease_until>? AND r.next_page=?`).get(token2, now, page);
      if (!r || !Number.isSafeInteger(page) || page < 1 || page > Number(r.page_count) || text2 !== null && text2.length > 32e3) return false;
      if (text2) db.prepare("INSERT INTO word_search_pages VALUES(?,?,?)").run(r.id, page, text2);
      if (quality === "text" && text2 || quality === "blank" && text2 === "") {
        db.prepare("INSERT INTO recall_word_sources VALUES(?,?,?,?)").run(r.id, page, r.result_blob_id, Number(quality === "blank"));
      }
      if (page === Number(r.page_count)) db.prepare("UPDATE word_search_runs SET state='complete',next_page=?,attempts=0,token=NULL,lease_until=NULL WHERE token=?").run(page + 1, token2);
      else db.prepare("UPDATE word_search_runs SET next_page=?,attempts=0,lease_until=? WHERE token=?").run(page + 1, deadline(now), token2);
      return true;
    });
  }
  defer(token2, refund = false) {
    this.tx("write", (db, now) => {
      db.prepare(`UPDATE word_search_runs SET lease_until=?,attempts=max(0,attempts-?) WHERE token=?`).run(deadline(now, 1e3), refund ? 1 : 0, token2);
    });
  }
};

// src/host/zip-store.ts
import { createHash as createHash5, randomUUID as randomUUID6 } from "node:crypto";
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
      const id = randomUUID6();
      db.prepare("INSERT INTO zip_imports VALUES(?,?,?,?,?,?,?,?)").run(id, a.userId, spec.key, spec.title, blob.key, blob.sha256, blob.byteLength, now);
      const insert = db.prepare(`INSERT INTO zip_entries(id,import_id,ordinal,name,path,byte_length,compressed_size,media_type,reason,state,publish_key) VALUES(?,?,?,?,?,?,?,?,?,'available',?)`);
      for (const m of members) insert.run(randomUUID6(), id, m.ordinal, m.name, m.path, m.size, m.compressedSize, m.media, m.reason, randomUUID6());
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
        const receipt3 = asset_id && this.readable(a, String(asset_id), now) ? { id: asset_id, version_id, version, title: original_name, sha256, byte_length, media_type: e.media_type } : void 0;
        return { ...e, ...receipt3 ? { receipt: receipt3 } : {} };
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
      const canonical = JSON.stringify([...ids].sort()), digest3 = createHash5("sha256").update(canonical).digest("hex");
      const seen = db.prepare("SELECT import_id,selection_digest FROM zip_selections WHERE owner_id=? AND request_key=?").get(a.userId, key);
      if (seen && (seen.import_id !== id || seen.selection_digest !== digest3)) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
      const get = db.prepare("SELECT id,ordinal,path,media_type,reason,state,publish_key FROM zip_entries WHERE import_id=? AND id=?");
      const members = ids.map((entry) => {
        const r = get.get(id, entry);
        if (!r || r.reason !== null || !r.media_type) throw new AssetError(422, "INVALID_SELECTION");
        return { id: entry, ordinal: Number(r.ordinal), path: String(r.path), media: String(r.media_type), key: String(r.publish_key), imported: r.state === "imported" };
      });
      if (!seen) db.prepare("INSERT INTO zip_selections VALUES(?,?,?,?,?,?,?)").run(randomUUID6(), id, a.userId, key, digest3, canonical, now);
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
import { randomUUID as randomUUID7 } from "node:crypto";

// src/host/pdf-chapters.ts
var maxPdfPages = 1e4;
var maxPdfChapters = 100;
function pdfChapters(value, total = maxPdfPages) {
  if (!Number.isSafeInteger(total) || total < 1 || total > maxPdfPages || !Array.isArray(value) || value.length < 1 || value.length > maxPdfChapters)
    throw Error("INVALID_PDF_CHAPTERS");
  const ranges = [];
  let previous = 0;
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2) throw Error("INVALID_PDF_CHAPTERS");
    const [first, last] = pair;
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first <= previous || last < first || last > total)
      throw Error("INVALID_PDF_CHAPTERS");
    ranges.push([first, last]);
    previous = last;
  }
  return ranges;
}

// src/host/parse-store.ts
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
var PDF_CHAPTER_SCHEMA = `CREATE TABLE pdf_chapter_ranges (
  version_id TEXT NOT NULL REFERENCES pdf_parse_runs(version_id),
  first_page INTEGER NOT NULL CHECK(first_page>=1), last_page INTEGER NOT NULL CHECK(last_page BETWEEN first_page AND 10000),
  PRIMARY KEY(version_id,first_page)
) STRICT;`;
var targeted = `(NOT EXISTS(SELECT 1 FROM pdf_chapter_ranges c WHERE c.version_id=pdf_pages.version_id)
  OR EXISTS(SELECT 1 FROM pdf_chapter_ranges c WHERE c.version_id=pdf_pages.version_id AND pdf_pages.page BETWEEN c.first_page AND c.last_page))`;
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
  control(actor, id, v, op, page, requested) {
    return this.tx(op === "status" ? "read" : "write", (db, now) => {
      if (!this.permit(actor.sessionId, actor.userId, id, op !== "status", now) || !this.pdfVersion(db, id, v)) throw new AssetError(404, "ASSET_NOT_FOUND");
      const prev = db.prepare("SELECT state,error,total FROM pdf_parse_runs WHERE version_id=?").get(v);
      const loadChapters = () => db.prepare("SELECT first_page,last_page FROM pdf_chapter_ranges WHERE version_id=? ORDER BY first_page").all(v).map((p) => [Number(p.first_page), Number(p.last_page)]);
      const plan = loadChapters();
      if (op === "start" || op === "chapters") {
        if (op === "chapters") {
          let ranges;
          try {
            ranges = pdfChapters(requested, Number(prev?.total) || void 0);
          } catch {
            throw new AssetError(422, "INVALID_PDF_CHAPTERS");
          }
          const repair = prev?.state === "failed" && prev.error === "CHAPTER_RANGE_OUTSIDE_DOCUMENT" && prev.total === 0;
          if (prev && !repair && JSON.stringify(ranges) !== JSON.stringify(plan)) throw new AssetError(409, "PDF_CHAPTER_PLAN_FROZEN");
          if (!prev || repair) {
            if (!prev) db.prepare("INSERT INTO pdf_parse_runs(version_id,session_id,user_id,state) VALUES(?,?,?,'queued')").run(v, actor.sessionId, actor.userId);
            else db.prepare("DELETE FROM pdf_chapter_ranges WHERE version_id=?").run(v);
            const insert = db.prepare("INSERT INTO pdf_chapter_ranges VALUES(?,?,?)");
            for (const [first, last] of ranges) insert.run(v, first, last);
          }
        } else if (prev?.state === "failed" && prev.error === "CHAPTER_RANGE_OUTSIDE_DOCUMENT") throw new AssetError(409, "PDF_CHAPTER_PLAN_NEEDS_CORRECTION");
        if (!prev && op === "start") db.prepare("INSERT INTO pdf_parse_runs(version_id,session_id,user_id,state) VALUES(?,?,?,'queued')").run(v, actor.sessionId, actor.userId);
        else if (prev && ["failed", "cancelled"].includes(String(prev.state))) {
          db.prepare("UPDATE pdf_parse_runs SET session_id=?,user_id=?,state='queued',error=NULL,losses=0 WHERE version_id=?").run(actor.sessionId, actor.userId, v);
        }
      } else if (op === "cancel") {
        if (!prev || !["running", "queued", "cancelled"].includes(String(prev.state))) throw new AssetError(409, "PARSE_NOT_ACTIVE");
        db.prepare("UPDATE pdf_parse_runs SET state='cancelled',token=NULL,deadline=NULL,error='CANCELLED' WHERE version_id=?").run(v);
      } else if (op === "retry") {
        if (!prev || prev.state !== "partial" || !page || !db.prepare(`UPDATE pdf_pages SET state='pending',error=NULL
          WHERE version_id=? AND page=? AND state IN ('failed','review') AND ${targeted}`).run(v, page).changes) throw new AssetError(409, "PAGE_NOT_RETRYABLE");
        db.prepare("UPDATE pdf_parse_runs SET state='queued',session_id=?,user_id=?,error=NULL,losses=0 WHERE version_id=?").run(actor.sessionId, actor.userId, v);
      }
      const run = db.prepare("SELECT state,total,error FROM pdf_parse_runs WHERE version_id=?").get(v);
      const chapters = op === "chapters" ? loadChapters() : plan;
      const selected = chapters.length ? `,${targeted} AS selected` : "";
      return {
        state: run?.state ?? "idle",
        total: run?.total ?? 0,
        error: run?.error ?? null,
        ...chapters.length ? { chapters } : {},
        pages: db.prepare(`SELECT page,state,chapter,error${selected} FROM pdf_pages WHERE version_id=? ORDER BY page`).all(v)
      };
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
      const token2 = randomUUID7();
      db.prepare("UPDATE pdf_parse_runs SET state='running',token=?,deadline=?,error=NULL WHERE version_id=?").run(token2, ms + leaseMs, version);
      return { version, token: token2, key: String(r.storage_key), sha256: String(r.sha256), byteLength: Number(r.byte_length) };
    });
  }
  leased(token2, op) {
    return this.tx("write", (db, now) => {
      const ms = Date.parse(now), r = db.prepare(`SELECT r.*,v.asset_id FROM pdf_parse_runs r JOIN asset_versions v ON v.id=r.version_id
        WHERE token=? AND state='running' AND deadline>?`).get(token2, ms);
      if (!r) return void 0;
      if (!this.permit(String(r.session_id), String(r.user_id), String(r.asset_id), true, now)) {
        db.prepare("UPDATE pdf_parse_runs SET state='failed',token=NULL,deadline=NULL,error='AUTHORIZATION_LOST' WHERE token=?").run(token2);
        return void 0;
      }
      return op(db, String(r.version_id), ms);
    });
  }
  renew(token2) {
    return this.leased(token2, (db, _v, ms) => Boolean(db.prepare("UPDATE pdf_parse_runs SET deadline=? WHERE token=?").run(ms + leaseMs, token2).changes));
  }
  initialize(token2, total) {
    if (!Number.isSafeInteger(total) || total < 1 || total > 1e4) throw Error("PAGE_COUNT_LIMIT");
    return this.leased(token2, (db, v) => {
      const before = Number(db.prepare("SELECT total FROM pdf_parse_runs WHERE version_id=?").get(v).total);
      if (before && before !== total) throw Error("PAGE_COUNT_CHANGED");
      if (db.prepare("SELECT 1 FROM pdf_chapter_ranges WHERE version_id=? AND last_page>? LIMIT 1").get(v, total)) {
        db.prepare("UPDATE pdf_parse_runs SET state='failed',token=NULL,deadline=NULL,error='CHAPTER_RANGE_OUTSIDE_DOCUMENT' WHERE version_id=?").run(v);
        return false;
      }
      if (!before) {
        db.prepare("UPDATE pdf_parse_runs SET total=? WHERE version_id=?").run(total, v);
        const insert = db.prepare("INSERT INTO pdf_pages(version_id,page,state) VALUES(?,?,'pending')");
        for (let p = 1; p <= total; p++) insert.run(v, p);
      }
      return true;
    });
  }
  next(token2) {
    return this.leased(token2, (db, v) => {
      const pending = db.prepare(`SELECT page FROM pdf_pages WHERE version_id=? AND state='pending' AND ${targeted} ORDER BY page LIMIT 1`).get(v);
      if (pending) return Number(pending.page);
      db.prepare(`UPDATE pdf_parse_runs SET state=CASE WHEN EXISTS(SELECT 1 FROM pdf_pages WHERE version_id=? AND state IN ('failed','review') AND ${targeted})
      THEN 'partial' ELSE 'complete' END,token=NULL,deadline=NULL,error=NULL WHERE version_id=?`).run(v, v);
      return null;
    });
  }
  publish(token2, page, result) {
    return this.leased(token2, (db, v) => {
      if (result && (result.text.length > 262144 || result.chapter.length > 512)) throw Error("PAGE_OUTPUT_LIMIT");
      const state = result ? result.needsReview || !result.text.trim() ? "review" : "ready" : "failed";
      const previous = String(db.prepare("SELECT text FROM pdf_pages WHERE version_id=? AND page=? AND state='pending'").get(v, page)?.text ?? "");
      const text2 = !result || previous !== "" && result.text.trimStart() === previous ? previous : result.text;
      const wrote = db.prepare(`UPDATE pdf_pages SET state=?,text=?,chapter=?,error=?,generation=generation+1
      WHERE version_id=? AND page=? AND state='pending' AND ${targeted}`).run(state, text2, result?.chapter ?? "", result ? null : "PAGE_EXTRACTION_FAILED", v, page);
      if (wrote.changes) {
        db.prepare("UPDATE pdf_parse_runs SET losses=0 WHERE version_id=?").run(v);
        if (result?.confirmedBlank && !text2) db.prepare("INSERT OR IGNORE INTO recall_pdf_blank_pages VALUES(?,?)").run(v, page);
      }
      return Boolean(wrote.changes);
    });
  }
  fail(token2) {
    return this.leased(token2, (db, v) => db.prepare("UPDATE pdf_parse_runs SET state='failed',token=NULL,deadline=NULL,error='DOCUMENT_UNAVAILABLE' WHERE version_id=?").run(v));
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
import { randomUUID as randomUUID8 } from "node:crypto";
var historyLimit = 10;
var conversionFields = "id,state,page_count,missing_fonts,failure_code";
var missing = () => new AssetError(404, "ASSET_NOT_FOUND");
var keyPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
var checkKey = (key) => {
  if (!keyPattern.test(key) || key.length !== 36) throw new AssetError(422, "INVALID_IDEMPOTENCY_KEY");
};
var deadline2 = (now) => new Date(Date.parse(now) + 15e3).toISOString();
var due2 = "state='queued' OR (state='running' AND lease_until<=?)";
var sourceSQL2 = `SELECT v.asset_id,v.id AS version_id,b.media_type,b.sha256,b.byte_length,b.storage_key,
  NOT EXISTS(SELECT 1 FROM asset_versions n WHERE n.asset_id=v.asset_id AND n.version>v.version) AS head
  FROM asset_versions v JOIN blobs b ON b.id=v.blob_id WHERE v.id=? AND b.media_type IN (?,?)`;
var OfficeStore = class {
  constructor(tx, permit) {
    this.tx = tx;
    this.permit = permit;
  }
  sourceRow(db, v) {
    return db.prepare(sourceSQL2).get(v, WORD_MEDIA.doc, WORD_MEDIA.docx);
  }
  access(db, now, a, id, v, action) {
    if (!this.permit(a.sessionId, a.userId, id, "read", now) || action !== "read" && !this.permit(a.sessionId, a.userId, id, action, now)) throw missing();
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
  start(a, id, v, key, available2 = true) {
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
      if (!available2) throw new AssetError(503, "OFFICE_UNAVAILABLE");
      const cid = randomUUID8();
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
      const note = randomUUID8();
      db.prepare("INSERT INTO office_quality_notes VALUES(?,?,?,?,?,?,?)").run(note, cid, a.userId, page, body, now, key);
      return { id: note, replayed: false };
    });
  }
  claim() {
    if (!this.tx("read", (db, now) => db.prepare(`SELECT 1 FROM office_conversions WHERE ${due2} LIMIT 1`).get(now))) return;
    return this.tx("write", (db, now) => {
      const row = db.prepare(`SELECT id,attempt FROM office_conversions WHERE ${due2} ORDER BY rowid LIMIT 1`).get(now);
      if (!row) return;
      if (Number(row.attempt) >= 3) {
        db.prepare("UPDATE office_conversions SET state='failed',failure_code='LEASE_EXPIRED',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(now, row.id);
        return;
      }
      const token2 = randomUUID8();
      db.prepare("UPDATE office_conversions SET state='running',attempt=attempt+1,lease_token=?,lease_until=?,updated_at=? WHERE id=?").run(token2, deadline2(now), now, row.id);
      return this.authority(db, now, token2) ? { token: token2 } : void 0;
    });
  }
  authority(db, now, token2) {
    const row = db.prepare(`SELECT c.id,c.actor_id,c.version_id,a.session_id FROM office_conversions c LEFT JOIN office_authorizations a ON a.conversion_id=c.id
      WHERE c.state='running' AND c.lease_token=? AND c.lease_until>?`).get(token2, now);
    if (!row) return;
    const source = this.sourceRow(db, String(row.version_id)), session = String(row.session_id), user = String(row.actor_id), asset = String(source?.asset_id);
    if (!source?.head || !row.session_id || !this.permit(session, user, asset, "read", now) || !this.permit(session, user, asset, "edit", now)) {
      db.prepare("UPDATE office_conversions SET state=?,failure_code=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(source?.head ? "failed" : "superseded", source?.head ? "AUTHORIZATION_LOST" : "SOURCE_CHANGED", now, row.id);
      return;
    }
    return { assetId: asset, versionId: String(row.version_id), key: String(source.storage_key), sha256: String(source.sha256), byteLength: Number(source.byte_length), extension: source.media_type === WORD_MEDIA.doc ? "doc" : "docx" };
  }
  source(token2) {
    return this.tx("write", (db, now) => this.authority(db, now, token2));
  }
  renew(token2) {
    return this.tx("write", (db, now) => !!this.authority(db, now, token2) && !!db.prepare("UPDATE office_conversions SET lease_until=? WHERE lease_token=?").run(deadline2(now), token2).changes);
  }
  complete(token2, blob, pageCount, fonts) {
    return this.tx("write", (db, now) => {
      if (!this.authority(db, now, token2)) return false;
      if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 1e4 || !Number.isSafeInteger(blob.byteLength) || blob.byteLength <= 0 || blob.byteLength > 64 * 1024 * 1024 || !Array.isArray(fonts) || fonts.length > 1024 || fonts.some((f) => typeof f !== "string" || f.length > 512)) throw new AssetError(422, "INVALID_OFFICE_RESULT");
      const bid = randomUUID8();
      db.prepare("INSERT INTO blobs VALUES(?,?,?,?,'application/pdf')").run(bid, blob.key, blob.sha256, blob.byteLength);
      db.prepare("UPDATE office_conversions SET state='ready',result_blob_id=?,page_count=?,missing_fonts=?,failure_code=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE lease_token=?").run(bid, pageCount, JSON.stringify(fonts), now, token2);
      return true;
    });
  }
  fail(token2, code) {
    this.tx("write", (db, now) => {
      if (!this.authority(db, now, token2)) return;
      db.prepare("UPDATE office_conversions SET state='failed',failure_code=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE lease_token=?").run(/^[a-zA-Z0-9_-]{1,64}$/.test(code) ? code : "CONVERSION_FAILED", now, token2);
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

// src/host/citation-store.ts
import { createHash as createHash9, randomUUID as randomUUID11 } from "node:crypto";

// src/host/citation-anchor.ts
import { createHash as createHash6 } from "node:crypto";
function citationAnchor(text2, start, end) {
  const split = (n) => n > 0 && n < text2.length && text2.charCodeAt(n - 1) >= 55296 && text2.charCodeAt(n - 1) <= 56319 && text2.charCodeAt(n) >= 56320 && text2.charCodeAt(n) <= 57343;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text2.length || split(start) || split(end)) throw new AssetError(422, "INVALID_CITATION_RANGE");
  const quote = text2.slice(start, end), hash4 = (s) => createHash6("sha256").update(s, "utf8").digest("hex");
  return { start, end, quote_hash: hash4(quote), source_hash: hash4(text2) };
}
function resolveCitationText(text2, anchor) {
  const digest3 = createHash6("sha256").update(text2, "utf8").digest("hex");
  if (digest3 !== anchor.source_hash) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
  const actual = citationAnchor(text2, anchor.start, anchor.end);
  if (actual.quote_hash !== anchor.quote_hash) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
  return text2.slice(anchor.start, anchor.end);
}

// src/host/citation-locator.ts
import { createHash as createHash7 } from "node:crypto";
var hash = (x) => createHash7("sha256").update(x, "utf8").digest("hex");
function makeLocator(s, text2, start, end, neighbors, w) {
  const word = s.kind === "office" ? w?.word : void 0;
  if (s.kind === "office" && (!word?.blocks.length || word.source_sha256 !== s.wordOriginal?.sha256)) throw new AssetError(422, "WORD_STRUCTURE_UNVERIFIED");
  const first = word?.blocks[0], last = word?.blocks.at(-1);
  const lo = first ? Math.min(start, first.page_start) : 0, hi = last ? Math.max(end, last.page_end) : text2.length;
  const blockId = first?.block_id ?? hash(JSON.stringify([s.version_id, null, s.ordinal, lo, hi]));
  const context = {
    block_id: blockId,
    block_start: lo,
    block_end: hi,
    previous: first ? first.previous : neighbors.previous,
    next: last ? last.next : neighbors.next,
    before_hash: hash(text2.slice(Math.max(0, start - 64), start)),
    after_hash: hash(text2.slice(end, end + 64))
  };
  if (s.kind === "text") return { context, geometry: null };
  if (!w || !s.ref || s.ref.sha256 !== w.sha256 || s.conversion_id !== w.conversion_id || s.ordinal !== w.ordinal || w.text !== text2) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
  const boxes = w.boxes.filter((b) => b.start < end && b.end > start).map(({ start: start2, end: end2, x, y, width, height }) => ({ start: start2, end: end2, x, y, width, height }));
  return { context, geometry: { page: s.ordinal, width: w.width, height: w.height, source_sha256: w.sha256, boxes }, ...word ? { word } : {} };
}

// src/host/reading-state.ts
import { createHash as createHash8, randomUUID as randomUUID9 } from "node:crypto";
var pointColumns = `ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 1000000),
  conversion_id TEXT REFERENCES office_conversions(id), source_hash TEXT NOT NULL CHECK(length(source_hash)=64)`;
var READING_STATE_SCHEMA = `CREATE TABLE reading_positions (
  user_id TEXT NOT NULL REFERENCES users(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  ${pointColumns}, revision INTEGER NOT NULL CHECK(revision>0), PRIMARY KEY(user_id,version_id)
) STRICT;
CREATE TABLE reading_bookmarks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  ${pointColumns}, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120)
) STRICT;
CREATE INDEX reading_bookmarks_scope ON reading_bookmarks(user_id,version_id);`;
var canRemember = (s) => s.state === "ready" || s.state === "review";
var positionHash = (s) => s.kind === "office" ? s.ref.sha256 : createHash8("sha256").update(s.text).digest("hex");
var samePoint = (s, p) => canRemember(s) && s.ordinal === p.ordinal && s.conversion_id === p.conversion_id && positionHash(s) === p.source_hash;
var point = (r) => ({ ordinal: Number(r.ordinal), source_hash: String(r.source_hash), ...r.conversion_id ? { conversion_id: String(r.conversion_id) } : {} });
var columns = "ordinal,conversion_id,source_hash";
function readNavigation(db, user, version, valid) {
  const r = db.prepare(`SELECT revision,${columns} FROM reading_positions WHERE user_id=? AND version_id=?`).get(user, version);
  const p = r ? point(r) : null;
  const bookmarks = db.prepare(`SELECT id,title,${columns} FROM reading_bookmarks WHERE user_id=? AND version_id=? ORDER BY rowid`).all(user, version);
  return { actor_id: user, revision: Number(r?.revision ?? 0), position: p && valid(p) ? p : null, bookmarks: bookmarks.map((r2) => ({ id: String(r2.id), title: String(r2.title), ...point(r2) })) };
}
function savePosition(db, user, version, p, expected) {
  const revision = expected + 1;
  const change = expected === 0 ? db.prepare("INSERT INTO reading_positions(user_id,version_id,ordinal,conversion_id,source_hash,revision) VALUES(?,?,?,?,?,1) ON CONFLICT DO NOTHING").run(user, version, p.ordinal, p.conversion_id ?? null, p.source_hash) : db.prepare("UPDATE reading_positions SET ordinal=?,conversion_id=?,source_hash=?,revision=? WHERE user_id=? AND version_id=? AND revision=?").run(p.ordinal, p.conversion_id ?? null, p.source_hash, revision, user, version, expected);
  if (change.changes !== 1) throw new AssetError(409, "READING_REVISION_CONFLICT");
  return { revision, position: { ordinal: p.ordinal, source_hash: p.source_hash, ...p.conversion_id ? { conversion_id: p.conversion_id } : {} } };
}
function createBookmark(db, user, version, p, title) {
  if (Number(db.prepare("SELECT count(*) AS n FROM reading_bookmarks WHERE user_id=? AND version_id=?").get(user, version)?.n) >= 200) throw new AssetError(409, "BOOKMARK_LIMIT");
  const id = randomUUID9();
  db.prepare("INSERT INTO reading_bookmarks(id,user_id,version_id,ordinal,conversion_id,source_hash,title) VALUES(?,?,?,?,?,?,?)").run(id, user, version, p.ordinal, p.conversion_id ?? null, p.source_hash, title);
  return { id, title, ordinal: p.ordinal, source_hash: p.source_hash, ...p.conversion_id ? { conversion_id: p.conversion_id } : {} };
}

// src/host/annotation-store.ts
import { randomUUID as randomUUID10 } from "node:crypto";
var ANNOTATION_SCHEMA = `CREATE TABLE reader_annotations (
  id TEXT PRIMARY KEY, citation_id TEXT NOT NULL REFERENCES citations(id),
  author_id TEXT NOT NULL REFERENCES users(id), project_id TEXT REFERENCES knowledge_projects(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000), revision INTEGER NOT NULL CHECK(revision>=1)
) STRICT;
CREATE INDEX reader_annotations_citation ON reader_annotations(citation_id);`;
var records = `SELECT a.id,a.citation_id,a.author_id,a.project_id,a.body,a.revision,c.ordinal,c.start,c.end,c.source_hash,c.conversion_id
  FROM reader_annotations a JOIN citations c ON c.id=a.citation_id`;
var inSource = "c.asset_id=? AND c.version_id=? AND c.ordinal=? AND c.conversion_id IS ?";
var args = (t) => [t.asset_id, t.version_id, t.ordinal, t.conversion_id ?? null];
var hidden = () => new AssetError(404, "ANNOTATION_NOT_FOUND");
var visibleAnnotation = (r, user, scope) => r.project_id === null ? r.author_id === user : r.project_id === scope.project_id;
function dto(r, user, scope) {
  return {
    id: String(r.id),
    citation_id: String(r.citation_id),
    ordinal: Number(r.ordinal),
    start: Number(r.start),
    end: Number(r.end),
    source_hash: String(r.source_hash),
    ...r.conversion_id ? { conversion_id: String(r.conversion_id) } : {},
    visibility: r.project_id ? "project" : "private",
    body: String(r.body),
    revision: Number(r.revision),
    can_edit: r.author_id === user && scope.canComment
  };
}
function listAnnotations(db, t, user, scope) {
  const rows = db.prepare(`${records} WHERE ${inSource} AND ((a.project_id IS NULL AND a.author_id=?) OR a.project_id=?) ORDER BY a.rowid`).all(...args(t), user, scope.project_id ?? null);
  return { actor_id: user, can_comment: scope.canComment, can_share: scope.canComment && Boolean(scope.project_id), items: rows.map((r) => dto(r, user, scope)) };
}
function insertAnnotation(db, t, user, scope, draft, citation) {
  const project = draft.visibility === "project" ? scope.project_id : null;
  if (draft.visibility === "project" && !project) throw new AssetError(422, "ANNOTATION_SCOPE_UNAVAILABLE");
  const count = db.prepare(`${records.replace(/^SELECT[\s\S]*?FROM/, "SELECT count(*) AS n FROM")} WHERE ${inSource} AND a.project_id IS ?${project ? "" : " AND a.author_id=?"}`).get(...args(t), project ?? null, ...project ? [] : [user]);
  if (Number(count?.n) >= 200) throw new AssetError(409, "ANNOTATION_LIMIT");
  const id = randomUUID10();
  db.prepare("INSERT INTO reader_annotations VALUES(?,?,?,?,?,1)").run(id, draft.citation_id, user, project ?? null, draft.body);
  return dto({ ...citation, id, citation_id: draft.citation_id, author_id: user, project_id: project ?? null, body: draft.body, revision: 1 }, user, scope);
}
function mutateAnnotation(db, t, user, scope, id, revision, body) {
  const row = db.prepare(`${records} WHERE ${inSource} AND a.id=? AND a.author_id=?`).get(...args(t), id, user);
  if (!row || !visibleAnnotation(row, user, scope)) throw hidden();
  if (row.revision !== revision) throw new AssetError(409, "ANNOTATION_REVISION_CONFLICT");
  if (body === void 0) {
    db.prepare("DELETE FROM reader_annotations WHERE id=?").run(id);
    return { id };
  }
  db.prepare("UPDATE reader_annotations SET body=?,revision=? WHERE id=?").run(body, revision + 1, id);
  return dto({ ...row, body, revision: revision + 1 }, user, scope);
}

// src/host/citation-store.ts
var CITATION_SCHEMA = `CREATE TABLE citations (
  id TEXT PRIMARY KEY, created_by TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  conversion_id TEXT REFERENCES office_conversions(id), ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  start INTEGER NOT NULL CHECK(start>=0), end INTEGER NOT NULL CHECK(end>start),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64), quote_hash TEXT NOT NULL CHECK(length(quote_hash)=64),
  created_at TEXT NOT NULL, UNIQUE(created_by,request_key)
) STRICT;`;
var notFound2 = () => new AssetError(404, "SOURCE_NOT_FOUND");
var invalid = () => new AssetError(422, "INVALID_READER_UNIT");
var sha2 = (s) => createHash9("sha256").update(s, "utf8").digest("hex");
var uuid2 = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var fields = "id,asset_id,version_id,conversion_id,ordinal,start,end,source_hash,quote_hash";
function dto2(row) {
  const { conversion_id, ...rest } = row;
  return { ...rest, ...conversion_id ? { conversion_id } : {} };
}
var CitationStore = class {
  constructor(tx, current, allowed, annotationAccess, readHorizon) {
    this.tx = tx;
    this.current = current;
    this.allowed = allowed;
    this.annotationAccess = annotationAccess;
    this.readHorizon = readHorizon;
  }
  actor(prior, now) {
    const a = this.current(prior, now);
    if (!a) throw new AssetError(401, "AUTH_REQUIRED");
    return a;
  }
  read(db, a, t, now) {
    if (!this.allowed(a, t.asset_id, now)) throw notFound2();
    const r = db.prepare(`SELECT v.original_name,b.media_type,b.storage_key,b.sha256,b.byte_length FROM asset_versions v
      JOIN blobs b ON b.id=v.blob_id WHERE v.asset_id=? AND v.id=?`).get(t.asset_id, t.version_id);
    if (!r) throw notFound2();
    if (!Number.isSafeInteger(t.ordinal) || t.ordinal < 1) throw invalid();
    const base = { asset_id: t.asset_id, version_id: t.version_id, ordinal: t.ordinal, title: String(r.original_name), chapter: "", text: "" };
    if (r.media_type === "text/plain" || r.media_type === "text/markdown") {
      if (t.conversion_id) throw notFound2();
      const v = db.prepare("SELECT block_count FROM text_versions WHERE version_id=?").get(t.version_id);
      const total2 = Number(v?.block_count ?? 0);
      if (!total2 && t.ordinal === 1) return { ...base, kind: "text", total: total2, state: "empty" };
      const block = db.prepare("SELECT text,kind FROM text_blocks WHERE version_id=? AND ordinal=?").get(t.version_id, t.ordinal);
      if (!block) throw invalid();
      return { ...base, kind: "text", total: total2, state: "ready", text: String(block.text), chapter: String(block.kind) };
    }
    if (r.media_type === "application/pdf") {
      if (t.conversion_id) throw notFound2();
      const v = db.prepare("SELECT total,state FROM pdf_parse_runs WHERE version_id=?").get(t.version_id), total2 = Number(v?.total ?? 0);
      if (total2 && t.ordinal > total2) throw invalid();
      const p = db.prepare("SELECT state,text,chapter FROM pdf_pages WHERE version_id=? AND page=?").get(t.version_id, t.ordinal);
      const state = String(p?.state ?? v?.state ?? "idle");
      const withText = p && (state === "ready" || state === "review");
      return { ...base, kind: "pdf", total: total2, state, text: withText ? String(p.text) : "", chapter: String(p?.chapter ?? ""), ref: { key: String(r.storage_key), byteLength: Number(r.byte_length), sha256: String(r.sha256) } };
    }
    const sql = `SELECT c.id,c.page_count,b.storage_key,b.byte_length,b.sha256 FROM office_conversions c JOIN blobs b ON b.id=c.result_blob_id
      WHERE c.version_id=? AND c.state='ready' `;
    const c = t.conversion_id ? db.prepare(sql + "AND c.id=?").get(t.version_id, t.conversion_id) : db.prepare(sql + "ORDER BY c.rowid DESC LIMIT 1").get(t.version_id);
    if (!c) {
      if (t.conversion_id) throw notFound2();
      return { ...base, kind: "office", total: 0, state: "unconverted" };
    }
    if (r.media_type !== WORD_MEDIA.doc && r.media_type !== WORD_MEDIA.docx) throw notFound2();
    const total = Number(c.page_count);
    if (t.ordinal > total) throw invalid();
    return {
      ...base,
      conversion_id: String(c.id),
      kind: "office",
      total,
      state: "ready",
      ref: { key: String(c.storage_key), byteLength: Number(c.byte_length), sha256: String(c.sha256) },
      wordOriginal: { key: String(r.storage_key), byteLength: Number(r.byte_length), sha256: String(r.sha256), media: r.media_type }
    };
  }
  source(prior, t) {
    return this.tx("read", (db, now) => this.read(db, this.actor(prior, now), t, now));
  }
  validateTaskMaterial(db, actor, t, now) {
    const source = this.read(db, actor, t, now);
    return source.total >= t.ordinal && (source.kind !== "office" || Boolean(t.conversion_id && source.conversion_id === t.conversion_id));
  }
  recallSource(db, actor, t, now) {
    const s = this.read(db, actor, t, now);
    if (s.kind === "office") {
      if (!t.conversion_id || s.conversion_id !== t.conversion_id) throw new AssetError(422, "RECALL_CONVERSION_REQUIRED");
      const page = db.prepare(`SELECT q.blank,p.text FROM office_conversions c JOIN recall_word_sources q
        ON q.conversion_id=c.id AND q.result_blob_id=c.result_blob_id
        LEFT JOIN word_search_pages p ON p.conversion_id=q.conversion_id AND p.page=q.page
        WHERE c.id=? AND q.page=?`).get(s.conversion_id, s.ordinal);
      if (!page || !page.blank && typeof page.text !== "string") throw new AssetError(409, "RECALL_SOURCE_NOT_READY");
      return { ...s, text: page.blank ? "" : String(page.text) };
    }
    if (s.kind === "pdf" && !s.text && db.prepare("SELECT 1 FROM recall_pdf_blank_pages WHERE version_id=? AND page=?").get(s.version_id, s.ordinal)) return s;
    if (s.state !== "ready") throw new AssetError(409, "RECALL_SOURCE_NOT_READY");
    return s;
  }
  navigation(prior, t) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), src = this.read(db, a, { ...t, ordinal: 1 }, now);
      return readNavigation(db, a.userId, t.version_id, (p) => {
        if (src.conversion_id !== p.conversion_id || p.ordinal > src.total) return false;
        try {
          return samePoint(this.read(db, a, { ...t, ...p }, now), p);
        } catch (e) {
          if (e instanceof AssetError && e.code === "INVALID_READER_UNIT") return false;
          throw e;
        }
      });
    });
  }
  outline(prior, t) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), source = this.read(db, a, t, now);
      const items = source.kind === "text" ? db.prepare("SELECT ordinal,text FROM text_blocks WHERE version_id=? AND kind='heading' ORDER BY ordinal LIMIT 2048").all(t.version_id).flatMap((row) => {
        const lines = String(row.text).trimEnd().split(/\r\n|\r|\n/), first = lines[0];
        const atx = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
        const label = atx.test(first) ? first.replace(atx, "").replace(/[ \t]+#+[ \t]*$/, "") : lines.slice(0, -1).map((line) => line.trim()).join(" ");
        const title = label.trim().slice(0, 250);
        return title ? [{ ordinal: Number(row.ordinal), title }] : [];
      }) : [];
      return { actor_id: a.userId, source, items };
    });
  }
  writer(prior, expectedActor, now) {
    const a = this.actor(prior, now);
    if (a.userId !== expectedActor) throw new AssetError(409, "READER_ACTOR_CHANGED");
    return a;
  }
  savePosition(prior, t, revision, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now);
      const src = this.read(db, a, { asset_id: t.asset_id, version_id: t.version_id, ordinal: t.ordinal }, now);
      if (!samePoint(src, t)) throw new AssetError(409, "READING_SOURCE_CHANGED");
      return savePosition(db, a.userId, t.version_id, t, revision);
    });
  }
  addBookmark(prior, t, title, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now), src = this.read(db, a, t, now);
      if (!samePoint(src, t)) throw new AssetError(409, "READING_SOURCE_CHANGED");
      return createBookmark(db, a.userId, t.version_id, t, title);
    });
  }
  deleteBookmark(prior, t, id, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now);
      this.read(db, a, t, now);
      const del = db.prepare("DELETE FROM reading_bookmarks WHERE id=? AND user_id=? AND version_id=?").run(id, a.userId, t.version_id);
      if (del.changes !== 1) throw notFound2();
      return { id };
    });
  }
  annotatable(db, a, t, now, write = false) {
    const src = this.read(db, a, t, now), scope = this.annotationAccess?.(a, t.asset_id, now);
    if (!scope || write && !scope.canComment) throw notFound2();
    return { src, scope };
  }
  listAnnotations(prior, t) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), { src, scope } = this.annotatable(db, a, t, now);
      return listAnnotations(db, src, a.userId, scope);
    });
  }
  addAnnotation(prior, t, draft, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now), { src, scope } = this.annotatable(db, a, t, now, true);
      const row = db.prepare(`SELECT ${fields} FROM citations WHERE id=? AND created_by=? AND asset_id=? AND version_id=? AND ordinal=? AND conversion_id IS ?`).get(draft.citation_id, a.userId, src.asset_id, src.version_id, src.ordinal, src.conversion_id ?? null);
      if (!row) throw notFound2();
      if (src.state !== "ready" && src.state !== "review" || src.kind !== "office" && row.source_hash !== sha2(src.text)) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
      return insertAnnotation(db, src, a.userId, scope, draft, dto2(row));
    });
  }
  updateAnnotation(prior, t, id, revision, body, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now), { src, scope } = this.annotatable(db, a, t, now, true);
      return mutateAnnotation(db, src, a.userId, scope, id, revision, body);
    });
  }
  deleteAnnotation(prior, t, id, revision, expectedActor) {
    return this.tx("write", (db, now) => {
      const a = this.writer(prior, expectedActor, now), { src, scope } = this.annotatable(db, a, t, now, true);
      return mutateAnnotation(db, src, a.userId, scope, id, revision);
    });
  }
  access(prior, asset, version) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now), expires = this.readHorizon ? this.readHorizon(actor, asset, now) : this.allowed(actor, asset, now) ? null : void 0;
      if (expires === void 0) throw notFound2();
      const row = db.prepare(`SELECT v.version,NOT EXISTS(SELECT 1 FROM asset_versions n WHERE n.asset_id=v.asset_id AND n.version>v.version) AS latest
      FROM asset_versions v WHERE v.asset_id=? AND v.id=?`).get(asset, version);
      if (!row) throw notFound2();
      return { actor_id: actor.userId, asset_id: asset, version_id: version, version: Number(row.version), is_latest: !!row.latest, server_time: now, read_expires_at: expires };
    });
  }
  text(s, w) {
    if (s.state !== "ready" && s.state !== "review") throw new AssetError(409, "SOURCE_NOT_READY");
    if (s.kind !== "office") return s.text;
    if (!w || w.conversion_id !== s.conversion_id || w.sha256 !== s.ref?.sha256 || w.ordinal !== s.ordinal) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
    return w.text;
  }
  verifySelection(db, actor, spec, now, w) {
    const source = this.read(db, actor, spec, now);
    if (source.kind === "office" && !spec.conversion_id) throw new AssetError(422, "INVALID_CITATION");
    const text2 = this.text(source, w);
    const range = citationAnchor(text2, spec.start, spec.end);
    if (range.source_hash !== spec.source_hash) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
    return { title: source.title, kind: source.kind, text: text2, ...range };
  }
  selection(prior, spec, w) {
    return this.tx("read", (db, now) => this.verifySelection(db, this.actor(prior, now), spec, now, w));
  }
  checkStoredSelection(db, actor, spec, now) {
    const source = this.read(db, actor, spec, now);
    if (source.kind === "office") {
      if (!spec.conversion_id || source.conversion_id !== spec.conversion_id) throw notFound2();
      return;
    }
    resolveCitationText(this.text(source), spec);
  }
  locator(db, id) {
    const r = db.prepare("SELECT snapshot FROM citation_locators WHERE citation_id=?").get(id);
    return r ? JSON.parse(String(r.snapshot)) : null;
  }
  receipt(db, a, now, spec, key, range) {
    const old = db.prepare(`SELECT ${fields} FROM citations WHERE created_by=? AND request_key=?`).get(a.userId, key);
    if (!old) return;
    if (!this.allowed(a, String(old.asset_id), now)) throw notFound2();
    if (old.asset_id !== spec.asset_id || old.version_id !== spec.version_id || old.ordinal !== spec.ordinal || old.conversion_id !== (spec.conversion_id ?? null) || old.start !== range.start || old.end !== range.end || old.source_hash !== range.source_hash) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
    return { data: { ...dto2(old), locator: this.locator(db, String(old.id)) }, replayed: true };
  }
  replay(prior, spec, key, w) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), src = this.read(db, a, spec, now), text2 = this.text(src, w);
      if (!uuid2.test(key)) throw new AssetError(422, "INVALID_CITATION");
      if (sha2(text2) !== spec.source_hash) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
      return this.receipt(db, a, now, spec, key, citationAnchor(text2, spec.start, spec.end));
    });
  }
  create(prior, spec, key, w) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now), src = this.read(db, a, spec, now);
      if (!uuid2.test(key) || src.kind === "office" && !spec.conversion_id) throw new AssetError(422, "INVALID_CITATION");
      const text2 = this.text(src, w);
      if (sha2(text2) !== spec.source_hash) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
      const range = citationAnchor(text2, spec.start, spec.end);
      const old = this.receipt(db, a, now, spec, key, range);
      if (old) return old;
      const neighbor = (n) => {
        if (src.kind !== "text") return null;
        const r = db.prepare("SELECT anchor FROM text_blocks WHERE version_id=? AND ordinal=?").get(src.version_id, n);
        return r ? String(r.anchor) : null;
      };
      const locator = makeLocator(src, text2, spec.start, spec.end, { previous: neighbor(src.ordinal - 1), next: neighbor(src.ordinal + 1) }, w);
      const id = randomUUID11();
      db.prepare("INSERT INTO citations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id, a.userId, key, spec.asset_id, spec.version_id, spec.conversion_id ?? null, spec.ordinal, range.start, range.end, range.source_hash, range.quote_hash, now);
      db.prepare("INSERT INTO citation_locators(citation_id,snapshot) VALUES(?,?)").run(id, JSON.stringify(locator));
      return { data: { ...spec, ...range, id, locator }, replayed: false };
    });
  }
  lookup(db, a, id, now) {
    const r = db.prepare(`SELECT ${fields} FROM citations WHERE id=?`).get(id);
    if (!r || !this.allowed(a, String(r.asset_id), now)) throw notFound2();
    return dto2(r);
  }
  target(prior, id) {
    return this.tx("read", (db, now) => this.lookup(db, this.actor(prior, now), id, now));
  }
  knowledgeSource(db, actor, id, now) {
    const citation = this.lookup(db, actor, id, now);
    this.checkStoredSelection(db, actor, citation, now);
    return citation;
  }
  resolve(prior, id, w) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), r = this.lookup(db, a, id, now), source = this.read(db, a, r, now);
      return { ...r, quote: resolveCitationText(this.text(source, w), r), locator: this.locator(db, id) };
    });
  }
};

// src/host/citation-locator-schema.ts
var CITATION_LOCATOR_SCHEMA = `CREATE TABLE citation_locators (
  citation_id TEXT PRIMARY KEY REFERENCES citations(id),
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot) AND json_type(snapshot)='object')
) STRICT;`;

// src/host/note-store.ts
import { createHash as createHash10, randomUUID as randomUUID12 } from "node:crypto";

// src/host/note-input.ts
var noteKinds = ["plain", "reading", "project", "reflection"];
var noteLimits = { title: 200, body: 32e3, references: 64 };
var noteId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function noteText(value, max) {
  return typeof value === "string" && value.length <= max && value.isWellFormed() && !value.includes("\0");
}

// src/host/note-outline.ts
var outlineLimit = 256;
var Outline = class {
  byId;
  byParent = /* @__PURE__ */ new Map();
  constructor(nodes) {
    this.byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      if (n.parent_id === null) continue;
      const siblings = this.byParent.get(n.parent_id) ?? [];
      siblings.push(n);
      this.byParent.set(n.parent_id, siblings);
    }
    for (const list of this.byParent.values()) list.sort((a, b) => a.order_key - b.order_key);
  }
  children(id) {
    return this.byParent.get(id) ?? [];
  }
  descendants(id) {
    const out = [], stack = [...this.children(id)].reverse(), seen = /* @__PURE__ */ new Set([id]);
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n.id)) throw new Error("Outline has a cycle");
      seen.add(n.id);
      out.push(n);
      stack.push(...[...this.children(n.id)].reverse());
    }
    return out;
  }
  slots(parent, nodes) {
    return nodes.flatMap((n, order_key) => n.parent_id === parent && n.order_key === order_key ? [] : [{ id: n.id, parent_id: parent, order_key, archived: false }]);
  }
  move(id, parent, index) {
    const n = this.byId.get(id), target2 = this.byId.get(parent);
    if (!n?.parent_id || !target2 || id === parent || this.descendants(id).some((x) => x.id === parent)) return;
    const destination = this.children(parent).filter((x) => x.id !== id);
    if (!Number.isSafeInteger(index) || index < 0 || index > destination.length) return;
    destination.splice(index, 0, n);
    const source = n.parent_id === parent ? [] : this.slots(n.parent_id, this.children(n.parent_id).filter((x) => x.id !== id));
    return [...this.slots(parent, destination), ...source];
  }
  remove(id, mode) {
    const n = this.byId.get(id);
    if (!n?.parent_id) return;
    const kept = this.children(n.parent_id).flatMap((x) => x.id === id ? mode === "promote" ? this.children(id) : [] : [x]);
    const removed = mode === "subtree" ? [n, ...this.descendants(id)] : [n];
    return [...this.slots(n.parent_id, kept), ...removed.map((x) => ({ id: x.id, parent_id: x.parent_id, order_key: x.order_key, archived: true }))];
  }
};

// src/host/note-store.ts
var NOTE_SCHEMA = `CREATE TABLE notes (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, space_id TEXT NOT NULL REFERENCES spaces(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
  note_kind TEXT NOT NULL CHECK(note_kind IN ('plain','reading','project','reflection')),
  revision INTEGER NOT NULL CHECK(revision>=1), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  create_key TEXT NOT NULL, create_digest TEXT NOT NULL CHECK(length(create_digest)=64),
  UNIQUE(service_id, owner_user_id, create_key)
) STRICT;
CREATE INDEX notes_owner_order ON notes(service_id, owner_user_id, id);
CREATE TABLE note_nodes (
  id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id), parent_id TEXT,
  order_key INTEGER NOT NULL, body TEXT NOT NULL, body_revision INTEGER NOT NULL CHECK(body_revision>=1),
  UNIQUE(note_id,id), FOREIGN KEY(note_id,parent_id) REFERENCES note_nodes(note_id,id)
) STRICT;
CREATE UNIQUE INDEX note_single_root ON note_nodes(note_id) WHERE parent_id IS NULL;
CREATE TABLE note_references (
  id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES note_nodes(id), citation_id TEXT NOT NULL REFERENCES citations(id),
  UNIQUE(node_id,citation_id)
) STRICT;
CREATE TABLE project_note_refs (
  project_id TEXT NOT NULL REFERENCES knowledge_projects(id), note_id TEXT NOT NULL REFERENCES notes(id),
  created_at TEXT NOT NULL, PRIMARY KEY(project_id,note_id)
) STRICT;`;
var NOTE_OUTLINE_SCHEMA = `ALTER TABLE note_nodes ADD COLUMN archived_at TEXT CHECK(archived_at IS NULL OR parent_id IS NOT NULL);
CREATE INDEX note_outline_live ON note_nodes(note_id,parent_id,order_key) WHERE archived_at IS NULL;
CREATE TABLE note_outline_undo (
  note_id TEXT PRIMARY KEY REFERENCES notes(id), revision INTEGER NOT NULL CHECK(revision>=2),
  placements TEXT NOT NULL CHECK(json_valid(placements))
) STRICT;`;
var NOTE_LAYOUT_SCHEMA = `CREATE TABLE note_map_layouts (
  note_id TEXT PRIMARY KEY REFERENCES notes(id),
  direction TEXT NOT NULL CHECK(direction IN ('horizontal','vertical')),
  revision INTEGER NOT NULL CHECK(revision>=1)
) STRICT;`;
var rowFields = "id,title,note_kind AS kind,revision,updated_at";
var notFound3 = () => new AssetError(404, "NOTE_NOT_FOUND");
var invalid2 = () => new AssetError(422, "INVALID_NOTE");
var conflict = () => new AssetError(409, "REVISION_CONFLICT");
function draftValid(d) {
  if (!noteText(d.title, noteLimits.title) || !d.title.trim() || !noteText(d.body, noteLimits.body) || !noteKinds.includes(d.kind)) throw invalid2();
}
var NoteStore = class {
  constructor(tx, current, canReadAsset, projectMember, projectManager) {
    this.tx = tx;
    this.current = current;
    this.canReadAsset = canReadAsset;
    this.projectMember = projectMember;
    this.projectManager = projectManager;
  }
  actor(session, now, expected) {
    const actor = this.current(session, now);
    if (!actor) throw new AssetError(401, "AUTH_REQUIRED");
    if (expected !== void 0 && actor.userId !== expected) throw new AssetError(409, "ACTOR_CHANGED");
    return actor;
  }
  owned(db, a, id) {
    const row = db.prepare(`SELECT ${rowFields} FROM notes WHERE id=? AND service_id=? AND owner_user_id=?`).get(id, a.serviceId, a.userId);
    if (!row) throw notFound3();
    return row;
  }
  knowledgeSource(db, actor, id) {
    const note = this.owned(db, actor, id);
    const root = db.prepare("SELECT body FROM note_nodes WHERE note_id=? AND parent_id IS NULL AND archived_at IS NULL").get(id);
    if (!root) throw notFound3();
    const citations = db.prepare(`SELECT DISTINCT r.citation_id FROM note_references r JOIN note_nodes n ON n.id=r.node_id
      WHERE n.note_id=? AND n.archived_at IS NULL ORDER BY r.citation_id`).all(id).map((r) => String(r.citation_id));
    return { id, title: note.title, revision: note.revision, content_hash: createHash10("sha256").update(String(root.body)).digest("hex"), citations };
  }
  detail(db, a, id, now) {
    const meta = this.owned(db, a, id);
    const root = db.prepare("SELECT id,body FROM note_nodes WHERE note_id=? AND parent_id IS NULL").get(id);
    if (!root) throw Error("Note root is missing");
    const refs = db.prepare(`SELECT r.id,r.citation_id,c.asset_id,c.version_id FROM note_references r JOIN citations c ON c.id=r.citation_id
      WHERE r.node_id=? ORDER BY r.rowid`).all(root.id);
    return { ...meta, body: String(root.body), outline: { nodes: this.nodes(db, id), can_undo: !!this.undoRow(db, id, meta.revision) }, layout: this.layout(db, id), references: refs.map((r) => this.canReadAsset(a, String(r.asset_id), now) ? { id: String(r.id), status: "linked", citation_id: String(r.citation_id), asset_id: String(r.asset_id), version_id: String(r.version_id) } : { id: String(r.id), status: "unavailable" }) };
  }
  layout(db, id) {
    const row = db.prepare("SELECT direction,revision FROM note_map_layouts WHERE note_id=?").get(id);
    return row ? { direction: row.direction, revision: row.revision } : { direction: "horizontal", revision: 0 };
  }
  saveLayout(session, expected, id, revision, direction) {
    return this.tx("write", (db, now) => {
      const a = this.actor(session, now, expected);
      this.owned(db, a, id);
      if (!Number.isSafeInteger(revision) || revision < 0 || direction !== "horizontal" && direction !== "vertical") throw invalid2();
      const previous = this.layout(db, id);
      if (previous.revision !== revision) throw new AssetError(409, "LAYOUT_CONFLICT");
      if (previous.direction === direction) return previous;
      db.prepare(`INSERT INTO note_map_layouts VALUES(?,?,1)
      ON CONFLICT(note_id) DO UPDATE SET direction=excluded.direction,revision=note_map_layouts.revision+1`).run(id, direction);
      return this.layout(db, id);
    });
  }
  nodes(db, id) {
    return db.prepare(`SELECT id,parent_id,order_key,body,body_revision FROM note_nodes
      WHERE note_id=? AND archived_at IS NULL ORDER BY parent_id,order_key,id`).all(id);
  }
  undoRow(db, id, revision) {
    return db.prepare("SELECT placements FROM note_outline_undo WHERE note_id=? AND revision=?").get(id, revision);
  }
  assertRevision(expected, current) {
    if (!Number.isSafeInteger(expected) || expected < 1) throw invalid2();
    if (expected !== current) throw conflict();
  }
  deleteImpact(outline, id, revision, node) {
    if (!outline.byId.get(node)?.parent_id) throw new AssetError(422, "INVALID_OUTLINE_TARGET");
    const child_ids = outline.children(node).map((n) => n.id), descendant_ids = outline.descendants(node).map((n) => n.id);
    const preview_token = createHash10("sha256").update(JSON.stringify([id, revision, node, child_ids, descendant_ids])).digest("hex");
    return { preview_token, child_ids, descendant_ids };
  }
  previewDelete(session, expected, id, revision, node) {
    return this.tx("read", (db, now) => {
      const a = this.actor(session, now, expected), meta = this.owned(db, a, id);
      this.assertRevision(revision, meta.revision);
      return this.deleteImpact(new Outline(this.nodes(db, id)), id, revision, node);
    });
  }
  changeOutline(session, expected, id, revision, op) {
    return this.tx("write", (db, now) => {
      const a = this.actor(session, now, expected), meta = this.owned(db, a, id);
      this.assertRevision(revision, meta.revision);
      const outline = new Outline(this.nodes(db, id)), badTarget = () => new AssetError(422, "INVALID_OUTLINE_TARGET");
      let placements;
      if (op.action === "add") {
        if (!outline.byId.has(op.parent_id)) throw badTarget();
        if (!noteText(op.body, noteLimits.body)) throw invalid2();
        if (outline.byId.size >= outlineLimit) throw new AssetError(409, "OUTLINE_LIMIT");
        db.prepare("INSERT INTO note_nodes(id,note_id,parent_id,order_key,body,body_revision) VALUES(?,?,?,?,?,1)").run(randomUUID12(), id, op.parent_id, outline.children(op.parent_id).length, op.body);
      } else if (op.action === "edit") {
        const existing = outline.byId.get(op.node_id);
        if (!existing) throw badTarget();
        if (!noteText(op.body, noteLimits.body)) throw invalid2();
        if (existing.body === op.body) return this.detail(db, a, id, now);
        db.prepare("UPDATE note_nodes SET body=?,body_revision=body_revision+1 WHERE note_id=? AND id=?").run(op.body, id, op.node_id);
      } else if (op.action === "undo") {
        const previous = this.undoRow(db, id, revision);
        if (!previous) throw new AssetError(409, "OUTLINE_UNDO_UNAVAILABLE");
        placements = JSON.parse(String(previous.placements));
      } else if (op.action === "move") {
        placements = outline.move(op.node_id, op.parent_id, op.index);
        if (!placements) throw badTarget();
        if (!placements.length) return this.detail(db, a, id, now);
      } else {
        const impact = this.deleteImpact(outline, id, revision, op.node_id);
        if (op.preview_token !== impact.preview_token) throw new AssetError(409, "OUTLINE_PREVIEW_REQUIRED");
        if (op.mode !== "subtree" && op.mode !== "promote") throw invalid2();
        placements = outline.remove(op.node_id, op.mode);
        if (!placements) throw badTarget();
      }
      if (placements && op.action !== "undo") {
        const before = placements.map((p) => {
          const n = outline.byId.get(p.id);
          return { id: n.id, parent_id: n.parent_id, order_key: n.order_key, archived: false };
        });
        db.prepare(`INSERT INTO note_outline_undo VALUES(?,?,?)
        ON CONFLICT(note_id) DO UPDATE SET revision=excluded.revision,placements=excluded.placements`).run(id, revision + 1, JSON.stringify(before));
      } else db.prepare("DELETE FROM note_outline_undo WHERE note_id=?").run(id);
      if (placements) {
        const update = db.prepare("UPDATE note_nodes SET parent_id=?,order_key=?,archived_at=? WHERE note_id=? AND id=? AND parent_id IS NOT NULL");
        for (const p of placements) if (!update.run(p.parent_id, p.order_key, p.archived ? now : null, id, p.id).changes) throw new Error("Missing outline placement");
      }
      if (!db.prepare("UPDATE notes SET revision=revision+1,updated_at=? WHERE id=? AND revision=?").run(now, id, revision).changes) throw conflict();
      return this.detail(db, a, id, now);
    });
  }
  assertCitation(db, a, id, now) {
    if (!noteId.test(id)) throw invalid2();
    const c = db.prepare("SELECT asset_id FROM citations WHERE id=?").get(id);
    if (!c || !this.canReadAsset(a, String(c.asset_id), now)) throw new AssetError(404, "SOURCE_NOT_FOUND");
  }
  list(session, after = "") {
    return this.tx("read", (db, now) => {
      const a = this.actor(session, now);
      if (after && !noteId.test(after)) throw invalid2();
      const rows = db.prepare(`SELECT ${rowFields} FROM notes WHERE service_id=? AND owner_user_id=? AND id>? ORDER BY id LIMIT 51`).all(a.serviceId, a.userId, after);
      return { items: rows.slice(0, 50), next: rows.length > 50 ? rows[49].id : null };
    });
  }
  get(session, id) {
    return this.tx("read", (db, now) => this.detail(db, this.actor(session, now), id, now));
  }
  create(session, expected, key, d, citation) {
    return this.tx("write", (db, now) => {
      const a = this.actor(session, now, expected);
      draftValid(d);
      if (!noteId.test(key)) throw invalid2();
      const digest3 = createHash10("sha256").update(JSON.stringify([d.title, d.body, d.kind, ...citation === void 0 ? [] : [citation]])).digest("hex");
      const old = db.prepare("SELECT id,create_digest FROM notes WHERE service_id=? AND owner_user_id=? AND create_key=?").get(a.serviceId, a.userId, key);
      if (old) {
        if (old.create_digest !== digest3) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { data: this.detail(db, a, String(old.id), now), replayed: true };
      }
      const id = randomUUID12();
      if (citation !== void 0) this.assertCitation(db, a, citation, now);
      db.prepare("INSERT INTO notes VALUES(?,?,?,?,?,?,1,?,?,?,?)").run(id, a.serviceId, a.personalSpaceId, a.userId, d.title, d.kind, now, now, key, digest3);
      db.prepare("INSERT INTO note_nodes(id,note_id,parent_id,order_key,body,body_revision) VALUES(?,?,NULL,0,?,1)").run(id, id, d.body);
      if (citation !== void 0) db.prepare("INSERT INTO note_references VALUES(?,?,?)").run(randomUUID12(), id, citation);
      return { data: this.detail(db, a, id, now), replayed: false };
    });
  }
  save(session, expected, id, revision, patch) {
    return this.tx("write", (db, now) => {
      const a = this.actor(session, now, expected), old = this.detail(db, a, id, now);
      if (!Number.isSafeInteger(revision) || revision < 1 || !Object.keys(patch).length) throw invalid2();
      if (revision !== old.revision) throw conflict();
      const d = { title: patch.title ?? old.title, kind: patch.kind ?? old.kind, body: patch.body ?? old.body };
      draftValid(d);
      const { add_citation: add, remove_reference: remove } = patch;
      if (add !== void 0 && remove !== void 0) throw invalid2();
      let referenceChanged = false;
      if (add !== void 0) {
        this.assertCitation(db, a, add, now);
        if (!old.references.some((r) => r.citation_id === add)) {
          if (old.references.length >= noteLimits.references) throw new AssetError(409, "NOTE_REFERENCE_LIMIT");
          db.prepare("INSERT INTO note_references VALUES(?,?,?)").run(randomUUID12(), id, add);
          referenceChanged = true;
        }
      } else if (remove !== void 0) {
        if (!noteId.test(remove)) throw invalid2();
        referenceChanged = !!db.prepare("DELETE FROM note_references WHERE node_id=? AND id=?").run(id, remove).changes;
        if (!referenceChanged) throw notFound3();
      }
      if (referenceChanged || d.title !== old.title || d.kind !== old.kind || d.body !== old.body) {
        if (!db.prepare("UPDATE notes SET title=?,note_kind=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?").run(d.title, d.kind, now, id, revision).changes) throw conflict();
        db.prepare("DELETE FROM note_outline_undo WHERE note_id=?").run(id);
        if (d.body !== old.body) db.prepare("UPDATE note_nodes SET body=?,body_revision=body_revision+1 WHERE id=?").run(d.body, id);
      }
      return this.detail(db, a, id, now);
    });
  }
  linkProject(session, expected, project, id) {
    return this.tx("write", (db, now) => {
      const a = this.actor(session, now, expected);
      this.owned(db, a, id);
      if (!this.projectMember(a, project, now) || !this.projectManager(a, project)) throw new AssetError(404, "PROJECT_NOT_FOUND");
      const made = db.prepare("INSERT INTO project_note_refs VALUES(?,?,?) ON CONFLICT(project_id,note_id) DO NOTHING").run(project, id, now);
      return { project_id: project, note_id: id, replayed: !made.changes };
    });
  }
  managedProjects(session, after = "") {
    return this.tx("read", (db, now) => {
      const a = this.actor(session, now);
      if (after && !noteId.test(after)) throw invalid2();
      const items = db.prepare(`SELECT p.id,p.name FROM knowledge_projects p JOIN project_memberships m ON m.project_id=p.id AND m.user_id=?
      WHERE p.owner_user_id=? AND p.service_id=? AND p.status='active' AND p.id>? AND m.revoked_at IS NULL
      AND m.valid_from<=? AND (m.expires_at IS NULL OR m.expires_at>?) ORDER BY p.id LIMIT 51`).all(a.userId, a.userId, a.serviceId, after, now, now);
      return { items: items.slice(0, 50), next: items.length > 50 ? String(items[49].id) : null };
    });
  }
  projectRefs(session, project, after = "") {
    return this.tx("read", (db, now) => {
      const a = this.actor(session, now);
      if (after && !noteId.test(after)) throw invalid2();
      if (!this.projectMember(a, project, now)) throw new AssetError(404, "PROJECT_NOT_FOUND");
      const rows = db.prepare(`SELECT n.id,n.title,n.note_kind AS kind,n.revision,n.updated_at FROM project_note_refs r
      JOIN notes n ON n.id=r.note_id WHERE r.project_id=? AND n.service_id=? AND n.owner_user_id=? AND n.id>?
      ORDER BY n.id LIMIT 51`).all(project, a.serviceId, a.userId, after);
      return { items: rows.slice(0, 50), next: rows.length > 50 ? rows[49].id : null };
    });
  }
};

// src/host/term-store.ts
var TERM_SCHEMA = `
CREATE TABLE saved_terms (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
  asset_id TEXT NOT NULL REFERENCES assets(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  conversion_id TEXT REFERENCES office_conversions(id), ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  start INTEGER NOT NULL CHECK(start>=0), end INTEGER NOT NULL CHECK(end>start),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64), quote_hash TEXT NOT NULL CHECK(length(quote_hash)=64),
  explanation_json TEXT NOT NULL, supplement TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE INDEX saved_terms_owner_source ON saved_terms(service_id,owner_id,asset_id,version_id,created_at,id);
`;
var sourceUrl = (spec) => "/knowledgeos/reader?" + new URLSearchParams({
  asset: spec.asset_id,
  version: spec.version_id,
  unit: String(spec.ordinal),
  match: spec.start + ":" + spec.end + ":" + spec.source_hash,
  ...spec.conversion_id ? { conversion: spec.conversion_id } : {}
});
function trimBoundary(text2, offset, delta) {
  if (offset > 0 && offset < text2.length && /[\uD800-\uDBFF]/.test(text2.charAt(offset - 1)) && /[\uDC00-\uDFFF]/.test(text2.charAt(offset))) return offset + delta;
  return offset;
}
function termWindow(spec, verified) {
  const { text: text2, start, end, title, kind, quote_hash } = verified;
  const from = trimBoundary(text2, Math.max(0, start - 220), 1);
  const to = trimBoundary(text2, Math.min(text2.length, end + 220), -1);
  const quote = text2.slice(start, end), before = text2.slice(from, start), after = text2.slice(end, to);
  const source = { ...spec, quote_hash, quote, excerpt: text2.slice(from, to), title, kind, origin: sourceUrl(spec) };
  return { source, before, after };
}
var TermStore = class {
  constructor(tx, current, citations) {
    this.tx = tx;
    this.current = current;
    this.citations = citations;
  }
  actor(session, now) {
    const actor = this.current(session, now);
    if (!actor) throw new AssetError(401, "AUTH_REQUIRED");
    return actor;
  }
  selection(session, spec, witness) {
    return termWindow(spec, this.citations.selection(session, spec, witness));
  }
  row(db, actor, id) {
    return db.prepare("SELECT * FROM saved_terms WHERE service_id=? AND owner_id=? AND id=?").get(actor.serviceId, actor.userId, id);
  }
  view(db, actor, row, now) {
    const spec = {
      asset_id: row.asset_id,
      version_id: row.version_id,
      ordinal: row.ordinal,
      start: row.start,
      end: row.end,
      source_hash: row.source_hash,
      ...row.conversion_id ? { conversion_id: row.conversion_id } : {}
    };
    this.citations.checkStoredSelection(db, actor, { ...spec, quote_hash: row.quote_hash }, now);
    const { term, explanation } = JSON.parse(row.explanation_json);
    return {
      id: row.id,
      term,
      explanation,
      supplement: row.supplement,
      provider: row.provider,
      model: row.model,
      source: { ...spec, quote_hash: row.quote_hash, origin: sourceUrl(spec) },
      created_at: row.created_at
    };
  }
  find(session, id) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(session, now), row = this.row(db, actor, id);
      return row ? this.view(db, actor, row, now) : void 0;
    });
  }
  knowledgeSource(db, actor, id, now) {
    const row = this.row(db, actor, id);
    if (!row) throw new AssetError(404, "SOURCE_NOT_FOUND");
    return this.view(db, actor, row, now);
  }
  list(session, asset, version) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(session, now);
      this.citations.validateTaskMaterial(db, actor, { asset_id: asset, version_id: version, ordinal: 1 }, now);
      const rows = db.prepare("SELECT * FROM saved_terms WHERE service_id=? AND owner_id=? AND asset_id=? AND version_id=? ORDER BY created_at DESC,id DESC LIMIT 100").all(actor.serviceId, actor.userId, asset, version);
      return rows.flatMap((row) => {
        try {
          return [this.view(db, actor, row, now)];
        } catch (error) {
          if (error instanceof AssetError && ["CITATION_SOURCE_CHANGED", "SOURCE_NOT_READY", "SOURCE_NOT_FOUND"].includes(error.code)) return [];
          throw error;
        }
      });
    });
  }
  save(session, card, supplement, witness) {
    return this.tx("write", (db, now) => {
      const actor = this.actor(session, now), source = card.source;
      const verified = this.citations.verifySelection(db, actor, source, now, witness);
      if (verified.quote_hash !== source.quote_hash) throw new AssetError(409, "CITATION_SOURCE_CHANGED");
      const existing = this.row(db, actor, card.explanation_id);
      if (existing) {
        if (existing.supplement !== supplement) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { term: this.view(db, actor, existing, now), replayed: true };
      }
      const count = db.prepare("SELECT count(*) n FROM saved_terms WHERE service_id=? AND owner_id=? AND asset_id=? AND version_id=?").get(actor.serviceId, actor.userId, source.asset_id, source.version_id)?.n;
      if (Number(count) >= 100) throw new AssetError(409, "TERM_QUOTA");
      db.prepare("INSERT INTO saved_terms VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
        card.explanation_id,
        actor.serviceId,
        actor.userId,
        source.asset_id,
        source.version_id,
        source.conversion_id ?? null,
        source.ordinal,
        source.start,
        source.end,
        source.source_hash,
        source.quote_hash,
        JSON.stringify({ term: card.term, explanation: card.explanation }),
        supplement,
        card.provider,
        card.model,
        now
      );
      return { term: this.view(db, actor, this.row(db, actor, card.explanation_id), now), replayed: false };
    });
  }
};

// src/host/knowledge-store.ts
import { createHash as createHash11, randomUUID as randomUUID13 } from "node:crypto";
var KNOWLEDGE_SCHEMA = `
CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('term','concept','case','solution')),
  domain TEXT NOT NULL CHECK(domain IN ('software_engineering','system_architecture','hardware_engineering','ai_development')),
  current_version_id TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(id,current_version_id) REFERENCES knowledge_versions(item_id,id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE knowledge_versions (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES knowledge_items(id),
  revision INTEGER NOT NULL CHECK(revision>=1), title TEXT NOT NULL, definition TEXT NOT NULL, plain_explanation TEXT NOT NULL, context TEXT NOT NULL,
  sources_json TEXT NOT NULL, author_kind TEXT NOT NULL CHECK(author_kind IN ('human','assisted')),
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  confirmation_state TEXT NOT NULL CHECK(confirmation_state IN ('pending','confirmed')),
  confirmed_by TEXT REFERENCES users(id), confirmed_at TEXT,
  CHECK((confirmation_state='confirmed')=(confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  CHECK((confirmed_by IS NULL)=(confirmed_at IS NULL)), UNIQUE(item_id,revision), UNIQUE(item_id,id)
) STRICT;
CREATE TABLE knowledge_write_receipts (
  service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  digest TEXT NOT NULL CHECK(length(digest)=64), item_id TEXT NOT NULL, version_id TEXT NOT NULL,
  FOREIGN KEY(item_id,version_id) REFERENCES knowledge_versions(item_id,id), PRIMARY KEY(service_id,owner_id,request_key)
) STRICT;
CREATE INDEX knowledge_items_owner ON knowledge_items(service_id,owner_id,created_at,id);
`;
var noAccess = () => new AssetError(404, "KNOWLEDGE_ITEM_NOT_FOUND");
var invalidSource = () => new AssetError(404, "SOURCE_NOT_FOUND");
var conflict2 = () => new AssetError(409, "REVISION_CONFLICT");
var hash2 = (value) => createHash11("sha256").update(JSON.stringify(value)).digest("hex");
var origin = (source) => "/knowledgeos/reader?" + new URLSearchParams({
  asset: source.asset_id,
  version: source.version_id,
  citation: source.id
});
var KnowledgeStore = class {
  constructor(tx, current, citations, notes, terms) {
    this.tx = tx;
    this.current = current;
    this.citations = citations;
    this.notes = notes;
    this.terms = terms;
  }
  actor(prior, now) {
    const actor = this.current(prior, now);
    if (!actor) throw new AssetError(401, "AUTH_REQUIRED");
    return actor;
  }
  owned(db, actor, id) {
    const row = db.prepare("SELECT id,kind,domain,current_version_id,created_at FROM knowledge_items WHERE service_id=? AND owner_id=? AND id=?").get(actor.serviceId, actor.userId, id);
    if (!row) throw noAccess();
    return row;
  }
  version(db, item, revision) {
    const row = revision === void 0 ? db.prepare("SELECT * FROM knowledge_versions WHERE item_id=? AND id=?").get(item.id, item.current_version_id) : db.prepare("SELECT * FROM knowledge_versions WHERE item_id=? AND revision=?").get(item.id, revision);
    if (!row) throw noAccess();
    return row;
  }
  pin(db, actor, inputs, now) {
    return inputs.map((input) => {
      if (input.type === "citation") return { type: "citation", ...this.citations.knowledgeSource(db, actor, input.id, now) };
      if (input.type === "term") {
        const term = this.terms.knowledgeSource(db, actor, input.id, now);
        return { type: "term", id: term.id, title: term.term, provenance: term.source, provider: term.provider, model: term.model };
      }
      if (input.type !== "note") throw invalidSource();
      const { citations, ...note } = this.notes.knowledgeSource(db, actor, input.id);
      if (note.revision !== input.revision) throw new AssetError(409, "KNOWLEDGE_SOURCE_CHANGED");
      return { type: "note", ...note, dependencies: citations.map((id) => this.citations.knowledgeSource(db, actor, id, now)) };
    });
  }
  validatedSources(db, actor, row, now) {
    return JSON.parse(row.sources_json).map((source) => {
      if (source.type === "citation") {
        this.citations.checkStoredSelection(db, actor, source, now);
        return { ...source, category: "excerpt", state: "fixed", href: origin(source) };
      }
      if (source.type === "term") {
        this.citations.checkStoredSelection(db, actor, source.provenance, now);
        this.terms.knowledgeSource(db, actor, source.id, now);
        return { ...source, category: "assisted", state: "fixed", href: source.provenance.origin };
      }
      const note = this.notes.knowledgeSource(db, actor, source.id);
      for (const citation of source.dependencies) this.citations.checkStoredSelection(db, actor, citation, now);
      const { dependencies, ...witness } = source;
      const stable = note.revision === source.revision && note.content_hash === source.content_hash;
      return {
        ...witness,
        dependency_count: dependencies.length,
        category: "note",
        state: stable ? "fixed" : "changed",
        href: stable ? "/knowledgeos/notes?" + new URLSearchParams({ note: source.id }) : null
      };
    });
  }
  view(db, actor, item, row, now) {
    const sources2 = this.validatedSources(db, actor, row, now);
    return {
      id: item.id,
      version_id: row.id,
      version: row.revision,
      is_current: row.id === item.current_version_id,
      kind: item.kind,
      domain: item.domain,
      title: row.title,
      definition: row.definition,
      plain_explanation: row.plain_explanation,
      context: row.context,
      sources: sources2,
      source_kind: sources2.length ? "sourced" : "original",
      author_kind: row.author_kind,
      created_by: row.created_by,
      created_at: row.created_at,
      confirmation_state: row.confirmation_state,
      confirmed_by: row.confirmed_by,
      confirmed_at: row.confirmed_at
    };
  }
  relationNode(db, actor, id, now, pinned) {
    const item = this.owned(db, actor, id);
    const row = pinned === void 0 ? this.version(db, item) : db.prepare("SELECT * FROM knowledge_versions WHERE item_id=? AND id=?").get(item.id, pinned);
    if (!row) throw noAccess();
    const sources2 = this.validatedSources(db, actor, row, now);
    const changed2 = row.id !== item.current_version_id || sources2.some((source) => source.state === "changed");
    if (pinned === void 0 && (changed2 || row.confirmation_state !== "confirmed")) throw new AssetError(409, "RELATION_NODE_UNCONFIRMED");
    return { id, version_id: row.id, kind: item.kind, domain: item.domain, title: row.title, definition: row.definition, changed: changed2 };
  }
  visible(operation) {
    try {
      return [operation()];
    } catch (error) {
      if (error instanceof AssetError && [404, 409].includes(error.status)) return [];
      throw error;
    }
  }
  list(prior) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now);
      const rows = db.prepare("SELECT id,kind,domain,current_version_id,created_at FROM knowledge_items WHERE service_id=? AND owner_id=? ORDER BY created_at DESC,id DESC").all(actor.serviceId, actor.userId);
      return rows.flatMap((row) => this.visible(() => {
        const version = this.version(db, row), item = this.view(db, actor, row, version, now);
        const { id, title, domain, kind, version_id, confirmation_state, source_kind } = item;
        return { id, title, domain, kind, version_id, version: version.revision, confirmation_state, source_kind };
      }));
    });
  }
  get(prior, id, revision) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now), item = this.owned(db, actor, id);
      return this.view(db, actor, item, this.version(db, item, revision), now);
    });
  }
  history(prior, id) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now), item = this.owned(db, actor, id);
      const versions = db.prepare("SELECT * FROM knowledge_versions WHERE item_id=? ORDER BY revision DESC").all(id);
      return versions.flatMap((row) => this.visible(() => {
        this.validatedSources(db, actor, row, now);
        return { version: row.revision, version_id: row.id, confirmation_state: row.confirmation_state, created_at: row.created_at, is_current: row.id === item.current_version_id };
      }));
    });
  }
  insert(db, item, actor, revision, data, sources2, now, confirm) {
    const row = {
      id: randomUUID13(),
      item_id: item.id,
      revision,
      title: data.title,
      definition: data.definition,
      plain_explanation: data.plain_explanation,
      context: data.context,
      sources_json: JSON.stringify(sources2),
      author_kind: sources2.some((s) => s.type === "term") ? "assisted" : "human",
      created_by: actor.userId,
      created_at: now,
      confirmation_state: confirm ? "confirmed" : "pending",
      confirmed_by: confirm ? actor.userId : null,
      confirmed_at: confirm ? now : null
    };
    db.prepare("INSERT INTO knowledge_versions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      row.id,
      row.item_id,
      row.revision,
      row.title,
      row.definition,
      row.plain_explanation,
      row.context,
      row.sources_json,
      row.author_kind,
      row.created_by,
      row.created_at,
      row.confirmation_state,
      row.confirmed_by,
      row.confirmed_at
    );
    return row;
  }
  write(prior, key, action, apply) {
    return this.tx("write", (db, now) => {
      const actor = this.actor(prior, now), digest3 = hash2(action);
      const receipt3 = db.prepare("SELECT item_id,version_id,digest FROM knowledge_write_receipts WHERE service_id=? AND owner_id=? AND request_key=?").get(actor.serviceId, actor.userId, key);
      if (receipt3) {
        const item2 = this.owned(db, actor, String(receipt3.item_id));
        const row2 = db.prepare("SELECT * FROM knowledge_versions WHERE item_id=? AND id=?").get(item2.id, receipt3.version_id);
        const result = this.view(db, actor, item2, row2, now);
        if (receipt3.digest !== digest3) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { item: result, replayed: true };
      }
      const { item, row } = apply(db, actor, now);
      db.prepare("INSERT INTO knowledge_write_receipts VALUES(?,?,?,?,?,?)").run(actor.serviceId, actor.userId, key, digest3, item.id, row.id);
      return { item: this.view(db, actor, item, row, now), replayed: false };
    });
  }
  create(prior, key, input) {
    return this.write(prior, key, ["create", input], (db, actor, now) => {
      const { kind, domain, sources: sources2, ...draft } = input;
      const pinned = this.pin(db, actor, sources2, now);
      const item = { id: randomUUID13(), kind, domain, current_version_id: "", created_at: now };
      db.prepare("INSERT INTO knowledge_items VALUES(?,?,?,?,?,?,?)").run(item.id, actor.serviceId, actor.userId, kind, domain, "", now);
      const row = this.insert(db, item, actor, 1, draft, pinned, now, false);
      db.prepare("UPDATE knowledge_items SET current_version_id=? WHERE id=?").run(row.id, item.id);
      return { item: { ...item, current_version_id: row.id }, row };
    });
  }
  update(prior, key, id, expected, draft) {
    return this.write(prior, key, [draft ? "correct" : "confirm", id, expected, draft], (db, actor, now) => {
      const item = this.owned(db, actor, id), current = this.version(db, item);
      const previous = this.validatedSources(db, actor, current, now);
      if (expected !== current.revision || current.revision >= Number.MAX_SAFE_INTEGER) throw conflict2();
      if (!draft && current.confirmation_state === "confirmed") throw new AssetError(409, "ALREADY_CONFIRMED");
      if (!draft && previous.some((source) => source.state === "changed")) throw new AssetError(409, "KNOWLEDGE_SOURCE_CHANGED");
      const pinned = draft ? this.pin(db, actor, draft.sources, now) : JSON.parse(current.sources_json);
      const row = this.insert(db, item, actor, current.revision + 1, draft ?? current, pinned, now, !draft);
      if (Number(db.prepare("UPDATE knowledge_items SET current_version_id=? WHERE id=? AND current_version_id=?").run(row.id, item.id, current.id).changes) !== 1) throw conflict2();
      return { item: { ...item, current_version_id: row.id }, row };
    });
  }
};

// src/host/ontology-store.ts
import { createHash as createHash12, randomUUID as randomUUID14 } from "node:crypto";
var ONTOLOGY_SCHEMA = `
CREATE TABLE relation_types (
  id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>=1), label TEXT NOT NULL,
  from_kinds TEXT NOT NULL, to_kinds TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('directed','symmetric')),
  same_domain INTEGER NOT NULL CHECK(same_domain IN (0,1)), same_kind INTEGER NOT NULL CHECK(same_kind IN (0,1)),
  PRIMARY KEY(id,version)
) STRICT;
INSERT INTO relation_types VALUES
  ('solves',1,'\u89E3\u51B3','["solution"]','["case"]','directed',1,0),
  ('depends_on',1,'\u4F9D\u8D56','["term","concept","case","solution"]','["concept"]','directed',1,0),
  ('compares',1,'\u5BF9\u6BD4','["term","concept","case","solution"]','["term","concept","case","solution"]','symmetric',1,1);
CREATE TABLE knowledge_relations (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
  current_version_id TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(id,current_version_id) REFERENCES relation_versions(relation_id,id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE relation_versions (
  id TEXT PRIMARY KEY, relation_id TEXT NOT NULL REFERENCES knowledge_relations(id), revision INTEGER NOT NULL CHECK(revision>=1),
  from_id TEXT NOT NULL, from_version_id TEXT NOT NULL, to_id TEXT NOT NULL, to_version_id TEXT NOT NULL,
  relation_type TEXT NOT NULL, relation_type_version INTEGER NOT NULL, evidence_json TEXT NOT NULL,
  proposal_kind TEXT NOT NULL CHECK(proposal_kind IN ('human','ai')), proposal_actor TEXT NOT NULL REFERENCES users(id),
  provider TEXT, model TEXT, reason TEXT,
  state TEXT NOT NULL CHECK(state IN ('proposed','confirmed','rejected')), review_action TEXT CHECK(review_action IN ('correct','confirm','reject')),
  reviewed_by TEXT REFERENCES users(id), created_at TEXT NOT NULL,
  CHECK(from_id<>to_id),
  CHECK((proposal_kind='ai')=(provider IS NOT NULL AND model IS NOT NULL AND reason IS NOT NULL)),
  CHECK((review_action IS NULL)=(reviewed_by IS NULL)),
  CHECK(CASE state WHEN 'confirmed' THEN review_action IS 'confirm' WHEN 'rejected' THEN review_action IS 'reject'
    ELSE review_action IS NULL OR review_action IS 'correct' END),
  FOREIGN KEY(from_id,from_version_id) REFERENCES knowledge_versions(item_id,id),
  FOREIGN KEY(to_id,to_version_id) REFERENCES knowledge_versions(item_id,id),
  FOREIGN KEY(relation_type,relation_type_version) REFERENCES relation_types(id,version),
  UNIQUE(relation_id,revision), UNIQUE(relation_id,id)
) STRICT;
CREATE INDEX relations_owner ON knowledge_relations(service_id,owner_id,created_at,id);
CREATE INDEX relation_pair ON relation_versions(relation_type,from_id,to_id,state);
CREATE TABLE relation_write_receipts (
  service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  digest TEXT NOT NULL CHECK(length(digest)=64), relation_id TEXT NOT NULL, version_id TEXT NOT NULL,
  FOREIGN KEY(relation_id,version_id) REFERENCES relation_versions(relation_id,id),
  PRIMARY KEY(service_id,owner_id,request_key)
) STRICT;
`;
var hidden2 = () => new AssetError(404, "RELATION_NOT_FOUND");
var stale = () => new AssetError(409, "RELATION_SOURCE_CHANGED");
var hash3 = (data) => createHash12("sha256").update(JSON.stringify(data)).digest("hex");
var OntologyStore = class {
  constructor(tx, current, knowledge, citations) {
    this.tx = tx;
    this.current = current;
    this.knowledge = knowledge;
    this.citations = citations;
  }
  actor(prior, now) {
    const actor = this.current(prior, now);
    if (!actor) throw new AssetError(401, "AUTH_REQUIRED");
    return actor;
  }
  rules(db) {
    return db.prepare(`SELECT r.* FROM relation_types r
      WHERE r.version=(SELECT max(v.version) FROM relation_types v WHERE v.id=r.id) ORDER BY r.id`).all().map((row) => ({
      id: String(row.id),
      label: String(row.label),
      version: Number(row.version),
      from_kinds: JSON.parse(String(row.from_kinds)),
      to_kinds: JSON.parse(String(row.to_kinds)),
      direction: row.direction,
      same_domain: row.same_domain === 1,
      same_kind: row.same_kind === 1
    }));
  }
  types(prior) {
    return this.tx("read", (db, now) => {
      this.actor(prior, now);
      return this.rules(db);
    });
  }
  node(db, actor, id, now, pinned) {
    try {
      return this.knowledge.relationNode(db, actor, id, now, pinned);
    } catch (error) {
      if (error instanceof AssetError && error.status === 404) throw hidden2();
      throw error;
    }
  }
  evidence(db, actor, id, now) {
    try {
      return this.citations.knowledgeSource(db, actor, id, now);
    } catch (error) {
      if (error instanceof AssetError && error.status === 404) throw hidden2();
      throw error;
    }
  }
  changed(db, citation) {
    return citation.version_id !== db.prepare("SELECT id FROM asset_versions WHERE asset_id=? ORDER BY version DESC LIMIT 1").get(citation.asset_id)?.id;
  }
  inputs(db, actor, pair, now) {
    const from = this.node(db, actor, pair.from_id, now);
    const to = this.node(db, actor, pair.to_id, now);
    const evidence = pair.evidence_citation_ids.map((id) => this.evidence(db, actor, id, now));
    if (evidence.some((citation) => this.changed(db, citation))) throw stale();
    const rules = this.rules(db).filter((rule) => from.id !== to.id && rule.from_kinds.includes(from.kind) && rule.to_kinds.includes(to.kind) && (!rule.same_domain || from.domain === to.domain) && (!rule.same_kind || from.kind === to.kind));
    return { from, to, evidence, rules, fingerprint: hash3([from.version_id, to.version_id, evidence, rules]) };
  }
  owned(db, actor, id) {
    const row = db.prepare("SELECT id,current_version_id FROM knowledge_relations WHERE service_id=? AND owner_id=? AND id=?").get(actor.serviceId, actor.userId, id);
    if (!row) throw hidden2();
    return row;
  }
  version(db, relation, revision) {
    const row = revision === void 0 ? db.prepare("SELECT * FROM relation_versions WHERE relation_id=? AND id=?").get(relation.id, relation.current_version_id) : db.prepare("SELECT * FROM relation_versions WHERE relation_id=? AND revision=?").get(relation.id, revision);
    if (!row) throw hidden2();
    return row;
  }
  view(db, actor, row, now) {
    const from = this.node(db, actor, row.from_id, now, row.from_version_id);
    const to = this.node(db, actor, row.to_id, now, row.to_version_id);
    const evidence = JSON.parse(row.evidence_json).map((citation) => {
      const current = this.evidence(db, actor, citation.id, now);
      if (hash3(current) !== hash3(citation)) throw stale();
      return {
        ...citation,
        state: this.changed(db, citation) ? "changed" : "fixed",
        href: "/knowledgeos/reader?" + new URLSearchParams({ asset: citation.asset_id, version: citation.version_id, citation: citation.id })
      };
    });
    const changed2 = from.changed || to.changed || evidence.some((item) => item.state === "changed") || db.prepare("SELECT max(version) version FROM relation_types WHERE id=?").get(row.relation_type)?.version !== row.relation_type_version;
    const summary = ({ id, version_id, kind, domain, title }) => ({ id, version_id, kind, domain, title });
    return {
      id: row.relation_id,
      version_id: row.id,
      revision: row.revision,
      from: summary(from),
      to: summary(to),
      relation_type: row.relation_type,
      relation_type_version: row.relation_type_version,
      recorded_state: row.state,
      state: changed2 && row.state !== "rejected" ? "needs_review" : row.state,
      evidence,
      proposal: { kind: row.proposal_kind, actor_id: row.proposal_actor, provider: row.provider, model: row.model, reason: row.reason },
      review: row.review_action ? { action: row.review_action, actor_id: row.reviewed_by, at: row.created_at } : null,
      created_at: row.created_at
    };
  }
  accessible(operation) {
    try {
      return [operation()];
    } catch (error) {
      if (error instanceof AssetError && (error.status === 404 || error.status === 409)) return [];
      throw error;
    }
  }
  list(prior) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now);
      const rows = db.prepare("SELECT id,current_version_id FROM knowledge_relations WHERE service_id=? AND owner_id=? ORDER BY created_at DESC,id DESC").all(actor.serviceId, actor.userId);
      const relations = rows.flatMap((row) => this.accessible(() => this.view(db, actor, this.version(db, row), now)));
      return { relations, facts: relations.filter((row) => row.state === "confirmed") };
    });
  }
  get(prior, id, revision) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now), relation = this.owned(db, actor, id);
      return this.view(db, actor, this.version(db, relation, revision), now);
    });
  }
  history(prior, id) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now), relation = this.owned(db, actor, id);
      const rows = db.prepare("SELECT * FROM relation_versions WHERE relation_id=? ORDER BY revision DESC").all(relation.id);
      const versions = rows.flatMap((row) => this.accessible(() => this.view(db, actor, row, now)));
      if (!versions.length) throw hidden2();
      return versions;
    });
  }
  replay(db, actor, key, action, now) {
    const receipt3 = db.prepare("SELECT digest,relation_id,version_id FROM relation_write_receipts WHERE service_id=? AND owner_id=? AND request_key=?").get(actor.serviceId, actor.userId, key);
    if (!receipt3) return;
    const relation = this.owned(db, actor, String(receipt3.relation_id));
    const row = db.prepare("SELECT * FROM relation_versions WHERE relation_id=? AND id=?").get(relation.id, String(receipt3.version_id));
    const value = this.view(db, actor, row, now);
    if (receipt3.digest !== hash3(action)) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
    return { relation: value, replayed: true };
  }
  prepareModel(prior, key, pair) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(prior, now);
      const receipt3 = this.replay(db, actor, key, ["ai", pair], now);
      if (receipt3) return { receipt: receipt3 };
      const input = this.inputs(db, actor, pair, now);
      if (!input.rules.length) throw new AssetError(422, "RELATION_RULE_VIOLATION");
      return { input };
    });
  }
  write(prior, key, action, apply) {
    return this.tx("write", (db, now) => {
      const actor = this.actor(prior, now), replay = this.replay(db, actor, key, action, now);
      if (replay) return replay;
      const row = apply(db, actor, now);
      db.prepare("INSERT INTO relation_write_receipts VALUES(?,?,?,?,?,?)").run(actor.serviceId, actor.userId, key, hash3(action), row.relation_id, row.id);
      return { relation: this.view(db, actor, row, now), replayed: false };
    });
  }
  draft(db, actor, id, pair, type, now, fingerprint) {
    const { from, to, evidence, rules, fingerprint: current } = this.inputs(db, actor, pair, now);
    if (fingerprint !== void 0 && current !== fingerprint) throw stale();
    const rule = rules.find((value) => value.id === type);
    if (!rule) throw new AssetError(422, "RELATION_RULE_VIOLATION");
    const [start, end] = rule.direction === "symmetric" && from.id > to.id ? [to, from] : [from, to];
    const duplicate = db.prepare(`SELECT 1 FROM relation_versions v JOIN knowledge_relations r ON r.current_version_id=v.id
      WHERE r.service_id=? AND r.owner_id=? AND r.id<>? AND v.relation_type=? AND v.from_id=? AND v.to_id=? AND v.state<>'rejected'`).get(actor.serviceId, actor.userId, id, rule.id, start.id, end.id);
    if (duplicate) throw new AssetError(409, "DUPLICATE_RELATION");
    return {
      from_id: start.id,
      from_version_id: start.version_id,
      to_id: end.id,
      to_version_id: end.version_id,
      relation_type: rule.id,
      relation_type_version: rule.version,
      evidence_json: JSON.stringify(evidence)
    };
  }
  insert(db, relation, row) {
    db.prepare("INSERT INTO relation_versions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      row.id,
      row.relation_id,
      row.revision,
      row.from_id,
      row.from_version_id,
      row.to_id,
      row.to_version_id,
      row.relation_type,
      row.relation_type_version,
      row.evidence_json,
      row.proposal_kind,
      row.proposal_actor,
      row.provider,
      row.model,
      row.reason,
      row.state,
      row.review_action,
      row.reviewed_by,
      row.created_at
    );
    if (Number(db.prepare("UPDATE knowledge_relations SET current_version_id=? WHERE id=? AND current_version_id=?").run(row.id, relation.id, relation.current_version_id).changes) !== 1) throw new AssetError(409, "REVISION_CONFLICT");
    return row;
  }
  create(prior, key, pair, type, proposal, fingerprint) {
    return this.write(prior, key, proposal ? ["ai", pair] : ["human", pair, type], (db, actor, now) => {
      const relation = { id: randomUUID14(), current_version_id: "" };
      const draft = this.draft(db, actor, relation.id, pair, type, now, fingerprint);
      db.prepare("INSERT INTO knowledge_relations VALUES(?,?,?,?,?)").run(relation.id, actor.serviceId, actor.userId, "", now);
      return this.insert(db, relation, {
        ...draft,
        id: randomUUID14(),
        relation_id: relation.id,
        revision: 1,
        created_at: now,
        proposal_kind: proposal ? "ai" : "human",
        proposal_actor: actor.userId,
        provider: proposal?.provider ?? null,
        model: proposal?.model ?? null,
        reason: proposal?.reason ?? null,
        state: "proposed",
        review_action: null,
        reviewed_by: null
      });
    });
  }
  review(prior, key, id, expected, action, correction) {
    return this.write(prior, key, ["review", id, expected, action, correction], (db, actor, now) => {
      const relation = this.owned(db, actor, id), current = this.version(db, relation);
      const previous = this.view(db, actor, current, now);
      if (expected !== current.revision || expected >= Number.MAX_SAFE_INTEGER) throw new AssetError(409, "REVISION_CONFLICT");
      if (action === "confirm" && previous.state === "needs_review") throw stale();
      if (action === "confirm" && previous.state !== "proposed" || action === "reject" && previous.state === "rejected")
        throw new AssetError(409, "INVALID_RELATION_REVIEW_STATE");
      const next = correction ? this.draft(db, actor, id, correction, correction.relation_type, now) : current;
      return this.insert(db, relation, {
        ...current,
        ...next,
        id: randomUUID14(),
        revision: current.revision + 1,
        created_at: now,
        state: action === "confirm" ? "confirmed" : action === "reject" ? "rejected" : "proposed",
        review_action: action,
        reviewed_by: actor.userId
      });
    });
  }
};

// src/host/repository-store.ts
import { randomUUID as randomUUID15 } from "node:crypto";

// src/host/github-repository.ts
import { createHash as createHash14 } from "node:crypto";

// src/host/repository-tree.ts
import { createHash as createHash13 } from "node:crypto";
function treeDigest(entries) {
  const sorted = entries.map((entry) => {
    const name = entry.path.slice(entry.path.lastIndexOf("/") + 1);
    return { entry, name, order: Buffer.from(name + (entry.kind === "directory" ? "/" : "\0")) };
  }).sort((a, b) => Buffer.compare(a.order, b.order));
  const bytes = Buffer.concat(sorted.flatMap(({ entry, name }) => [
    Buffer.from(entry.mode.replace(/^0/, "") + " " + name + "\0"),
    Buffer.from(entry.sha, "hex")
  ]));
  return createHash13("sha1").update("tree " + bytes.length + "\0").update(bytes).digest("hex");
}
function validateRepositoryTree(entries) {
  const children = /* @__PURE__ */ new Map();
  for (const entry of entries.values()) {
    const slash = entry.path.lastIndexOf("/");
    const parent = slash < 0 ? "" : entry.path.slice(0, slash);
    if (parent && entries.get(parent)?.kind !== "directory") throw new AssetError(502, "REPOSITORY_INVALID_RESPONSE");
    const group = children.get(parent) ?? [];
    group.push(entry);
    children.set(parent, group);
  }
  for (const entry of entries.values()) {
    if (entry.kind === "directory" && entry.sha !== treeDigest(children.get(entry.path) ?? [])) throw new AssetError(502, "REPOSITORY_INVALID_RESPONSE");
  }
  return treeDigest(children.get("") ?? []);
}

// src/host/github-repository.ts
var repositoryLimits = { files: 5e3, blob: 512 * 1024, tree: 2 * 1024 * 1024 };
var badRepository = () => new AssetError(422, "INVALID_REPOSITORY_INPUT");
var invalidRemote = () => new AssetError(502, "REPOSITORY_INVALID_RESPONSE");
var oversized = () => new AssetError(413, "REPOSITORY_LIMIT_EXCEEDED");
var unavailable = () => new AssetError(503, "REPOSITORY_UNAVAILABLE");
var sha40 = /^[a-f0-9]{40}$/;
var ownerPattern = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;
var repoPattern = /^[a-z0-9_.-]{1,100}$/i;
var forbiddenPath = /[\p{Cc}\p{Cf}\p{Cs}\\]/u;
function repositoryName(value) {
  if (typeof value !== "string" || value.length > 160) throw badRepository();
  const pieces = value.replace(/^https:\/\/github\.com\//i, "").split("/");
  const [owner, name] = pieces;
  if (pieces.length !== 2 || !owner || !name || !ownerPattern.test(owner) || !repoPattern.test(name) || name === "." || name === "..") throw badRepository();
  return { owner, name };
}
function isRepositoryPath(value) {
  return typeof value === "string" && !!value.length && Buffer.byteLength(value) <= 1024 && !forbiddenPath.test(value) && value.split("/").every((part) => part && part !== "." && part !== "..");
}
var remoteObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidRemote();
  return value;
};
var remoteSha = (value) => {
  if (typeof value !== "string" || !sha40.test(value)) throw invalidRemote();
  return value;
};
var repositorySlug = (repo) => repo.owner + "/" + repo.name;
var repoPath = (repo) => "/repos/" + encodeURIComponent(repo.owner) + "/" + encodeURIComponent(repo.name);
async function repositoryJson(url, limit, operation, headers, transport) {
  const signal = AbortSignal.any([operation, AbortSignal.timeout(12e3)]);
  let reader;
  try {
    signal.throwIfAborted();
    const response = await transport(url, { method: "GET", redirect: "manual", cache: "no-store", signal, headers });
    reader = response.body?.getReader();
    if (response.status >= 300 && response.status < 400) throw new AssetError(502, "REPOSITORY_REDIRECT_REJECTED");
    if (response.status === 429 || response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.get("ratelimit-remaining") === "0" || response.headers.has("retry-after")))
      throw new AssetError(429, "REPOSITORY_RATE_LIMIT");
    if ([401, 403, 404].includes(response.status)) throw new AssetError(404, "REMOTE_REPOSITORY_NOT_FOUND");
    if (!response.ok || !reader) throw unavailable();
    if (Number(response.headers.get("content-length")) > limit) throw oversized();
    let size = 0;
    const parts = [];
    while (true) {
      signal.throwIfAborted();
      const treePart = await reader.read();
      if (treePart.done) break;
      size += treePart.value.length;
      if (size > limit) throw oversized();
      parts.push(treePart.value);
    }
    signal.throwIfAborted();
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts, size)));
    } catch {
      throw invalidRemote();
    }
  } catch (error) {
    if (operation.aborted) throw new AssetError(409, "REPOSITORY_CANCELLED");
    if (signal.aborted) throw new AssetError(504, "REPOSITORY_TIMEOUT");
    if (error instanceof AssetError) throw error;
    throw unavailable();
  } finally {
    if (reader) void reader.cancel().catch(() => {
    });
  }
}
function parseRepositoryTree(row, sha4, directoryMode = "040000", verifyDigest = false) {
  if (row.sha !== sha4 || !Array.isArray(row.tree) || typeof row.truncated !== "boolean") throw invalidRemote();
  if (row.truncated || row.tree.length > repositoryLimits.files) throw oversized();
  const seen = /* @__PURE__ */ new Map();
  const entries = row.tree.map((candidate) => {
    const { path, sha: sha5, mode, type, size } = remoteObject(candidate);
    if (!isRepositoryPath(path) || seen.has(path)) throw invalidRemote();
    const kind = type === "tree" && mode === directoryMode ? "directory" : type === "commit" && mode === "160000" ? "submodule" : type === "blob" && mode === "120000" ? "symlink" : type === "blob" && (mode === "100644" || mode === "100755") ? "file" : void 0;
    if (!kind || kind === "file" && (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0)) throw invalidRemote();
    const entry = {
      path,
      sha: remoteSha(sha5),
      kind,
      size: kind === "file" ? size : null,
      mode: kind === "directory" ? "040000" : String(mode)
    };
    seen.set(path, entry);
    return entry;
  });
  for (const { path } of entries) {
    const separator = path.lastIndexOf("/");
    if (separator >= 0 && seen.get(path.slice(0, separator))?.kind !== "directory") throw invalidRemote();
  }
  if (verifyDigest && validateRepositoryTree(seen) !== sha4) throw invalidRemote();
  return entries.map(({ mode: _mode, ...entry }) => entry);
}
function decodeRepositoryBlob(row, entry) {
  if (row.sha !== entry.sha || typeof row.size !== "number" || !Number.isSafeInteger(row.size) || row.size < 0 || row.encoding !== "base64" || typeof row.content !== "string") throw invalidRemote();
  if (row.size > repositoryLimits.blob) throw oversized();
  const encoded = row.content.replace(/\r?\n/g, ""), bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded || bytes.length !== row.size || entry.size !== null && entry.size !== bytes.length || createHash14("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex") !== entry.sha) throw invalidRemote();
  return bytes;
}
var GitHubRepository = class {
  constructor(operation, token2, transport = fetch) {
    this.operation = operation;
    this.token = token2;
    this.transport = transport;
  }
  async get(path, limit) {
    const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "KnowledgeOS" };
    if (this.token) headers.authorization = "Bearer " + this.token;
    return remoteObject(await repositoryJson("https://api.github.com" + path, limit, this.operation, headers, this.transport));
  }
  async resolveRepository(name) {
    const row = await this.get(repoPath(name), 128 * 1024);
    if (typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.private !== "boolean") throw invalidRemote();
    if (!this.token && (row.private || row.visibility !== "public")) throw new AssetError(404, "REMOTE_REPOSITORY_NOT_FOUND");
    let canonical;
    try {
      canonical = repositoryName(row.full_name);
    } catch {
      throw invalidRemote();
    }
    if (row.full_name !== repositorySlug(canonical) || repositorySlug(canonical).toLowerCase() !== repositorySlug(name).toLowerCase()) throw invalidRemote();
    return { ...canonical, id: row.id, private: row.private };
  }
  async resolveRef(repo, ref) {
    const spec = ref.kind === "commit" ? ref.value : "refs/" + (ref.kind === "branch" ? "heads/" : "tags/") + ref.value;
    const row = await this.get(repoPath(repo) + "/commits/" + encodeURIComponent(spec), 2 * 1024 * 1024);
    const commit = remoteSha(row.sha);
    if (ref.kind === "commit" && commit !== ref.value) throw invalidRemote();
    return { commit, tree: remoteSha(remoteObject(remoteObject(row.commit).tree).sha) };
  }
  async readTree(repo, sha4) {
    const row = await this.get(repoPath(repo) + "/git/trees/" + remoteSha(sha4) + "?recursive=1", repositoryLimits.tree);
    return parseRepositoryTree(row, sha4);
  }
  async readBlob(repo, entry) {
    if (entry.kind !== "file" || entry.size === null) throw new AssetError(422, "REPOSITORY_NOT_REGULAR_FILE");
    if (entry.size > repositoryLimits.blob) throw oversized();
    const row = await this.get(repoPath(repo) + "/git/blobs/" + remoteSha(entry.sha), 800 * 1024);
    return decodeRepositoryBlob(row, entry);
  }
  async resolveSnapshot(repo, ref) {
    const revision = await this.resolveRef(repo, ref);
    return { ...revision, entries: await this.readTree(repo, revision.tree) };
  }
};

// src/host/gitlab-repository.ts
var origin2 = "https://gitlab.com/api/v4";
var segment = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/;
function gitLabName(value) {
  if (typeof value !== "string" || value.length > 255) throw badRepository();
  const parts = value.replace(/^https:\/\/gitlab\.com\//i, "").split("/");
  if (parts.length < 2 || parts.some((part) => !segment.test(part) || /\.(?:git|atom)$/i.test(part))) throw badRepository();
  const name = parts.pop();
  return { owner: parts.join("/"), name };
}
function parseTreeEntry(value) {
  const { id, path, mode, type, name } = remoteObject(value);
  if (!isRepositoryPath(path) || name !== path.split("/").at(-1)) throw invalidRemote();
  const kind = type === "tree" && mode === "040000" ? "directory" : type === "commit" && mode === "160000" ? "submodule" : type === "blob" && mode === "120000" ? "symlink" : type === "blob" && (mode === "100644" || mode === "100755") ? "file" : void 0;
  if (!kind || typeof mode !== "string") throw invalidRemote();
  return { path, mode, sha: remoteSha(id), kind, size: null };
}
var GitLabRepository = class {
  constructor(operation, token2, transport = fetch) {
    this.operation = operation;
    this.token = token2;
    this.transport = transport;
  }
  get(path, limit) {
    const headers = { accept: "application/json", "user-agent": "KnowledgeOS" };
    if (this.token) headers["private-token"] = this.token;
    return repositoryJson(origin2 + path, limit, this.operation, headers, this.transport);
  }
  async resolveRepository(name) {
    const data = remoteObject(await this.get("/projects/" + encodeURIComponent(repositorySlug(name)), 128 * 1024));
    if (typeof data.id !== "number" || !Number.isSafeInteger(data.id) || data.id <= 0 || !["public", "internal", "private"].includes(String(data.visibility))) throw invalidRemote();
    const isPrivate = data.visibility !== "public";
    if (!this.token && isPrivate) throw new AssetError(404, "REMOTE_REPOSITORY_NOT_FOUND");
    let canonical;
    try {
      canonical = gitLabName(data.path_with_namespace);
    } catch {
      throw invalidRemote();
    }
    if (data.path_with_namespace !== repositorySlug(canonical) || repositorySlug(canonical).toLowerCase() !== repositorySlug(name).toLowerCase())
      throw invalidRemote();
    return { ...canonical, id: data.id, private: isPrivate };
  }
  async resolveSnapshot(repo, ref) {
    const base = "/projects/" + repo.id + "/repository/";
    const kind = ref.kind === "commit" ? "commits" : ref.kind === "branch" ? "branches" : "tags";
    const selected = remoteObject(await this.get(base + kind + "/" + encodeURIComponent(ref.value), 128 * 1024));
    if (ref.kind !== "commit" && selected.name !== ref.value) throw invalidRemote();
    const commit = remoteSha(ref.kind === "commit" ? selected.id : remoteObject(selected.commit).id);
    if (ref.kind === "commit" && commit !== ref.value) throw invalidRemote();
    const entries = /* @__PURE__ */ new Map();
    let used = 0;
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({ ref: commit, recursive: "true", per_page: "100", page: String(page) });
      const batch = await this.get(base + "tree?" + query, repositoryLimits.tree - used);
      if (!Array.isArray(batch) || batch.length > 100) throw invalidRemote();
      used += Buffer.byteLength(JSON.stringify(batch));
      if (used > repositoryLimits.tree || entries.size + batch.length > repositoryLimits.files) throw oversized();
      for (const item of batch) {
        const parsed = parseTreeEntry(item);
        if (entries.has(parsed.path)) throw invalidRemote();
        entries.set(parsed.path, parsed);
      }
      if (batch.length < 100) break;
    }
    return { commit, tree: validateRepositoryTree(entries), entries: Array.from(entries.values(), ({ mode: _mode, ...entry }) => entry) };
  }
  async readBlob(repo, entry) {
    if (entry.kind !== "file") throw new AssetError(422, "REPOSITORY_NOT_REGULAR_FILE");
    const row = remoteObject(await this.get("/projects/" + repo.id + "/repository/blobs/" + remoteSha(entry.sha), 800 * 1024));
    return decodeRepositoryBlob(row, entry);
  }
};

// src/host/gitee-repository.ts
var origin3 = "https://gitee.com/api/v5";
var ownerPattern2 = /^[a-z0-9_][a-z0-9_-]{0,99}$/i;
var projectPattern = /^[a-z0-9_][a-z0-9_.-]{0,99}$/i;
function giteeName(value) {
  if (typeof value !== "string" || value.length > 220) throw badRepository();
  const parts = value.replace(/^https:\/\/gitee\.com\//i, "").split("/");
  const [owner, name] = parts;
  if (parts.length !== 2 || !owner || !name || !ownerPattern2.test(owner) || !projectPattern.test(name)) throw badRepository();
  return { owner, name };
}
var GiteeRepository = class {
  constructor(operation, token2, transport = fetch) {
    this.operation = operation;
    this.token = token2;
    this.transport = transport;
  }
  async get(path, limit) {
    const headers = { accept: "application/json", "user-agent": "KnowledgeOS" };
    if (this.token) headers.authorization = "Bearer " + this.token;
    return remoteObject(await repositoryJson(origin3 + path, limit, this.operation, headers, this.transport));
  }
  async resolveRepository(name) {
    const data = await this.get(repoPath(name), 128 * 1024);
    if (typeof data.id !== "number" || !Number.isSafeInteger(data.id) || data.id <= 0 || typeof data.private !== "boolean" || typeof data.public !== "boolean" || data.private && data.public) throw invalidRemote();
    const isPrivate = data.private || !data.public;
    if (!this.token && isPrivate) throw new AssetError(404, "REMOTE_REPOSITORY_NOT_FOUND");
    let canonical;
    try {
      canonical = giteeName(data.full_name);
    } catch {
      throw invalidRemote();
    }
    if (data.full_name !== repositorySlug(canonical) || repositorySlug(canonical).toLowerCase() !== repositorySlug(name).toLowerCase())
      throw invalidRemote();
    return { ...canonical, id: data.id, private: isPrivate };
  }
  async resolveSnapshot(repo, ref) {
    const path = repoPath(repo);
    const target2 = encodeURIComponent(ref.kind === "tag" ? "refs/tags/" + ref.value : ref.value);
    const row = await this.get(path + (ref.kind === "branch" ? "/branches/" : "/commits/") + target2, 256 * 1024);
    if (ref.kind === "branch" && row.name !== ref.value) throw invalidRemote();
    const selected = ref.kind === "branch" ? remoteObject(row.commit) : row;
    const commit = remoteSha(selected.sha);
    if (ref.kind === "commit" && commit !== ref.value) throw invalidRemote();
    const tree = remoteSha(remoteObject(remoteObject(selected.commit).tree).sha);
    const manifest = await this.get(path + "/git/trees/" + tree + "?recursive=1", repositoryLimits.tree);
    return { commit, tree, entries: parseRepositoryTree(manifest, tree, "40000", true) };
  }
  async readBlob(repo, entry) {
    if (entry.kind !== "file" || entry.size === null) throw new AssetError(422, "REPOSITORY_NOT_REGULAR_FILE");
    if (entry.size > repositoryLimits.blob) throw oversized();
    return decodeRepositoryBlob(await this.get(repoPath(repo) + "/git/blobs/" + remoteSha(entry.sha), 800 * 1024), entry);
  }
};

// src/host/repository-store.ts
var REPOSITORY_SCHEMA = `
CREATE TABLE repository_snapshots (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
  remote_id INTEGER NOT NULL, owner_name TEXT NOT NULL, repository_name TEXT NOT NULL,
  is_private INTEGER NOT NULL CHECK(is_private IN (0,1)), credential_ref TEXT NOT NULL,
  ref_kind TEXT NOT NULL CHECK(ref_kind IN ('branch','tag','commit')), ref_value TEXT NOT NULL,
  commit_sha TEXT NOT NULL CHECK(length(commit_sha)=40), tree_sha TEXT NOT NULL CHECK(length(tree_sha)=40),
  tree_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(service_id,owner_id,remote_id,is_private,credential_ref,commit_sha)
) STRICT;
CREATE TABLE repository_files (
  snapshot_id TEXT NOT NULL REFERENCES repository_snapshots(id), path TEXT NOT NULL,
  blob_sha TEXT NOT NULL CHECK(length(blob_sha)=40), payload BLOB NOT NULL,
  PRIMARY KEY(snapshot_id,path)
) STRICT;
`;
var REPOSITORY_PLATFORM_TABLES = `
CREATE TABLE repository_snapshots (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL CHECK(platform IN ('github','gitlab')),
  remote_id INTEGER NOT NULL, owner_name TEXT NOT NULL, repository_name TEXT NOT NULL,
  is_private INTEGER NOT NULL CHECK(is_private IN (0,1)), credential_ref TEXT NOT NULL,
  ref_kind TEXT NOT NULL CHECK(ref_kind IN ('branch','tag','commit')), ref_value TEXT NOT NULL,
  commit_sha TEXT NOT NULL CHECK(length(commit_sha)=40), tree_sha TEXT NOT NULL CHECK(length(tree_sha)=40),
  tree_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(service_id,owner_id,platform,remote_id,is_private,credential_ref,commit_sha)
) STRICT;
CREATE TABLE repository_files (
  snapshot_id TEXT NOT NULL REFERENCES repository_snapshots(id), path TEXT NOT NULL,
  blob_sha TEXT NOT NULL CHECK(length(blob_sha)=40), payload BLOB NOT NULL,
  PRIMARY KEY(snapshot_id,path)
) STRICT;
`;
var REPOSITORY_PLATFORM_SCHEMA = `
ALTER TABLE repository_files RENAME TO repository_files_v33;
ALTER TABLE repository_snapshots RENAME TO repository_snapshots_v33;
${REPOSITORY_PLATFORM_TABLES}
INSERT INTO repository_snapshots(id,service_id,owner_id,platform,remote_id,owner_name,repository_name,is_private,credential_ref,ref_kind,ref_value,commit_sha,tree_sha,tree_json,created_at)
SELECT id,service_id,owner_id,'github',remote_id,owner_name,repository_name,is_private,credential_ref,ref_kind,ref_value,commit_sha,tree_sha,tree_json,created_at
FROM repository_snapshots_v33;
INSERT INTO repository_files SELECT snapshot_id,path,blob_sha,payload FROM repository_files_v33;
DROP TABLE repository_files_v33;
DROP TABLE repository_snapshots_v33;
`;
var REPOSITORY_GITEE_TABLES = REPOSITORY_PLATFORM_TABLES.replace("CHECK(platform IN ('github','gitlab'))", "CHECK(platform IN ('github','gitlab','gitee'))");
var REPOSITORY_GITEE_SCHEMA = `
ALTER TABLE repository_files RENAME TO repository_files_v34;
ALTER TABLE repository_snapshots RENAME TO repository_snapshots_v34;
${REPOSITORY_GITEE_TABLES}
INSERT INTO repository_snapshots(id,service_id,owner_id,platform,remote_id,owner_name,repository_name,is_private,credential_ref,ref_kind,ref_value,commit_sha,tree_sha,tree_json,created_at)
SELECT id,service_id,owner_id,platform,remote_id,owner_name,repository_name,is_private,credential_ref,ref_kind,ref_value,commit_sha,tree_sha,tree_json,created_at
FROM repository_snapshots_v34;
INSERT INTO repository_files SELECT snapshot_id,path,blob_sha,payload FROM repository_files_v34;
DROP TABLE repository_files_v34;
DROP TABLE repository_snapshots_v34;
`;
var providers = {
  github: { Adapter: GitHubRepository, origin: "https://github.com", sourcePrefix: "", ref: /^KO_GITHUB_[A-Z0-9_]{1,64}$/, token: /^(?:github_pat_|ghp_)[A-Za-z0-9_]{16,250}$/ },
  gitlab: { Adapter: GitLabRepository, origin: "https://gitlab.com", sourcePrefix: "/-", ref: /^KO_GITLAB_[A-Z0-9_]{1,64}$/, token: /^glpat-[A-Za-z0-9_-]{16,250}$/ },
  gitee: { Adapter: GiteeRepository, origin: "https://gitee.com", sourcePrefix: "", ref: /^KO_GITEE_[A-Z0-9_]{1,64}$/, token: /^[A-Za-z0-9_.-]{16,250}$/ }
};
var summaryColumns = "id,platform,remote_id,owner_name,repository_name,is_private,credential_ref,ref_kind,ref_value,commit_sha,tree_sha,created_at";
var hidden3 = () => new AssetError(404, "NOT_FOUND");
var checkSignal = (signal) => {
  if (signal.aborted) throw new AssetError(409, "REPOSITORY_CANCELLED");
};
var encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
var sourceUrl2 = (row, type) => {
  const repository = encodePath(row.owner_name + "/" + row.repository_name);
  const provider = providers[row.platform];
  return provider.origin + "/" + repository + provider.sourcePrefix + "/" + type + "/" + row.commit_sha;
};
var summarize = (row) => ({
  id: row.id,
  platform: row.platform,
  repository: row.owner_name + "/" + row.repository_name,
  private: !!row.is_private,
  credential_ref: row.credential_ref || null,
  ref_kind: row.ref_kind,
  ref_value: row.ref_value,
  commit: row.commit_sha,
  tree: row.tree_sha,
  created_at: row.created_at,
  source_url: sourceUrl2(row, "tree")
});
var fileView = (row, path, sha4, bytes) => {
  let text2 = null;
  if (!bytes.includes(0)) {
    try {
      text2 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
    }
  }
  return {
    path,
    sha: sha4,
    size: bytes.length,
    text: text2,
    source_url: sourceUrl2(row, "blob") + "/" + encodePath(path)
  };
};
var RepositoryStore = class {
  constructor(tx, currentActor) {
    this.tx = tx;
    this.currentActor = currentActor;
  }
  check(session, expected = session.userId) {
    return this.tx("read", (_, now) => this.actor(session, now, expected));
  }
  actor(session, now, expected = session.userId) {
    const actor = this.currentActor(session, now);
    if (!actor) throw new AssetError(401, "AUTH_REQUIRED");
    if (expected !== actor.userId) throw new AssetError(409, "ACTOR_MISMATCH");
    return actor;
  }
  list(session) {
    return this.tx("read", (db, now) => {
      const actor = this.actor(session, now);
      return db.prepare("SELECT " + summaryColumns + " FROM repository_snapshots WHERE service_id=? AND owner_id=? ORDER BY created_at DESC,id DESC").all(actor.serviceId, actor.userId).map(summarize);
    });
  }
  row(db, actor, id) {
    const row = db.prepare("SELECT * FROM repository_snapshots WHERE service_id=? AND owner_id=? AND id=?").get(actor.serviceId, actor.userId, id);
    if (!row) throw hidden3();
    return row;
  }
  detail(session, id) {
    return this.tx("read", (db, now) => {
      const row = this.row(db, this.actor(session, now), id);
      const entries = JSON.parse(row.tree_json);
      const files = db.prepare("SELECT path FROM repository_files WHERE snapshot_id=? ORDER BY path").all(id).map((row2) => String(row2.path));
      return { snapshot: summarize(row), entries, files };
    });
  }
  file(session, id, path) {
    return this.tx("read", (db, now) => {
      const row = this.row(db, this.actor(session, now), id);
      const saved = db.prepare("SELECT blob_sha,payload FROM repository_files WHERE snapshot_id=? AND path=?").get(id, path);
      if (!saved) throw hidden3();
      return fileView(row, path, String(saved.blob_sha), saved.payload);
    });
  }
  pendingFile(session, expected, id, path) {
    return this.tx("read", (db, now) => {
      const row = this.row(db, this.actor(session, now, expected), id);
      const entry = JSON.parse(row.tree_json).find((candidate) => candidate.path === path);
      if (!entry) throw hidden3();
      return { row, entry };
    });
  }
  saveSnapshot(session, expected, remote, ref, alias, revision, entries, signal, pinned, platform = "github") {
    return this.tx("write", (db, now) => {
      checkSignal(signal);
      const { userId, serviceId } = this.actor(session, now, expected);
      const existing = db.prepare("SELECT * FROM repository_snapshots WHERE service_id=? AND owner_id=? AND platform=? AND remote_id=? AND is_private=? AND credential_ref=? AND commit_sha=?").get(serviceId, userId, platform, remote.id, Number(remote.private), alias, revision.commit);
      if (existing) {
        if (existing.tree_sha !== revision.tree) throw new AssetError(502, "REPOSITORY_INVALID_RESPONSE");
        if (pinned) this.insertFile(db, { userId, serviceId }, existing, pinned.entry, pinned.bytes);
        return { snapshot: summarize(existing), replayed: true };
      }
      if (Number(db.prepare("SELECT count(*) AS total FROM repository_snapshots WHERE service_id=? AND owner_id=?").get(serviceId, userId)?.total) >= 25)
        throw new AssetError(409, "REPOSITORY_SNAPSHOT_QUOTA");
      const row = {
        id: randomUUID15(),
        platform,
        remote_id: remote.id,
        owner_name: remote.owner,
        repository_name: remote.name,
        is_private: Number(remote.private),
        credential_ref: alias,
        ref_kind: ref.kind,
        ref_value: ref.value,
        commit_sha: revision.commit,
        tree_sha: revision.tree,
        tree_json: JSON.stringify(entries),
        created_at: now
      };
      db.prepare("INSERT INTO repository_snapshots(id,service_id,owner_id,platform,remote_id,owner_name,repository_name,is_private,credential_ref,ref_kind,ref_value,commit_sha,tree_sha,tree_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
        row.id,
        serviceId,
        userId,
        platform,
        row.remote_id,
        row.owner_name,
        row.repository_name,
        row.is_private,
        alias,
        row.ref_kind,
        row.ref_value,
        row.commit_sha,
        row.tree_sha,
        row.tree_json,
        now
      );
      if (pinned) this.insertFile(db, { userId, serviceId }, row, pinned.entry, pinned.bytes);
      return { snapshot: summarize(row), replayed: false };
    });
  }
  saveFile(session, expected, id, entry, bytes, signal) {
    return this.tx("write", (db, now) => {
      checkSignal(signal);
      const actor = this.actor(session, now, expected), row = this.row(db, actor, id);
      this.insertFile(db, actor, row, entry, bytes);
      return fileView(row, entry.path, entry.sha, bytes);
    });
  }
  insertFile(db, actor, row, entry, bytes) {
    const treeEntry = JSON.parse(row.tree_json).find((candidate) => candidate.path === entry.path);
    const sizeMatches = treeEntry?.size === bytes.length || row.platform === "gitlab" && treeEntry?.size === null;
    if (!treeEntry || treeEntry.kind !== "file" || treeEntry.sha !== entry.sha || !sizeMatches || bytes.length > repositoryLimits.blob)
      throw new AssetError(502, "REPOSITORY_INVALID_RESPONSE");
    if (db.prepare("SELECT 1 FROM repository_files WHERE snapshot_id=? AND path=?").get(row.id, entry.path)) return;
    const count = Number(db.prepare("SELECT count(*) AS total FROM repository_files WHERE snapshot_id=?").get(row.id)?.total);
    const used = Number(db.prepare("SELECT coalesce(sum(length(f.payload)),0) AS total FROM repository_files f JOIN repository_snapshots s ON s.id=f.snapshot_id WHERE s.service_id=? AND s.owner_id=?").get(actor.serviceId, actor.userId)?.total);
    if (count >= 32 || used + bytes.length > 32 * 1024 * 1024) throw new AssetError(409, "REPOSITORY_FILE_QUOTA");
    db.prepare("INSERT INTO repository_files VALUES(?,?,?,?)").run(row.id, entry.path, entry.sha, bytes);
  }
};

// src/host/project-task-store.ts
import { createHash as createHash15, randomUUID as randomUUID16 } from "node:crypto";

// src/host/project-task-policy.ts
var unacceptable = /[\p{Cf}\p{Cs}\x00-\x08\x0b-\x1f\x7f]/u;
var text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !unacceptable.test(value);
var instant = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function validTaskCriteria(criteria) {
  if (criteria?.submission_rule !== "next_submission" || !Array.isArray(criteria.items) || !criteria.items.length || criteria.items.length > 20) return false;
  const seen = /* @__PURE__ */ new Set();
  return criteria.items.every((item) => {
    if (!item || !text(item.description, 1e3) || !Number.isSafeInteger(item.weight) || item.weight < 1 || item.weight > 100) return false;
    const label = item.description.trim().normalize("NFC");
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}
function validTaskDraft(draft) {
  return text(draft.title, 160) && text(draft.goal, 4e3) && validTaskCriteria(draft.criteria);
}
function decideAssignment(draft, issuer, projectMembers, now) {
  if (!instant(draft.due_at) || draft.due_at <= now) return { error: "INVALID_TASK_DUE" };
  if (projectMembers === null) {
    if (draft.assignee_id !== issuer.id || draft.final_reviewer_id !== issuer.id || draft.peer_reviewer_id !== void 0)
      return { error: "TASK_REVIEW_POLICY_REJECTED" };
    return { kind: "personal" };
  }
  const assignee = projectMembers.find((m) => m.id === draft.assignee_id);
  const final = projectMembers.find((m) => m.id === draft.final_reviewer_id);
  const peer = draft.peer_reviewer_id !== void 0 ? projectMembers.find((m) => m.id === draft.peer_reviewer_id) : void 0;
  if (!assignee || !final || draft.peer_reviewer_id !== void 0 && !peer) return { error: "TASK_MEMBER_UNAVAILABLE" };
  if (final.id === assignee.id || peer && (peer.id === final.id || peer.id === assignee.id) || issuer.role === "admin" && final.role !== "admin" || issuer.role !== "admin" && peer)
    return { error: "TASK_REVIEW_POLICY_REJECTED" };
  return { kind: issuer.role === "admin" ? "project_admin" : "project_collaboration" };
}

// src/host/project-task-workflow.ts
var isTaskReviewAction = (action) => action === "peer_pass" || action === "peer_return" || action === "final_accept" || action === "final_return" || action === "final_fail";
function decideTaskWorkflow(task, actor, action) {
  if (action !== "submit" && !isTaskReviewAction(action)) return { error: "INVALID_TASK_INPUT" };
  if (task.kind === "personal") return { error: "TASK_WORKFLOW_UNAVAILABLE" };
  if (action === "submit") {
    if (actor.id !== task.assignee) return { error: "NOT_FOUND" };
    if (!["assigned", "in_progress", "returned"].includes(task.state)) return { error: "TASK_STATE_CONFLICT" };
    return { state: "submitted", nextActor: task.peerReviewer ?? task.finalReviewer };
  }
  if (action === "peer_pass" || action === "peer_return") {
    if (task.kind !== "project_admin") return { error: "TASK_WORKFLOW_UNAVAILABLE" };
    if (actor.id !== task.peerReviewer) return { error: "NOT_FOUND" };
    if (task.state !== "submitted") return { error: "TASK_STATE_CONFLICT" };
    return action === "peer_pass" ? { state: "awaiting_admin_review", nextActor: task.finalReviewer } : { state: "returned", nextActor: task.assignee };
  }
  if (actor.id !== task.finalReviewer || task.kind === "project_admin" && actor.role !== "admin") return { error: "NOT_FOUND" };
  if (task.state !== (task.peerReviewer ? "awaiting_admin_review" : "submitted")) return { error: "TASK_STATE_CONFLICT" };
  return finalOutcome(task, action);
}
function decideTaskCorrection(task, actor, action, appeal = false) {
  if (task.kind === "personal" || !appeal && task.kind !== "project_collaboration" || actor.role !== "admin" || actor.id === task.assignee) return { error: "NOT_FOUND" };
  if (action === "peer_pass" || action === "peer_return") return { error: "INVALID_TASK_INPUT" };
  if (!["accepted", "failed", "returned"].includes(task.state)) return { error: "TASK_STATE_CONFLICT" };
  return finalOutcome(task, action);
}
function finalOutcome(task, action) {
  switch (action) {
    case "final_accept":
      return { state: "accepted", nextActor: null };
    case "final_return":
      return { state: "returned", nextActor: task.assignee };
    case "final_fail":
      return { state: "failed", nextActor: null };
  }
}
function submissionTiming(submittedAt, dueAt) {
  return submittedAt <= dueAt ? "on_time" : "late";
}
var validText = (value, limit) => typeof value === "string" && value.trim().length > 0 && value.length <= limit && !/[\p{Cf}\p{Cs}\x00-\x08\x0b-\x1f\x7f]/u.test(value);
var validTaskSubmission = (content) => validText(content, 16e3);
var validTaskAppeal = (reason) => validText(reason, 4e3);
function validTaskReview(action, criterionCount, input) {
  if (!isTaskReviewAction(action) || !input || !Number.isSafeInteger(criterionCount) || criterionCount < 1 || criterionCount > 20 || !Array.isArray(input.results) || input.results.length !== criterionCount || !validText(input.reason, 4e3)) return false;
  const isReturn = action === "peer_return" || action === "final_return";
  if (isReturn ? !validText(input.requested_work, 4e3) : input.requested_work !== void 0) return false;
  const ordinals = /* @__PURE__ */ new Set();
  for (const result of input.results) {
    if (!result || !Number.isSafeInteger(result.criterion) || result.criterion < 1 || result.criterion > criterionCount || ordinals.has(result.criterion) || typeof result.met !== "boolean" || !validText(result.evidence, 1e3)) return false;
    ordinals.add(result.criterion);
  }
  const allMet = input.results.every((result) => result.met);
  return allMet === (action === "peer_pass" || action === "final_accept");
}

// src/host/project-task-store.ts
var PROJECT_TASK_SCHEMA = `
CREATE TABLE project_membership_removals (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES knowledge_projects(id),
  user_id TEXT NOT NULL REFERENCES users(id), removed_by TEXT NOT NULL REFERENCES users(id), removed_at TEXT NOT NULL
) STRICT;
CREATE INDEX project_membership_removal_history ON project_membership_removals(project_id,user_id,removed_at);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  project_id TEXT REFERENCES knowledge_projects(id), issuer_id TEXT NOT NULL REFERENCES users(id),
  personal_space_id TEXT REFERENCES spaces(id), assignee_id TEXT NOT NULL REFERENCES users(id),
  task_kind TEXT NOT NULL CHECK(task_kind IN ('personal','project_admin','project_collaboration')),
  title TEXT NOT NULL, goal TEXT NOT NULL, due_at TEXT NOT NULL,
  final_reviewer_id TEXT NOT NULL REFERENCES users(id), peer_reviewer_id TEXT REFERENCES users(id),
  criteria_revision INTEGER NOT NULL CHECK(criteria_revision>=1), current_state TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>=1), issued_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(service_id,issuer_id,request_key),
  FOREIGN KEY(id,criteria_revision) REFERENCES task_criteria_versions(task_id,version) DEFERRABLE INITIALLY DEFERRED,
  CHECK((task_kind='personal' AND project_id IS NULL AND personal_space_id IS NOT NULL AND issuer_id=assignee_id
    AND issuer_id=final_reviewer_id AND peer_reviewer_id IS NULL) OR
    (task_kind!='personal' AND project_id IS NOT NULL AND personal_space_id IS NULL AND final_reviewer_id!=assignee_id))
) STRICT;
CREATE INDEX tasks_scope_order ON tasks(service_id,project_id,issued_at DESC,id);
CREATE TABLE task_criteria_versions (
  task_id TEXT NOT NULL REFERENCES tasks(id), version INTEGER NOT NULL CHECK(version>=1),
  acceptance_items TEXT NOT NULL, effective_submission_rule TEXT NOT NULL CHECK(effective_submission_rule='next_submission'),
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(task_id,version)
) STRICT;
`;
var waiting = "awaiting_material_access";
var isReviewPhase = (state) => state === "submitted" || state === "awaiting_admin_review";
var hasFormalDecision = (state) => ["accepted", "failed", "returned"].includes(state);
var uuid3 = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
var validId = (id) => typeof id === "string" && uuid3.test(id);
var materialUnavailable = () => new AssetError(404, "TASK_MATERIAL_UNAVAILABLE");
var materialAccessRequired = () => new AssetError(409, "TASK_MATERIAL_ACCESS_REQUIRED");
var hidden4 = () => new AssetError(404, "NOT_FOUND");
var invalid3 = () => new AssetError(422, "INVALID_TASK_INPUT");
var submissionView = (t, r) => ({
  id: r.id,
  version: r.version,
  criteria_version: r.criteria_version,
  author_id: r.author_id,
  content: r.content,
  submitted_at: r.submitted_at,
  previous_version: r.previous_version,
  timing: submissionTiming(r.submitted_at, t.due_at)
});
var reviewView = (r) => ({
  id: r.id,
  submission_id: r.submission_id,
  reviewer_id: r.reviewer_id,
  stage: r.stage,
  verdict: r.verdict,
  criteria_results: JSON.parse(r.criteria_results),
  reason: r.reason,
  requested_work: r.requested_work,
  decided_at: r.decided_at,
  ...r.supersedes_id ? { supersedes_id: r.supersedes_id } : {}
});
var appealDecisionId = (r) => r.against_review_id ?? r.against_correction_id;
var appealView = (r) => ({
  id: r.id,
  submission_id: r.submission_id,
  decision_id: appealDecisionId(r),
  requester_id: r.requester_id,
  reason: r.reason,
  status: r.status,
  requested_at: r.requested_at,
  resolved_by: r.resolved_by,
  resolution_decision_id: r.resolution_decision_id,
  resolved_at: r.resolved_at
});
var requestDigest = (value) => createHash15("sha256").update(JSON.stringify(value)).digest("hex");
var workflow = (t) => ({
  kind: t.task_kind,
  assignee: t.assignee_id,
  peerReviewer: t.peer_reviewer_id,
  finalReviewer: t.final_reviewer_id,
  state: t.current_state
});
var nextActor = (t, state = t.current_state) => {
  switch (state) {
    case "assigned":
    case "in_progress":
    case "returned":
      return t.assignee_id;
    case "submitted":
      return t.peer_reviewer_id ?? t.final_reviewer_id;
    case "awaiting_admin_review":
      return t.final_reviewer_id;
    default:
      return null;
  }
};
var materialWait = (db, id) => db.prepare("SELECT submission_version,resume_state FROM task_material_waits WHERE task_id=?").get(id);
var pendingAppeal = (db, taskId) => db.prepare("SELECT * FROM task_appeals WHERE task_id=? AND status='pending'").get(taskId);
var appealById = (db, id) => db.prepare("SELECT * FROM task_appeals WHERE id=?").get(id);
var decisionImpact = (db, id) => {
  const flags = db.prepare(`SELECT EXISTS(SELECT 1 FROM task_appeals WHERE task_id=? AND status='pending') AS disputed,
    EXISTS(SELECT 1 FROM task_decision_impacts WHERE task_id=? AND recalculation_required=1) AS recalculation`).get(id, id);
  const disputed = Boolean(flags.disputed), recalculation = Boolean(flags.recalculation);
  if (!disputed && !recalculation) return {};
  return { settlement_state: disputed ? "disputed" : "pending_recalculation", recalculation_required: recalculation };
};
var taskSummary = (db, t) => ({
  id: t.id,
  project_id: t.project_id,
  task_kind: t.task_kind,
  title: t.title,
  goal: t.goal,
  due_at: t.due_at,
  issuer_id: t.issuer_id,
  assignee_id: t.assignee_id,
  final_reviewer_id: t.final_reviewer_id,
  peer_reviewer_id: t.peer_reviewer_id,
  criteria_revision: t.criteria_revision,
  state: t.current_state,
  next_actor_id: nextActor(t, t.current_state === waiting ? materialWait(db, t.id)?.resume_state : void 0),
  revision: t.revision,
  issued_at: t.issued_at,
  updated_at: t.updated_at,
  ...decisionImpact(db, t.id)
});
var taskView = (db, t) => ({ ...taskSummary(db, t), criteria_history: db.prepare(
  "SELECT version,acceptance_items,effective_submission_rule,created_by,created_at FROM task_criteria_versions WHERE task_id=? ORDER BY version"
).all(t.id).map(({ acceptance_items, ...r }) => ({ ...r, items: JSON.parse(String(acceptance_items)) })) });
var clean = (c) => c.items.map((item) => ({ description: item.description.trim(), weight: item.weight }));
var requireRevision = (task, expected) => {
  if (task.revision !== expected) throw new AssetError(409, "TASK_REVISION_CONFLICT");
};
var validRevision = (revision) => Number.isSafeInteger(revision) && revision > 0;
var latestSubmission = (db, id) => db.prepare("SELECT * FROM task_submissions WHERE task_id=? ORDER BY version DESC LIMIT 1").get(id);
var correctionColumns = `id,submission_id,reviewer_id,'final' AS stage,verdict,criteria_results,reason,requested_work,decided_at,request_digest,
  COALESCE(previous_review_id,previous_correction_id) AS supersedes_id`;
var latestFormalReview = (db, submission) => db.prepare("SELECT id,1 AS correction FROM task_review_corrections WHERE submission_id=? ORDER BY rowid DESC LIMIT 1").get(submission) ?? db.prepare("SELECT id,0 AS correction FROM task_review_decisions WHERE submission_id=? AND stage='final'").get(submission);
var formalDecisionSubmission = (db, id) => db.prepare(`SELECT s.* FROM task_submissions s
  WHERE s.id=(SELECT submission_id FROM task_review_decisions WHERE id=? AND stage='final')
    OR s.id=(SELECT submission_id FROM task_review_corrections WHERE id=?)`).get(id, id);
var canResolveAppeal = (actor, task) => actor.role === "admin" && task.project_id !== null && actor.userId !== task.assignee_id;
var canCorrect = (actor, task) => task.task_kind === "project_collaboration" && canResolveAppeal(actor, task);
var pinnedTargets = (db, submission) => db.prepare(`SELECT asset_id,version_id,ordinal,conversion_id
  FROM task_submission_materials WHERE task_id=? AND submission_version=? ORDER BY position`).all(submission.task_id, submission.version).map((r) => ({ asset_id: String(r.asset_id), version_id: String(r.version_id), ordinal: Number(r.ordinal), ...r.conversion_id ? { conversion_id: String(r.conversion_id) } : {} }));
var materialList = (input) => {
  if (!Array.isArray(input) || input.length > 10) throw invalid3();
  const values = input.map((m) => {
    if (!m || typeof m !== "object" || Array.isArray(m) || Object.keys(m).some((k) => !["asset_id", "version_id", "ordinal", "conversion_id"].includes(k)) || !validId(m.asset_id) || !validId(m.version_id) || !Number.isSafeInteger(m.ordinal) || m.ordinal < 1 || m.conversion_id !== void 0 && !validId(m.conversion_id)) throw invalid3();
    return {
      asset_id: m.asset_id.toLowerCase(),
      version_id: m.version_id.toLowerCase(),
      ordinal: m.ordinal,
      ...m.conversion_id ? { conversion_id: m.conversion_id.toLowerCase() } : {}
    };
  });
  if (new Set(values.map((m) => JSON.stringify(m))).size !== values.length) throw invalid3();
  return values;
};
var advance = (db, task, state, now) => {
  const result = db.prepare("UPDATE tasks SET current_state=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?").run(state, now, task.id, task.revision);
  if (Number(result.changes) !== 1) throw new AssetError(409, "TASK_REVISION_CONFLICT");
};
var transition = (task, a, action, correction = false, appeal = false) => {
  const actor = { id: a.userId, role: a.role };
  const next = correction && action !== "submit" ? decideTaskCorrection(workflow(task), actor, action, appeal) : decideTaskWorkflow(workflow(task), actor, action);
  if ("error" in next) throw new AssetError(next.error === "NOT_FOUND" ? 404 : next.error === "INVALID_TASK_INPUT" ? 422 : 409, next.error);
  return next.state;
};
function recordDecisionImpact(db, task, actor, now, correlation, event, payload) {
  const eventId = randomUUID16(), revision = task.revision + 1, recalculation = event !== "appeal.opened";
  if (recalculation) db.prepare(`INSERT INTO task_decision_impacts(task_id,task_revision,recalculation_required,updated_at) VALUES(?,?,1,?)
    ON CONFLICT(task_id) DO UPDATE SET task_revision=excluded.task_revision,recalculation_required=1,updated_at=excluded.updated_at`).run(task.id, revision, now);
  const causation = event === "appeal.resolved" ? db.prepare(`SELECT event_id FROM domain_events WHERE aggregate_type='project_task'
    AND aggregate_id=? AND correlation_id=? AND event_type='knowledgeos.task.appeal.opened'`).get(task.id, correlation)?.event_id ?? null : null;
  db.prepare(`INSERT INTO domain_events(event_id,aggregate_type,aggregate_id,aggregate_revision,actor_id,event_type,payload_schema_version,payload,
    occurred_at,causation_id,correlation_id) VALUES(?,'project_task',?,?,?,?,1,?,?,?,?)`).run(
    eventId,
    task.id,
    revision,
    actor.userId,
    "knowledgeos.task." + event,
    JSON.stringify({ ...payload, recalculation_required: recalculation, disputed: !recalculation }),
    now,
    causation,
    correlation
  );
  db.prepare("INSERT INTO domain_event_outbox(event_id,created_at) VALUES(?,?)").run(eventId, now);
}
var ProjectTaskStore = class {
  constructor(tx, current, memberships, canReadMaterial, validateMaterial) {
    this.tx = tx;
    this.current = current;
    this.memberships = memberships;
    this.canReadMaterial = canReadMaterial;
    this.validateMaterial = validateMaterial;
  }
  actor(s, now, expected = s.userId) {
    const user = this.current(s, now);
    if (!user) throw new AssetError(401, "AUTH_REQUIRED");
    if (user.userId !== expected) throw new AssetError(409, "ACTOR_MISMATCH");
    return user;
  }
  project(db, a, id, now) {
    const row = db.prepare("SELECT id,name,owner_user_id FROM knowledge_projects WHERE id=? AND service_id=? AND status='active'").get(id, a.serviceId);
    if (!row) throw hidden4();
    const active2 = this.memberships(db, id).filter((m) => isGrantActive(m, now));
    if (!active2.some((m) => m.userId === a.userId)) throw hidden4();
    return { row, active: active2 };
  }
  participants(db, a, active2) {
    const ids = [...new Set(active2.map((m) => m.userId))];
    const rows = db.prepare("SELECT id,role,display_name FROM users WHERE planning_home_service_id=? AND status='active' AND id IN (SELECT value FROM json_each(?)) ORDER BY display_name,id LIMIT 501").all(a.serviceId, JSON.stringify(ids));
    if (rows.length > 500) throw new AssetError(409, "PROJECT_MEMBER_LIMIT");
    return rows;
  }
  projects(s) {
    return this.tx("read", (db, now) => {
      const a = this.actor(s, now);
      const rows = db.prepare(`SELECT id,name,owner_user_id FROM knowledge_projects p WHERE service_id=? AND status='active' AND (
        EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=p.id AND m.user_id=? AND m.valid_from<=? AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>?))
        OR EXISTS(SELECT 1 FROM invitations i JOIN invitation_redemptions r ON r.invitation_id=i.id WHERE i.project_id=p.id AND i.service_id=p.service_id AND i.permission='member'
          AND i.revoked_at IS NULL AND r.user_id=? AND r.revoked_at IS NULL AND r.redeemed_at<=? AND r.expires_at=i.expires_at AND r.expires_at>?)
        ) ORDER BY name,id LIMIT 201`).all(a.serviceId, a.userId, now, now, a.userId, now, now);
      if (rows.length > 200) throw new AssetError(409, "PROJECT_LIST_LIMIT");
      return rows.map((row) => ({ id: String(row.id), name: String(row.name), can_manage: row.owner_user_id === a.userId }));
    });
  }
  members(s, id) {
    return this.tx("read", (db, now) => {
      const a = this.actor(s, now), { row, active: active2 } = this.project(db, a, id, now);
      return { id: row.id, name: row.name, owner_id: row.owner_user_id, can_manage: row.owner_user_id === a.userId, members: this.participants(db, a, active2) };
    });
  }
  removeMember(s, expected, projectId, memberId) {
    return this.tx("write", (db, now) => {
      const a = this.actor(s, now, expected), { row, active: active2 } = this.project(db, a, projectId, now);
      if (row.owner_user_id !== a.userId || memberId === a.userId || !active2.some((m) => m.userId === memberId)) throw hidden4();
      db.prepare("UPDATE project_memberships SET revoked_at=? WHERE project_id=? AND user_id=? AND revoked_at IS NULL").run(now, projectId, memberId);
      db.prepare(`UPDATE invitation_redemptions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND invitation_id IN
        (SELECT i.id FROM invitations i LEFT JOIN knowledge_objects o ON o.id=i.object_id
          WHERE i.service_id=? AND (i.project_id=? OR o.project_id=?))`).run(now, memberId, a.serviceId, projectId, projectId);
      db.prepare(`UPDATE resource_grants SET revoked_at=? WHERE service_id=? AND subject_type='user' AND subject_id=? AND revoked_at IS NULL
        AND resource_type='knowledge_object' AND resource_id IN (SELECT id FROM knowledge_objects WHERE project_id=?)`).run(now, a.serviceId, memberId, projectId);
      db.prepare("INSERT INTO project_membership_removals VALUES(?,?,?,?,?)").run(randomUUID16(), projectId, memberId, a.userId, now);
      return { removed: true };
    });
  }
  lookup(db, a, id, now) {
    const row = db.prepare("SELECT * FROM tasks WHERE id=? AND service_id=?").get(id, a.serviceId);
    if (!row) throw hidden4();
    if (row.project_id === null) {
      if (row.personal_space_id !== a.personalSpaceId || row.issuer_id !== a.userId) throw hidden4();
    } else {
      const { row: project } = this.project(db, a, row.project_id, now);
      if (!canCorrect(a, row) && ![project.owner_user_id, row.issuer_id, row.assignee_id, row.final_reviewer_id, row.peer_reviewer_id].includes(a.userId)) throw hidden4();
    }
    return row;
  }
  readable(a, task, target2, now) {
    return task.project_id !== null && this.canReadMaterial(a, target2.asset_id, task.project_id, now);
  }
  materialVisibility(a, task, db, now) {
    const attempts = db.prepare("SELECT * FROM task_submissions WHERE task_id=? ORDER BY version").all(task.id);
    const visible = attempts.map((attempt) => ({ attempt, materials: pinnedTargets(db, attempt).map((target2) => this.readable(a, task, target2, now) ? target2 : null) }));
    const access_revision = requestDigest([task.revision, visible.map((row) => row.materials.map(Boolean))]);
    return { visible, access_revision };
  }
  reviewAvailability(db, task, phase, targets, now) {
    if (!targets.length) return "ready";
    if (!task.project_id) return "ineligible";
    const userId = nextActor(task, phase);
    if (!this.memberships(db, task.project_id).some((m) => m.userId === userId && isGrantActive(m, now))) return "ineligible";
    const row = db.prepare(`SELECT u.role,p.id AS personal_space_id FROM users u JOIN spaces p ON p.owner_user_id=u.id
      AND p.service_id=u.planning_home_service_id AND p.kind='personal' AND p.status='active'
      WHERE u.id=? AND u.status='active' AND u.planning_home_service_id=?`).get(userId, task.service_id);
    if (!row || task.task_kind === "project_admin" && userId === task.final_reviewer_id && row.role !== "admin") return "ineligible";
    const reviewer = { userId, serviceId: task.service_id, personalSpaceId: String(row.personal_space_id) };
    return targets.every((target2) => this.readable(reviewer, task, target2, now)) ? "ready" : "missing";
  }
  advancePhase(db, task, phase, submission, now) {
    db.prepare("DELETE FROM task_material_waits WHERE task_id=?").run(task.id);
    if (isReviewPhase(phase) && this.reviewAvailability(db, task, phase, pinnedTargets(db, submission), now) === "missing") {
      db.prepare("INSERT INTO task_material_waits VALUES(?,?,?)").run(task.id, submission.version, phase);
      advance(db, task, waiting, now);
    } else advance(db, task, phase, now);
  }
  // Only call in a write transaction, after checking the caller's task access.
  reconcileMaterials(db, task, now) {
    const state = task.current_state;
    if (state !== waiting && !isReviewPhase(state)) return task;
    const active2 = latestSubmission(db, task.id);
    if (!active2) return task;
    const wait = state === waiting ? materialWait(db, task.id) : void 0;
    if (state === waiting && (!wait || wait.submission_version !== active2.version)) return task;
    const phase = wait?.resume_state ?? state;
    if (!isReviewPhase(phase)) return task;
    const availability = this.reviewAvailability(db, task, phase, pinnedTargets(db, active2), now);
    if (availability === "ineligible" || state === waiting === (availability === "missing")) return task;
    const next = state === waiting ? phase : waiting;
    if (state === waiting) db.prepare("DELETE FROM task_material_waits WHERE task_id=?").run(task.id);
    else db.prepare("INSERT INTO task_material_waits VALUES(?,?,?)").run(task.id, active2.version, phase);
    advance(db, task, next, now);
    return { ...task, current_state: next, revision: task.revision + 1, updated_at: now };
  }
  checkAccess(s, projectId, taskId, materialView = false) {
    return this.tx(taskId && materialView ? "write" : "read", (db, now) => {
      const a = this.actor(s, now);
      if (projectId !== null) this.project(db, a, projectId, now);
      if (taskId) {
        const task = this.lookup(db, a, taskId, now);
        if (task.project_id !== projectId) throw hidden4();
        if (materialView) {
          const current = this.reconcileMaterials(db, task, now);
          return { allowed: true, access_revision: this.materialVisibility(a, current, db, now).access_revision };
        }
      }
      return { allowed: true };
    });
  }
  get(s, id) {
    return this.tx("write", (db, now) => taskView(db, this.reconcileMaterials(db, this.lookup(db, this.actor(s, now), id, now), now)));
  }
  list(s, projectId) {
    return this.tx("read", (db, now) => {
      const a = this.actor(s, now);
      const rows = projectId === null ? db.prepare(`SELECT * FROM tasks WHERE service_id=? AND project_id IS NULL AND personal_space_id=? AND issuer_id=? ORDER BY issued_at DESC,id LIMIT 201`).all(a.serviceId, a.personalSpaceId, a.userId) : db.prepare(`SELECT * FROM tasks WHERE service_id=? AND project_id=? AND (? OR (? AND task_kind='project_collaboration')
          OR ? IN (issuer_id,assignee_id,final_reviewer_id,peer_reviewer_id)) ORDER BY issued_at DESC,id LIMIT 201`).all(a.serviceId, projectId, Number(this.project(db, a, projectId, now).row.owner_user_id === a.userId), Number(a.role === "admin"), a.userId);
      if (rows.length > 200) throw new AssetError(409, "TASK_LIST_LIMIT");
      return rows.map((task) => taskSummary(db, task));
    });
  }
  assign(s, expected, projectId, key, d) {
    if (!validTaskDraft(d)) throw invalid3();
    const title = d.title.trim(), goal = d.goal.trim(), items = clean(d.criteria), peer = d.peer_reviewer_id ?? null;
    const digest3 = createHash15("sha256").update(JSON.stringify([projectId, title, goal, d.due_at, d.assignee_id, d.final_reviewer_id, peer, items])).digest("hex");
    return this.tx("write", (db, now) => {
      const a = this.actor(s, now, expected), project = projectId === null ? null : this.project(db, a, projectId, now);
      if (project && project.row.owner_user_id !== a.userId) throw hidden4();
      const old = db.prepare("SELECT id,request_digest FROM tasks WHERE service_id=? AND issuer_id=? AND request_key=?").get(a.serviceId, a.userId, key);
      if (old) {
        if (old.request_digest !== digest3) throw new AssetError(409, "TASK_REQUEST_CONFLICT");
        return { task: taskView(db, this.lookup(db, a, String(old.id), now)), replayed: true };
      }
      const decision = decideAssignment(d, { id: a.userId, role: a.role }, project && this.participants(db, a, project.active), now);
      if ("error" in decision) throw new AssetError(decision.error === "TASK_MEMBER_UNAVAILABLE" ? 409 : 422, decision.error);
      const id = randomUUID16();
      db.prepare(`INSERT INTO tasks(id,service_id,project_id,issuer_id,personal_space_id,assignee_id,task_kind,title,goal,due_at,final_reviewer_id,
        peer_reviewer_id,criteria_revision,current_state,revision,issued_at,updated_at,request_key,request_digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,'assigned',1,?,?,?,?)`).run(id, a.serviceId, projectId, a.userId, projectId === null ? a.personalSpaceId : null, d.assignee_id, decision.kind, title, goal, d.due_at, d.final_reviewer_id, peer, now, now, key, digest3);
      db.prepare("INSERT INTO task_criteria_versions VALUES(?,1,?,'next_submission',?,?)").run(id, JSON.stringify(items), a.userId, now);
      return { task: taskView(db, this.lookup(db, a, id, now)), replayed: false };
    });
  }
  revise(s, expected, id, revision, criteria) {
    if (!Number.isSafeInteger(revision) || revision < 1 || !validTaskCriteria(criteria)) throw invalid3();
    const items = JSON.stringify(clean(criteria));
    return this.tx("write", (db, now) => {
      const a = this.actor(s, now, expected), task = this.lookup(db, a, id, now);
      if (task.issuer_id !== a.userId) throw hidden4();
      if (task.revision !== revision) throw new AssetError(409, "TASK_REVISION_CONFLICT");
      if (!["assigned", "returned"].includes(task.current_state)) throw new AssetError(409, "TASK_STATE_CONFLICT");
      const prior = db.prepare("SELECT acceptance_items FROM task_criteria_versions WHERE task_id=? AND version=?").get(id, task.criteria_revision);
      if (prior?.acceptance_items === items) return taskView(db, task);
      if (task.criteria_revision >= 50) throw new AssetError(409, "TASK_CRITERIA_LIMIT");
      const next = task.criteria_revision + 1;
      db.prepare("INSERT INTO task_criteria_versions VALUES(?,?,?,'next_submission',?,?)").run(id, next, items, a.userId, now);
      const changed2 = db.prepare("UPDATE tasks SET criteria_revision=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?").run(next, now, id, revision);
      if (Number(changed2.changes) !== 1) throw new AssetError(409, "TASK_REVISION_CONFLICT");
      return taskView(db, this.lookup(db, a, id, now));
    });
  }
  history(s, id) {
    return this.tx("write", (db, now) => {
      const a = this.actor(s, now), task = this.reconcileMaterials(db, this.lookup(db, a, id, now), now);
      const { visible, access_revision } = this.materialVisibility(a, task, db, now);
      const restricted = new Set(visible.filter((r) => r.materials.includes(null)).map((r) => r.attempt.id));
      const reviews = db.prepare(`SELECT d.id,d.submission_id,d.reviewer_id,d.stage,d.verdict,d.criteria_results,d.reason,d.requested_work,d.decided_at,d.request_digest,
          NULL AS supersedes_id,s.version AS submission_version,0 AS correction,d.rowid AS sequence
        FROM task_review_decisions d JOIN task_submissions s ON s.id=d.submission_id WHERE s.task_id=?
        UNION ALL SELECT c.id,c.submission_id,c.reviewer_id,'final',c.verdict,c.criteria_results,c.reason,c.requested_work,c.decided_at,c.request_digest,
          COALESCE(c.previous_review_id,c.previous_correction_id),s.version,1,c.rowid
        FROM task_review_corrections c JOIN task_submissions s ON s.id=c.submission_id WHERE s.task_id=?
        ORDER BY submission_version,correction,sequence`).all(id, id);
      const active2 = visible.at(-1)?.attempt;
      const appeals = db.prepare("SELECT * FROM task_appeals WHERE task_id=? ORDER BY rowid").all(id);
      const pending = appeals.find((r) => r.status === "pending");
      const formal = active2 && !restricted.has(active2.id) && hasFormalDecision(task.current_state) ? latestFormalReview(db, active2.id) : void 0;
      const correctable = formal && !pending && canCorrect(a, task);
      const appealable = formal && !pending && a.userId === task.assignee_id && !appeals.some((r) => appealDecisionId(r) === formal.id);
      const resolvable = formal && pending && canResolveAppeal(a, task) && appealDecisionId(pending) === formal.id;
      return {
        task_revision: task.revision,
        access_revision,
        submissions: visible.map(({ attempt, materials }) => ({
          ...submissionView(task, attempt),
          ...materials.length ? { materials } : {},
          ...restricted.has(attempt.id) ? { content: null } : {}
        })),
        reviews: reviews.map((r) => ({ ...reviewView(r), ...restricted.has(r.submission_id) ? { criteria_results: [], reason: null, requested_work: null } : {} })),
        ...appeals.length ? { appeals: appeals.map((r) => ({ ...appealView(r), ...restricted.has(r.submission_id) ? { reason: null } : {} })) } : {},
        ...correctable ? { correction: { supersedes_id: formal.id } } : {},
        ...appealable ? { appeal_target_id: formal.id } : {},
        ...resolvable ? { appeal_resolution_id: pending.id } : {}
      };
    });
  }
  requestAppeal(s, expected, decisionId, key, revision, reason) {
    if (!validRevision(revision) || !validTaskAppeal(reason)) throw invalid3();
    const text2 = reason.trim(), digest3 = requestDigest([decisionId, revision, text2]);
    return this.tx("write", (db, now) => {
      const a = this.actor(s, now, expected), submission = formalDecisionSubmission(db, decisionId);
      if (!submission) throw hidden4();
      const task = this.lookup(db, a, submission.task_id, now);
      if (task.assignee_id !== a.userId) throw hidden4();
      if (pinnedTargets(db, submission).some((m) => !this.readable(a, task, m, now))) throw materialAccessRequired();
      const old = db.prepare("SELECT * FROM task_appeals WHERE task_id=? AND requester_id=? AND request_key=?").get(task.id, a.userId, key);
      if (old) {
        if (old.request_digest !== digest3) throw new AssetError(409, "TASK_REQUEST_CONFLICT");
        return { task: taskView(db, task), appeal: appealView(old), replayed: true };
      }
      requireRevision(task, revision);
      if (latestSubmission(db, task.id)?.id !== submission.id) throw new AssetError(409, "TASK_SUBMISSION_CONFLICT");
      const current = latestFormalReview(db, submission.id);
      if (!hasFormalDecision(task.current_state) || current?.id !== decisionId) throw new AssetError(409, "TASK_REVIEW_CONFLICT");
      if (pendingAppeal(db, task.id) || db.prepare("SELECT 1 FROM task_appeals WHERE against_review_id=? OR against_correction_id=?").get(decisionId, decisionId))
        throw new AssetError(409, "TASK_APPEAL_CONFLICT");
      const appealId = randomUUID16();
      db.prepare(`INSERT INTO task_appeals(id,task_id,submission_id,requester_id,reason,against_review_id,against_correction_id,
        status,requested_at,request_key,request_digest) VALUES(?,?,?,?,?,?,?,'pending',?,?,?)`).run(appealId, task.id, submission.id, a.userId, text2, current.correction ? null : current.id, current.correction ? current.id : null, now, key, digest3);
      advance(db, task, task.current_state, now);
      recordDecisionImpact(db, task, a, now, appealId, "appeal.opened", { submission_id: submission.id, decision_id: decisionId, appeal_id: appealId });
      return { task: taskView(db, this.lookup(db, a, task.id, now)), appeal: appealView(appealById(db, appealId)), replayed: false };
    });
  }
  resolveAppeal(s, expected, appealId, key, revision, action, input) {
    const target2 = this.tx("read", (db, now) => {
      const a = this.actor(s, now, expected), appeal = appealById(db, appealId);
      if (!appeal || !canResolveAppeal(a, this.lookup(db, a, appeal.task_id, now))) throw hidden4();
      return appeal;
    });
    return this.review(s, expected, target2.task_id, key, revision, target2.submission_id, action, input, appealDecisionId(target2), target2.id);
  }
  submit(s, expected, id, key, revision, content, materials = []) {
    if (!validRevision(revision) || !validTaskSubmission(content)) throw invalid3();
    const normalized = content.trim(), targets = materialList(materials), digest3 = requestDigest(targets.length ? [revision, normalized, targets] : [revision, normalized]);
    const result = this.tx("write", (db, now) => {
      const a = this.actor(s, now, expected), before = this.lookup(db, a, id, now);
      const task = this.reconcileMaterials(db, before, now);
      if (task.assignee_id !== a.userId) throw hidden4();
      const old = db.prepare("SELECT * FROM task_submissions WHERE task_id=? AND author_id=? AND request_key=?").get(id, a.userId, key);
      if (old) {
        if (old.request_digest !== digest3) throw new AssetError(409, "TASK_REQUEST_CONFLICT");
        const refs = pinnedTargets(db, old);
        if (refs.some((m) => !this.readable(a, task, m, now))) return materialUnavailable();
        return { task: taskView(db, task), submission: { ...submissionView(task, old), ...refs.length ? { materials: refs } : {} }, replayed: true };
      }
      if (before.revision !== task.revision) return new AssetError(409, "TASK_REVISION_CONFLICT");
      requireRevision(task, revision);
      if (pendingAppeal(db, id)) throw new AssetError(409, "TASK_APPEAL_PENDING");
      const previous = latestSubmission(db, id);
      const state = transition(task.current_state === waiting ? { ...task, current_state: "returned" } : task, a, "submit");
      if (task.current_state === waiting && (!targets.length || requestDigest(targets) === requestDigest(pinnedTargets(db, previous)))) throw new AssetError(409, "TASK_MATERIAL_REPLACEMENT_REQUIRED");
      for (const target2 of targets) {
        if (!this.readable(a, task, target2, now)) throw materialUnavailable();
        try {
          if (!this.validateMaterial(db, a, target2, now)) throw materialUnavailable();
        } catch (e) {
          if (e instanceof AssetError && (e.status === 404 || e.status === 422)) throw materialUnavailable();
          throw e;
        }
      }
      const version = (previous?.version ?? 0) + 1;
      if (version > 50) throw new AssetError(409, "TASK_SUBMISSION_LIMIT");
      const submissionId = randomUUID16();
      db.prepare(`INSERT INTO task_submissions(id,task_id,version,criteria_version,author_id,content,submitted_at,previous_version,request_key,request_digest)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(submissionId, id, version, task.criteria_revision, a.userId, normalized, now, previous?.version ?? null, key, digest3);
      const saved = latestSubmission(db, id);
      const insert = db.prepare("INSERT INTO task_submission_materials VALUES(?,?,?,?,?,?,?)");
      for (const [i, t] of targets.entries()) insert.run(id, version, i + 1, t.asset_id, t.version_id, t.ordinal, t.conversion_id ?? null);
      this.advancePhase(db, task, state, saved, now);
      return { task: taskView(db, this.lookup(db, a, id, now)), submission: { ...submissionView(task, saved), ...targets.length ? { materials: targets } : {} }, replayed: false };
    });
    if (result instanceof AssetError) throw result;
    return result;
  }
  review(s, expected, id, key, revision, submissionId, action, input, supersedes, appealId) {
    if (!validRevision(revision) || !isTaskReviewAction(action)) throw invalid3();
    const stage = action.startsWith("peer_") ? "peer" : "final", verdict = action.slice(stage.length + 1), correction = supersedes !== void 0;
    if (correction && (!validId(supersedes) || stage !== "final")) throw invalid3();
    const result = this.tx("write", (db, now) => {
      const a = this.actor(s, now, expected), before = this.lookup(db, a, id, now);
      const appeal = appealId === void 0 ? void 0 : appealById(db, appealId);
      if (appealId !== void 0 && (!appeal || appeal.task_id !== id || appeal.submission_id !== submissionId || appealDecisionId(appeal) !== supersedes)) throw hidden4();
      if (correction) {
        if (!(appeal ? canResolveAppeal(a, before) : canCorrect(a, before))) throw hidden4();
      } else if (stage === "peer" ? a.userId !== before.peer_reviewer_id : a.userId !== before.final_reviewer_id || before.task_kind === "project_admin" && a.role !== "admin") throw hidden4();
      if (before.task_kind === "personal") throw new AssetError(409, "TASK_WORKFLOW_UNAVAILABLE");
      const submission = db.prepare("SELECT * FROM task_submissions WHERE task_id=? AND id=?").get(id, submissionId);
      if (!submission) throw hidden4();
      const task = this.reconcileMaterials(db, before, now);
      if (pinnedTargets(db, submission).some((m) => !this.readable(a, task, m, now))) return materialAccessRequired();
      if (before.revision !== task.revision) return new AssetError(409, "TASK_REVISION_CONFLICT");
      const { acceptance_items } = db.prepare("SELECT acceptance_items FROM task_criteria_versions WHERE task_id=? AND version=?").get(id, submission.criteria_version);
      if (!validTaskReview(action, JSON.parse(String(acceptance_items)).length, input)) throw invalid3();
      const results = input.results.map((r) => ({ criterion: r.criterion, met: r.met, evidence: r.evidence.trim() })).sort((l, r) => l.criterion - r.criterion);
      const reason = input.reason.trim(), requested = input.requested_work?.trim() ?? null;
      const digestFields = [revision, action, results, reason, requested];
      if (correction) digestFields.push(supersedes);
      if (appeal) digestFields.push(appeal.id);
      const digest3 = requestDigest(digestFields);
      const old = db.prepare(correction ? `SELECT ${correctionColumns} FROM task_review_corrections WHERE submission_id=? AND reviewer_id=? AND request_key=?` : "SELECT * FROM task_review_decisions WHERE submission_id=? AND reviewer_id=? AND request_key=?").get(submissionId, a.userId, key);
      if (old) {
        if (old.request_digest !== digest3) throw new AssetError(409, "TASK_REQUEST_CONFLICT");
        return { task: taskView(db, task), review: reviewView(old), ...appeal ? { appeal: appealView(appeal) } : {}, replayed: true };
      }
      const otherReceipt = correction ? "task_review_decisions" : "task_review_corrections";
      if (db.prepare(`SELECT 1 FROM ${otherReceipt} WHERE submission_id=? AND reviewer_id=? AND request_key=?`).get(submissionId, a.userId, key))
        throw new AssetError(409, "TASK_REQUEST_CONFLICT");
      requireRevision(task, revision);
      if (latestSubmission(db, id)?.id !== submissionId) throw new AssetError(409, "TASK_SUBMISSION_CONFLICT");
      const pending = pendingAppeal(db, id);
      if (pending && pending.id !== appeal?.id) throw new AssetError(409, "TASK_APPEAL_PENDING");
      if (appeal && appeal.status !== "pending") throw new AssetError(409, "TASK_APPEAL_CONFLICT");
      const state = transition(task, a, action, correction, Boolean(appeal)), reviewId = randomUUID16();
      if (correction) {
        const current = latestFormalReview(db, submissionId);
        if (!current || current.id !== supersedes) throw new AssetError(409, "TASK_REVIEW_CONFLICT");
        db.prepare(`INSERT INTO task_review_corrections(id,submission_id,reviewer_id,previous_review_id,previous_correction_id,verdict,
          criteria_results,reason,requested_work,decided_at,request_key,request_digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(reviewId, submissionId, a.userId, current.correction ? null : current.id, current.correction ? current.id : null, verdict, JSON.stringify(results), reason, requested, now, key, digest3);
      } else {
        db.prepare(`INSERT INTO task_review_decisions(id,submission_id,reviewer_id,stage,verdict,criteria_results,reason,requested_work,decided_at,request_key,request_digest)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(reviewId, submissionId, a.userId, stage, verdict, JSON.stringify(results), reason, requested, now, key, digest3);
      }
      this.advancePhase(db, task, state, submission, now);
      if (appeal) {
        const resolved = db.prepare(`UPDATE task_appeals SET status='resolved',resolved_by=?,resolution_decision_id=?,resolved_at=?
          WHERE id=? AND status='pending'`).run(a.userId, reviewId, now, appeal.id);
        if (Number(resolved.changes) !== 1) throw new AssetError(409, "TASK_APPEAL_CONFLICT");
      }
      if (correction) recordDecisionImpact(
        db,
        task,
        a,
        now,
        appeal?.id ?? key,
        appeal ? "appeal.resolved" : "decision.corrected",
        { submission_id: submissionId, decision_id: reviewId, supersedes_id: supersedes, ...appeal ? { appeal_id: appeal.id } : {} }
      );
      const saved = db.prepare(correction ? `SELECT ${correctionColumns} FROM task_review_corrections WHERE id=?` : "SELECT * FROM task_review_decisions WHERE id=?").get(reviewId);
      return { task: taskView(db, this.lookup(db, a, id, now)), review: reviewView(saved), ...appeal ? { appeal: appealView(appealById(db, appeal.id)) } : {}, replayed: false };
    });
    if (result instanceof AssetError) throw result;
    return result;
  }
};

// src/host/project-task-review-schema.ts
var PROJECT_TASK_REVIEW_SCHEMA = `
CREATE TABLE task_submissions (
  id TEXT NOT NULL UNIQUE, task_id TEXT NOT NULL REFERENCES tasks(id),
  version INTEGER NOT NULL CHECK(version>0), criteria_version INTEGER NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 16000),
  submitted_at TEXT NOT NULL, previous_version INTEGER,
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  PRIMARY KEY(task_id,version), UNIQUE(task_id,author_id,request_key),
  FOREIGN KEY(task_id,criteria_version) REFERENCES task_criteria_versions(task_id,version),
  FOREIGN KEY(task_id,previous_version) REFERENCES task_submissions(task_id,version),
  CHECK((version=1 AND previous_version IS NULL) OR (version>1 AND previous_version IS NOT NULL AND previous_version=version-1))
) STRICT;
CREATE TABLE task_review_decisions (
  id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES task_submissions(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id), stage TEXT NOT NULL CHECK(stage IN ('peer','final')),
  verdict TEXT NOT NULL, criteria_results TEXT NOT NULL CHECK(json_valid(criteria_results) AND json_type(criteria_results)='array'),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 4000), requested_work TEXT,
  decided_at TEXT NOT NULL, request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(submission_id,stage), UNIQUE(submission_id,reviewer_id,request_key),
  CHECK((stage='peer' AND verdict IN ('pass','return')) OR (stage='final' AND verdict IN ('accept','return','fail'))),
  CHECK((verdict='return' AND requested_work IS NOT NULL AND length(requested_work) BETWEEN 1 AND 4000)
    OR (verdict!='return' AND requested_work IS NULL))
) STRICT;
`;
var PROJECT_TASK_CORRECTION_SCHEMA = `
CREATE TABLE task_review_corrections (
  id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES task_submissions(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  previous_review_id TEXT UNIQUE REFERENCES task_review_decisions(id),
  previous_correction_id TEXT UNIQUE REFERENCES task_review_corrections(id),
  verdict TEXT NOT NULL CHECK(verdict IN ('accept','return','fail')),
  criteria_results TEXT NOT NULL CHECK(json_valid(criteria_results) AND json_type(criteria_results)='array'),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 4000), requested_work TEXT,
  decided_at TEXT NOT NULL, request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(submission_id,reviewer_id,request_key),
  CHECK((previous_review_id IS NULL) != (previous_correction_id IS NULL)),
  CHECK((verdict='return' AND requested_work IS NOT NULL AND length(requested_work) BETWEEN 1 AND 4000)
    OR (verdict!='return' AND requested_work IS NULL))
) STRICT;
CREATE INDEX task_review_corrections_submission ON task_review_corrections(submission_id);
`;

// src/host/project-task-material-schema.ts
var PROJECT_TASK_MATERIAL_SCHEMA = `
CREATE TABLE task_submission_materials (
  task_id TEXT NOT NULL, submission_version INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 10),
  asset_id TEXT NOT NULL REFERENCES assets(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  ordinal INTEGER NOT NULL CHECK(ordinal>=1), conversion_id TEXT REFERENCES office_conversions(id),
  PRIMARY KEY(task_id,submission_version,position),
  FOREIGN KEY(task_id,submission_version) REFERENCES task_submissions(task_id,version)
) STRICT;
CREATE TABLE task_material_waits (
  task_id TEXT PRIMARY KEY, submission_version INTEGER NOT NULL,
  resume_state TEXT NOT NULL CHECK(resume_state IN ('submitted','awaiting_admin_review')),
  FOREIGN KEY(task_id,submission_version) REFERENCES task_submissions(task_id,version)
) STRICT;
`;

// src/host/project-task-appeal-schema.ts
var PROJECT_TASK_APPEAL_SCHEMA = `
CREATE TABLE task_appeals (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), submission_id TEXT NOT NULL REFERENCES task_submissions(id),
  requester_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 4000),
  against_review_id TEXT UNIQUE REFERENCES task_review_decisions(id),
  against_correction_id TEXT UNIQUE REFERENCES task_review_corrections(id),
  status TEXT NOT NULL CHECK(status IN ('pending','resolved')), requested_at TEXT NOT NULL,
  resolved_by TEXT REFERENCES users(id), resolution_decision_id TEXT UNIQUE REFERENCES task_review_corrections(id), resolved_at TEXT,
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(task_id,requester_id,request_key),
  CHECK((against_review_id IS NULL) != (against_correction_id IS NULL)),
  CHECK((status='pending' AND resolved_by IS NULL AND resolution_decision_id IS NULL AND resolved_at IS NULL)
    OR (status='resolved' AND resolved_by IS NOT NULL AND resolution_decision_id IS NOT NULL AND resolved_at IS NOT NULL))
) STRICT;
CREATE INDEX task_appeals_history ON task_appeals(task_id,requested_at);
CREATE UNIQUE INDEX task_appeals_pending ON task_appeals(task_id) WHERE status='pending';
CREATE TABLE task_decision_impacts (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id), task_revision INTEGER NOT NULL CHECK(task_revision>0),
  recalculation_required INTEGER NOT NULL CHECK(recalculation_required IN (0,1)), updated_at TEXT NOT NULL
) STRICT;
`;

// src/host/recall-store.ts
import { createHash as createHash17, randomUUID as randomUUID17 } from "node:crypto";

// src/host/recall-range.ts
import { createHash as createHash16 } from "node:crypto";
var digest = (text2) => createHash16("sha256").update(text2, "utf8").digest("hex");
var invalid4 = () => new AssetError(422, "INVALID_RECALL_RANGE");
var changed = () => new AssetError(409, "RECALL_SOURCE_CHANGED");
var available = (text2) => {
  if (text2 === void 0) throw new AssetError(409, "RECALL_SOURCE_NOT_READY");
  return text2;
};
function boundary(text2, n) {
  if (!Number.isSafeInteger(n) || n < 0 || n > text2.length) return false;
  const a = text2.charCodeAt(n - 1), b = text2.charCodeAt(n);
  return !(a >= 55296 && a <= 56319 && b >= 56320 && b <= 57343);
}
function recallSelection(first, last, interior, total, read) {
  if (![first.ordinal, last.ordinal, total].every(Number.isSafeInteger) || first.ordinal < 1 || last.ordinal < first.ordinal || last.ordinal > total) throw invalid4();
  if (interior.length !== Math.max(0, last.ordinal - first.ordinal - 1)) throw invalid4();
  const segments = [];
  for (let ordinal = first.ordinal; ordinal <= last.ordinal; ordinal++) {
    const text2 = available(read(ordinal)), source_hash = digest(text2);
    if (ordinal === first.ordinal && source_hash !== first.source_hash || ordinal === last.ordinal && source_hash !== last.source_hash || ordinal > first.ordinal && ordinal < last.ordinal && source_hash !== interior[ordinal - first.ordinal - 1]) throw changed();
    const start = ordinal === first.ordinal ? first.offset : 0, end = ordinal === last.ordinal ? last.offset : text2.length;
    if (!boundary(text2, start) || !boundary(text2, end) || start > end) throw invalid4();
    segments.push({ ordinal, start, end, source_hash });
  }
  if (!segments.some((s) => s.end > s.start)) throw invalid4();
  return segments;
}
function recallMasks(segments, masks, read) {
  const byPage = new Map(segments.map((s) => [s.ordinal, s])), normalized = masks.map((m) => ({ ...m })).sort((a, b) => a.ordinal - b.ordinal || a.start - b.start || a.end - b.end);
  let previous, text2 = "";
  for (const m of normalized) {
    const s = byPage.get(m.ordinal);
    if (!s || !Number.isSafeInteger(m.group) || m.group < 1 || m.start < s.start || m.end > s.end || m.start >= m.end) throw invalid4();
    if (previous?.ordinal !== m.ordinal) {
      text2 = available(read(m.ordinal));
      if (digest(text2) !== s.source_hash) throw changed();
    } else if (m.start < previous.end) throw invalid4();
    if (!boundary(text2, m.start) || !boundary(text2, m.end)) throw invalid4();
    previous = m;
  }
  return normalized;
}
function recallPractice(segment2, masks, revealed, text2) {
  if (digest(text2) !== segment2.source_hash) throw changed();
  const runs = [];
  let offset = segment2.start;
  const visible = (start, end) => {
    if (end > start) runs.push({ kind: "text", text: text2.slice(start, end) });
  };
  for (const m of masks) {
    if (m.ordinal !== segment2.ordinal) continue;
    visible(offset, m.start);
    if (revealed.has(m.group)) visible(m.start, m.end);
    else runs.push({ kind: "hidden", group: m.group, length: m.end - m.start });
    offset = m.end;
  }
  visible(offset, segment2.end);
  return runs;
}

// src/host/recall-store.ts
var RECALL_SCHEMA = `CREATE TABLE recall_pdf_blank_pages (
  version_id TEXT NOT NULL, page INTEGER NOT NULL,
  PRIMARY KEY(version_id,page), FOREIGN KEY(version_id,page) REFERENCES pdf_pages(version_id,page)
) STRICT;
CREATE TABLE recall_word_sources (
  conversion_id TEXT NOT NULL REFERENCES word_search_runs(conversion_id), page INTEGER NOT NULL CHECK(page>=1),
  result_blob_id TEXT NOT NULL REFERENCES blobs(id), blank INTEGER NOT NULL CHECK(blank IN (0,1)),
  PRIMARY KEY(conversion_id,page)
) STRICT;
CREATE TABLE recall_materials (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id), service_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  conversion_id TEXT REFERENCES office_conversions(id), title TEXT NOT NULL, created_at TEXT NOT NULL,
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(service_id,owner_user_id,request_key)
) STRICT;
CREATE INDEX recall_materials_owner ON recall_materials(service_id,owner_user_id,id);
CREATE TABLE recall_segments (
  material_id TEXT NOT NULL REFERENCES recall_materials(id), ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  start INTEGER NOT NULL CHECK(start>=0), end INTEGER NOT NULL CHECK(end>=start),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64), PRIMARY KEY(material_id,ordinal)
) STRICT;
CREATE TABLE recall_masks (
  material_id TEXT NOT NULL, ordinal INTEGER NOT NULL, start INTEGER NOT NULL CHECK(start>=0),
  end INTEGER NOT NULL CHECK(end>start), mask_group INTEGER NOT NULL CHECK(mask_group>=1),
  PRIMARY KEY(material_id,ordinal,start), FOREIGN KEY(material_id,ordinal) REFERENCES recall_segments(material_id,ordinal)
) STRICT;
CREATE TABLE recall_attempts (
  material_id TEXT PRIMARY KEY, active_ordinal INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision>=1),
  FOREIGN KEY(material_id,active_ordinal) REFERENCES recall_segments(material_id,ordinal)
) STRICT;
CREATE TABLE recall_events (
  material_id TEXT NOT NULL REFERENCES recall_attempts(material_id), revision INTEGER NOT NULL CHECK(revision>=2),
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64), event TEXT NOT NULL,
  value INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(material_id,revision), UNIQUE(material_id,request_key),
  CHECK(event IN ('move','hint','reveal','recall','rating'))
) STRICT;
CREATE INDEX recall_events_groups ON recall_events(material_id,event,value);`;
var sha3 = (text2) => createHash17("sha256").update(text2).digest("hex");
var invalid5 = () => new AssetError(422, "INVALID_RECALL");
var notFound4 = () => new AssetError(404, "RECALL_NOT_FOUND");
var point2 = (t, ordinal) => ({ asset_id: t.asset_id, version_id: t.version_id, ordinal, ...t.conversion_id ? { conversion_id: t.conversion_id } : {} });
var RecallStore = class {
  constructor(tx, current, allowed, source) {
    this.tx = tx;
    this.current = current;
    this.allowed = allowed;
    this.source = source;
  }
  actor(prior, now, expected) {
    const a = this.current(prior, now);
    if (!a) throw new AssetError(401, "AUTH_REQUIRED");
    if (expected !== void 0 && expected !== a.userId) throw new AssetError(409, "ACTOR_CHANGED");
    return a;
  }
  material(db, a, id, now) {
    const row = db.prepare(`SELECT id,title,asset_id,version_id,conversion_id FROM recall_materials WHERE id=? AND service_id=? AND owner_user_id=?`).get(id, a.serviceId, a.userId);
    if (!row || !this.allowed(a, row.asset_id, now)) throw notFound4();
    return row;
  }
  practice(db, a, m, now) {
    const attempt = db.prepare("SELECT active_ordinal,revision FROM recall_attempts WHERE material_id=?").get(m.id);
    const ordinal = Number(attempt.active_ordinal);
    const segment2 = db.prepare("SELECT ordinal,start,end,source_hash FROM recall_segments WHERE material_id=? AND ordinal=?").get(m.id, ordinal);
    const source = this.source(db, a, point2(m, ordinal), now);
    const masks = db.prepare('SELECT ordinal,start,end,mask_group AS "group" FROM recall_masks WHERE material_id=? AND ordinal=? ORDER BY start').all(m.id, ordinal);
    const events = db.prepare(`SELECT event,value,count(*) AS count FROM recall_events WHERE material_id=? AND event IN ('hint','reveal','recall') GROUP BY event,value`).all(m.id);
    const ratings = db.prepare("SELECT value FROM recall_events WHERE material_id=? AND event='rating' ORDER BY revision DESC LIMIT 1").get(m.id);
    const revealed = new Set(events.filter((e) => e.event === "reveal").map((e) => Number(e.value)));
    const recalled = events.filter((e) => e.event === "recall").map((e) => Number(e.value));
    const bounds = db.prepare("SELECT min(ordinal) AS first,max(ordinal) AS last,sum(end-start) AS length FROM recall_segments WHERE material_id=?").get(m.id);
    const head = db.prepare("SELECT id FROM asset_versions WHERE asset_id=? ORDER BY version DESC LIMIT 1").get(m.asset_id);
    const conversion = m.conversion_id ? db.prepare("SELECT id FROM office_conversions WHERE version_id=? AND state='ready' ORDER BY rowid DESC LIMIT 1").get(m.version_id) : void 0;
    return {
      material: m,
      ordinal,
      revision: Number(attempt.revision),
      first: Number(bounds.first),
      last: Number(bounds.last),
      length: Number(bounds.length),
      page_length: segment2.end - segment2.start,
      source_changed: head?.id !== m.version_id || Boolean(m.conversion_id && conversion?.id !== m.conversion_id),
      runs: recallPractice(segment2, masks, revealed, source.text),
      progress: {
        hints: events.filter((e) => e.event === "hint").map((e) => ({ group: Number(e.value), count: Number(e.count) })),
        revealed: [...revealed],
        independent_recall: recalled,
        self_rating: ratings ? Number(ratings.value) : null
      }
    };
  }
  authorPage(prior, t) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), s = this.source(db, a, t, now);
      return { actor_id: a.userId, ordinal: s.ordinal, total: s.total, text: s.text, title: s.title, source_hash: sha3(s.text) };
    });
  }
  list(prior, after = "") {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now), items = [];
      for (const row of db.prepare("SELECT id,title,asset_id FROM recall_materials WHERE service_id=? AND owner_user_id=? AND id>? ORDER BY id").iterate(a.serviceId, a.userId, after)) {
        if (!this.allowed(a, String(row.asset_id), now)) continue;
        items.push({ id: String(row.id), title: String(row.title) });
        if (items.length === 51) break;
      }
      return { items: items.slice(0, 50), next: items.length > 50 ? items[49].id : null };
    });
  }
  get(prior, id) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now);
      return this.practice(db, a, this.material(db, a, id, now), now);
    });
  }
  create(prior, expected, key, draft) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now, expected), digest3 = sha3(JSON.stringify(draft));
      const old = db.prepare("SELECT id,request_digest FROM recall_materials WHERE service_id=? AND owner_user_id=? AND request_key=?").get(a.serviceId, a.userId, key);
      if (old) {
        const m2 = this.material(db, a, String(old.id), now);
        if (old.request_digest !== digest3) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { data: this.practice(db, a, m2, now), replayed: true };
      }
      if (!draft.title.trim() || draft.title.length > 200 || !draft.masks.length) throw invalid5();
      const first = this.source(db, a, point2(draft, draft.first.ordinal), now);
      const read = (n) => n === first.ordinal ? first.text : this.source(db, a, point2(draft, n), now).text;
      const segments = recallSelection(draft.first, draft.last, draft.interior_hashes, first.total, read), masks = recallMasks(segments, draft.masks, read), id = randomUUID17();
      const m = { id, title: draft.title, asset_id: draft.asset_id, version_id: draft.version_id, conversion_id: draft.conversion_id ?? null };
      db.prepare("INSERT INTO recall_materials VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, a.userId, a.serviceId, m.asset_id, m.version_id, m.conversion_id, m.title, now, key, digest3);
      const insert = db.prepare("INSERT INTO recall_segments VALUES(?,?,?,?,?)");
      for (const s of segments) insert.run(id, s.ordinal, s.start, s.end, s.source_hash);
      const maskInsert = db.prepare("INSERT INTO recall_masks VALUES(?,?,?,?,?)");
      for (const mask of masks) maskInsert.run(id, mask.ordinal, mask.start, mask.end, mask.group);
      db.prepare("INSERT INTO recall_attempts VALUES(?,?,1)").run(id, draft.first.ordinal);
      return { data: this.practice(db, a, m, now), replayed: false };
    });
  }
  act(prior, expected, id, key, action) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now, expected), m = this.material(db, a, id, now), digest3 = sha3(JSON.stringify(action));
      const priorEvent = db.prepare("SELECT request_digest FROM recall_events WHERE material_id=? AND request_key=?").get(id, key);
      if (priorEvent) {
        if (priorEvent.request_digest !== digest3) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return this.practice(db, a, m, now);
      }
      const attempt = db.prepare("SELECT active_ordinal,revision FROM recall_attempts WHERE material_id=?").get(id);
      if (attempt.revision !== action.expected_revision) throw new AssetError(409, "REVISION_CONFLICT");
      const { event, value } = action, ordinal = event === "move" ? value : Number(attempt.active_ordinal);
      if (!Number.isSafeInteger(value) || value < 1) throw invalid5();
      if (event === "move") {
        if (!db.prepare("SELECT 1 FROM recall_segments WHERE material_id=? AND ordinal=?").get(id, ordinal)) throw invalid5();
      } else if (event === "hint" || event === "reveal" || event === "recall") {
        if (!db.prepare("SELECT 1 FROM recall_masks WHERE material_id=? AND ordinal=? AND mask_group=?").get(id, ordinal, value)) throw invalid5();
        if (event === "recall" && db.prepare("SELECT 1 FROM recall_events WHERE material_id=? AND value=? AND event IN ('hint','reveal','recall')").get(id, value))
          throw new AssetError(409, "RECALL_NOT_INDEPENDENT");
      } else if (event === "rating" ? value > 5 : true) throw invalid5();
      const revision = action.expected_revision + 1;
      db.prepare("UPDATE recall_attempts SET active_ordinal=?,revision=? WHERE material_id=?").run(ordinal, revision, id);
      db.prepare("INSERT INTO recall_events VALUES(?,?,?,?,?,?,?)").run(id, revision, key, digest3, event, value, now);
      return this.practice(db, a, m, now);
    });
  }
};

// src/host/invitation-store.ts
import { createHash as createHash18, randomBytes, randomUUID as randomUUID18 } from "node:crypto";
var INVITATION_SCHEMA = `CREATE TABLE invitations (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  service_id TEXT NOT NULL, issuer_id TEXT NOT NULL REFERENCES users(id),
  object_id TEXT REFERENCES knowledge_objects(id), project_id TEXT REFERENCES knowledge_projects(id),
  permission TEXT NOT NULL CHECK(permission IN ('read','edit','member')),
  issued_at TEXT NOT NULL, expires_at TEXT NOT NULL CHECK(expires_at>issued_at), revoked_at TEXT,
  max_redemptions INTEGER NOT NULL CHECK(max_redemptions BETWEEN 1 AND 100),
  redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK(redeemed_count BETWEEN 0 AND max_redemptions),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1), request_key TEXT NOT NULL,
  request_digest TEXT NOT NULL CHECK(length(request_digest)=64), UNIQUE(service_id,issuer_id,request_key),
  CHECK((object_id IS NOT NULL AND project_id IS NULL AND permission IN ('read','edit'))
    OR (project_id IS NOT NULL AND object_id IS NULL AND permission='member'))
) STRICT;
CREATE TABLE invitation_redemptions (
  id TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES invitations(id), user_id TEXT NOT NULL REFERENCES users(id),
  redeemed_at TEXT NOT NULL, expires_at TEXT NOT NULL CHECK(expires_at>redeemed_at), revoked_at TEXT,
  UNIQUE(invitation_id,user_id)
) STRICT;
CREATE INDEX invitation_redemptions_user ON invitation_redemptions(user_id,invitation_id);
CREATE INDEX invitations_object ON invitations(object_id);
CREATE INDEX invitations_project ON invitations(project_id);
CREATE TABLE invitation_audit (
  invitation_id TEXT NOT NULL REFERENCES invitations(id), revision INTEGER NOT NULL CHECK(revision>=1),
  actor_id TEXT NOT NULL REFERENCES users(id), event TEXT NOT NULL CHECK(event IN ('issue','redeem','renew','revoke')),
  occurred_at TEXT NOT NULL, prior_expires_at TEXT, expires_at TEXT NOT NULL,
  affected_count INTEGER NOT NULL CHECK(affected_count>=0), PRIMARY KEY(invitation_id,revision)
) STRICT;`;
var INVITATION_EVENT_SCHEMA = `CREATE TABLE domain_events (
  seq INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
  aggregate_revision INTEGER NOT NULL CHECK(aggregate_revision>=1), actor_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL, payload_schema_version INTEGER NOT NULL CHECK(payload_schema_version>=1),
  payload TEXT NOT NULL CHECK(json_valid(payload)), occurred_at TEXT NOT NULL, causation_id TEXT,
  correlation_id TEXT NOT NULL, UNIQUE(aggregate_type,aggregate_id,aggregate_revision)
) STRICT;
CREATE TABLE domain_event_outbox (
  event_id TEXT PRIMARY KEY REFERENCES domain_events(event_id), created_at TEXT NOT NULL,
  delivered_at TEXT, failures INTEGER NOT NULL DEFAULT 0 CHECK(failures>=0), retry_at TEXT, last_error TEXT
) STRICT;`;
var INVITATION_CHANGE_SCHEMA = `CREATE TABLE invitation_change_receipts (
  service_id TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  invitation_id TEXT NOT NULL REFERENCES invitations(id), request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)), PRIMARY KEY(service_id,actor_id,request_key)
) STRICT;`;
var day = 864e5;
var digest2 = (value) => createHash18("sha256").update(value).digest("hex");
var invalid6 = () => new AssetError(422, "INVALID_INVITATION");
var unavailable2 = () => new AssetError(404, "INVITATION_UNAVAILABLE");
var conflict3 = () => new AssetError(409, "INVITATION_CHANGED");
var target = (r) => r.project_id ? { scope: "project", id: r.project_id, permission: "member" } : { scope: "object", id: r.object_id, permission: r.permission };
function duration(days = 7) {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw invalid6();
  return days * day;
}
function cap(n = 1) {
  if (!Number.isInteger(n) || n < 1 || n > 100) throw invalid6();
  return n;
}
function receipt2(r) {
  return {
    id: r.id,
    target: target(r),
    issued_at: r.issued_at,
    expires_at: r.expires_at,
    revoked_at: r.revoked_at,
    max_redemptions: r.max_redemptions,
    redeemed_count: r.redeemed_count,
    revision: r.revision
  };
}
var active = (r, now) => r.revoked_at === null && now < r.expires_at;
function recordEvent(db, r, a, event, now, before, affected, correlation) {
  db.prepare("INSERT INTO invitation_audit VALUES(?,?,?,?,?,?,?,?)").run(r.id, r.revision, a.userId, event, now, before, r.expires_at, affected.length);
  const eventId = randomUUID18(), payload = JSON.stringify({
    target: target(r),
    prior_expires_at: before,
    expires_at: r.expires_at,
    revoked_at: r.revoked_at,
    affected_redemption_ids: affected.toSorted()
  });
  db.prepare(`INSERT INTO domain_events(event_id,aggregate_type,aggregate_id,aggregate_revision,actor_id,event_type,
    payload_schema_version,payload,occurred_at,correlation_id) VALUES(?,'invitation',?,?,?, ?,1,?,?,?)`).run(eventId, r.id, r.revision, a.userId, "knowledgeos.invitation." + event, payload, now, correlation);
  db.prepare("INSERT INTO domain_event_outbox (event_id,created_at) VALUES(?,?)").run(eventId, now);
}
var InvitationStore = class {
  constructor(tx, current, principal, canIssue, isMember) {
    this.tx = tx;
    this.current = current;
    this.principal = principal;
    this.canIssue = canIssue;
    this.isMember = isMember;
  }
  actor(prior, now, expected) {
    const a = this.current(prior, now);
    if (!a) throw new AssetError(401, "AUTH_REQUIRED");
    if (a.userId !== expected) throw new AssetError(409, "ACTOR_CHANGED");
    return a;
  }
  issueTarget(a, t, now) {
    const scope = this.canIssue(a, t, now);
    if (!scope) throw unavailable2();
    return scope;
  }
  managed(db, a, id, now) {
    const r = db.prepare("SELECT * FROM invitations WHERE service_id=? AND id=?").get(a.serviceId, id);
    if (!r) throw unavailable2();
    return { r, title: this.issueTarget(a, target(r), now).title };
  }
  issueSpec(a, s, now) {
    const { scope, id, permission } = s, t = { scope, id, permission };
    const info = this.issueTarget(a, t, now), expires_at = new Date(Date.parse(now) + duration(s.days)).toISOString();
    return { target: t, title: info.title, expires_at, max_redemptions: cap(s.max_redemptions), server_time: now };
  }
  preview(prior, expected, s) {
    return this.tx("read", (_db, now) => {
      return this.issueSpec(this.actor(prior, now, expected), s, now);
    });
  }
  create(prior, expected, s, key, correlation = randomUUID18()) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now, expected), p = this.issueSpec(a, s, now);
      const req = digest2(JSON.stringify([p.target, s.days ?? 7, p.max_redemptions]));
      const old = db.prepare("SELECT * FROM invitations WHERE service_id=? AND issuer_id=? AND request_key=?").get(a.serviceId, a.userId, key);
      if (old) {
        if (old.request_digest !== req) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { ...receipt2(old), title: p.title, server_time: now, replayed: true };
      }
      const token2 = randomBytes(32).toString("base64url");
      const r = {
        id: randomUUID18(),
        service_id: a.serviceId,
        issuer_id: a.userId,
        object_id: s.scope === "object" ? s.id : null,
        project_id: s.scope === "project" ? s.id : null,
        permission: s.permission,
        issued_at: now,
        expires_at: p.expires_at,
        revoked_at: null,
        max_redemptions: p.max_redemptions,
        redeemed_count: 0,
        revision: 1
      };
      db.prepare(`INSERT INTO invitations(id,token_hash,service_id,issuer_id,object_id,project_id,permission,issued_at,expires_at,max_redemptions,request_key,request_digest)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.id, digest2(token2), a.serviceId, a.userId, r.object_id, r.project_id, r.permission, now, r.expires_at, r.max_redemptions, key, req);
      recordEvent(db, r, a, "issue", now, null, [], correlation);
      return { ...receipt2(r), title: p.title, token: token2, server_time: now, replayed: false };
    });
  }
  redeem(prior, expected, token2, correlation = randomUUID18()) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now, expected);
      if (!/^[a-zA-Z0-9_-]{43}$/.test(token2)) throw unavailable2();
      const r = db.prepare("SELECT * FROM invitations WHERE service_id=? AND token_hash=?").get(a.serviceId, digest2(token2));
      if (!r || !active(r, now)) throw unavailable2();
      const t = target(r), issuer = this.principal(db, r.issuer_id, a.serviceId);
      if (!issuer || issuer.userId === a.userId) throw unavailable2();
      const info = this.issueTarget(issuer, t, now);
      if (t.scope === "object" && info.project_id && !this.isMember(a, info.project_id, now)) throw unavailable2();
      if (t.scope === "project" && db.prepare("SELECT 1 FROM project_membership_removals WHERE project_id=? AND user_id=? AND removed_at>=? LIMIT 1").get(t.id, a.userId, r.issued_at)) throw unavailable2();
      const priorRedemption = db.prepare("SELECT id,redeemed_at,expires_at,revoked_at FROM invitation_redemptions WHERE invitation_id=? AND user_id=?").get(r.id, a.userId);
      if (priorRedemption) {
        if (!active(priorRedemption, now)) throw unavailable2();
        return { id: priorRedemption.id, target: t, title: info.title, expires_at: priorRedemption.expires_at, server_time: now, replayed: true };
      }
      if (r.redeemed_count >= r.max_redemptions) throw new AssetError(409, "INVITATION_FULL");
      const grant = randomUUID18();
      db.prepare("INSERT INTO invitation_redemptions VALUES(?,?,?,?,?,NULL)").run(grant, r.id, a.userId, now, r.expires_at);
      const change = db.prepare("UPDATE invitations SET redeemed_count=redeemed_count+1,revision=revision+1 WHERE id=? AND revision=? AND redeemed_count<max_redemptions").run(r.id, r.revision);
      if (change.changes !== 1) throw conflict3();
      recordEvent(db, { ...r, revision: r.revision + 1 }, a, "redeem", now, null, [grant], correlation);
      return { id: grant, target: t, title: info.title, expires_at: r.expires_at, server_time: now, replayed: false };
    });
  }
  get(prior, expected, id) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now, expected), { r, title } = this.managed(db, a, id, now);
      const rows = db.prepare("SELECT id,user_id,expires_at FROM invitation_redemptions WHERE invitation_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY id").all(id, now);
      return { ...receipt2(r), title, active: active(r, now), affected: rows, server_time: now };
    });
  }
  list(prior) {
    return this.tx("read", (db, now) => {
      const a = this.actor(prior, now, prior.userId);
      const rows = db.prepare("SELECT * FROM invitations WHERE service_id=? AND issuer_id=? ORDER BY issued_at DESC,id DESC LIMIT 100").all(a.serviceId, a.userId);
      const items = rows.flatMap((r) => {
        const scope = this.canIssue(a, target(r), now);
        return scope ? [{ ...receipt2(r), title: scope.title, active: active(r, now) }] : [];
      });
      return { actor_id: a.userId, server_time: now, items };
    });
  }
  change(prior, expected, id, expectedRevision, event, days, key = randomUUID18(), correlation = randomUUID18()) {
    return this.tx("write", (db, now) => {
      const a = this.actor(prior, now, expected), { r } = this.managed(db, a, id, now);
      const extension = event === "renew" ? duration(days) : 0, req = digest2(JSON.stringify([id, expectedRevision, event, extension]));
      const priorReceipt = db.prepare("SELECT request_digest,result_json FROM invitation_change_receipts WHERE service_id=? AND actor_id=? AND request_key=?").get(a.serviceId, a.userId, key);
      if (priorReceipt) {
        if (priorReceipt.request_digest !== req) throw new AssetError(409, "IDEMPOTENCY_CONFLICT");
        return { ...JSON.parse(String(priorReceipt.result_json)), replayed: true };
      }
      if (!active(r, now)) throw unavailable2();
      if (expectedRevision !== r.revision) throw conflict3();
      const expires_at = event === "renew" ? new Date(Date.parse(r.expires_at) + extension).toISOString() : r.expires_at;
      const changed2 = (event === "renew" ? db.prepare("UPDATE invitation_redemptions SET expires_at=? WHERE invitation_id=? AND revoked_at IS NULL AND expires_at>? RETURNING id").all(expires_at, id, now) : db.prepare("UPDATE invitation_redemptions SET revoked_at=? WHERE invitation_id=? AND revoked_at IS NULL AND expires_at>? RETURNING id").all(now, id, now)).map((r2) => String(r2.id));
      const next = { ...r, expires_at, revoked_at: event === "revoke" ? now : null, revision: r.revision + 1 };
      db.prepare("UPDATE invitations SET expires_at=?,revoked_at=?,revision=? WHERE id=?").run(expires_at, next.revoked_at, next.revision, id);
      const result = { ...receipt2(next), affected_count: changed2.length, server_time: now };
      db.prepare("INSERT INTO invitation_change_receipts VALUES(?,?,?,?,?,?)").run(a.serviceId, a.userId, key, id, req, JSON.stringify(result));
      recordEvent(db, next, a, event, now, r.expires_at, changed2, correlation);
      return { ...result, replayed: false };
    });
  }
};

// src/host/storage.ts
var APPLICATION_ID = 1263489841;
var SCHEMA_VERSION = 38;
var MIGRATION_V38_CHECKSUM = createHash19("sha256").update(ONTOLOGY_SCHEMA).digest("hex");
var MIGRATION_V37_CHECKSUM = createHash19("sha256").update(KNOWLEDGE_SCHEMA).digest("hex");
var MIGRATION_V36_CHECKSUM = createHash19("sha256").update(TERM_SCHEMA).digest("hex");
var MIGRATION_V35_CHECKSUM = createHash19("sha256").update(REPOSITORY_GITEE_SCHEMA).digest("hex");
var MIGRATION_V34_CHECKSUM = createHash19("sha256").update(REPOSITORY_PLATFORM_SCHEMA).digest("hex");
var MIGRATION_V33_CHECKSUM = createHash19("sha256").update(PROJECT_TASK_APPEAL_SCHEMA).digest("hex");
var MIGRATION_V32_CHECKSUM = createHash19("sha256").update(PROJECT_TASK_CORRECTION_SCHEMA).digest("hex");
var MIGRATION_V31_CHECKSUM = createHash19("sha256").update(PROJECT_TASK_MATERIAL_SCHEMA).digest("hex");
var MIGRATION_V30_CHECKSUM = createHash19("sha256").update(PROJECT_TASK_REVIEW_SCHEMA).digest("hex");
var MIGRATION_V29_CHECKSUM = createHash19("sha256").update(PROJECT_TASK_SCHEMA).digest("hex");
var MIGRATION_V28_CHECKSUM = createHash19("sha256").update(REPOSITORY_SCHEMA).digest("hex");
var MIGRATION_V27_CHECKSUM = createHash19("sha256").update(NOTE_LAYOUT_SCHEMA).digest("hex");
var MIGRATION_V26_CHECKSUM = createHash19("sha256").update(NOTE_OUTLINE_SCHEMA).digest("hex");
var MIGRATION_V25_CHECKSUM = createHash19("sha256").update(INVITATION_CHANGE_SCHEMA).digest("hex");
var MIGRATION_V24_CHECKSUM = createHash19("sha256").update(INVITATION_EVENT_SCHEMA).digest("hex");
var MIGRATION_V23_CHECKSUM = createHash19("sha256").update(INVITATION_SCHEMA).digest("hex");
var MIGRATION_V22_CHECKSUM = createHash19("sha256").update(RECALL_SCHEMA).digest("hex");
var MIGRATION_V21_CHECKSUM = createHash19("sha256").update(NOTE_SCHEMA).digest("hex");
var MIGRATION_V20_CHECKSUM = createHash19("sha256").update(PDF_CHAPTER_SCHEMA).digest("hex");
var MIGRATION_V19_CHECKSUM = createHash19("sha256").update(WORD_SEARCH_SCHEMA).digest("hex");
var MIGRATION_V18_CHECKSUM = createHash19("sha256").update(SEARCH_SCHEMA).digest("hex");
var MIGRATION_V17_CHECKSUM = createHash19("sha256").update(ANNOTATION_SCHEMA).digest("hex");
var MIGRATION_V16_CHECKSUM = createHash19("sha256").update(READING_STATE_SCHEMA).digest("hex");
var MIGRATION_V15_CHECKSUM = createHash19("sha256").update(CITATION_LOCATOR_SCHEMA).digest("hex");
var MIGRATION_V13_CHECKSUM = createHash19("sha256").update(ZIP_SCHEMA).digest("hex");
var MIGRATION_V14_CHECKSUM = createHash19("sha256").update(CITATION_SCHEMA).digest("hex");
var MIGRATION_V12_CHECKSUM = createHash19("sha256").update(OFFICE_HISTORY_SCHEMA).digest("hex");
var MIGRATION_V11_CHECKSUM = createHash19("sha256").update(OFFICE_AUTH_SCHEMA).digest("hex");
var MIGRATION_V10_CHECKSUM = createHash19("sha256").update(OFFICE_SCHEMA).digest("hex");
var MIGRATION_V9_CHECKSUM = createHash19("sha256").update(TEXT_SCHEMA).digest("hex");
var MIGRATION_V8_CHECKSUM = createHash19("sha256").update(PARSE_SCHEMA).digest("hex");
var MIGRATION_V7_CHECKSUM = createHash19("sha256").update(ASSET_SCHEMA).digest("hex");
var MIGRATION_V6_CHECKSUM = createHash19("sha256").update(JOB_SCHEMA).digest("hex");
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
var MIGRATION_V1_CHECKSUM = createHash19("sha256").update(Buffer.from(MIGRATION_V1_SQL, "utf8")).digest("hex");
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
var MIGRATION_V2_CHECKSUM = createHash19("sha256").update(Buffer.from(MIGRATION_V2_SQL, "utf8")).digest("hex");
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
var MIGRATION_V3_CHECKSUM = createHash19("sha256").update(Buffer.from(MIGRATION_V3_SQL, "utf8")).digest("hex");
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
var MIGRATION_V4_CHECKSUM = createHash19("sha256").update(Buffer.from(MIGRATION_V4_SQL, "utf8")).digest("hex");
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
var MIGRATION_V5_CHECKSUM = createHash19("sha256").update(MIGRATION_V5_SQL).digest("hex");
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
  repositories = new RepositoryStore(this.#assetTx, (s, now) => this.#currentActor(s, now));
  projectTasks = new ProjectTaskStore(
    this.#assetTx,
    (s, now) => this.#currentActor(s, now),
    (db, id) => this.#memberships(db, id),
    (actor, id, project, now) => {
      const asset = this.authorizeObject(actor, id, "read", now);
      return asset?.objectType === "asset" && (asset.scope === "personal" || asset.projectId === project);
    },
    (db, actor, target2, now) => this.citations.validateTaskMaterial(db, actor, target2, now)
  );
  notes = new NoteStore(
    this.#assetTx,
    (s, now) => this.#currentActor(s, now),
    (a, id, now) => Boolean(this.authorizeObject(a, id, "read", now)),
    (a, p, now) => this.canCreateProjectObject(a, p, now),
    (a, p) => this.canManageProject(a, p)
  );
  search = new SearchStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (a, id, now) => Boolean(this.authorizeObject(a, id, "read", now)));
  wordSearch = new WordSearchIndex(this.#assetTx);
  archives = new ZipStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (a, id, now) => Boolean(this.authorizeObject(a, id, "read", now)));
  citations = new CitationStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (a, id, now) => Boolean(this.authorizeObject(a, id, "read", now)), (a, id, now) => {
    const source = this.authorizeObject(a, id, "read", now);
    return source && { ...source.projectId ? { project_id: source.projectId } : {}, canComment: Boolean(this.authorizeObject(a, id, "comment", now)) };
  }, (a, id, now) => {
    const object = this.#loadObject(id);
    return object && this.#authorizationHorizon(a, object, "read", now);
  });
  terms = new TermStore(this.#assetTx, (s, now) => this.#currentActor(s, now), this.citations);
  knowledge = new KnowledgeStore(this.#assetTx, (s, now) => this.#currentActor(s, now), this.citations, this.notes, this.terms);
  ontology = new OntologyStore(this.#assetTx, (s, now) => this.#currentActor(s, now), this.knowledge, this.citations);
  recall = new RecallStore(
    this.#assetTx,
    (s, now) => this.#currentActor(s, now),
    (a, id, now) => Boolean(this.authorizeObject(a, id, "read", now)),
    (db, a, t, now) => this.citations.recallSource(db, a, t, now)
  );
  invitations = new InvitationStore(this.#assetTx, (s, now) => this.#currentActor(s, now), (db, user, service) => {
    const row = db.prepare(`SELECT p.id FROM users u JOIN spaces p ON p.owner_user_id=u.id AND p.kind='personal'
      WHERE u.id=? AND u.planning_home_service_id=? AND u.status='active' AND p.status='active' AND p.service_id=?`).get(user, service, service);
    return row && { userId: user, serviceId: service, personalSpaceId: String(row.id) };
  }, (a, t, now) => this.#canIssue(a, t, now), (a, p, now) => this.canCreateProjectObject(a, p, now));
  office = new OfficeStore(this.#assetTx, (sessionId, userId, id, action, now) => {
    const actor = this.#currentActor({ sessionId, userId }, now);
    return !!actor && !!this.authorizeObject(actor, id, action, now);
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
    const actor = ref && this.findActor(String(ref.token_hash), now);
    return actor && this.authorizeObject(actor, object, "read", now)?.revision;
  }, (point3) => this.#injectFailure(point3));
  constructor(options) {
    this.#dataDir = options.dataDir;
    this.#log = options.log ?? (() => {
    });
    this.#migrationOverride = options.migrationOverride;
    this.#failureAt = options.failureAt;
    this.#open();
  }
  #injectFailure(point3) {
    if (this.#failureAt === point3) throw new Error(`controlled storage failure at ${point3}`);
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
      if (priorVersion < 14) this.#migrateV14(db);
      if (priorVersion < 15) this.#migrateV15(db);
      if (priorVersion < 16) this.#migrateV16(db);
      if (priorVersion < 17) this.#migrateV17(db);
      if (priorVersion < 18) this.#migrateV18(db);
      if (priorVersion < 19) this.#migrateV19(db);
      if (priorVersion < 20) this.#migrateV20(db);
      if (priorVersion < 21) this.#migrateV21(db);
      if (priorVersion < 22) this.#migrateV22(db);
      if (priorVersion < 23) this.#migrateV23(db);
      if (priorVersion < 24) this.#migrateV24(db);
      if (priorVersion < 25) this.#migrateV25(db);
      if (priorVersion < 26) this.#migrateV26(db);
      if (priorVersion < 27) this.#migrateV27(db);
      if (priorVersion < 28) this.#migrateV28(db);
      if (priorVersion < 29) this.#migrateV29(db);
      if (priorVersion < 30) this.#migrateV30(db);
      if (priorVersion < 31) this.#migrateV31(db);
      if (priorVersion < 32) this.#migrateV32(db);
      if (priorVersion < 33) this.#migrateV33(db);
      if (priorVersion < 34) this.#migrateV34(db);
      if (priorVersion < 35) this.#migrateV35(db);
      if (priorVersion < 36) this.#migrateV36(db);
      if (priorVersion < 37) this.#migrateV37(db);
      if (priorVersion < 38) this.#migrateV38(db);
      this.#verify(db, SCHEMA_VERSION);
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
    if (facts.userVersion >= 6 && facts.userVersion <= SCHEMA_VERSION && Number.isInteger(facts.userVersion)) {
      const db = new DatabaseSync(path, { readOnly: true });
      const version = facts.userVersion;
      try {
        this.#verify(db, version);
      } finally {
        db.close();
      }
      return `v${version}`;
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
      const normalize2 = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      const signature = (source, table) => {
        const columns2 = source.prepare(`PRAGMA table_info(${table})`).all().map((row) => ({ cid: Number(row.cid), name: String(row.name), type: String(row.type), notnull: Number(row.notnull), pk: Number(row.pk) }));
        const indexes = source.prepare(`PRAGMA index_list(${table})`).all().map((index) => ({
          unique: Number(index.unique),
          origin: String(index.origin),
          columns: source.prepare(`PRAGMA index_info(${JSON.stringify(String(index.name))})`).all().map((row) => ({ seqno: Number(row.seqno), name: row.name === null ? null : String(row.name) }))
        })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const foreignKeys = source.prepare(`PRAGMA foreign_key_list(${table})`).all().map((row) => ({ id: Number(row.id), seq: Number(row.seq), table: String(row.table), from: String(row.from), to: String(row.to), on_update: String(row.on_update), on_delete: String(row.on_delete), match: String(row.match) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const sql = source.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        return { columns: columns2, indexes, foreignKeys, sql: normalize2(sql) };
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
      const normalize2 = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      for (const table of ["knowledge_projects", "project_memberships", "knowledge_objects", "resource_grants"]) {
        const actualSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        const expectedSql = expected.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        if (normalize2(actualSql) !== normalize2(expectedSql)) throw new RecordsError("STORAGE_INCOMPATIBLE", `v3 table constraints are not accepted: ${table}`);
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
      const normalize2 = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      for (const table of ["knowledge_projects", "project_memberships", "knowledge_objects", "resource_grants"]) {
        const actualSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        const expectedSql = expected.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table)?.sql ?? "";
        if (normalize2(actualSql) !== normalize2(expectedSql)) throw new RecordsError("STORAGE_INCOMPATIBLE", `v4 table constraints are not accepted: ${table}`);
      }
      const actualIndex = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name = 'resource_grants_active_subject_action_uq'").get();
      const expectedIndex = expected.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name = 'resource_grants_active_subject_action_uq'").get();
      if (actualIndex?.name !== expectedIndex?.name || normalize2(actualIndex?.sql) !== normalize2(expectedIndex?.sql)) throw new RecordsError("STORAGE_INCOMPATIBLE", "v4 active grant uniqueness index is not accepted");
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
      db.prepare("INSERT INTO service_identity (id, service_id, bootstrap_admin_user_id, initialized_at) VALUES (1, ?, NULL, NULL)").run(randomUUID19());
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
  #migrateV14(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(CITATION_SCHEMA);
      this.#injectFailure("v14:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(14,?,?)").run(MIGRATION_V14_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=14; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "citation migration failed", false, { cause: e });
    }
  }
  #migrateV15(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(CITATION_LOCATOR_SCHEMA);
      this.#injectFailure("v15:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(15,?,?)").run(MIGRATION_V15_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=15; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "citation locator migration failed", false, { cause: e });
    }
  }
  #migrateV16(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(READING_STATE_SCHEMA);
      this.#injectFailure("v16:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(16,?,?)").run(MIGRATION_V16_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=16; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "reading state migration failed", false, { cause: e });
    }
  }
  #migrateV17(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(ANNOTATION_SCHEMA);
      this.#injectFailure("v17:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(17,?,?)").run(MIGRATION_V17_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=17; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "annotation migration failed", false, { cause: e });
    }
  }
  #migrateV18(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(SEARCH_SCHEMA);
      this.#injectFailure("v18:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(18,?,?)").run(MIGRATION_V18_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=18; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "search migration failed", false, { cause: e });
    }
  }
  #migrateV19(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(WORD_SEARCH_SCHEMA);
      this.#injectFailure("v19:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(19,?,?)").run(MIGRATION_V19_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=19; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "Word search migration failed", false, { cause: e });
    }
  }
  #migrateV20(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(PDF_CHAPTER_SCHEMA);
      this.#injectFailure("v20:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(20,?,?)").run(MIGRATION_V20_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=20; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "PDF chapter migration failed", false, { cause: e });
    }
  }
  #migrateV21(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(NOTE_SCHEMA);
      this.#injectFailure("v21:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(21,?,?)").run(MIGRATION_V21_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=21; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "independent note migration failed", false, { cause: e });
    }
  }
  #migrateV22(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(RECALL_SCHEMA);
      this.#injectFailure("v22:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(22,?,?)").run(MIGRATION_V22_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=22; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "recall migration failed", false, { cause: e });
    }
  }
  #migrateV23(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(INVITATION_SCHEMA);
      this.#injectFailure("v23:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(23,?,?)").run(MIGRATION_V23_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=23; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "invitation migration failed", false, { cause: e });
    }
  }
  #migrateV24(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(INVITATION_EVENT_SCHEMA);
      this.#injectFailure("v24:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(24,?,?)").run(MIGRATION_V24_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=24; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "invitation event migration failed", false, { cause: e });
    }
  }
  #migrateV25(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(INVITATION_CHANGE_SCHEMA);
      this.#injectFailure("v25:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(25,?,?)").run(MIGRATION_V25_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=25; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "invitation receipt migration failed", false, { cause: e });
    }
  }
  #migrateV26(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(NOTE_OUTLINE_SCHEMA);
      this.#injectFailure("v26:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(26,?,?)").run(MIGRATION_V26_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=26; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "note outline migration failed", false, { cause: e });
    }
  }
  #migrateV27(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(NOTE_LAYOUT_SCHEMA);
      this.#injectFailure("v27:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(27,?,?)").run(MIGRATION_V27_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=27; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "note map layout migration failed", false, { cause: e });
    }
  }
  #migrateV28(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(REPOSITORY_SCHEMA);
      this.#injectFailure("v28:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(28,?,?)").run(MIGRATION_V28_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=28; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "repository migration failed", false, { cause: e });
    }
  }
  #migrateV29(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(PROJECT_TASK_SCHEMA);
      this.#injectFailure("v29:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(29,?,?)").run(MIGRATION_V29_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=29; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "project task migration failed", false, { cause: e });
    }
  }
  #migrateV30(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(PROJECT_TASK_REVIEW_SCHEMA);
      this.#injectFailure("v30:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(30,?,?)").run(MIGRATION_V30_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=30; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "project task review migration failed", false, { cause: e });
    }
  }
  #migrateV31(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(PROJECT_TASK_MATERIAL_SCHEMA);
      this.#injectFailure("v31:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(31,?,?)").run(MIGRATION_V31_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=31; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "task material migration failed", false, { cause: e });
    }
  }
  #migrateV32(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(PROJECT_TASK_CORRECTION_SCHEMA);
      this.#injectFailure("v32:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(32,?,?)").run(MIGRATION_V32_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=32; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "task correction migration failed", false, { cause: e });
    }
  }
  #migrateV33(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(PROJECT_TASK_APPEAL_SCHEMA);
      this.#injectFailure("v33:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(33,?,?)").run(MIGRATION_V33_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=33; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "task appeal migration failed", false, { cause: e });
    }
  }
  #migrateV34(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(REPOSITORY_PLATFORM_SCHEMA);
      this.#injectFailure("v34:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(34,?,?)").run(MIGRATION_V34_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=34; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "repository platform migration failed", false, { cause: e });
    }
  }
  #migrateV35(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(REPOSITORY_GITEE_SCHEMA);
      this.#injectFailure("v35:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(35,?,?)").run(MIGRATION_V35_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=35; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "Gitee repository migration failed", false, { cause: e });
    }
  }
  #migrateV36(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(TERM_SCHEMA);
      this.#injectFailure("v36:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(36,?,?)").run(MIGRATION_V36_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=36; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "personal terms migration failed", false, { cause: e });
    }
  }
  #migrateV37(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(KNOWLEDGE_SCHEMA);
      this.#injectFailure("v37:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(37,?,?)").run(MIGRATION_V37_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=37; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "knowledge item migration failed", false, { cause: e });
    }
  }
  #migrateV38(db) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(ONTOLOGY_SCHEMA);
      this.#injectFailure("v38:after-schema");
      db.prepare("INSERT INTO schema_migrations VALUES(38,?,?)").run(MIGRATION_V38_CHECKSUM, (/* @__PURE__ */ new Date()).toISOString());
      db.exec("PRAGMA user_version=38; COMMIT");
    } catch (e) {
      if (!this.#rollback(db)) throw this.#failure;
      throw new RecordsError("STORAGE_INCOMPATIBLE", "ontology migration failed", false, { cause: e });
    }
  }
  #verify(db, version) {
    const facts = readDatabaseFacts(this.databasePath);
    const checks = [MIGRATION_V6_CHECKSUM, MIGRATION_V7_CHECKSUM, MIGRATION_V8_CHECKSUM, MIGRATION_V9_CHECKSUM, MIGRATION_V10_CHECKSUM, MIGRATION_V11_CHECKSUM, MIGRATION_V12_CHECKSUM, MIGRATION_V13_CHECKSUM, MIGRATION_V14_CHECKSUM, MIGRATION_V15_CHECKSUM, MIGRATION_V16_CHECKSUM, MIGRATION_V17_CHECKSUM, MIGRATION_V18_CHECKSUM, MIGRATION_V19_CHECKSUM, MIGRATION_V20_CHECKSUM, MIGRATION_V21_CHECKSUM, MIGRATION_V22_CHECKSUM, MIGRATION_V23_CHECKSUM, MIGRATION_V24_CHECKSUM, MIGRATION_V25_CHECKSUM, MIGRATION_V26_CHECKSUM, MIGRATION_V27_CHECKSUM, MIGRATION_V28_CHECKSUM, MIGRATION_V29_CHECKSUM, MIGRATION_V30_CHECKSUM, MIGRATION_V31_CHECKSUM, MIGRATION_V32_CHECKSUM, MIGRATION_V33_CHECKSUM, MIGRATION_V34_CHECKSUM, MIGRATION_V35_CHECKSUM, MIGRATION_V36_CHECKSUM, MIGRATION_V37_CHECKSUM, MIGRATION_V38_CHECKSUM].slice(0, version - 5);
    if (facts.applicationId !== APPLICATION_ID || facts.userVersion !== version || facts.ledger.length !== version || checks.some((hash4, i) => facts.ledger[i + 5]?.version !== i + 6 || facts.ledger[i + 5]?.checksum !== hash4)) throw new RecordsError("STORAGE_INCOMPATIBLE", "database ownership/version verification failed");
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
      if (version >= 14) reference.exec(CITATION_SCHEMA);
      if (version >= 15) reference.exec(CITATION_LOCATOR_SCHEMA);
      if (version >= 16) reference.exec(READING_STATE_SCHEMA);
      if (version >= 17) reference.exec(ANNOTATION_SCHEMA);
      if (version >= 18) reference.exec(SEARCH_SCHEMA);
      if (version >= 19) reference.exec(WORD_SEARCH_SCHEMA);
      if (version >= 20) reference.exec(PDF_CHAPTER_SCHEMA);
      if (version >= 21) reference.exec(NOTE_SCHEMA);
      if (version >= 22) reference.exec(RECALL_SCHEMA);
      if (version >= 23) reference.exec(INVITATION_SCHEMA);
      if (version >= 24) reference.exec(INVITATION_EVENT_SCHEMA);
      if (version >= 25) reference.exec(INVITATION_CHANGE_SCHEMA);
      if (version >= 26) reference.exec(NOTE_OUTLINE_SCHEMA);
      if (version >= 27) reference.exec(NOTE_LAYOUT_SCHEMA);
      if (version >= 35) reference.exec(REPOSITORY_GITEE_TABLES);
      else if (version >= 34) reference.exec(REPOSITORY_PLATFORM_TABLES);
      else if (version >= 28) reference.exec(REPOSITORY_SCHEMA);
      if (version >= 29) reference.exec(PROJECT_TASK_SCHEMA);
      if (version >= 30) reference.exec(PROJECT_TASK_REVIEW_SCHEMA);
      if (version >= 31) reference.exec(PROJECT_TASK_MATERIAL_SCHEMA);
      if (version >= 32) reference.exec(PROJECT_TASK_CORRECTION_SCHEMA);
      if (version >= 33) reference.exec(PROJECT_TASK_APPEAL_SCHEMA);
      if (version >= 36) reference.exec(TERM_SCHEMA);
      if (version >= 37) reference.exec(KNOWLEDGE_SCHEMA);
      if (version >= 38) reference.exec(ONTOLOGY_SCHEMA);
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
      const userId = randomUUID19();
      const spaceId = randomUUID19();
      const credentialId = randomUUID19();
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
      const userId = randomUUID19();
      const spaceId = randomUUID19();
      const credentialId = randomUUID19();
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
    return db.prepare(`SELECT project_id,user_id,role,valid_from,expires_at,revoked_at FROM project_memberships WHERE project_id=?
      UNION ALL SELECT i.project_id,r.user_id,'member',r.redeemed_at,r.expires_at,r.revoked_at
      FROM invitations i JOIN invitation_redemptions r ON r.invitation_id=i.id
      JOIN knowledge_projects p ON p.id=i.project_id AND p.service_id=i.service_id AND p.status='active'
      WHERE i.project_id=? AND i.permission='member' AND i.revoked_at IS NULL AND r.expires_at=i.expires_at`).all(projectId, projectId).map((row) => ({ projectId: String(row.project_id), userId: String(row.user_id), role: String(row.role), validFrom: String(row.valid_from), expiresAt: row.expires_at == null ? void 0 : String(row.expires_at), revokedAt: row.revoked_at == null ? void 0 : String(row.revoked_at) }));
  }
  #invitedActions(db, actor, object, action, now) {
    if (action !== "read" && action !== "edit" || object.objectType !== "asset") return [];
    return db.prepare(`SELECT r.redeemed_at,r.expires_at FROM invitations i JOIN invitation_redemptions r ON r.invitation_id=i.id
      WHERE i.object_id=? AND i.service_id=? AND r.user_id=? AND r.revoked_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at=r.expires_at AND r.expires_at>? AND (i.permission='edit' OR i.permission=?)`).all(object.id, actor.serviceId, actor.userId, now, action).map((r) => ({ subjectType: "user", subjectId: actor.userId, action, validFrom: String(r.redeemed_at), expiresAt: String(r.expires_at) }));
  }
  #canIssue(actor, t, now) {
    if (t.scope === "project") {
      if (t.permission !== "member" || !this.canManageProject(actor, t.id)) return;
      const row = this.#ensureReady().prepare("SELECT name FROM knowledge_projects WHERE id=?").get(t.id);
      return row && { title: String(row.name) };
    }
    if (t.permission !== "read" && t.permission !== "edit") return;
    const object = this.authorizeObject(actor, t.id, "manage_share", now);
    if (object?.objectType !== "asset" || !this.authorizeObject(actor, t.id, "read", now) || t.permission === "edit" && !this.authorizeObject(actor, t.id, "edit", now)) return;
    return { title: object.title, project_id: object.projectId };
  }
  #loadObject(id) {
    const row = this.#ensureReady().prepare("SELECT id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at FROM knowledge_objects WHERE id = ?").get(id);
    return row === void 0 ? void 0 : this.#objectRow(row);
  }
  #authorizationHorizon(actor, object, action, now) {
    const db = this.#ensureReady();
    return authorizationHorizon(
      actor,
      this.#objectTarget(object),
      action,
      now,
      this.#grants(db, object.id),
      object.projectId === void 0 ? [] : this.#memberships(db, object.projectId),
      this.#invitedActions(db, actor, object, action, now)
    );
  }
  authorizeObject(actor, objectId, action, now) {
    const object = this.#loadObject(objectId);
    return object && this.#authorizationHorizon(actor, object, action, now) !== void 0 ? object : void 0;
  }
  listObjects(actor, action, now) {
    const db = this.#ensureReady();
    const rows = db.prepare("SELECT id, service_id, space_id, scope_kind, project_id, owner_user_id, object_type, title, body, status, revision, created_at, updated_at FROM knowledge_objects WHERE service_id = ? AND status = 'active' ORDER BY created_at, id").all(actor.serviceId);
    return rows.map((row) => this.#objectRow(row)).filter((object) => authorize(actor, this.#objectTarget(object), action, now, this.#grants(db, object.id), object.projectId === void 0 ? [] : this.#memberships(db, object.projectId), this.#invitedActions(db, actor, object, action, now)));
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
  ownedProjects(actor) {
    return this.#ensureReady().prepare("SELECT id,name AS title FROM knowledge_projects WHERE service_id=? AND owner_user_id=? AND status='active' ORDER BY created_at DESC,id LIMIT 200").all(actor.serviceId, actor.userId);
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
        for (const action of ["read", "comment", "edit", "export", "manage_share", "delete", "review", "view_learning_records"]) db.prepare("INSERT INTO resource_grants (id, service_id, resource_type, resource_id, subject_type, subject_id, action, valid_from, created_at) VALUES (?, ?, 'knowledge_object', ?, 'user', ?, ?, ?, ?)").run(randomUUID19(), input.serviceId, input.id, input.ownerUserId, action, input.now, input.now);
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
  updateObject(prior, objectId, expectedRevision, patch) {
    try {
      return this.#assetTx("write", (db, now) => {
        const actor = this.#currentActor(prior, now);
        if (!actor) return { kind: "session_expired" };
        const current = this.authorizeObject(actor, objectId, "edit", now);
        if (!current) return { kind: "not_found" };
        if (current.revision !== expectedRevision) return { kind: "conflict", currentRevision: current.revision };
        const updated = db.prepare(`UPDATE knowledge_objects SET title=?,body=?,revision=revision+1,updated_at=?
          WHERE id=? AND revision=? AND status='active' RETURNING *`).get(patch.title ?? current.title, patch.body ?? current.body, now, objectId, expectedRevision);
        if (!updated) throw new RecordsError("STORAGE_UNAVAILABLE", "locked object update did not write a row");
        return { kind: "updated", object: this.#objectRow(updated) };
      });
    } catch (e) {
      throw this.#mapError(e);
    }
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
      const receipt3 = db.prepare("SELECT request_digest, result_json FROM ai_tool_mutations WHERE service_id = ? AND user_id = ? AND idempotency_key = ?").get(actor.serviceId, actor.userId, input.key);
      if (receipt3 !== void 0) return finish(receipt3.request_digest === input.digest ? { kind: "replayed", object: JSON.parse(receipt3.result_json) } : { kind: "idempotency_conflict" });
      if (current.revision !== input.expectedRevision) return finish({ kind: "conflict" });
      const changed2 = db.prepare("UPDATE knowledge_objects SET title = ?, body = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = 'active'").run(input.title ?? current.title, input.body ?? current.body, now, input.objectId, input.expectedRevision);
      if (Number(changed2.changes) !== 1) return finish({ kind: "conflict" });
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
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.firstId, input.firstKey, createHash19("sha256").update(input.content).digest("hex"), input.content, (/* @__PURE__ */ new Date()).toISOString());
      db.prepare("INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)").run(input.firstId, input.failingKey, createHash19("sha256").update(input.content).digest("hex"), input.content, (/* @__PURE__ */ new Date()).toISOString());
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
import { createHash as createHash20, randomBytes as randomBytes2, randomUUID as randomUUID20, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
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
function tokenHash(token2) {
  return createHash20("sha256").update(token2, "utf8").digest("hex");
}
function makeToken() {
  return randomBytes2(32).toString("base64url");
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
  const salt = randomBytes2(KDF_CONFIG.saltBytes);
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
    const token2 = makeToken();
    const createdAt = /* @__PURE__ */ new Date();
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString();
    this.#store.createSession({ sessionId: randomUUID20(), userId: lookup.userId, tokenHash: tokenHash(token2), createdAt: createdAt.toISOString(), expiresAt, revokeTokenHash: input.oldToken ? tokenHash(input.oldToken) : void 0 });
    const user = this.#store.getProfile(lookup.userId);
    if (user === void 0) throw new IdentityError("STORAGE_UNAVAILABLE", "user profile unavailable");
    return { user, token: token2, expiresAt };
  }
  actor(token2, now = (/* @__PURE__ */ new Date()).toISOString()) {
    return token2 === void 0 ? void 0 : this.#store.findActor(tokenHash(token2), now);
  }
  profile(userId) {
    return this.#store.getProfile(userId);
  }
  spaces(userId) {
    return this.#store.getSpaces(userId);
  }
  logout(token2) {
    if (token2 !== void 0) this.#store.revokeSession(tokenHash(token2), (/* @__PURE__ */ new Date()).toISOString());
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
import { createHash as createHash21, randomUUID as randomUUID21 } from "node:crypto";
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
