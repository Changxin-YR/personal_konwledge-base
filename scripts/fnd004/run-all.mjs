#!/usr/bin/env node
/** FND-004 3.2.1 acceptance runner: real DSH HTTP plus isolated storage checks. */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { FND004_PORT, REPO, api, bootstrapAndRegister, databaseFacts, dbPath, sql, stopHost } from './harness.mjs'
import { ProbeStorage, readDatabaseFacts } from '../../packages/knowledgeos-panel/lib/test-support.js'

const args = process.argv.slice(2)
const option = name => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined }
const out = resolve(option('out') ?? join(REPO, 'docs', 'evidence', 'FND-004', 'runs', `fnd004-${Date.now()}`))
const port = Number(option('port') ?? FND004_PORT)
const runRoot = join(REPO, '.cache', 'knowledgeos-fnd004-runs', String(Date.now()))
const dataDir = join(runRoot, 'http-data')
mkdirSync(out, { recursive: true }); mkdirSync(runRoot, { recursive: true })

const checks = []
const assert = (value, message, actual) => { if (!value) throw new Error(`${message}${actual === undefined ? '' : `: ${JSON.stringify(actual)}`}`) }
const check = async (id, fn) => {
  const detail = { id, status: 'FAIL', started_at: new Date().toISOString(), evidence: [] }
  try { detail.result = await fn(detail); detail.status = 'PASS' } catch (error) { detail.error = error instanceof Error ? error.message : String(error) }
  detail.finished_at = new Date().toISOString()
  writeFileSync(join(out, `${id}.json`), `${JSON.stringify(detail, null, 2)}\n`)
  checks.push({ id, status: detail.status, evidence: `${id}.json`, error: detail.error })
  console.log(`${detail.status} ${id}${detail.error === undefined ? '' : `: ${detail.error}`}`)
}

let context
try {
  context = await bootstrapAndRegister({ dataDir, outDir: out, port })
  const { admin, alice, bob } = context
  assert(context.bootstrap.status === 201 && context.registerAlice.status === 201 && context.registerBob.status === 201, 'real bootstrap/register failed')
  assert(admin.response.status === 200 && alice.response.status === 200 && bob.response.status === 200, 'three real business logins failed')
  context.me = { admin: (await api(port, admin.cookie, 'GET', '/knowledge/v1/me')).json.data, alice: (await api(port, alice.cookie, 'GET', '/knowledge/v1/me')).json.data, bob: (await api(port, bob.cookie, 'GET', '/knowledge/v1/me')).json.data }
  context.cookies = { admin: admin.cookie, alice: alice.cookie, bob: bob.cookie }
  context.userIds = { admin: context.me.admin.id, alice: context.me.alice.id, bob: context.me.bob.id }

  await check('FND-004-T01', async detail => {
    const personal = await api(port, alice.cookie, 'POST', '/knowledge/v1/objects', { title: '甲的私有对象', body: '甲的私有正文' }); assert(personal.status === 201, 'alice personal object was not created', personal)
    const id = personal.json.data.id
    const ownGet = await api(port, alice.cookie, 'GET', `/knowledge/v1/objects/${id}`); const bobGet = await api(port, bob.cookie, 'GET', `/knowledge/v1/objects/${id}`); const adminGet = await api(port, admin.cookie, 'GET', `/knowledge/v1/objects/${id}`); const bobList = await api(port, bob.cookie, 'GET', '/knowledge/v1/objects')
    const forged = await api(port, bob.cookie, 'POST', '/knowledge/v1/objects', { title: '伪造', body: '伪造', owner_user_id: context.userIds.alice, role: 'admin', actor_id: context.userIds.alice })
    assert(ownGet.status === 200 && ownGet.json.data.body === '甲的私有正文', 'owner direct read failed'); assert([bobGet.status, adminGet.status].every(status => status === 404), 'cross-user direct URL leaked'); assert(bobList.status === 200 && !JSON.stringify(bobList.json).includes('甲的私有正文') && !bobList.json.data.some(item => item.id === id), 'unauthorized list leaked object'); assert(forged.status === 422, 'actor/user/role replacement was accepted')
    context.personalId = id; detail.evidence.push('real_http_three_cookies', 'personal_direct_url_and_list', 'forged_identity_input'); return { statuses: { own: ownGet.status, bob: bobGet.status, admin: adminGet.status, bob_list: bobList.status, forged: forged.status }, cookies: ['admin', 'alice', 'bob'].map(() => '<redacted>') }
  })

  await check('FND-004-T02', async detail => {
    const project = await api(port, alice.cookie, 'POST', '/knowledge/v1/projects', { name: '动作矩阵项目' }); assert(project.status === 201, 'project creation failed', project); const projectId = project.json.data.id
    const membership = await api(port, alice.cookie, 'POST', `/knowledge/v1/projects/${projectId}/memberships`, { user_id: context.userIds.bob, role: 'member' }); assert(membership.status === 204, 'membership creation failed')
    const object = await api(port, alice.cookie, 'POST', '/knowledge/v1/objects', { scope: 'project', project_id: projectId, title: '动作对象', body: '动作正文' }); assert(object.status === 201, 'project object creation failed', object); const id = object.json.data.id
    const ownerStatuses = {}; const bobStatuses = {}; for (const action of ['read', 'comment', 'edit', 'export', 'manage_share', 'delete', 'review', 'view_learning_records']) { ownerStatuses[action] = (await api(port, alice.cookie, 'POST', `/knowledge/v1/objects/${id}/action`, { action })).status; bobStatuses[action] = (await api(port, bob.cookie, 'POST', `/knowledge/v1/objects/${id}/action`, { action })).status }
    const editGrant = await api(port, alice.cookie, 'POST', '/knowledge/v1/grants', { object_id: id, subject_type: 'user', subject_id: context.userIds.bob, action: 'edit' }); assert(editGrant.status === 201, 'edit grant failed')
    const editAction = await api(port, bob.cookie, 'POST', `/knowledge/v1/objects/${id}/action`, { action: 'edit' }); const deleteAction = await api(port, bob.cookie, 'POST', `/knowledge/v1/objects/${id}/action`, { action: 'delete' }); const manageAction = await api(port, bob.cookie, 'POST', `/knowledge/v1/objects/${id}/action`, { action: 'manage_share' })
    assert(Object.values(ownerStatuses).every(status => status === 200), 'owner action matrix failed', ownerStatuses); assert(Object.values(bobStatuses).every(status => status === 404), 'membership implied action permission', bobStatuses); assert(editAction.status === 200 && deleteAction.status === 404 && manageAction.status === 404, 'edit grant implied delete/manage_share')
    context.projectId = projectId; context.projectObjectId = id; detail.evidence.push('real_http_action_matrix', 'edit_without_delete_or_manage_share'); return { owner: ownerStatuses, member_before_grant: bobStatuses, after_edit_grant: { edit: editAction.status, delete: deleteAction.status, manage_share: manageAction.status } }
  })

  await check('FND-004-T03', async detail => {
    const { projectId, projectObjectId } = context
    const nonMemberProject = await api(port, admin.cookie, 'POST', '/knowledge/v1/objects', { scope: 'project', project_id: projectId, title: '管理员越权项目对象', body: '不应写入' }); const invalidProject = await api(port, bob.cookie, 'POST', '/knowledge/v1/objects', { scope: 'project', project_id: 'project-from-another-service', title: '非法项目', body: '不应写入' }); const bobRead = await api(port, bob.cookie, 'GET', `/knowledge/v1/objects/${projectObjectId}`); const learningBefore = await api(port, bob.cookie, 'POST', `/knowledge/v1/objects/${projectObjectId}/action`, { action: 'view_learning_records' }); const learningGrant = await api(port, alice.cookie, 'POST', '/knowledge/v1/grants', { object_id: projectObjectId, subject_type: 'user', subject_id: context.userIds.bob, action: 'view_learning_records' }); const learningAfter = await api(port, bob.cookie, 'POST', `/knowledge/v1/objects/${projectObjectId}/action`, { action: 'view_learning_records' }); const invalidSubjectProject = await api(port, alice.cookie, 'POST', '/knowledge/v1/grants', { object_id: projectObjectId, subject_type: 'project', subject_id: 'project-from-another-service', action: 'read' })
    assert(nonMemberProject.status === 404 && invalidProject.status === 404, 'non-member or invalid project object creation was accepted'); assert(bobRead.status === 404, 'membership alone opened object read'); assert(learningBefore.status === 404 && learningGrant.status === 201 && learningAfter.status === 200, 'learning action was not explicit'); assert(invalidSubjectProject.status === 404, 'invalid project subject grant was accepted')
    const objectCount = Number(sql(dbPath(dataDir), 'SELECT count(*) AS count FROM knowledge_objects')[0].count); assert(objectCount === 2, 'unauthorized project creation wrote an object', objectCount)
    detail.evidence.push('cross_project_creation_denial', 'membership_without_grant', 'explicit_learning_record_grant', 'cross_service_project_rejection'); return { statuses: { non_member_create: nonMemberProject.status, invalid_project: invalidProject.status, read_before_grant: bobRead.status, learning_before: learningBefore.status, learning_after: learningAfter.status, invalid_subject_project: invalidSubjectProject.status }, knowledge_objects: objectCount }
  })

  await check('FND-004-T04', async detail => {
    const { projectObjectId } = context
    const future = await api(port, alice.cookie, 'POST', '/knowledge/v1/grants', { object_id: projectObjectId, subject_type: 'user', subject_id: context.userIds.bob, action: 'comment', valid_from: '2999-01-01T00:00:00.000Z', expires_at: '2999-01-02T00:00:00.000Z' }); assert(future.status === 201, 'future grant was not stored'); const futureUse = await api(port, bob.cookie, 'POST', `/knowledge/v1/objects/${projectObjectId}/action`, { action: 'comment' }); assert(futureUse.status === 404, 'future grant was active early')
    const conflict = await api(port, alice.cookie, 'PATCH', `/knowledge/v1/objects/${projectObjectId}`, { expected_revision: 999, body: '冲突写入' }); assert(conflict.status === 409 && conflict.json?.code === 'REVISION_CONFLICT', 'expected_revision conflict did not return 409', conflict)
    const current = await api(port, alice.cookie, 'GET', `/knowledge/v1/objects/${projectObjectId}`); const updated = await api(port, alice.cookie, 'PATCH', `/knowledge/v1/objects/${projectObjectId}`, { expected_revision: current.json.data.revision, body: '最新正文' }); const stale = await api(port, alice.cookie, 'PATCH', `/knowledge/v1/objects/${projectObjectId}`, { expected_revision: current.json.data.revision, body: '过期正文' }); assert(updated.status === 200 && stale.status === 409, 'revision conflict race was not enforced')
    const grant = await api(port, alice.cookie, 'POST', '/knowledge/v1/grants', { object_id: projectObjectId, subject_type: 'user', subject_id: context.userIds.bob, action: 'read' }); assert(grant.status === 201, 'read grant for revoke race was not created'); const before = await api(port, bob.cookie, 'GET', `/knowledge/v1/objects/${projectObjectId}`)
    const revokes = await Promise.all([api(port, alice.cookie, 'POST', '/knowledge/v1/grants/revoke', { grant_id: grant.json.data.id }), api(port, alice.cookie, 'POST', '/knowledge/v1/grants/revoke', { grant_id: grant.json.data.id })]); const after = await api(port, bob.cookie, 'GET', `/knowledge/v1/objects/${projectObjectId}`); const listAfter = await api(port, bob.cookie, 'GET', '/knowledge/v1/objects'); const actionAfter = await api(port, bob.cookie, 'POST', `/knowledge/v1/objects/${projectObjectId}/action`, { action: 'read' })
    assert(before.status === 200 && revokes.filter(item => item.status === 204).length === 1 && revokes.filter(item => item.status === 404).length === 1, 'revoke race did not have one winner', revokes.map(item => item.status)); assert(after.status === 404 && listAfter.status === 200 && !listAfter.json.data.some(item => item.id === projectObjectId) && actionAfter.status === 404, 'revocation did not immediately invalidate all reads')
    detail.evidence.push('expected_revision_409', 'future_grant_denial', 'real_http_revoke_race', 'post_revoke_read_list_action'); return { future: futureUse.status, conflict: conflict.status, stale: stale.status, revoke_race: revokes.map(item => item.status), after_revoke: { get: after.status, list: listAfter.status, action: actionAfter.status } }
  })

  await check('FND-004-T05', async detail => {
    const failureDir = join(runRoot, 'v3-failure'); rmSync(failureDir, { recursive: true, force: true }); const failed = new ProbeStorage({ dataDir: failureDir, failureAt: 'v3:after-objects' }); assert(!failed.available, 'v3 injected migration failure unexpectedly succeeded'); failed.close(); const failedFacts = readDatabaseFacts(dbPath(failureDir)); assert(failedFacts.userVersion === 2 && failedFacts.ledger.length === 2 && !failedFacts.tables.includes('knowledge_objects'), 'v3 migration failure left a partial commit', failedFacts)
    const recovered = new ProbeStorage({ dataDir: failureDir }); assert(recovered.available, `v3 migration did not recover: ${recovered.failure?.message}`); const recoveredFacts = readDatabaseFacts(dbPath(failureDir)); assert(recoveredFacts.userVersion === 3 && recoveredFacts.ledger.length === 3 && recoveredFacts.tables.includes('knowledge_objects'), 'v3 recovery incomplete', recoveredFacts); const rollback = recovered.testOnlyTransactionFailure({ firstId: 'rollback-a', failingId: 'rollback-a', firstKey: 'rollback-key-a', failingKey: 'rollback-key-b', content: 'rollback' }); assert(rollback.rolledBack && rollback.rows === 0, 'transaction rollback did not remove partial writes', rollback); recovered.close()
    const fakePath = join(runRoot, 'fake-schema'); rmSync(fakePath, { recursive: true, force: true }); const good = new ProbeStorage({ dataDir: fakePath }); assert(good.available, 'baseline v3 fixture unavailable'); good.close(); const fakeDb = new DatabaseSync(dbPath(fakePath)); fakeDb.exec('CREATE TABLE forged_schema (id TEXT PRIMARY KEY) STRICT'); fakeDb.close(); const rejected = new ProbeStorage({ dataDir: fakePath }); assert(!rejected.available && rejected.failure?.code === 'STORAGE_INCOMPATIBLE', 'forged schema was accepted'); const fakeFacts = readDatabaseFacts(dbPath(fakePath)); assert(fakeFacts.tables.includes('forged_schema') && fakeFacts.userVersion === 3 && fakeFacts.ledger.length === 3, 'forged schema rejection modified database', fakeFacts); const repairedDb = new DatabaseSync(dbPath(fakePath)); repairedDb.exec('DROP TABLE forged_schema'); repairedDb.close(); const reopened = new ProbeStorage({ dataDir: fakePath }); assert(reopened.available, 'normal recovery after forged schema removal failed'); reopened.close()
    detail.evidence.push('v3_failure_rollback', 'transaction_rollback', 'forged_schema_rejection', 'normal_recovery'); return { failed: { user_version: failedFacts.userVersion, ledger: failedFacts.ledger.length }, recovered: { user_version: recoveredFacts.userVersion, ledger: recoveredFacts.ledger.length }, transaction: rollback, forged_schema: { rejected: true, unchanged: true }, restored: true }
  })

  await check('FND-004-T06', async detail => {
    const ownerStatus = await api(port, context.ownerCookie, 'GET', '/knowledgeos/status'); const probes = {}; for (const path of ['/api', '/rpc', '/shell', '/files', '/plugins', '/session/attachments', '/sessions/attachments', '/connect']) probes[path] = (await api(port, context.cookies.alice, 'GET', path)).status; const businessStatus = await api(port, context.cookies.alice, 'GET', '/knowledgeos/status')
    assert(ownerStatus.status === 200, 'owner status probe failed'); assert(businessStatus.status === 401 || businessStatus.status === 403 || businessStatus.status === 404, 'business cookie reached DSH status'); assert(Object.values(probes).every(status => status === 401 || status === 403 || status === 404), 'business cookie reached a high-privilege route', probes)
    detail.evidence.push('real_business_cookie_privilege_probes', 'owner_host_status_probe', 'dedicated_shared_profile'); return { host: 'loopback', profile: 'knowledgeos-identity-test', owner_status: ownerStatus.status, business_status: businessStatus.status, probes }
  })

  await check('FND-004-T07', async detail => {
    for (const file of ['packages/knowledgeos-panel/lib/index.js', 'packages/knowledgeos-panel/lib/storage.js', 'packages/knowledgeos-panel/lib/test-support.js']) assert(existsSync(file), `missing frozen candidate artifact: ${file}`); const facts = databaseFacts(dbPath(dataDir)); assert(facts.userVersion === 3 && facts.ledger.length === 3, 'HTTP candidate database is not v3', facts); detail.evidence.push('candidate_artifacts', 'http_database_v3_facts'); return { artifacts: ['lib/index.js', 'lib/storage.js', 'lib/test-support.js'], schema: { user_version: facts.userVersion, ledger: facts.ledger.length } }
  })
} finally { if (context?.host !== undefined) await stopHost(context.host) }

const summary = { status: checks.some(item => item.status !== 'PASS') ? 'FAIL' : 'PASS', candidate: option('candidate') ?? 'WORKTREE', dsh_host: { upstream_commit: '39163dd30f703a79079e2d2446545cff3c453738', profile: 'knowledgeos-identity-test', port }, checks, not_run: ['search_index', 'ai_summary', 'file_download', 'invite_redemption', 'full_cache_invalidation', 'complete_A02_A34_A46'] }
writeFileSync(join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`); console.log(JSON.stringify(summary, null, 2)); rmSync(runRoot, { recursive: true, force: true }); if (summary.status !== 'PASS') process.exitCode = 1
