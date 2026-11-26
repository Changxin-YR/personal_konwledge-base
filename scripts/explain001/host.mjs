import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { FIRST, LAST, LINES, LOCATION, PATH, QUESTION } from './fixture.mjs'
import { API, askOnce, clickAllFacts, isolatedContext, negativeCases, refusePage, restoreLink, selectFile, signIn } from './host-browser.mjs'
import { seedOwner, verifyDatabase } from './host-storage.mjs'

// Run from the candidate checkout itself. No provider credentials are handled by this runner.
const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)))
const [candidate, entry, role, mode] = process.argv.slice(2)
assert(process.argv.length === 6 && /^[a-f0-9]{40}$/.test(candidate) && /^[a-f0-9]{64}$/.test(entry) &&
  ['main', 'independent'].includes(role) && ['dry', 'live'].includes(mode),
  'usage: node scripts/explain001/host.mjs <candidate SHA> <entry SHA-256> <main|independent> <dry|live>')
const helperPrefix = 'scripts/explain001/tokease', controllerPath = helperPrefix + '/controller.mjs'
const fromRoot = file => import(pathToFileURL(join(root, file)).href)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...cmd) => execFileSync('git', ['--no-optional-locks', '--no-replace-objects', ...cmd], { cwd: root, stdio: ['ignore','pipe','pipe'], maxBuffer: 32 * 1024 * 1024 })
const out = mkdtempSync(join(realpathSync(tmpdir()), 'explain001-' + role + '-' + mode + '-'))
const write = (file, obj) => writeFileSync(join(out, file), JSON.stringify(obj, null, 2) + '\n')
const run = { unit_id: 'EXPLAIN-001', candidate_sha: candidate, entry_sha256: entry, role, mode, checkout: root,
  started_at: new Date().toISOString(), status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', unit_acceptance: 'NOT_RUN',
  source: LOCATION, question: QUESTION, checks: [], boots: [], screens: [], traffic: { page_explain_posts: 0, external: 0 } }
const pass = (id, observed = {}) => run.checks.push({ id, status: 'PASS', ...observed })
const mark = value => { run.phase = value; write('summary.json', run) }
function verifyFrozenFiles() {
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate, 'checkout differs from requested candidate')
  if (role === 'independent') assert.equal(git('branch', '--show-current').toString().trim(), '', 'independent checkout must be detached')
  const scoped = ['scripts/explain001','scripts/fnd003','scripts/fnd004','scripts/fnd005','scripts/lib002','scripts/integrated-case-proof.mjs','packages/knowledgeos-panel','config/upstream.lock.json']
  assert.equal(git('status', '--porcelain', '--untracked-files=all', '--', ...scoped).toString().trim(), '', 'dirty candidate inputs')
  const hashes = {}
  for (const row of git('ls-files', '-z', '--', 'scripts/explain001', 'scripts/integrated-case-proof.mjs', 'scripts/fnd004/harness.mjs', 'scripts/fnd003/harness.mjs').toString().split('\0').filter(Boolean)) {
    hashes[row] = sha(readFileSync(join(root, row)))
    assert.equal(hashes[row], sha(git('show', candidate + ':' + row)), 'frozen file ' + row)
  }
  assert(hashes[controllerPath], 'candidate is missing the EXPLAIN-001 dry/live controller')
  return hashes
}
async function acquireRunSlot() {
  const lock = createServer(socket => socket.destroy())
  const name = process.platform === 'win32' ? '\\\\.\\pipe\\knowledgeos-explain001-run' : join(tmpdir(), 'knowledgeos-explain001-run.sock')
  await new Promise((ok, no) => lock.once('error', no).listen(name, ok))
  return () => new Promise((ok, no) => lock.close(error => error ? no(error) : ok()))
}
function within(parent, child) {
  const rel = relative(realpathSync(parent), realpathSync(child))
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}
let controller, host, browser, releaseSlot
function chromeEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    /^(systemroot|windir|comspec|path|pathext|programfiles.*|processor_.*|number_of_processors|systemdrive|localappdata|appdata|userprofile|home|temp|tmp|lang|display|xdg_runtime_dir)$/i.test(name)))
  for (const key of ['HOME','USERPROFILE','LOCALAPPDATA','APPDATA','TEMP','TMP']) {
    env[key] = join(out, 'chrome-env', key)
    mkdirSync(env[key], { recursive: true })
  }
  return env
}
async function closeBrowser() {
  if (!browser) return
  for (const ctx of browser.contexts()) await ctx.unrouteAll({ behavior: 'ignoreErrors' })
  await browser.close(); browser = undefined
}
const launchChrome = chromium => chromium.launch({ channel: 'chrome', headless: true, env: chromeEnv(),
  args: ['--disable-background-networking','--disable-component-update','--disable-sync','--no-proxy-server'] })
function dispatchCount(proof, n) {
  assert.equal(proof.real_inference_requests, mode === 'live' ? n : 0, 'actual real inference count')
  assert.equal(proof.wire_calibrations, mode === 'dry' ? n : 0, 'actual dry dispatch count')
  assert.equal(proof.requests.length, n, 'total dispatches')
  assert.equal(proof.outbound_tls_connect_attempts, mode === 'live' ? n : 0, 'actual outbound TLS attempts')
  assert.equal(proof.native_denials, 0, 'attempted an unexpected model dispatch')
  assert(proof.network_denials.every(row => row.destination === 'windows_local_pipe'), 'unexpected network denial')
  assert.deepEqual(proof.transport_errors, [])
}
function projectProof(proof) {
  // Retain only route, counters, usage and request digests. Controller and Host logs stay private.
  const only = (obj, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(obj, k)).map(k => [k, obj[k]]))
  return { ...only(proof, ['mode','candidate_sha','tree','upstream','runtime_sha256','entry_sha256','provider','model','manifest_sha256','real_inference_requests','wire_calibrations','outbound_tls_connect_attempts','native_denials','permit_consumed','expectations_armed']),
    requests: proof.requests.map(row => only(row, ['stage','request_sha256','model','tools','output_token_cap','system_sha256','user_sha256'])),
    response_usage: proof.response_usage.map(row => only(row, ['http_status','finish','content_chars','model','prompt_tokens','completion_tokens','input_tokens','output_tokens','total_tokens'])) }
}
function verifyProvider(proof, answer) {
  dispatchCount(proof, 1)
  assert.equal(proof.mode, mode); assert.equal(proof.candidate_sha, candidate); assert.equal(proof.entry_sha256, entry)
  assert.equal(proof.provider, answer.provider); assert.equal(proof.model, answer.model)
  assert.equal(proof.expectations_armed, 1); assert.equal(proof.permit_consumed, true)
  assert.equal(proof.requests[0].tools, 0); assert.match(proof.requests[0].request_sha256, /^[a-f0-9]{64}$/)
  if (mode === 'live') {
    assert.equal(proof.response_usage.length, 1); const usage = proof.response_usage[0]
    assert.equal(usage.http_status, 200); assert.equal(usage.finish, 'stop'); assert(usage.content_chars > 0)
  }
}

console.log('EXPLAIN-001 evidence ' + out)
try {
  mark('frozen inputs and controller')
  run.helpers = verifyFrozenFiles()
  const { candidateFacts } = await fromRoot('scripts/integrated-case-proof.mjs')
  const frozen = candidateFacts(root, candidate)
  assert.equal(frozen.entry_sha256, entry); Object.assign(run, frozen)
  if (process.env.KO_EXPLAIN001_PHASE !== undefined) assert.equal(process.env.KO_EXPLAIN001_PHASE, mode, 'mode mismatch')
  process.env.KO_EXPLAIN001_PHASE = mode
  const { api, entryCookie } = await fromRoot('scripts/fnd004/harness.mjs')
  const { ProbeStorage, SCHEMA_VERSION } = await fromRoot('packages/knowledgeos-panel/lib/storage.js')
  controller = await fromRoot(controllerPath)
  releaseSlot = await acquireRunSlot()
  host = await controller.createFixture({ root, candidate, entry, out, helperPrefix, mode })
  const base = new URL(host.base)
  assert.equal(base.protocol, 'http:'); assert.equal(base.hostname, '127.0.0.1'); assert.equal(base.origin, host.base)
  assert.equal(Number(base.port), host.port)
  assert(within(tmpdir(), host.data) && !within(root, host.data), 'dedicated temporary Host data directory')
  const dbFile = host.dbPath ?? join(host.data, 'knowledgeos.sqlite')
  assert.equal(resolve(dirname(dbFile)), resolve(host.data)); assert(!existsSync(dbFile), 'fresh Host database expected')
  mark('first Host boot and two real business sessions')
  const first = await boot(), cookie = await entryCookie(first.entry)
  const password = randomUUID()
  const register = async (action, name, display, cookieValue = '') => {
    const res = await api(host.port, cookieValue, 'POST', API + '/auth/' + action, { login_name: name, display_name: display, password })
    assert.equal(res.status, 201, 'fresh synthetic ' + action)
  }
  await register('bootstrap', 'bootstrapper', 'Fixture administrator', cookie.cookie)
  await register('register', 'merchant', 'Fixture owner'); await register('register', 'observer', 'Fixture observer')
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  browser = await launchChrome(chromium); run.chrome = browser.version()
  const login = name => signIn(browser, host.base, run.traffic, name, password)
  const owner = await login('merchant'), outsider = await login('observer')
  assert.notEqual(owner.id, outsider.id)
  const anonymous = await isolatedContext(browser, host.base, run.traffic)
  const snapshot = await seedOwner(ProbeStorage, host, owner)
  const storage = () => verifyDatabase(dbFile, SCHEMA_VERSION, owner.id, snapshot)
  pass('repository-store-seed', storage())
  mark('unauthorized identities, mismatched versions, unsaved file and line ranges')
  await negativeCases({ base: host.base, snapshot, owner, outsider, anonymous, pass })
  dispatchCount(await host.proof(), 0); pass('denials-before-arm', { dispatches: 0, ...storage() })
  mark('UI file selection, one combined question, checked facts and business answer')
  await selectFile(owner, host.base, snapshot); await capture(owner.page, 'selected-source')
  await host.arm({ stage: controller.stage, user: packet })
  const answer = await askOnce(owner, host.base, snapshot, actual => write('actual-answer.json', actual))
  await capture(owner.page, 'answer-groups')
  if (mode === 'live') await host.waitResponse()
  const firstProof = await host.proof(); verifyProvider(firstProof, answer)
  run.model = projectProof(firstProof)
  assert.equal(run.traffic.page_explain_posts, 1)
  pass('T02-business-and-unknown-callers', { evidence: 'actual-answer.json', fact_ranges: answer.facts.map(({ start_line, end_line }) => [start_line, end_line]) })
  mark('all clickable facts, same-page refresh and second user fixed link')
  const links = await clickAllFacts(owner, host.base, snapshot, answer.facts, capture)
  run.citations = links.map(({ loc, href }) => ({ ...loc, link: new URL(href).pathname + new URL(href).search }))
  const link = links.find(item => item.loc.start_line <= 4 && item.loc.end_line >= 4)
  assert(link, 'a persisted business-implementation reference is required')
  await restoreLink(owner, host.base, snapshot, link, true)
  await refusePage(outsider, host.base, snapshot, link.href); await capture(outsider.page, 'other-user-refused')
  dispatchCount(await host.proof(), 1); pass('all-clicks-refresh-and-denial', { facts_clicked: links.length, extra_model_requests: 0 })
  mark('sequential restart and original fixed link in a fresh Chrome session')
  await closeBrowser(); await host.stop()
  const second = await boot(); assert.notEqual(second.pid, first.pid)
  browser = await launchChrome(chromium)
  const returned = await login('merchant'); assert.equal(returned.id, owner.id)
  await restoreLink(returned, host.base, snapshot, link); await capture(returned.page, 'restart-readback')
  const freshObserver = await login('observer'); await refusePage(freshObserver, host.base, snapshot, link.href)
  pass('T01-restart-immutable-readback', storage())
  const finalProof = await host.proof(); verifyProvider(finalProof, answer)
  run.model = projectProof(finalProof)
  assert.equal(run.traffic.page_explain_posts, 1); assert.equal(run.traffic.external, 0)
  pass('readback-without-inference', { extra_model_requests: 0, page_explain_posts: 1 })
  run.status = 'PASS'; run.T01 = run.T02 = mode === 'live' ? 'PASS' : 'NOT_RUN'
} catch (error) {
  run.status = run.phase === 'frozen inputs and controller' || error.code === 'EADDRINUSE' ? 'BLOCKED' : 'FAIL'
  run.failure = { phase: run.phase, category: error.name, message: String(error.message).split('\n')[0].replace(/https?:\/\/\S+/g, '[address]').slice(0, 260) }
  run.checks.push({ id: run.phase, status: run.status })
  if (host) { try { run.model = projectProof(await host.proof()) } catch { /* controller did not supply complete evidence */ } }
  process.exitCode = 1
} finally {
  const cleanup = []
  for (const [name, close] of [['chrome', closeBrowser], ['host', () => host?.close()], ['run-slot', () => releaseSlot?.()]]) {
    try { await close(); cleanup.push({ name, status: 'PASS' }) }
    catch { cleanup.push({ name, status: 'FAIL' }); run.status = 'FAIL'; process.exitCode = 1 }
  }
  run.cleanup = cleanup; run.completed_at = new Date().toISOString()
  write('summary.json', run)
  console.log(JSON.stringify({ status: run.status, role, mode, phase: run.phase, failure: run.failure, evidence: join(out, 'summary.json') }))
}
