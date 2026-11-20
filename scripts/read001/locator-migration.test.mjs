import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash, randomUUID} from 'node:crypto'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import test from 'node:test'
import {pathToFileURL} from 'node:url'
import {ProbeStorage} from '../../packages/knowledgeos-panel/lib/storage.js'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'
import {seed} from '../fnd006/independent/common.mjs'

const v14 = '3df8200073e36318d18db77604bcf9b6d0eda35d'

function snapshot(db) {
  const schema = db.prepare('SELECT * FROM sqlite_schema ORDER BY type, name').all()
  const tables = schema.filter(row => row.type === 'table')
  return {
    applicationId: db.prepare('PRAGMA application_id').get().application_id,
    version: db.prepare('PRAGMA user_version').get().user_version,
    schema,
    rows: Object.fromEntries(tables.map(({name}) => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]))
  }
}

function checkLocatorContract(db, id) {
  assert.equal(db.prepare("SELECT strict FROM pragma_table_list WHERE name='citation_locators'").get().strict, 1)
  db.exec('SAVEPOINT contract')
  try {
    const insert = db.prepare('INSERT INTO citation_locators(citation_id,snapshot) VALUES(?,?)')
    for (const value of ['{', '[]', '"x"', '1', 'true', 'null', null]) assert.throws(() => insert.run(id, value), /constraint failed/)
    assert.throws(() => insert.run(randomUUID(), '{}'), /FOREIGN KEY constraint failed/)
    insert.run(id, '{}')
    assert.throws(() => insert.run(id, '{}'), /UNIQUE constraint failed/)
  } finally { db.exec('ROLLBACK TO contract; RELEASE contract') }
}

test('v15 rolls back fully and upgrades a published v14 citation without inventing a locator', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'kos-v15-locator-'))
  t.after(() => rmSync(dir, {recursive:true, force:true}))
  const prior = join(dir, 'v14.mjs')
  writeFileSync(prior, execFileSync('git', ['show', `${v14}:packages/knowledgeos-panel/lib/test-support.js`]))
  const old = await import(pathToFileURL(prior).href)
  const {actor} = await seed(old, dir)
  const store = new old.ProbeStorage({dataDir:dir})
  let resolved
  try {
    const bytes = Buffer.from('first quote; second quote')
    const hash = createHash('sha256').update(bytes).digest('hex')
    const {receipt:r} = store.assets.publish(actor, {title:'v14.txt', key:randomUUID()},
      {key:randomUUID()+'.txt', byteLength:bytes.length, sha256:hash}, {media:'text/plain', ...decodeText(bytes, 'text/plain')})
    const {data} = store.citations.create(actor, {asset_id:r.id, version_id:r.version_id, ordinal:1, start:20, end:25, source_hash:hash}, randomUUID())
    resolved = store.citations.resolve(actor, data.id)
    assert.equal(resolved.quote, 'quote')
  } finally { store.close() }

  const db = new DatabaseSync(join(dir, 'knowledgeos.sqlite'))
  try {
    db.exec('PRAGMA foreign_keys=ON')
    const before = snapshot(db)
    assert.equal(before.version, 14)
    assert.deepEqual(before.rows.citations.map(r => r.id), [resolved.id])
    assert.equal(before.rows.citation_locators, undefined)
    const broken = new ProbeStorage({dataDir:dir, failureAt:'v15:after-schema'})
    try {
      assert.equal(broken.available, false)
      assert.match(broken.failure.cause.message, /v15:after-schema/)
    } finally { broken.close() }
    assert.deepEqual(snapshot(db), before)

    let upgraded
    for (let boot = 0; boot < 2; boot++) {
      const next = new ProbeStorage({dataDir:dir})
      try {
        assert(next.available, next.failure?.message)
        const after = snapshot(db)
        assert.equal(after.version, 15)
        assert.equal(after.applicationId, before.applicationId)
        assert.deepEqual(after.schema.filter(row => row.tbl_name !== 'citation_locators'), before.schema)
        const {citation_locators, schema_migrations, ...rows} = after.rows
        assert.deepEqual(citation_locators, [])
        assert.deepEqual(schema_migrations.slice(14).map(row => row.version), [15])
        assert.deepEqual({...rows, schema_migrations:schema_migrations.slice(0,14)}, before.rows)
        const read = next.citations.resolve(actor, resolved.id)
        for (const [key, value] of Object.entries(resolved)) assert.deepEqual(read[key], value, key)
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
        if (boot === 0) { upgraded = after; checkLocatorContract(db, resolved.id) }
        else assert.deepEqual(after, upgraded)
      } finally { next.close() }
    }
  } finally { db.close() }
})
