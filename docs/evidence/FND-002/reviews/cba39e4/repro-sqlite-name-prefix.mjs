import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

// Use only a new synthetic directory. The imported adapter is not modified.
const modulePath = resolve(process.argv[2])
const { ProbeStorage, readDatabaseFacts } = await import(pathToFileURL(modulePath).href)
const dataDir = mkdtempSync(join(tmpdir(), 'knowledgeos-prefix-review-'))
const databasePath = join(dataDir, 'knowledgeos.sqlite')
const observations = []

function snapshot() {
  const db = new DatabaseSync(databasePath, { readOnly: true })
  try {
    return {
      application_id: db.prepare('PRAGMA application_id').get().application_id,
      user_version: db.prepare('PRAGMA user_version').get().user_version,
      journal_mode: db.prepare('PRAGMA journal_mode').get().journal_mode,
      all_objects: db.prepare('SELECT type, name FROM sqlite_master ORDER BY type, name').all(),
      user_objects_with_literal_prefix: db.prepare("SELECT type, name FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' ORDER BY type, name").all(),
      original_rows: db.prepare('SELECT note FROM sqliteX_foreign_private ORDER BY note').all(),
    }
  } finally {
    db.close()
  }
}

let report
try {
  const fixture = new DatabaseSync(databasePath)
  fixture.exec("CREATE TABLE sqliteX_foreign_private (note TEXT); INSERT INTO sqliteX_foreign_private VALUES ('foreign existing data')")
  fixture.close()
  const before = snapshot()
  const reportedFacts = readDatabaseFacts(databasePath)
  const store = new ProbeStorage({ dataDir, log: message => observations.push(message) })
  const accepted = store.available
  const failureCode = store.failure?.code ?? null
  store.close()
  const after = snapshot()
  const preserved = JSON.stringify(before) === JSON.stringify(after)
  const contractPass = !accepted && failureCode === 'STORAGE_INCOMPATIBLE' && preserved
  report = {
    check: 'FND-002 unknown nonempty database must be rejected before modification',
    source_commit: 'cba39e4808fd41e6d7b076c3fbf080577c8b1114',
    product_candidate: '1b99e392593ef0213f68f8dfb45f5d34a06eac1b',
    runtime: process.version,
    fixture: 'new synthetic disk SQLite database; no user data',
    expected: { accepted: false, failure_code: 'STORAGE_INCOMPATIBLE', original_logical_metadata_unchanged: true },
    before,
    readDatabaseFacts_before: reportedFacts,
    actual: { accepted, failure_code: failureCode, original_logical_metadata_unchanged: preserved },
    after,
    observations,
    result: contractPass ? 'PASS' : 'FAIL',
    limitation: 'Adapter-only local real SQLite check; not a fresh full DSH Host run',
  }
  if (!contractPass) process.exitCode = 1
} finally {
  rmSync(dataDir, { recursive: true, force: true })
}
const output = JSON.stringify(report, null, 2) + '\n'
if (process.argv[3]) writeFileSync(resolve(process.argv[3]), output)
process.stdout.write(output)
