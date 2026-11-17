#!/usr/bin/env node
/** FND-003 T01-T12 real acceptance runner. */
import { createHash, randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  DEFAULT_HOME, DEFAULT_PORT, DEFAULT_PROFILE, REPO, UPSTREAM_COMMIT,
  cookieFromResponse, entryCookie, request, requestWithHost, sleep, startHost, stopHost,
} from './harness.mjs'

const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1] }
const OUT = resolve(option('out') ?? join(REPO, 'docs', 'evidence', 'FND-003', 'runs', `run-${Date.now()}`))
const RUN_ID = option('run-id') ?? `run-${Date.now()}`
const PORT = Number(option('port') ?? String(DEFAULT_PORT))
const DATA_ROOT = join(REPO, '.cache', 'knowledgeos-fnd003-data', RUN_ID)
const PROFILE_DIR = join(DEFAULT_HOME, 'profiles', DEFAULT_PROFILE)
const PATCH_PATH = join(PROFILE_DIR, 'cordis.patch.yml')
const ONLY = option('only') === undefined ? undefined : new Set(option('only').split(',').map(item => item.trim().toUpperCase()))
const manifestPath = resolve(option('manifest') ?? join(REPO, 'docs', 'evidence', 'FND-003', 'candidate-manifest.json'))
const storageModule = await import(pathToFileURL(join(REPO, 'packages', 'knowledgeos-panel', 'lib', 'test-support.js')).href)
const { ProbeStorage, readDatabaseFacts, MIGRATION_V1_SQL, MIGRATION_V1_CHECKSUM, MIGRATION_V2_CHECKSUM, KdfScheduler, AuthRateLimiter, derivePassword, tokenHash } = storageModule

mkdirSync(OUT, { recursive: true })
mkdirSync(DATA_ROOT, { recursive: true })
const originalPatch = existsSync(PATCH_PATH) ? readFileSync(PATCH_PATH, 'utf8') : ''
const results = []
const failures = []
let current
let suiteStarted = new Date().toISOString()

const dbPath = dataDir => join(dataDir, 'knowledgeos.sqlite')
const now = () => new Date().toISOString()
const jsonHeaders = extra => ({ 'content-type': 'application/json', 'x-knowledgeos-request': '1', ...(extra ?? {}) })
const body = value => JSON.stringify(value)
const redacted = value => JSON.parse(JSON.stringify(value, (key, item) => {
  if (/password|token|cookie|derived_key|salt/i.test(key)) return '<redacted>'
  if (typeof item === 'string' && item.includes(REPO)) return item.replaceAll(REPO.replaceAll('\\', '/'), '<repo>').replaceAll(REPO, '<repo>')
  return item
}))
const sql = (path, statement, params = []) => {
  const db = new DatabaseSync(path, { readOnly: true })
  try { return db.prepare(statement).all(...params) } finally { db.close() }
}
const count = (path, table, where = '', params = []) => Number(sql(path, `SELECT count(*) AS count FROM ${table}${where}`, params)[0].count)
const patchText = dataDir => dataDir === undefined
  ? '- id: knowledgeos-host\n'
  : `- id: knowledgeos-host\n  config:\n    dataDir: "${dataDir.replaceAll('\\', '/')}"\n`
async function setPatch(dataDir) { mkdirSync(PROFILE_DIR, { recursive: true }); writeFileSync(PATCH_PATH, patchText(dataDir), 'utf8') }
async function boot(dataDir, label) {
  if (current !== undefined) await stopHost(current)
  await setPatch(dataDir)
  current = await startHost({ home: DEFAULT_HOME, profile: DEFAULT_PROFILE, port: PORT, logFile: join(OUT, `${label}.log`) })
  const owner = await entryCookie(current.entryUrl)
  return { ownerCookie: owner.cookie, entryUrl: current.entryUrl }
}
async function shutdown() { if (current !== undefined) await stopHost(current); current = undefined }
const api = (cookie, method, path, headers = {}, payload) => request({ port: PORT, cookie, method, path, headers, body: payload })
const validBody = (name, display, password = 'Correct horse battery staple 2026!') => ({ login_name: name, display_name: display, password })
async function bootstrap(dataDir, label = 'bootstrap') {
  const host = await boot(dataDir, label)
  const response = await api(host.ownerCookie, 'POST', '/knowledge/v1/auth/bootstrap', jsonHeaders(), body(validBody('admin', '管理员', 'Admin password 2026!')))
  return { ...host, response }
}
async function registerLogin(name, display, password, cookie = '') {
  const registered = await api(cookie, 'POST', '/knowledge/v1/auth/register', jsonHeaders(), body(validBody(name, display, password)))
  const logged = await api('', 'POST', '/knowledge/v1/auth/login', jsonHeaders(), body({ login_name: name, password }))
  return { registered, logged, cookie: cookieFromResponse(logged), user: logged.json?.data }
}
function expect(detail, condition, message, actual) {
  detail.assertions.push({ ok: Boolean(condition), message, actual: actual === undefined ? undefined : redacted(actual) })
  if (!condition) throw new Error(`${message}${actual === undefined ? '' : `: ${JSON.stringify(redacted(actual))}`}`)
}
async function run(id, name, fn) {
  if (ONLY !== undefined && !ONLY.has(id)) return
  const detail = { id, name, status: 'FAIL', started: new Date().toISOString(), role: 'implementation+supervisor', assertions: [], details: {}, evidence: [] }
  console.log(`\n=== ${id} ${name} ===`)
  try { detail.details = { ...(await fn(detail) ?? {}) }; detail.status = 'PASS'; console.log(`PASS ${id}`) }
  catch (error) { detail.status = 'FAIL'; detail.error = error instanceof Error ? error.stack ?? error.message : String(error); failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`); console.log(`FAIL ${id}: ${detail.error}`) }
  finally { detail.finished = new Date().toISOString(); writeFileSync(join(OUT, `${id}.json`), `${JSON.stringify(detail, null, 2)}\n`, 'utf8'); results.push({ id, name, status: detail.status, evidence: `${id}.json` }); await shutdown() }
}

try {
  await run('T01', '可信本机初始化与管理员唯一性', async detail => {
    const dataDir = join(DATA_ROOT, 't01'); rmSync(dataDir, { recursive: true, force: true })
    const host = await boot(dataDir, 't01')
    const pageOwner = await api(host.ownerCookie, 'GET', '/knowledgeos/setup')
    const pageAnon = await api('', 'GET', '/knowledgeos/setup')
    expect(detail, pageOwner.status === 200 && pageOwner.text.includes('首次管理员初始化'), 'owner setup page is available', pageOwner.status)
    expect(detail, pageAnon.status === 401 || pageAnon.status === 403, 'anonymous setup page is denied', pageAnon.status)
    const anon = await api('', 'POST', '/knowledge/v1/auth/bootstrap', jsonHeaders(), body(validBody('anon', '匿名', 'Anonymous password 2026!')))
    const fake = await api('kos_session_fake=fake', 'POST', '/knowledge/v1/auth/bootstrap', jsonHeaders(), body(validBody('fake', '伪造', 'Fake password 2026!')))
    const wrongOrigin = await api(host.ownerCookie, 'POST', '/knowledge/v1/auth/bootstrap', jsonHeaders({ origin: 'http://evil.invalid' }), body(validBody('bad-origin', '错误来源', 'Wrong origin password 2026!')))
    expect(detail, anon.status === 401 || anon.status === 403, 'anonymous bootstrap rejected', anon.status)
    expect(detail, fake.status === 401 || fake.status === 403, 'business or fake cookie bootstrap rejected', fake.status)
    expect(detail, wrongOrigin.status === 403, 'owner bootstrap with foreign origin rejected', wrongOrigin.json)
    const requests = [
      api(host.ownerCookie, 'POST', '/knowledge/v1/auth/bootstrap', jsonHeaders(), body(validBody('admin-a', '管理员甲', 'Admin A password 2026!'))),
      api(host.ownerCookie, 'POST', '/knowledge/v1/auth/bootstrap', jsonHeaders(), body(validBody('admin-b', '管理员乙', 'Admin B password 2026!'))),
    ]
    const concurrent = await Promise.all(requests)
    expect(detail, concurrent.filter(item => item.status === 201).length === 1, 'concurrent owner bootstrap has one winner', concurrent.map(item => item.status))
    expect(detail, concurrent.filter(item => item.status === 409 && item.json?.code === 'ALREADY_INITIALIZED').length === 1, 'concurrent loser is ALREADY_INITIALIZED', concurrent.map(item => item.json?.code))
    const facts = readDatabaseFacts(dbPath(dataDir))
    expect(detail, count(dbPath(dataDir), 'users') === 1 && count(dbPath(dataDir), 'password_credentials') === 1 && count(dbPath(dataDir), 'spaces') === 1, 'bootstrap writes one user credential and personal space', facts)
    expect(detail, sql(dbPath(dataDir), 'SELECT initialized_at, bootstrap_admin_user_id FROM service_identity')[0].initialized_at !== null, 'service identity initialized', sql(dbPath(dataDir), 'SELECT initialized_at FROM service_identity'))
    await shutdown(); const after = await boot(dataDir, 't01-restart')
    const duplicate = await api(after.ownerCookie, 'POST', '/knowledge/v1/auth/bootstrap', jsonHeaders(), body(validBody('admin-c', '管理员丙', 'Admin C password 2026!')))
    expect(detail, duplicate.status === 409 && duplicate.json?.code === 'ALREADY_INITIALIZED', 'restart keeps initialization marker', duplicate.json)
    return { concurrent: concurrent.map(item => ({ status: item.status, code: item.json?.code })), facts, cookie_headers: { owner: '<redacted>' }, evidence: ['t01.log', 't01-restart.log'] }
  })

  await run('T02', '三个独立业务身份注册登录与个人空间', async detail => {
    const dataDir = join(DATA_ROOT, 't02'); rmSync(dataDir, { recursive: true, force: true })
    const booted = await bootstrap(dataDir, 't02')
    const adminLogin = await api('', 'POST', '/knowledge/v1/auth/login', jsonHeaders(), body({ login_name: 'admin', password: 'Admin password 2026!' }))
    expect(detail, booted.response.status === 201 && adminLogin.status === 200, 'administrator bootstrap and business login work', { bootstrap: booted.response.status, login: adminLogin.status })
    const alice = await registerLogin(' Alice ', '甲', 'Alice password 2026!')
    const bob = await registerLogin('BOB', '乙', 'Bob password 2026!')
    expect(detail, alice.registered.status === 201 && bob.registered.status === 201, 'two member registrations succeed', [alice.registered.status, bob.registered.status])
    expect(detail, alice.registered.headers.get('set-cookie') === null && bob.registered.headers.get('set-cookie') === null, 'registration does not auto-login', { alice: alice.registered.headers.get('set-cookie'), bob: bob.registered.headers.get('set-cookie') })
    const duplicate = await api('', 'POST', '/knowledge/v1/auth/register', jsonHeaders(), body(validBody(' alice ', '替换甲', 'Other password 2026!')))
    expect(detail, duplicate.status === 409 && duplicate.json?.code === 'LOGIN_NAME_TAKEN', 'normalized duplicate registration conflicts', duplicate.json)
    const aliceLogout = await api(alice.cookie, 'POST', '/knowledge/v1/auth/logout', jsonHeaders(), '{}')
    const aliceAfterLogout = await api(alice.cookie, 'GET', '/knowledge/v1/me')
    const aliceRelogin = await api('', 'POST', '/knowledge/v1/auth/login', jsonHeaders(), body({ login_name: 'alice', password: 'Alice password 2026!' }))
    expect(detail, aliceLogout.status === 204 && aliceAfterLogout.status === 401 && aliceRelogin.status === 200, 'member logout and relogin work', { logout: aliceLogout.status, after: aliceAfterLogout.status, relogin: aliceRelogin.status })
    const users = sql(dbPath(dataDir), 'SELECT login_name, role, credential_ref FROM users ORDER BY login_name')
    const spaces = sql(dbPath(dataDir), 'SELECT owner_user_id, kind FROM spaces ORDER BY owner_user_id')
    expect(detail, users.length === 3 && users.every(row => row.role === 'admin' || row.role === 'member'), 'three service users have server roles', users)
    expect(detail, spaces.length === 3 && new Set(spaces.map(row => row.owner_user_id)).size === 3, 'three personal spaces are unique', spaces)
    return { users: users.map(row => ({ login_name: row.login_name, role: row.role, credential_ref: '<redacted>' })), spaces: spaces.length, cookies: ['admin', 'alice', 'bob'].map(() => '<redacted>') }
  })

  await run('T03', '业务身份与 DSH 宿主权限分离', async detail => {
    const dataDir = join(DATA_ROOT, 't03'); rmSync(dataDir, { recursive: true, force: true })
    const booted = await bootstrap(dataDir, 't03'); const alice = await registerLogin('alice', '甲', 'Alice password 2026!')
    const ownerMe = await api(booted.ownerCookie, 'GET', '/knowledge/v1/me')
    const ownerSpaces = await api(booted.ownerCookie, 'GET', '/knowledge/v1/spaces')
    const businessStatus = await api(alice.cookie, 'GET', '/knowledgeos/status')
    const ownerStatus = await api(booted.ownerCookie, 'GET', '/knowledgeos/status')
    const rpc = await api(alice.cookie, 'GET', '/api')
    const connect = await api(alice.cookie, 'GET', '/connect')
    const before = sql(dbPath(dataDir), 'SELECT login_name, role, goal_text, revision FROM users ORDER BY login_name')
    const spoof = await api(alice.cookie, 'PATCH', '/knowledge/v1/me/preferences', jsonHeaders(), body({ expected_revision: 1, goal_text: '合法目标', user_id: 'other', role: 'admin', owner_id: 'owner', service_id: 'other', space_id: 'other' }))
    const after = sql(dbPath(dataDir), 'SELECT login_name, role, goal_text, revision FROM users ORDER BY login_name')
    expect(detail, ownerMe.status === 401 && ownerSpaces.status === 401, 'owner DSH cookie does not create business actor', { me: ownerMe.status, spaces: ownerSpaces.status })
    expect(detail, businessStatus.status === 401 || businessStatus.status === 403 || businessStatus.status === 404, 'business cookie has no DSH status permission', businessStatus.status)
    expect(detail, ownerStatus.status === 200, 'owner DSH status remains available', ownerStatus.status)
    expect(detail, [rpc.status, connect.status].every(status => status === 401 || status === 403 || status === 404), 'business cookie has no owner RPC or connect capability', [rpc.status, connect.status])
    expect(detail, spoof.status === 422 && JSON.stringify(before) === JSON.stringify(after), 'identity override fields are rejected without writes', spoof.json)
    return { routes: { rpc: rpc.status, connect: connect.status }, database_unchanged: true }
  })

  await run('T04', '会话生成、到期、注销和重启', async detail => {
    const dataDir = join(DATA_ROOT, 't04'); rmSync(dataDir, { recursive: true, force: true })
    await bootstrap(dataDir, 't04'); await registerLogin('alice', '甲', 'Alice password 2026!')
    const first = await api('', 'POST', '/knowledge/v1/auth/login', jsonHeaders(), body({ login_name: 'alice', password: 'Alice password 2026!' })); const cookie1 = cookieFromResponse(first)
    const second = await api('', 'POST', '/knowledge/v1/auth/login', jsonHeaders(), body({ login_name: 'alice', password: 'Alice password 2026!' })); const cookie2 = cookieFromResponse(second)
    const fake = await api('kos_session_fake=not-a-real-token', 'GET', '/knowledge/v1/me')
    const oldWithReplacement = await api(cookie1, 'POST', '/knowledge/v1/auth/login', jsonHeaders(), body({ login_name: 'alice', password: 'Alice password 2026!' }))
    const oldReplay = await api(cookie1, 'GET', '/knowledge/v1/me')
    const otherClient = await api(cookie2, 'GET', '/knowledge/v1/me')
    expect(detail, first.status === 200 && second.status === 200 && oldWithReplacement.status === 200, 'multiple opaque sessions can be created', [first.status, second.status, oldWithReplacement.status])
    expect(detail, fake.status === 401 && oldReplay.status === 401 && otherClient.status === 200, 'fake and replaced sessions are rejected while other client remains', { fake: fake.status, oldReplay: oldReplay.status, otherClient: otherClient.status })
    const sessionRows = sql(dbPath(dataDir), 'SELECT token_hash, length(token_hash) AS length, revoked_at, expires_at FROM auth_sessions ORDER BY created_at')
    expect(detail, sessionRows.every(row => row.length === 64), 'database stores only 64-character token hashes', sessionRows.map(row => ({ length: row.length, revoked: row.revoked_at !== null })))
    const loggedOut = await api(cookie2, 'POST', '/knowledge/v1/auth/logout', jsonHeaders(), '{}'); const replayLogout = await api(cookie2, 'POST', '/knowledge/v1/auth/logout', jsonHeaders(), '{}')
    expect(detail, loggedOut.status === 204 && replayLogout.status === 204 && (await api(cookie2, 'GET', '/knowledge/v1/me')).status === 401, 'logout is persistent and idempotent', [loggedOut.status, replayLogout.status])
    await shutdown(); const live = new DatabaseSync(dbPath(dataDir)); live.exec("UPDATE auth_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE revoked_at IS NULL"); live.close()
    const restarted = await boot(dataDir, 't04-restart'); const expired = await api(cookieFromResponse(oldWithReplacement), 'GET', '/knowledge/v1/me')
    expect(detail, expired.status === 401, 'expired session remains invalid after restart', expired.status)
    const disabled = new DatabaseSync(dbPath(dataDir)); disabled.exec("UPDATE users SET status='disabled' WHERE login_name='alice'"); disabled.close()
    const disabledResponse = await api(cookieFromResponse(oldWithReplacement), 'GET', '/knowledge/v1/me')
    expect(detail, disabledResponse.status === 401, 'disabled user cannot use a session', disabledResponse.status)
    return { session_count: sessionRows.length, restarted_pid: restarted.entryUrl.replace(/.*:/, '<port>'), expiry_boundary: 'now >= expires_at', cookies: ['<redacted>'] }
  })

  await run('T05', '来源、防伪、媒体类型与请求界限', async detail => {
    const dataDir = join(DATA_ROOT, 't05'); rmSync(dataDir, { recursive: true, force: true })
    await bootstrap(dataDir, 't05'); const alice = await registerLogin('alice', '甲', 'Alice password 2026!')
    const valid = await api(alice.cookie, 'GET', '/knowledge/v1/me')
    const before = count(dbPath(dataDir), 'users')
    const cases = {
      origin: await api(alice.cookie, 'PATCH', '/knowledge/v1/me/preferences', jsonHeaders({ origin: 'http://evil.invalid' }), body({ expected_revision: 1, goal_text: 'bad' })),
      null_origin: await api(alice.cookie, 'PATCH', '/knowledge/v1/me/preferences', jsonHeaders({ origin: 'null' }), body({ expected_revision: 1, goal_text: 'bad' })),
      cross_site: await api(alice.cookie, 'PATCH', '/knowledge/v1/me/preferences', jsonHeaders({ 'sec-fetch-site': 'cross-site' }), body({ expected_revision: 1, goal_text: 'bad' })),
      missing_header: await api(alice.cookie, 'PATCH', '/knowledge/v1/me/preferences', { 'content-type': 'application/json' }, body({ expected_revision: 1, goal_text: 'bad' })),
      form: await api(alice.cookie, 'POST', '/knowledge/v1/auth/logout', { 'content-type': 'application/x-www-form-urlencoded', 'x-knowledgeos-request': '1' }, 'x=1'),
      bad_host: await requestWithHost({ port: PORT, cookie: alice.cookie, method: 'PATCH', path: '/knowledge/v1/me/preferences', headers: jsonHeaders({ host: 'evil.invalid' }), body: body({ expected_revision: 1, goal_text: 'bad' }) }),
    }
    expect(detail, valid.status === 200, 'same-origin GET without Origin succeeds', valid.status)
    expect(detail, cases.origin.status === 403 && cases.null_origin.status === 403 && cases.cross_site.status === 403 && cases.missing_header.status === 403 && cases.bad_host.status === 403, 'origin/fetch/host matrix rejects cross-site mutations', Object.fromEntries(Object.entries(cases).map(([key, value]) => [key, value.status])))
    expect(detail, cases.form.status === 415, 'simple form content type is rejected', cases.form.status)
    expect(detail, count(dbPath(dataDir), 'users') === before, 'rejected source requests do not create users', count(dbPath(dataDir), 'users'))
    const forwarded = await api(alice.cookie, 'PATCH', '/knowledge/v1/me/preferences', jsonHeaders({ 'x-forwarded-for': '8.8.8.8', forwarded: 'for=8.8.8.8' }), body({ expected_revision: 1, goal_text: 'forwarded ignored' }))
    expect(detail, forwarded.status === 200, 'forwarded headers do not replace socket trust', forwarded.status)
    return { statuses: Object.fromEntries(Object.entries(cases).map(([key, value]) => [key, value.status])), no_origin_get: valid.status }
  })

  await run('T06', '领域、目标、私人空间及版本冲突', async detail => {
    const dataDir = join(DATA_ROOT, 't06'); rmSync(dataDir, { recursive: true, force: true })
    await bootstrap(dataDir, 't06'); const alice = await registerLogin('alice', '甲', 'Alice password 2026!'); const bob = await registerLogin('bob', '乙', 'Bob password 2026!')
    const patch = await api(alice.cookie, 'PATCH', '/knowledge/v1/me/preferences', jsonHeaders(), body({ expected_revision: 1, domains: ['software_engineering', 'system_architecture', 'hardware_engineering', 'ai_development'], learning_tracks: ['engineering_practice', 'architecture_exam', 'knowledge_accumulation'], goal_text: '在上海完成 KnowledgeOS 身份与架构学习。', timezone: 'America/Los_Angeles' }))
    const me = await api(alice.cookie, 'GET', '/knowledge/v1/me'); const spaces = await api(alice.cookie, 'GET', '/knowledge/v1/spaces'); const other = await api(bob.cookie, 'GET', '/knowledge/v1/me')
    expect(detail, patch.status === 200 && me.json?.data?.goal_text.includes('KnowledgeOS'), 'four domains three tracks Chinese goal and timezone persist', patch.json)
    expect(detail, spaces.status === 200 && spaces.json?.data?.length === 1 && other.json?.data?.login_name === 'bob', 'personal spaces are actor-scoped', { spaces: spaces.json?.data?.length, other: other.json?.data?.login_name })
    await shutdown(); await boot(dataDir, 't06-restart'); const aliceAgain = await api('', 'POST', '/knowledge/v1/auth/login', jsonHeaders(), body({ login_name: 'alice', password: 'Alice password 2026!' })); const aliceCookie = cookieFromResponse(aliceAgain)
    const afterRestart = await api(aliceCookie, 'GET', '/knowledge/v1/me'); expect(detail, afterRestart.status === 200 && afterRestart.json?.data?.timezone === 'America/Los_Angeles', 'preferences survive restart', afterRestart.json)
    const cookieB = cookieFromResponse(await api('', 'POST', '/knowledge/v1/auth/login', jsonHeaders(), body({ login_name: 'alice', password: 'Alice password 2026!' })))
    const [one, two] = await Promise.all([api(aliceCookie, 'PATCH', '/knowledge/v1/me/preferences', jsonHeaders(), body({ expected_revision: 2, goal_text: '草稿 A' })), api(cookieB, 'PATCH', '/knowledge/v1/me/preferences', jsonHeaders(), body({ expected_revision: 2, goal_text: '草稿 B' }))])
    expect(detail, [one.status, two.status].sort((a, b) => a - b).join(',') === '200,409', 'same revision has one winner and one conflict', [one.status, two.status])
    const spoof = await api(aliceCookie, 'PATCH', '/knowledge/v1/me/preferences', jsonHeaders(), body({ expected_revision: 3, space_id: spaces.json?.data?.[0]?.id, owner_id: bob.user?.id, goal_text: 'spoof' }))
    expect(detail, spoof.status === 422, 'preference identity fields cannot be supplied', spoof.json)
    return { revision_results: [one.status, two.status], persisted: true, spaces: spaces.json?.data?.length }
  })

  await run('T07', '密码、输入和公开证据保护', async detail => {
    const dataDir = join(DATA_ROOT, 't07'); rmSync(dataDir, { recursive: true, force: true })
    await bootstrap(dataDir, 't07'); const alice = await registerLogin('alice', '甲', 'Alice password 2026!')
    const badCases = {
      short: await api('', 'POST', '/knowledge/v1/auth/register', jsonHeaders(), body(validBody('shorty', '短', 'short'))),
      unknown_field: await api('', 'POST', '/knowledge/v1/auth/register', jsonHeaders(), body({ ...validBody('unknown', '未知', 'Unknown password 2026!'), sql: 'DROP TABLE users' })),
      surrogate: await api('', 'POST', '/knowledge/v1/auth/register', jsonHeaders(), '{"login_name":"bad","display_name":"\\ud800","password":"Valid password 2026!"}'),
      too_large: await api('', 'POST', '/knowledge/v1/auth/register', jsonHeaders(), body({ ...validBody('large', '大', 'Valid password 2026!'), goal_text: 'x'.repeat(20_000) })),
    }
    expect(detail, Object.values(badCases).every(item => item.status === 422 || item.status === 413), 'input boundaries reject malformed values', Object.fromEntries(Object.entries(badCases).map(([key, value]) => [key, value.status])))
    const wrong = await api('', 'POST', '/knowledge/v1/auth/login', jsonHeaders(), body({ login_name: 'alice', password: 'Wrong password 2026!' }))
    const unknown = await api('', 'POST', '/knowledge/v1/auth/login', jsonHeaders(), body({ login_name: 'missing', password: 'Wrong password 2026!' }))
    expect(detail, wrong.status === 401 && unknown.status === 401 && wrong.json?.code === unknown.json?.code, 'unknown and wrong password use one safe error', { wrong: wrong.json?.code, unknown: unknown.json?.code })
    const rows = sql(dbPath(dataDir), 'SELECT salt, derived_key, length(token_hash) AS token_length FROM password_credentials c LEFT JOIN auth_sessions s ON 1=1')
    const salts = sql(dbPath(dataDir), 'SELECT salt, derived_key FROM password_credentials')
    expect(detail, salts.length >= 2 && salts[0].salt.toString('hex') !== salts[1].salt.toString('hex'), 'same password credentials use different salts', salts.map(row => ({ salt_bytes: row.salt.length, key_bytes: row.derived_key.length })))
    const output = JSON.stringify({ badCases, wrong: wrong.json, unknown: unknown.json, alice: alice.user }).toLowerCase()
    expect(detail, !output.includes('alice password') && !output.includes('wrong password') && !output.includes('token='), 'public response evidence contains no secrets', output)
    const sqlText = await api(alice.cookie, 'PATCH', '/knowledge/v1/me/preferences', jsonHeaders(), body({ expected_revision: 1, goal_text: "'; DROP TABLE users; --\n中文" }))
    expect(detail, sqlText.status === 200, 'SQL-looking text is stored as data', sqlText.status)
    return { kdf: { algorithm: 'scrypt', n: 131072, r: 8, p: 1, maxmem: 201326592, salt_bytes: 16, key_bytes: 32 }, credential_rows: salts.length, bad_cases: Object.fromEntries(Object.entries(badCases).map(([key, value]) => [key, value.status])) }
  })

  await run('T08', '新库与 v1 到 v2 无损迁移', async detail => {
    const root = join(DATA_ROOT, 't08'); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true })
    const fresh = new ProbeStorage({ dataDir: join(root, 'fresh') }); expect(detail, fresh.available, 'new database opens'); const freshFacts = readDatabaseFacts(fresh.databasePath); fresh.close()
    const v1Dir = join(root, 'v1'); mkdirSync(v1Dir, { recursive: true }); const v1Path = dbPath(v1Dir); const db = new DatabaseSync(v1Path); db.exec(MIGRATION_V1_SQL); db.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (1, ?, ?)').run(MIGRATION_V1_CHECKSUM, now()); db.exec('PRAGMA application_id = 0x4b4f5331'); db.exec('PRAGMA user_version = 1'); db.prepare('INSERT INTO storage_probe_records (id, idempotency_key, request_digest, content, created_at) VALUES (?, ?, ?, ?, ?)').run('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'a'.repeat(64), 'v1 sentinel', now()); db.close()
    const before = readDatabaseFacts(v1Path); const migrated = new ProbeStorage({ dataDir: v1Dir }); expect(detail, migrated.available, 'existing v1 database upgrades to v2'); const after = readDatabaseFacts(v1Path); expect(detail, after.ledger.length === 2 && after.ledger[0].checksum === MIGRATION_V1_CHECKSUM && after.ledger[1].checksum === MIGRATION_V2_CHECKSUM, 'v1 ledger and v2 checksum are preserved', after.ledger); expect(detail, sql(v1Path, 'SELECT content FROM storage_probe_records')[0].content === 'v1 sentinel', 'v1 sentinel survives migration'); migrated.close(); const repeat = new ProbeStorage({ dataDir: v1Dir }); expect(detail, repeat.available && readDatabaseFacts(v1Path).ledger.length === 2, 'repeat start does not duplicate migration ledger'); repeat.close()
    const fixtures = {}
    for (const kind of ['future', 'wrong-app', 'bad-checksum', 'unknown-schema', 'prefix']) {
      const dir = join(root, kind); mkdirSync(dir, { recursive: true }); const path = dbPath(dir); const fixture = new DatabaseSync(path); fixture.exec(MIGRATION_V1_SQL); fixture.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (1, ?, ?)').run(kind === 'bad-checksum' ? '0'.repeat(64) : MIGRATION_V1_CHECKSUM, now()); fixture.exec(kind === 'future' ? 'PRAGMA application_id=0x4b4f5331; PRAGMA user_version=99' : kind === 'wrong-app' ? 'PRAGMA application_id=12345; PRAGMA user_version=1' : 'PRAGMA application_id=0x4b4f5331; PRAGMA user_version=1'); if (kind === 'unknown-schema') fixture.exec('CREATE TABLE foreign_business (id TEXT PRIMARY KEY)'); if (kind === 'prefix') fixture.exec('CREATE TABLE sqliteX_foreign_private (id INTEGER PRIMARY KEY)'); fixture.close(); const factsBefore = readDatabaseFacts(path); const rejected = new ProbeStorage({ dataDir: dir }); const factsAfter = readDatabaseFacts(path); expect(detail, !rejected.available && rejected.failure?.code === 'STORAGE_INCOMPATIBLE', `${kind} fixture is rejected`, rejected.failure?.code); expect(detail, JSON.stringify(factsBefore) === JSON.stringify(factsAfter), `${kind} fixture is unchanged`, factsAfter); fixtures[kind] = rejected.failure?.code
    }
    expect(detail, freshFacts.tables.includes('auth_sessions') && freshFacts.tables.includes('service_identity'), 'new database has v2 identity tables', freshFacts.tables)
    return { fresh: freshFacts, migrated: after, rejected: fixtures, v1_before_tables: before.tables }
  })

  await run('T09', '身份事务失败与恢复', async detail => {
    const root = join(DATA_ROOT, 't09'); rmSync(root, { recursive: true, force: true })
    const storage = new ProbeStorage({ dataDir: root }); const probe = storage.testOnlyIdentityTransactionFailure({ userId: '11111111-1111-4111-8111-111111111111', duplicateUserId: '22222222-2222-4222-8222-222222222222', credentialId: '33333333-3333-4333-8333-333333333333', duplicateCredentialId: '44444444-4444-4444-8444-444444444444', loginName: 'rollback', now: now() })
    expect(detail, probe.rolledBack && probe.primaryCode === 19 && probe.users === 0 && probe.credentials === 0 && probe.spaces === 0 && !probe.initialized, 'identity multi-table transaction rolls back completely', probe)
    const normal = storage.bootstrap({ loginName: 'admin', displayName: '管理员', timezone: 'Asia/Shanghai', domains: [], learningTracks: [], goalText: '', now: now(), credential: { algorithm: 'scrypt', version: 1, n: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024, salt: Buffer.alloc(16, 5), derivedKey: Buffer.alloc(32, 6) } })
    expect(detail, normal.kind === 'created', 'normal bootstrap recovers without clearing database', normal.kind); storage.close()
    const failDir = join(root, 'migration-fail'); const failing = new ProbeStorage({ dataDir: failDir, migrationOverride: { version: 1, sql: `${MIGRATION_V1_SQL}\nTHIS IS NOT SQL;`, checksum: MIGRATION_V1_CHECKSUM } }); const failFacts = readDatabaseFacts(dbPath(failDir)); expect(detail, !failing.available && failFacts.tables.length === 0 && failFacts.userVersion === 0, 'v1 migration failure leaves blank database', failFacts)
    return { identity_probe: probe, recovery: normal.kind, migration_failure: failFacts }
  })

  await run('T10', '登录注册限流与有界 KDF 负载', async detail => {
    const dataDir = join(DATA_ROOT, 't10'); rmSync(dataDir, { recursive: true, force: true }); await bootstrap(dataDir, 't10'); await registerLogin('alice', '甲', 'Alice password 2026!')
    const failuresHttp = []; for (let i = 0; i < 6; i++) failuresHttp.push(await api('', 'POST', '/knowledge/v1/auth/login', jsonHeaders(), body({ login_name: 'alice', password: `wrong-${i} password 2026!` })))
    expect(detail, failuresHttp.slice(0, 5).every(item => item.status === 401) && failuresHttp[5].status === 429 && failuresHttp[5].headers.get('retry-after') === '60', 'real HTTP login limit returns 429 and Retry-After', failuresHttp.map(item => ({ status: item.status, retry_after: item.headers.get('retry-after') })))
    const limiter = new AuthRateLimiter(); for (let i = 0; i < 5; i++) limiter.failure('alice', 'test', 0); let limited = false; try { limiter.check('alice', 'test', 1) } catch (error) { limited = error.code === 'AUTH_RATE_LIMITED' } limiter.check('alice', 'test', 15 * 60 * 1000 + 1); expect(detail, limited, 'controlled limiter window blocks at five failures');
    const scheduler = new KdfScheduler(); let peakRunning = 0; let peakQueued = 0; const timer = setInterval(() => { peakRunning = Math.max(peakRunning, scheduler.running); peakQueued = Math.max(peakQueued, scheduler.queued) }, 2)
    const controllers = Array.from({ length: 12 }, () => new AbortController()); const tasks = controllers.map((controller, index) => scheduler.derive(`queue password ${index} 2026!`, randomBytes(16), controller.signal).then(() => 'ok', error => error?.code ?? error?.name ?? 'error')); controllers[11].abort(); const outcomes = await Promise.all(tasks); clearInterval(timer); await scheduler.close()
    expect(detail, peakRunning <= 2 && peakQueued <= 8, 'KDF concurrency and queue remain bounded', { peakRunning, peakQueued, outcomes: outcomes.filter(item => item !== 'ok') })
    expect(detail, outcomes.includes('AUTH_RATE_LIMITED') || outcomes.includes('AbortError'), 'over-capacity or cancelled KDF work is rejected', outcomes)
    return { http_limit: failuresHttp.map(item => item.status), kdf: { peakRunning, peakQueued, rejected: outcomes.filter(item => item !== 'ok').length }, controlled_recovery: true }
  })

  await run('T11', '真实账号界面与身份切换', async detail => {
    const dataDir = join(DATA_ROOT, 't11'); rmSync(dataDir, { recursive: true, force: true }); const host = await bootstrap(dataDir, 't11');
    const { chromium } = await import(pathToFileURL(join(REPO, '.cache', 'panel-builder', 'node_modules', 'playwright', 'index.mjs')).href)
    const browser = await chromium.launch({ channel: 'chrome', headless: true }); const ownerContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' });
    const ownerCookies = host.ownerCookie.split(';').filter(Boolean).map(item => { const [name, ...rest] = item.trim().split('='); return { name, value: rest.join('='), domain: '127.0.0.1', path: '/' } }); await ownerContext.addCookies(ownerCookies)
    const setupPage = await ownerContext.newPage(); await setupPage.goto(`http://127.0.0.1:${PORT}/knowledgeos/setup`, { waitUntil: 'domcontentloaded' }); expect(detail, await setupPage.locator('h1').innerText() === '首次管理员初始化', 'browser sees owner setup page'); await setupPage.screenshot({ path: join(OUT, 'T11-setup-1366.png'), fullPage: true }); await setupPage.close()
    const page = await ownerContext.newPage(); await page.goto(`http://127.0.0.1:${PORT}/knowledgeos/account`, { waitUntil: 'domcontentloaded' }); await page.fill('#register_name', 'alice'); await page.fill('#register_display', '甲'); await page.fill('#register_password', 'Alice password 2026!'); await page.click('#register'); await page.waitForTimeout(600); const registrationMessage = await page.locator('#message').innerText(); expect(detail, registrationMessage.includes('注册成功'), 'browser registration succeeds', registrationMessage); await page.fill('#login_name', 'alice'); await page.fill('#login_password', 'Alice password 2026!'); await page.click('#login'); await page.waitForFunction(() => document.querySelector('#state')?.textContent?.startsWith('已登录'), undefined, { timeout: 10_000 }); await page.fill('#domains', 'software_engineering,system_architecture'); await page.fill('#tracks', 'engineering_practice,architecture_exam'); await page.fill('#goal', '浏览器目标'); await page.fill('#timezone', 'Asia/Shanghai'); await page.click('#save'); await page.waitForTimeout(350); expect(detail, (await page.locator('#message').innerText()).includes('个人偏好已保存'), 'browser preference save succeeds'); await page.screenshot({ path: join(OUT, 'T11-account-1366.png'), fullPage: true }); await page.setViewportSize({ width: 1920, height: 1080 }); await page.screenshot({ path: join(OUT, 'T11-account-1920.png'), fullPage: true })
    const bob = await registerLogin('bob', '乙', 'Bob password 2026!'); const bobContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' }); const bobPage = await bobContext.newPage(); await bobPage.goto(`http://127.0.0.1:${PORT}/knowledgeos/account`, { waitUntil: 'domcontentloaded' }); await bobPage.fill('#login_name', 'bob'); await bobPage.fill('#login_password', 'Bob password 2026!'); await bobPage.click('#login'); await bobPage.waitForFunction(() => document.querySelector('#state')?.textContent?.startsWith('已登录'), undefined, { timeout: 10_000 }); expect(detail, (await bobPage.locator('#who').innerText()).includes('bob'), 'second browser context is a separate identity'); await page.click('#logout'); await page.waitForTimeout(250); expect(detail, (await page.locator('#state').innerText()).includes('已退出'), 'browser logout clears personal view'); await bobPage.screenshot({ path: join(OUT, 'T11-bob-1366.png'), fullPage: true }); await bobContext.close(); await ownerContext.close(); await browser.close()
    return { screenshots: ['T11-setup-1366.png', 'T11-account-1366.png', 'T11-account-1920.png', 'T11-bob-1366.png'], browser_contexts: 2, controlled_delayed_response: 'not simulated; UI state verified after logout' }
  })

  await run('T12', '构建、真实加载、释放及既有回归', async detail => {
    await shutdown()
    const checks = []
    const check = (name, command, args, cwd = REPO) => { const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 600_000, windowsHide: true }); checks.push({ name, status: result.status, stdout: result.stdout?.slice(-1200), stderr: result.stderr?.slice(-1200) }); expect(detail, result.status === 0, `${name} exits 0`, result.status); return result }
    check('verify-plan', process.execPath, ['scripts/verify-plan.mjs']); check('scope-check', process.execPath, ['scripts/fnd003/scope-check.mjs']); check('typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], join(REPO, 'packages', 'knowledgeos-panel')); check('build', process.execPath, ['build.mjs'], join(REPO, 'packages', 'knowledgeos-panel'))
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); const loadedPackage = JSON.parse(readFileSync(join(PROFILE_DIR, 'package.json'), 'utf8')); const packageDir = resolve(PROFILE_DIR, loadedPackage.dependencies['knowledgeos-panel'].replace(/^link:/, '')); const mismatches = []
    for (const [file, expected] of Object.entries(manifest.files)) { const actual = createHash('sha256').update(readFileSync(join(REPO, file))).digest('hex'); if (actual !== expected.sha256) mismatches.push({ file, expected: expected.sha256, actual }) }
    expect(detail, mismatches.length === 0, 'frozen candidate manifest matches source and loaded artifacts', mismatches)
    const negative = join(OUT, 'tampered-candidate'); mkdirSync(join(negative, 'lib'), { recursive: true }); writeFileSync(join(negative, 'lib', 'index.js'), `${readFileSync(join(REPO, 'packages/knowledgeos-panel/lib/index.js'), 'utf8')}\n`, 'utf8'); const negativeHash = createHash('sha256').update(readFileSync(join(negative, 'lib/index.js'))).digest('hex'); expect(detail, negativeHash !== manifest.files['packages/knowledgeos-panel/lib/index.js'].sha256, 'tampered artifact differs from frozen candidate')
    const dataDir = join(DATA_ROOT, 't12'); rmSync(dataDir, { recursive: true, force: true }); const host = await boot(dataDir, 't12'); const ownerStatus = await api(host.ownerCookie, 'GET', '/knowledgeos/status'); const key = crypto.randomUUID(); const record = await api(host.ownerCookie, 'POST', '/knowledgeos/foundation/records', { 'content-type': 'application/json', 'idempotency-key': key }, body({ content: 'FND003 regression' })); const reread = await api(host.ownerCookie, 'GET', `/knowledgeos/foundation/records/${record.json?.data?.id}`); expect(detail, ownerStatus.status === 200 && record.status === 201 && reread.status === 200, 'existing status and records routes remain functional', { status: ownerStatus.status, record: record.status, reread: reread.status }); await shutdown()
    const unconfigured = await boot(undefined, 't12-unconfigured'); const unavailable = await api(unconfigured.ownerCookie, 'POST', '/knowledgeos/foundation/records', { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body({ content: 'no storage' })); const oldStatus = await api(unconfigured.ownerCookie, 'GET', '/knowledgeos/status'); expect(detail, unavailable.status === 503 && unavailable.json?.code === 'STORAGE_UNAVAILABLE' && oldStatus.status === 200, 'unconfigured profile preserves status and returns explicit unavailable', { unavailable: unavailable.json, status: oldStatus.status });
    return { checks, loaded_package: relative(REPO, packageDir).replaceAll('\\', '/'), manifest: manifest.candidate, negative_artifact: negativeHash, lifecycle: 'closed after each Host run' }
  })
} finally {
  await shutdown(); writeFileSync(PATCH_PATH, originalPatch, 'utf8')
  const summary = { run_id: RUN_ID, candidate: option('candidate') ?? null, upstream_commit: UPSTREAM_COMMIT, port: PORT, profile: DEFAULT_PROFILE, started_at: suiteStarted, finished_at: new Date().toISOString(), result: failures.length === 0 && results.length > 0 && results.every(item => item.status === 'PASS') && (ONLY === undefined || results.length === ONLY.size) ? 'PASS' : 'FAIL', results, failures, out: relative(REPO, OUT).replaceAll('\\', '/') }
  writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8'); console.log(`\nRESULT ${summary.result}`); console.log(JSON.stringify(summary, null, 2)); process.exit(summary.result === 'PASS' ? 0 : 1)
}
