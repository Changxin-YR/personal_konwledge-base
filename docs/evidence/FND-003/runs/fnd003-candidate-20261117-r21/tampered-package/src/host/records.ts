/**
 * Application use cases for the FND-002 storage probe.
 *
 * This module defines the inner storage port and the create/get behavior. It
 * imports no Cordis, HTTP, React, or SQLite API; the Host adapter supplies the
 * id/time functions and implements the port.
 */
import { createHash } from 'node:crypto'

/** One persisted synthetic record as the API returns it. */
export interface ProbeRecord {
  readonly id: string
  readonly content: string
  readonly created_at: string
}

/** Result of the storage-level create-or-replay operation. */
export type CreateOutcome =
  | { readonly kind: 'created'; readonly record: ProbeRecord }
  | { readonly kind: 'replayed'; readonly record: ProbeRecord }
  | { readonly kind: 'conflict' }

/** Inner storage port the application case depends on. */
export interface ProbeStorePort {
  /** Persist or replay one record keyed by the idempotency key and digest. */
  createOrReplay(input: {
    readonly id: string
    readonly idempotencyKey: string
    readonly digest: string
    readonly content: string
    readonly createdAt: string
  }): CreateOutcome
  /** Read one record by its server-generated id. */
  getById(id: string): ProbeRecord | undefined
}

/** Stable application errors crossing the Host boundary. */
export class RecordsError extends Error {
  /** Machine-readable code exposed in the API error body. */
  readonly code: 'STORAGE_UNAVAILABLE' | 'STORAGE_INCOMPATIBLE' | 'STORAGE_BUSY' | 'STORAGE_CLOSED' | 'INTERNAL_ERROR'
  /** Whether a client may retry the same request. */
  readonly retryable: boolean

  constructor(
    code: 'STORAGE_UNAVAILABLE' | 'STORAGE_INCOMPATIBLE' | 'STORAGE_BUSY' | 'STORAGE_CLOSED' | 'INTERNAL_ERROR',
    message: string,
    retryable = false,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'RecordsError'
    this.code = code
    this.retryable = retryable
  }
}

/** Dependencies supplied by the Host composition root. */
export interface RecordCaseDeps {
  /** Server-side id generator. */
  readonly newId: () => string
  /** Server-side UTC clock. */
  readonly now: () => string
}

/** Input accepted by the create use case after HTTP validation. */
export interface CreateRecordInput {
  readonly idempotencyKey: string
  readonly content: string
}

/** Successful create/replay result, or a conflicting replay. */
export type CreateRecordResult =
  | { readonly kind: 'created'; readonly record: ProbeRecord }
  | { readonly kind: 'replayed'; readonly record: ProbeRecord }
  | { readonly kind: 'conflict' }

/**
 * Compute the request digest over the content's original UTF-8 bytes.
 * @param content - validated content string.
 * @returns lowercase SHA-256 hex.
 */
export function contentDigest(content: string): string {
  return createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex')
}

/**
 * Create a record or replay the previously committed one.
 * @param port - inner storage port.
 * @param deps - server id and clock.
 * @param input - validated idempotency key and content.
 * @returns created/replayed record, or a conflict for a reused key with other content.
 */
export function createProbeRecord(port: ProbeStorePort, deps: RecordCaseDeps, input: CreateRecordInput): CreateRecordResult {
  return port.createOrReplay({
    id: deps.newId(),
    idempotencyKey: input.idempotencyKey,
    digest: contentDigest(input.content),
    content: input.content,
    createdAt: deps.now(),
  })
}

/**
 * Read one record.
 * @param port - inner storage port.
 * @param id - server-generated record id.
 * @returns the record, or undefined when it does not exist.
 */
export function getProbeRecord(port: ProbeStorePort, id: string): ProbeRecord | undefined {
  return port.getById(id)
}