import assert from 'node:assert/strict'
import { absent, action, bank, hash, prefix, review, sessions, terms, uuid } from '../learn006/host-support.mjs'
import { assertMarked } from '../learn006/host-support-reader.mjs'
import { historyButton } from '../learn006/host-support-practice.mjs'
import { collection, createRecall, recall } from './host-support-fixture.mjs'
import { homes } from './host-support-expectations.mjs'
import { openEntry } from './host-support-workspaces.mjs'

const [library, today] = homes
const slug = home => home.split('/').pop()
const initial = { revision: 0, wrong_reason: '', mastery_state: 'new' }

async function termsFrom(h, actor, workspace, f, own) {
  const { page } = actor, { kept, archived, restricted } = f.cards
  const expected = own ? [kept.id] : []
  await openEntry(h, actor, workspace, 'terms')
  const data = await h.api(actor, collection)
  assert.deepEqual(data.terms.map(t => t.id), expected)
  const cards = page.locator('#personal-terms a[data-term-id]')
  assert.deepEqual(await cards.evaluateAll(nodes => nodes.map(n => n.dataset.termId)), expected)
  absent(await page.locator('#personal-terms').innerText(), [archived.explanation.context, restricted.explanation.context])
  if (own) {
    const card = cards.filter({ hasText: kept.term })
    await card.click()
    await page.locator('#term-professional').filter({ hasText: kept.explanation.professional }).waitFor()
    assert.equal(await page.locator('#term-supplement').inputValue(), kept.supplement)
    const mark = await assertMarked(h, actor, f.source)
    await h.capture(actor, '#term-panel', `favorite-from-${slug(workspace)}`)
    h.facts.objects.push({ from: workspace, type: 'favorite', id_sha256: hash(kept.id), ...mark })
    await openEntry(h, actor, workspace, 'terms')
  } else {
    await page.locator('#term-library-status').filter({ hasText: /没有|暂无|尚无/ }).waitFor()
    await h.deny(actor, `${terms}/${kept.id}`, {}, [403, 404], [kept.supplement])
  }
  const { id, version_id } = f.source.asset
  const select = page.locator('#term-source')
  const options = await select.locator('option').evaluateAll(nodes => nodes.map(o => o.value))
  const selected = options.find(path => {
    const url = new URL(path, h.base)
    return url.origin === h.base && url.pathname === '/knowledgeos/reader' && url.searchParams.get('asset') === id && url.searchParams.get('version') === version_id
  })
  assert(selected)
  absent(options, [f.limited.asset.id, f.limited.asset.version_id])
  await select.selectOption(selected)
  await page.locator('#term-source-open').click()
  await page.locator('#text').filter({ hasText: f.source.word }).waitFor()
  const url = new URL(page.url())
  assert.deepEqual([url.origin, url.pathname, url.searchParams.get('asset'), url.searchParams.get('version')],
    [h.base, '/knowledgeos/reader', id, version_id])
  assert.equal(await page.locator('#text').textContent(), f.source.text)
  h.facts.objects.push({ from: workspace, type: 'source-picker', learner: own ? 'A' : 'B',
    source_version_sha256: hash(version_id), block_sha256: hash(f.source.text) })
}

async function checkRecall(h, actor, material, revision, rating) {
  const result = await h.api(actor, `${recall}/${material.id}`)
  assert.deepEqual([result.material.id, result.material.version_id, result.revision, result.progress.self_rating],
    [material.id, material.version_id, revision, rating])
  const sql = h.rows(`SELECT m.owner_user_id, m.version_id, a.revision,
    (SELECT value FROM recall_events WHERE material_id=m.id AND event='rating' ORDER BY revision DESC LIMIT 1) AS rating
    FROM recall_materials m JOIN recall_attempts a ON a.material_id=m.id WHERE m.id=?`, material.id)
  assert.deepEqual(sql, [{ owner_user_id: actor.id, version_id: material.version_id, revision, rating }])
}

async function recallFrom(h, actor, workspace, material, previous, next, label) {
  const { page } = actor, path = `${recall}/${material.id}`
  await openEntry(h, actor, workspace, 'recall')
  assert.deepEqual((await h.api(actor, recall)).items.map(m => m.id), [material.id])
  const link = page.locator('#materials').getByRole('link', { name: material.title, exact: true })
  const href = await link.getAttribute('href')
  const url = new URL(href, page.url())
  assert.deepEqual([url.origin, url.pathname, url.searchParams.get('material')], [h.base, '/knowledgeos/recall', material.id])
  await link.click()
  await page.locator('#practice-title').filter({ hasText: material.title }).waitFor()
  assert.equal(new URL(page.url()).searchParams.get('material'), material.id)
  const control = page.locator('#rating')
  assert.equal(await control.inputValue(), String(previous.rating ?? ''))
  assert.equal(await page.locator('#practice-text .masked').count() > 0, true)
  await checkRecall(h, actor, material, previous.revision, previous.rating)
  let revision = previous.revision, rating = previous.rating
  if (next !== undefined) {
    await control.selectOption(String(next))
    // Recall identifies the actor in the body. Observe the product click and its real receipt.
    const [reply] = await Promise.all([
      page.waitForResponse(r => r.url() === h.base + path && r.request().method() === 'PATCH'), page.locator('#rate').click(),
    ])
    assert.equal(reply.status(), 200)
    assert.deepEqual(reply.request().postDataJSON(), { actor_id: actor.id, expected_revision: revision, event: 'rating', value: next })
    const { data } = await reply.json()
    revision++; rating = next
    assert.deepEqual([data.actor_id, data.material.id, data.revision, data.progress.self_rating], [actor.id, material.id, revision, rating])
    await page.locator('#progress').filter({ hasText: `自评 ${rating}` }).waitFor()
    assert.equal(await control.inputValue(), String(rating))
    await checkRecall(h, actor, material, revision, rating)
  }
  await h.capture(actor, '#practice', `recall-${label}`)
  h.facts.objects.push({ from: workspace, type: 'recall', record: label, id_sha256: hash(material.id),
    version_sha256: hash(material.version_id), read: previous, saved: { revision, rating } })
  return { revision, rating }
}

async function quickAttempt(h, actor, workspace, f, label) {
  const { page } = actor, q = f.question
  await openEntry(h, actor, workspace, 'quick')
  const button = page.locator(`#practice-questions [data-question-version="${q.version_id}"]`)
  assert((await button.innerText()).includes(q.prompt))
  const { body, data } = await h.event(actor, sessions, 'POST', () => button.click(), 201)
  assert.deepEqual(body.question_version_ids, [q.version_id])
  const { session } = data
  assert.match(session.id, uuid)
  assert.equal(session.mode, 'standard')
  await page.waitForURL(url => url.searchParams.get('session') === session.id)
  await page.locator('#practice-prompt-text').filter({ hasText: q.prompt }).waitFor()
  assert.equal(await page.locator('#practice-feedback').isVisible(), false)
  await page.locator('#practice-answer').selectOption(String(f.incorrect))
  const receipt = await h.event(actor, action(session, 'attempts'), 'POST', '#practice-submit', 201)
  const attempt = receipt.data.attempt
  assert.deepEqual([receipt.body.question_version_id, attempt.sequence, attempt.grading_state, attempt.independent], [q.version_id, 1, 'incorrect', true])
  assert.equal(receipt.data.feedback.evidence.id, f.citation.id)
  await page.locator('#practice-feedback').filter({ hasText: f.explanation }).waitFor()
  assert.deepEqual(h.rows('SELECT user_id,session_id,question_version_id,grading_state,sequence FROM practice_attempts WHERE id=?', attempt.id),
    [{ user_id: actor.id, session_id: session.id, question_version_id: q.version_id, grading_state: 'incorrect', sequence: 1 }])
  await h.capture(actor, '#practice-detail', `quick-${label}`)
  h.facts.objects.push({ from: workspace, type: 'quick-answer', learner: label, session_sha256: hash(session.id),
    question_version_sha256: hash(q.version_id), attempt_sha256: hash(attempt.id), first_grade: attempt.grading_state })
  return { session, attempt }
}

async function historyFrom(h, actor, workspace, f, record) {
  await openEntry(h, actor, workspace, 'quick')
  const { page } = actor
  await historyButton(actor, record.session).click()
  await page.waitForURL(url => url.searchParams.get('session') === record.session.id)
  await page.locator('#practice-feedback').filter({ hasText: f.explanation }).waitFor()
  assert.equal(await page.locator('#practice-attempts li').count(), 1)
  const { session, questions } = await h.api(actor, action(record.session, 'questions'))
  assert.deepEqual([session.id, questions[0].version_id, questions[0].attempts.map(r => r.id)],
    [record.session.id, f.question.version_id, [record.attempt.id]])
  assert.deepEqual((await h.api(actor, sessions)).sessions.map(s => s.id), [session.id])
  h.facts.objects.push({ from: workspace, type: 'quick-history', session_sha256: hash(session.id),
    question_version_sha256: hash(questions[0].version_id), attempt_sha256: hash(record.attempt.id) })
}

async function checkReview(h, actor, f, record, expected) {
  const items = (await h.api(actor, review)).items
  assert.equal(items.length, 1)
  const [item] = items
  assert.deepEqual([item.question.id, item.question.version_id, item.session_id, item.attempt.id, item.classification],
    [f.question.id, f.question.version_id, record.session.id, record.attempt.id, 'wrong'])
  const state = { revision: item.state.revision, wrong_reason: item.state.wrong_reason, mastery_state: item.state.mastery_state }
  assert.deepEqual(state, expected)
  const sql = h.rows('SELECT revision,wrong_reason,mastery_state FROM personal_question_states WHERE question_id=? AND user_id=?', f.question.id, actor.id)
  assert.deepEqual(sql, expected.revision === 0 ? [] : [expected])
}

async function reviewFrom(h, actor, workspace, f, record, previous, next, label) {
  const { page } = actor
  await openEntry(h, actor, workspace, 'review')
  await page.locator('#review-filter').selectOption('wrong')
  const button = page.locator(`#review-questions [data-question-id="${f.question.id}"]`)
  await button.click()
  await page.locator('#review-first').filter({ hasText: '首答原判：错误' }).waitFor()
  assert.equal(await page.locator('#review-title').innerText(), f.question.prompt)
  const href = await page.locator('#review-attempt-link').getAttribute('href')
  assert.equal(new URL(href, h.base).searchParams.get('session'), record.session.id)
  const reason = page.locator('#review-reason'), mastery = page.locator('#review-mastery')
  assert.deepEqual([await reason.inputValue(), await mastery.inputValue()], [previous.wrong_reason, previous.mastery_state])
  await checkReview(h, actor, f, record, previous)
  let saved = previous
  if (next) {
    await reason.fill(next.wrong_reason)
    await mastery.selectOption(next.mastery_state)
    const { data, body } = await h.event(actor, `${prefix}/me/question-states/${f.question.id}`, 'PATCH', '#review-save', 200)
    saved = { revision: previous.revision + 1, ...next }
    assert.deepEqual([body.expected_revision, data.state.revision, data.state.wrong_reason, data.state.mastery_state],
      [previous.revision, saved.revision, saved.wrong_reason, saved.mastery_state])
    await checkReview(h, actor, f, record, saved)
  }
  await h.capture(actor, '#review-detail', `review-${label}`)
  const summary = state => ({ revision: state.revision, mastery: state.mastery_state, reason_sha256: hash(state.wrong_reason) })
  h.facts.objects.push({ from: workspace, type: 'review', record: label, question_sha256: hash(f.question.id),
    question_version_sha256: hash(f.question.version_id), attempt_sha256: hash(record.attempt.id), read: summary(previous), saved: summary(saved) })
  return saved
}

export async function checkRecords(h, a, b, f, independent) {
  const firstRating = independent ? 3 : 2, lastRating = independent ? 5 : 4
  const first = { revision: 1, rating: null }
  h.step('library_favorite_quick_first_answer_and_personal_writes')
  await termsFrom(h, a, library, f, true)
  const record = await quickAttempt(h, a, library, f, 'a')
  const r1 = await recallFrom(h, a, library, f.material, first, firstRating, 'a-library-write')
  const s1 = await reviewFrom(h, a, library, f, record, initial, { mastery_state: 'reviewing', wrong_reason: '把后一处词读成日期' }, 'a-library-write')

  h.step('today_reads_same_records_and_updates_them')
  await termsFrom(h, a, today, f, true)
  await historyFrom(h, a, today, f, record)
  const r2 = await recallFrom(h, a, today, f.material, r1, lastRating, 'a-today-write')
  const s2 = await reviewFrom(h, a, today, f, record, s1, { mastery_state: 'mastered', wrong_reason: '已经核对后一处固定原文' }, 'a-today-write')

  h.step('second_account_empty_personal_views_over_readable_source_and_question')
  await termsFrom(h, b, today, f, false)
  await openEntry(h, b, library, 'recall')
  await b.page.locator('#status').filter({ hasText: /暂无|没有/ }).waitFor()
  assert.equal(await b.page.locator('#materials a').count(), 0)
  assert.deepEqual((await h.api(b, recall)).items, [])
  await h.deny(b, `${recall}/${f.material.id}`, {}, [403, 404], [f.material.title])
  await openEntry(h, b, today, 'review')
  await b.page.locator('#review-empty').waitFor()
  assert.equal(await b.page.locator('#review-questions [data-question-id]').count(), 0)
  assert.deepEqual((await h.api(b, review)).items, [])
  await h.capture(b, '#review-empty', 'peer-review-empty')
  await openEntry(h, b, library, 'quick')
  await b.page.locator('#practice-no-history').waitFor()
  assert.equal(await b.page.locator('#practice-history button').count(), 0)
  assert.deepEqual((await h.api(b, sessions)).sessions, [])
  assert((await h.api(b, bank)).questions.some(q => q.version_id === f.question.version_id))
  await h.deny(b, action(record.session, 'questions'))

  h.step('second_account_writes_own_state_on_shared_source_and_question')
  const peer = await quickAttempt(h, b, today, f, 'b')
  assert.notEqual(peer.session.id, record.session.id)
  assert.notEqual(peer.attempt.id, record.attempt.id)
  const other = await createRecall(h, b, f.source, '乙的遮挡练习')
  assert.notEqual(other.id, f.material.id)
  const peerRecall = await recallFrom(h, b, today, other, first, 1, 'b-today-write')
  const peerReview = await reviewFrom(h, b, today, f, peer, initial, { mastery_state: 'reviewing', wrong_reason: '乙需重读资料' }, 'b-today-write')
  await h.deny(a, `${recall}/${other.id}`, {}, [403, 404], [other.title])
  await h.deny(a, action(peer.session, 'questions'))

  h.step('library_reopens_final_records_after_peer_writes')
  await recallFrom(h, a, library, f.material, r2, undefined, 'a-library-reopen')
  await reviewFrom(h, a, library, f, record, s2, undefined, 'a-library-reopen')
  await historyFrom(h, a, library, f, record)
  await checkRecall(h, b, other, peerRecall.revision, peerRecall.rating)
  await checkReview(h, b, f, peer, peerReview)
  const audit = h.rows(`SELECT a.user_id,a.question_version_id,a.id AS attempt_id,s.revision,s.mastery_state
    FROM practice_attempts a JOIN question_versions v ON v.id=a.question_version_id
    JOIN personal_question_states s ON s.question_id=v.question_id AND s.user_id=a.user_id AND s.service_id=a.service_id
    WHERE v.question_id=? ORDER BY s.revision`, f.question.id)
  assert.deepEqual(audit.map(r => [r.user_id, r.question_version_id, r.attempt_id, r.revision, r.mastery_state]), [
    [b.id, f.question.version_id, peer.attempt.id, 1, peerReview.mastery_state], [a.id, f.question.version_id, record.attempt.id, 2, s2.mastery_state],
  ])
  assert.deepEqual(h.rows('SELECT revision,value FROM recall_events WHERE material_id=? ORDER BY revision', f.material.id),
    [{ revision: r1.revision, value: firstRating }, { revision: r2.revision, value: lastRating }])
  h.pass('PERSISTED_LEARNING_STATE', { workspaces: [library, today, library], recall_revisions: [first.revision, r1.revision, r2.revision],
    ratings: [first.rating, r1.rating, r2.rating], review_revisions: [initial.revision, s1.revision, s2.revision],
    mastery: [initial.mastery_state, s1.mastery_state, s2.mastery_state] })
  h.pass('SHARED_PERSONAL_OBJECTS', { readable_common_source: true, shared_question_version_sha256: hash(f.question.version_id),
    same_material_sha256: hash(f.material.id), same_favorite_sha256: hash(f.cards.kept.id), same_attempt_sha256: hash(record.attempt.id),
    distinct_sessions: 2, distinct_first_attempts: 2, peer_initially_empty: ['terms','history','recall','review'] })
  h.pass('READABLE_FAVORITES_AND_READER', { hidden_archived: true, hidden_revoked: true, kept_id_sha256: hash(f.cards.kept.id) })
}
