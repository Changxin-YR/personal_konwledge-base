const questionDrafts = [
  { kind: 'choice', prompt: '重试应该如何控制？', options: ['限次重试','无界重试'], answer: '1', explanation: 'MAIN-LEARN001-CHOICE 有界重试约束次数。' },
  { kind: 'judgment', prompt: '已知上限时仍可无界重试。', answer: '错误', explanation: 'MAIN-LEARN001-JUDGMENT 应遵守上限。' },
  { kind: 'fill', prompt: '填写有限重试的缩写或等价表达。', answer: 'FINITE\n有界重试', explanation: 'MAIN-LEARN001-FILL 支持规范化后的等价表达。' },
]

export async function run(h) {
  const { assert, base, prefix, owner, learnerA, learnerB, outsider, project, evidence, sourceGrantA,
    step, pass, request, wire, idempotency, readRows, capture } = h
  const bank = prefix + '/questions', api = prefix + '/practice-sessions', page = '/knowledgeos/practice'
  const view = session => api + '/' + session.id + '/questions'
  const attempts = session => api + '/' + session.id + '/attempts'
  const header = actor => ({ 'x-knowledgeos-reader-actor': actor.id, ...idempotency() })
  const snapshot = () => ['practice_attempts','practice_attempt_receipts'].map(table => readRows('SELECT * FROM ' + table + ' ORDER BY rowid'))
  const product = actor => actor.page
  const activeQuestion = (actor, question) => product(actor).locator('#practice-session-questions [data-question-version="' + question.version_id + '"]')
  const read = (actor, session, q) => request(actor, view(session)).then(result => result.questions.find(row => row.version_id === q.version_id))
  const written = (question, answer, expected_sequence) => ({ question_version_id: question.version_id, answer, expected_sequence, confidence: 'sure' })

  async function postInChrome(actor, path, control) {
    const wait = product(actor).waitForResponse(result => result.url() === base + path && result.request().method() === 'POST')
    await product(actor).locator(control).click()
    const result = await wait, payload = await result.json()
    assert.equal(result.status(), 201, payload.code)
    assert.equal(payload.data.actor_id, actor.id)
    return { data: payload.data, key: result.request().headers()['idempotency-key'], payload: result.request().postDataJSON() }
  }
  async function author(spec) {
    await product(owner).locator('#practice-kind').selectOption(spec.kind)
    await product(owner).locator('#practice-prompt').fill(spec.prompt)
    if (spec.options) await product(owner).locator('#practice-options').fill(spec.options.join('\n'))
    await product(owner).locator('#practice-author-answer').fill(spec.answer)
    await product(owner).locator('#practice-explanation').fill(spec.explanation)
    await product(owner).locator('#practice-citation').fill(evidence.citation.id)
    await product(owner).locator('#practice-project').selectOption(project.id)
    const { data } = await postInChrome(owner, bank, '#practice-create')
    assert.equal(data.question.kind, spec.kind)
    assert.equal(data.question.project_id, project.id)
    assert.equal(data.question.author_id, owner.id)
    assert(!JSON.stringify(data).includes('MAIN-LEARN001-'))
    return data.question
  }
  async function open(actor, suffix = '') {
    await product(actor).bringToFront()
    await product(actor).goto(base + page + suffix)
    await product(actor).locator('#practice-workspace').waitFor()
  }
  async function start(actor, values) {
    await open(actor)
    for (const question of values) await product(actor).locator('#practice-questions [data-question-version="' + question.version_id + '"]').click()
    const { data } = await postInChrome(actor, api, '#practice-start')
    await product(actor).locator('#practice-detail').waitFor()
    return data.session
  }
  async function answer(actor, session, question, value) {
    await activeQuestion(actor, question).click()
    const input = product(actor).locator('#practice-answer')
    if (question.kind === 'fill') await input.fill(String(value))
    else await input.selectOption(String(value))
    const result = await postInChrome(actor, attempts(session), '#practice-submit')
    await product(actor).locator('#practice-feedback').waitFor()
    return result
  }

  step('T01 author creates three sourced question types in the real Chrome workspace')
  await open(owner, '?citation=' + evidence.citation.id)
  assert.equal(await product(owner).locator('#practice-citation').inputValue(), evidence.citation.id)
  const values = []
  for (const draft of questionDrafts) values.push(await author(draft))
  const [choice, judgment, fill] = values
  const a = await start(learnerA, values), b = await start(learnerB, values)
  for (const actor of [learnerA, learnerB]) {
    const session = actor === learnerA ? a : b
    const result = await request(actor, view(session))
    assert.deepEqual(result.questions.map(row => row.version_id), values.map(row => row.version_id))
    assert(result.questions.every(row => row.feedback === null && row.attempts.length === 0))
    assert(!JSON.stringify(result).includes('MAIN-LEARN001-'))
  }
  const untouched = await request(outsider, bank)
  assert(untouched.questions.every(row => !values.some(value => value.id === row.id)))
  const noAuthor = await wire(learnerA, bank + '/' + choice.id + '/author')
  assert.equal(noAuthor.status, 404)
  const noOtherSession = await wire(learnerA, view(b))
  assert.equal(noOtherSession.status, 404)
  await capture(product(learnerA), 'learner-before-first-answer')

  step('T01 first answer is committed before feedback, then correction appends')
  const first = await answer(learnerA, a, choice, 2)
  assert.equal(first.data.attempt.grading_state, 'incorrect')
  assert.equal(first.data.attempt.sequence, 1)
  assert.equal(first.data.attempt.independent, true)
  assert.equal(first.data.feedback.accepted_answer, 1)
  const firstRow = readRows('SELECT * FROM practice_attempts WHERE id=?', first.data.attempt.id)[0]
  assert.equal(firstRow.answer_json, '2')
  assert.equal(firstRow.submitted_at, first.data.attempt.submitted_at)
  assert.equal((await read(learnerB, b, choice)).feedback, null)
  const second = await answer(learnerA, a, choice, 1)
  assert.equal(second.data.attempt.sequence, 2)
  assert.equal(second.data.attempt.grading_state, 'correct')
  assert.equal(second.data.attempt.independent, false)
  assert.deepEqual(readRows('SELECT * FROM practice_attempts WHERE id=?', first.data.attempt.id)[0], firstRow)
  const their = await answer(learnerB, b, choice, 1)
  assert.equal(their.data.attempt.sequence, 1)
  assert.equal(their.data.attempt.independent, true)
  assert.equal(their.data.attempt.grading_state, 'correct')
  assert.notEqual(their.data.attempt.id, first.data.attempt.id)
  assert.deepEqual((await read(learnerA, a, choice)).attempts.map(row => row.grading_state), ['incorrect','correct'])
  await capture(product(learnerA), 'learner-first-and-later')

  step('T01 judgment and published fill grading rules')
  const before = snapshot()
  const improper = await wire(learnerA, attempts(a), 'POST', written(judgment, 'false', 0), header(learnerA))
  assert.deepEqual([improper.status, improper.payload.code], [422, 'INVALID_PRACTICE_ANSWER'])
  assert.deepEqual(snapshot(), before)
  const judged = await answer(learnerA, a, judgment, false)
  assert.equal(judged.data.attempt.answer, false)
  assert.equal(judged.data.attempt.grading_state, 'correct')
  const exact = await answer(learnerA, a, fill, ' ＦＩＮＩＴＥ ')
  assert.equal(exact.data.attempt.answer, ' ＦＩＮＩＴＥ ')
  assert.equal(exact.data.attempt.grading_state, 'correct')
  assert.equal(exact.data.feedback.grading_rule, 'nfkc-space-case-v1')
  assert.equal(exact.data.feedback.evidence.quote_hash, evidence.citation.quote_hash)
  const uncertain = await answer(learnerB, b, fill, '达到时间预算后停止')
  assert.equal(uncertain.data.attempt.grading_state, 'disputed')
  const alias = await answer(learnerB, b, fill, '有界重试')
  assert.equal(alias.data.attempt.grading_state, 'correct')
  assert.deepEqual((await read(learnerB, b, fill)).attempts.map(row => row.grading_state), ['disputed','correct'])
  pass('T01', { shared_version_count: 3, independent_first_attempts: 2, later_correction_append: true, fill_dispute_retained: true })

  step('T02 idempotent/competing writes and source-only revocation')
  const snapshotBeforeReplay = snapshot()
  const reuse = { 'x-knowledgeos-reader-actor': learnerA.id, 'idempotency-key': first.key }
  const replay = await request(learnerA, attempts(a), 'POST', first.payload, { status: 200, headers: reuse })
  assert.equal(replay.attempt.id, first.data.attempt.id)
  assert.equal(replay.replayed, true)
  const clash = await wire(learnerA, attempts(a), 'POST', { ...first.payload, answer: 1 }, reuse)
  assert.deepEqual([clash.status, clash.payload.code], [409, 'IDEMPOTENCY_CONFLICT'])
  assert.deepEqual(snapshot(), snapshotBeforeReplay)
  const directReveal = await wire(learnerB, api + '/' + b.id + '/reveal')
  assert.equal(directReveal.status, 404)
  assert(!directReveal.raw.includes('MAIN-LEARN001-'))
  const priorQuestion = await read(learnerB, b, judgment)
  assert.equal(priorQuestion.feedback, null)
  const simultaneous = await Promise.all([
    wire(learnerB, attempts(b), 'POST', written(judgment, false, 0), header(learnerB)),
    wire(learnerB, attempts(b), 'POST', written(judgment, true, 0), header(learnerB)),
  ])
  assert.deepEqual(simultaneous.map(row => row.status).sort(), [201,409])
  assert.equal((await read(learnerB, b, judgment)).attempts.length, 1)

  await product(learnerA).bringToFront()
  await activeQuestion(learnerA, fill).click()
  await product(learnerA).locator('#practice-feedback').waitFor()
  const invite = prefix + '/invitations/' + sourceGrantA.id
  const details = await request(owner, invite)
  await request(owner, invite + '/revoke', 'POST', { actor_id: owner.id, expected_revision: details.revision }, { headers: idempotency() })
  await product(learnerA).locator('#practice-feedback').waitFor({ state: 'hidden' })
  assert(!(await product(learnerA).locator('#practice-workspace').innerText()).includes('MAIN-LEARN001-'))
  assert.equal((await wire(learnerA, view(a))).status, 404)
  assert.equal((await wire(learnerA, attempts(a), 'POST', first.payload, reuse)).status, 404)
  assert.equal((await read(learnerB, b, choice)).attempts[0].grading_state, 'correct')
  assert.deepEqual(readRows('SELECT * FROM practice_attempts WHERE id=?', first.data.attempt.id)[0], firstRow)
  await capture(product(learnerA), 'learner-source-revoked')
  pass('T02', { replay_same_receipt: true, concurrent_one_write: true, prior_no_reveal: true, other_actor_denied: true, source_revoke_hides_own_feedback: true })
}
