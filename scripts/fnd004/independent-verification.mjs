#!/usr/bin/env node
/** Independent FND-004 review using a fresh fixed DSH Host and real HTTP. */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { FND004_PORT, REPO, api, dbPath, login, startDedicatedHost, stopHost } from './harness.mjs'

const args = process.argv.slice(2)
const arg = name => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined }
const candidate = arg('candidate') ?? 'WORKTREE'
const out = resolve(arg('out') ?? join(REPO, 'docs', 'evidence', 'FND-004', 'independent'))
const port = Number(arg('port') ?? String(FND004_PORT + 1))
const root = join(REPO, '.cache', 'knowledgeos-fnd004-independent', String(Date.now()))
const dataDir = join(root, 'data')
mkdirSync(out, { recursive: true }); mkdirSync(root, { recursive: true })
const assert = (value, message) => { if (!value) throw new Error(message) }
let host
let status = 'PASS'
let error
const result = {}
try {
  host = await startDedicatedHost(dataDir, out, port)
  const ownerCookie = (await (await import('./harness.mjs')).entryCookie(host.entryUrl)).cookie
  const bootstrap = await api(port, ownerCookie, 'POST', '/knowledge/v1/auth/bootstrap', { login_name: 'admin', display_name: '管理员', password: 'Admin password 2026!' })
  const registerAlice = await api(port, '', 'POST', '/knowledge/v1/auth/register', { login_name: 'alice', display_name: '甲', password: 'Alice password 2026!' })
  const registerBob = await api(port, '', 'POST', '/knowledge/v1/auth/register', { login_name: 'bob', display_name: '乙', password: 'Bob password 2026!' })
  const alice = await login(port, 'alice', 'Alice password 2026!'); const bob = await login(port, 'bob', 'Bob password 2026!')
  assert(bootstrap.status === 201 && registerAlice.status === 201 && registerBob.status === 201 && alice.response.status === 200 && bob.response.status === 200, 'independent real login setup failed')
  const aliceMe = (await api(port, alice.cookie, 'GET', '/knowledge/v1/me')).json.data; const bobMe = (await api(port, bob.cookie, 'GET', '/knowledge/v1/me')).json.data
  const personal = await api(port, alice.cookie, 'POST', '/knowledge/v1/objects', { title: '独立复核对象', body: '独立复核正文' }); assert(personal.status === 201, 'independent personal create failed'); const objectId = personal.json.data.id
  const bobDenied = await api(port, bob.cookie, 'GET', `/knowledge/v1/objects/${objectId}`); assert(bobDenied.status === 404, 'independent cross-user read was allowed')
  const conflict = await api(port, alice.cookie, 'PATCH', `/knowledge/v1/objects/${objectId}`, { expected_revision: 99, body: '冲突' }); assert(conflict.status === 409 && conflict.json?.code === 'REVISION_CONFLICT', 'independent expected_revision conflict was not 409')
  const project = await api(port, alice.cookie, 'POST', '/knowledge/v1/projects', { name: '独立复核项目' }); assert(project.status === 201, 'independent project create failed'); const projectId = project.json.data.id
  assert((await api(port, alice.cookie, 'POST', `/knowledge/v1/projects/${projectId}/memberships`, { user_id: bobMe.id, role: 'member' })).status === 204, 'independent membership create failed')
  const projectObject = await api(port, alice.cookie, 'POST', '/knowledge/v1/objects', { scope: 'project', project_id: projectId, title: '独立项目对象', body: '正文' }); assert(projectObject.status === 201, 'independent project object create failed'); const projectObjectId = projectObject.json.data.id
  const grant = await api(port, alice.cookie, 'POST', '/knowledge/v1/grants', { object_id: projectObjectId, subject_type: 'user', subject_id: bobMe.id, action: 'read' }); assert(grant.status === 201, 'independent grant create failed')
  const shared = await api(port, bob.cookie, 'GET', `/knowledge/v1/objects/${projectObjectId}`); assert(shared.status === 200, 'independent granted read failed')
  const revoke = await api(port, alice.cookie, 'POST', '/knowledge/v1/grants/revoke', { grant_id: grant.json.data.id }); assert(revoke.status === 204, 'independent grant revoke failed')
  const revoked = await api(port, bob.cookie, 'GET', `/knowledge/v1/objects/${projectObjectId}`); assert(revoked.status === 404, 'independent revoked read remained active')
  const ownerStatus = await api(port, ownerCookie, 'GET', '/knowledgeos/status'); const businessStatus = await api(port, alice.cookie, 'GET', '/knowledgeos/status'); const rpc = await api(port, alice.cookie, 'GET', '/api'); assert(ownerStatus.status === 200, 'owner status failed'); assert([401, 403, 404].includes(businessStatus.status) && [401, 403, 404].includes(rpc.status), 'business cookie reached host privilege')
  result.http = { bootstrap: bootstrap.status, register: [registerAlice.status, registerBob.status], login: [alice.response.status, bob.response.status], cross_user: bobDenied.status, expected_revision: conflict.status, grant: grant.status, shared: shared.status, revoke: revoke.status, revoked: revoked.status, owner_status: ownerStatus.status, business_status: businessStatus.status, rpc: rpc.status }
  result.database = { path: '<redacted>', exists: existsSync(dbPath(dataDir)) }
  result.profile = { host: 'loopback', dsh_upstream_commit: '39163dd30f703a79079e2d2446545cff3c453738', profile: 'knowledgeos-identity-test', port }
} catch (caught) { status = 'FAIL'; error = caught instanceof Error ? caught.message : String(caught) } finally { if (host !== undefined) await stopHost(host); rmSync(root, { recursive: true, force: true }) }
const summary = { candidate, status, error, checks: [{ id: 'real-http-independent', status, result }], not_run: ['full_A02_A34_A46_search_ai_export_cache'] }
writeFileSync(join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))
if (status !== 'PASS') process.exitCode = 1
