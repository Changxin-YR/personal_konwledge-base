import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const priorCandidate = '1f02fb6aaaff975ab11100582ddc73e907099220'
const paths = {
  entry: 'packages/knowledgeos-panel/lib/index.js',
  bundle: 'packages/knowledgeos-panel/lib/test-support.js',
  storage: 'packages/knowledgeos-panel/lib/storage.js',
  decode: 'packages/knowledgeos-panel/src/host/text-document.ts',
}
const practiceTables = ['citations', 'citation_locators', 'questions', 'question_versions', 'practice_sessions',
  'practice_session_questions', 'practice_attempts', 'practice_attempt_receipts', 'quick_practice_runs', 'quick_practice_questions']
const sha = value => createHash('sha256').update(value).digest('hex')
const from = name => import(pathToFileURL(name).href)
const version = db => db.prepare('PRAGMA user_version').get().user_version
const foreignKeys = db => assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
const ledger = db => db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
const definitions = db => db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all()

function rows(db, table) {
  assert.match(table, /^[a-z][a-z0-9_]*$/)
  return db.prepare('SELECT * FROM "' + table + '"').all()
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

function contents(db, tables) {
  return Object.fromEntries(tables.map(table => [table, rows(db, table)]))
}

function withDb(file, readOnly, task) {
  const db = new DatabaseSync(file, { readOnly })
  try {
    db.exec(readOnly ? 'BEGIN' : 'PRAGMA busy_timeout=3000')
    return task(db)
  } finally { db.close() }
}

function failureChain(error) {
  const trace = []
  for (let node = error; node; node = node.cause) trace.push(node.message)
  return trace.join('\n')
}

function clip(text, target, quote) {
  const start = text.indexOf(quote)
  assert(start >= 0)
  return { spec: { ...target, start, end: start + quote.length, source_hash: sha(text) }, text: quote }
}

async function seed(prior, decodeText, dataDir) {
  assert.equal(prior.SCHEMA_VERSION, 39)
  const storage = new prior.ProbeStorage({ dataDir })
  const identity = new prior.IdentityService(storage)
  try {
    assert(storage.available, failureChain(storage.failure))
    const password = 'Synthetic v40 test passphrase!'
    await identity.bootstrap({ loginName: 'v40author', password, displayName: '离线资料作者' })
    await identity.register({ loginName: 'v40learner', password, displayName: '离线练习成员' })
    const author = identity.actor((await identity.login({ loginName: 'v40author', password, source: 'v40-offline' })).token)
    const learner = identity.actor((await identity.login({ loginName: 'v40learner', password, source: 'v40-offline' })).token)
    assert(author && learner && author.userId !== learner.userId)
    const project = storage.createProject({
      id: randomUUID(), serviceId: author.serviceId, ownerUserId: author.userId, name: '离线练习项目', now: new Date().toISOString(),
    })
    const quote = '离线采样使用三次读数的均值'
    const second = '校验阶段检查输入边界'
    const text = '🧪' + quote + '。' + second + '。本材料用于固定版本练习。'
    const sourceKey = randomUUID(), bytes = Buffer.from(text)
    const asset = storage.assets.publish(author, { title: '保留练习原始资料', key: sourceKey },
      { key: sourceKey, sha256: sha(bytes), byteLength: bytes.length },
      { media: 'text/markdown', ...decodeText(bytes, 'text/markdown') }).receipt
    const target = { asset_id: asset.id, version_id: asset.version_id, ordinal: 1 }
    const original = storage.citations.create(author, clip(text, target, quote).spec, randomUUID()).data
    const invitations = []
    for (const spec of [{ scope: 'project', id: project.id, permission: 'member' }, { scope: 'object', id: asset.id, permission: 'read' }]) {
      const invitation = storage.invitations.create(author, author.userId, spec, randomUUID())
      assert.equal(storage.invitations.redeem(learner, learner.userId, invitation.token).replayed, false)
      invitations.push(invitation)
    }
    storage.notes.create(author, author.userId, randomUUID(), { title: '保留旧笔记', kind: 'reading', body: '独立读数资料。' }, original.id)
    const knowledge = []
    for (const [kind, title] of [['solution', '取均值的方式'], ['case', '波动样本']]) {
      const drafted = storage.knowledge.create(author, randomUUID(), {
        kind, domain: 'software_engineering', title, definition: '采用三次读数平均值。', plain_explanation: '降低读数波动。',
        context: '', sources: [{ type: 'citation', id: original.id }],
      }).item
      knowledge.push(storage.knowledge.update(author, randomUUID(), drafted.id, drafted.version).item)
    }
    const relation = storage.ontology.create(author, randomUUID(), {
      from_id: knowledge[0].id, to_id: knowledge[1].id, evidence_citation_ids: [original.id],
    }, 'solves').relation
    const reviewed = storage.ontology.review(author, randomUUID(), relation.id, relation.revision, 'confirm').relation
    assert.equal(reviewed.state, 'confirmed')
    const authored = storage.practice.createQuestion(author, randomUUID(), {
      kind: 'judgment', prompt: '原材料要求使用三次读数的均值。', options: [],
      accepted: [true], explanation: '旧版本有明确陈述。', source_citation_id: original.id, project_id: project.id,
    }).question
    const session = storage.practice.createSession(learner, randomUUID(), [authored.version_id]).session
    const saved = storage.practice.submit(learner, randomUUID(), session.id, {
      question_version_id: authored.version_id, expected_sequence: 0, answer: false, confidence: 'sure',
    })
    assert.equal(saved.attempt.grading_state, 'incorrect')
    assert.equal(saved.attempt.independent, true)
    return { author, learner, target, text, quote, second, authored, session, saved, original, reviewed, project,
      sourceInvitation: invitations[1], oldPracticeView: storage.practice.questions(learner, session.id) }
  } finally {
    await identity.close()
    storage.close()
  }
}

function preserveLegacyProjection(storage, fixture) {
  const { author, learner, session, oldPracticeView, original, reviewed, quote } = fixture
  const output = storage.practice.questions(learner, session.id)
  assert.deepEqual(output.session, oldPracticeView.session)
  assert.equal(output.questions.length, 1)
  const { origin_kind, evaluation_eligible, quality_state, ...same } = output.questions[0]
  assert.deepEqual([origin_kind, evaluation_eligible, quality_state], ['author', true, 'ready'])
  same.attempts = same.attempts.map(({ evaluation_eligible, ...attempt }) => {
    assert.equal(evaluation_eligible, true)
    return attempt
  })
  assert.deepEqual(same, oldPracticeView.questions[0])
  assert.throws(() => storage.practice.questions(author, session.id), { code: 'PRACTICE_NOT_FOUND' })
  assert.deepEqual(storage.ontology.get(author, reviewed.id), reviewed)
  assert.equal(storage.citations.resolve(learner, original.id).quote, quote)
}

function makeRange(storage, fixture) {
  const { target, text, learner, quote, second } = fixture
  const anchor = clip(text, target, text)
  const selection = storage.citations.selection(learner, anchor.spec)
  assert.equal(selection.text, text)
  assert.equal(selection.quote_hash, sha(text))
  const coverage = {
    scope: 'paragraph', title: '保留练习原始资料', count: 2, first: 1, last: 1, section_first: 1, section_last: 1,
    included: [1], unavailable: [], clipped: false, slices: [{ ordinal:1, start:0, end:text.length }],
    return_href: '/knowledgeos/reader?' + new URLSearchParams({ asset:target.asset_id, version:target.version_id, unit:'1' }),
  }
  const pinned = { target, anchor, sources: [anchor], coverage, fingerprint: sha(JSON.stringify([target, coverage, anchor.spec])) }
  const drafts = [
    { source: clip(text, target, quote), prompt: '采样使用多少次读数？', options: ['三次', '两次', '六次'],
      answer: 1, explanation: '固定资料写明使用三次读数。', quality: 'ready' },
    { source: clip(text, target, second), prompt: '校验过程使用几级校验？', options: ['三次', '两次', '六次'],
      answer: 3, explanation: '示例候选没有足够依据，需要复核。', quality: 'needs_review' },
  ]
  storage.practice.checkQuick(learner, pinned)
  return { pinned, drafts }
}

async function main() {
  const [checkout, candidate, entry] = process.argv.slice(2)
  assert.match(candidate, /^[a-f0-9]{40}$/)
  assert.match(entry, /^[a-f0-9]{64}$/)
  const root = resolve(checkout)
  const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd:root })
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
  git('merge-base', '--is-ancestor', priorCandidate, candidate)
  for (const file of Object.values(paths)) assert.deepEqual(readFileSync(join(root, file)), git('show', candidate + ':' + file))
  assert.equal(sha(readFileSync(join(root, paths.entry))), entry)
  const dir = mkdtempSync(join(tmpdir(), 'kos-learn002-v40-'))
  const dbFile = join(dir, 'knowledgeos.sqlite'), priorPath = join(dir, 'frozen-v39.mjs')
  const priorBytes = git('show', priorCandidate + ':' + paths.bundle)
  writeFileSync(priorPath, priorBytes, { flag:'wx' })
  const proof = {
    unit_id: 'LEARN-002', candidate_sha: candidate, entry_sha256: entry, frozen_v39: priorCandidate,
    old_bundle_sha256: sha(priorBytes), test_support_sha256: sha(readFileSync(join(root, paths.bundle))),
    runner_sha256: sha(readFileSync(fileURLToPath(import.meta.url))), scope: 'INDEPENDENT_OFFLINE_V40_STORAGE',
    command: 'node --experimental-transform-types v40-regression.mjs <checkout> <candidate SHA> <entry SHA-256>',
    status: 'FAIL', exit_code: 1, real_inference_requests: 0, results: [],
  }
  const pass = (id, actual) => proof.results.push({ id, status:'PASS', actual })
  const read = task => withDb(dbFile, true, task)
  const sql = query => withDb(dbFile, false, db => db.exec(query))
  const state = () => read(db => { foreignKeys(db); return contents(db, practiceTables) })
  try {
    const prior = await from(priorPath), fresh = await from(join(root, paths.bundle))
    const { decodeText } = await from(join(root, paths.decode))
    const { MIGRATION_V40_CHECKSUM } = await from(join(root, paths.storage))
    assert.equal(fresh.SCHEMA_VERSION, 40)
    assert.match(MIGRATION_V40_CHECKSUM, /^[a-f0-9]{64}$/)
    const fixture = await seed(prior, decodeText, dir)
    const old = read(db => {
      assert.equal(version(db), 39)
      const schema = definitions(db)
      const tables = schema.filter(row => row.type === 'table' && !row.name.startsWith('sqlite_') && row.name !== 'schema_migrations')
        .map(row => row.name)
      const data = contents(db, tables)
      for (const name of practiceTables.slice(0, -2)) assert.equal(data[name].length, 1)
      assert.equal(data.relation_versions.length, 2)
      assert.equal(data.knowledge_versions.length, 4)
      foreignKeys(db)
      return { schema, tables, data, ledger:ledger(db) }
    })
    pass('populated_frozen_v39_practice_and_provenance', 'Exact v39 persisted an authored question and version, private learner attempt and receipt, original citation and locator, confirmed ontology and source permissions.')

    const interrupted = new fresh.ProbeStorage({ dataDir:dir, failureAt:'v40:after-schema' })
    try {
      assert(!interrupted.available)
      assert.match(failureChain(interrupted.failure), /v40:after-schema/)
    } finally { interrupted.close() }
    read(db => {
      assert.equal(version(db), 39)
      assert.deepEqual(definitions(db), old.schema)
      assert.deepEqual(ledger(db), old.ledger)
      assert.deepEqual(contents(db, old.tables), old.data)
      foreignKeys(db)
    })
    pass('post_schema_v40_fault_preserved_every_v39_row', 'Injected failure after v40 schema application left the exact v39 definitions, contents and ledger unchanged.')

    let v40Ledger
    for (let boot = 0; boot < 2; boot++) {
      const storage = new fresh.ProbeStorage({ dataDir:dir })
      try {
        assert(storage.available, failureChain(storage.failure))
        read(db => {
          assert.equal(version(db), 40)
          const current = ledger(db)
          assert.equal(current.length, 40)
          assert.deepEqual(current.slice(0, 39), old.ledger)
          assert.equal(current[39].version, 40)
          assert.equal(current[39].checksum, MIGRATION_V40_CHECKSUM)
          assert.deepEqual(contents(db, old.tables), old.data)
          for (const table of practiceTables.slice(-2)) assert.deepEqual(rows(db, table), [])
          if (v40Ledger) assert.deepEqual(current, v40Ledger)
          else v40Ledger = current
          foreignKeys(db)
        })
        preserveLegacyProjection(storage, fixture)
      } finally { storage.close() }
    }
    pass('one_v40_checksum_and_old_answer_round_trip', 'Two production storage opens gave a single correct v40 migration receipt. Legacy learner history and source-linked relation remained intact and private.')

    const storage = new fresh.ProbeStorage({ dataDir:dir })
    let newSession, savedView
    try {
      assert(storage.available, failureChain(storage.failure))
      const { author, learner, target, sourceInvitation } = fixture
      const { pinned, drafts } = makeRange(storage, fixture)
      const model = { provider:'offline-fixture', model:'injected-storage-dto' }
      const quickKey = randomUUID(), generate = () => storage.practice.saveQuick(learner, quickKey, pinned, drafts, model)
      const untouched = state()
      assert.equal(storage.practice.quickReplay(learner, quickKey, pinned), undefined)
      const abortRun = "CREATE TRIGGER test_quick_failure BEFORE INSERT ON quick_practice_runs WHEN NEW.session_id IS NOT NULL AND (SELECT COUNT(*) FROM practice_session_questions WHERE session_id=NEW.session_id)=2 BEGIN SELECT RAISE(ABORT,'synthetic quick run fault after session'); END"
      const abortMetadata = "CREATE TRIGGER test_quick_failure BEFORE INSERT ON quick_practice_questions WHEN EXISTS(SELECT 1 FROM quick_practice_questions WHERE session_id=NEW.session_id) BEGIN SELECT RAISE(ABORT,'synthetic second metadata fault'); END"
      for (const trigger of [abortRun, abortMetadata]) {
        sql(trigger)
        try {
          assert.throws(generate)
          assert.deepEqual(state(), untouched)
          assert.equal(storage.practice.quickReplay(learner, quickKey, pinned), undefined)
          assert.deepEqual(storage.practice.listSessions(learner).map(row => row.id), [fixture.session.id])
        } finally { sql('DROP TRIGGER test_quick_failure') }
      }
      pass('quick_run_or_second_metadata_abort_rolls_back_entire_batch', 'Fault after both session-version pins, then separately at second quality row, left no generated citations, locators, questions, versions, sessions, metadata or idempotency receipt.')

      const saved = generate(), afterRun = state()
      assert.equal(saved.status, 'ready')
      assert.equal(saved.replayed, false)
      newSession = saved.session.id
      assert.equal(afterRun.citations.length - untouched.citations.length, 3)
      assert.equal(afterRun.citation_locators.length - untouched.citation_locators.length, 3)
      for (const table of ['questions','question_versions','practice_session_questions','quick_practice_questions']) {
        assert.equal(afterRun[table].length - untouched[table].length, 2)
      }
      assert.equal(afterRun.practice_sessions.length - untouched.practice_sessions.length, 1)
      assert.equal(afterRun.quick_practice_runs.length, 1)
      assert.equal(afterRun.quick_practice_runs[0].session_id, newSession)
      assert.equal(afterRun.quick_practice_runs[0].request_key, quickKey)
      assert.equal(afterRun.quick_practice_runs[0].fingerprint, pinned.fingerprint)
      assert.deepEqual(afterRun.practice_attempts, untouched.practice_attempts)
      assert.deepEqual(afterRun.practice_attempt_receipts, untouched.practice_attempt_receipts)
      assert.deepEqual(generate(), { ...saved, replayed:true })
      assert.deepEqual(storage.practice.quickReplay(learner, quickKey, pinned), { ...saved, replayed:true })
      const changed = { ...pinned, fingerprint:sha('changed preview fingerprint') }
      assert.throws(() => storage.practice.saveQuick(learner, quickKey, changed, drafts, model), { code:'IDEMPOTENCY_CONFLICT' })
      assert.deepEqual(state(), afterRun)
      assert.equal(new URL(saved.coverage.return_href, 'http://127.0.0.1').searchParams.get('version'), target.version_id)
      pass('generated_batch_reused_same_key_without_any_duplicate', 'A single recovery committed two question-version pins plus actual quote citations, one session and one run receipt. Matching key replay returned that exact session and a changed fingerprint was rejected.')

      const view = storage.practice.questions(learner, newSession)
      assert.throws(() => storage.practice.questions(author, newSession), { code:'PRACTICE_NOT_FOUND' })
      for (const [index, question] of view.questions.entries()) {
        assert.equal(question.origin_kind, 'generated')
        assert.equal(question.quality_state, drafts[index].quality)
        assert.equal(question.evaluation_eligible, false)
        assert.deepEqual(question.attempts, [])
        assert.equal(question.feedback, null)
        assert.throws(() => storage.practice.authored(learner, question.id), { code:'QUESTION_NOT_FOUND' })
        const graded = storage.practice.submit(learner, randomUUID(), newSession, {
          question_version_id:question.version_id, expected_sequence:0, answer:drafts[index].answer, confidence:'sure',
        })
        assert.equal(graded.attempt.independent, true)
        assert.equal(graded.attempt.evaluation_eligible, false)
        assert.equal(graded.feedback.evidence.quote_hash, sha(drafts[index].source.text))
        assert.equal(storage.citations.resolve(learner, graded.feedback.evidence.id).quote, drafts[index].source.text)
      }
      const beforeInsufficient = state()
      const insufficientKey = randomUUID()
      const insufficient = storage.practice.saveQuick(learner, insufficientKey, pinned, [])
      assert.equal(insufficient.status, 'insufficient')
      assert.equal('session' in insufficient, false)
      const afterInsufficient = state()
      assert.equal(afterInsufficient.quick_practice_runs.length, beforeInsufficient.quick_practice_runs.length + 1)
      assert.equal(afterInsufficient.quick_practice_runs.find(row => row.request_key === insufficientKey).session_id, null)
      for (const table of practiceTables.filter(name => name !== 'quick_practice_runs')) {
        assert.deepEqual(afterInsufficient[table], beforeInsufficient[table])
      }
      assert.deepEqual(storage.practice.quickReplay(learner, insufficientKey, pinned), { ...insufficient, replayed:true })
      savedView = storage.practice.questions(learner, newSession)
      read(db => {
        const now = contents(db, old.tables)
        for (const table of old.tables) {
          const current = new Set(now[table].map(row => JSON.stringify(row)))
          for (const oldRow of old.data[table]) assert(current.has(JSON.stringify(oldRow)), 'v39 row did not survive: ' + table)
        }
      })
      pass('quality_gate_insufficient_receipt_and_old_rows_unchanged', 'Generated first answers were gated and excluded from formal evaluation even on correct rows. Insufficiency recorded only a replayable null-session receipt; every previous v39 row remained intact.')
      preserveLegacyProjection(storage, fixture)
    } finally { storage.close() }

    const reopened = new fresh.ProbeStorage({ dataDir:dir })
    try {
      assert(reopened.available, failureChain(reopened.failure))
      assert.deepEqual(reopened.practice.questions(fixture.learner, newSession), savedView)
      assert.deepEqual(read(ledger), v40Ledger)
      const { pinned, drafts } = makeRange(reopened, fixture)
      const grant = reopened.invitations.get(fixture.author, fixture.author.userId, fixture.sourceInvitation.id)
      reopened.invitations.change(fixture.author, fixture.author.userId, grant.id, grant.revision, 'revoke')
      const blocked = state()
      assert.throws(() => reopened.practice.saveQuick(fixture.learner, randomUUID(), pinned, drafts, { provider:'offline-fixture', model:'injected-storage-dto' }),
        { code:'SOURCE_NOT_FOUND' })
      assert.throws(() => reopened.practice.questions(fixture.learner, newSession), { code:'QUESTION_NOT_FOUND' })
      assert.deepEqual(state(), blocked)
    } finally { reopened.close() }
    pass('durable_generated_history_and_revoked_source_blocks_commit', 'A new connection read the exact generated history before revocation. A source revoked after the range check blocked both the existing view and a subsequent batch commit.')
    proof.status = 'PASS'
    proof.exit_code = 0
  } catch (error) {
    proof.failure = failureChain(error).slice(0, 800)
    process.exitCode = 1
  } finally {
    const output = join(dir, 'summary.json')
    writeFileSync(output, JSON.stringify(proof, null, 2) + '\n', { flag:'wx' })
    console.log(JSON.stringify({ status:proof.status, checks:proof.results.length, proof:output }))
  }
}

await main()
