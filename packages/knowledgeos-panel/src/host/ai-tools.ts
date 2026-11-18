/** Business tool contract; no DSH runtime, HTTP, React or database driver. */
import { createHash } from 'node:crypto'
import type { SessionActor } from './identity.ts'
import type { KnowledgeObjectRecord, ProbeStorage } from './storage.ts'

export class AiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); this.name = 'AiError' }
}
export interface ToolCall { readonly id: string; readonly name: string; readonly arguments: string }
export interface ToolInput { readonly object_id: string; readonly expected_revision?: number; readonly title?: string; readonly body?: string }
export interface ToolResult { readonly ok: boolean; readonly status: number; readonly code: string; readonly object?: KnowledgeObjectRecord; readonly replayed?: boolean }
export type AiStore = Pick<ProbeStorage, 'authorizeObject' | 'mutateObjectOnce'>
export const TOOL_NAMES = ['knowledgeos_read_object', 'knowledgeos_update_object'] as const
export const TOOL_SCHEMAS = [
  { name: TOOL_NAMES[0], description: 'Read the specified existing KnowledgeOS test object. Server enforces the logged-in user permissions.', parameters: { type: 'object', properties: { object_id: { type: 'string' } }, required: ['object_id'], additionalProperties: false } },
  { name: TOOL_NAMES[1], description: 'Update the specified existing KnowledgeOS test object at expected_revision. Supply title and/or body. Server enforces identity, permissions, revision and idempotency.', parameters: { type: 'object', properties: { object_id: { type: 'string' }, expected_revision: { type: 'integer', minimum: 1 }, title: { type: 'string', minLength: 1, maxLength: 200 }, body: { type: 'string', maxLength: 2000 } }, required: ['object_id', 'expected_revision'], additionalProperties: false } },
]
export function aiText(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || (!empty && value.length === 0) || value.length > max || !value.isWellFormed()) throw new AiError(422, 'INPUT_INVALID')
  return value
}
export function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new AiError(422, 'INPUT_INVALID')
}
export function toolArguments(call: ToolCall): ToolInput {
  if (!(TOOL_NAMES as readonly string[]).includes(call.name)) throw new AiError(422, 'TOOL_NOT_ALLOWED')
  if (call.arguments.length > 6000) throw new AiError(422, 'MODEL_OUTPUT_INVALID')
  let raw: unknown
  try { raw = JSON.parse(call.arguments) } catch { throw new AiError(422, 'MODEL_OUTPUT_INVALID') }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AiError(422, 'MODEL_OUTPUT_INVALID')
  const args = raw as Record<string, unknown>
  onlyKeys(args, call.name === TOOL_NAMES[0] ? ['object_id'] : ['object_id', 'expected_revision', 'title', 'body'])
  const object_id = aiText(args.object_id, 80)
  if (call.name === TOOL_NAMES[0]) return { object_id }
  if (!Number.isSafeInteger(args.expected_revision) || Number(args.expected_revision) < 1 || args.title === undefined && args.body === undefined) throw new AiError(422, 'MODEL_OUTPUT_INVALID')
  return { object_id, expected_revision: Number(args.expected_revision), ...(args.title === undefined ? {} : { title: aiText(args.title, 200) }), ...(args.body === undefined ? {} : { body: aiText(args.body, 2000, true) }) }
}
export function toolDigest(name: string, input: ToolInput): string {
  return createHash('sha256').update(JSON.stringify([name, input.object_id, input.expected_revision ?? null, input.title ?? null, input.body ?? null])).digest('hex')
}
export function runBusinessTool(store: AiStore, actor: SessionActor, call: ToolCall, key: string, now: string): ToolResult {
  const input = toolArguments(call)
  if (call.name === TOOL_NAMES[0]) {
    const object = store.authorizeObject(actor, input.object_id, 'read', now)
    return object === undefined ? { ok: false, status: 404, code: 'NOT_FOUND' } : { ok: true, status: 200, code: 'READ', object }
  }
  const result = store.mutateObjectOnce(actor, { objectId: input.object_id, expectedRevision: input.expected_revision!, title: input.title, body: input.body, key, digest: toolDigest(call.name, input) }, now)
  if (result.kind === 'updated' || result.kind === 'replayed') return { ok: true, status: 200, code: result.kind === 'updated' ? 'UPDATED' : 'REPLAYED', object: result.object, replayed: result.kind === 'replayed' }
  const errors = { not_found: [404, 'NOT_FOUND'], session_expired: [401, 'AUTH_REQUIRED'], conflict: [409, 'REVISION_CONFLICT'], idempotency_conflict: [409, 'IDEMPOTENCY_CONFLICT'] } as const
  const [status, code] = errors[result.kind]
  return { ok: false, status, code }
}
