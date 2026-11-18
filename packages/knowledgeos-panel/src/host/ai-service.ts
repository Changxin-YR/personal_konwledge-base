/** Bounded one-shot planning. Fixed DSH owns provider and tool execution. */
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { SessionActor } from './identity.ts'
import { AiError, TOOL_NAMES, TOOL_SCHEMAS, aiText, onlyKeys, runBusinessTool, toolArguments, toolDigest, type AiStore, type ToolCall, type ToolResult } from './ai-tools.ts'
import { RecordsError } from './records.ts'

/** Structural subset verified against the pinned dsh-llm and dsh-tools APIs. */
export interface LlmPort {
  listProviders(): Array<{ id: string; name?: string }>
  listModels(provider: string): Promise<readonly { id: string; name?: string }[]>
  stream(options: { provider: string; model: string; system: string; messages: Array<{ role: 'user'; content: Array<{ type: 'text'; text: string }> }>; tools: typeof TOOL_SCHEMAS; maxTokens: number; signal: AbortSignal }): AsyncIterable<{ type: string; block?: { type: string; id?: string; name?: string; arguments?: string }; usage?: unknown; reason?: { kind: string; failure?: { code?: string; status?: number; message?: string } } }>
}
export interface ToolsPort {
  register(definition: typeof TOOL_SCHEMAS[number] & { output: { schema: { type: 'object' }; render(args: unknown, value: unknown): Array<{ type: 'text'; text: string }> }; execute(args: unknown, exec: { callId: string; name: string; signal: AbortSignal }): Promise<unknown> }): () => void
  execute(input: { calls: Array<{ type: 'tool-call'; id: string; name: string; arguments: string }>; signal: AbortSignal; maxParallelToolCalls: number }): Promise<{ results: readonly { callId: string; result: { content: Array<{ type: string; text?: string }>; isError: boolean; error?: { info?: { code?: string } } } }[] }>
}
export interface AiConfig { provider?: string; model?: string; maxCalls?: number; timeoutMs?: number; budgetUsd?: number; inputUsdPerMillion?: number; outputUsdPerMillion?: number }
interface Prepared { id: string; requestId: string; actor: SessionActor; key: string; call: ToolCall; expiresAt: number; state: 'prepared' | 'executing' | 'succeeded' | 'failed'; result?: ToolResult; execution?: AbortController; committed?: boolean }
interface ExecutionContext { actor: SessionActor; actorNow(): SessionActor | undefined; key: string; call: ToolCall; onResult(result: ToolResult): void }
const SYSTEM = 'Choose exactly one provided KnowledgeOS tool for the user instruction. Use only the specified target object and revision. Do not invent identities, permissions, SQL, paths or commands. Reading uses knowledgeos_read_object. Updating title/body uses knowledgeos_update_object. Do not claim success; the server will execute the tool. Return one tool call.'
function modelFailure(error: unknown): AiError {
  if (error instanceof AiError) return error
  const e = error as { code?: string; status?: number; message?: string; failure?: { code?: string; status?: number; message?: string } }
  const f = e?.failure ?? e ?? {}, code = String(f.code ?? ''), message = String(f.message ?? '').toLowerCase()
  if (['MISSING_CREDENTIAL', 'NO_CREDENTIAL_STORE'].includes(code)) return new AiError(503, 'CREDENTIALS_MISSING')
  if (/QUOTA|BALANCE/.test(code) || f.status === 402) return new AiError(429, 'QUOTA_EXHAUSTED')
  if (f.status === 403 || /PERMISSION/.test(code)) return new AiError(403, 'PROVIDER_PERMISSION_DENIED')
  if (f.status === 401 || /AUTH|CREDENTIAL|API_KEY/.test(code)) return new AiError(502, 'CREDENTIALS_INVALID')
  if (f.status === 404 || /MODEL_NOT_FOUND|UNKNOWN_MODEL|MODEL_UNSUPPORTED/.test(code)) return new AiError(404, 'MODEL_NOT_FOUND')
  if (/NO_ADAPTER/.test(code)) return new AiError(503, 'MODEL_NOT_CONFIGURED')
  if (/TIMEOUT/.test(code)) return new AiError(504, 'MODEL_TIMEOUT')
  if (/ABORT/.test(code)) return new AiError(409, 'CANCELLED')
  if (f.status === 429 || /RATE_LIMIT/.test(code)) return new AiError(429, message.includes('insufficient_quota') ? 'QUOTA_EXHAUSTED' : 'PROVIDER_RATE_LIMITED')
  if (!code && /missing|not configured|no api key|credential.*required/.test(message) && /key|credential|auth/.test(message)) return new AiError(503, 'CREDENTIALS_MISSING')
  return new AiError(502, 'MODEL_FAILED')
}
export { modelFailure }

export class AiService {
  readonly #scope = new AsyncLocalStorage<ExecutionContext>()
  readonly #prepared = new Map<string, Prepared>()
  readonly #pending = new Map<string, { actor: SessionActor; controller: AbortController }>()
  #calls = 0
  #reservedUsd = 0
  #closed = false
  readonly #dispose: Array<() => void> = []
  constructor(readonly store: AiStore, readonly config: AiConfig, readonly llm?: LlmPort, readonly tools?: ToolsPort) {
    for (const [value, min, max, integer] of [[config.maxCalls ?? 8, 1, 64, true], [config.timeoutMs ?? 30000, 100, 60000, true], [config.budgetUsd ?? .10, .001, 1, false]] as const) {
      if (!Number.isFinite(value) || value < min || value > max || integer && !Number.isSafeInteger(value)) throw new AiError(503, 'AI_CONFIG_INVALID')
    }
    if (tools !== undefined) for (const schema of TOOL_SCHEMAS) this.#dispose.push(tools.register({
      ...schema, output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async (args, exec) => {
        const bound = this.#scope.getStore()
        if (!bound || bound.call.id !== exec.callId || bound.call.name !== exec.name) return { ok: false, status: 403, code: 'TOOL_CONTEXT_REQUIRED' }
        try {
          if (exec.signal.aborted) throw new AiError(409, 'CANCELLED')
          const current = bound.actorNow()
          if (!current || current.sessionId !== bound.actor.sessionId || current.userId !== bound.actor.userId || current.serviceId !== bound.actor.serviceId) throw new AiError(401, 'AUTH_REQUIRED')
          const call = { id: exec.callId, name: exec.name, arguments: JSON.stringify(args) }
          if (toolDigest(call.name, toolArguments(call)) !== toolDigest(bound.call.name, toolArguments(bound.call))) throw new AiError(403, 'TOOL_CONTEXT_REQUIRED')
          const result = runBusinessTool(this.store, current, call, bound.key, new Date().toISOString())
          bound.onResult(result)
          // The native executor accepts lossless JSON; omit optional undefined fields.
          return JSON.parse(JSON.stringify(result)) as ToolResult
        } catch (error: unknown) {
          if (error instanceof AiError || error instanceof RecordsError) return { ok: false, status: error instanceof AiError ? error.status : 503, code: error.code }
          throw error
        }
      },
    }))
  }
  status(): Record<string, unknown> {
    return { provider: this.config.provider ?? null, model: this.config.model ?? null, configured: Boolean(this.config.provider && this.config.model && this.llm && this.tools), max_calls: this.config.maxCalls ?? 8, attempts: this.#calls, max_output_tokens: 512, timeout_ms: this.config.timeoutMs ?? 30_000, budget_usd: this.config.budgetUsd ?? 0.10, reserved_usd: this.#reservedUsd, usage: 'reported_by_provider_when_available', state: this.#closed ? 'stopped' : 'ready' }
  }
  #sweep(): void { for (const [id, item] of this.#prepared) if (Date.now() >= item.expiresAt && item.state !== 'executing') this.#prepared.delete(id) }
  async prepare(actor: SessionActor, raw: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
    onlyKeys(raw, ['request_id', 'instruction', 'object_id', 'expected_revision', 'idempotency_key'])
    const instruction = aiText(raw.instruction, 2000), objectId = aiText(raw.object_id, 80), requestId = aiText(raw.request_id, 80), key = aiText(raw.idempotency_key, 128)
    if (!Number.isSafeInteger(raw.expected_revision) || Number(raw.expected_revision) < 1) throw new AiError(422, 'INPUT_INVALID')
    if (this.#closed || !this.llm || !this.tools || !this.config.provider || !this.config.model) throw new AiError(503, 'MODEL_NOT_CONFIGURED')
    if (signal.aborted) throw new AiError(409, 'CANCELLED')
    this.#sweep()
    if (this.#pending.has(requestId)) throw new AiError(409, 'REQUEST_CONFLICT')
    if (this.#pending.size >= 4 || this.#prepared.size >= 100 || [...this.#pending.values()].some(p => p.actor.userId === actor.userId)) throw new AiError(429, 'REQUEST_LIMIT')
    const controller = new AbortController()
    this.#pending.set(requestId, { actor, controller })
    const onAbort = (): void => controller.abort(new AiError(409, 'CANCELLED'))
    signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => controller.abort(new AiError(504, 'MODEL_TIMEOUT')), this.config.timeoutMs ?? 30_000)
    let usage: unknown
    try {
      const available = this.llm.listProviders().some(p => p.id === this.config.provider)
      if (!available) throw new AiError(503, 'MODEL_NOT_CONFIGURED')
      const catalog = await this.#abortable(this.llm.listModels(this.config.provider), controller.signal)
      // Pinned pi-ai hides its entire catalog when the named credential is missing.
      // An empty advisory catalog must reach exact-model/credential validation in stream.
      if (catalog.length > 0 && !catalog.some(m => m.id === this.config.model)) throw new AiError(404, 'MODEL_NOT_FOUND')
      const prices = [this.config.inputUsdPerMillion, this.config.outputUsdPerMillion]
      if (prices.some(p => p === undefined || !Number.isFinite(p) || p < 0)) throw new AiError(503, 'PRICE_BUDGET_NOT_CONFIGURED')
      const userText = JSON.stringify({ instruction, target_object_id: objectId, expected_revision: raw.expected_revision })
      const inputBound = Buffer.byteLength(JSON.stringify({ system: SYSTEM, messages: userText, tools: TOOL_SCHEMAS }), 'utf8') + 2048
      const reserve = (inputBound * prices[0]! + 512 * prices[1]!) / 1_000_000
      if (this.#calls >= (this.config.maxCalls ?? 8) || this.#reservedUsd + reserve > (this.config.budgetUsd ?? .10)) throw new AiError(429, 'MODEL_BUDGET_EXCEEDED')
      this.#calls++; this.#reservedUsd += reserve
      const calls: ToolCall[] = []
      let finish: string | undefined, outputBytes = 0
      const stream = this.llm.stream({ provider: this.config.provider, model: this.config.model, system: SYSTEM, messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }], tools: TOOL_SCHEMAS, maxTokens: 512, signal: controller.signal })[Symbol.asyncIterator]()
      try {
        while (true) {
          const next = await this.#abortable(stream.next(), controller.signal)
          if (next.done) break
          const chunk = next.value
          outputBytes += Buffer.byteLength(JSON.stringify(chunk), 'utf8')
          if (outputBytes > 96_000 || finish !== undefined) throw new AiError(502, 'MODEL_OUTPUT_INVALID')
          if (chunk.type === 'block-end' && chunk.block?.type === 'tool-call') {
            const b = chunk.block
            if (!b.id || !b.name || typeof b.arguments !== 'string') throw new AiError(502, 'MODEL_OUTPUT_INVALID')
            calls.push({ id: b.id, name: b.name, arguments: b.arguments })
          }
          if (chunk.type === 'usage') usage = chunk.usage
          if (chunk.type === 'finish') {
            finish = chunk.reason?.kind
            if (controller.signal.aborted) throw controller.signal.reason
            if (finish === 'error' || finish === 'aborted') throw modelFailure(chunk.reason?.failure)
          }
        }
      } finally { if (controller.signal.aborted) void stream.return?.().catch(() => {}) }
      if (controller.signal.aborted) throw controller.signal.reason
      if (finish !== 'tool-calls' || calls.length !== 1) throw new AiError(502, 'MODEL_OUTPUT_INVALID')
      const call = calls[0]!, args = toolArguments(call)
      if (args.object_id !== objectId || call.name === TOOL_NAMES[1] && args.expected_revision !== raw.expected_revision) throw new AiError(422, 'MODEL_TARGET_MISMATCH')
      const prepared: Prepared = { id: randomUUID(), requestId, actor, key, call, expiresAt: Date.now() + 120_000, state: 'prepared' }
      this.#prepared.set(prepared.id, prepared)
      return { ...this.#view(prepared), usage: usage ?? null }
    } catch (error: unknown) { throw controller.signal.aborted ? controller.signal.reason : modelFailure(error) }
    finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); this.#pending.delete(requestId) }
  }
  async #abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) throw signal.reason
    return await new Promise<T>((resolve, reject) => {
      const abort = (): void => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    })
  }
  #view(item: Prepared): Record<string, unknown> { return { prepared_id: item.id, request_id: item.requestId, provider: this.config.provider, model: this.config.model, state: item.state, tool: item.call.name, arguments: toolArguments(item.call), expires_at: new Date(item.expiresAt).toISOString() } }
  cancel(actor: SessionActor, requestId: string): void {
    const pending = this.#pending.get(requestId)
    if (pending && pending.actor.sessionId === actor.sessionId) pending.controller.abort(new AiError(409, 'CANCELLED'))
    for (const item of this.#prepared.values()) if (item.requestId === requestId && item.actor.sessionId === actor.sessionId) {
      if (item.state === 'executing') {
        if (item.committed) throw new AiError(409, 'OPERATION_ALREADY_COMPLETED')
        item.execution?.abort(new AiError(409, 'CANCELLED'))
      }
      if (item.state === 'succeeded') throw new AiError(409, 'OPERATION_ALREADY_COMPLETED')
      if (item.state === 'prepared') { item.state = 'failed'; item.result = { ok: false, status: 409, code: 'CANCELLED' } }
    }
  }
  async execute(actor: SessionActor, actorNow: () => SessionActor | undefined, id: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    this.#sweep()
    const item = this.#prepared.get(id)
    if (this.#closed || !item || item.actor.sessionId !== actor.sessionId || item.actor.userId !== actor.userId) throw new AiError(404, 'PREPARED_NOT_FOUND')
    if (signal.aborted) throw new AiError(409, 'CANCELLED')
    if (item.state === 'executing') throw new AiError(409, 'REQUEST_IN_PROGRESS')
    if (item.state === 'failed') throw new AiError(item.result?.status ?? 409, item.result?.code ?? 'REQUEST_FAILED')
    // Re-executing a completed write still enters the domain transaction and rechecks ACL.
    item.state = 'executing'
    const controller = new AbortController()
    item.execution = controller; item.committed = false
    const abort = (): void => controller.abort(new AiError(409, 'CANCELLED'))
    signal.addEventListener('abort', abort, { once: true })
    try {
      const batch = await this.#scope.run({ actor, actorNow, key: item.key, call: item.call, onResult: result => { if (result.ok && item.call.name === TOOL_NAMES[1]) item.committed = true } }, () => this.tools!.execute({ calls: [{ type: 'tool-call', ...item.call }], signal: controller.signal, maxParallelToolCalls: 1 }))
      const response = batch.results[0]
      if (controller.signal.aborted) throw new AiError(409, item.committed ? 'OPERATION_ALREADY_COMPLETED' : 'CANCELLED')
      if (batch.results.length !== 1 || response?.callId !== item.call.id) throw new AiError(502, 'TOOL_FAILED')
      if (response.result.isError) {
        const code = response.result.error?.info?.code ?? ''
        if (/ABORT|CANCEL/.test(code)) throw new AiError(409, item.committed ? 'OPERATION_ALREADY_COMPLETED' : 'CANCELLED')
        if (code === 'TOOL_TIMEOUT') throw new AiError(504, 'TOOL_TIMEOUT')
        if (['STORAGE_BUSY', 'STORAGE_UNAVAILABLE'].includes(code)) throw new AiError(503, code)
        throw new AiError(502, 'TOOL_FAILED')
      }
      const result = JSON.parse(response.result.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('')) as ToolResult
      if (typeof result.ok !== 'boolean' || !Number.isInteger(result.status) || typeof result.code !== 'string') throw new AiError(502, 'TOOL_FAILED')
      // Policies can await after the body. Revalidate before publishing protected output.
      const current = actorNow()
      if (!current || current.sessionId !== actor.sessionId || current.userId !== actor.userId || current.serviceId !== actor.serviceId) throw new AiError(401, 'AUTH_REQUIRED')
      if (result.ok && !this.store.authorizeObject(current, toolArguments(item.call).object_id, 'read', new Date().toISOString())) throw new AiError(404, 'NOT_FOUND')
      item.result = result; item.state = result.ok ? 'succeeded' : 'failed'
      if (!result.ok) throw new AiError(result.status, result.code)
      return { ...this.#view(item), result }
    } catch (error: unknown) { item.state = 'failed'; const safe = error instanceof AiError ? error : new AiError(502, 'TOOL_FAILED'); item.result = { ok: false, status: safe.status, code: safe.code }; throw safe }
    finally { signal.removeEventListener('abort', abort); delete item.execution }
  }
  close(): void { this.#closed = true; for (const { controller } of this.#pending.values()) controller.abort(new AiError(409, 'CANCELLED')); for (const item of this.#prepared.values()) item.execution?.abort(new AiError(409, 'CANCELLED')); this.#prepared.clear(); for (const dispose of this.#dispose) dispose() }
}
