import assert from 'node:assert/strict'
import { absent, action, bank, hash, prefix, questionsFor, review, sessions, uuid } from './host-support.mjs'
import { assertMarked, assertSpec, openCard, reader, select, sourceHref, sources } from './host-support-reader.mjs'

const post = data => ({ method: 'POST', data, status: 201 })
const qButton = (actor, list, question) => actor.page.locator(`#${list} [data-question-version="${question.version_id}"]`)
export const historyButton = (actor, session) => actor.page.locator(`#practice-history [data-practice-session="${session.id}"]`)
const versions = items => items.map(q => q.version_id).sort()

async function citation(h, owner, asset, source, start, end) {
  const spec = { ...source.spec, start, end }
  await owner.page.bringToFront()
  await owner.page.goto(h.base + reader(asset) + '&unit=' + spec.ordinal)
  await owner.page.locator('#text').filter({ hasText: source.marker }).waitFor()
  await select(owner, source.text, start, end)
  const result = await h.event(owner, `${prefix}/citations`, 'POST', '#cite', [200, 201])
  assert.deepEqual(result.body, spec); assertSpec(result.data, spec)
  assert.equal(result.data.quote_hash, hash(source.text.slice(start, end)))
  return result.data
}

export async function makeBank(h, owner, project, asset, fixture, dataSource, kind, tag) {
  const main = kind === 'main'
  const offsets = main ? [1, 1] : [3, 4]
  const { start, end } = dataSource.spec
  const selected = await citation(h, owner, asset, dataSource, start - offsets[0], end + offsets[1])
  const otherStart = main ? dataSource.text.indexOf('索引') : dataSource.text.indexOf('索引', dataSource.text.indexOf('B-tree'))
  assert(otherStart >= 0 && otherStart + 2 < selected.start)
  const other = await citation(h, owner, asset, dataSource, otherStart, otherStart + 2)
  const answer = main ? 1 : 3, incorrect = main ? 2 : 1
  const options = ['只改变数组下标', '删除固定引用', '按键值减少扫描']
  if (main) options.reverse()
  async function question(name, ref, scope) {
    const explanation = `${tag} ${name}的核验依据是固定来源中的检索结构。`
    const draft = { kind: 'choice', prompt: `${tag} ${name}中索引的作用是什么？`, difficulty: 'intermediate',
      options, answer, explanation, project_id: scope, source_citation_id: ref.id }
    const q = (await h.api(owner, bank, post(draft))).question
    assert.match(q.version_id, uuid); assert.equal(q.prompt, draft.prompt)
    const [stored] = h.rows('SELECT citation_id,evidence_json FROM question_versions WHERE question_id=? AND id=?', q.id, q.version_id)
    assert.equal(stored.citation_id, ref.id); assert.equal(JSON.parse(stored.evidence_json).id, ref.id)
    return { ...q, explanation, ref }
  }
  const target = await question('同次选词', selected, project.id)
  const elsewhere = await question('同段另一处', other, project.id)
  const privateQ = await question('作者私题', selected, null)
  // Same coordinates, same paragraph hash and quote, different immutable version of the same asset.
  const bytes = Buffer.concat([fixture, Buffer.from(`\n\n## ${tag} 新版附记\n\n固定段落保留。\n`, 'utf8')])
  const newer = await h.publish(owner, bytes, 'context-v2.md', asset)
  assert.equal(newer.id, asset.id); assert.notEqual(newer.version_id, asset.version_id)
  const v2 = sources(h, bytes, newer, kind)[0]
  assert.equal(v2.spec.ordinal, dataSource.spec.ordinal); assert.equal(v2.spec.source_hash, dataSource.spec.source_hash)
  const v2Ref = await citation(h, owner, newer, v2, selected.start, selected.end)
  assert.equal(v2Ref.quote_hash, selected.quote_hash)
  const wrongVersion = await question('另一资料版本', v2Ref, project.id)
  return { target, elsewhere, privateQ, wrongVersion, newer, answer, incorrect, project }
}

async function filteredBrowser(h, actor, asset, card, expected) {
  await openCard(h, actor, asset, card)
  const catalog = await h.event(actor, questionsFor(card), 'GET', '#term-practice', 200)
  assert.deepEqual(versions(catalog.data.questions), versions(expected))
  const page = actor.page
  await page.waitForURL(url => url.pathname === '/knowledgeos/practice')
  await page.locator('#practice-workspace').waitFor()
  if (expected.length) await qButton(actor, 'practice-questions', expected[0]).waitFor()
  else await page.locator('#practice-empty').waitFor()
  assert.deepEqual(await page.locator('#practice-questions [data-question-version]').evaluateAll(buttons =>
    buttons.map(button => button.dataset.questionVersion).sort()), versions(expected))
}

export async function checkCatalog(h, A, B, asset, dbCard, arrayCard, arraySource, qs, kind) {
  const { target, elsewhere, privateQ, wrongVersion, project } = qs
  const expectedNormal = versions([target, elsewhere, wrongVersion])
  for (const actor of [A, B]) {
    const normal = (await h.api(actor, bank)).questions
    assert.deepEqual(versions(normal), expectedNormal); absent(normal, [privateQ.prompt, privateQ.version_id, target.explanation])
  }
  assert.deepEqual(versions((await h.api(A, questionsFor(dbCard))).questions), [target.version_id])
  assert.deepEqual((await h.api(A, questionsFor(arrayCard))).questions, [])
  await filteredBrowser(h, A, asset, arrayCard, [])
  await returnToSource(h, A, arraySource, 'empty-bank-array-return', '#practice-term-reader')
  const before = h.snapshot()
  const body = (term, questions) => post({ term_id: term.id, question_version_ids: questions.map(q => q.version_id) })
  // All requests have valid versions, identities and payloads. Each changes only the condition being tested.
  for (const q of [elsewhere, wrongVersion, privateQ]) {
    await h.deny(A, sessions, body(dbCard, [q]), [403, 404, 409, 422])
    await h.deny(A, sessions, body(dbCard, [target, q]), [403, 404, 409, 422])
  }
  await h.deny(A, sessions, body(arrayCard, [target]), [403, 404, 409, 422])
  await h.deny(A, sessions, post({ question_version_ids: [privateQ.version_id] }))
  await h.deny(B, sessions, body(dbCard, [target]), [403, 404])
  await protectedCatalog(h, B, dbCard, [privateQ.prompt, dbCard.supplement, target.prompt])
  assert.deepEqual(h.snapshot(), before)
  if (kind === 'independent') {
    // Second oracle: derive the result in SQL using publisher scope and containment, without the listing response.
    const matches = h.rows(`SELECT v.id FROM saved_terms t JOIN citations c ON c.asset_id=t.asset_id AND c.version_id=t.version_id
      AND c.ordinal=t.ordinal AND c.conversion_id IS t.conversion_id AND c.source_hash=t.source_hash AND c.start<=t.start AND c.end>=t.end
      JOIN question_versions v ON v.citation_id=c.id JOIN questions q ON q.current_version_id=v.id
      WHERE t.id=? AND t.owner_id=? AND q.project_id=?`, dbCard.id, A.id, project.id)
    assert.deepEqual(matches, [{ id: target.version_id }])
    const geometric = h.rows(`SELECT v.id FROM question_versions v JOIN citations c ON c.id=v.citation_id JOIN saved_terms t
      ON c.version_id=t.version_id AND c.ordinal=t.ordinal AND c.start<=t.start AND c.end>=t.end WHERE t.id=?`, dbCard.id)
    assert.deepEqual(geometric.map(v => v.id).sort(), versions([target, privateQ]))
    h.pass('independent_sql_containment_and_visibility')
  }
  h.pass('TERM_AND_QUESTION_SOURCE', { selected_utf16: [dbCard.source.start,dbCard.source.end], citation_utf16: [target.ref.start,target.ref.end],
    other_occurrence_utf16: [elsewhere.ref.start,elsewhere.ref.end], matching_version_sha256: hash(target.ref.version_id),
    excluded_version_sha256: hash(wrongVersion.ref.version_id), private_question_excluded: true })
}

export async function protectedCatalog(h, actor, card, markers) {
  const { response, payload } = await h.wire(actor, questionsFor(card))
  assert([200, 403, 404].includes(response.status()))
  if (response.status() === 200) assert.deepEqual(payload.data.questions, [])
  else assert.equal(payload.data, undefined)
  absent(payload, markers)
}

export async function termOrigin(h, actor, session, card, source) {
  assert.equal(session.term_origin?.id, card.id)
  await sourceHref(h, actor, session.term_origin.origin, source.spec)
}

async function start(h, actor, q, guided) {
  await qButton(actor, 'practice-questions', q).click()
  const receipt = await h.event(actor, sessions, 'POST', guided ? '#practice-start-guided' : '#practice-start', 201)
  assert.deepEqual(receipt.body.question_version_ids, [q.version_id]); assert.match(receipt.key, uuid)
  const { session } = receipt.data
  assert.equal(session.mode, guided ? 'guided' : 'standard')
  await qButton(actor, 'practice-session-questions', q).click()
  await actor.page.locator('#practice-answer').waitFor()
  assert.equal(await actor.page.locator('#practice-prompt-text').innerText(), '选择 · ' + q.prompt)
  assert.equal(await actor.page.locator('#practice-feedback').isVisible(), false)
  const details = await h.api(actor, action(session, 'questions'))
  assert.deepEqual(versions(details.questions), [q.version_id]); assert.equal(details.questions[0].feedback, null)
  absent(details, [q.explanation, 'accepted_answer'])
  return receipt
}

// Hold only delivery of the real Host's POST response. While Chrome still awaits it, use a separate read-only
// SQLite connection and inspect the blind UI. No stub, synthetic reply, second POST or redirected request.
async function answer(h, actor, session, question, value, sequence, grade, independent) {
  const { page } = actor, path = action(session, 'attempts'), url = h.base + path
  const held = Promise.withResolvers()
  async function inspect(route) {
    try {
      const response = await route.fetch({ maxRetries: 0, maxRedirects: 0 })
      assert.equal(response.status(), 201)
      const { data } = await response.json()
      const [row] = h.rows('SELECT * FROM practice_attempts WHERE id=?', data.attempt.id)
      assert(row && row.session_id === session.id && row.user_id === actor.id && row.question_version_id === question.version_id)
      assert.deepEqual([row.sequence, JSON.parse(row.answer_json), row.grading_state, row.independent], [sequence, value, grade, Number(independent)])
      assert.equal(await page.locator('#practice-feedback').isVisible(), false)
      absent(await page.locator('#practice-detail').innerText(), [question.explanation])
      await route.fulfill({ response }); held.resolve(row)
    } catch (error) { held.reject(error); await route.abort().catch(() => {}) }
  }
  await page.locator('#practice-answer').selectOption(String(value))
  await page.route(url, inspect)
  try {
    const [receipt, row] = await Promise.all([h.event(actor, path, 'POST', '#practice-submit', 201), held.promise])
    assert.deepEqual([receipt.data.attempt.id, receipt.data.attempt.sequence, receipt.data.attempt.independent], [row.id, sequence, independent])
    return { ...receipt, row }
  } finally { await page.unroute(url, inspect) }
}

export async function practice(h, A, B, asset, source, card, qs) {
  const { target, wrongVersion } = qs
  await filteredBrowser(h, A, asset, card, [target])
  const aReceipt = await start(h, A, target, true), a = aReceipt.data.session
  assert.equal(aReceipt.body.term_id, card.id); assert.equal(aReceipt.body.mode, 'guided')
  await termOrigin(h, A, a, card, source)
  await termOrigin(h, A, (await h.api(A, action(a, 'questions'))).session, card, source)
  const clean = h.snapshot()
  const replayStart = await h.api(A, sessions, { method: 'POST', data: aReceipt.body, key: aReceipt.key })
  assert.equal(replayStart.replayed, true); assert.equal(replayStart.session.id, a.id)
  await h.deny(A, sessions, { method: 'POST', key: aReceipt.key, data: { question_version_ids: [target.version_id], mode: 'guided' } }, [409])
  const initial = { question_version_id: target.version_id, expected_sequence: 0, answer: qs.incorrect, confidence: 'sure' }
  await h.deny(A, action(a, 'attempts'), post({ ...initial, answer: 99 }), [422])
  await h.deny(A, action(a, 'attempts'), post({ ...initial, question_version_id: wrongVersion.version_id }), [404, 409, 422])
  assert.deepEqual(h.snapshot(), clean)
  h.step('a_blind_first_commit_hint_and_retry')
  const first = await answer(h, A, a, target, qs.incorrect, 1, 'incorrect', true)
  assert.equal(first.data.feedback, null)
  await A.page.locator('#practice-attempts li').first().waitFor()
  assert.equal(await A.page.locator('#practice-feedback').isVisible(), false)
  await h.capture(A, '#practice-detail', 'guided-first-recorded')
  const hint = await h.event(A, action(a, 'hints'), 'POST', '#practice-hint', 201)
  assert.deepEqual([hint.data.hint.level, hint.data.hint.for_sequence], [1, 2])
  await A.page.locator('#practice-hint-text').waitFor()
  const prior = (await h.api(A, action(a, 'questions'))).questions[0]
  assert.equal(prior.feedback, null); assert.equal(prior.attempts[0].id, first.row.id); assert.equal(prior.hints.length, 1)
  const next = await answer(h, A, a, target, qs.answer, 2, 'correct', false)
  assert.equal(next.data.feedback.explanation, target.explanation); assert.equal(next.data.feedback.evidence.id, target.ref.id)
  await A.page.locator('#practice-feedback').filter({ hasText: target.explanation }).waitFor()
  await h.capture(A, '#practice-detail', 'guided-hint-and-second-answer')
  const after = h.snapshot()
  const exact = { method: 'POST', data: first.body, key: first.key }
  const replay = await h.api(A, action(a, 'attempts'), exact)
  assert.equal(replay.replayed, true); assert.equal(replay.attempt.id, first.row.id); assert.equal(replay.feedback, null)
  await h.deny(A, action(a, 'attempts'), { ...exact, data: { ...first.body, answer: qs.answer } }, [409])
  await h.deny(A, action(a, 'attempts'), post(first.body), [409])
  await h.deny(B, action(a, 'attempts'), post(initial))
  assert.deepEqual(h.snapshot(), after)
  h.pass('FIRST_ANSWER_AND_ASSISTANCE', { blind_commit_before_response_delivery: true,
    observations: [first, next].map(({ row }) => ({ sequence: row.sequence, grade: row.grading_state, independent: Boolean(row.independent),
      attempt_sha256: hash(row.id) })), hint_level: hint.data.hint.level, hint_for_sequence: hint.data.hint.for_sequence })

  h.step('feedback_word_and_question_citation_returns')
  await returnToSource(h, A, source, 'feedback-exact-reader-return', '#practice-feedback-return')
  const practiceUrl = h.base + '/knowledgeos/practice?session=' + a.id
  await A.page.goto(practiceUrl)
  await returnToSource(h, A, { ...source, spec: target.ref }, 'question-citation-wider-return', '#practice-source')
  await A.page.goto(practiceUrl)
  await A.page.locator('#practice-feedback').filter({ hasText: target.explanation }).waitFor()

  h.step('b_ordinary_bank_and_private_records')
  await B.page.bringToFront(); await B.page.goto(h.base + '/knowledgeos/practice')
  await B.page.locator('#practice-workspace').waitFor()
  const bReceipt = await start(h, B, target, false), b = bReceipt.data.session
  assert(!Object.hasOwn(bReceipt.body, 'term_id')); assert.equal(b.term_origin ?? null, null); assert.notEqual(a.id, b.id)
  const peer = await answer(h, B, b, target, qs.answer, 1, 'correct', true)
  assert.equal(peer.data.feedback.evidence.id, target.ref.id)
  await B.page.locator('#practice-feedback').filter({ hasText: target.explanation }).waitFor()
  assert.equal(await B.page.locator('#quick-return-reader').isVisible(), false)
  await h.capture(B, '#practice-detail', 'ordinary-bank-peer-first-answer')
  const state = { a, b, first, next, peer, hint, aReceipt }
  await verifyPersonal(h, A, B, qs, state)
  h.pass('TWO_USERS_PERSONAL_RECORDS', { shared_question_version: hash(target.version_id), a_attempts: 2, b_attempts: 1, a_hints: 1, b_hints: 0 })
  return state
}

export async function verifyPersonal(h, A, B, qs, state) {
  const { a, b, first, next, peer } = state, v = qs.target.version_id
  for (const [actor, session, foreign, records, grade, nHints] of [
    [A, a, b, [first, next], 'wrong', 1], [B, b, a, [peer], 'independent_correct', 0],
  ]) {
    const data = await h.api(actor, action(session, 'questions'))
    assert.equal(data.session.id, session.id); assert.deepEqual(versions(data.questions), [v])
    assert.deepEqual(data.questions[0].attempts.map(t => t.id), records.map(r => r.row.id)); assert.equal(data.questions[0].hints.length, nHints)
    const items = (await h.api(actor, review)).items
    assert.deepEqual(items.map(i => [i.session_id, i.question.version_id, i.attempt.id, i.classification]), [[session.id, v, records[0].row.id, grade]])
    assert.deepEqual((await h.api(actor, sessions)).sessions.map(s => s.id), [session.id])
    await h.deny(actor, action(foreign, 'questions'), {}, [403, 404], [foreign.id, qs.target.explanation])
    for (const record of records) assert.deepEqual(h.rows('SELECT * FROM practice_attempts WHERE id=?', record.row.id), [record.row])
    assert.deepEqual(h.rows('SELECT level,for_sequence FROM practice_hint_events WHERE user_id=? AND session_id=?', actor.id, session.id),
      nHints ? [{ level: 1, for_sequence: 2 }] : [])
  }
  if (h.facts.run_kind === 'independent') {
    const counts = h.rows(`SELECT s.user_id, count(DISTINCT a.id) AS attempts, sum(a.independent) AS independent,
      count(DISTINCT h.id) AS assisted_sequences FROM practice_sessions s JOIN practice_session_questions q ON q.session_id=s.id
      JOIN practice_attempts a ON a.session_id=q.session_id AND a.question_version_id=q.question_version_id
      LEFT JOIN practice_hint_events h ON h.session_id=s.id AND h.question_version_id=q.question_version_id AND h.for_sequence=a.sequence
      WHERE q.question_version_id=? GROUP BY s.user_id`, v)
    assert.deepEqual(counts.map(r => [r.user_id === A.id ? 'A' : r.user_id === B.id ? 'B' : '?', r.attempts, r.independent, r.assisted_sequences]).sort(),
      [['A', 2, 1, 1], ['B', 1, 1, 0]])
  }
}

export async function returnToSource(h, actor, source, screen, selector = '#quick-return-reader') {
  const link = actor.page.locator(selector)
  await link.waitFor()
  const href = await link.getAttribute('href')
  if (href !== null) await sourceHref(h, actor, href, source.spec)
  await link.click()
  const measured = await assertMarked(h, actor, source)
  h.facts.reader_returns.push({ control: selector, evidence: screen, ...measured })
  await h.capture(actor, '#text', screen)
}

export async function historyReturn(h, actor, session, question, source, via) {
  const page = actor.page
  await page.bringToFront()
  if (via === 'review') {
    await page.goto(h.base + '/knowledgeos/review'); await page.locator('#review-workspace').waitFor()
    await page.locator('#review-filter').selectOption('wrong')
    await page.locator(`#review-questions [data-question-id="${question.id}"]`).click()
    await page.locator('#review-first').filter({ hasText: '首答原判：错误' }).waitFor()
    const link = page.locator('#review-term-session')
    await link.waitFor()
    await h.capture(actor, '#review-detail', 'personal-review-original-attempt'); await link.click()
  } else {
    await page.goto(h.base + '/knowledgeos/practice'); await historyButton(actor, session).click()
  }
  await page.waitForURL(url => url.pathname === '/knowledgeos/practice' && url.searchParams.get('session') === session.id)
  await page.locator('#practice-feedback').filter({ hasText: question.explanation }).waitFor()
  await returnToSource(h, actor, source, via + '-exact-reader-return')
}
