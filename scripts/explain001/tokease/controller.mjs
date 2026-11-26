import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cap, checkManifest, checkPrice, dryAlias, exactFile, fixtureKey, jsonBytes, liveAlias, roles, route, sha, stage } from './guard.mjs'
import { inputs, prefix } from './inputs.mjs'

export { route, stage }
const local = name => fileURLToPath(new URL(name, import.meta.url))
const slash = value => value.replaceAll('\\', '/')

async function port() {
  const server = createServer()
  await new Promise((ok, no) => server.once('error', no).listen(0, '127.0.0.1', ok))
  const selected = server.address().port
  await new Promise((ok, no) => server.close(error => error ? no(error) : ok()))
  return selected
}
function isolateAccess(dir) {
  if (process.platform !== 'win32') return
  const exe = name => join(process.env.SystemRoot, 'System32', name + '.exe')
  const user = execFileSync(exe('whoami'), ['/user','/fo','csv','/nh'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const sid = user.match(/S-1-[\d-]+/)?.[0]
  assert(sid)
  execFileSync(exe('icacls'), [dir, '/inheritance:r', '/grant:r', '*' + sid + ':(OI)(CI)F'], { stdio: 'pipe' })
}

export async function createExplanationFixture({ root, candidate, entry, out, helperPrefix = prefix }) {
  root = realpathSync(root)
  assert.equal(helperPrefix, prefix)
  const mode = process.env.KO_EXPLAIN001_PHASE ?? 'dry'
  assert(['dry', 'live'].includes(mode))
  const live = mode === 'live'
  const from = file => import(pathToFileURL(join(root, file)).href)
  const { fixed: expected, hashes: helperHashes, system: expectedSystem, user, reply } = await inputs(root, candidate, entry)
  const exactUser = JSON.stringify(user)
  const { binding, pkg } = await from('scripts/fnd005/candidate-live-binding.mjs')
  const { until } = await from('scripts/lib002/a07-isolated-host.mjs')
  const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
  const pinned = binding(candidate, resolve(process.env.KO_TEST_CACHE ?? join(root, '.cache')))
  assert.equal(pinned.facts.entry_sha256, entry)
  const trace = 'scripts/fnd005/candidate-live-trace.mjs'
  const role = process.env.KO_EXPLAIN001_ROLE
  let approved, manifestBytes = Buffer.from(jsonBytes(expected))
  if (live) {
    assert(roles.includes(role), 'live requires main or independent')
    manifestBytes = exactFile(process.env.KO_EXPLAIN001_MANIFEST)
    assert(sha(manifestBytes) === process.env.KO_EXPLAIN001_ACTIVATE, 'reviewed manifest SHA-256 required')
    const manifest = checkManifest(JSON.parse(manifestBytes), expected, ['wire_sha256', 'approval_sha256'])
    approved = exactFile(process.env.KO_EXPLAIN001_PRICE)
    assert.equal(sha(approved), manifest.approval_sha256)
    checkPrice(JSON.parse(approved))
  }
  const manifestHash = sha(manifestBytes)
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'ex1t-'))
  isolateAccess(dir)
  const home = join(dir, 'home'), data = join(dir, 'data')
  const profile = 'ex1bounded', profileDir = join(home, 'profiles', profile)
  const product = join(profileDir, 'node_modules', 'knowledgeos-panel')
  const file = name => join(dir, name)
  const write = (name, bytes) => writeFileSync(file(name), bytes, { flag: 'wx' })
  write('manifest.json', manifestBytes)
  if (live) write('approved.json', approved)
  else write('dry-reply.json', jsonBytes(reply))
  mkdirSync(data)
  for (const relative of git('ls-files', '--', pkg + '/package.json', pkg + '/cordis.patch.yml', pkg + '/lib').toString().trim().split(/\r?\n/)) {
    const dest = join(product, relative.slice(pkg.length + 1))
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, readFileSync(join(root, relative)), { flag: 'wx' })
  }
  const staged = realpathSync(join(product, 'lib/index.js'))
  assert.equal(sha(readFileSync(staged)), entry)
  const deps = join(product, 'node_modules', '@deepseek-ai')
  mkdirSync(deps, { recursive: true })
  symlinkSync(realpathSync(join(pinned.runtime, 'apps/cli/node_modules/@deepseek-ai/schemastery')), join(deps, 'schemastery'), 'junction')
  const config = (name, value) => writeFileSync(join(profileDir, name), JSON.stringify(value), { flag: 'wx' })
  const alias = live ? liveAlias : dryAlias
  config('package.json', { name: profile, private: true,
    dependencies: { 'knowledgeos-panel': 'link:' + slash(product) },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'knowledgeos-panel'] } } })
  config('cordis.yml', [])
  config('cordis.patch.yml', [
    { id: 'knowledgeos-host', config: { dataDir: slash(data), ai: { timeoutMs: 30000, maxCalls: 1 } } },
    { id: 'llm-pi-ai', config: { providers: { [route.provider]: {
      api: 'openai-completions', baseURL: route.endpoint, apiKeyEnv: alias, transport: 'sse', cacheRetention: 'none',
      compat: { thinkingFormat: 'deepseek' }, retryPolicy: { mode: 'normal', maxRetries: 0 },
      models: [{ id: route.model, name: route.model, maxTokens: cap, reasoningEfforts: { off: null, high: 'high' } }],
    } } } },
    { id: 'agent-default-model', config: { provider: route.provider, model: route.model } },
    { insert: [{ id: 'ex1-tokease-native', name: slash(local('native.mjs')) }] },
  ])

  const selectedPort = await port(), base = 'http://127.0.0.1:' + selectedPort
  let active, boots = 0, armed = false, closed = false
  const events = name => existsSync(file(name)) ? readFileSync(file(name), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  const dispatch = () => events(live ? 'live-dispatch.jsonl' : 'dry-wire.jsonl')

  function arm({ stage: selected, system = expectedSystem, user } = {}) {
    assert(active && !armed && !closed)
    assert.equal(selected, stage)
    assert(sha(system) === expected.system_sha256)
    assert((typeof user === 'string' ? user : JSON.stringify(user)) === exactUser, 'unexpected explanation input')
    if (live) checkPrice(JSON.parse(approved))
    write('permit.json', JSON.stringify({ unit: expected.unit, candidate, entry_sha256: entry, manifest_sha256: manifestHash,
      stage, expires_at: Date.now() + 30000 }))
    armed = true
    return stage
  }

  async function start() {
    assert(!active && !closed)
    if (live) {
      assert(process.platform === 'win32', 'the isolated credential broker requires Windows')
      checkPrice(JSON.parse(approved))
    }
    const run = file('boot-' + ++boots)
    mkdirSync(run)
    const env = {}
    for (const key of ['SystemRoot', 'WINDIR', 'ComSpec', 'Path', 'PATHEXT', 'ProgramFiles', 'ProgramFiles(x86)', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS']) {
      if (process.env[key]) env[key] = process.env[key]
    }
    for (const key of ['HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP']) {
      env[key] = join(dir, 'env-' + key)
      mkdirSync(env[key], { recursive: true })
    }
    Object.assign(env, {
      DSH_HOME: home, DSH_CLIENT_COMMIT_HASH: pinned.facts.upstream, DSH_TELEMETRY_DISABLED: '1', DSH_TELEMETRY_MODE: 'DISABLED',
      TSX_DISABLE_CACHE: '1', KO_ENTRY: staged, KO_HASH: entry, KO_RUN: run,
      KO_EX_HOST: base, KO_EX_DIR: dir, KO_EX_MODE: mode, KO_EX_MANIFEST_SHA256: manifestHash,
      ...(live ? { KO_EX_ROLE: role } : { [dryAlias]: fixtureKey }),
    })
    const child = spawn(process.execPath, ['--import', pathToFileURL(local('preload.mjs')).href, '--import', 'tsx/esm',
      '--import', pathToFileURL(join(root, trace)).href, 'apps/cli/src/bin.ts', '--profile', profile,
      '--host', '127.0.0.1', '--port', String(selectedPort), '--no-open'],
    { cwd: pinned.runtime, env, stdio: [live ? 'pipe' : 'ignore', 'pipe', 'pipe'], windowsHide: true })
    let ended = false, tail = ''
    const done = new Promise(ok => {
      child.once('error', () => { ended = true; ok() })
      child.once('close', () => { ended = true; ok() })
    })
    active = { child, done, ended: () => ended }
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { tail = (tail + chunk).slice(-28000) })
    try {
      if (live) {
        // Only this no-profile child reads the operator-provisioned process-scoped alias.
        // Its stdout is piped directly into Host stdin and is never decoded or logged here.
        const ps = join(env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
        const command = "$v=[Environment]::GetEnvironmentVariable('" + liveAlias + "','Process');" +
          "if ($v -notmatch '^[!-~]{1,4096}$') { exit 2 }; [Console]::Out.Write($v)"
        const broker = spawn(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
          cwd: run, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 10000,
        })
        broker.once('error', () => child.stdin.end())
        child.stdin.on('error', () => broker.kill())
        broker.stdout.pipe(child.stdin)
      }
      const loaded = join(run, 'loaded.json'), selected = join(run, 'route.json')
      const entryUrl = await until(() => {
        assert(!ended, 'EXPLAIN-001 bound Host exited before readiness')
        return existsSync(loaded) && existsSync(selected) && /dsh web:\s*(http:\/\/[^\s]+)\s/.exec(tail)?.[1]
      }, 'EXPLAIN-001 native provider selection', 100000)
      assert.equal(new URL(entryUrl).origin, base)
      assert.deepEqual(JSON.parse(readFileSync(loaded, 'utf8')), { pid: child.pid, hash: entry })
      assert.deepEqual(JSON.parse(readFileSync(selected, 'utf8')), { pid: child.pid, ...route })
      return { entry: entryUrl, pid: child.pid }
    } catch (error) {
      if (!live) {
        const state = {
          load_witness: existsSync(join(run, 'loaded.json')),
          route_witness: existsSync(join(run, 'route.json')),
          web_ready_message: /dsh web:\s*http:\/\//.test(tail),
        }
        writeFileSync(join(run, 'dry-boot-state.json'), JSON.stringify(state))
      }
      await stop()
      throw error
    }
  }

  async function stop() {
    if (!active) return
    const { child, done, ended } = active
    if (!ended()) child.kill()
    let timer
    try { await Promise.race([done, new Promise((_, no) => { timer = setTimeout(() => no(Error('EXPLAIN-001 Host shutdown timed out')), 15000) })]) }
    finally { clearTimeout(timer); active = undefined }
  }
  async function close() { closed = true; await stop() }

  function proof() {
    const requests = dispatch()
    const net = events('network-denials.jsonl')
    const sockets = events('transport-socket.jsonl')
    const response = events('response-usage.jsonl')
    const consumed = existsSync(file('consumed.json'))
    if (!live && armed && consumed && requests.length === 1 && sockets.length === 0 && !existsSync(file('native-denial')) &&
        net.every(row => row.destination === 'windows_local_pipe') && events('transport-error.jsonl').length === 0) {
      const calibration = { ...expected, wire_sha256: requests[0].request_sha256 }
      const bytes = JSON.stringify(calibration, null, 2) + '\n'
      const pathname = join(out ?? dir, 'explanation-calibration.json')
      if (existsSync(pathname)) assert.equal(readFileSync(pathname, 'utf8'), bytes)
      else writeFileSync(pathname, bytes, { flag: 'wx' })
    }
    return {
      mode, unit: expected.unit, ...pinned.facts, ...route, manifest_sha256: manifestHash, ...(live ? { budget_role: role } : {}), helpers: helperHashes,
      real_inference_requests: live ? requests.length : 0, outbound_tls_connect_attempts: sockets.length,
      wire_calibrations: live ? 0 : requests.length, expectations_armed: armed ? 1 : 0, permit_consumed: consumed,
      native_denials: existsSync(file('native-denial')) ? 1 : 0, network_denials: net,
      transport_errors: events('transport-error.jsonl'), requests, response_usage: response,
    }
  }
  return { base, port: selectedPort, data, dir, dbPath: join(data, 'knowledgeos.sqlite'), playwright: pinned.playwright,
    start, stop, close, arm, proof,
    waitDispatch: requested => until(() => dispatch().find(row => row.stage === requested), 'EXPLAIN-001 bound dispatch', 10000),
    waitResponse: () => live ? until(() => events('response-usage.jsonl')[0], 'EXPLAIN-001 redacted usage', 10000) : undefined,
  }
}

export { createExplanationFixture as createFixture }
