import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [checkout, candidate, entry] = process.argv.slice(2)
assert(checkout && candidate && entry, 'usage: node runner.mjs <frozen checkout> <candidate SHA> <entry SHA256>')
const root = resolve(checkout)
const load = path => import(pathToFileURL(join(root, path)).href)
const { api, dbPath, entryCookie } = await load('scripts/fnd004/harness.mjs')
const { candidateFacts } = await load('scripts/integrated-case-proof.mjs')
const { isolate } = await load('scripts/lib002/a07-isolated-host.mjs')
const { SCHEMA_VERSION } = await load('packages/knowledgeos-panel/lib/storage.js')
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8' }).trim()
assert.equal(git('rev-parse', 'HEAD'), candidate)
const fingerprint = candidateFacts(root, candidate)
assert.equal(fingerprint.entry_sha256, entry)
const sha = data => createHash('sha256').update(data).digest('hex')
const runnerSha = sha(readFileSync(fileURLToPath(import.meta.url)))
assert.equal(runnerSha, sha(execFileSync('git', ['show', candidate + ':scripts/project003/host-reviews.mjs'], { cwd: root })))
const out = mkdtempSync(join(tmpdir(), 'knowledgeos-project003-run-'))
const facts = {
  unit_id: 'PROJECT-003', candidate_sha: candidate, ...fingerprint,
  runner_sha256: runnerSha,
  status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', A32: 'NOT_RUN',
  checks: [], boots: [], screens: [],
}
const prefix = '/knowledge/v1'
const base = prefix + '/project-tasks'
const web = '/knowledgeos/projects'
const time = Date.parse('2026-11-26T03:00:00.000Z')
const cutoff = Date.parse('2026-11-26T04:00:00.000Z')
const password = randomUUID()
const marker = { 'x-knowledgeos-request': '1' }
const key = () => ({ 'idempotency-key': randomUUID() })
let host, browser, phase
const pass = (id, details = {}) => facts.checks.push({ id, status: 'PASS', ...details })
const body = (actor, rest) => ({ actor_id: actor.id, ...rest })

async function boot() {
  const started = await host.start()
  facts.boots.push(started.pid)
  return started
}
async function login(name) {
  const context = await browser.newContext({ timezoneId: 'Asia/Shanghai', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  await context.route('**/*', r => new URL(r.request().url()).origin === host.base ? r.continue() : r.abort())
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  await page.goto(host.base + '/knowledgeos/account')
  await page.locator('#login_name').fill(name)
  await page.locator('#login_password').fill(password)
  const [loginResponse] = await Promise.all([
    page.waitForResponse(r => r.url() === host.base + prefix + '/auth/login' && r.request().method() === 'POST'),
    page.locator('#login').click(),
  ])
  assert.equal(loginResponse.status(), 200, 'synthetic login failed for ' + name)
  await page.locator('#profile').waitFor()
  const me = await context.request.get(host.base + prefix + '/me')
  assert.equal(me.status(), 200)
  const { id, role } = (await me.json()).data
  return { id, role, context, page }
}
async function wire(actor, path, method = 'GET', data, headers = {}) {
  const response = await actor.context.request.fetch(host.base + path, { method, data, headers: { ...marker, ...headers }, maxRedirects: 0 })
  return { status: response.status(), payload: await response.json() }
}
async function request(actor, path, method = 'GET', data, { status = 200, code, headers } = {}) {
  const response = await wire(actor, path, method, data, headers)
  assert.equal(response.status, status, method + ' ' + path + ' ' + JSON.stringify(response.payload))
  if (status >= 400) {
    if (code) assert.equal(response.payload.code, code)
    assert.equal(response.payload.data, undefined)
    return undefined
  }
  if (response.payload.data.actor_id !== undefined) assert.equal(response.payload.data.actor_id, actor.id)
  return response.payload.data
}
function rows(sql, ...args) {
  const db = new DatabaseSync(dbPath(host.data), { readOnly: true })
  try { return db.prepare(sql).all(...args).map(row => ({ ...row })) }
  finally { db.close() }
}
const corrections = () => rows('SELECT * FROM task_review_corrections ORDER BY rowid')
const originalRow = id => rows('SELECT * FROM task_review_decisions WHERE id=?', id)
const submissionRow = id => rows('SELECT * FROM task_submissions WHERE id=?', id)
const pathOf = task => base + '/' + task.id
const readTask = async (actor, path) => (await request(actor, path)).task
const history = (actor, path) => request(actor, path + '/history')
const review = (actor, path, data, options = {}) => request(actor, path + '/reviews', 'POST', body(actor, data), { status: 201, headers: key(), ...options })

async function openProject(actor, name) {
  await actor.page.bringToFront()
  await actor.page.goto(host.base + web)
  await actor.page.locator('#workspace').waitFor()
  await actor.page.locator('#projects').getByRole('button', { name, exact: true }).click()
  await actor.page.locator('#scope-title').filter({ hasText: name }).waitFor()
}
async function openTask(actor, project, name) {
  await openProject(actor, project)
  await actor.page.locator('#tasks').getByRole('button', { name, exact: true }).click()
  await actor.page.locator('#task-detail').waitFor()
  return actor.page
}
async function screenshot(page, name) {
  const data = await page.screenshot({ path: join(out, name), fullPage: true, animations: 'disabled' })
  facts.screens.push({ name, sha256: sha(data) })
}
async function invite(owner, projectId, members) {
  const invitation = await request(owner, prefix + '/invitations', 'POST',
    body(owner, { scope: 'project', target_id: projectId, permission: 'member', days: 2, max_redemptions: members.length }),
    { status: 201, headers: key() })
  for (const member of members) {
    await request(member, prefix + '/invitations/redeem', 'POST', body(member, { token: invitation.token }), { status: 201 })
  }
}
async function formWrite(page, path, button, expectedStatus = 201) {
  const pending = page.waitForResponse(r => r.url() === host.base + path && r.request().method() === 'POST')
  await button.click()
  const result = await pending
  const value = await result.json()
  assert.equal(result.status(), expectedStatus, JSON.stringify(value))
  return { data: value.data, sent: result.request().postDataJSON(), headers: { 'idempotency-key': result.request().headers()['idempotency-key'] } }
}
async function uiReview(page, path, { button, status, action, met, evidence, reason }) {
  const save = page.getByRole('button', { name: button, exact: true })
  const form = save.locator('xpath=ancestor::form[1]')
  await form.locator('#review-verdict').selectOption(action)
  await form.getByRole('checkbox').setChecked(met)
  await form.getByLabel(/标准 1 依据/).fill(evidence)
  await form.getByLabel(/审核理由|改判理由/).fill(reason)
  const result = await formWrite(page, path + '/reviews', save)
  await page.getByText(status, { exact: true }).waitFor()
  return result
}
const criteria = { items: [{ description: 'Reproducible artifact', weight: 2 }], submission_rule: 'next_submission' }
const yes = { results: [{ criterion: 1, met: true, evidence: 'Reproduced by designated reviewer' }], reason: 'Original reviewer accepted' }
const no = { results: [{ criterion: 1, met: false, evidence: 'Required step was not independently reproducible' }], reason: 'Administrator corrected the result' }
async function seedReview(owner, worker, reviewer, project, title) {
  const { task } = await request(owner, base, 'POST', body(owner, {
    project_id: project, title, goal: 'Review a second isolated task', due_at: new Date(cutoff + 60000).toISOString(),
    assignee_id: worker.id, final_reviewer_id: reviewer.id, criteria,
  }), { status: 201, headers: key() })
  const path = pathOf(task)
  const submitted = await request(worker, path + '/submissions', 'POST',
    body(worker, { expected_revision: task.revision, content: 'Second independent test artifact' }), { status: 201, headers: key() })
  const decided = await review(reviewer, path, {
    expected_revision: submitted.task.revision, submission_id: submitted.submission.id, action: 'final_accept', ...yes,
  })
  return { path, submitted, decided }
}

try {
  phase = 'start real Host and independent business identities'
  host = await isolate(candidate, entry, { businessClock: time })
  facts.binding = host.facts
  const started = await boot()
  const bootstrap = await entryCookie(started.entry)
  assert.equal((await api(host.port, bootstrap.cookie, 'POST', prefix + '/auth/bootstrap',
    { login_name: 'administrator', display_name: 'Business Admin', password })).status, 201)
  for (const [login_name, display_name] of [
    ['issuer', 'Ordinary Project Owner'], ['worker', 'Responsible Contributor'],
    ['reviewer', 'Designated Reviewer'], ['bystander', 'Ordinary Bystander'],
  ]) {
    assert.equal((await api(host.port, '', 'POST', prefix + '/auth/register', { login_name, display_name, password })).status, 201)
  }
  assert.equal(rows('PRAGMA user_version')[0].user_version, SCHEMA_VERSION)
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server'] })
  facts.chrome = browser.version()
  const identities = []
  for (const name of ['issuer', 'worker', 'reviewer', 'bystander', 'administrator']) identities.push(await login(name))
  const [owner, worker, reviewer, member, admin] = identities
  assert.deepEqual([owner.role, worker.role, reviewer.role, member.role, admin.role], ['member', 'member', 'member', 'member', 'admin'])
  const projectName = 'Ordinary Project Three'
  const otherName = 'Separate Project Three'
  await owner.page.bringToFront()
  await owner.page.goto(host.base + web)
  await owner.page.locator('#workspace').waitFor()
  await owner.page.locator('#name').fill(projectName)
  const projectResult = await formWrite(owner.page, prefix + '/projects', owner.page.getByRole('button', { name: '创建项目' }))
  const project = projectResult.data.id
  const other = (await request(owner, prefix + '/projects', 'POST', { name: otherName }, { status: 201 })).id
  await invite(owner, project, [worker, reviewer, member, admin])
  await invite(owner, other, [worker, reviewer])

  phase = 'T01 ordinary project UI dispatch and contributor submission'
  const title = 'Ordinary fixed-standard decision'
  await openProject(owner, projectName)
  await owner.page.locator('#title').fill(title)
  await owner.page.locator('#goal').fill('Check the contributor artifact')
  await owner.page.locator('#due').fill('2026-11-26T12:00')
  await owner.page.locator('#assignee').selectOption(worker.id)
  await owner.page.locator('#reviewer').selectOption(reviewer.id)
  await owner.page.locator('#criteria input').first().fill(criteria.items[0].description)
  await owner.page.locator('#criteria input').last().fill('2')
  const { data: { task } } = await formWrite(owner.page, base, owner.page.getByRole('button', { name: '发布任务' }))
  const path = pathOf(task)
  assert.equal(task.task_kind, 'project_collaboration')
  assert.equal(task.issuer_id, owner.id)
  assert.equal(task.due_at, new Date(cutoff).toISOString())
  assert.equal(task.final_reviewer_id, reviewer.id)
  assert.equal(task.peer_reviewer_id, null)
  assert.equal(task.next_actor_id, worker.id)

  host.clock(cutoff)
  const workerPage = await openTask(worker, projectName, title)
  await workerPage.locator('#submission-content').fill('Frozen ordinary contributor output')
  const { data: submitted } = await formWrite(workerPage, path + '/submissions', workerPage.getByRole('button', { name: '提交成果', exact: true }))
  await workerPage.getByText('成果已提交。', { exact: true }).waitFor()
  const { submission } = submitted
  assert.equal(submitted.task.state, 'submitted')
  assert.equal(submitted.task.next_actor_id, reviewer.id)
  assert.equal(submission.submitted_at, task.due_at)
  assert.equal(submission.timing, 'on_time')
  assert.equal(submission.criteria_version, 1)
  const frozenSubmission = submissionRow(submission.id)

  phase = 'T01 designated reviewer and no alternative first decision'
  host.clock(cutoff + 5000)
  const firstDraft = { expected_revision: submitted.task.revision, submission_id: submission.id, action: 'final_accept', ...yes }
  for (const unauthorised of [owner, worker, member, admin]) {
    await review(unauthorised, path, firstDraft, { status: 404, code: 'NOT_FOUND' })
  }
  const unwanted = await wire(reviewer, path + '/reviews', 'POST', body(reviewer, { ...firstDraft, action: 'peer_pass' }), key())
  assert([404, 409].includes(unwanted.status), JSON.stringify(unwanted))
  assert.equal(unwanted.payload.data, undefined)
  assert.equal(rows('SELECT COUNT(*) n FROM task_review_decisions WHERE submission_id=?', submission.id)[0].n, 0)
  assert.equal((await readTask(worker, path)).revision, submitted.task.revision)
  for (const actor of [owner, worker]) {
    const page = await openTask(actor, projectName, title)
    assert.equal(await page.getByRole('button', { name: '保存审核', exact: true }).count(), 0)
  }
  const reviewerPage = await openTask(reviewer, projectName, title)
  const { data: firstDecision } = await uiReview(reviewerPage, path, {
    button: '保存审核', status: '审核已保存。', action: 'final_accept',
    met: true, evidence: yes.results[0].evidence, reason: yes.reason,
  })
  const original = firstDecision.review
  assert.equal(original.reviewer_id, reviewer.id)
  assert.equal(original.submission_id, submission.id)
  assert.equal(original.stage, 'final')
  assert.equal(original.verdict, 'accept')
  assert.equal(original.decided_at, new Date(cutoff + 5000).toISOString())
  assert.equal(firstDecision.task.state, 'accepted')
  assert.equal(firstDecision.task.next_actor_id, null)
  assert.equal(firstDecision.task.revision, submitted.task.revision + 1)
  assert.deepEqual(submissionRow(submission.id), frozenSubmission)
  const savedOriginal = originalRow(original.id)
  assert.equal(savedOriginal.length, 1)
  assert.equal(savedOriginal[0].reason, yes.reason)
  await screenshot(reviewerPage, 'ordinary-review-accepted.png')
  pass('designated_ordinary_reviewer_with_immutable_submission')
  facts.T01 = 'PASS'

  phase = 'T02 authorized administrator correction from Chrome'
  const draft = { expected_revision: firstDecision.task.revision, submission_id: submission.id, supersedes_id: original.id, action: 'final_fail', ...no }
  for (const unauthorised of [owner, worker, reviewer, member]) {
    await review(unauthorised, path, draft, { status: 404, code: 'NOT_FOUND' })
  }
  await review(admin, path, { ...draft, reason: '' }, { status: 422, code: 'INVALID_TASK_INPUT' })
  assert.equal(corrections().length, 0)
  assert.equal((await readTask(worker, path)).revision, firstDecision.task.revision)
  const adminPage = await openTask(admin, projectName, title)
  await adminPage.getByText(yes.reason, { exact: true }).waitFor()
  const corrected = await uiReview(adminPage, path, {
    button: '保存改判', status: '改判已保存。', action: 'final_fail',
    met: false, evidence: no.results[0].evidence, reason: no.reason,
  })
  assert.deepEqual(corrected.sent, body(admin, draft))
  const newest = corrected.data.review
  assert(newest.id !== original.id)
  assert.equal(newest.supersedes_id, original.id)
  assert.equal(newest.verdict, 'fail')
  assert.equal(newest.reviewer_id, admin.id)
  assert.equal(newest.submission_id, submission.id)
  assert.equal(corrected.data.task.state, 'failed')
  assert.equal(corrected.data.task.next_actor_id, null)
  assert.equal(corrected.data.task.revision, firstDecision.task.revision + 1)
  assert.deepEqual(submissionRow(submission.id), frozenSubmission)
  assert.deepEqual(originalRow(original.id), savedOriginal)
  assert.equal(corrections().length, 1)
  const persistedHistory = await history(worker, path)
  assert.deepEqual(persistedHistory.reviews.map(r => r.id), [original.id, newest.id])
  assert.equal(persistedHistory.reviews[1].supersedes_id, original.id)
  assert.deepEqual(persistedHistory.reviews.map(r => r.reason), [yes.reason, no.reason])
  assert.deepEqual(persistedHistory.submissions, [submission])
  await screenshot(adminPage, 'ordinary-override-history.png')
  const refreshedWorker = await openTask(worker, projectName, title)
  for (const reason of [yes.reason, no.reason]) await refreshedWorker.getByText(reason, { exact: true }).waitFor()
  await refreshedWorker.locator('#task-facts').getByText('未通过', { exact: true }).waitFor()

  phase = 'T02 canonical replay, stale decision and revision conflicts'
  const originalOverrideRows = corrections()
  const replay = await review(admin, path, draft, { status: 200, headers: corrected.headers })
  assert.equal(replay.replayed, true)
  assert.equal(replay.review.id, newest.id)
  assert.equal(replay.task.revision, corrected.data.task.revision)
  await review(admin, path, { ...draft, reason: 'Mutated identical key' }, { status: 409, headers: corrected.headers })
  await review(admin, path, draft, { status: 409 })
  await review(admin, path, { ...draft, expected_revision: replay.task.revision }, { status: 409 })
  assert.deepEqual(corrections(), originalOverrideRows)
  assert.deepEqual(await history(worker, path), persistedHistory)
  pass('admin_correction_immutable_history_and_exact_replay')

  phase = 'T02 concurrent version conflict and separately scoped administrator'
  const second = await seedReview(owner, worker, reviewer, project, 'Parallel correction')
  const parallelDraft = {
    expected_revision: second.decided.task.revision, submission_id: second.submitted.submission.id, supersedes_id: second.decided.review.id,
    action: 'final_fail', ...no,
  }
  const outcomes = await Promise.all([1, 2].map(n =>
    wire(admin, second.path + '/reviews', 'POST', body(admin, { ...parallelDraft, reason: no.reason + ' ' + n }), key())))
  assert.deepEqual(outcomes.map(r => r.status).sort(), [201, 409])
  assert.equal(outcomes.find(r => r.status === 409).payload.data, undefined)
  const afterParallel = await history(worker, second.path)
  assert.equal(afterParallel.reviews.length, 2)
  assert.equal(afterParallel.reviews[1].supersedes_id, second.decided.review.id)
  assert.equal(corrections().length, 2)

  const outside = await seedReview(owner, worker, reviewer, other, 'Cross-project correction must be denied')
  await request(admin, outside.path, 'GET', undefined, { status: 404, code: 'NOT_FOUND' })
  await review(admin, outside.path, {
    ...parallelDraft, expected_revision: outside.decided.task.revision,
    submission_id: outside.submitted.submission.id, supersedes_id: outside.decided.review.id,
  }, { status: 404, code: 'NOT_FOUND' })
  const targetMismatch = await wire(admin, path + '/reviews', 'POST', body(admin, {
    ...draft, expected_revision: replay.task.revision, supersedes_id: outside.decided.review.id,
  }), key())
  assert([404, 409].includes(targetMismatch.status), JSON.stringify(targetMismatch))
  assert.equal(targetMismatch.payload.data, undefined)
  assert.equal(corrections().length, 2)
  pass('parallel_writers_and_cross_project_scope')

  phase = 'T02 project membership revoked and durable participant history'
  await request(owner, base + '/projects/' + project + '/members', 'POST', body(owner, { remove_member_id: admin.id }))
  await request(admin, path + '/history', 'GET', undefined, { status: 404, code: 'NOT_FOUND' })
  await review(admin, path, draft, { status: 404, code: 'NOT_FOUND', headers: corrected.headers })
  assert.equal(corrections().length, 2)
  await host.stop()
  await boot()
  const freshWorker = await login('worker')
  const page = await openTask(freshWorker, projectName, title)
  await page.getByText(no.reason, { exact: true }).waitFor()
  assert.deepEqual(await history(freshWorker, path), persistedHistory)
  assert.deepEqual(submissionRow(submission.id), frozenSubmission)
  assert.deepEqual(originalRow(original.id), savedOriginal)
  assert.deepEqual(rows('PRAGMA foreign_key_check'), [])
  pass('membership_revocation_denies_replay_and_restart_preserves_history')
  facts.T02 = facts.status = 'PASS'
} catch (error) {
  facts.status = 'FAIL'
  facts.failure = { phase, message: String(error.message).slice(0, 800) }
  throw error
} finally {
  try { await browser?.close() }
  finally {
    try { await host?.stop() }
    finally {
      writeFileSync(join(out, 'summary.json'), JSON.stringify(facts, null, 2) + '\n')
      console.log(JSON.stringify({ status: facts.status, dir: out }))
    }
  }
}
