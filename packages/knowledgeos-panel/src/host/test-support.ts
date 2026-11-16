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
  PROBE_SCHEMA_VERSION,
  PROBE_SUPPORTED_TABLES,
  ProbeStorage,
  readDatabaseFacts,
  type DatabaseFacts,
  type MigrationPlan,
  type ProbeStorageOptions,
} from './storage.ts'
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