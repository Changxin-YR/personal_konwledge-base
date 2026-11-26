import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'

const frozenV38 = '0517de9ab7a3799d3ce8463db9de068257c5c41c'
const paths = {
  entry: 'packages/knowledgeos-panel/lib/index.js',
  bundle: 'packages/knowledgeos-panel/lib/test-support.js',
  storage: 'packages/knowledgeos-panel/lib/storage.js',
  decode: 'packages/knowledgeos-panel/src/host/text-document.ts',
}
const practiceTables = ['questions', 'question_versions', 'practice_sessions', 'practice_session_questions',
  'practice_attempts', 'practice_attempt_receipts']
const digest = value => createHash('sha256').update(value).digest('hex')
const importPath = name => import(pathToFileURL(name).href)
const dbVersion = db => db.prepare('PRAGMA user_version').get().user_version
const foreignKeys = db => assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
const ledger = db => db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
const definitions = db => db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all()
const key = () => randomUUID()

function tableRows(db, table) {
  assert.match(table, /^[a-z][a-z0-9_]*$/)
  return db.prepare('SELECT * FROM "' + table + '"').all()
    .sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)))
}

function contents(db, tables) {
  return Object.fromEntries(tables.map(table => [table, tableRows(db, table)]))
}

function usingDb(file, readOnly, task) {
  const db = new DatabaseSync(file, { readOnly })
  try {
    db.exec(readOnly ? 'BEGIN' : 'PRAGMA busy_timeout=3000')
    return task(db)
  } finally { db.close() }
}

function errorTrace(error) {
  const trace = []
  for (let current = error; current; current = current.cause) trace.push(current.message)
  return trace.join('\n')
}

async function seedV38(older, decodeText, dir) {
  assert.equal(older.SCHEMA_VERSION, 38)
  const storage = new older.ProbeStorage({ dataDir: dir })
  const identity = new older.IdentityService(storage)
  try {
    assert(storage.available, errorTrace(storage.failure))
    const password = 'Synthetic v39 test passphrase!'
    await identity.bootstrap({ loginName: 'v39author', password, displayName: '离线作者' })
    await identity.register({ loginName: 'v39learner', password, displayName: '离线练习者' })
    const author = identity.actor((await identity.login({ loginName: 'v39author', password, source: 'v39-offline' })).token)
    const learner = identity.actor((await identity.login({ loginName: 'v39learner', password, source: 'v39-offline' })).token)
    assert(author && learner && author.userId !== learner.userId)

    const project = storage.createProject({
      id: key(), serviceId: author.serviceId, ownerUserId: author.userId, name: '离线练习项目', now: new Date().toISOString(),
    })
    const text = '🧪离线采样使用三次读数的均值。固定材料练习 V38。'
    const quote = '采样使用三次读数的均值'
    const bytes = Buffer.from(text), sourceKey = key()
    const asset = storage.assets.publish(author, { title: 'v38-practice-source.md', key: sourceKey },
      { key: sourceKey, sha256: digest(bytes), byteLength: bytes.length },
      { media: 'text/markdown', ...decodeText(bytes, 'text/markdown') }).receipt
    const position = text.indexOf(quote)
    const citation = storage.citations.create(author, {
      asset_id: asset.id, version_id: asset.version_id, ordinal: 1,
      start: position, end: position + quote.length, source_hash: digest(text),
    }, key()).data
    storage.notes.create(author, author.userId, key(), { title: '离线保留笔记', kind: 'reading', body: '保留引用与读数。' }, citation.id)
    for (const spec of [
      { scope: 'project', id: project.id, permission: 'member' },
      { scope: 'object', id: asset.id, permission: 'read' },
    ]) {
      const invitation = storage.invitations.create(author, author.userId, spec, key())
      assert.equal(storage.invitations.redeem(learner, learner.userId, invitation.token).replayed, false)
    }
    assert.equal(storage.citations.resolve(learner, citation.id).quote, quote)

    const endpoints = []
    for (const [kind, title] of [['solution', '均值降噪'], ['case', '模拟噪声读数']]) {
      const { item } = storage.knowledge.create(author, key(), {
        kind, domain: 'software_engineering', title, definition: '采用三次采样平均值。',
        plain_explanation: '减少瞬时波动。', context: '', sources: [{ type: 'citation', id: citation.id }],
      })
      endpoints.push(storage.knowledge.update(author, key(), item.id, 1).item)
    }
    const pair = { from_id: endpoints[0].id, to_id: endpoints[1].id, evidence_citation_ids: [citation.id] }
    const relation = storage.ontology.create(author, key(), pair, 'solves').relation
    const reviewed = storage.ontology.review(author, key(), relation.id, relation.revision, 'confirm').relation
    assert.equal(reviewed.state, 'confirmed')
    return { author, learner, project, citation, quote, endpoints, reviewed, history: storage.ontology.history(author, relation.id) }
  } finally {
    await identity.close()
    storage.close()
  }
}

async function concurrentSubmit(bundle, dir, actor, sessionId, versionId) {
  const barrier = new SharedArrayBuffer(4), signal = new Int32Array(barrier)
  const workers = [], operations = []
  let ready = 0
  try {
    for (const answer of [1, 3]) {
      const input = { question_version_id: versionId, expected_sequence: 1, answer, confidence: 'sure' }
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { bundle, dir, actor, sessionId, input, barrier, requestKey: key() },
      })
      workers.push(worker)
      operations.push(new Promise((done, reject) => {
        let reported = false
        worker.on('message', message => {
          if (message.ready) {
            if (++ready === 2) {
              Atomics.store(signal, 0, 1)
              Atomics.notify(signal, 0, 2)
            }
          } else {
            reported = true
            done(message)
          }
        })
        worker.once('error', reject)
        worker.once('exit', code => { if (!reported) reject(Error('attempt worker exited before a result, code ' + code)) })
      }))
    }
    return await Promise.all(operations)
  } finally { await Promise.all(workers.map(worker => worker.terminate())) }
}

async function submitWorker() {
  const { bundle, dir, actor, sessionId, input, barrier, requestKey } = workerData
  const { ProbeStorage } = await importPath(bundle)
  const storage = new ProbeStorage({ dataDir: dir })
  try {
    assert(storage.available, errorTrace(storage.failure))
    const signal = new Int32Array(barrier)
    parentPort.postMessage({ ready: true })
    assert.notEqual(Atomics.wait(signal, 0, 0, 12000), 'timed-out')
    try {
      const result = storage.practice.submit(actor, requestKey, sessionId, input)
      parentPort.postMessage({ input, requestKey, result })
    } catch (error) {
      parentPort.postMessage({ input, requestKey, errorCode: error.code ?? 'NO_CODE' })
    }
  } finally { storage.close() }
}

async function main() {
  const [checkout, candidate, entry] = process.argv.slice(2)
  assert.match(candidate, /^[a-f0-9]{40}$/)
  assert.match(entry, /^[a-f0-9]{64}$/)
  const root = resolve(checkout)
  const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
  git('merge-base', '--is-ancestor', frozenV38, candidate)
  for (const file of Object.values(paths)) assert.deepEqual(readFileSync(join(root, file)), git('show', candidate + ':' + file))
  assert.equal(digest(readFileSync(join(root, paths.entry))), entry)

  const dir = mkdtempSync(join(tmpdir(), 'kos-learn001-v39-'))
  const dbFile = join(dir, 'knowledgeos.sqlite')
  const priorPath = join(dir, 'frozen-v38.mjs'), newBundle = join(root, paths.bundle)
  const oldBytes = git('show', frozenV38 + ':' + paths.bundle)
  writeFileSync(priorPath, oldBytes, { flag: 'wx' })
  const proof = {
    unit_id: 'LEARN-001', candidate_sha: candidate, entry_sha256: entry, frozen_v38: frozenV38,
    old_bundle_sha256: digest(oldBytes), test_support_sha256: digest(readFileSync(newBundle)),
    runner_sha256: digest(readFileSync(fileURLToPath(import.meta.url))), scope: 'INDEPENDENT_OFFLINE_V39_STORAGE',
    command: 'node --experimental-transform-types v39-regression.mjs <checkout> <candidate SHA> <entry SHA-256>',
    status: 'FAIL', exit_code: 1, real_inference_requests: 0, results: [],
  }
  const pass = (id, actual) => proof.results.push({ id, status: 'PASS', actual })
  const read = task => usingDb(dbFile, true, task)
  const sql = query => usingDb(dbFile, false, db => db.exec(query))
  const practiceRows = () => read(db => { foreignKeys(db); return contents(db, practiceTables) })
  try {
    const older = await importPath(priorPath), fresh = await importPath(newBundle)
    const { decodeText } = await importPath(join(root, paths.decode))
    const { MIGRATION_V39_CHECKSUM } = await importPath(join(root, paths.storage))
    assert.equal(fresh.SCHEMA_VERSION, 39)
    assert.match(MIGRATION_V39_CHECKSUM, /^[a-f0-9]{64}$/)
    const fixture = await seedV38(older, decodeText, dir)
    const before = read(db => {
      assert.equal(dbVersion(db), 38)
      const schema = definitions(db)
      const names = schema.filter(row => row.type === 'table' && !row.name.startsWith('sqlite_') && row.name !== 'schema_migrations')
        .map(row => row.name)
      const data = contents(db, names)
      assert.equal(data.knowledge_relations.length, 1)
      assert.equal(data.relation_versions.length, 2)
      assert.equal(data.relation_write_receipts.length, 2)
      assert.equal(data.knowledge_items.length, 2)
      assert.equal(data.knowledge_versions.length, 4)
      assert.equal(data.knowledge_write_receipts.length, 4)
      assert.equal(data.citations.length, 1)
      assert.equal(data.notes.length, 1)
      foreignKeys(db)
      return { schema, names, data, ledger: ledger(db) }
    })
    pass('v38_exact_populated_workflow_baseline', 'Production v38 created a confirmed relation with version history, pinned citation, knowledge records, note, project membership and redeemed source access.')

    const failing = new fresh.ProbeStorage({ dataDir: dir, failureAt: 'v39:after-schema' })
    try {
      assert(!failing.available)
      assert.match(errorTrace(failing.failure), /v39:after-schema/)
    } finally { failing.close() }
    read(db => {
      assert.equal(dbVersion(db), 38)
      assert.deepEqual(definitions(db), before.schema)
      assert.deepEqual(ledger(db), before.ledger)
      assert.deepEqual(contents(db, before.names), before.data)
      foreignKeys(db)
    })
    pass('v39_injected_post_schema_failure_preserved_v38', 'After the real v39 schema fault, the exact v38 schema, 38 ledger rows and every pre-existing table were unchanged.')

    let verified
    for (let boot = 0; boot < 2; boot++) {
      const upgraded = new fresh.ProbeStorage({ dataDir: dir })
      try {
        assert(upgraded.available, errorTrace(upgraded.failure))
        read(db => {
          const current = ledger(db)
          assert.equal(dbVersion(db), 39)
          assert.equal(current.length, 39)
          assert.deepEqual(current.slice(0, 38), before.ledger)
          assert.equal(current[38].version, 39)
          assert.equal(current[38].checksum, MIGRATION_V39_CHECKSUM)
          assert.deepEqual(contents(db, before.names), before.data)
          for (const table of practiceTables) assert.deepEqual(tableRows(db, table), [])
          const state = { schema: definitions(db), ledger: current }
          if (verified) assert.deepEqual(state, verified)
          else verified = state
          foreignKeys(db)
        })
        assert.deepEqual(upgraded.ontology.get(fixture.author, fixture.reviewed.id), fixture.reviewed)
        assert.deepEqual(upgraded.ontology.history(fixture.author, fixture.reviewed.id), fixture.history)
        for (const endpoint of fixture.endpoints) assert.deepEqual(upgraded.knowledge.get(fixture.author, endpoint.id), endpoint)
        assert.equal(upgraded.citations.resolve(fixture.learner, fixture.citation.id).quote, fixture.quote)
      } finally { upgraded.close() }
    }
    pass('v39_single_checksum_receipt_and_v38_round_trip', 'Two successful opens produced one correct v39 ledger record, with prior relation, knowledge and citation projections intact.')

    let savedPractice
    const storage = new fresh.ProbeStorage({ dataDir: dir })
    try {
      assert(storage.available, errorTrace(storage.failure))
      const { author, learner, project, citation } = fixture
      const question = storage.practice.createQuestion(author, key(), {
        kind: 'choice', prompt: '固定材料说明采用哪种聚合方式？',
        options: ['均值', '最小值', '最大值'], accepted: [1],
        explanation: '来源明确记载使用三次采样的均值。', source_citation_id: citation.id, project_id: project.id,
      }).question
      const versionId = question.version_id
      assert(storage.practice.catalog(learner).questions.some(item => item.version_id === versionId))
      assert.throws(() => storage.practice.authored(learner, question.id), { code: 'QUESTION_NOT_FOUND' })
      const session = storage.practice.createSession(learner, key(), [versionId]).session
      const first = { question_version_id: versionId, expected_sequence: 0, answer: 2, confidence: 'unsure' }
      const firstKey = key(), sendFirst = () => storage.practice.submit(learner, firstKey, session.id, first)
      const untouched = practiceRows()
      const locked = storage.practice.questions(learner, session.id).questions[0]
      assert.deepEqual(locked.attempts, [])
      assert.equal(locked.feedback, null)
      const abortAttempt = "CREATE TRIGGER learn001_abort BEFORE INSERT ON practice_attempts BEGIN SELECT RAISE(ABORT,'synthetic attempt fault'); END"
      const abortReceipt = "CREATE TRIGGER learn001_abort BEFORE INSERT ON practice_attempt_receipts BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM practice_attempts WHERE id=NEW.attempt_id) THEN RAISE(ABORT,'synthetic receipt fault after attempt') ELSE RAISE(ABORT,'receipt missing its attempt') END; END"
      for (const trigger of [abortAttempt, abortReceipt]) {
        sql(trigger)
        try {
          assert.throws(sendFirst)
          assert.deepEqual(practiceRows(), untouched)
          assert.deepEqual(storage.practice.questions(learner, session.id).questions[0], locked)
        } finally { sql('DROP TRIGGER learn001_abort') }
      }
      pass('failed_attempt_and_receipt_transactions_release_no_feedback', 'Faults at the attempt insert and after that insert left both tables unchanged; the official learner projection returned no feedback or attempted answer.')

      const saved = sendFirst(), afterFirst = practiceRows()
      assert.equal(saved.replayed, false)
      assert.equal(saved.attempt.sequence, 1)
      assert.equal(saved.attempt.answer, 2)
      assert.equal(saved.attempt.grading_state, 'incorrect')
      assert.equal(saved.attempt.independent, true)
      assert.equal(saved.feedback.accepted_answer, 1)
      assert.equal(saved.feedback.evidence.quote_hash, citation.quote_hash)
      assert.equal(afterFirst.practice_attempts.length, 1)
      assert.equal(afterFirst.practice_attempt_receipts.length, 1)
      assert.equal(afterFirst.practice_attempt_receipts[0].attempt_id, saved.attempt.id)
      assert.deepEqual(sendFirst(), { ...saved, replayed: true })
      assert.throws(() => storage.practice.submit(learner, firstKey, session.id, { ...first, answer: 1 }), { code: 'IDEMPOTENCY_CONFLICT' })
      assert.throws(() => storage.practice.submit(learner, key(), session.id, first), { code: 'ATTEMPT_SEQUENCE_CONFLICT' })
      assert.deepEqual(practiceRows(), afterFirst)
      pass('first_commit_binds_feedback_and_exactly_one_idempotent_receipt', 'The same request key succeeded after rollback, returned the stored first answer and pinned feedback, replayed without changes and rejected a changed payload and stale sequence.')

      const outcomes = await concurrentSubmit(newBundle, dir, learner, session.id, versionId)
      const winner = outcomes.find(outcome => outcome.result), loser = outcomes.find(outcome => outcome.errorCode)
      assert(winner && loser)
      assert.equal(loser.errorCode, 'ATTEMPT_SEQUENCE_CONFLICT')
      assert.equal(winner.result.attempt.sequence, 2)
      assert.equal(winner.result.attempt.independent, false)
      const afterRace = practiceRows()
      assert.equal(afterRace.practice_attempts.length, 2)
      assert.equal(afterRace.practice_attempt_receipts.length, 2)
      assert.deepEqual(afterRace.practice_attempts.find(row => row.id === saved.attempt.id), afterFirst.practice_attempts[0])
      assert.equal(afterRace.practice_attempt_receipts.find(row => row.request_key === winner.requestKey).attempt_id, winner.result.attempt.id)
      assert(!afterRace.practice_attempt_receipts.some(row => row.request_key === loser.requestKey))
      assert.deepEqual(storage.practice.submit(learner, winner.requestKey, session.id, winner.input), { ...winner.result, replayed: true })
      assert.deepEqual(storage.practice.questions(learner, session.id).questions[0].attempts, [saved.attempt, winner.result.attempt])
      assert.throws(() => storage.practice.questions(author, session.id), { code: 'PRACTICE_NOT_FOUND' })
      assert.deepEqual(practiceRows(), afterRace)
      assert.deepEqual(read(db => contents(db, before.names)), before.data)
      savedPractice = { owner: learner, outsider: author, sessionId: session.id, rows: afterRace,
        view: storage.practice.questions(learner, session.id) }
      pass('two_sqlite_connections_one_winner_and_immutable_first_attempt', 'Two worker connections started from sequence 1. One stored the follow-up with a matching receipt, the other hit a sequence conflict and left no row. The first answer and all v38 data remained unchanged.')
    } finally { storage.close() }

    const reopened = new fresh.ProbeStorage({ dataDir: dir })
    try {
      assert(reopened.available, errorTrace(reopened.failure))
      assert.deepEqual(reopened.practice.questions(savedPractice.owner, savedPractice.sessionId), savedPractice.view)
      assert.throws(() => reopened.practice.questions(savedPractice.outsider, savedPractice.sessionId), { code: 'PRACTICE_NOT_FOUND' })
      assert.deepEqual(practiceRows(), savedPractice.rows)
      assert.deepEqual(read(ledger), verified.ledger)
    } finally { reopened.close() }
    pass('v39_practice_history_and_receipts_survive_reopen', 'A new storage instance read the same owning user history; the author could not read it and rows and ledger were unchanged.')
    proof.status = 'PASS'
    proof.exit_code = 0
  } catch (error) {
    proof.failure = errorTrace(error).slice(0, 700)
    process.exitCode = 1
  } finally {
    const output = join(dir, 'summary.json')
    writeFileSync(output, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ status: proof.status, checks: proof.results.length, proof: output }))
  }
}

if (isMainThread) await main()
else await submitWorker()
