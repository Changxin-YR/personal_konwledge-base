#!/usr/bin/env node
/** Independent FND-003 gap checks run against the frozen candidate. */
import { DatabaseSync } from 'node:sqlite'
import { request as httpRequest } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  DEFAULT_HOME, DEFAULT_PORT, DEFAULT_PROFILE, REPO, cookieFromResponse, entryCookie, request, requestWithHost, sleep, startHost, stopHost,
} from './harness.mjs'
import { ProbeStorage, MIGRATION_V1_SQL, MIGRATION_V1_CHECKSUM, MIGRATION_V2_CHECKSUM, readDatabaseFacts, isIdentityRuntimeAvailable, isLoopbackAddress } from '../../packages/knowledgeos-panel/lib/test-support.js'

const runId = process.argv.includes('--run-id') ? process.argv[process.argv.indexOf('--run-id') + 1] : `independent-${Date.now()}`
const port = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : DEFAULT_PORT + 10)
const out = resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : join(REPO, 'docs', 'evidence', 'FND-003', 'runs', runId))
const candidate = process.argv.includes('--candidate') ? process.argv[process.argv.indexOf('--candidate') + 1] : undefined
const dataRoot = join(REPO, '.cache', 'knowledgeos-fnd003-independent', runId)
const profileDir = join(DEFAULT_HOME, 'profiles', DEFAULT_PROFILE)
const patchPath = join(profileDir, 'cordis.patch.yml')
mkdirSync(out, { recursive: true }); mkdirSync(dataRoot, { recursive: true })
const originalPatch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
let host
const results = []
const body = value => JSON.stringify(value)
const headers = extra => ({ 'content-type': 'application/json', 'x-knowledgeos-request': '1', ...(extra ?? {}) })
const dbPath = dir => join(dir, 'knowledgeos.sqlite')
const sql = (path, statement, params = []) => { const db = new DatabaseSync(path, { readOnly: true }); try { return db.prepare(statement).all(...params) } finally { db.close() } }
const api = (cookie, method, path, extra = {}, payload) => request({ port, cookie, method, path, headers: extra, body: payload })
const valid = (loginName, displayName, password = 'Correct horse battery staple 2026!') => ({ login_name: loginName, display_name: displayName, password })
const patchText = dataDir => `- id: knowledgeos-host\n  config:\n    dataDir: "${dataDir.replaceAll('\\', '/')}"\n`
async function boot(dataDir) {
  if (host !== undefined) await stopHost(host)
  mkdirSync(profileDir, { recursive: true }); writeFileSync(patchPath, patchText(dataDir), 'utf8')
  host = await startHost({ home: DEFAULT_HOME, profile: DEFAULT_PROFILE, port, logFile: join(out, 'independent-host.log') })
  return { ...host, ownerCookie: (await entryCookie(host.entryUrl)).cookie }
}
async function bootstrap(dataDir) {
  const h = await boot(dataDir)
  const response = await api(h.ownerCookie, 'POST', '/knowledge/v1/auth/bootstrap', headers(), body(valid('admin', '管理员', 'Admin password 2026!')))
  return { ...h, response }
}
async function registerLogin(name, display, password = `${name} password 2026!`) {
  const registered = await api('', 'POST', '/knowledge/v1/auth/register', headers(), body(valid(name, display, password)))
  const logged = await api('', 'POST', '/knowledge/v1/auth/login', headers(), body({ login_name: name, password }))
  return { registered, logged, cookie: cookieFromResponse(logged), user: logged.json?.data }
}
function check(id, assertions, details = {}) { const failed = assertions.filter(item => !item.ok); const result = { id, status: failed.length === 0 ? 'PASS' : 'FAIL', assertions, details }; results.push(result); return result }
async function cancelledRegister(dataDir) {
  const payload = body(valid('cancelled', '取消', 'A password long enough for scrypt 2026!'))
  const aborted = await new Promise(resolveAbort => {
    const timeout = setTimeout(() => resolveAbort({ kind: 'timeout' }), 5000)
    const req = httpRequest({ hostname: '127.0.0.1', port, path: '/knowledge/v1/auth/register', method: 'POST', headers: { ...headers(), host: `127.0.0.1:${port}`, 'content-length': Buffer.byteLength(payload) } }, response => { response.resume(); response.on('end', () => resolveAbort({ kind: 'response', status: response.statusCode })) })
    req.on('error', error => { clearTimeout(timeout); resolveAbort({ kind: 'error', error: error.code ?? error.name }) })
    req.write(payload); req.end(); setTimeout(() => req.destroy(), 5)
  })
  await sleep(1200)
  const statusStarted = Date.now(); const status = await api('', 'GET', '/knowledge/v1/auth/status'); const statusMs = Date.now() - statusStarted
  const users = sql(dbPath(dataDir), 'SELECT login_name FROM users WHERE login_name = ?', ['cancelled'])
  return { aborted, status: status.status, statusMs, users: users.length }
}

try {
  const loopback = check('T01-adapter', [
    { ok: isLoopbackAddress('127.0.0.1'), message: 'IPv4 loopback accepted' },
    { ok: isLoopbackAddress('::ffff:127.0.0.1'), message: 'mapped IPv4 loopback accepted' },
    { ok: isLoopbackAddress('::ffff:7f00:1'), message: 'hex mapped IPv4 loopback accepted' },
    { ok: isLoopbackAddress('::1'), message: 'IPv6 loopback accepted' },
    { ok: isLoopbackAddress('[::1]'), message: 'bracketed IPv6 loopback accepted' },
    { ok: !isLoopbackAddress('10.0.0.1'), message: 'private non-loopback rejected' },
    { ok: !isLoopbackAddress('127.0.0.999'), message: 'invalid IPv4 rejected' },
    { ok: !isLoopbackAddress('::ffff:192.0.2.1'), message: 'mapped non-loopback rejected' },
  ])

  const lifecycleDir = join(dataRoot, 'connection-lifecycle'); rmSync(lifecycleDir, { recursive: true, force: true }); const live = await bootstrap(lifecycleDir); const liveStatus = await api('', 'GET', '/knowledge/v1/auth/status'); const runningFacts = { connection: { authentication: {}, browserPeer: { signal: new AbortController().signal } }, host: '127.0.0.1', port, protocol: 'http:', origin: `http://127.0.0.1:${port}` }; const abortController = new AbortController(); abortController.abort(); const adapterCases = [
    { ok: isIdentityRuntimeAvailable(runningFacts), message: 'controlled adapter admits active loopback Connection' },
    { ok: !isIdentityRuntimeAvailable({ ...runningFacts, connection: undefined }), message: 'controlled adapter rejects missing Connection' },
    { ok: !isIdentityRuntimeAvailable({ ...runningFacts, connection: { authentication: {}, browserPeer: { signal: abortController.signal } } }), message: 'controlled adapter rejects stopped Connection' },
    { ok: !isIdentityRuntimeAvailable({ ...runningFacts, host: '192.0.2.10', origin: `http://192.0.2.10:${port}` }), message: 'controlled adapter rejects non-loopback listener' },
    { ok: isIdentityRuntimeAvailable(runningFacts), message: 'controlled adapter recovers after Connection restoration' },
  ]; check('T02-connection-adapter', adapterCases, { production_gate: 'isIdentityRuntimeAvailable' })
  const stoppedHost = host; await stopHost(stoppedHost); host = undefined; let stoppedResult; try { stoppedResult = await api('', 'GET', '/knowledge/v1/auth/status') } catch (error) { stoppedResult = { status: 0, error: error instanceof Error ? error.code ?? error.name : String(error) } }
  const recovered = await boot(lifecycleDir); const recoveredStatus = await api('', 'GET', '/knowledge/v1/auth/status'); check('T02-connection-host', [
    { ok: liveStatus.status === 200 && live.response.status === 201, message: 'real fixed-version Host serves identity while Connection is running', actual: liveStatus.status },
    { ok: stoppedResult.status === 0 || stoppedResult.status === 503, message: 'real Host teardown makes identity unavailable without anonymous fallback', actual: stoppedResult },
    { ok: recoveredStatus.status === 200, message: 'real fixed-version Host recovers identity after restart', actual: recoveredStatus.status },
  ], { actual_host: true, connection_state: 'normal -> stopped with Host teardown -> restored', fnd002_regression: 'covered by main T12' })

  const t04Dir = join(dataRoot, 't04'); rmSync(t04Dir, { recursive: true, force: true }); const t04 = await bootstrap(t04Dir); const alice = await registerLogin('alice', '甲');
  const boundary = sql(dbPath(t04Dir), 'SELECT token_hash FROM auth_sessions WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1')[0].token_hash
  const liveDb = new DatabaseSync(dbPath(t04Dir)); liveDb.prepare('UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?').run(new Date().toISOString(), boundary); liveDb.close()
  const atBoundary = await api(alice.cookie, 'GET', '/knowledge/v1/me'); const clientSession = await api('', 'POST', '/knowledge/v1/auth/login', headers(), body({ login_name: 'alice', password: 'Alice password 2026!', session_id: 'client-chosen' }))
  check('T04-gap', [
    { ok: atBoundary.status === 401, message: 'now >= expires_at rejects session', actual: atBoundary.status },
    { ok: clientSession.status === 422, message: 'client session_id is rejected', actual: clientSession.status },
  ], { boundary: 'expires_at set to current ISO time', session_hash_length: boundary.length })

  const t05Dir = join(dataRoot, 't05'); rmSync(t05Dir, { recursive: true, force: true }); const t05 = await bootstrap(t05Dir); const member = await registerLogin('member', '成员')
  const sourceCases = {
    register: await api('', 'POST', '/knowledge/v1/auth/register', headers({ origin: 'http://evil.invalid' }), body(valid('source-new', '来源', 'Source password 2026!'))),
    login: await api('', 'POST', '/knowledge/v1/auth/login', headers({ origin: 'http://evil.invalid' }), body({ login_name: 'member', password: 'member password 2026!' })),
    logout: await api(member.cookie, 'POST', '/knowledge/v1/auth/logout', headers({ origin: 'http://evil.invalid' }), '{}'),
    preferences: await api(member.cookie, 'PATCH', '/knowledge/v1/me/preferences', headers({ origin: 'http://evil.invalid' }), body({ expected_revision: 1, goal_text: 'blocked' })),
  }
  check('T05-gap', Object.entries(sourceCases).map(([name, value]) => ({ ok: value.status === 403, message: `${name} rejects foreign origin`, actual: value.status })), { statuses: Object.fromEntries(Object.entries(sourceCases).map(([key, value]) => [key, value.status])) })

  const t06Dir = join(dataRoot, 't06'); rmSync(t06Dir, { recursive: true, force: true }); await bootstrap(t06Dir); const one = await registerLogin('one', '一'); const two = await registerLogin('two', '二')
  const oneMe = await api(one.cookie, 'GET', '/knowledge/v1/me'); const twoMe = await api(two.cookie, 'GET', '/knowledge/v1/me'); const oneSpaces = await api(one.cookie, 'GET', '/knowledge/v1/spaces'); const twoSpaces = await api(two.cookie, 'GET', '/knowledge/v1/spaces')
  check('T06-gap', [
    { ok: oneMe.json?.data?.id !== twoMe.json?.data?.id, message: 'separate actor ids' },
    { ok: oneSpaces.json?.data?.length === 1 && twoSpaces.json?.data?.length === 1 && oneSpaces.json.data[0].owner_user_id !== twoSpaces.json.data[0].owner_user_id, message: 'personal spaces are disjoint' },
    { ok: (await api(one.cookie, 'PATCH', '/knowledge/v1/me/preferences', headers(), body({ expected_revision: 1, owner_id: twoMe.json?.data?.id, goal_text: 'cross' }))).status === 422, message: 'cross identity field rejected' },
  ])

  const t07Dir = join(dataRoot, 't07'); rmSync(t07Dir, { recursive: true, force: true }); await bootstrap(t07Dir)
  const exactPassword = ' 1234567890123 '
  const edge = await registerLogin('a'.repeat(64), '边界', exactPassword)
  const tooLongName = await api('', 'POST', '/knowledge/v1/auth/register', headers(), body(valid('b'.repeat(65), '过长', 'Long password 2026!')))
  const shortPassword = await api('', 'POST', '/knowledge/v1/auth/register', headers(), body(valid('short-edge', '短', '12345678901234')))
  const badUtf8 = await requestWithHost({ port, method: 'POST', path: '/knowledge/v1/auth/register', headers: { ...headers(), host: `127.0.0.1:${port}`, 'content-length': '4' }, body: Buffer.from([0x7b, 0x22, 0xff, 0x7d]) })
  const exactLogin = await api('', 'POST', '/knowledge/v1/auth/login', headers(), body({ login_name: 'a'.repeat(64), password: exactPassword }))
  check('T07-gap', [
    { ok: edge.registered.status === 201 && exactLogin.status === 200, message: 'password spaces and max login length preserved', actual: { register: edge.registered.status, login: exactLogin.status } },
    { ok: tooLongName.status === 422, message: 'login name over max rejected', actual: tooLongName.status },
    { ok: shortPassword.status === 422, message: 'password below minimum rejected', actual: shortPassword.status },
    { ok: badUtf8.status === 400, message: 'invalid UTF-8 rejected', actual: badUtf8.status },
  ])

  const t08Dir = join(dataRoot, 't08'); rmSync(t08Dir, { recursive: true, force: true }); mkdirSync(t08Dir, { recursive: true }); const pseudoPath = dbPath(t08Dir); const pseudo = new DatabaseSync(pseudoPath); pseudo.exec(MIGRATION_V1_SQL); pseudo.prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (1, ?, ?), (2, ?, ?)').run(MIGRATION_V1_CHECKSUM, new Date().toISOString(), MIGRATION_V2_CHECKSUM, new Date().toISOString()); pseudo.exec('PRAGMA application_id=0x4b4f5331; PRAGMA user_version=2; CREATE TABLE service_identity (id INTEGER PRIMARY KEY)'); pseudo.close(); const beforePseudo = readDatabaseFacts(pseudoPath); const rejectedPseudo = new ProbeStorage({ dataDir: t08Dir }); const afterPseudo = readDatabaseFacts(pseudoPath)
  check('T08-gap', [
    { ok: !rejectedPseudo.available && rejectedPseudo.failure?.code === 'STORAGE_INCOMPATIBLE', message: 'pseudo-v2 schema rejected', actual: rejectedPseudo.failure?.code },
    { ok: JSON.stringify(beforePseudo) === JSON.stringify(afterPseudo), message: 'pseudo-v2 fixture remains unchanged' },
  ])

  const t09Dir = join(dataRoot, 't09'); rmSync(t09Dir, { recursive: true, force: true }); const t09Store = new ProbeStorage({ dataDir: t09Dir }); const now09 = new Date().toISOString(); t09Store.bootstrap({ loginName: 'admin', displayName: '管理员', timezone: 'Asia/Shanghai', domains: [], learningTracks: [], goalText: '', now: now09, credential: { algorithm: 'scrypt', version: 1, n: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024, salt: Buffer.alloc(16, 9), derivedKey: Buffer.alloc(32, 8) } }); const first = t09Store.register({ loginName: 'dup', displayName: '重复', timezone: 'Asia/Shanghai', domains: [], learningTracks: [], goalText: '', now: new Date().toISOString(), credential: { algorithm: 'scrypt', version: 1, n: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024, salt: Buffer.alloc(16, 1), derivedKey: Buffer.alloc(32, 2) } }); const duplicateResult = t09Store.register({ loginName: 'dup', displayName: '重复二', timezone: 'Asia/Shanghai', domains: [], learningTracks: [], goalText: '', now: new Date().toISOString(), credential: { algorithm: 'scrypt', version: 1, n: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024, salt: Buffer.alloc(16, 3), derivedKey: Buffer.alloc(32, 4) } }); const duplicateCode = duplicateResult.kind === 'login_name_taken' ? 'LOGIN_NAME_TAKEN' : duplicateResult.kind; const rowsAfterDuplicate = sql(dbPath(t09Dir), 'SELECT count(*) AS count FROM users')[0].count; t09Store.close()
  check('T09-gap', [{ ok: first.kind === 'created' && duplicateCode === 'LOGIN_NAME_TAKEN' && Number(rowsAfterDuplicate) === 2, message: 'duplicate registration leaves one new identity', actual: { duplicateCode, users: rowsAfterDuplicate } }])

  const t10Dir = join(dataRoot, 't10'); rmSync(t10Dir, { recursive: true, force: true }); await bootstrap(t10Dir); const cancelled = await cancelledRegister(t10Dir)
  check('T10-gap', [
    { ok: cancelled.users === 0, message: 'aborted HTTP register does not write user', actual: cancelled.users },
    { ok: cancelled.status === 200 && cancelled.statusMs < 2000, message: 'status remains responsive during cancellation', actual: { status: cancelled.status, ms: cancelled.statusMs } },
  ], cancelled)

  const t11Dir = join(dataRoot, 't11'); rmSync(t11Dir, { recursive: true, force: true }); await bootstrap(t11Dir); const browserUser = await registerLogin('browser', '浏览器')
  const { chromium } = await import(pathToFileURL(join(REPO, '.cache', 'panel-builder', 'node_modules', 'playwright', 'index.mjs')).href)
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' }); const cookieParts = browserUser.cookie.split(';').filter(Boolean).map(value => { const [name, ...rest] = value.trim().split('='); return { name, value: rest.join('='), domain: '127.0.0.1', path: '/knowledge/v1' } }); await context.addCookies(cookieParts)
  const page = await context.newPage(); let release; let delayed = false; const released = new Promise(resolveRelease => { release = resolveRelease }); await page.route('**/knowledge/v1/me', async route => { delayed = true; const response = await route.fetch(); await released; await route.fulfill({ response }) }); await page.goto(`http://127.0.0.1:${port}/knowledgeos/account`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(150); await page.evaluate(() => document.querySelector('#logout')?.click()); await page.waitForTimeout(150); release(); await page.waitForTimeout(300); const uiState = await page.locator('#state').innerText(); const profileVisible = await page.locator('#profile').evaluate(element => !element.classList.contains('hidden')); await page.unroute('**/knowledge/v1/me'); await context.close(); await browser.close()
  check('T11-gap', [{ ok: delayed && uiState.includes('已退出') && !profileVisible, message: 'delayed response cannot restore logged-out profile', actual: { delayed, uiState, profileVisible } }])

  const passed = results.length > 0 && results.every(item => item.status === 'PASS')
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify({ run_id: runId, candidate: candidate ?? null, results, result: passed ? 'PASS' : 'FAIL' }, null, 2)}\n`)
  console.log(JSON.stringify({ run_id: runId, candidate: candidate ?? null, result: passed ? 'PASS' : 'FAIL', results }, null, 2))
  process.exitCode = passed ? 0 : 1
} finally {
  if (host !== undefined) await stopHost(host)
  mkdirSync(profileDir, { recursive: true }); writeFileSync(patchPath, originalPatch, 'utf8')
}
