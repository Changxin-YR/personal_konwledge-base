import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

const [checkout = process.cwd(), mode = '--full'] = process.argv.slice(2)
assert(['--seed-only', '--migration', '--full'].includes(mode))
const root = resolve(checkout)
const fromRoot = path => import(pathToFileURL(join(root, path)).href)
const fromFile = path => import(pathToFileURL(path).href)
const frozenV36 = '033a20b617b479a8fd83099361aac778d425cb8f'
const bundle = 'packages/knowledgeos-panel/lib/test-support.js'
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
const dir = mkdtempSync(join(tmpdir(), 'kos-v37-regression-'))
const sqlitePath = join(dir, 'knowledgeos.sqlite')
const digest = value => createHash('sha256').update(value).digest('hex')
const identifier = name => {
  assert.match(name, /^[a-z][a-z_0-9]*$/)
  return '"' + name + '"'
}
const checks = []

function sqlRead(probe) {
  const db = new DatabaseSync(sqlitePath, { readOnly: true })
  try {
    db.exec('BEGIN')
    return probe(db)
  } finally {
    db.close()
  }
}

function sqlWrite(statement) {
  const db = new DatabaseSync(sqlitePath)
  try {
    db.exec('PRAGMA busy_timeout=3000')
    db.exec(statement)
  } finally {
    db.close()
  }
}

const rows = (db, name) => db.prepare('SELECT * FROM ' + identifier(name)).all()
  .map(row => ({ ...row })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
const userVersion = db => db.prepare('PRAGMA user_version').get().user_version
const schema = db => db.prepare(
  'SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name',
).all()
const tableNames = db => schema(db).filter(row => row.type === 'table' && !row.name.startsWith('sqlite_')).map(row => row.name)
const ledger = db => db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
const contents = (db, tables) => Object.fromEntries(tables.map(table => [table, rows(db, table)]))
const foreignKeysClean = db => assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])

async function seedV36(old, decodeText) {
  assert.equal(old.SCHEMA_VERSION, 36)
  const storage = new old.ProbeStorage({ dataDir: dir })
  const identity = new old.IdentityService(storage)
  try {
    assert(storage.available, storage.failure?.message)
    const credentials = { loginName: 'knowproof', password: 'Synthetic knowledge proof 2026!' }
    await identity.bootstrap({ ...credentials, displayName: 'Synthetic fixture owner' })
    const login = await identity.login({ ...credentials, source: 'know002-sqlite' })
    const actor = identity.actor(login.token)
    assert(actor)
    const text = '🧪过去五次采样的平均值是温控基线。固定证据 K-042-V1。超过阈值时记录告警。'
    const quote = '固定证据 K-042-V1'
    const bytes = Buffer.from(text), key = randomUUID()
    const publication = storage.assets.publish(actor, { title: 'audit.md', key },
      { key, sha256: digest(bytes), byteLength: bytes.length },
      { media: 'text/markdown', ...decodeText(bytes, 'text/markdown') }).receipt
    const target = {
      asset_id: publication.id,
      version_id: publication.version_id,
      ordinal: 1,
      start: text.indexOf(quote),
      end: text.indexOf(quote) + quote.length,
      source_hash: digest(text),
    }
    assert.equal(target.start, [...text.slice(0, target.start)].length + 1, 'selection exercises UTF-16 offsets')
    const citation = storage.citations.create(actor, target, randomUUID()).data
    const note = storage.notes.create(actor, actor.userId, randomUUID(),
      { title: '原创温控复盘', body: '我建议先记录基线，再比较阈值，最后复查告警。', kind: 'reading' }, citation.id).data
    const { source } = storage.terms.selection(actor, target)
    const card = {
      explanation_id: randomUUID(),
      term: quote,
      source,
      explanation: { context: '资料中的固定标记', plain: '用于区分两个来源版本', professional: '不可变来源版本的文字标识',
        confusions: [], uncertainty: '' },
      provider: 'offline-proof',
      model: 'deepseek-offline-proof',
    }
    const { term } = storage.terms.save(actor, card, '迁移前手工补充')
    assert.equal(source.quote_hash, digest(quote))
    assert.equal(citation.quote_hash, source.quote_hash)
    assert.equal(note.references[0].citation_id, citation.id)
    return {
      actor, citation, note, term, target, quote,
      oldReads: {
        note: storage.notes.get(actor, note.id),
        citation: storage.citations.resolve(actor, citation.id),
        terms: storage.terms.list(actor, target.asset_id, target.version_id),
      },
    }
  } finally {
    await identity.close()
    storage.close()
  }
}

function causes(error) {
  const messages = []
  for (let current = error; current; current = current.cause) messages.push(current.message)
  return messages.join('\n')
}

async function migration(next, seed) {
  const before = sqlRead(db => {
    const tables = tableNames(db).filter(name => name !== 'schema_migrations')
    for (const required of ['saved_terms', 'notes', 'note_nodes', 'note_references', 'citations']) {
      assert(tables.includes(required))
      assert(rows(db, required).length >= 1, required + ' must contain previous data')
    }
    assert.equal(userVersion(db), 36)
    return { tables, data: contents(db, tables), schema: schema(db), ledger: ledger(db) }
  })
  const broken = new next.ProbeStorage({ dataDir: dir, failureAt: 'v37:after-schema' })
  try {
    assert.equal(broken.available, false)
    assert.match(causes(broken.failure), /v37:after-schema/)
  } finally {
    broken.close()
  }
  sqlRead(db => {
    assert.equal(userVersion(db), 36)
    assert.deepEqual(schema(db), before.schema)
    assert.deepEqual(ledger(db), before.ledger)
    assert.deepEqual(contents(db, before.tables), before.data)
    foreignKeysClean(db)
  })
  checks.push('v37_after_schema_failure_preserves_full_v36_database')

  // Run migration twice against the same data in two separate storage instances.
  let upgradedLedger, upgradedSchema
  for (let boot = 0; boot < 2; boot++) {
    const storage = new next.ProbeStorage({ dataDir: dir })
    try {
      assert(storage.available, causes(storage.failure))
      sqlRead(db => {
        assert.equal(userVersion(db), 37)
        const currentLedger = ledger(db), currentSchema = schema(db)
        assert.deepEqual(currentLedger.slice(0, 36), before.ledger)
        assert.equal(currentLedger.length, 37)
        assert.equal(currentLedger[36].version, 37)
        assert.match(currentLedger[36].checksum, /^[a-f0-9]{64}$/)
        if (next.MIGRATION_V37_CHECKSUM) assert.equal(currentLedger[36].checksum, next.MIGRATION_V37_CHECKSUM)
        assert.deepEqual(contents(db, before.tables), before.data)
        for (const name of ['knowledge_items', 'knowledge_versions']) {
          assert(tableNames(db).includes(name), name + ' not installed')
          assert.deepEqual(rows(db, name), [], name + ' unexpectedly migrated user terms')
        }
        if (boot === 0) {
          upgradedLedger = currentLedger
          upgradedSchema = currentSchema
        } else {
          assert.deepEqual(currentLedger, upgradedLedger)
          assert.deepEqual(currentSchema, upgradedSchema)
        }
        foreignKeysClean(db)
      })
      const { actor, note, citation, target, oldReads } = seed
      assert.deepEqual(storage.notes.get(actor, note.id), oldReads.note)
      assert.deepEqual(storage.citations.resolve(actor, citation.id), oldReads.citation)
      assert.deepEqual(storage.terms.list(actor, target.asset_id, target.version_id), oldReads.terms)
    } finally {
      storage.close()
    }
  }
  checks.push('v37_single_migration_receipt_and_legacy_records_survive_reopen')
}

async function lifecycle(next, seed) {
  // This adapter is a thin mapping to the frozen product store, never a mock.
  // It exports bind(storage, actor) returning create(draft, key), append(itemId, expectedRevision, draft, key),
  // and optionally confirm(itemId, expectedRevision, key). Each normalizes to
  // { itemId, versionId, revision, replayed }. Draft inputs here use {title,definition,citationId,noteId,kind,domain}.
  const receiptTable = 'knowledge_write_receipts'
  const required = ['knowledge_items', 'knowledge_versions', receiptTable]
  const storage = new next.ProbeStorage({ dataDir: dir })
  const competing = new next.ProbeStorage({ dataDir: dir })
  try {
    assert(storage.available, causes(storage.failure))
    assert(competing.available, causes(competing.failure))
    const { actor, citation, note } = seed
    const bind = store => {
      const shaped = v => ({ itemId: v.item.id, versionId: v.item.version_id, revision: v.item.version, replayed: v.replayed })
      const fields = d => ({ title: d.title, definition: d.definition, plain_explanation: '', context: '', sources: [
        { type: 'citation', id: d.citationId }, { type: 'note', id: d.noteId, revision: note.revision },
      ] })
      return {
        create: (d, key) => shaped(store.knowledge.create(actor, key, { ...fields(d), kind: d.kind, domain: d.domain })),
        append: (id, version, d, key) => shaped(store.knowledge.update(actor, key, id, version, fields(d))),
        confirm: (id, version, key) => shaped(store.knowledge.update(actor, key, id, version)),
      }
    }
    const api = bind(storage), other = bind(competing)
    const state = () => sqlRead(db => {
      const related = tableNames(db).filter(name => name.startsWith('knowledge_') && !name.startsWith('knowledge_objects'))
      for (const name of required) assert(related.includes(name), name + ' missing. Update adapter.receiptTable if renamed.')
      foreignKeysClean(db)
      return contents(db, related)
    })
    const initial = state()
    assert.equal(initial[receiptTable].length, 0)
    const draft = { title: '温控基线', definition: '取最近采样均值，用来稳定告警比较。', citationId: citation.id, noteId: note.id,
      kind: 'concept', domain: 'software_engineering' }
    const createKey = randomUUID()
    const first = await api.create(draft, createKey)
    assert.equal(first.revision, 1)
    assert.equal(first.replayed, false)
    assert.match(first.itemId, /^[a-f0-9-]{36}$/)
    assert.match(first.versionId, /^[a-f0-9-]{36}$/)
    const afterFirst = state()
    assert.equal(afterFirst[receiptTable].length, 1)
    const item = afterFirst.knowledge_items.find(row => row.id === first.itemId)
    const versionOne = afterFirst.knowledge_versions.find(row => row.id === first.versionId)
    assert(item && versionOne)
    assert.equal(item.current_version_id, first.versionId)
    assert.equal(item.service_id, actor.serviceId)
    assert.equal(item.owner_id, actor.userId)
    assert.equal(item.kind, draft.kind)
    assert.equal(item.domain, draft.domain)
    assert.equal(versionOne.item_id, first.itemId)
    assert.equal(versionOne.revision, 1)
    assert.equal(versionOne.definition, draft.definition)
    assert.deepEqual(await other.create(draft, createKey), { ...first, replayed: true })
    await assert.rejects(async () => api.create({ ...draft, definition: '同一个键改写' }, createKey), { code: 'IDEMPOTENCY_CONFLICT' })
    assert.deepEqual(state(), afterFirst)

    const revisionTwo = { ...draft, definition: '用最近五次采样的均值作为告警判断的比较基准。' }
    const appendKey = randomUUID()
    for (const point of [
      { table: 'knowledge_items', operation: 'UPDATE OF current_version_id', name: 'know002_abort_pointer' },
      { table: receiptTable, operation: 'INSERT', name: 'know002_abort_receipt' },
    ]) {
      const trigger = identifier(point.name)
      sqlWrite('CREATE TRIGGER ' + trigger + ' BEFORE ' + point.operation + ' ON ' + identifier(point.table)
        + " BEGIN SELECT RAISE(ABORT,'synthetic v37 transactional failure'); END")
      try {
        await assert.rejects(async () => api.append(first.itemId, 1, revisionTwo, appendKey))
        assert.deepEqual(state(), afterFirst)
      } finally {
        sqlWrite('DROP TRIGGER ' + trigger)
      }
    }
    checks.push('failed_pointer_change_and_failed_receipt_each_rollback_full_write')

    const second = await api.append(first.itemId, 1, revisionTwo, appendKey)
    assert.equal(second.itemId, first.itemId)
    assert.equal(second.revision, 2)
    assert.equal(second.replayed, false)
    assert.notEqual(second.versionId, first.versionId)
    const afterSecond = state()
    assert.equal(afterSecond[receiptTable].length, 2)
    assert.deepEqual(afterSecond.knowledge_versions.find(row => row.id === first.versionId), versionOne)
    assert.equal(afterSecond.knowledge_items.find(row => row.id === first.itemId).current_version_id, second.versionId)
    assert.deepEqual(await other.append(first.itemId, 1, revisionTwo, appendKey), { ...second, replayed: true })
    await assert.rejects(async () => other.append(first.itemId, 1, { ...revisionTwo, definition: '另一标签的正文' }, randomUUID()),
      { code: 'REVISION_CONFLICT' })
    await assert.rejects(async () => other.append(first.itemId, 1, { ...revisionTwo, definition: '相同键但正文不同' }, appendKey),
      { code: 'IDEMPOTENCY_CONFLICT' })
    assert.deepEqual(state(), afterSecond)
    if (api.confirm) {
      const confirmKey = randomUUID()
      const confirmed = await api.confirm(first.itemId, 2, confirmKey)
      const afterConfirm = state()
      assert.equal(confirmed.itemId, first.itemId)
      assert.equal(confirmed.revision, 3)
      assert.equal(confirmed.replayed, false)
      assert.equal(afterConfirm[receiptTable].length, 3)
      for (const prior of afterSecond.knowledge_versions) {
        assert.deepEqual(afterConfirm.knowledge_versions.find(row => row.id === prior.id), prior)
      }
      const current = afterConfirm.knowledge_versions.find(row => row.id === confirmed.versionId)
      assert.equal(current.definition, revisionTwo.definition)
      assert.equal(afterConfirm.knowledge_items.find(row => row.id === first.itemId).current_version_id, current.id)
      assert.equal(current.confirmation_state,'confirmed')
      assert.equal(current.confirmed_by,actor.userId)
      assert.deepEqual(await other.confirm(first.itemId, 2, confirmKey), { ...confirmed, replayed: true })
      assert.deepEqual(state(), afterConfirm)
    }
    checks.push('exact_replay_precedes_stale_revision_check_and_conflicts_leave_no_rows')
  } finally {
    competing.close()
    storage.close()
  }
}

const pinned = join(dir, 'v36.mjs')
const frozenBytes = git('show', frozenV36 + ':' + bundle)
writeFileSync(pinned, frozenBytes, { flag: 'wx' })
writeFileSync(join(dir, 'progress.json'), JSON.stringify({ frozenV36, v36_sha256: digest(frozenBytes) }) + '\n')
try {
  const old = await fromFile(pinned)
  const { decodeText } = await fromRoot('packages/knowledgeos-panel/src/host/text-document.ts')
  const seed = await seedV36(old, decodeText)
  checks.push('frozen_v36_production_fixture_contains_note_citation_and_saved_term')
  if (mode !== '--seed-only') {
    const next = await fromRoot(bundle)
    assert.equal(next.SCHEMA_VERSION, 37, 'build the v37 test-support bundle before running migration checks')
    await migration(next, seed)
    if (mode === '--full') await lifecycle(next, seed)
  }
  console.log(JSON.stringify({ mode, status: 'PASS', current_candidate: git('rev-parse', 'HEAD').toString().trim(),
    frozenV36, v36_sha256: digest(frozenBytes), dir, checks }))
} catch (error) {
  console.error(JSON.stringify({ mode, status: 'FAIL', frozenV36, dir, checks }))
  throw error
}
