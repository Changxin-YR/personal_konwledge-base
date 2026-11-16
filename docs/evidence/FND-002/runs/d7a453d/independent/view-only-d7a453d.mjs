#!/usr/bin/env node
/**
 * Historical check: does the superseded d7a453d build take over a view-only DB?
 *
 * Imports the frozen d7a453d artifact extracted from git (lib/storage.js,
 * SHA256 43693f03…), never the working tree, and opens a database whose only
 * user schema object is a VIEW. Records the actual result.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('../../../../../..', import.meta.url)))
const FROZEN = join(REPO, '.cache', 'frozen-lib', 'packages', 'knowledgeos-panel', 'lib', 'storage.js')
const DATA = join(REPO, '.cache', 'knowledgeos-fnd002-data', 'historical-d7a453d-viewonly')
const OUT = join(REPO, 'docs', 'evidence', 'FND-002', 'runs', 'd7a453d', 'independent', 'view-only-d7a453d.json')

const { ProbeStorage, readDatabaseFacts } = await import(pathToFileURL(FROZEN).href)
rmSync(DATA, { recursive: true, force: true })
mkdirSync(DATA, { recursive: true })
const path = join(DATA, 'knowledgeos.sqlite')
const db = new DatabaseSync(path)
try { db.exec('CREATE VIEW foreign_view AS SELECT 1 AS value') } finally { db.close() }
const before = readDatabaseFacts(path)

const storage = new ProbeStorage({ dataDir: DATA })
const result = {
  role: 'independent',
  candidate: 'd7a453d6dfbdaee4c495b5d920086608fb9c8e1f (superseded)',
  artifact: 'packages/knowledgeos-panel/lib/storage.js',
  artifact_sha256: '43693f03e970142132171d843766d061ad301a39960a4eb46e1b973d75b6f3a1',
  fixture: 'database whose only user object is a VIEW; application_id=0; user_version=0',
  before,
  opened: storage.available,
  failure_code: storage.failure?.code,
  after: readDatabaseFacts(path),
  conclusion: storage.available
    ? 'DEFECT in d7a453d: a view-only non-empty database is treated as blank and migrated (contract §5.3.1 requires rejection).'
    : 'd7a453d refused the view-only database.',
}
storage.close()
writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ opened: result.opened, failure_code: result.failure_code, after: result.after, conclusion: result.conclusion }, null, 2))