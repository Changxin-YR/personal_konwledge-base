// Run from any worktree. All fixtures, SQLite files and the JSON report go under OS temp.
// node v43-regression.mjs --baseline <local checkout>
// node v43-regression.mjs <frozen checkout> <full candidate commit> [index.js SHA-256]
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const V42 = '0649220a90acdbc29b9f0853ba5a1e67a9538e4b'
const panel = 'packages/knowledgeos-panel'
const files = { entry: `${panel}/lib/index.js`, support: `${panel}/lib/test-support.js`, storage: `${panel}/lib/storage.js` }
const preferences = 'term_card_preferences', origins = 'term_practice_origins'
const dbName = 'knowledgeos.sqlite'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const digest = value => sha(JSON.stringify(value, (_, item) => item instanceof Uint8Array ? { blob: Buffer.from(item).toString('hex') } : item))
const message = error => [error?.message, error?.cause && message(error.cause)].filter(Boolean).join(' / ')
const load = path => import(pathToFileURL(path).href)
const id = randomUUID
const writeChecks = []

function connection(dir, readOnly, action) {
  const db = new DatabaseSync(join(dir, dbName), { readOnly, enableForeignKeyConstraints: true })
  try { return action(db) } finally { db.close() }
}

// One SQLite read transaction per snapshot. Include all columns, duplicate rows, DDL and ledger timestamps.
// Keep only row fingerprints for comparisons so identity rows never appear in test diagnostics.
function snapshot(db) {
  db.exec('BEGIN')
  try {
    const schema = db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all()
    const rows = Object.create(null)
    for (const { name, type } of schema) {
      if (type !== 'table') continue
      const quoted = '"' + name.replaceAll('"', '""') + '"'
      rows[name] = db.prepare(`SELECT * FROM ${quoted}`).all().map(digest).sort()
    }
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')
    return { app: db.prepare('PRAGMA application_id').get().application_id,
      version: db.prepare('PRAGMA user_version').get().user_version, schema, rows,
      ledger: db.prepare('SELECT * FROM schema_migrations ORDER BY version').all() }
  } finally { db.exec('ROLLBACK') }
}
const state = dir => connection(dir, true, snapshot)
const sql = (dir, text) => connection(dir, false, db => db.exec(text))
const query = (dir, text, ...params) => connection(dir, true, db => db.prepare(text).all(...params).map(row => ({ ...row })))

// The observer stays connected across the operation. data_version also detects intervening commits
// that rewrite data and restore its original values. SQLite failures must leave this connection clean.
function unchanged(dir, name, action) {
  return connection(dir, true, db => {
    const before = snapshot(db), revision = () => db.prepare('PRAGMA data_version').get().data_version
    const initial = revision()
    try { return action() } finally {
      const after = snapshot(db), final = revision()
      writeChecks.push({ operation: name, before_sha256: digest(before), after_sha256: digest(after), data_version: [initial, final] })
      assert.deepEqual(after, before, `${name} changed SQLite contents`)
      assert.equal(final, initial, `${name} committed a write`)
    }
  })
}

function rejected(dir, name, action, allowed) {
  unchanged(dir, name, () => assert.throws(action, error => allowed.includes(error.code) || allowed.includes(error.status), name))
}
function hidden(dir, name, read, empty) {
  unchanged(dir, name, () => {
    let result
    try { result = read() } catch (error) { assert([403, 404].includes(error.status), `${name}: ${error.code ?? error}`); return }
    assert(empty(result), `${name} exposed protected data`)
  })
}
function onlyChanged(before, after, allowed) {
  assert.deepEqual(after.schema, before.schema)
  assert.deepEqual(after.ledger, before.ledger)
  assert.deepEqual([after.app, after.version], [before.app, before.version])
  for (const table of Object.keys(before.rows)) {
    if (!allowed.includes(table)) assert.deepEqual(after.rows[table], before.rows[table], `unexpected change in ${table}`)
  }
}
function storage(module, dir) {
  const store = new module.ProbeStorage({ dataDir: dir })
  if (!store.available) { const why = message(store.failure); store.close(); assert.fail(why || 'storage unavailable') }
  return store
}
function incompatibleOpen(module, dir) {
  const store = new module.ProbeStorage({ dataDir: dir })
  try {
    assert.equal(store.available, false)
    assert.equal(store.failure?.code, 'STORAGE_INCOMPATIBLE')
  } finally { store.close() }
}
function failedOpen(module, dir) {
  unchanged(dir, 'rejected open', () => incompatibleOpen(module, dir))
}
// Attach a connection-local fault to the actual SQLite writer. A persistent trigger would change
// the v42 schema and cause an early rejection. The scalar observes staged DDL inside the transaction.
function abortLedgerInsert(module, dir, version, tables) {
  const exec = DatabaseSync.prototype.exec, attached = new WeakSet()
  let staged
  DatabaseSync.prototype.exec = function (text) {
    if (!attached.has(this) && /^\s*BEGIN\b/i.test(text) && this.prepare('PRAGMA user_version').get().user_version === version - 1) {
      attached.add(this)
      this.function('qa_observe_ddl', count => { staged = Number(count); return null })
      const names = tables.map(name => { assert.match(name, /^[a-z_]+$/); return "'" + name + "'" }).join(',')
      exec.call(this, `CREATE TEMP TRIGGER qa_reject_ledger BEFORE INSERT ON main.schema_migrations WHEN NEW.version=${version}
        BEGIN SELECT qa_observe_ddl((SELECT count(*) FROM main.sqlite_schema WHERE type='table' AND name IN (${names})));
          SELECT RAISE(ABORT,'synthetic late migration fault'); END`)
    }
    return exec.call(this, text)
  }
  try { incompatibleOpen(module, dir) } finally { DatabaseSync.prototype.exec = exec }
  assert.equal(staged, tables.length, 'the real ledger insert must see all new tables before SQLite aborts')
}
async function copyDatabase(dir, destination) {
  mkdirSync(destination)
  const db = new DatabaseSync(join(dir, dbName), { readOnly: true })
  try { await backup(db, join(destination, dbName)) } finally { db.close() }
}
async function damagedCopy(module, dir, destination, damage) {
  await copyDatabase(dir, destination)
  sql(destination, damage)
  failedOpen(module, destination)
}
function fault(dir, table, events, action) {
  for (const event of events) sql(dir, `CREATE TRIGGER qa_v43_${event} AFTER ${event} ON ${table}
    BEGIN SELECT RAISE(ABORT,'LEARN-006 synthetic late write fault'); END`)
  try { rejected(dir, `${table} ${events.join('/')} fault`, action, [503]) }
  finally { for (const event of events) sql(dir, `DROP TRIGGER qa_v43_${event}`) }
}

const word = '索引'
const dbLine = '🧪 数据库索引用来检索。此处的索引指检索结构。\n'
const arrayLine = '🧮 数组索引指元素的位置。\n'
const body = [dbLine, '\n', dbLine, '\n', arrayLine].join('')
const originalNote = '甲保存时的说明', editedNote = '甲后来核对的说明', peerNote = '乙自己的说明'

function publish(store, author, decodeText, text, earlier) {
  const bytes = Buffer.from(text), key = id()
  return store.assets.publish(author, { key, title: '合成索引材料', ...(earlier && { assetId: earlier.id, expectedVersion: earlier.version }) },
    { key, sha256: sha(bytes), byteLength: bytes.length }, { media: 'text/markdown', ...decodeText(bytes, 'text/markdown') }).receipt
}
function select(asset, ordinal, line, start) {
  return { asset_id: asset.id, version_id: asset.version_id, ordinal, source_hash: sha(line), start, end: start + word.length }
}
function grant(store, author, learner, target) {
  const invitation = store.invitations.create(author, author.userId, target, id())
  assert.equal(store.invitations.redeem(learner, learner.userId, invitation.token).replayed, false)
  return invitation.id
}
function question(store, author, project, selection, prompt, witness) {
  const citation = store.citations.create(author, selection, id(), witness).data
  const draft = { kind: 'judgment', prompt, options: [], accepted: [true], explanation: '按固定版本的合成材料判断。',
    source_citation_id: citation.id, project_id: project }
  return { ...store.practice.createQuestion(author, id(), draft).question, citation }
}
function input(version, expected_sequence, answer) {
  return { question_version_id: version, expected_sequence, answer, confidence: 'sure' }
}
function saveCard(store, actor, spec, supplement, context, witness) {
  const { source } = store.terms.selection(actor, spec, witness)
  assert.equal(source.quote, word)
  const card = { explanation_id: id(), term: word, source, provider: 'offline-fixture', model: 'handwritten',
    explanation: { context, plain: context, professional: `${context}的固定定义`,
      confusions: [{ term: '另一语境', distinction: '位置编号与检索结构不同' }], uncertainty: '' } }
  const result = store.terms.save(actor, card, supplement, witness)
  assert.equal(result.replayed, false)
  return { card, saved: result.term, supplement, id: result.term.id }
}

// Storage-level Word witness fixtures. The two ready conversion rows describe identical page content.
// The conversion UUID is the only difference between the two fixed selections. No renderer is launched.
function seedConversions(store, author) {
  const blob = content => ({ key: id(), sha256: sha(content), byteLength: Buffer.byteLength(content) })
  const original = blob('synthetic office source'), page = blob('synthetic rendered page')
  const asset = store.assets.publish(author, { key: id(), title: '转换对照材料' }, original, { media: 'application/msword' }).receipt
  function conversion() {
    const job = store.office.start(author, asset.id, asset.version_id, id())
    const claim = store.office.claim()
    assert(claim)
    assert.equal(store.office.complete(claim.token, { ...page, key: id() }, 1, []), true)
    const spec = { ...select(asset, 1, dbLine, dbLine.lastIndexOf(word)), conversion_id: job.id }
    const block = { block_id: sha(dbLine), ordinal: 1, start: 0, end: dbLine.length, page_start: 0, page_end: dbLine.length, previous: null, next: null }
    const witness = { conversion_id: job.id, sha256: page.sha256, ordinal: 1, text: dbLine, width: 300, height: 200, boxes: [],
      word: { source_sha256: original.sha256, blocks: [block] } }
    return { spec, witness }
  }
  const one = conversion(), two = conversion()
  assert.notEqual(one.spec.conversion_id, two.spec.conversion_id)
  const term = saveCard(store, author, one.spec, '固定转换', '转换中的索引', one.witness)
  const matched = question(store, author, null, one.spec, '第一次转换的同一处？', one.witness)
  const mismatch = question(store, author, null, two.spec, '第二次转换的同一处？', two.witness)
  return { term, target: one.spec, matched, mismatch }
}

async function seedV42(old, decodeText, dir) {
  const store = storage(old, dir), identity = new old.IdentityService(store)
  try {
    const password = `Local-fixture!${id()}`
    async function account(loginName, displayName, bootstrap = false) {
      const profile = { loginName, displayName, password, domains: ['software_engineering'], learningTracks: ['engineering_practice'], goalText: '合成测试' }
      if (bootstrap) await identity.bootstrap(profile)
      else await identity.register(profile)
      const login = await identity.login({ loginName, password, source: 'v43-local-fixture' })
      const actor = identity.actor(login.token)
      assert(actor)
      return actor
    }
    const author = await account('v43author', '合成作者', true), a = await account('v43alice', '合成甲'), b = await account('v43bob', '合成乙')
    assert.equal(new Set([author.userId, a.userId, b.userId]).size, 3)
    const project = store.createProject({ id: id(), serviceId: author.serviceId, ownerUserId: author.userId,
      name: '固定来源练习', now: new Date().toISOString() }).id
    const asset = publish(store, author, decodeText, body)
    const membership = { scope: 'project', id: project, permission: 'member' }
    const projectGrantA = grant(store, author, a, membership)
    grant(store, author, b, membership)
    const material = { scope: 'object', id: asset.id, permission: 'read' }
    const grantA = grant(store, author, a, material)
    grant(store, author, b, material)
    const target = select(asset, 1, dbLine, dbLine.lastIndexOf(word))
    const neighbor = select(asset, 1, dbLine, dbLine.indexOf(word)), duplicate = { ...target, ordinal: 3 }
    const array = select(asset, 5, arrayLine, arrayLine.indexOf(word))
    assert.equal([...dbLine.slice(0, target.start)].length + 1, target.start)
    assert(neighbor.end < target.start - 1)
    store.citations.savePosition(a, array, 0, a.userId)
    store.citations.savePosition(b, duplicate, 0, b.userId)
    const term = saveCard(store, a, target, originalNote, '数据库检索结构')
    const twin = saveCard(store, a, target, '甲独立保存的另一张卡', '另一条固定解释')
    const arrayTerm = saveCard(store, a, array, '甲的数组卡', '数组位置编号')
    const peer = saveCard(store, b, target, peerNote, '乙的数据库语境')
    const primary = question(store, author, project, { ...target, start: target.start - 1, end: target.end + 1 }, '引用是否包含本次索引？')
    const near = question(store, author, project, neighbor, '同段的第一次索引？')
    const otherUnit = question(store, author, project, duplicate, '完全相同的另一段？')
    const privateQ = question(store, author, null, target, '作者的私有题？')
    const standardKey = id(), guidedKey = id(), hintKey = id(), attemptKey = id()
    const standard = store.practice.createSession(a, standardKey, [near.version_id]).session
    const guided = store.practice.createSession(a, guidedKey, [primary.version_id], 'guided').session
    const hint = store.practice.hint(a, hintKey, standard.id, near.version_id, 1)
    const oldInput = input(near.version_id, 0, false)
    const attempt = store.practice.submit(a, attemptKey, standard.id, oldInput)
    assert.equal(attempt.attempt.independent, false)
    assert.equal(attempt.attempt.grading_state, 'incorrect')
    store.practice.updateReview(a, id(), near.id, { expected_revision: 0, wrong_reason: '旧版记录的错因', mastery_state: 'reviewing',
      next_review_at: '2099-01-02T00:00:00.000Z' })
    const office = seedConversions(store, author)
    return { author, a, b, project, projectGrantA, asset, grantA, target, office, term, twin, arrayTerm, peer, primary, near, otherUnit, privateQ,
      standardKey, standard, guidedKey, guided, hintKey, hint, oldInput, attemptKey, attempt }
  } finally { await identity.close(); store.close() }
}

function verifyFixture(dir, legacy, fixture, checksum) {
  const { a, term, peer, primary, near, standardKey, guidedKey, standard, guided } = fixture
  assert.equal(legacy.version, 42)
  assert.deepEqual(legacy.ledger.map(row => row.version), Array.from({ length: 42 }, (_, i) => i + 1))
  assert.match(checksum, /^[a-f0-9]{64}$/)
  assert.equal(legacy.ledger.at(-1).checksum, checksum)
  for (const table of [preferences, origins]) assert(!Object.hasOwn(legacy.rows, table))
  const counts = { saved_terms: 5, users: 3, reading_positions: 2, office_conversions: 2, question_versions: 6, practice_sessions: 2,
    practice_session_questions: 2, practice_attempts: 1, practice_attempt_receipts: 1, practice_hint_events: 1,
    personal_question_states: 1, personal_question_receipts: 1 }
  for (const [table, count] of Object.entries(counts)) assert.equal(legacy.rows[table].length, count, table)
  assert.equal(query(dir, 'SELECT supplement FROM saved_terms WHERE id=?', term.id)[0].supplement, originalNote)
  assert.equal(query(dir, 'SELECT owner_id FROM saved_terms WHERE id=?', peer.id)[0].owner_id, fixture.b.userId)
  for (const [key, session, oldDigest] of [[standardKey, standard, digest([near.version_id])], [guidedKey, guided, digest(['guided', [primary.version_id]])]]) {
    assert.deepEqual(query(dir, 'SELECT id,request_digest FROM practice_sessions WHERE service_id=? AND user_id=? AND request_key=?', a.serviceId, a.userId, key),
      [{ id: session.id, request_digest: oldDigest }])
  }
  return counts
}

function effective(store, actor, legacy, revision, favorite, supplement) {
  const term = store.terms.find(actor, legacy.id)
  assert(term, `missing owner view for ${legacy.id}`)
  assert.deepEqual([term.revision, term.favorite, term.supplement], [revision, favorite, supplement])
  for (const key of ['id', 'term', 'explanation', 'provider', 'model', 'created_at']) assert.deepEqual(term[key], legacy.saved[key], key)
  for (const [key, value] of Object.entries(legacy.saved.source)) assert.deepEqual(term.source[key], value, key)
  return term
}
const versions = catalog => catalog.questions.map(q => q.version_id).sort()
function assertOrigin(session, fixture) {
  const url = new URL(session.term_origin.origin, 'http://offline.invalid')
  assert.equal(url.origin, 'http://offline.invalid')
  assert.equal(url.pathname, '/knowledgeos/reader')
  const spec = fixture.target
  assert.deepEqual(['asset', 'version', 'unit', 'match'].map(key => url.searchParams.get(key)),
    [spec.asset_id, spec.version_id, String(spec.ordinal), `${spec.start}:${spec.end}:${spec.source_hash}`])
  assert.equal(url.searchParams.get('conversion'), spec.conversion_id ?? null)
}
function checkOriginal(store, actor, fixture) {
  const { asset, primary } = fixture
  const original = store.assets.original(actor, asset.id, asset.version_id, false)
  assert.equal(original.sha256, sha(body))
  assert.equal(original.byteLength, Buffer.byteLength(body))
  const { blocks } = store.assets.blocks(actor, asset.id, asset.version_id, 1, 10)
  assert.equal(blocks.map(row => row.text).join(''), body)
  const resolved = store.citations.resolve(actor, primary.citation.id)
  assert.equal(resolved.quote, dbLine.slice(primary.citation.start, primary.citation.end))
  assert.equal(resolved.quote_hash, primary.citation.quote_hash)
}
function legacyReceipts(store, f) {
  const { a, near, primary, standard, guided } = f
  for (const [version, key, mode, expected] of [[near.version_id, f.standardKey, undefined, standard], [primary.version_id, f.guidedKey, 'guided', guided]]) {
    const receipt = store.practice.createSession(a, key, [version], mode)
    assert.equal(receipt.replayed, true)
    assert.deepEqual([receipt.session.id, receipt.session.started_at, receipt.session.mode], [expected.id, expected.started_at, expected.mode])
    assert.equal(receipt.session.term_origin ?? null, null)
  }
  assert.deepEqual(store.practice.hint(a, f.hintKey, standard.id, near.version_id, 1), { ...f.hint, replayed: true })
  const attempt = store.practice.submit(a, f.attemptKey, standard.id, f.oldInput)
  assert.equal(attempt.replayed, true)
  assert.deepEqual(attempt.attempt, f.attempt.attempt)
  assert.deepEqual(attempt.feedback, f.attempt.feedback)
  const review = store.practice.review(a).items.find(item => item.question.id === near.id)
  assert.equal(review.attempt.id, f.attempt.attempt.id)
  assert.equal(review.state.wrong_reason, '旧版记录的错因')
}

async function migrations(check, ctx) {
  const { dir, tmp, old, fresh, v43sum, legacy, f } = ctx
  await check('reject_damaged_v42_checksum_and_foreign_application', async () => {
    await damagedCopy(fresh, dir, join(tmp, 'bad-v42'), "UPDATE schema_migrations SET checksum=printf('%064d',0) WHERE version=42")
    await damagedCopy(fresh, dir, join(tmp, 'foreign-app'), 'PRAGMA application_id=12345')
  })
  await check('v43_late_sqlite_ledger_abort_then_reopen_with_v42', () => {
    unchanged(dir, 'v43 ledger insert after both tables', () => abortLedgerInsert(fresh, dir, 43, [preferences, origins]))
    assert.deepEqual(state(dir), legacy)
    const previous = storage(old, dir)
    try { legacyReceipts(previous, f); checkOriginal(previous, f.a, f) } finally { previous.close() }
    assert.deepEqual(state(dir), legacy)
  })
  const migrated = await check('v42_to_v43_additive_schema_single_checksum_no_backfill', () => {
    const store = storage(fresh, dir)
    try {
      const after = state(dir)
      assert.equal(after.app, legacy.app)
      assert.equal(after.version, 43)
      assert.equal(after.ledger.length, 43)
      assert.deepEqual(after.ledger.slice(0, -1), legacy.ledger)
      assert.deepEqual([after.ledger.at(-1).version, after.ledger.at(-1).checksum], [43, v43sum])
      assert.deepEqual(Object.keys(after.rows).filter(name => !name.startsWith('sqlite_') && !(name in legacy.rows)).sort(), [preferences, origins].sort())
      for (const row of legacy.schema) assert.deepEqual(after.schema.find(item => item.name === row.name && item.type === row.type), row, row.name)
      for (const [table, rows] of Object.entries(legacy.rows)) if (table !== 'schema_migrations') assert.deepEqual(after.rows[table], rows, table)
      for (const [table, fields] of [[preferences, ['term_id', 'service_id', 'owner_id', 'revision', 'favorite', 'supplement']],
        [origins, ['session_id', 'service_id', 'user_id', 'term_id']]]) {
        assert.deepEqual(after.rows[table], [])
        const columns = query(dir, `PRAGMA table_info(${table})`).map(row => row.name)
        for (const field of fields) assert(columns.includes(field), `${table}.${field}`)
      }
      for (const [actor, term] of [[f.a, f.term], [f.a, f.arrayTerm], [f.b, f.peer]]) effective(store, actor, term, 0, true, term.supplement)
      return after
    } finally { store.close() }
  })
  await check('restart_reject_corrupt_v43_checksum_and_v42_downgrade', async () => {
    await damagedCopy(fresh, dir, join(tmp, 'bad-v43'), "UPDATE schema_migrations SET checksum=printf('%064d',0) WHERE version=43")
    await damagedCopy(fresh, dir, join(tmp, 'bad-v42-in-v43'), "UPDATE schema_migrations SET checksum=printf('%064d',0) WHERE version=42")
    failedOpen(old, dir)
    const store = storage(fresh, dir)
    try { assert.deepEqual(state(dir), migrated) } finally { store.close() }
  })
}

function editPreferences(store, dir, f) {
  const { a, b, term, twin, peer, asset } = f
  const list = actor => store.terms.list(actor, asset.id, asset.version_id).map(card => card.id).sort()
  const initially = state(dir)
  assert.deepEqual(list(a), [term.id, twin.id, f.arrayTerm.id].sort())
  assert.deepEqual(list(b), [peer.id])
  checkOriginal(store, b, f)
  hidden(dir, 'peer reads personal term', () => store.terms.find(b, term.id), card => card == null)
  rejected(dir, 'peer updates other owner', () => store.terms.update(b, term.id, { expected_revision: 0, supplement: '乙' }), [403, 404])
  hidden(dir, 'source author reads learner term', () => store.terms.find(f.author, term.id), card => card == null)
  const edit = () => store.terms.update(a, term.id, { expected_revision: 0, supplement: editedNote })
  fault(dir, preferences, ['INSERT'], edit)
  edit()
  effective(store, a, term, 1, true, editedNote)
  assert.deepEqual(query(dir, `SELECT term_id,service_id,owner_id,revision,favorite,supplement FROM ${preferences}`),
    [{ term_id: term.id, service_id: a.serviceId, owner_id: a.userId, revision: 1, favorite: 1, supplement: editedNote }])
  rejected(dir, 'stale expected_revision', () => store.terms.update(a, term.id, { expected_revision: 0, favorite: false }), [409])
  unchanged(dir, 'original save receipt after edit', () => {
    const retry = store.terms.save(a, term.card, originalNote)
    assert.equal(retry.replayed, true)
    assert.equal(retry.term.id, term.id)
    effective(store, a, term, 1, true, editedNote)
  })
  rejected(dir, 'edited supplement is not original save request', () => store.terms.save(a, term.card, editedNote), ['IDEMPOTENCY_CONFLICT'])
  effective(store, b, peer, 0, true, peerNote)
  // First mutation supplies only favorite. Its overlay must retain the immutable v42 supplement.
  store.terms.update(a, f.arrayTerm.id, { expected_revision: 0, favorite: false })
  effective(store, a, f.arrayTerm, 1, false, f.arrayTerm.supplement)
  store.terms.update(a, f.arrayTerm.id, { expected_revision: 1, favorite: true })
  effective(store, a, f.arrayTerm, 2, true, f.arrayTerm.supplement)
  onlyChanged(initially, state(dir), [preferences])
}

function checkSelections(store, dir, f, decodeText) {
  const { a, b, author, asset, term, primary, near, otherUnit, privateQ, arrayTerm } = f
  const edition = publish(store, author, decodeText, body + '\n新版新增一段。', asset)
  assert.equal(edition.version, 2)
  const inEdition = question(store, author, f.project, { ...f.target, version_id: edition.version_id }, '仅新版的相同选区？')
  // Same hash and offsets in a different version, identical text in another unit, and another occurrence in the very same unit.
  assert.deepEqual(versions(store.practice.catalog(a, term.id)), [primary.version_id])
  assert.deepEqual(versions(store.practice.catalog(a)), [primary, near, otherUnit, inEdition].map(q => q.version_id).sort())
  assert.deepEqual(versions(store.practice.catalog(a, arrayTerm.id)), [])
  assert.deepEqual(versions(store.practice.catalog(b, f.peer.id)), [primary.version_id])
  hidden(dir, 'peer term catalog', () => store.practice.catalog(b, term.id), result => result.questions.length === 0)
  const key = id(), open = (ids, termId = term.id) => store.practice.createSession(a, key, ids, 'standard', termId)
  for (const q of [near, otherUnit, inEdition, privateQ]) {
    rejected(dir, `unmatched or inaccessible question ${q.prompt}`, () => open([q.version_id]), [403, 404, 409, 422])
  }
  rejected(dir, 'mixed matching and mismatched question versions', () => open([primary.version_id, near.version_id]), [404, 409, 422])
  rejected(dir, 'empty selection with no matching question', () => open([], arrayTerm.id), [404, 409, 422])
  rejected(dir, 'nonempty selection with no matching question', () => open([primary.version_id], arrayTerm.id), [404, 409, 422])
  rejected(dir, 'start session with another owner term', () => store.practice.createSession(b, key, [primary.version_id], 'standard', term.id), [403, 404])
  checkOriginal(store, a, f)
}

function openSessions(store, dir, f) {
  const { a, b, term, primary } = f, ids = [primary.version_id], key = id()
  const open = () => store.practice.createSession(a, key, ids, 'guided', term.id)
  rejected(dir, 'old ordinary receipt cannot acquire a term', () => store.practice.createSession(a, f.guidedKey, ids, 'guided', term.id), ['IDEMPOTENCY_CONFLICT'])
  const before = state(dir)
  fault(dir, 'practice_session_questions', ['INSERT'], open)
  fault(dir, origins, ['INSERT'], open)
  const linked = open()
  assert.equal(linked.replayed, false)
  assertOrigin(linked.session, f)
  assertOrigin(store.practice.questions(a, linked.session.id).session, f)
  const after = state(dir)
  onlyChanged(before, after, ['practice_sessions', 'practice_session_questions', origins])
  for (const table of ['practice_sessions', 'practice_session_questions', origins]) {
    assert.equal(after.rows[table].length, before.rows[table].length + 1)
    for (const row of before.rows[table]) assert(after.rows[table].includes(row), table)
  }
  assert.deepEqual(query(dir, `SELECT session_id,service_id,user_id,term_id FROM ${origins}`),
    [{ session_id: linked.session.id, service_id: a.serviceId, user_id: a.userId, term_id: term.id }])
  unchanged(dir, 'identical term session retry', () => assert.deepEqual(open(), { ...linked, replayed: true }))
  for (const [mode, termId] of [['guided', undefined], ['guided', f.twin.id], ['standard', term.id]]) {
    rejected(dir, 'changed term or mode at same request key', () => store.practice.createSession(a, key, ids, mode, termId), ['IDEMPOTENCY_CONFLICT'])
  }
  const ordinary = store.practice.createSession(b, key, ids)
  assert.equal(ordinary.replayed, false)
  assert.notEqual(ordinary.session.id, linked.session.id)
  assert.equal(ordinary.session.term_origin ?? null, null)
  assert.deepEqual(query(dir, `SELECT session_id FROM ${origins} WHERE session_id=?`, ordinary.session.id), [])
  rejected(dir, 'peer reads linked session', () => store.practice.questions(b, linked.session.id), [403, 404])
  return { key, linked: linked.session.id, ordinary: ordinary.session.id }
}

function sqliteOwnerConstraints(dir, f, sessions) {
  // Both reference IDs exist. The unrelated, ordinary session has no origin or uniqueness collision.
  const probes = [
    [`UPDATE ${preferences} SET owner_id=? WHERE term_id=?`, f.b.userId, f.term.id],
    [`UPDATE ${preferences} SET service_id=? WHERE term_id=?`, id(), f.term.id],
    [`UPDATE ${origins} SET term_id=? WHERE session_id=?`, f.peer.id, sessions.linked],
    [`UPDATE ${origins} SET session_id=? WHERE session_id=?`, sessions.ordinary, sessions.linked],
  ]
  for (const [statement, ...params] of probes) unchanged(dir, statement, () => connection(dir, false, db => {
    db.exec('BEGIN IMMEDIATE')
    // COMMIT also exercises deferred foreign keys. Closing rolls back any rejected transaction.
    assert.throws(() => {
      assert.equal(db.prepare(statement).run(...params).changes, 1)
      db.exec('COMMIT')
    }, error => (error.errcode & 255) === 19, 'SQLite must reject a cross-owner or cross-service binding')
  }))
}

function submitAnswers(store, dir, f, sessions) {
  const { a, b, primary } = f, version = primary.version_id
  const key = id(), firstInput = input(version, 0, false)
  const send = () => store.practice.submit(a, key, sessions.linked, firstInput)
  const read = () => store.practice.questions(a, sessions.linked).questions[0]
  assert.equal(read().feedback, null)
  assert.deepEqual(read().attempts, [])
  rejected(dir, 'wrong version for session', () => store.practice.submit(a, key, sessions.linked, input(f.near.version_id, 0, true)), ['QUESTION_NOT_FOUND'])
  rejected(dir, 'non-Boolean judgment answer', () => store.practice.submit(a, key, sessions.linked, input(version, 0, 'true')), ['INVALID_PRACTICE_ANSWER'])
  rejected(dir, 'peer submits to owner session', () => store.practice.submit(b, key, sessions.linked, firstInput), [403, 404])
  fault(dir, 'practice_attempt_receipts', ['INSERT'], send)
  const first = send()
  assert.equal(first.replayed, false)
  assert.deepEqual([first.attempt.sequence, first.attempt.independent, first.attempt.grading_state, first.feedback], [1, true, 'incorrect', null])
  assert.deepEqual(query(dir, 'SELECT id,user_id,sequence FROM practice_attempts WHERE session_id=?', sessions.linked),
    [{ id: first.attempt.id, user_id: a.userId, sequence: 1 }])
  assert.deepEqual(query(dir, 'SELECT attempt_id FROM practice_attempt_receipts WHERE service_id=? AND user_id=? AND request_key=?', a.serviceId, a.userId, key),
    [{ attempt_id: first.attempt.id }])
  unchanged(dir, 'identical first answer retry', () => assert.deepEqual(send(), { ...first, replayed: true }))
  rejected(dir, 'changed answer at same key', () => store.practice.submit(a, key, sessions.linked, input(version, 0, true)), ['IDEMPOTENCY_CONFLICT'])
  rejected(dir, 'stale answer at fresh key', () => store.practice.submit(a, id(), sessions.linked, firstInput), ['ATTEMPT_SEQUENCE_CONFLICT'])
  const hint = store.practice.hint(a, id(), sessions.linked, version, 1)
  assert.equal(hint.hint.for_sequence, 2)
  const assisted = store.practice.submit(a, id(), sessions.linked, input(version, 1, true))
  assert.deepEqual([assisted.attempt.sequence, assisted.attempt.independent, assisted.feedback.evidence.id], [2, false, primary.citation.id])
  assert.deepEqual(read().attempts.map(attempt => attempt.id), [first.attempt.id, assisted.attempt.id])
  const peer = store.practice.submit(b, key, sessions.ordinary, input(version, 0, true))
  assert.deepEqual([peer.replayed, peer.attempt.independent, peer.attempt.grading_state], [false, true, 'correct'])
  const peerView = store.practice.questions(b, sessions.ordinary).questions[0]
  assert.deepEqual(peerView.attempts.map(attempt => attempt.id), [peer.attempt.id])
  assert.deepEqual(peerView.hints, [])
  assert.equal(store.practice.review(a).items.find(item => item.question.id === primary.id).session_id, sessions.linked)
  assert.equal(store.practice.review(b).items.find(item => item.question.id === primary.id).session_id, sessions.ordinary)
  return { first: first.attempt.id, assisted: assisted.attempt.id, peer: peer.attempt.id, key, firstInput }
}

function toggleFavorite(store, dir, f, sessions, answers) {
  const { a, term, asset } = f, before = state(dir)
  const list = () => store.terms.list(a, asset.id, asset.version_id).map(card => card.id)
  const hide = () => store.terms.update(a, term.id, { expected_revision: 1, favorite: false })
  fault(dir, preferences, ['UPDATE', 'INSERT'], hide)
  hide()
  effective(store, a, term, 2, false, editedNote)
  assert(!list().includes(term.id))
  unchanged(dir, 'replay save while unfavorited', () => {
    assert.equal(store.terms.save(a, term.card, originalNote).replayed, true)
    effective(store, a, term, 2, false, editedNote)
  })
  const historical = store.practice.questions(a, sessions.linked)
  assertOrigin(historical.session, f)
  assert.deepEqual(historical.questions[0].attempts.map(item => item.id), [answers.first, answers.assisted])
  assert.equal(historical.questions[0].feedback.evidence.id, f.primary.citation.id)
  assert.equal(store.practice.review(a).items.find(item => item.question.id === f.primary.id).session_id, sessions.linked)
  checkOriginal(store, a, f)
  assert.equal(store.citations.navigation(a, f.target).position.ordinal, 5)
  assert.equal(store.citations.navigation(f.b, f.target).position.ordinal, 3)
  onlyChanged(before, state(dir), [preferences])
  store.terms.update(a, term.id, { expected_revision: 2, favorite: true })
  effective(store, a, term, 3, true, editedNote)
  assert(list().includes(term.id))
  onlyChanged(before, state(dir), [preferences])
}

function correctQuestion(store, dir, f, sessions) {
  const { a, primary, term } = f
  const next = store.practice.correct(f.author, id(), primary.id, { expected_version: 1, answer: true,
    explanation: '修订解析，维持固定原文。', reason: '合成题目换版' }).question.version_id
  assert.notEqual(next, primary.version_id)
  assert.deepEqual(versions(store.practice.catalog(a, term.id)), [next])
  const key = id()
  rejected(dir, 'fresh key with superseded question version', () => store.practice.createSession(a, key, [primary.version_id], 'guided', term.id), [404, 409, 422])
  unchanged(dir, 'authorized historical receipt after question revision', () => {
    const receipt = store.practice.createSession(a, sessions.key, [primary.version_id], 'guided', term.id)
    assert.equal(receipt.replayed, true)
    assert.equal(receipt.session.id, sessions.linked)
    assertOrigin(receipt.session, f)
    assert.equal(store.practice.questions(a, receipt.session.id).questions[0].version_id, primary.version_id)
  })
  const replacement = store.practice.createSession(a, key, [next], 'guided', term.id)
  assert.equal(replacement.replayed, false)
  assertOrigin(replacement.session, f)
  return next
}

async function changedEligibility(ctx, sessions, next, change) {
  const { fresh, f } = ctx, dir = join(ctx.tmp, change)
  await copyDatabase(ctx.dir, dir)
  if (change === 'changed-text') {
    connection(dir, false, db => {
      // Model an extraction that no longer matches the fixed block/quote, without changing ACLs or the question pointer.
      assert.equal(db.prepare('UPDATE text_blocks SET text=? WHERE version_id=? AND ordinal=?')
        .run(dbLine.replace('检索结构', '无关内容'), f.target.version_id, f.target.ordinal).changes, 1)
    })
  }
  const store = storage(fresh, dir)
  try {
    if (change === 'removed-project') {
      const invitation = store.invitations.get(f.author, f.author.userId, f.projectGrantA)
      store.invitations.change(f.author, f.author.userId, invitation.id, invitation.revision, 'revoke')
      effective(store, f.a, f.term, 3, true, editedNote)
      checkOriginal(store, f.a, f)
      assert.deepEqual(versions(store.practice.catalog(f.a, f.term.id)), [])
      assert.deepEqual(versions(store.practice.catalog(f.b, f.peer.id)), [next])
    } else {
      rejected(dir, 'edited source rejects personal update', () => store.terms.update(f.a, f.term.id, { expected_revision: 3, supplement: '过时引用' }), [404, 409])
      rejected(dir, 'edited source rejects fresh save', () => store.terms.save(f.a, { ...f.term.card, explanation_id: id() }, originalNote), [404, 409])
    }
    rejected(dir, 'fresh request after eligibility change', () => store.practice.createSession(f.a, id(), [next], 'standard', f.term.id), [403, 404, 409, 422])
    rejected(dir, 'existing receipt with inaccessible source or question', () => store.practice.createSession(f.a, sessions.key, [f.primary.version_id], 'guided', f.term.id), [403, 404, 409])
  } finally { store.close() }
}

function revokeAccess(store, dir, f, sessions, answers, next) {
  const { a, b, term, author, primary } = f
  const before = state(dir), invite = store.invitations.get(author, author.userId, f.grantA)
  store.invitations.change(author, author.userId, invite.id, invite.revision, 'revoke')
  const denied = state(dir)
  // The grant and its audit trail may change. No source, card, history, receipt or origin may change with them.
  for (const table of ['saved_terms', preferences, origins, 'assets', 'asset_versions', 'text_blocks', 'blobs', 'citations', 'citation_locators',
    'questions', 'question_versions', 'practice_sessions', 'practice_session_questions', 'practice_attempts', 'practice_attempt_receipts',
    'practice_hint_events', 'personal_question_states', 'reading_positions']) assert.deepEqual(denied.rows[table], before.rows[table], table)
  hidden(dir, 'revoked term lookup', () => store.terms.find(a, term.id), card => card == null)
  hidden(dir, 'revoked term list', () => store.terms.list(a, f.asset.id, f.asset.version_id), list => list.length === 0)
  hidden(dir, 'revoked term catalog', () => store.practice.catalog(a, term.id), result => result.questions.length === 0)
  for (const [name, act] of [
    ['origin and attempt history', () => store.practice.questions(a, sessions.linked)],
    ['update', () => store.terms.update(a, term.id, { expected_revision: 3, favorite: false })],
    ['save receipt', () => store.terms.save(a, term.card, originalNote)],
    ['new save', () => store.terms.save(a, { ...term.card, explanation_id: id() }, '新补充')],
    ['v42 session receipt', () => store.practice.createSession(a, f.standardKey, [f.near.version_id])],
    ['term session receipt', () => store.practice.createSession(a, sessions.key, [primary.version_id], 'guided', term.id)],
    ['fresh term session', () => store.practice.createSession(a, id(), [next], 'standard', term.id)],
    ['answer receipt', () => store.practice.submit(a, answers.key, sessions.linked, answers.firstInput)],
    ['fresh answer', () => store.practice.submit(a, id(), sessions.linked, input(primary.version_id, 2, true))],
  ]) rejected(dir, `revoked ${name}`, act, [403, 404])
  assert.deepEqual(store.practice.listSessions(a), [])
  assert.deepEqual(store.practice.review(a).items, [])
  effective(store, b, f.peer, 0, true, peerNote)
  checkOriginal(store, b, f)
  assert.deepEqual(versions(store.practice.catalog(b, f.peer.id)), [next])
  assert.equal(store.practice.questions(b, sessions.ordinary).questions[0].attempts[0].id, answers.peer)
  assert.deepEqual(state(dir), denied)
  const nextSession = store.practice.createSession(b, id(), [next]).session
  const submission = store.practice.submit(b, id(), nextSession.id, input(next, 0, true))
  assert.equal(submission.replayed, false)
  assert.equal(submission.feedback.evidence.id, primary.citation.id)
  const afterPeer = state(dir)
  const appended = ['practice_sessions', 'practice_session_questions', 'practice_attempts', 'practice_attempt_receipts']
  onlyChanged(denied, afterPeer, appended)
  for (const table of appended) {
    assert.equal(afterPeer.rows[table].length, denied.rows[table].length + 1, table)
    for (const row of denied.rows[table]) assert(afterPeer.rows[table].includes(row), table)
  }
  return afterPeer
}

async function exercises(check, ctx) {
  const { dir, fresh, f, decodeText } = ctx
  const store = storage(fresh, dir)
  let sessions, answers, next, beforeRestart
  try {
    await check('v42_standard_guided_hint_and_attempt_receipt_replays', () => unchanged(dir, 'v42 receipts', () => legacyReceipts(store, f)))
    await check('owner_revision_overlay_and_immutable_save_receipt', () => editPreferences(store, dir, f))
    await check('fixed_selection_catalog_and_no_write_on_wrong_or_empty_selection', () => checkSelections(store, dir, f, decodeText))
    sessions = await check('atomic_term_session_and_origin_scoped_retry', () => openSessions(store, dir, f))
    await check('sqlite_rejects_cross_owner_and_cross_service_links', () => sqliteOwnerConstraints(dir, f, sessions))
    await check('same_asset_version_page_text_and_range_distinct_office_conversions', () => {
      const { office, author } = f, key = id()
      const start = q => store.practice.createSession(author, key, [q.version_id], 'standard', office.term.id)
      assert.deepEqual(versions(store.practice.catalog(author, office.term.id)), [office.matched.version_id])
      rejected(dir, 'distinct conversion with identical page text', () => start(office.mismatch), [404, 409, 422])
      const result = start(office.matched)
      assert.equal(result.replayed, false)
      assertOrigin(store.practice.questions(author, result.session.id).session, office)
    })
    answers = await check('two_learners_attempts_hints_conflicts_and_late_receipt_fault', () => submitAnswers(store, dir, f, sessions))
    await check('unfavorite_history_restore_and_original_reading_positions', () => toggleFavorite(store, dir, f, sessions, answers))
    next = await check('new_session_current_question_and_pinned_authorized_replay', () => correctQuestion(store, dir, f, sessions))
    await check('question_project_access_withdrawn_while_card_source_stays_readable', () => changedEligibility(ctx, sessions, next, 'removed-project'))
    await check('changed_source_hash_denies_fresh_writes_and_existing_receipt', () => changedEligibility(ctx, sessions, next, 'changed-text'))
    beforeRestart = state(dir)
  } finally { store.close() }
  const reopened = storage(fresh, dir)
  let revoked
  try {
    await check('restart_preserves_edits_sources_attempts_and_original_receipts', () => {
      assert.deepEqual(state(dir), beforeRestart)
      unchanged(dir, 'reloaded history', () => {
        effective(reopened, f.a, f.term, 3, true, editedNote)
        assert.equal(reopened.terms.save(f.a, f.term.card, originalNote).replayed, true)
        legacyReceipts(reopened, f)
        const history = reopened.practice.questions(f.a, sessions.linked)
        assertOrigin(history.session, f)
        assert.deepEqual(history.questions[0].attempts.map(item => item.id), [answers.first, answers.assisted])
      })
    })
    revoked = await check('revocation_denies_fresh_and_replayed_writes_only_for_revoked_learner', () => revokeAccess(reopened, dir, f, sessions, answers, next))
  } finally { reopened.close() }
  const final = storage(fresh, dir)
  try {
    await check('reopen_revoked_store_and_verify_legacy_rows', () => {
      assert.deepEqual(state(dir), revoked)
      rejected(dir, 'revoked origin after restart', () => final.practice.questions(f.a, sessions.linked), [403, 404])
      checkOriginal(final, f.b, f)
      effective(final, f.b, f.peer, 0, true, peerNote)
      assert.equal(final.practice.questions(f.b, sessions.ordinary).questions[0].attempts[0].id, answers.peer)
      // Legitimate new versions, terms, sessions and answers may append. Every v42 row in these tables must still exist byte for byte.
      for (const table of ['saved_terms', 'asset_versions', 'blobs', 'text_blocks', 'citations', 'citation_locators', 'question_versions', 'reading_positions',
        'practice_sessions', 'practice_session_questions', 'practice_attempts', 'practice_attempt_receipts', 'practice_hint_events', 'personal_question_states',
        'personal_question_receipts']) {
        for (const hash of ctx.legacy.rows[table]) assert(revoked.rows[table].includes(hash), `lost or rewrote a v42 row in ${table}`)
      }
    })
  } finally { final.close() }
  return { final_snapshot_sha256: digest(revoked), ledger_sha256: digest(revoked.ledger),
    preferences: revoked.rows[preferences].length, origins: revoked.rows[origins].length, attempts: revoked.rows.practice_attempts.length }
}

async function main(args) {
  const baseline = args[0] === '--baseline'
  const validCandidate = [2, 3].includes(args.length) && /^[a-f0-9]{40}$/.test(args[1]) && (args.length === 2 || /^[a-f0-9]{64}$/.test(args[2]))
  if (baseline ? args.length !== 2 : !validCandidate) {
    console.error('Usage: node v43-regression.mjs --baseline <local checkout>\n   or: node v43-regression.mjs <frozen checkout> <full candidate commit> [index.js SHA-256]')
    process.exitCode = 2
    return
  }
  const root = resolve(args[baseline ? 1 : 0]), tmp = mkdtempSync(join(tmpdir(), 'kos-learn006-v43-')), dir = join(tmp, 'data')
  const report = { unit_id: 'LEARN-006', scope: baseline ? 'V42_FIXTURE_ONLY' : 'INDEPENDENT_OFFLINE_V43_SQLITE',
    status: 'FAIL', v43_status: 'NOT_RUN', frozen_v42: V42, node: process.version, sqlite: process.versions.sqlite,
    runner_sha256: sha(readFileSync(fileURLToPath(import.meta.url))), real_inference_requests: 0, results: [] }
  const git = (...options) => execFileSync('git', ['--no-replace-objects', '--no-lazy-fetch', '--no-optional-locks', ...options],
    { cwd: root, maxBuffer: 16 * 1024 * 1024, windowsHide: true })
  const blob = (commit, path) => git('cat-file', 'blob', `${commit}:${path}`)
  function extract(name, bytes) {
    const path = join(tmp, name)
    writeFileSync(path, bytes, { flag: 'wx' })
    return load(path)
  }
  async function check(name, action) {
    const result = { id: name, status: 'FAIL' }
    report.results.push(result)
    const start = writeChecks.length
    try {
      const value = await action()
      result.status = 'PASS'
      return value
    } finally {
      if (writeChecks.length > start) result.sqlite_write_checks = writeChecks.slice(start)
    }
  }
  try {
    const { old, decodeText, v42sum } = await check('bind_v42_git_artifacts', async () => {
      const bytes = blob(V42, files.support), oldStorage = blob(V42, files.storage), decoder = blob(V42, `${panel}/src/host/text-document.ts`)
      report.v42_artifacts = { entry_sha256: sha(blob(V42, files.entry)), support_sha256: sha(bytes), storage_sha256: sha(oldStorage), decoder_sha256: sha(decoder) }
      const old = await extract('v42-test-support.mjs', bytes), abi = await extract('v42-storage.mjs', oldStorage)
      assert.equal(old.SCHEMA_VERSION, 42)
      assert.equal(abi.SCHEMA_VERSION, 42)
      return { old, v42sum: abi.MIGRATION_V42_CHECKSUM, decodeText: (await extract('v42-text-document.mts', decoder)).decodeText }
    })
    const f = await check('seed_three_synthetic_actors_terms_citations_and_practice_in_v42', () => seedV42(old, decodeText, dir))
    const legacy = state(dir)
    await check('verify_v42_fixture_rows_original_and_both_receipt_digests', () => {
      report.v42_counts = verifyFixture(dir, legacy, f, v42sum)
      report.v42_ledger_sha256 = digest(legacy.ledger)
      report.v42_checksum = v42sum
      const store = storage(old, dir)
      try { unchanged(dir, 'baseline public API reads and replays', () => { legacyReceipts(store, f); checkOriginal(store, f.a, f) }) }
      finally { store.close() }
    })
    if (baseline) {
      await check('v42_only_calibrate_sqlite_fault_and_checksum_probes', async () => {
        const store = storage(old, dir)
        try {
          fault(dir, 'practice_attempt_receipts', ['INSERT'], () => store.practice.submit(f.a, id(), f.guided.id, input(f.primary.version_id, 0, true)))
          assert.deepEqual(state(dir), legacy)
        } finally { store.close() }
        const scratch = join(tmp, 'v42-ledger-calibration')
        abortLedgerInsert(old, scratch, 42, ['practice_transfers', 'practice_solution_reveals'])
        assert.equal(state(scratch).version, 41)
        const retry = storage(old, scratch)
        try { assert.equal(state(scratch).version, 42) } finally { retry.close() }
        await damagedCopy(old, dir, join(tmp, 'v42-calibration'), "UPDATE schema_migrations SET checksum=printf('%064d',0) WHERE version=42")
      })
    } else {
      const candidate = args[1], expectedEntry = args[2]
      report.candidate_sha = candidate
      report.expected_entry_sha256 = expectedEntry
      const { fresh, v43sum } = await check('bind_frozen_candidate_git_artifacts', async () => {
        assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate, 'checkout HEAD differs from frozen candidate')
        git('merge-base', '--is-ancestor', V42, candidate)
        const bytes = {}
        for (const [name, path] of Object.entries(files)) {
          bytes[name] = blob(candidate, path)
          assert.equal(sha(readFileSync(join(root, path))), sha(bytes[name]), `dirty frozen artifact: ${path}`)
        }
        report.entry_sha256 = sha(bytes.entry)
        if (expectedEntry) assert.equal(report.entry_sha256, expectedEntry, 'frozen entry SHA-256 differs')
        report.candidate_artifacts = { support_sha256: sha(bytes.support), storage_sha256: sha(bytes.storage) }
        const fresh = await extract('candidate-test-support.mjs', bytes.support), abi = await extract('candidate-storage.mjs', bytes.storage)
        assert.equal(fresh.SCHEMA_VERSION, 43)
        assert.equal(abi.SCHEMA_VERSION, 43)
        assert.match(abi.MIGRATION_V43_CHECKSUM, /^[a-f0-9]{64}$/)
        return { fresh, v43sum: abi.MIGRATION_V43_CHECKSUM }
      })
      report.v43_status = 'FAIL'
      report.v43_checksum = v43sum
      const ctx = { dir, tmp, old, fresh, v43sum, legacy, f, decodeText }
      await migrations(check, ctx)
      report.observed = await exercises(check, ctx)
      report.v43_status = 'PASS'
    }
    report.status = 'PASS'
  } catch (error) {
    report.failure = message(error).slice(0, 1800)
    process.exitCode = 1
  } finally {
    report.exit_code = process.exitCode ?? 0
    const proof = join(tmp, 'summary.json')
    writeFileSync(proof, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ scope: report.scope, status: report.status, v43_status: report.v43_status,
      passed: report.results.filter(item => item.status === 'PASS').length, failed: report.results.find(item => item.status === 'FAIL')?.id,
      failure: report.failure, proof }))
  }
}

await main(process.argv.slice(2))
