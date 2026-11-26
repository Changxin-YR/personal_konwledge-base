const protectedKeys = new Set(['answer', 'answers', 'accepted_answer', 'accepted_answers', 'explanation', 'is_correct'])
const choice = {
  kind: 'choice', prompt: 'LEARN001 shared selection', options: ['bounded retry', 'unbounded retry'],
  answer: 1, explanation: 'LEARN001_CHOICE_FEEDBACK uses a bounded retry.',
}
const judgment = {
  kind: 'judgment', prompt: 'LEARN001 shared judgment', answer: true,
  explanation: 'LEARN001_JUDGE_FEEDBACK follows the pinned source.',
}
const fill = {
  kind: 'fill', prompt: 'LEARN001 shared fill', answer: ['poll limit', 'retry cap'],
  explanation: 'LEARN001_FILL_FEEDBACK recognizes both rule-bound aliases.',
}
const separate = {
  kind: 'choice', prompt: 'LEARN001_PRIVATE_BANK', options: ['left', 'right'], answer: 2,
  explanation: 'LEARN001_PRIVATE_FEEDBACK',
}
const control = {
  kind: 'judgment', prompt: 'LEARN001 unrelated project control', answer: false,
  explanation: 'LEARN001_CONTROL_FEEDBACK',
}
const learnerSecrets = ['LEARN001_CHOICE_FEEDBACK', 'LEARN001_JUDGE_FEEDBACK', 'LEARN001_FILL_FEEDBACK', 'LEARN001_PRIVATE_FEEDBACK', 'poll limit', 'retry cap']
const denied = new Set([401, 403, 404])
const answerFiles = ['questions', 'question_versions', 'practice_sessions', 'practice_session_questions', 'practice_attempts', 'practice_attempt_receipts']

function firstUnsubmitted(list, versionId) {
  return list.find(question => question.version_id === versionId || question.question_version_id === versionId)
}

function assertProjection(assert, value) {
  if (Array.isArray(value)) return value.forEach(item => assertProjection(assert, item))
  if (!value || typeof value !== 'object') return
  for (const [key, entry] of Object.entries(value)) {
    assert(!protectedKeys.has(key), 'unrevealed answer field ' + key)
    assertProjection(assert, entry)
  }
}

function withoutSecrets(assert, raw, include = learnerSecrets) {
  for (const secret of include) assert(!raw.includes(secret), 'answer or explanation leaked before authorization')
}

const auth = actor => ({ 'x-knowledgeos-reader-actor': actor.id })
const mutationHeaders = (actor, idempotency) => ({ ...auth(actor), ...idempotency() })
export async function run(h) {
  const { assert, base, prefix, owner, learnerA, learnerB, outsider, project, evidence, sourceGrantA,
    step, pass, request, wire, idempotency, readRows, writeFixture, capture, login, boot, stopHost, currentProject, source, shareSource, upgradeSource } = h
  const questions = prefix + '/questions', sessions = prefix + '/practice-sessions', web = '/knowledgeos/practice'
  const author = question => questions + '/' + question.id + '/author'
  const view = session => sessions + '/' + session.id + '/questions'
  const attemptPath = session => sessions + '/' + session.id + '/attempts'
  const add = (draft, scope, citation = evidence.citation) => request(owner, questions, 'POST', {
    ...draft, source_citation_id: citation.id, ...(scope ? { project_id: scope } : {}),
  }, { status: 201, headers: mutationHeaders(owner, idempotency) }).then(data => data.question)
  const create = (actor, list, headers = mutationHeaders(actor, idempotency)) => request(actor, sessions, 'POST', {
    question_version_ids: list.map(question => question.version_id),
  }, { status: 201, headers }).then(data => data.session)
  const send = (actor, session, question, seq, answer, confidence = 'sure', headers = mutationHeaders(actor, idempotency)) =>
    wire(actor, attemptPath(session), 'POST', { question_version_id: question.version_id, expected_sequence: seq, answer, confidence }, headers)
  const snapshot = () => Object.fromEntries(answerFiles.map(table => [
    table, readRows('SELECT * FROM ' + table + ' ORDER BY rowid'),
  ]))
  async function openPractice(actor, session, question) {
    const page = actor.page
    await page.bringToFront()
    await page.goto(base + web + '?' + new URLSearchParams({ session: session.id }))
    await page.locator('#practice-session-questions [data-question-version="' + question.version_id + '"]').click()
    await page.locator('#practice-answer').waitFor()
    return page
  }
  async function submitInChrome(actor, session, answer, confidence) {
    const page = actor.page, field = page.locator('#practice-answer')
    if (typeof answer === 'string') await field.fill(answer)
    else await field.selectOption(String(answer))
    await page.locator('#practice-confidence').selectOption(confidence)
    const [response] = await Promise.all([
      page.waitForResponse(value => value.url() === base + attemptPath(session) && value.request().method() === 'POST'),
      page.locator('#practice-submit').click(),
    ])
    const key = response.request().headers()['idempotency-key']
    assert(key, 'interactive submissions need a stable replay key')
    return {
      status: response.status(), payload: await response.json(), cache: response.headers()['cache-control'],
      key: { ...auth(actor), 'idempotency-key': key },
    }
  }
  async function noAnswer(actor, path, statuses, markers = learnerSecrets) {
    const result = await wire(actor, path)
    assert(statuses.includes(result.status), 'unexpected status for protected answer read ' + result.status)
    withoutSecrets(assert, result.raw, markers)
    assertProjection(assert, result.payload)
    return result
  }
  function submitted(result, answer, want, sequence, confidence = 'sure') {
    assert.equal(result.status, 201, result.payload?.code)
    assert.match(result.cache ?? '', /no-store/i)
    const { attempt, feedback } = result.payload.data
    assert(attempt?.id)
    assert.equal(attempt.sequence, sequence)
    assert.equal(attempt.confidence, confidence)
    assert.equal(attempt.answer, answer)
    assert.equal(attempt.grading_state, want)
    assert.equal(new Date(attempt.submitted_at).toISOString(), attempt.submitted_at)
    assert(feedback?.explanation && feedback?.grading_rule)
    return { attempt, feedback }
  }
  function isolateRow(id) {
    const result = readRows('SELECT * FROM practice_attempts WHERE id=?', id)
    assert.equal(result.length, 1, 'acknowledged attempt must exist in SQLite exactly once')
    return result[0]
  }

  step('three actual author writes, fixed Reader source, shared learner projection')
  const [chosen, judged, filled, privateQuestion] = [
    await add(choice, project.id), await add(judgment, project.id), await add(fill, project.id), await add(separate),
  ]
  for (const [actual, spec] of [[chosen, choice], [judged, judgment], [filled, fill]]) {
    assert.equal(actual.kind, spec.kind)
    assert.equal(actual.prompt, spec.prompt)
    assert.equal(actual.project_id, project.id)
    assert(actual.id && actual.version_id)
  }
  assert.equal(new Set([chosen.id, judged.id, filled.id, privateQuestion.id]).size, 4)
  assert.equal(new Set([chosen.version_id, judged.version_id, filled.version_id, privateQuestion.version_id]).size, 4)
  const authored = await wire(owner, author(chosen))
  assert.equal(authored.status, 200)
  assert(authored.raw.includes('LEARN001_CHOICE_FEEDBACK'))
  for (const actor of [learnerA, learnerB]) {
    const available = await noAnswer(actor, questions, [200])
    const visible = available.payload.data.questions
    for (const shared of [chosen, judged, filled]) {
      assert(visible.some(question => question.id === shared.id && question.version_id === shared.version_id))
    }
    assert(!visible.some(question => question.id === privateQuestion.id))
    assert(!available.raw.includes(separate.prompt))
    await noAnswer(actor, author(chosen), [404])
    await noAnswer(actor, author(privateQuestion), [404])
  }
  const outer = await noAnswer(outsider, questions, [200], [...learnerSecrets, choice.prompt, judgment.prompt, fill.prompt, separate.prompt])
  assert(!outer.payload.data.questions.some(question => question.id === chosen.id))
  await noAnswer(null, questions, [...denied])

  const other = await currentProject(owner, [outsider], learnerA, 'Unrelated synthetic LEARN001 project')
  const otherEvidence = await source(owner, 'LEARN001_OTHER_SOURCE')
  await shareSource(owner, [outsider], otherEvidence.asset)
  const otherQuestion = await add(control, other.id, otherEvidence.citation)
  const outsiderControl = await create(outsider, [otherQuestion])
  const controlAttempt = submitted(await send(outsider, outsiderControl, otherQuestion, 0, false), false, 'correct', 1)
  assert.equal(controlAttempt.feedback.explanation, control.explanation)

  step('two current members share fixed question versions with separate private practice sessions')
  const list = [chosen, judged, filled]
  const sessionA = await create(learnerA, list)
  const sessionB = await create(learnerB, list)
  assert(sessionA.id && sessionB.id && sessionA.id !== sessionB.id)
  for (const [actor, session] of [[learnerA, sessionA], [learnerB, sessionB]]) {
    const projected = await noAnswer(actor, view(session), [200])
    assert.match(projected.cache ?? '', /no-store/i)
    for (const question of list) {
      const result = firstUnsubmitted(projected.payload.data.questions, question.version_id)
      assert(result, 'practice omitted an original question version')
      assert.deepEqual(result.attempts, [])
      assert.equal(result.feedback, null)
    }
  }
  const privateDenied = await wire(learnerA, sessions, 'POST', { question_version_ids: [privateQuestion.version_id] }, mutationHeaders(learnerA, idempotency))
  assert.equal(privateDenied.status, 404)
  withoutSecrets(assert, privateDenied.raw, [...learnerSecrets, separate.prompt])
  const outsideDenied = await wire(outsider, sessions, 'POST', { question_version_ids: [chosen.version_id] }, mutationHeaders(outsider, idempotency))
  assert.equal(outsideDenied.status, 404)
  withoutSecrets(assert, outsideDenied.raw, [...learnerSecrets, choice.prompt])
  await noAnswer(learnerB, view(sessionA), [404])
  await noAnswer(outsider, view(sessionA), [404])
  await noAnswer(owner, view(sessionA), [404])

  step('first incorrect answer committed, corrected second answer distinct, B still blind')
  const pageA = await openPractice(learnerA, sessionA, chosen)
  withoutSecrets(assert, await pageA.content())
  await capture(pageA, 'learner-first-view-blind')
  const firstResponse = await submitInChrome(learnerA, sessionA, 2, 'unsure')
  const firstKey = firstResponse.key
  const first = submitted(firstResponse, 2, 'incorrect', 1, 'unsure')
  assert.equal(first.feedback.explanation, choice.explanation)
  const storedFirst = isolateRow(first.attempt.id)
  assert.equal(first.attempt.independent, true)
  await pageA.locator('#practice-feedback').filter({ hasText: choice.explanation }).waitFor()
  const stillBlind = await noAnswer(learnerB, view(sessionB), [200])
  assert.deepEqual(firstUnsubmitted(stillBlind.payload.data.questions, chosen.version_id).attempts, [])
  const pageB = await openPractice(learnerB, sessionB, chosen)
  withoutSecrets(assert, await pageB.content())
  const secondLearner = submitted(await submitInChrome(learnerB, sessionB, 1, 'sure'), 1, 'correct', 1)
  assert.equal(secondLearner.attempt.independent, true)
  await pageA.bringToFront()
  const later = submitted(await submitInChrome(learnerA, sessionA, 1, 'sure'), 1, 'correct', 2)
  assert.equal(later.attempt.independent, false)
  await pageA.locator('#practice-feedback').filter({ hasText: choice.explanation }).waitFor()
  await capture(pageA, 'learner-first-and-second')
  assert.equal(new Set([first.attempt.id, later.attempt.id, secondLearner.attempt.id]).size, 3)
  assert.deepEqual(isolateRow(first.attempt.id), storedFirst)
  assert.equal(isolateRow(secondLearner.attempt.id).user_id, learnerB.id)
  assert.equal(storedFirst.user_id, learnerA.id)
  assert.equal(storedFirst.question_version_id, chosen.version_id)
  const reviewedA = (await request(learnerA, view(sessionA))).questions
  const reviewedB = (await request(learnerB, view(sessionB))).questions
  assert.deepEqual(firstUnsubmitted(reviewedA, chosen.version_id).attempts.map(item => item.id), [first.attempt.id, later.attempt.id])
  assert.deepEqual(firstUnsubmitted(reviewedB, chosen.version_id).attempts.map(item => item.id), [secondLearner.attempt.id])
  const repro = await create(learnerA, [chosen])
  await noAnswer(learnerA, view(repro), [200])
  const known = submitted(await send(learnerA, repro, chosen, 0, 1), 1, 'correct', 1)
  assert.equal(known.attempt.independent, false, 'prior answer exposure survives opening another session')
  pass('T01_first_answer_and_members', { first_sequence: first.attempt.sequence, correction_sequence: later.attempt.sequence, peer_sequence: secondLearner.attempt.sequence, shared_question_versions: list.length })

  step('idempotency collision and concurrent sequence guard leave durable history unchanged')
  const beforeReplay = snapshot()
  const replay = await send(learnerA, sessionA, chosen, 0, 2, 'unsure', firstKey)
  assert.equal(replay.status, 200)
  assert.equal(replay.payload.data.replayed, true)
  assert.equal(replay.payload.data.attempt.id, first.attempt.id)
  const collision = await send(learnerA, sessionA, chosen, 0, 1, 'unsure', firstKey)
  assert.deepEqual([collision.status, collision.payload?.code], [409, 'IDEMPOTENCY_CONFLICT'])
  const stale = await send(learnerA, sessionA, chosen, 0, 1)
  assert.deepEqual([stale.status, stale.payload?.code], [409, 'ATTEMPT_SEQUENCE_CONFLICT'])
  withoutSecrets(assert, collision.raw)
  withoutSecrets(assert, stale.raw)
  const cross = await send(learnerB, sessionA, chosen, 2, 1, 'sure', { ...firstKey, ...auth(learnerB) })
  assert.equal(cross.status, 404)
  withoutSecrets(assert, cross.raw)
  assert.deepEqual(snapshot(), beforeReplay)
  const stringBoolean = await send(learnerA, sessionA, judged, 0, 'true')
  assert.equal(stringBoolean.status, 422)
  withoutSecrets(assert, stringBoolean.raw)
  const [judgeA, judgeB] = await Promise.all([
    send(learnerA, sessionA, judged, 0, true),
    send(learnerA, sessionA, judged, 0, true),
  ])
  assert.deepEqual([judgeA.status, judgeB.status].sort(), [201, 409])
  const boolean = submitted([judgeA, judgeB].find(item => item.status === 201), true, 'correct', 1)
  isolateRow(boolean.attempt.id)
  const normalized = ' ＰＯＬＬ　ＬＩＭＩＴ '
  await openPractice(learnerA, sessionA, filled)
  const alias = submitted(await submitInChrome(learnerA, sessionA, normalized, 'sure'), normalized, 'correct', 1)
  assert.equal(alias.feedback.explanation, fill.explanation)
  assert.deepEqual(alias.feedback.accepted_answer, fill.answer)
  assert.equal(alias.feedback.evidence.id, evidence.citation.id)
  assert.equal(alias.feedback.evidence.version_id, evidence.asset.version_id)
  assert.equal(alias.feedback.evidence.quote_hash, evidence.citation.quote_hash)
  const sourceURL = new URL(alias.feedback.evidence.href, base)
  assert.equal(sourceURL.origin, base)
  assert.equal(sourceURL.searchParams.get('version'), evidence.asset.version_id)
  assert.equal(sourceURL.searchParams.get('citation'), evidence.citation.id)
  isolateRow(alias.attempt.id)
  await openPractice(learnerB, sessionB, filled)
  const uncertain = submitted(await submitInChrome(learnerB, sessionB, 'depends on the system', 'unsure'), 'depends on the system', 'disputed', 1, 'unsure')
  isolateRow(uncertain.attempt.id)
  await upgradeSource(owner, evidence.asset, 'LEARN001_UPDATED_FIXTURE_NO_FIRST_VERSION_MARKER\n')
  await openPractice(learnerA, sessionA, filled)
  const pinnedLink = learnerA.page.locator('#practice-feedback a')
  await pinnedLink.waitFor()
  assert.equal(new URL(await pinnedLink.getAttribute('href'), base).href, sourceURL.href)
  await learnerA.page.goto(sourceURL.href)
  await learnerA.page.locator('#text').filter({ hasText: 'LEARN001_FIXTURE_SOURCE' }).waitFor()
  assert(!(await learnerA.page.locator('#text').textContent()).includes('LEARN001_UPDATED_FIXTURE_NO_FIRST_VERSION_MARKER'))
  await capture(learnerA.page, 'learner-fixed-v1-source-after-update')
  pass('T01', { all_three_types: true, normalized_fill_alias: true, ambiguous_fill_disputed: true, cross_learner_answers_distinct: true })

  step('SQLite fault cannot reveal answer and retry inserts exactly one first receipt')
  const attemptBeforeFault = snapshot()
  const faultKey = mutationHeaders(learnerB, idempotency)
  for (const table of ['practice_attempts', 'practice_attempt_receipts']) {
    writeFixture("CREATE TRIGGER learn001_attempt_fault BEFORE INSERT ON " + table + " BEGIN SELECT RAISE(ABORT,'LEARN001 fixture only'); END")
    try {
      const failed = await send(learnerB, sessionB, judged, 0, true, 'sure', faultKey)
      assert(failed.status >= 400)
      withoutSecrets(assert, failed.raw)
      assertProjection(assert, failed.payload)
      assert.deepEqual(snapshot(), attemptBeforeFault)
      const current = await request(learnerB, view(sessionB))
      const pending = firstUnsubmitted(current.questions, judged.version_id)
      assert.deepEqual(pending.attempts, [])
      assert.equal(pending.feedback, null)
    } finally {
      writeFixture('DROP TRIGGER learn001_attempt_fault')
    }
  }
  const afterRetry = submitted(await send(learnerB, sessionB, judged, 0, true, 'sure', faultKey), true, 'correct', 1)
  const afterRetrySnapshot = snapshot()
  const recoveredReplay = await send(learnerB, sessionB, judged, 0, true, 'sure', faultKey)
  assert.equal(recoveredReplay.status, 200)
  assert.equal(recoveredReplay.payload.data.attempt.id, afterRetry.attempt.id)
  assert.deepEqual(snapshot(), afterRetrySnapshot)
  pass('T02_fault_before_answer', { abort_leaves_no_attempt: true, reveal_blocked: true, same_key_retry_one_attempt: true })

  step('source revocation while A remains a project member clears open practice and blocks replay')
  const displayed = await openPractice(learnerA, sessionA, chosen)
  await displayed.locator('#practice-feedback').filter({ hasText: choice.explanation }).waitFor()
  const grantPath = prefix + '/invitations/' + sourceGrantA.id
  const currentGrant = await request(owner, grantPath)
  await request(owner, grantPath + '/revoke', 'POST', { actor_id: owner.id, expected_revision: currentGrant.revision }, { headers: idempotency() })
  await displayed.locator('#practice-detail').waitFor({ state: 'hidden' })
  withoutSecrets(assert, await displayed.content())
  assert.equal((await wire(learnerA, prefix + '/citations/' + evidence.citation.id + '/resolve')).status, 404)
  assert.equal((await wire(learnerA, prefix + '/project-tasks/projects/' + project.id + '/members')).status, 200)
  await noAnswer(learnerA, view(sessionA), [404])
  const afterRevoke = await send(learnerA, sessionA, chosen, 0, 2, 'unsure', firstKey)
  assert.equal(afterRevoke.status, 404)
  withoutSecrets(assert, afterRevoke.raw)
  assert.deepEqual(snapshot(), afterRetrySnapshot)
  assert((await request(learnerB, view(sessionB))).questions.some(q => firstUnsubmitted([q], chosen.version_id)))
  await capture(displayed, 'learner-source-revoked')

  step('practice history survives a clean isolated Host restart')
  await stopHost()
  await boot()
  const freshB = await login(learnerB.name)
  assert.equal(freshB.id, learnerB.id)
  assert.equal((await request(freshB, view(sessionB))).questions.length, list.length)
  assert.deepEqual(snapshot(), afterRetrySnapshot)
  const historyPage = await openPractice(freshB, sessionB, chosen)
  await historyPage.locator('#practice-feedback').filter({ hasText: choice.explanation }).waitFor()
  await capture(historyPage, 'learner-bank-after-restart')
  pass('restart_preserves_attempts_and_version_ids', { exact_count: snapshot().practice_attempts.length, private_history_retained: true })

  step('membership revocation while B retains source access clears the protected practice')
  const removePath = prefix + '/project-tasks/projects/' + project.id + '/members'
  await request(owner, removePath, 'POST', { actor_id: owner.id, remove_member_id: freshB.id })
  await historyPage.locator('#practice-detail').waitFor({ state: 'hidden' })
  withoutSecrets(assert, await historyPage.content())
  assert.equal((await wire(freshB, prefix + '/citations/' + evidence.citation.id + '/resolve')).status, 200)
  await noAnswer(freshB, view(sessionB), [404])
  assert.equal((await send(freshB, sessionB, chosen, 0, 1)).status, 404)
  assert.equal((await request(outsider, view(outsiderControl))).questions[0].feedback.explanation, control.explanation)
  assert.deepEqual(snapshot(), afterRetrySnapshot)
  pass('T02', { idempotency_preserves_history: true, cross_session_404: true, revoked_receipt_404: true,
    independent_source_and_membership_revoke: true, unrelated_project_continues: true })
}
