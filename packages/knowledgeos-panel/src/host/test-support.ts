/**
 * Test-only exports for the FND-002 storage adapter.
 *
 * Nothing here is registered on a Web route. Tests import this file directly
 * from `lib/test-support.js` to run the real migration/transaction code against
 * the same SQLite adapter, including controlled failures.
 */
export {
  APPLICATION_ID,
  BUSY_TIMEOUT_MS,
  DATABASE_FILENAME,
  MIGRATION_V1,
  MIGRATION_V1_CHECKSUM,
  MIGRATION_V1_SQL,
  MIGRATION_V2,
  MIGRATION_V2_CHECKSUM,
  MIGRATION_V2_SQL,
  MIGRATION_V3,
  MIGRATION_V3_CHECKSUM,
  MIGRATION_V3_SQL,
  PROBE_SCHEMA_VERSION,
  PROBE_SUPPORTED_TABLES,
  ProbeStorage,
  readDatabaseFacts,
  type DatabaseFacts,
  type MigrationPlan,
  type ProbeStorageOptions,
} from './storage.ts'
export { AUTH_ACTIONS, authorize, isGrantActive, type AuthorizationAction, type AuthorizationTarget, type AuthorizationGrant, type ProjectMembership } from './authorization.ts'
export { type GrantRecord, type KnowledgeObjectRecord, type ProjectRecord } from './storage.ts'
export {
  contentDigest,
  createProbeRecord,
  getProbeRecord,
  RecordsError,
  type CreateOutcome,
  type CreateRecordResult,
  type ProbeRecord,
  type ProbeStorePort,
} from './records.ts'
export { MIGRATION_V1 as PRODUCTION_MIGRATION } from './storage.ts'
export {
  AuthRateLimiter,
  IdentityError,
  IdentityService,
  KdfScheduler,
  derivePassword,
  tokenHash,
  validateDomains,
  validateLearningTracks,
  validateLoginName,
  validatePassword,
  type CredentialMaterial,
  type IdentityStore,
  type PreferencePatch,
  type ProfileRecord,
  type SessionActor,
  type SetupState,
  type SpaceRecord,
  type UserCreateInput,
  type UserRecord,
} from './identity.ts'
export { isIdentityRuntimeAvailable, isLoopbackAddress } from './identity-http.ts'
