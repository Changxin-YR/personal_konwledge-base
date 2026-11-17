/**
 * Read-only runtime-status query for the KnowledgeOS FND-001 panel.
 *
 * This module holds the query semantics only: it receives the Host facts an
 * adapter observed and returns the wire value. It imports no Cordis, web, or
 * filesystem API, so the same function can be exercised without a running Host.
 */

/** The upstream source revision this KnowledgeOS build was pinned to. */
export const EXPECTED_UPSTREAM_COMMIT = '39163dd30f703a79079e2d2446545cff3c453738'

/** Build identity the running DSH Host reports about itself. */
export interface HostRelease {
  /** DSH build version, for example `0.2.2-rc.3`. */
  readonly version?: string | undefined
  /** Source commit fixed into the running Host artifact, when its build recorded one. */
  readonly commit?: string | undefined
}

/** Inputs the Host adapter observed for one query. */
export interface StatusObservation {
  /** Release identity read from the running Host, or undefined when unavailable. */
  readonly release: HostRelease | undefined
  /** Opaque identifier of this plugin instance; a Host restart produces a new one. */
  readonly instanceId: string
  /** ISO timestamp recorded when this plugin instance started. */
  readonly startedAt: string
  /** ISO timestamp of this query. */
  readonly checkedAt: string
}

/** The JSON value `GET /knowledgeos/status` returns. */
export interface StatusPayload {
  /** Wire shape version of this response. */
  readonly schema_version: 1
  /** Product that owns the endpoint. */
  readonly product: 'KnowledgeOS'
  /** Commit the running Host build recorded, or `unknown` when it recorded none. */
  readonly upstream_commit: string
  /** Version of the running DSH build, or `unknown` when it reported none. */
  readonly upstream_version: string
  /** Commit this KnowledgeOS checkout pins. */
  readonly expected_upstream_commit: string
  /** Whether the running Host build matches the pin; null when its commit is unknown. */
  readonly upstream_commit_verified: boolean | null
  /** Opaque per-instance identifier; changes when the Host restarts. */
  readonly host_instance_id: string
  /** When this plugin instance started, ISO 8601. */
  readonly started_at: string
  /** When the Host answered this query, ISO 8601. */
  readonly checked_at: string
  /** Availability of this read-only status service, not of future modules. */
  readonly status: 'ok'
}

/**
 * Compare the running Host's recorded commit with the pin.
 * @param commit - commit the running build recorded, when any.
 * @param expected - commit this checkout pins.
 * @returns true for a match, false for a different commit, null when unknown.
 */
export function verifyUpstreamCommit(commit: string | undefined, expected = EXPECTED_UPSTREAM_COMMIT): boolean | null {
  if (commit === undefined || commit.length === 0) return null
  return commit === expected
}

/**
 * Build the status payload from observed Host facts.
 * @param observation - release identity, instance identity, and the two timestamps.
 * @returns the JSON wire value, with explicit `unknown` markers instead of guesses.
 */
export function buildStatusPayload(observation: StatusObservation): StatusPayload {
  const commit = observation.release?.commit
  const version = observation.release?.version
  return {
    schema_version: 1,
    product: 'KnowledgeOS',
    upstream_commit: commit === undefined || commit.length === 0 ? 'unknown' : commit,
    upstream_version: version === undefined || version.length === 0 ? 'unknown' : version,
    expected_upstream_commit: EXPECTED_UPSTREAM_COMMIT,
    upstream_commit_verified: verifyUpstreamCommit(commit),
    host_instance_id: observation.instanceId,
    started_at: observation.startedAt,
    checked_at: observation.checkedAt,
    status: 'ok',
  }
}
