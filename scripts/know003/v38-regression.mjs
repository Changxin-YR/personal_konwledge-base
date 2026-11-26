import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'

const digest = data => createHash('sha256').update(data).digest('hex')
const frozenV37 = 'ff32c0001e2cc8d71ebce58f876242f499ffaeb6'
const paths = {
  entry: 'packages/knowledgeos-panel/lib/index.js',
  bundle: 'packages/knowledgeos-panel/lib/test-support.js',
  storage: 'packages/knowledgeos-panel/lib/storage.js',
  decode: 'packages/knowledgeos-panel/src/host/text-document.ts',
}
const versions = ['relation_types', 'knowledge_relations', 'relation_versions', 'relation_write_receipts']
const fromFile = file => import(pathToFileURL(file).href)
const snapshotRows = (db, table) => {
  assert.match(table, /^[a-z][a-z0-9_]*$/)
  return db.prepare('SELECT * FROM "' + table + '"').all().map(row => ({ ...row }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}
const foreignKeys = db => assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
const ledger = db => db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
const version = db => db.prepare('PRAGMA user_version').get().user_version
const definitions = db => db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all()
const contents = (db, tables) => Object.fromEntries(tables.map(table => [table, snapshotRows(db, table)]))
const withDatabase = (file, readonly, task) => {
  const db = new DatabaseSync(file, { readOnly: readonly })
  try {
    if (readonly) db.exec('BEGIN')
    else db.exec('PRAGMA busy_timeout=3000')
    return task(db)
  } finally { db.close() }
}
const causes = error => {
  const trace = []
  for (let current = error; current; current = current.cause) trace.push(current.message)
  return trace.join('\n')
}

async function seed(old, decodeText, dir) {
  assert.equal(old.SCHEMA_VERSION, 37)
  const storage = new old.ProbeStorage({ dataDir: dir })
  const identity = new old.IdentityService(storage)
  try {
    assert(storage.available, causes(storage.failure))
    const credentials = { loginName: 'ontologyproof', password: 'Synthetic ontology fixture 2026!' }
    await identity.bootstrap({ ...credentials, displayName: 'Synthetic ontology author' })
    const login = await identity.login({ ...credentials, source: 'v38-offline-proof' })
    const actor = identity.actor(login.token)
    assert(actor)
    const text = '🧪近期采样均值可减少温控告警误报。固定证据 K-043-V1。'
    const quote = '固定证据 K-043-V1'
    const bytes = Buffer.from(text), key = randomUUID()
    const receipt = storage.assets.publish(actor, { title: 'v37-source.md', key },
      { key, sha256: digest(bytes), byteLength: bytes.length },
      { media: 'text/markdown', ...decodeText(bytes, 'text/markdown') }).receipt
    const target = { asset_id: receipt.id, version_id: receipt.version_id, ordinal: 1,
      start: text.indexOf(quote), end: text.indexOf(quote) + quote.length, source_hash: digest(text) }
    const citation = storage.citations.create(actor, target, randomUUID()).data
    const note = storage.notes.create(actor, actor.userId, randomUUID(),
      { title: '冻结知识笔记', kind: 'reading', body: '独立手工证据记录。' }, citation.id).data
    const domain = 'software_engineering'
    const draft = { title: '均值告警', definition: '采用最近五次采样平均值。', plain_explanation: '平滑波动。', context: '',
      sources: [{ type: 'citation', id: citation.id }] }
    const createKey = randomUUID()
    const solutionInitial = storage.knowledge.create(actor, createKey, { ...draft, kind: 'solution', domain })
    const solution = storage.knowledge.update(actor, randomUUID(), solutionInitial.item.id, 1)
    const alert = storage.knowledge.create(actor, randomUUID(), { ...draft, title: '短时告警误报', kind: 'case', domain })
    const alertConfirmed = storage.knowledge.update(actor, randomUUID(), alert.item.id, 1)
    const replay = storage.knowledge.create(actor, createKey, { ...draft, kind: 'solution', domain })
    assert.deepEqual(replay, { item: { ...solutionInitial.item, is_current: false }, replayed: true })
    assert.equal(solution.item.confirmation_state, 'confirmed')
    assert.equal(alertConfirmed.item.confirmation_state, 'confirmed')
    return { actor, receipt, citation, target, quote, note,
      pair: { from_id: solution.item.id, to_id: alertConfirmed.item.id, evidence_citation_ids: [citation.id] },
      endpoints: [solution.item, alertConfirmed.item],
      history: storage.knowledge.history(actor, solution.item.id) }
  } finally {
    await identity.close()
    storage.close()
  }
}

async function reviewWorker() {
  const { bundle, dir, actor, id, action, key, barrier } = workerData
  const { ProbeStorage } = await fromFile(bundle)
  const storage = new ProbeStorage({ dataDir: dir })
  try {
    assert(storage.available, causes(storage.failure))
    const signal = new Int32Array(barrier)
    parentPort.postMessage({ ready: true })
    assert.notEqual(Atomics.wait(signal, 0, 0, 10000), 'timed-out')
    try {
      const result = storage.ontology.review(actor, key, id, 1, action)
      parentPort.postMessage({ action, key, result })
    } catch (error) {
      parentPort.postMessage({ action, key, code: error.code ?? 'NO_CODE' })
    }
  } finally { storage.close() }
}

async function raceReview(bundle, dir, actor, id) {
  const barrier = new SharedArrayBuffer(4), signal = new Int32Array(barrier)
  const workers = [], outcomes = []
  let ready = 0
  try {
    for (const action of ['confirm', 'reject']) {
      const worker = new Worker(new URL(import.meta.url), { workerData: { bundle, dir, actor, id, action, barrier, key: randomUUID() } })
      workers.push(worker)
      outcomes.push(new Promise((done, fail) => {
        worker.on('message', message => {
          if (!message.ready) return done(message)
          if (++ready === 2) {
            Atomics.store(signal, 0, 1)
            Atomics.notify(signal, 0, 2)
          }
        })
        worker.once('error', fail)
        worker.once('exit', code => { if (code !== 0) fail(Error('review worker exit ' + code)) })
      }))
    }
    return await Promise.all(outcomes)
  } finally { await Promise.all(workers.map(worker => worker.terminate())) }
}

async function main() {
  const [checkout, expected, entry] = process.argv.slice(2)
  assert(/^[a-f0-9]{40}$/.test(expected) && /^[a-f0-9]{64}$/.test(entry))
  const root = resolve(checkout)
  const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), expected)
  for (const file of Object.values(paths)) assert.deepEqual(readFileSync(join(root, file)), git('show', expected + ':' + file))
  assert.equal(digest(readFileSync(join(root, paths.entry))), entry)

  const dir = mkdtempSync(join(tmpdir(), 'kos-v38-regression-')), dbFile = join(dir, 'knowledgeos.sqlite')
  const oldFile = join(dir, 'frozen-v37.mjs'), newBundle = join(root, paths.bundle)
  const oldBytes = git('show', frozenV37 + ':' + paths.bundle)
  writeFileSync(oldFile, oldBytes, { flag: 'wx' })
  const proof = { unit_id: 'KNOW-003', candidate_sha: expected, entry_sha256: entry, frozen_v37: frozenV37,
    old_bundle_sha256: digest(oldBytes), test_support_sha256: digest(readFileSync(newBundle)),
    runner_sha256: digest(readFileSync(fileURLToPath(import.meta.url))), scope: 'INDEPENDENT_OFFLINE_V38_STORAGE',
    command: 'node --experimental-transform-types v38-regression.mjs <checkout> <candidate SHA> <entry SHA-256>',
    status: 'FAIL', exit_code: 1, real_inference_requests: 0, results: [] }
  const pass = id => proof.results.push({ id, status: 'PASS' })
  const read = task => withDatabase(dbFile, true, task)
  const sql = query => withDatabase(dbFile, false, db => db.exec(query))
  const relationRows = () => read(db => { foreignKeys(db); return contents(db, versions) })
  try {
    const old = await fromFile(oldFile), fresh = await fromFile(newBundle)
    const { decodeText } = await fromFile(join(root, paths.decode))
    const { MIGRATION_V38_CHECKSUM } = await fromFile(join(root, paths.storage))
    assert.equal(fresh.SCHEMA_VERSION, 38)
    assert.match(MIGRATION_V38_CHECKSUM, /^[a-f0-9]{64}$/)
    const fixture = await seed(old, decodeText, dir)
    const before = read(db => {
      assert.equal(version(db), 37)
      const priorTables = definitions(db).filter(row => row.type === 'table' && !row.name.startsWith('sqlite_') && row.name !== 'schema_migrations')
        .map(row => row.name)
      const prior = contents(db, priorTables)
      assert.equal(prior.knowledge_items.length, 2)
      assert.equal(prior.knowledge_versions.length, 4)
      assert.equal(prior.knowledge_write_receipts.length, 4)
      assert.equal(prior.notes.length, 1)
      assert.equal(prior.citations.length, 1)
      foreignKeys(db)
      return { priorTables, prior, definitions: definitions(db), ledger: ledger(db) }
    })
    pass('v37_real_knowledge_items_versions_receipts_seeded')
    const failing = new fresh.ProbeStorage({ dataDir: dir, failureAt: 'v38:after-schema' })
    try {
      assert(!failing.available)
      assert.match(causes(failing.failure), /v38:after-schema/)
    } finally { failing.close() }
    read(db => {
      assert.equal(version(db), 37)
      assert.deepEqual(definitions(db), before.definitions)
      assert.deepEqual(ledger(db), before.ledger)
      assert.deepEqual(contents(db, before.priorTables), before.prior)
      foreignKeys(db)
    })
    pass('v38_after_schema_failure_rolls_back_full_v37_database')

    let schemaAfterUpgrade, ledgerAfterUpgrade
    for (let count = 0; count < 2; count++) {
      const upgraded = new fresh.ProbeStorage({ dataDir: dir })
      try {
        assert(upgraded.available, causes(upgraded.failure))
        read(db => {
          const actual = ledger(db)
          assert.equal(version(db), 38)
          assert.deepEqual(actual.slice(0, 37), before.ledger)
          assert.equal(actual.length, 38)
          assert.equal(actual[37].version, 38)
          assert.equal(actual[37].checksum, MIGRATION_V38_CHECKSUM)
          assert.deepEqual(contents(db, before.priorTables), before.prior)
          assert.equal(snapshotRows(db, 'relation_types').length, 3)
          for (const name of versions.slice(1)) assert.deepEqual(snapshotRows(db, name), [])
          if (count === 0) {
            schemaAfterUpgrade = definitions(db)
            ledgerAfterUpgrade = actual
          } else {
            assert.deepEqual(definitions(db), schemaAfterUpgrade)
            assert.deepEqual(actual, ledgerAfterUpgrade)
          }
          foreignKeys(db)
        })
        for (const endpoint of fixture.endpoints) assert.deepEqual(upgraded.knowledge.get(fixture.actor, endpoint.id), endpoint)
        assert.deepEqual(upgraded.knowledge.history(fixture.actor, fixture.endpoints[0].id), fixture.history)
        assert.equal(upgraded.citations.resolve(fixture.actor, fixture.citation.id).quote, fixture.quote)
      } finally { upgraded.close() }
    }
    pass('v38_exact_single_ledger_and_prior_knowledge_round_trip_after_reopen')

    const store = new fresh.ProbeStorage({ dataDir: dir })
    try {
      assert(store.available, causes(store.failure))
      const { actor, pair, citation } = fixture
      const key = randomUUID(), reviewKey = randomUUID()
      const pristine = relationRows()
      const verifyRollback = (label, operation, original) => {
        for (const clause of ['UPDATE OF current_version_id ON knowledge_relations', 'INSERT ON relation_write_receipts']) {
          sql('CREATE TRIGGER know003_abort BEFORE ' + clause + " BEGIN SELECT RAISE(ABORT,'v38 isolated atomicity fault'); END")
          try {
            assert.throws(operation, label + ' must abort when fault is enabled')
            assert.deepEqual(relationRows(), original, label + ' left row effects')
          } finally { sql('DROP TRIGGER know003_abort') }
        }
      }
      const create = () => store.ontology.create(actor, key, pair, 'solves')
      verifyRollback('create', create, pristine)
      const created = create(), first = created.relation
      assert.equal(created.replayed, false)
      assert.equal(first.revision, 1)
      assert.equal(first.state, 'proposed')
      assert.equal(first.from.version_id, fixture.endpoints[0].version_id)
      assert.equal(first.to.version_id, fixture.endpoints[1].version_id)
      assert.equal(first.evidence[0].quote_hash, citation.quote_hash)
      const afterCreate = relationRows()
      assert.equal(afterCreate.relation_versions.length, 1)
      assert.equal(afterCreate.relation_write_receipts.length, 1)
      assert.equal(afterCreate.knowledge_relations[0].current_version_id, first.version_id)
      assert.deepEqual(create(), { ...created, replayed: true })
      assert.throws(() => store.ontology.create(actor, key, pair, 'depends_on'), { code: 'IDEMPOTENCY_CONFLICT' })
      assert.deepEqual(relationRows(), afterCreate)
      pass('v38_create_pointer_and_receipt_faults_leave_no_rows_and_key_recovers')

      const review = () => store.ontology.review(actor, reviewKey, first.id, 1, 'confirm')
      verifyRollback('review', review, afterCreate)
      pass('v38_review_pointer_and_receipt_faults_preserve_original_version')

      const outcomes = await raceReview(newBundle, dir, actor, first.id)
      const winner = outcomes.find(outcome => outcome.result), loser = outcomes.find(outcome => outcome.code)
      assert(winner && loser)
      assert.equal(loser.code, 'REVISION_CONFLICT')
      assert.equal(winner.result.relation.revision, 2)
      assert.equal(winner.result.relation.review.actor_id, actor.userId)
      const afterReview = relationRows(), current = winner.result.relation
      assert.deepEqual(afterReview.relation_versions.find(row => row.revision === 1), afterCreate.relation_versions[0])
      assert.equal(afterReview.relation_versions.length, 2)
      assert.equal(afterReview.relation_write_receipts.length, 2)
      assert.equal(afterReview.knowledge_relations[0].current_version_id, current.version_id)
      assert.equal(afterReview.relation_write_receipts.find(row => row.request_key === winner.key).version_id, current.version_id)
      assert.deepEqual(store.ontology.review(actor, winner.key, first.id, 1, winner.action), { ...winner.result, replayed: true })
      assert.throws(() => store.ontology.review(actor, winner.key, first.id, 1, loser.action), { code: 'IDEMPOTENCY_CONFLICT' })
      assert.deepEqual(relationRows(), afterReview)
      pass('two_concurrent_review_connections_commit_one_revision_and_receipt')

      const corrected = store.ontology.review(actor, randomUUID(), first.id, 2, 'correct', { ...pair, relation_type: 'solves' })
      const afterCorrection = relationRows()
      assert.equal(corrected.relation.revision, 3)
      assert.equal(corrected.relation.state, 'proposed')
      assert.equal(corrected.relation.review.actor_id, actor.userId)
      assert.equal(afterCorrection.relation_versions.length, 3)
      assert.equal(afterCorrection.relation_write_receipts.length, 3)
      for (const original of afterReview.relation_versions) {
        assert.deepEqual(afterCorrection.relation_versions.find(row => row.id === original.id), original)
      }
      assert.equal(afterCorrection.knowledge_relations[0].current_version_id, corrected.relation.version_id)
      assert.deepEqual(read(db => contents(db, before.priorTables)), before.prior)
      pass('correction_appends_immutable_history_and_keeps_v37_rows')
    } finally { store.close() }
    proof.status = 'PASS'
    proof.exit_code = 0
  } catch (error) {
    proof.failure = causes(error).slice(0, 500)
    process.exitCode = 1
  } finally {
    const output = join(dirname(fileURLToPath(import.meta.url)), 'summary.json')
    writeFileSync(output, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ status: proof.status, checks: proof.results.map(result => result.id), isolated_db: dir, proof: output }))
  }
}

if (isMainThread) await main()
else await reviewWorker()
