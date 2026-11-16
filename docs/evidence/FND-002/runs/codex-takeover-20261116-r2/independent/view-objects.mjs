#!/usr/bin/env node
/**
 * FND-002 independent verifier — schema-object ownership hardening (new candidate).
 *
 * Verifies on the current candidate artifacts that a database whose only user
 * schema object is a VIEW (no tables), or a valid v1 database with an extra
 * VIEW, is refused instead of being treated as blank/owned. This is the P2
 * hardening added after d7a453d; the frozen d7a453d build could take over a
 * view-only database. Also confirms legitimate blank/valid databases still open.
 *
 * Usage (from the repository root):
 *   node docs/evidence/FND-002/runs/codex-takeover-20261116-r2/independent/view-objects.mjs
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('../../../../../..', import.meta.url)))
const RUN = join(REPO, 'docs', 'evidence', 'FND-002', 'runs', 'codex-takeover-20261116-r2')
const ROOT = join(REPO, '.cache', 'knowledgeos-fnd002-data', 'indep-viewobjects-codex-takeover-20261116-r2')
const { MIGRATION_V1_SQL, MIGRATION_V1_CHECKSUM, ProbeStorage, readDatabaseFacts } = await import(
  pathToFileURL(join(REPO, 'packages', 'knowledgeos-panel', 'lib', 'storage.js')).href
)

const APPLICATION_ID = 1263489841
const checks = []
let failures = 0
function check(name, ok, actual) {
  checks.push({ name, ok: Boolean(ok), actual })
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${actual === undefined ? '' : ` :: ${JSON.stringify(actual)}`}`)
}

function fresh(dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return join(dir, 'knowledgeos.sqlite')
}

function objectsOf(path) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    return {
      objects: db.prepare('SELECT type, name FROM sqlite_master ORDER BY type, name').all().filter(object => !object.name.startsWith('sqlite_')),
      applicationId: Number(db.prepare('PRAGMA application_id').get().application_id),
      userVersion: Number(db.prepare('PRAGMA user_version').get().user_version),
    }
  } finally { db.close() }
}

function makeValid(path) {
  const db = new DatabaseSync(path)
  try {
    db.exec(MIGRATION_V1_SQL)
    db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)')
      .run(1, MIGRATION_V1_CHECKSUM, new Date().toISOString())
    db.exec(`PRAGMA application_id = ${APPLICATION_ID}`)
    db.exec('PRAGMA user_version = 1')
  } finally { db.close() }
}

mkdirSync(ROOT, { recursive: true })

// A) View-only database (application_id=0, user_version=0, no user tables).
{
  const dir = join(ROOT, 'view-only')
  const path = fresh(dir)
  const db = new DatabaseSync(path)
  try { db.exec('CREATE VIEW foreign_view AS SELECT 1 AS value') } finally { db.close() }
  const before = objectsOf(path)
  const storage = new ProbeStorage({ dataDir: dir })
  check('view-only DB is refused (STORAGE_INCOMPATIBLE)', !storage.available && storage.failure?.code === 'STORAGE_INCOMPATIBLE', { available: storage.available, code: storage.failure?.code })
  const after = objectsOf(path)
  check('view-only DB is not migrated or rewritten', JSON.stringify(before) === JSON.stringify(after) && after.objects.length === 1 && after.applicationId === 0 && after.userVersion === 0, after)
  check('view-only DB still has no application tables', readDatabaseFacts(path).tables.length === 0, readDatabaseFacts(path).tables)
  storage.close()
}

// B) Valid v1 database plus an extra foreign VIEW.
{
  const dir = join(ROOT, 'valid-plus-view')
  const path = fresh(dir)
  makeValid(path)
  const db = new DatabaseSync(path)
  try { db.exec('CREATE VIEW foreign_view AS SELECT 1 AS value') } finally { db.close() }
  const before = objectsOf(path)
  const storage = new ProbeStorage({ dataDir: dir })
  check('valid v1 + extra VIEW is refused (STORAGE_INCOMPATIBLE)', !storage.available && storage.failure?.code === 'STORAGE_INCOMPATIBLE', { available: storage.available, code: storage.failure?.code })
  const after = objectsOf(path)
  check('valid v1 + extra VIEW is left byte-logically unchanged', JSON.stringify(before) === JSON.stringify(after), after)
  storage.close()
}

// C) Valid v1 database still opens, writes and reopens.
{
  const dir = join(ROOT, 'valid')
  const path = fresh(dir)
  makeValid(path)
  const storage = new ProbeStorage({ dataDir: dir })
  check('valid v1 DB still opens (no over-rejection)', storage.available, storage.failure?.code)
  const created = storage.createOrReplay({
    id: '99999999-9999-4999-8999-999999999999', idempotencyKey: '88888888-8888-4888-8888-888888888888',
    digest: '0'.repeat(64), content: 'view-objects', createdAt: '2026-01-01T00:00:00.000Z',
  })
  check('valid v1 DB accepts a write', created.kind === 'created', created.kind)
  storage.close()
  const reopened = new ProbeStorage({ dataDir: dir })
  check('valid v1 DB reopens with the record', reopened.available && reopened.getById('99999999-9999-4999-8999-999999999999')?.content === 'view-objects', reopened.failure?.code)
  reopened.close()
}

// D) Genuinely blank directory still initializes v1 with exactly the two tables.
{
  const dir = join(ROOT, 'blank')
  rmSync(dir, { recursive: true, force: true })
  const storage = new ProbeStorage({ dataDir: dir })
  check('blank directory still initializes', storage.available, storage.failure?.code)
  const facts = readDatabaseFacts(join(dir, 'knowledgeos.sqlite'))
  check('blank initialization creates exactly two application tables', facts.objects.length === 2 && facts.objects.every(o => o.type === 'table') && facts.applicationId === APPLICATION_ID && facts.userVersion === 1, facts.objects)
  check('blank initialization ledger checksum', facts.ledger.length === 1 && facts.ledger[0].checksum === MIGRATION_V1_CHECKSUM, facts.ledger)
  storage.close()
}

const result = { role: 'independent', candidate: 'codex-takeover-20261116-r2', root: ROOT.replace(REPO, '<repo>'), checks, failures, result: failures === 0 ? 'PASS' : 'FAIL' }
writeFileSync(join(RUN, 'independent', 'view-objects.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ result: result.result, failures, checked: checks.length }, null, 2))
process.exit(failures === 0 ? 0 : 1)

