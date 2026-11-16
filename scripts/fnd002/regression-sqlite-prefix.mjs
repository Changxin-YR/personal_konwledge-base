#!/usr/bin/env node
/**
 * Independent FND-002 R1 regression for SQLite schema ownership.
 *
 * The oracle reads every sqlite_master row and applies the literal
 * `name.startsWith('sqlite_')` rule in JavaScript. It never calls the
 * candidate's readDatabaseFacts() helper as an oracle. By default the module
 * under test is the current candidate lib/storage.js; pass --module to replay
 * a historical frozen module.
 */
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const option = name => {
  const args = process.argv.slice(2)
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
const MODULE_PATH = resolve(option('module') ?? join(REPO, 'packages', 'knowledgeos-panel', 'lib', 'storage.js'))
const OUT_JSON = resolve(option('out') ?? join(REPO, '.cache', 'fnd002-r1-regression.json'))
const LABEL = option('label') ?? 'candidate'

if (!existsSync(MODULE_PATH)) {
  console.error(`module not found: ${MODULE_PATH}`)
  process.exit(2)
}

const moduleSha256 = createHash('sha256').update(readFileSync(MODULE_PATH)).digest('hex')
const mod = await import(pathToFileURL(MODULE_PATH).href)
const {
  ProbeStorage, APPLICATION_ID, SCHEMA_VERSION,
  MIGRATION_V1_SQL, MIGRATION_V1_CHECKSUM, DATABASE_FILENAME,
} = mod

const isInternal = name => name.startsWith('sqlite_')
const canonical = value => JSON.stringify(value)

function openDb(path, readOnly = false) {
  return new DatabaseSync(path, readOnly ? { readOnly: true } : {})
}

/** Full semantic snapshot used to prove rejected databases were untouched. */
function snapshot(path) {
  const db = openDb(path, true)
  try {
    const pragmas = {
      application_id: Number(db.prepare('PRAGMA application_id').get()?.application_id ?? 0),
      user_version: Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0),
      journal_mode: String(db.prepare('PRAGMA journal_mode').get()?.journal_mode ?? ''),
    }
    const allObjects = db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name')
      .all()
      .map(row => ({ type: row.type, name: row.name, tbl_name: row.tbl_name, sql: row.sql }))
    const userObjects = allObjects.filter(object => !isInternal(object.name))
    const data = {}
    for (const object of userObjects) {
      if (object.type !== 'table') continue
      const quoted = object.name.replace(/"/g, '""')
      data[object.name] = db.prepare(`SELECT * FROM "${quoted}" ORDER BY rowid`).all().map(row => ({ ...row }))
    }
    return { pragmas, allObjects, userObjects, data }
  } finally {
    db.close()
  }
}

function buildV1(path) {
  const db = openDb(path)
  try {
    db.exec(MIGRATION_V1_SQL)
    db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)')
      .run(SCHEMA_VERSION, MIGRATION_V1_CHECKSUM, '2026-01-01T00:00:00.000Z')
    db.exec(`PRAGMA application_id = ${APPLICATION_ID}`)
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    db.prepare('INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('rec-existing', 'key-existing', createHash('sha256').update('existing').digest('hex'), 'existing', '2026-01-01T00:00:00.000Z')
  } finally {
    db.close()
  }
}

const fixtureA = path => {
  const db = openDb(path)
  try {
    db.exec('CREATE TABLE sqliteX_foreign_private (id INTEGER PRIMARY KEY, secret TEXT NOT NULL)')
    db.prepare('INSERT INTO sqliteX_foreign_private (id, secret) VALUES (?, ?)').run(1, 'sentinel-value-A')
  } finally { db.close() }
}
const fixtureB = path => {
  const db = openDb(path)
  try { db.exec('CREATE VIEW sqliteX_view AS SELECT 1 AS one') } finally { db.close() }
}
const fixtureC = path => {
  buildV1(path)
  const db = openDb(path)
  try { db.exec('CREATE INDEX sqliteX_user_index ON storage_probe_records(id)') } finally { db.close() }
}
const fixtureD = path => {
  buildV1(path)
  const db = openDb(path)
  try {
    db.exec("CREATE TRIGGER sqliteX_user_trigger AFTER INSERT ON storage_probe_records FOR EACH ROW BEGIN UPDATE storage_probe_records SET content = content WHERE id = 'never-match'; END")
  } finally { db.close() }
}
const fixtureE = path => { writeFileSync(path, Buffer.alloc(0)) }
const fixtureF = path => { buildV1(path) }

const cases = [
  { id: 'A', kind: 'reject', description: 'unknown table sqliteX_foreign_private with sentinel', build: fixtureA },
  { id: 'B', kind: 'reject', description: 'unknown view sqliteX_view', build: fixtureB },
  { id: 'C', kind: 'reject', description: 'v1 plus sqliteX_user_index', build: fixtureC },
  { id: 'D', kind: 'reject', description: 'v1 plus sqliteX_user_trigger', build: fixtureD },
  { id: 'E', kind: 'accept', description: 'truly blank database', build: fixtureE },
  { id: 'F', kind: 'accept', description: 'v1 with sqlite_autoindex control', build: fixtureF },
]

function expectedSchemaObjects() {
  return [
    { type: 'table', name: 'schema_migrations', tbl_name: 'schema_migrations' },
    { type: 'table', name: 'storage_probe_records', tbl_name: 'storage_probe_records' },
  ]
}

const workDir = mkdtempSync(join(tmpdir(), 'fnd002-r1-'))
const results = []
try {
  for (const entry of cases) {
    const dir = join(workDir, entry.id)
    mkdirSync(dir, { recursive: true })
    const path = join(dir, DATABASE_FILENAME)
    entry.build(path)
    const before = snapshot(path)
    const storage = new ProbeStorage({ dataDir: dir })
    const available = storage.available
    const failureCode = storage.failure?.code ?? null
    const failureMessage = storage.failure?.message ?? null
    let write = null
    if (entry.kind === 'accept' && available) {
      const content = `content-${entry.id}`
      const input = {
        id: `rec-${entry.id}`,
        idempotencyKey: `key-${entry.id}`,
        digest: createHash('sha256').update(content).digest('hex'),
        content,
        createdAt: '2026-01-01T00:00:00.000Z',
      }
      const created = storage.createOrReplay(input)
      const readBack = storage.getById(input.id)
      write = { kind: created.kind, readBackOk: readBack?.id === input.id && readBack?.content === content }
    }
    storage.close()
    const after = snapshot(path)
    const unchanged = canonical(before) === canonical(after)
    const userSchema = after.userObjects.map(object => ({ type: object.type, name: object.name, tbl_name: object.tbl_name }))
    const schemaOk = canonical(userSchema) === canonical(expectedSchemaObjects())
      && after.pragmas.application_id === APPLICATION_ID
      && after.pragmas.user_version === SCHEMA_VERSION
    const hasAutoindex = after.allObjects.some(object => object.name.startsWith('sqlite_autoindex_'))
    let persisted = null
    if (entry.kind === 'accept' && write !== null) {
      const db = openDb(path, true)
      try {
        const row = db.prepare('SELECT id, content FROM storage_probe_records WHERE id = ?').get(`rec-${entry.id}`)
        persisted = row?.content === `content-${entry.id}`
      } finally { db.close() }
    }
    const pass = entry.kind === 'reject'
      ? available === false && failureCode === 'STORAGE_INCOMPATIBLE' && unchanged
      : available === true && schemaOk && write?.kind === 'created' && write?.readBackOk === true && persisted === true
        && (entry.id !== 'F' || hasAutoindex)
    results.push({
      case: entry.id,
      description: entry.description,
      expected: entry.kind === 'reject' ? 'reject STORAGE_INCOMPATIBLE and preserve database' : 'accept and support read/write',
      actual: entry.kind === 'reject'
        ? { accepted: available, failureCode, unchanged }
        : { accepted: available, schemaOk, hasAutoindex, write, persisted },
      pass,
      failureMessage,
      userObjects: before.userObjects.map(object => `${object.type}:${object.name}`),
      oracleInternalObjects: before.allObjects.filter(object => isInternal(object.name)).map(object => object.name),
      semanticsUnchanged: unchanged,
    })
  }
} finally {
  rmSync(workDir, { recursive: true, force: true })
}

const summary = {
  total: results.length,
  pass: results.filter(result => result.pass).length,
  fail: results.filter(result => !result.pass).length,
}
const report = {
  review: 'FND-002 R1',
  run: LABEL,
  generatedAt: new Date().toISOString(),
  node: process.version,
  module: { path: MODULE_PATH.startsWith(`${REPO}${process.platform === 'win32' ? '\\' : '/'}`) ? MODULE_PATH.slice(REPO.length + 1).replaceAll('\\', '/') : MODULE_PATH, sha256: moduleSha256 },
  oracle: {
    description: 'independent sqlite_master scan; internal objects are filtered only by literal startsWith(\'sqlite_\')',
    predicate: "name.startsWith('sqlite_')",
  },
  summary,
  verdict: summary.fail === 0 ? 'ALL PASS' : 'FAIL',
  cases: results,
}
mkdirSync(dirname(OUT_JSON), { recursive: true })
writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
process.exitCode = summary.fail === 0 ? 0 : 1
