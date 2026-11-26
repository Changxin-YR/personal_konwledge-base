import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [checkout, candidate, entry, pinnedRunner] = process.argv.slice(2)
assert(checkout && candidate && entry && pinnedRunner,
  'usage: node independent.mjs <frozen checkout> <candidate SHA> <entry SHA256> <runner SHA256>')
const root = resolve(checkout)
const load = path => import(pathToFileURL(join(root, path)).href)
const { api, dbPath, entryCookie } = await load('scripts/fnd004/harness.mjs')
const { candidateFacts } = await load('scripts/integrated-case-proof.mjs')
const { isolate, until } = await load('scripts/lib002/a07-isolated-host.mjs')
const { SCHEMA_VERSION } = await load('packages/knowledgeos-panel/lib/storage.js')
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8' }).trim()
const sha = data => createHash('sha256').update(data).digest('hex')
const runnerSha = sha(readFileSync(fileURLToPath(import.meta.url)))
assert.equal(git('rev-parse', 'HEAD'), candidate)
assert.equal(runnerSha, pinnedRunner)
assert.equal(runnerSha, sha(execFileSync('git', ['show', candidate + ':scripts/project004/host-appeals.mjs'], { cwd: root })))
const fingerprint = candidateFacts(root, candidate)
assert.equal(fingerprint.entry_sha256, entry)
const out = mkdtempSync(join(tmpdir(), 'kos-project004-independent-'))
const facts = {
  unit_id: 'PROJECT-004', candidate_sha: candidate, ...fingerprint, runner_sha256: runnerSha,
  scope: 'Isolated DSH Host, Chrome and SQLite. P11 event/status contract only. Synthetic data.',
  status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', A32: 'NOT_RUN', A33: 'NOT_RUN', P11: 'NOT_RUN',
  checks: [], boots: [], screens: [],
}
const prefix = '/knowledge/v1'
const tasks = prefix + '/project-tasks'
const time = Date.parse('2026-11-26T03:00:00.000Z')
const hour = 3600000
const pass = (id, details = {}) => facts.checks.push({ id, status: 'PASS', ...details })
const password = randomUUID()
const key = () => ({ 'idempotency-key': randomUUID() })
const marker = { 'x-knowledgeos-request': '1' }
const body = (actor, data) => ({ actor_id: actor.id, ...data })
const projectName = 'Review and appeal workspace'
const appealReason = 'APPEAL_SENTINEL: reproduction is documented in the frozen submission.'
const oldReason = 'INITIAL_REVIEW_SENTINEL: reproduction step was judged missing.'
const newReason = 'NEW_REVIEW_SENTINEL: authorized appeal evidence confirms the step.'
const needs = { results: [{ criterion: 1, met: false, evidence: 'Reproduction step judged absent' }], reason: oldReason }
const meets = { results: [{ criterion: 1, met: true, evidence: 'Reproduction step observed' }], reason: newReason }
const criteria = { items: [{ description: 'Prove the fixed artifact can be checked', weight: 2 }], submission_rule: 'next_submission' }
let host, browser, phase

function sql(statement, args = [], write = false) {
  const db = new DatabaseSync(dbPath(host.data), { readOnly: !write })
  try { return write ? db.exec(statement) : db.prepare(statement).all(...args).map(row => ({ ...row })) }
  finally { db.close() }
}

async function boot() {
  const started = await host.start()
  facts.boots.push(started.pid)
  return started
}

async function capture(page, name) {
  const bytes = await page.screenshot({ path: join(out, name), fullPage: true, animations: 'disabled' })
  facts.screens.push({ name, sha256: sha(bytes) })
}

async function login(name, width = 1280) {
  const context = await browser.newContext({
    timezoneId: 'Asia/Shanghai', viewport: { width, height: 900 }, serviceWorkers: 'block',
  })
  await context.route('**/*', route => new URL(route.request().url()).origin === host.base ? route.continue() : route.abort())
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(host.base + '/knowledgeos/account')
  await page.locator('#login_name').fill(name)
  await page.locator('#login_password').fill(password)
  const [response] = await Promise.all([
    page.waitForResponse(result => result.url() === host.base + prefix + '/auth/login' && result.request().method() === 'POST'),
    page.locator('#login').click(),
  ])
  assert.equal(response.status(), 200, 'synthetic browser login failed for ' + name)
  await page.locator('#profile').waitFor()
  const me = await context.request.get(host.base + prefix + '/me')
  assert.equal(me.status(), 200)
  return { ...(await me.json()).data, context, page }
}

async function wire(actor, path, method = 'GET', data, headers = {}) {
  const response = await actor.context.request.fetch(host.base + path, { method, data, headers: { ...marker, ...headers }, maxRedirects: 0 })
  return { status: response.status(), value: await response.json(), cache: response.headers()['cache-control'] }
}

async function request(actor, path, method = 'GET', data, { status = 200, code, headers } = {}) {
  const result = await wire(actor, path, method, data, headers)
  assert.equal(result.status, status, method + ' ' + path + ' returned ' + (result.value.code ?? 'unexpected HTTP status'))
  if (status >= 400) {
    if (code) assert.equal(result.value.code, code)
    assert.equal(result.value.data, undefined)
    return result
  }
  if (result.value.data.actor_id !== undefined) assert.equal(result.value.data.actor_id, actor.id)
  return result.value.data
}

async function post(actor, path, data, options = {}) {
  return request(actor, path, 'POST', body(actor, data), { status: 201, headers: key(), ...options })
}

const taskOf = async (actor, path) => (await request(actor, path)).task
const history = (actor, path) => request(actor, path + '/history')
const appealAt = decision => prefix + '/decisions/' + decision + '/appeals'
const resolveAt = appeal => prefix + '/appeals/' + appeal + '/resolution'
const original = id => sql('SELECT * FROM task_review_decisions WHERE id=?', [id])
const submissionRow = id => sql('SELECT * FROM task_submissions WHERE id=?', [id])
const corrections = id => sql('SELECT * FROM task_review_corrections WHERE submission_id=? ORDER BY rowid', [id])
const changes = () => sql('SELECT * FROM domain_events ORDER BY seq')
const dispatches = () => sql('SELECT event_id,created_at FROM domain_event_outbox ORDER BY event_id')

function rawAppeal(id) {
  const present = sql("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('appeals','task_appeals','task_review_appeals')")
  assert.equal(present.length, 1, 'expected exactly one persisted appeal table')
  return sql('SELECT * FROM ' + present[0].name + ' WHERE id=?', [id])
}

async function open(actor, name) {
  const { page } = actor
  await page.bringToFront()
  await page.goto(host.base + '/knowledgeos/projects')
  await page.locator('#workspace').waitFor()
  await page.locator('#projects').getByRole('button', { name: projectName, exact: true }).click()
  await page.locator('#scope-title').filter({ hasText: projectName }).waitFor()
  await page.locator('#tasks').getByRole('button', { name, exact: true }).click()
  await page.locator('#task-detail').waitFor()
  return page
}

async function formPost(page, path, buttonName, expected = 201) {
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url() === host.base + path && r.request().method() === 'POST'),
    page.getByRole('button', { name: buttonName, exact: true }).click(),
  ])
  const result = await response.json()
  assert.equal(response.status(), expected, 'UI write returned ' + (result.code ?? 'unexpected status'))
  return { data: result.data, sent: response.request().postDataJSON(), headers: { 'idempotency-key': response.request().headers()['idempotency-key'] } }
}

async function invite(owner, spec, recipients) {
  const invitation = await post(owner, prefix + '/invitations', { ...spec, max_redemptions: recipients.length })
  for (const recipient of recipients) await post(recipient, prefix + '/invitations/redeem', { token: invitation.token })
  return invitation
}

async function dispatch(owner, worker, reviewer, project, title, due = time + 2 * hour) {
  const { task } = await post(owner, tasks, {
    project_id: project, title, goal: 'Independent review against the recorded standard',
    due_at: new Date(due).toISOString(), assignee_id: worker.id, final_reviewer_id: reviewer.id, criteria,
  })
  assert.equal(task.task_kind, 'project_collaboration')
  return { task, path: tasks + '/' + task.id }
}

async function seedDecision(owner, worker, reviewer, project, title) {
  const { task, path } = await dispatch(owner, worker, reviewer, project, title)
  const submitted = await post(worker, path + '/submissions', { expected_revision: task.revision, content: 'Fixed contributor output' })
  assert.equal(submitted.task.next_actor_id, reviewer.id)
  const decision = await post(reviewer, path + '/reviews', {
    expected_revision: submitted.task.revision, submission_id: submitted.submission.id, action: 'final_fail', ...needs,
  })
  assert.equal(decision.review.reviewer_id, reviewer.id)
  assert.equal(decision.task.state, 'failed')
  assert.equal(decision.review.stage, 'final')
  return { path, ...decision, submission: submitted.submission }
}

async function upload(actor, name, contents, prior) {
  const response = await actor.context.request.post(host.base + prefix + '/imports', {
    headers: {
      ...marker, ...key(), 'content-type': 'text/plain', 'x-knowledgeos-filename': name,
      ...(prior ? { 'x-knowledgeos-asset-id': prior.id, 'x-knowledgeos-expected-version': String(prior.version) } : {}),
    },
    data: Buffer.from(contents),
  })
  assert.equal(response.status(), 201)
  return (await response.json()).data
}

async function heldReview(actor, path, draft, headers) {
  const url = host.base + path
  const label = randomUUID().replaceAll('-', '')
  const encoded = Buffer.from(JSON.stringify(draft))
  const cookie = (await actor.context.cookies(url)).map(c => c.name + '=' + c.value).join('; ')
  let req
  const reply = new Promise((ok, fail) => {
    req = httpRequest(url, {
      method: 'POST', timeout: 18000,
      headers: { ...marker, ...headers, cookie, 'content-type': 'application/json', 'content-length': encoded.length, 'x-kos-test-arrival': label },
    }, response => {
      const segments = []
      response.on('data', value => segments.push(value))
      response.on('error', fail)
      response.on('end', () => {
        try { ok({ status: response.statusCode, value: JSON.parse(Buffer.concat(segments)) }) }
        catch (error) { fail(error) }
      })
    })
    req.on('error', fail)
    req.on('timeout', () => req.destroy(Error('held review timed out')))
    req.write(encoded.subarray(0, 10))
  })
  void reply.catch(() => {})
  const trace = () => host.invitationArrivals().filter(event => event.label === label).map(event => event.event)
  try {
    await Promise.race([until(() => trace().length === 1, 'review request entered actual Host'), reply.then(() => assert.fail('review completed before boundary'))])
  } catch (error) {
    req.destroy()
    throw error
  }
  return { reply, trace, finish: () => req.end(encoded.subarray(10)), close: () => req.destroy() }
}


try {
  phase = 'boot independent Host and isolated business sessions'
  host = await isolate(candidate, entry, { businessClock: time })
  facts.binding = host.facts
  const started = await boot()
  const bootstrap = await entryCookie(started.entry)
  assert.equal((await api(host.port, bootstrap.cookie, 'POST', prefix + '/auth/bootstrap',
    { login_name: 'admin', display_name: 'Appeal Administrator', password })).status, 201)
  for (const [login_name, display_name] of [
    ['owner', 'Ordinary Project Owner'], ['worker', 'Responsible Contributor'],
    ['reviewer', 'Designated Reviewer'], ['member', 'Ordinary Project Member'],
  ]) {
    assert.equal((await api(host.port, '', 'POST', prefix + '/auth/register', { login_name, display_name, password })).status, 201)
  }
  assert.equal(sql('PRAGMA user_version')[0].user_version, SCHEMA_VERSION)
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  browser = await chromium.launch({
    channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server'],
  })
  facts.chrome = browser.version()
  let owner = await login('owner'), worker = await login('worker'), reviewer = await login('reviewer')
  const admin = await login('admin'), member = await login('member')
  assert.deepEqual([owner.role, worker.role, reviewer.role, admin.role, member.role], ['member', 'member', 'member', 'admin', 'member'])
  const { id: project } = await request(owner, prefix + '/projects', 'POST', { name: projectName }, { status: 201 })
  const { id: outside } = await request(owner, prefix + '/projects', 'POST', { name: 'Independent ungranted review scope' }, { status: 201 })
  await invite(owner, { scope: 'project', target_id: project, permission: 'member', days: 4 }, [worker, reviewer, admin, member])
  await invite(owner, { scope: 'project', target_id: outside, permission: 'member', days: 4 }, [worker, reviewer])

  phase = 'T01 candidate creates an appeal through Chrome and preserves original decision'
  const title = 'Independent ordinary review and appeal'
  const item = await seedDecision(owner, worker, reviewer, project, title)
  const origin = original(item.review.id), baselineSubmission = submissionRow(item.submission.id)
  assert.equal(origin.length, 1)
  const appealPath = appealAt(item.review.id)
  const draft = { expected_revision: item.task.revision, reason: appealReason }
  for (const actor of [owner, reviewer, admin, member]) {
    await post(actor, appealPath, draft, { status: 404, code: 'NOT_FOUND' })
  }
  await post(worker, appealAt(randomUUID()), draft, { status: 404, code: 'NOT_FOUND' })
  await post(worker, appealPath, { ...draft, reason: '' }, { status: 422 })
  await post(worker, appealPath, { ...draft, actor_id: member.id }, { status: 409 })
  assert.deepEqual((await history(worker, item.path)).appeals ?? [], [])
  assert.deepEqual(original(item.review.id), origin)
  const workerPage = await open(worker, title)
  const appealButton = workerPage.getByRole('button', { name: '提交复议', exact: true })
  await appealButton.locator('xpath=ancestor::form[1]').locator('textarea').first().fill(appealReason)
  const first = await formPost(workerPage, appealPath, '提交复议')
  await workerPage.getByText('复议已提交。', { exact: true }).waitFor()
  assert.deepEqual(first.sent, body(worker, draft))
  const appeal = first.data.appeal
  const appealHistory = await history(worker, item.path)
  assert.equal(appeal.decision_id, item.review.id)
  assert.equal(appeal.requester_id, worker.id)
  assert.equal(appeal.reason, appealReason)
  assert.equal(appeal.status, 'pending')
  assert.equal(appeal.resolution_decision_id, null)
  assert.equal(first.data.task.state, 'failed')
  assert.equal(first.data.task.settlement_state, 'disputed')
  assert.equal((await taskOf(worker, item.path)).settlement_state, 'disputed')
  assert.equal(rawAppeal(appeal.id)[0].status, 'pending')
  assert.equal(appealHistory.appeals.filter(row => row.id === appeal.id).length, 1)
  assert.equal(appealHistory.appeals.find(row => row.id === appeal.id).reason, appealReason)
  const pendingRevision = first.data.task.revision
  const opened = changes().filter(row => row.aggregate_id === item.task.id && row.event_type === 'knowledgeos.task.appeal.opened')
  assert.equal(opened.length, 1)
  assert.equal(opened[0].aggregate_revision, pendingRevision)
  assert.equal(opened[0].actor_id, worker.id)
  assert.equal(opened[0].correlation_id, appeal.id)
  assert.equal(opened[0].payload.includes(appealReason), false)
  assert(dispatches().some(row => row.event_id === opened[0].event_id))
  const appealReplay = await post(worker, appealPath, draft, { status: 200, headers: first.headers })
  assert.equal(appealReplay.appeal.id, appeal.id)
  assert.equal(appealReplay.task.revision, pendingRevision)
  await post(worker, appealPath, { ...draft, reason: 'Alter a prior idempotency key' }, { status: 409, headers: first.headers })
  await post(worker, appealPath, { ...draft, expected_revision: pendingRevision }, { status: 409 })
  assert.deepEqual(original(item.review.id), origin)
  assert.deepEqual(submissionRow(item.submission.id), baselineSubmission)
  await capture(workerPage, 'pending-appeal.png')
  pass('original_ordinary_decision_and_real_contributor_appeal')

  phase = 'T01 nonmembers cannot resolve and outbox fault rolls back the complete correction'
  const outsideItem = await seedDecision(owner, worker, reviewer, outside, 'Appeal outside administrator membership')
  const remote = await post(worker, appealAt(outsideItem.review.id), {
    expected_revision: outsideItem.task.revision, reason: 'Separate project explanation',
  })
  const resolvePath = resolveAt(appeal.id)
  const resolution = { expected_revision: pendingRevision, action: 'final_accept', ...meets }
  await post(admin, resolveAt(remote.appeal.id), { ...resolution, expected_revision: remote.task.revision }, { status: 404, code: 'NOT_FOUND' })
  for (const actor of [owner, worker, reviewer, member]) {
    await post(actor, resolvePath, resolution, { status: 404, code: 'NOT_FOUND' })
  }
  await post(admin, resolvePath, { ...resolution, reason: '' }, { status: 422 })
  const eventsBefore = changes(), dispatchesBefore = dispatches(), pendingRow = rawAppeal(appeal.id)
  assert.deepEqual(corrections(item.submission.id), [])
  const faultKey = key()
  sql("CREATE TRIGGER project004_independent_outbox_fault BEFORE INSERT ON domain_event_outbox BEGIN SELECT RAISE(ABORT, 'independent outbox failure'); END", [], true)
  try {
    await post(admin, resolvePath, resolution, { status: 503, headers: faultKey })
    assert.equal((await taskOf(worker, item.path)).state, 'failed')
    assert.equal((await taskOf(worker, item.path)).revision, pendingRevision)
    assert.equal((await taskOf(worker, item.path)).settlement_state, 'disputed')
    assert.deepEqual(original(item.review.id), origin)
    assert.deepEqual(rawAppeal(appeal.id), pendingRow)
    assert.deepEqual(corrections(item.submission.id), [])
    assert.deepEqual(changes(), eventsBefore)
    assert.deepEqual(dispatches(), dispatchesBefore)
  } finally {
    sql('DROP TRIGGER project004_independent_outbox_fault', [], true)
  }
  pass('authorized_resolution_scope_and_transaction_rollback')

  phase = 'T01 administrator processes actual appeal and emits a single safe event'
  const adminPage = await open(admin, title)
  await adminPage.getByText(appealReason, { exact: true }).waitFor()
  const form = adminPage.getByRole('button', { name: '保存复议处理', exact: true }).locator('xpath=ancestor::form[1]')
  await form.locator('#review-verdict').selectOption('final_accept')
  await form.getByRole('checkbox').setChecked(true)
  await form.locator('textarea').nth(0).fill(meets.results[0].evidence)
  await form.locator('textarea').nth(1).fill(newReason)
  const done = await formPost(adminPage, resolvePath, '保存复议处理')
  await adminPage.getByText('复议处理已保存。', { exact: true }).waitFor()
  assert.deepEqual(done.sent, body(admin, resolution))
  const { review: replacement, appeal: resolved, task: result } = done.data
  assert.notEqual(replacement.id, item.review.id)
  assert.equal(replacement.supersedes_id, item.review.id)
  assert.equal(replacement.verdict, 'accept')
  assert.equal(replacement.submission_id, item.submission.id)
  assert.equal(replacement.reviewer_id, admin.id)
  assert.equal(result.state, 'accepted')
  assert.equal(result.next_actor_id, null)
  assert.equal(result.revision, pendingRevision + 1)
  assert.equal(result.recalculation_required, true)
  assert.notEqual(result.settlement_state, 'disputed')
  assert.equal(resolved.id, appeal.id)
  assert.equal(resolved.status, 'resolved')
  assert.equal(resolved.resolution_decision_id, replacement.id)
  assert.deepEqual(original(item.review.id), origin)
  assert.deepEqual(submissionRow(item.submission.id), baselineSubmission)
  assert.equal(corrections(item.submission.id).length, 1)
  assert.equal(rawAppeal(appeal.id)[0].resolution_decision_id, replacement.id)
  const fact = await history(worker, item.path)
  assert.deepEqual(fact.reviews.map(row => row.id), [item.review.id, replacement.id])
  assert.equal(fact.appeals.find(row => row.id === appeal.id).status, 'resolved')
  assert.equal(fact.appeals.find(row => row.id === appeal.id).resolution_decision_id, replacement.id)
  const change = changes().filter(row => !eventsBefore.some(prior => prior.event_id === row.event_id))
  assert.equal(change.length, 1)
  const [event] = change
  assert.equal(event.aggregate_revision, result.revision)
  assert.equal(event.aggregate_id, item.task.id)
  assert.equal(event.causation_id, opened[0].event_id)
  assert.equal(event.correlation_id, appeal.id)
  assert.deepEqual(sql('SELECT task_revision,recalculation_required FROM task_decision_impacts WHERE task_id=?', [item.task.id]),
    [{ task_revision: result.revision, recalculation_required: 1 }])
  assert.equal(event.actor_id, admin.id)
  assert(Number.isInteger(event.payload_schema_version) && event.payload_schema_version >= 1)
  assert.match(event.event_type, /^knowledgeos\./)
  for (const reference of [item.review.id, replacement.id, appeal.id]) assert(event.payload.includes(reference))
  for (const privateText of [appealReason, oldReason, newReason, password, meets.results[0].evidence]) assert(!event.payload.includes(privateText))
  const newDispatch = dispatches().filter(row => !dispatchesBefore.some(prior => prior.event_id === row.event_id))
  assert.deepEqual(newDispatch.map(row => row.event_id), [event.event_id])
  const eventAfter = changes()
  const outboxAfter = dispatches()
  const exact = await post(admin, resolvePath, resolution, { status: 200, headers: done.headers })
  assert.equal(exact.review.id, replacement.id)
  assert.equal(exact.appeal.id, appeal.id)
  await post(admin, resolvePath, { ...resolution, reason: 'Changed request' }, { status: 409, headers: done.headers })
  await post(admin, resolvePath, resolution, { status: 409 })
  await post(admin, resolvePath, { ...resolution, expected_revision: result.revision }, { status: 409 })
  await post(worker, appealPath, { ...draft, expected_revision: result.revision }, { status: 409 })
  assert.deepEqual(changes(), eventAfter)
  assert.deepEqual(dispatches(), outboxAfter)
  const readWorker = await open(worker, title)
  for (const reason of [oldReason, newReason, appealReason]) await readWorker.getByText(reason, { exact: true }).waitFor()
  await readWorker.locator('#task-facts').getByText('已完成', { exact: true }).waitFor()
  await capture(readWorker, 'resolved-appeal-history.png')
  pass('effective_correction_and_versioned_outbox_are_atomic_and_idempotent', { event_type: event.event_type, payload_schema_version: event.payload_schema_version })

  phase = 'T01 separate sessions compete and former administrator cannot replay'
  const contested = await seedDecision(owner, worker, reviewer, project, 'Second appealed decision')
  const repeatDraft = { expected_revision: contested.task.revision, reason: 'Parallel request one' }
  const twin = await login('worker')
  const requests = await Promise.all([worker, twin].map(actor =>
    wire(actor, appealAt(contested.review.id), 'POST', body(actor, repeatDraft), key())))
  const winningAppeal = requests.find(item => item.status === 201)?.value.data
  assert(winningAppeal)
  assert.equal(requests.filter(item => item.status === 201).length, 1)
  assert(requests.every(item => [200, 201, 409].includes(item.status)))
  assert.equal((await history(worker, contested.path)).appeals.filter(row => row.status === 'pending').length, 1)
  const otherAdmin = await login('admin')
  const parallelPath = resolveAt(winningAppeal.appeal.id)
  const previousEvents = changes().length
  const competitors = await Promise.all([admin, otherAdmin].map((actor, index) =>
    wire(actor, parallelPath, 'POST', body(actor, {
      ...resolution, expected_revision: winningAppeal.task.revision, reason: 'Parallel correction ' + index,
    }), key())))
  assert.deepEqual(competitors.map(response => response.status).sort(), [201, 409])
  assert.equal(corrections(contested.submission.id).length, 1)
  assert.equal(changes().length, previousEvents + 1)
  await request(owner, tasks + '/projects/' + project + '/members', 'POST', body(owner, { remove_member_id: admin.id }))
  await request(admin, item.path + '/history', 'GET', undefined, { status: 404, code: 'NOT_FOUND' })
  await post(admin, resolvePath, resolution, { headers: done.headers, status: 404, code: 'NOT_FOUND' })
  assert.deepEqual(original(item.review.id), origin)
  assert.equal(corrections(item.submission.id).length, 1)
  await host.stop()
  await boot()
  const mobile = await login('worker', 421)
  const mobilePage = await open(mobile, title)
  await mobilePage.getByText(newReason, { exact: true }).waitFor()
  assert(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'appeal UI has horizontal overflow')
  assert.deepEqual(await history(mobile, item.path), fact)
  assert.deepEqual(sql('PRAGMA foreign_key_check'), [])
  await capture(mobilePage, 'resolved-appeal-mobile.png')
  pass('concurrent_open_and_resolution_revocation_and_restart')
  facts.T01 = facts.A32 = 'PASS'


  phase = 'T02 provision naturally expiring fixed material independently from project membership'
  const expiringTitle = 'Natural material expiry before ordinary review'
  const assetName = 'private-material-a33.txt'
  const visibleOne = 'PRIVATE_MATERIAL_A33_V1'
  const visibleTwo = 'CURRENT_MATERIAL_A33_V2'
  const submissionText = 'SUBMISSION_CONTAINING_PROTECTED_MATERIAL_A33'
  const v1 = await upload(worker, assetName, visibleOne)
  const target = { asset_id: v1.id, version_id: v1.version_id, ordinal: 1 }
  const materialApi = id => prefix + '/assets/' + v1.id + '/versions/' + id + '/reader?unit=1'
  const materialUrl = '/knowledgeos/reader?' + new URLSearchParams({ asset: v1.id, version: v1.version_id, unit: '1' })
  const initial = await invite(worker, { scope: 'object', target_id: v1.id, permission: 'read', days: 1 }, [reviewer])
  const { task: expiryTask, path: expiring } = await dispatch(owner, worker, reviewer, project, expiringTitle)
  const packageSubmission = await post(worker, expiring + '/submissions', {
    expected_revision: expiryTask.revision, content: submissionText, materials: [target],
  })
  const materialSubmission = packageSubmission.submission
  const fixedSubmission = submissionRow(materialSubmission.id)
  assert.equal(packageSubmission.task.state, 'submitted')
  assert.equal(packageSubmission.task.next_actor_id, reviewer.id)
  const expiry = Date.parse(initial.expires_at)
  assert(Number.isFinite(expiry) && expiry > time + hour)
  const v2 = await upload(worker, assetName, visibleTwo, v1)
  assert.notEqual(v2.version_id, v1.version_id)
  assert.equal(v2.id, v1.id)
  host.clock(expiry - hour)
  owner = await login('owner')
  worker = await login('worker')
  reviewer = await login('reviewer')
  host.clock(expiry - 1)

  phase = 'T02 real review crosses expires_at boundary under an active session'
  const reviewerPage = await open(reviewer, expiringTitle)
  await reviewerPage.getByText(submissionText, { exact: true }).waitFor()
  const fixedLink = reviewerPage.getByRole('link', { name: '打开固定材料 1', exact: true })
  await fixedLink.waitFor()
  assert.equal(await fixedLink.getAttribute('href'), materialUrl)
  assert.equal((await taskOf(reviewer, expiring)).state, 'submitted')
  assert.equal((await request(reviewer, tasks + '/projects/' + project + '/members')).project.id, project)
  assert(JSON.stringify(await request(reviewer, materialApi(v1.version_id))).includes(visibleOne))
  assert(JSON.stringify(await request(reviewer, materialApi(v2.version_id))).includes(visibleTwo))
  assert.deepEqual((await history(reviewer, expiring)).submissions[0].materials, [target])
  const afterPresubmit = changes()
  const afterPresubmitOutbox = dispatches()
  await reviewerPage.evaluate(() => {
    window.materialVisibilityChanges = 0
    document.addEventListener('visibilitychange', () => window.materialVisibilityChanges++)
  })
  const realRevision = (await taskOf(reviewer, expiring)).revision
  const fail = {
    expected_revision: realRevision, submission_id: materialSubmission.id,
    action: 'final_fail', ...needs,
  }
  const expiryKey = key()
  const held = await heldReview(reviewer, expiring + '/reviews', body(reviewer, fail), expiryKey)
  try {
    assert.deepEqual(held.trace(), ['entered'])
    host.clock(expiry)
    held.finish()
    const reply = await held.reply
    assert.equal(reply.status, 409)
    assert.equal(reply.value.code, 'TASK_MATERIAL_ACCESS_REQUIRED')
    assert.equal(reply.value.data, undefined)
    assert.deepEqual(held.trace(), ['entered', 'completed'])
  } finally {
    held.close()
  }
  assert.equal((await request(reviewer, prefix + '/me')).id, reviewer.id)
  assert.equal((await request(reviewer, tasks + '/projects/' + project + '/members')).project.id, project)
  const waiting = await taskOf(reviewer, expiring)
  assert.equal(waiting.state, 'awaiting_material_access')
  assert.equal(waiting.next_actor_id, reviewer.id)
  await post(reviewer, expiring + '/reviews', fail, { status: 409, code: 'TASK_MATERIAL_ACCESS_REQUIRED', headers: expiryKey })
  await post(reviewer, expiring + '/reviews', { ...fail, expected_revision: waiting.revision }, { status: 409, code: 'TASK_MATERIAL_ACCESS_REQUIRED' })
  const denied = await request(reviewer, materialApi(v1.version_id), 'GET', undefined, { status: 404, code: 'SOURCE_NOT_FOUND' })
  assert.match(denied.cache, /(?:^|,\s*)no-store(?:,|$)/)
  const hidden = await history(reviewer, expiring)
  for (const privateValue of [assetName, visibleOne, visibleTwo, submissionText, target.asset_id, target.version_id]) {
    assert(!JSON.stringify(hidden).includes(privateValue))
  }
  assert.equal(hidden.submissions[0].content, null)
  assert.deepEqual(hidden.reviews, [])
  assert.deepEqual(sql('SELECT * FROM task_review_decisions WHERE submission_id=?', [materialSubmission.id]), [])
  assert.deepEqual(corrections(materialSubmission.id), [])
  assert.deepEqual(submissionRow(materialSubmission.id), fixedSubmission)
  assert.deepEqual(changes().filter(event => !afterPresubmit.some(before => before.event_id === event.event_id) && /correct|settle/i.test(event.event_type)), [])
  assert(!dispatches().some(record => !afterPresubmitOutbox.some(prior => prior.event_id === record.event_id) &&
    changes().some(event => event.event_id === record.event_id && /correct|settle/i.test(event.event_type))))
  await reviewerPage.locator('#task-facts').getByText('待材料授权', { exact: true }).waitFor()
  assert.equal(await fixedLink.count(), 0)
  assert.equal(await reviewerPage.getByText(submissionText, { exact: true }).count(), 0)
  assert.equal(await reviewerPage.locator('#review-verdict').count(), 0)
  assert.deepEqual(await reviewerPage.evaluate(() => [document.visibilityState, window.materialVisibilityChanges]), ['visible', 0])
  await capture(reviewerPage, 'a33-natural-expiry-material-wait.png')
  await open(reviewer, expiringTitle)
  await reviewerPage.locator('#task-facts').getByText('待材料授权', { exact: true }).waitFor()
  pass('absolute_expiry_does_not_expire_project_or_form_a_review', { delta_before_expiry_ms: 1, rejected_http: 409, no_decision: true })

  phase = 'T02 renewed read permission returns to prior review and keeps old artifact'
  await post(reviewer, prefix + '/invitations/redeem', { token: initial.token }, { status: 404 })
  const secondGrant = await invite(worker, { scope: 'object', target_id: v1.id, permission: 'read', days: 1 }, [reviewer])
  assert(Date.parse(secondGrant.expires_at) > expiry)
  const authorized = await taskOf(reviewer, expiring)
  assert.equal(authorized.state, 'submitted')
  assert.equal(authorized.next_actor_id, reviewer.id)
  const resumed = await history(reviewer, expiring)
  assert.deepEqual(resumed.reviews, [])
  assert.deepEqual(resumed.submissions[0].materials, [target])
  const sameArtifact = JSON.stringify(await request(reviewer, materialApi(v1.version_id)))
  assert(sameArtifact.includes(visibleOne) && !sameArtifact.includes(visibleTwo))
  await post(reviewer, expiring + '/reviews', fail, { status: 409, headers: expiryKey })
  const restoredPage = await open(reviewer, expiringTitle)
  assert.equal(await restoredPage.getByRole('link', { name: '打开固定材料 1', exact: true }).getAttribute('href'), materialUrl)
  const reviewForm = restoredPage.getByRole('button', { name: '保存审核', exact: true }).locator('xpath=ancestor::form[1]')
  await reviewForm.locator('#review-verdict').selectOption('final_accept')
  await reviewForm.getByRole('checkbox').setChecked(true)
  await reviewForm.locator('textarea').nth(0).fill('Checked the original V1, not the newer attachment')
  await reviewForm.locator('textarea').nth(1).fill('The same original version is now accessible')
  const actual = await formPost(restoredPage, expiring + '/reviews', '保存审核')
  await restoredPage.getByText('审核已保存。', { exact: true }).waitFor()
  assert.equal(actual.data.task.state, 'accepted')
  assert.equal(actual.data.review.submission_id, materialSubmission.id)
  assert.equal(actual.data.review.reviewer_id, reviewer.id)
  assert.equal(sql('SELECT count(*) n FROM task_review_decisions WHERE submission_id=?', [materialSubmission.id])[0].n, 1)
  assert.deepEqual(submissionRow(materialSubmission.id), fixedSubmission)
  await capture(restoredPage, 'a33-restored-fixed-review.png')
  await host.stop()
  await boot()
  const freshReviewer = await login('reviewer')
  const durable = await history(freshReviewer, expiring)
  assert.equal(durable.reviews.length, 1)
  assert.equal(durable.reviews[0].id, actual.data.review.id)
  assert.deepEqual(durable.submissions[0].materials, [target])
  assert.deepEqual(sql('PRAGMA foreign_key_check'), [])
  pass('restored_original_fixed_material_and_single_durable_decision')
  facts.T02 = facts.A33 = facts.status = 'PASS'
} catch (error) {
  facts.status = 'FAIL'
  facts.failure = { phase, message: String(error.message).slice(0, 700) }
  throw error
} finally {
  try { await browser?.close() }
  finally {
    try { await host?.stop() }
    finally {
      writeFileSync(join(out, 'summary.json'), JSON.stringify(facts, null, 2) + '\n')
      console.log(JSON.stringify({ status: facts.status, T01: facts.T01, T02: facts.T02, A32: facts.A32, A33: facts.A33, out }))
    }
  }
}
