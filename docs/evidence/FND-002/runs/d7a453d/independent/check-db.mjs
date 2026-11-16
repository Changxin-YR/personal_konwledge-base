#!/usr/bin/env node
/**
 * FND-002 independent verifier — offline read-only SQLite checks.
 *
 * Written by the independent test/acceptance role (not the implementer).
 * Opens the business databases created by the candidate run with a separate
 * read-only `node:sqlite` connection and compares real stored values with the
 * recorded T01/T03/T05/T07/T08 evidence. Never writes to any database.
 *
 * Usage:
 *   node docs/evidence/FND-002/runs/d7a453d/independent/check-db.mjs <run_id>
 */
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('../../../../../..', import.meta.url)))
const RUN_ID = process.argv[2] ?? 'd7a453d'
const DATA_ROOT = join(REPO, '.cache', 'knowledgeos-fnd002-data', RUN_ID)
const EVIDENCE = join(REPO, 'docs', 'evidence', 'FND-002', 'runs', 'd7a453d')
const DSH_HOME = join(REPO, '.cache', 'dsh-home-fnd002')
const DSH_OLD_HOME = join(REPO, '.cache', 'dsh-home-fnd001')

const EXPECTED_CHECKSUM = '033dcf95cd9e7c6e4fa964804de7944c1b99daa4b4acd5b92708555cb15dc84a'
const EXPECTED_APP_ID = 1263489841
const EXPECTED_TABLES = ['schema_migrations', 'storage_probe_records']

const checks = []
let failures = 0
function check(name, ok, actual) {
  checks.push({ name, ok: Boolean(ok), actual })
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${actual === undefined ? '' : ` :: ${JSON.stringify(actual)}`}`)
}

function openRo(dataDir) {
  const path = join(dataDir, 'knowledgeos.sqlite')
  if (!existsSync(path)) throw new Error(`missing database ${path}`)
  return new DatabaseSync(path, { readOnly: true })
}

function facts(db) {
  return {
    applicationId: Number(db.prepare('PRAGMA application_id').get().application_id),
    userVersion: Number(db.prepare('PRAGMA user_version').get().user_version),
    tables: db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name),
    ledger: db.prepare('SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version').all(),
    journal: String(db.prepare('PRAGMA journal_mode').get().journal_mode),
    sqliteVersion: String(db.prepare('SELECT sqlite_version() AS v').get().v),
  }
}

function evidence(id) {
  return JSON.parse(readFileSync(join(EVIDENCE, `${id}.json`), 'utf8'))
}

function findEvidenceLog(prefix, suffix = '.log') {
  return readdirSync(EVIDENCE).filter(n => n.startsWith(prefix) && n.endsWith(suffix)).sort()
}

// ---------------------------------------------------------------- T01
{
  const dir = join(DATA_ROOT, 't01')
  const db = openRo(dir)
  try {
    const f = facts(db)
    const rows = db.prepare('SELECT id, content, created_at FROM storage_probe_records').all()
    const t01 = evidence('T01')
    const expected = t01.details.requests.read.data
    check('T01: exactly one persisted row', rows.length === 1, rows.length)
    check('T01: same id as HTTP response', rows.length === 1 && rows[0].id === expected.id, rows[0]?.id)
    check('T01: same content (UTF-8, quotes, newline) as HTTP response', rows.length === 1 && rows[0].content === expected.content, rows[0]?.content)
    check('T01: same created_at before/after restart', rows.length === 1 && rows[0].created_at === expected.created_at, rows[0]?.created_at)
    check('T01: application_id/user_version', f.applicationId === EXPECTED_APP_ID && f.userVersion === 1, { applicationId: f.applicationId, userVersion: f.userVersion })
    check('T01: only two application tables', f.tables.join(',') === EXPECTED_TABLES.join(','), f.tables)
    check('T01: migration ledger checksum', f.ledger.length === 1 && f.ledger[0].checksum === EXPECTED_CHECKSUM, f.ledger)
    check('T01: DB is a real file outside DSH_HOME', !dir.startsWith(DSH_HOME) && statSync(join(dir, 'knowledgeos.sqlite')).isFile(), dir.replace(REPO, '<repo>'))
    const digest = createHash('sha256').update(Buffer.from(rows[0]?.content ?? '', 'utf8')).digest('hex')
    const storedDigest = db.prepare('SELECT request_digest FROM storage_probe_records').get()?.request_digest
    check('T01: request_digest equals SHA-256 of stored content bytes', storedDigest === digest, storedDigest)
    check('T01: journal_mode=WAL persisted for the real file', f.journal === 'wal', f.journal)
    const business = []
    const walk = d => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, entry.name)
        if (entry.isDirectory()) walk(p)
        else if (/^knowledgeos\.sqlite/.test(entry.name)) business.push(p)
      }
    }
    walk(DSH_HOME)
    walk(DSH_OLD_HOME)
    check('T01: no business DB/WAL/SHM under either DSH_HOME', business.length === 0, business.map(p => p.replace(REPO, '<repo>')))
  } finally { db.close() }
}

// ---------------------------------------------------------------- T03
{
  const dir = join(DATA_ROOT, 't03')
  const db = openRo(dir)
  try {
    const f = facts(db)
    check('T03: application_id=1263489841', f.applicationId === EXPECTED_APP_ID, f.applicationId)
    check('T03: user_version=1', f.userVersion === 1, f.userVersion)
    check('T03: exactly two tables', f.tables.join(',') === EXPECTED_TABLES.join(','), f.tables)
    check('T03: exactly one migration ledger row with frozen checksum', f.ledger.length === 1 && f.ledger[0].checksum === EXPECTED_CHECKSUM, f.ledger)
    check('T03: journal_mode persisted as WAL', f.journal === 'wal', f.journal)
    check('T03: real SQLite version is 3.53.4', f.sqliteVersion === '3.53.4', f.sqliteVersion)
    const rows = db.prepare('SELECT count(*) AS c FROM storage_probe_records').get()
    check('T03: repeat start kept exactly one record', Number(rows.c) === 1, Number(rows.c))

    // Field / constraint contract (D5) read from the real file.
    const cols = name => db.prepare(`SELECT name, type, "notnull" AS nn, pk FROM pragma_table_info('${name}') ORDER BY cid`).all()
    const migrationsCols = cols('schema_migrations')
    const recordsCols = cols('storage_probe_records')
    const shape = list => list.map(c => `${c.name}:${c.type}:nn${c.nn}:pk${c.pk}`).join(',')
    check('T03: schema_migrations field/constraint shape',
      shape(migrationsCols) === 'version:INTEGER:nn0:pk1,checksum:TEXT:nn1:pk0,applied_at:TEXT:nn1:pk0', shape(migrationsCols))
    check('T03: storage_probe_records field/constraint shape',
      shape(recordsCols) === 'id:TEXT:nn1:pk1,idempotency_key:TEXT:nn1:pk0,request_digest:TEXT:nn1:pk0,content:TEXT:nn1:pk0,created_at:TEXT:nn1:pk0', shape(recordsCols))
    const uniqueIndexes = db.prepare('PRAGMA index_list(storage_probe_records)').all().filter(i => Number(i.unique) === 1)
    const coveredByUnique = uniqueIndexes.some(i => db.prepare(`PRAGMA index_info('${i.name}')`).all().some(c => c.name === 'idempotency_key'))
    check('T03: idempotency_key is covered by a real UNIQUE index', coveredByUnique, uniqueIndexes.map(i => i.name))
    const ddl = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    check('T03: both tables are STRICT as frozen', ddl.length === 2 && ddl.every(t => /\)\s*STRICT\s*$/.test(t.sql ?? '')), ddl.map(t => t.name))

    // Independent checksum recompute from the frozen candidate's canonical SQL bytes
    // (extracted from the built artifact, not from the exported constant).
    const built = readFileSync(join(REPO, 'packages', 'knowledgeos-panel', 'lib', 'storage.js'), 'utf8')
    const marker = 'var MIGRATION_V1_SQL = `'
    const start = built.indexOf(marker)
    const end = built.indexOf('`', start + marker.length)
    const canonicalSql = start >= 0 && end > start ? built.slice(start + marker.length, end) : ''
    const recomputed = createHash('sha256').update(Buffer.from(canonicalSql, 'utf8')).digest('hex')
    check('T03: canonical v1 SQL is extractable from the frozen artifact', canonicalSql.length > 0, canonicalSql.length)
    check('T03: independent SHA-256 of canonical SQL equals frozen 033dcf95…', recomputed === EXPECTED_CHECKSUM, recomputed)
    check('T03: independent checksum equals the ledger checksum', recomputed === f.ledger[0]?.checksum, f.ledger[0]?.checksum)

    const logs = findEvidenceLog('t03')
    const opened = []
    for (const name of logs) {
      for (const line of readFileSync(join(EVIDENCE, name), 'utf8').split(/\r?\n/)) {
        if (line.includes('knowledgeos-storage: opened')) opened.push({ file: name, line })
      }
    }
    check('T03: Host opened storage on both starts', opened.length === 2, opened.map(o => o.file))
    const pragmas = opened.length > 0
      ? Object.fromEntries([...opened[0].line.matchAll(/(\w+)=([^\s]+)/g)].map(m => [m[1], m[2]]))
      : {}
    check('T03: Host log runtime node (actual process)', pragmas.node === process.versions.node, pragmas.node)
    check('T03: Host log sqlite=3.53.4', pragmas.sqlite === '3.53.4', pragmas.sqlite)
    check('T03: Host log journal=wal', pragmas.journal === 'wal', pragmas.journal)
    check('T03: Host log foreign_keys=1', pragmas.foreign_keys === '1', pragmas.foreign_keys)
    check('T03: Host log synchronous=2 (FULL)', pragmas.synchronous === '2', pragmas.synchronous)
    check('T03: Host log busy_timeout=250', pragmas.busy_timeout === '250', pragmas.busy_timeout)
    check('T03: both starts report the same settings', opened.length === 2 && opened.every(o => o.line.includes('journal=wal') && o.line.includes('busy_timeout=250')))

    // Foreign keys really enforced on a real connection (no production table added).
    const fk = new DatabaseSync(':memory:')
    try {
      fk.exec('PRAGMA foreign_keys=ON')
      fk.exec('CREATE TABLE p (id TEXT PRIMARY KEY); CREATE TABLE c (pid TEXT REFERENCES p(id));')
      let rejected = false
      try { fk.prepare('INSERT INTO c (pid) VALUES (?)').run('missing') } catch (e) { rejected = (e.errcode & 0xff) === 19 }
      const fkOn = Number(fk.prepare('PRAGMA foreign_keys').get().foreign_keys)
      check('T03: foreign_keys=ON rejects orphan row on an independent real connection', rejected && fkOn === 1, { rejected, fkOn })
    } finally { fk.close() }
  } finally { db.close() }
}

// ---------------------------------------------------------------- T05
{
  const dir = join(DATA_ROOT, 't05')
  const db = openRo(dir)
  try {
    const total = Number(db.prepare('SELECT count(*) AS c FROM storage_probe_records').get().c)
    const dup = db.prepare('SELECT idempotency_key, count(*) AS c FROM storage_probe_records GROUP BY idempotency_key HAVING c > 1').all()
    const concurrent = db.prepare("SELECT id, idempotency_key, content FROM storage_probe_records WHERE content = 'concurrent'").all()
    const indexes = db.prepare('PRAGMA index_list(storage_probe_records)').all()
    const t05 = evidence('T05')
    check('T05: total rows = 3 (first + concurrent + different key)', total === 3, total)
    check('T05: no duplicate idempotency_key rows', dup.length === 0, dup)
    check('T05: concurrent content stored twice under two distinct keys (one per key)', concurrent.length === 2 && new Set(concurrent.map(r => r.idempotency_key)).size === 2, concurrent)
    const uniqueOnKey = indexes.filter(i => Number(i.unique) === 1)
      .filter(i => db.prepare(`PRAGMA index_info('${i.name}')`).all().some(c => c.name === 'idempotency_key'))
    check('T05: unique index actually covers idempotency_key', uniqueOnKey.length === 1, uniqueOnKey.map(i => i.name))
    check('T05: recorded concurrent statuses are 200+201', JSON.stringify(t05.details.statuses) === '[200,201]', t05.details.statuses)
  } finally { db.close() }
}

// ---------------------------------------------------------------- T07
{
  const dir = join(DATA_ROOT, 't07')
  const db = openRo(dir)
  try {
    const total = Number(db.prepare('SELECT count(*) AS c FROM storage_probe_records').get().c)
    check('T07: database file preserved through unload/reload with 2 records', total === 2, total)
    const logs = findEvidenceLog('t07')
    let opened = 0
    let closed = 0
    let closeFailed = 0
    const order = []
    for (const name of logs) {
      for (const line of readFileSync(join(EVIDENCE, name), 'utf8').split(/\r?\n/)) {
        if (line.includes('knowledgeos-storage: opened')) { opened += 1; order.push('opened') }
        if (line.includes('knowledgeos-storage: closed')) { closed += 1; order.push('closed') }
        if (line.includes('knowledgeos-storage: close failed')) closeFailed += 1
      }
    }
    check('T07: driver close logged exactly once', closed === 1, closed)
    check('T07: storage opened twice (mount + remount)', opened === 2, opened)
    check('T07: no "close failed" line', closeFailed === 0, closeFailed)
    check('T07: close happens after first open and before remount open', order.join(',') === 'opened,closed,opened', order)
    check('T07: log files exist as evidence', logs.length >= 1, logs)
  } finally { db.close() }
}

// ---------------------------------------------------------------- T08
{
  const dir = join(DATA_ROOT, 't08')
  const db = openRo(dir)
  try {
    const t08 = evidence('T08')
    const total = Number(db.prepare('SELECT count(*) AS c FROM storage_probe_records').get().c)
    check('T08: baseline + CLI + SQL-looking = 3 rows only', total === 3, total)
    const sqlRow = db.prepare('SELECT content FROM storage_probe_records WHERE content LIKE ?').all("'%; DROP TABLE%")
    check('T08: SQL-looking text stored verbatim', sqlRow.length === 1 && sqlRow[0].content === `'"; DROP TABLE storage_probe_records; --\n"quoted" 中文`, sqlRow)
    const f = facts(db)
    check('T08: schema unchanged after SQL-looking text', f.tables.join(',') === EXPECTED_TABLES.join(','), f.tables)
    const digest = createHash('sha256').update(Buffer.from(sqlRow[0]?.content ?? '', 'utf8')).digest('hex')
    const stored = db.prepare("SELECT request_digest FROM storage_probe_records WHERE content LIKE ?").get("'%; DROP TABLE%")
    check('T08: request_digest is SHA-256 of content bytes', stored?.request_digest === digest, stored?.request_digest)
    check('T08: recorded case matrix is complete', Array.isArray(t08.details.cases) && t08.details.cases.length === 14, t08.details.cases?.length)
  } finally { db.close() }
}

// ---------------------------------------------------------------- T04 / T06 / T02 side facts
{
  const dir = join(DATA_ROOT, 't02')
  const db = openRo(dir)
  try {
    const rows = db.prepare('SELECT id, content FROM storage_probe_records ORDER BY created_at').all()
    check('T02: only baseline + after rows (no partial write)', rows.length === 2 && rows.every(r => r.content === 'baseline' || r.content === 'after'), rows)
  } finally { db.close() }
  const t04 = evidence('T04')
  check('T04: four incompatible fixtures recorded', Object.keys(t04.details.fixtures).sort().join(',') === 'bad-checksum,future,unknown-schema,wrong-app', Object.keys(t04.details.fixtures))
  const lockDir = join(DATA_ROOT, 't06-lock')
  const db2 = openRo(lockDir)
  try {
    const rows = db2.prepare('SELECT content FROM storage_probe_records ORDER BY created_at').all().map(r => r.content)
    check('T06: before-lock + after-lock rows persisted (original data survives lock)', rows.length === 2 && rows[0] === 'before-lock' && rows[1] === 'after-lock', rows)
  } finally { db2.close() }
}

// ---------------------------------------------------------------- T09 static: loaded artifact == candidate
{
  const candidate = readFileSync(join(REPO, 'docs', 'evidence', 'FND-002', 'candidate.md'), 'utf8')
  const expected = {}
  for (const match of candidate.matchAll(/^\| `([^`]+)` \| `([0-9a-f]{64})`/gm)) expected[match[1]] = match[2]
  check('T09: candidate.md lists the 11 frozen file hashes', Object.keys(expected).length === 11, Object.keys(expected).length)

  const profileDir = join(DSH_HOME, 'profiles', 'knowledgeos-storage-test')
  const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  const spec = manifest.dependencies?.['knowledgeos-panel'] ?? ''
  const asPosix = value => value.replace(/\\/g, '/').toLowerCase()
  check('T09: profile dependency links the candidate package', asPosix(spec) === asPosix(`link:${join(REPO, 'packages', 'knowledgeos-panel')}`), spec)
  const installed = join(profileDir, 'node_modules', 'knowledgeos-panel')
  check('T09: profile node_modules resolves the plugin', existsSync(installed), installed.replace(REPO, '<repo>'))
  for (const file of ['lib/index.js', 'lib/storage.js', 'lib/client.js']) {
    const fromPackage = createHash('sha256').update(readFileSync(join(REPO, 'packages', 'knowledgeos-panel', file))).digest('hex')
    const fromProfile = createHash('sha256').update(readFileSync(join(installed, file))).digest('hex')
    const frozen = expected[`packages/knowledgeos-panel/${file}`]
    check(`T09: ${file} matches the frozen candidate hash`, fromPackage === frozen && fromProfile === frozen, { frozen, fromPackage, fromProfile })
  }
  {
    const fromPackage = createHash('sha256').update(readFileSync(join(REPO, 'packages', 'knowledgeos-panel', 'lib', 'test-support.js'))).digest('hex')
    const fromProfile = createHash('sha256').update(readFileSync(join(installed, 'lib', 'test-support.js'))).digest('hex')
    check('T09: lib/test-support.js loaded from the same package', fromPackage === fromProfile, fromProfile)
  }
  for (const file of ['packages/knowledgeos-panel/src/host/storage.ts', 'packages/knowledgeos-panel/src/host/http.ts', 'packages/knowledgeos-panel/src/host/records.ts', 'packages/knowledgeos-panel/src/host/config.ts', 'packages/knowledgeos-panel/src/host/index.ts', 'packages/knowledgeos-panel/package.json', 'scripts/fnd002/run-all.mjs', 'scripts/fnd002/scope-check.mjs']) {
    const actual = createHash('sha256').update(readFileSync(join(REPO, file))).digest('hex')
    check(`T09: ${file} matches the frozen candidate hash`, actual === expected[file], actual)
  }
  const browser = JSON.parse(readFileSync(join(EVIDENCE, 'T09-browser', 'summary.json'), 'utf8'))
  check('T09: FND-001 panel browser regression PASS with no failures/not_run', browser.result === 'PASS' && browser.failures.length === 0 && browser.not_run.length === 0, { result: browser.result, failures: browser.failures?.length, not_run: browser.not_run?.length })
  check('T09: browser evidence includes 6 screenshots', readdirSync(join(EVIDENCE, 'T09-browser')).filter(n => n.endsWith('.png')).length === 6, readdirSync(join(EVIDENCE, 'T09-browser')).filter(n => n.endsWith('.png')).length)
  const oldHomeDb = readdirSync(DSH_OLD_HOME, { recursive: true }).filter(p => /knowledgeos\.sqlite/.test(String(p)))
  check('T09: legacy profile did not create a business database', oldHomeDb.length === 0, oldHomeDb)
}

// ---------------------------------------------------------------- D9: DDL identical across independent initializations
{
  const read = dataDir => {
    const db = new DatabaseSync(join(dataDir, 'knowledgeos.sqlite'), { readOnly: true })
    try { return db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() } finally { db.close() }
  }
  const a = read(join(DATA_ROOT, 't01'))
  const b = read(join(DATA_ROOT, 't03'))
  check('D9: DDL from two independent initializations is identical', JSON.stringify(a) === JSON.stringify(b), a.map(t => t.name))
}

const summary = { role: 'independent', run_id: RUN_ID, data_root: DATA_ROOT.replace(REPO, '<repo>'), checks, failures, result: failures === 0 ? 'PASS' : 'FAIL' }
console.log(JSON.stringify({ result: summary.result, failures, checked: checks.length }, null, 2))
process.exit(failures === 0 ? 0 : 1)