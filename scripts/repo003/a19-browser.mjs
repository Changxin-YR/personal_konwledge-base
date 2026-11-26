import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [checkout, candidate, entry, runnerHash, fixtureHash] = process.argv.slice(2)
assert(checkout && candidate && entry && runnerHash && fixtureHash,
  'usage: node a19-browser.mjs <frozen checkout> <candidate SHA> <entry sha256> <runner sha256> <fixture sha256>')
const runner = fileURLToPath(import.meta.url)
const fixture = realpathSync(fileURLToPath(new URL('./a19-fixture.mjs', import.meta.url)))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(sha(readFileSync(runner)), runnerHash)
assert.equal(sha(readFileSync(fixture)), fixtureHash)
const root = resolve(checkout)
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8' }).trim()
assert.equal(git('rev-parse', 'HEAD'), candidate)
for (const [file, expected] of [['a19-browser.mjs', runnerHash], ['a19-fixture.mjs', fixtureHash]]) {
  assert.equal(sha(execFileSync('git', ['show', candidate + ':scripts/repo003/' + file], { cwd: root })), expected)
}
const load = path => import(pathToFileURL(join(root, path)).href)
const { api, dbPath, entryCookie } = await load('scripts/fnd004/harness.mjs')
const { candidateFacts } = await load('scripts/integrated-case-proof.mjs')
const { until } = await load('scripts/lib002/a07-isolated-host.mjs')
const { binding, pkg } = await load('scripts/fnd005/candidate-live-binding.mjs')
const { SCHEMA_VERSION } = await load('packages/knowledgeos-panel/lib/storage.js')
const { tree, source_tree, entry_sha256, build_sha256 } = candidateFacts(root, candidate)
assert.equal(entry_sha256, entry)
const out = mkdtempSync(join(tmpdir(), 'kos-a19-ai-denial-'))
const proof = {
  unit_id: 'REPO-003', acceptance_slice: 'A19_AI_REPOSITORY_WRITE_DENIED', candidate_sha: candidate, tree, source_tree,
  entry_sha256, build_sha256, runner_sha256: runnerHash, fixture_sha256: fixtureHash,
  test_scope: 'Actual product UI, HTTP, DSH tool policy and SQLite with offline model and GitHub setup fixtures',
  real_model_inference: false, real_platform_reads: 0, status: 'NOT_RUN', A19: 'NOT_RUN', screenshots: [], checks: [],
}
const scope = '/knowledge/v1'
const ai = scope + '/ai'
const repository = scope + '/repositories'
const password = randomUUID()
const readInstruction = '读取当前合成对象。'
const writeInstruction = '请直接把代码推送到仓库。'
const provider = 'knowledgeos-a19-fixture'
const model = 'deepseek-a19-controlled-fixture'
let host, browser, phase
const check = (id, details = {}) => proof.checks.push({ id, status: 'PASS', ...details })

function rows(sql, ...params) {
  const db = new DatabaseSync(dbPath(host.data), { readOnly: true })
  try { return db.prepare(sql).all(...params).map(row => ({ ...row })) }
  finally { db.close() }
}
const durable = object => ({
  snapshots: rows('SELECT * FROM repository_snapshots ORDER BY id'),
  files: rows('SELECT * FROM repository_files ORDER BY snapshot_id,path'),
  object: rows('SELECT * FROM knowledge_objects WHERE id=?', object),
  ai_mutations: rows('SELECT count(*) n FROM ai_tool_mutations')[0].n,
})

async function request(context, path, method = 'GET', data, status = 200) {
  const response = await context.request.fetch(host.base + path, {
    method, data, headers: { 'x-knowledgeos-request': '1' }, maxRedirects: 0,
  })
  const value = await response.json()
  assert.equal(response.status(), status, method + ' ' + path + ': ' + (value.code ?? 'unexpected status'))
  return value
}

async function buttonResponse(page, path, button) {
  const [response] = await Promise.all([
    page.waitForResponse(result => result.url() === host.base + path && result.request().method() === 'POST'),
    page.locator(button).click(),
  ])
  return response
}

function fixtureEvents() {
  const path = join(dirname(host.data), 'boot-1', 'a19-fixture.jsonl')
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
}

async function isolatedHost() {
  const cache = resolve(process.env.KO_TEST_CACHE ?? join(root, '.cache'))
  const pinned = binding(candidate, cache)
  const run = mkdtempSync(join(realpathSync(tmpdir()), 'kos-a19-host-'))
  const home = join(run, 'home'), data = join(run, 'data'), trace = join(run, 'boot-1')
  const profile = 'a19-offline', profileDir = join(home, 'profiles', profile)
  const product = join(profileDir, 'node_modules/knowledgeos-panel')
  for (const dir of [data, trace]) mkdirSync(dir, { recursive: true })
  const artifacts = git('ls-files', '--', pkg + '/package.json', pkg + '/cordis.patch.yml', pkg + '/lib').split(/\r?\n/)
  for (const file of artifacts) {
    const to = join(product, file.slice(pkg.length + 1))
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, readFileSync(join(root, file)), { flag: 'wx' })
  }
  const stagedEntry = realpathSync(join(product, 'lib/index.js'))
  assert.equal(sha(readFileSync(stagedEntry)), entry)
  const deps = join(product, 'node_modules/@deepseek-ai')
  mkdirSync(deps, { recursive: true })
  symlinkSync(realpathSync(join(pinned.runtime, 'apps/cli/node_modules/@deepseek-ai/schemastery')), join(deps, 'schemastery'), 'junction')
  const config = (name, value) => writeFileSync(join(profileDir, name), JSON.stringify(value), { flag: 'wx' })
  config('package.json', {
    name: profile, private: true, dependencies: { 'knowledgeos-panel': 'link:' + product.replaceAll('\\', '/') },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'knowledgeos-panel'] } },
  })
  config('cordis.yml', [])
  config('cordis.patch.yml', [
    { id: 'knowledgeos-host', config: { dataDir: data.replaceAll('\\', '/'), ai: { provider, model, maxCalls: 2, timeoutMs: 5000 } } },
    { insert: [{ id: 'a19-offline-llm', name: fixture.replaceAll('\\', '/') }] },
  ])
  const safeScript = relative => {
    const file = join(root, relative)
    const hash = sha(readFileSync(file))
    assert.equal(hash, sha(execFileSync('git', ['show', candidate + ':' + relative], { cwd: root })))
    return { url: pathToFileURL(file).href, hash }
  }
  const guard = safeScript('scripts/repo001/egress-preload.mjs')
  safeScript('scripts/repo003/gitee-oracle.mjs')
  const loadProof = safeScript('scripts/fnd005/candidate-live-trace.mjs')
  const socket = createServer()
  await new Promise((ok, no) => socket.once('error', no).listen(0, '127.0.0.1', ok))
  const port = socket.address().port
  await new Promise(ok => socket.close(ok))
  const base = 'http://127.0.0.1:' + port
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(systemroot|windir|comspec|path|pathext|programfiles.*|processor_.*|number_of_processors)$/i.test(key)))
  for (const key of ['HOME','USERPROFILE','LOCALAPPDATA','APPDATA','TEMP','TMP']) {
    env[key] = join(run, 'env-' + key)
    mkdirSync(env[key])
  }
  Object.assign(env, {
    DSH_HOME: home, DSH_CLIENT_COMMIT_HASH: pinned.facts.upstream,
    DSH_TELEMETRY_DISABLED: '1', DSH_TELEMETRY_MODE: 'DISABLED', TSX_DISABLE_CACHE: '1',
    KO_ENTRY: stagedEntry, KO_HASH: entry, KO_RUN: trace,
    KO_TEST_LOOPBACK: base, KO_REPOSITORY_TRAFFIC: 'fixture-only',
  })
  let child, done, ended = false, tail = ''
  async function start() {
    child = spawn(process.execPath, [
      '--import', 'tsx/esm', '--import', loadProof.url, '--import', guard.url,
      'apps/cli/src/bin.ts', '--profile', profile, '--host', '127.0.0.1', '--port', String(port), '--no-open',
    ], { cwd: pinned.runtime, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    done = new Promise(ok => {
      child.once('error', () => { ended = true; ok() })
      child.once('close', () => { ended = true; ok() })
    })
    for (const line of [child.stdout, child.stderr]) line.on('data', chunk => { tail = (tail + chunk).slice(-24000) })
    const loaded = join(trace, 'loaded.json')
    const entered = await until(() => {
      assert(!ended, 'isolated Host exited before readiness')
      return existsSync(loaded) && /dsh web:\s*(http:\/\/[^\s]+)\s/.exec(tail)?.[1]
    }, 'frozen A19 Host', 120000)
    assert.equal(new URL(entered).origin, base)
    assert.deepEqual(JSON.parse(readFileSync(loaded, 'utf8')), { pid: child.pid, hash: entry })
    return { entry: entered }
  }
  async function stop() {
    if (!child) return
    if (!ended) child.kill()
    let timeout
    try { await Promise.race([done, new Promise((_, no) => { timeout = setTimeout(() => no(Error('Host shutdown timeout')), 15000) })]) }
    finally { clearTimeout(timeout) }
  }
  function repositoryEvents() {
    const file = join(trace, 'repository-egress.jsonl')
    return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  }
  return { base, port, data, start, stop, repositoryEvents, playwright: pinned.playwright,
    facts: { ...pinned.facts, helpers: { 'candidate-load-proof': loadProof.hash, 'repository-egress': guard.hash } } }
}

try {
  phase = 'start exact candidate with offline adapter and fixture-only egress'
  host = await isolatedHost()
  proof.binding = host.facts
  const started = await host.start()
  const bootstrap = await entryCookie(started.entry)
  assert.equal((await api(host.port, bootstrap.cookie, 'POST', scope + '/auth/bootstrap',
    { login_name: 'owner', display_name: 'Synthetic administrator', password })).status, 201)
  assert.equal((await api(host.port, '', 'POST', scope + '/auth/register',
    { login_name: 'reader', display_name: 'Synthetic repository reader', password })).status, 201)
  assert.equal(rows('PRAGMA user_version')[0].user_version, SCHEMA_VERSION)
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  browser = await chromium.launch({
    channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server'],
  })
  proof.chrome = browser.version()
  const context = await browser.newContext({ viewport: { width: 1250, height: 940 }, serviceWorkers: 'block' })
  const external = []
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === host.base) return route.continue()
    external.push('denied-before-dispatch')
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(host.base + '/knowledgeos/account')
  await page.locator('#login_name').fill('reader')
  await page.locator('#login_password').fill(password)
  assert.equal((await buttonResponse(page, scope + '/auth/login', '#login')).status(), 200)
  await page.locator('#profile').waitFor()
  const { data: identity } = await request(context, scope + '/me')
  assert.equal(identity.role, 'member')

  phase = 'prepare read-only snapshot and unchanged baseline'
  const { data: object } = await request(context, scope + '/objects', 'POST', {
    title: 'Synthetic A19 context', body: 'Neutral synthetic context kept unchanged',
  }, 201)
  const { data: seed } = await request(context, repository, 'POST', {
    actor_id: identity.id, platform: 'github', repository: 'synthetic/sample',
    ref_kind: 'branch', ref_value: 'main', path: 'README.md',
  }, 201)
  const snapshotId = seed.snapshot.id
  const before = durable(object.id)
  assert.equal(before.snapshots.length, 1)
  assert.equal(before.files.length, 1)
  assert.equal(before.snapshots[0].id, snapshotId)
  const setupTraffic = host.repositoryEvents()
  assert(setupTraffic.length > 0)
  assert(setupTraffic.every(call => call.outcome === 'fixture' && call.method === 'GET'))
  const readSnapshot = await request(context, repository + '/' + snapshotId)
  assert.equal(readSnapshot.data.snapshot.id, snapshotId)

  phase = 'genuine product AI read positive control'
  await page.goto(host.base + '/knowledgeos/ai')
  await page.waitForFunction(() => document.querySelector('#status').textContent === '就绪')
  assert.equal(await page.locator('#target').inputValue(), object.id)
  assert.match(await page.locator('#model').textContent(), /deepseek-a19-controlled-fixture/)
  await page.locator('#instruction').fill(readInstruction)
  const readPrep = await buttonResponse(page, ai + '/prepare', '#prepare')
  assert.equal(readPrep.status(), 200)
  assert.equal((await readPrep.json()).data.tool, 'knowledgeos_read_object')
  await page.waitForFunction(() => !document.querySelector('#execute').disabled)
  const readExecute = await buttonResponse(page, ai + '/execute', '#execute')
  assert.equal(readExecute.status(), 200)
  assert.equal((await readExecute.json()).data.result.code, 'READ')
  await page.waitForFunction(() => /^执行成功/.test(document.querySelector('#status').textContent))
  const controls = fixtureEvents()
  assert.equal(controls.filter(row => row.event === 'tool_execution' && row.name === 'knowledgeos_read_object').length, 1)
  assert.deepEqual(durable(object.id), before)
  assert.deepEqual(host.repositoryEvents(), setupTraffic)
  check('A19_AI_AUTHENTICATED_READ_CONTROL', { status_http: 200, tool: 'knowledgeos_read_object' })

  phase = 'genuine AI page submits repository push request and receives server refusal'
  let executeRequests = 0
  page.on('request', r => { if (r.url() === host.base + ai + '/execute' && r.method() === 'POST') executeRequests++ })
  await page.locator('#instruction').fill(writeInstruction)
  const refusal = await buttonResponse(page, ai + '/prepare', '#prepare')
  const refused = await refusal.json()
  assert.equal(refusal.request().postDataJSON().instruction, writeInstruction)
  assert.equal(refusal.status(), 422)
  assert.equal(refused.code, 'TOOL_NOT_ALLOWED')
  assert.equal(refused.data, undefined)
  assert.equal(refused.prepared_id, undefined)
  assert.equal(refusal.headers()['cache-control'], 'no-store')
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('TOOL_NOT_ALLOWED'))
  assert(await page.locator('#execute').isDisabled())
  assert.equal(await page.locator('#tool').textContent(), '')
  assert.equal(await page.locator('#result').textContent(), '')
  assert.equal(executeRequests, 0)
  const incremental = fixtureEvents().slice(controls.length)
  assert.deepEqual(incremental, [{
    event: 'fixture_output', case: 'repository_write', proposed_tool: 'knowledgeos_repository_push',
    offered_tools: ['knowledgeos_read_object', 'knowledgeos_update_object'],
  }])
  assert.deepEqual(host.repositoryEvents(), setupTraffic)
  assert.deepEqual(external, [])
  assert.deepEqual(await request(context, repository + '/' + snapshotId), readSnapshot)
  assert.deepEqual(durable(object.id), before)
  assert.deepEqual(rows('PRAGMA foreign_key_check'), [])
  const screen = 'a19-ai-repository-push-denied.png'
  const image = await page.screenshot({ path: join(out, screen), fullPage: true, animations: 'disabled' })
  proof.screenshots.push({ name: screen, sha256: sha(image) })
  check('A19_AI_REPOSITORY_WRITE_DENIED', {
    status_http: 422, code: refused.code, product_ui: true, prepared: false, tool_executions: 0,
    repo_transport_attempts: 0, browser_external_attempts: 0, ai_mutations: 0,
    sqlite_before_after_equal: true, fixed_snapshot_retrieved_after_denial: true,
    setup_fixture_reads: setupTraffic.length,
  })
  proof.status = 'PASS'
} catch (error) {
  proof.status = 'FAIL'
  proof.failure = { phase, message: String(error.message).slice(0, 500) }
  throw error
} finally {
  try { await browser?.close() }
  finally {
    try { await host?.stop() }
    finally {
      writeFileSync(join(out, 'summary.json'), JSON.stringify(proof, null, 2) + '\n')
      console.log(JSON.stringify({ status: proof.status, out }))
    }
  }
}
