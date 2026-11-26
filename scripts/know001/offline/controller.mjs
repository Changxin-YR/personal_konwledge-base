import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { model, provider } from './adapter.mjs'

const local = name => fileURLToPath(new URL(name, import.meta.url))
const slash = path => path.replaceAll('\\', '/')
const sha = value => createHash('sha256').update(value).digest('hex')
const modes = new Set(['hold', 'malformed', 'insufficient', 'truncated', 'malicious-reference', 'oversized'])

async function freePort() {
  const socket = createServer()
  await new Promise((ok, no) => socket.once('error', no).listen(0, '127.0.0.1', ok))
  const { port } = socket.address()
  await new Promise(ok => socket.close(ok))
  return port
}

export async function createFixture({ root, candidate, entry, out, fixtureSha256 }) {
  root = realpathSync(root)
  assert.match(candidate, /^[a-f0-9]{40}$/)
  assert.match(entry, /^[a-f0-9]{64}$/)
  assert(existsSync(out))
  const load = file => import(pathToFileURL(join(root, file)).href)
  const { binding, pkg } = await load('scripts/fnd005/candidate-live-binding.mjs')
  const { until } = await load('scripts/lib002/a07-isolated-host.mjs')
  const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
  const pinned = binding(candidate, resolve(process.env.KO_TEST_CACHE ?? join(root, '.cache')))
  assert.equal(entry, pinned.facts.entry_sha256)
  const fixture = 'scripts/know001/context-fixture.md'
  if (fixtureSha256 !== undefined) {
    assert.equal(sha(readFileSync(join(root, fixture))), fixtureSha256)
    assert.equal(sha(git('show', candidate + ':' + fixture)), fixtureSha256)
  }
  const witness = 'scripts/fnd005/candidate-live-trace.mjs'
  const traceScript = join(root, witness)
  assert.equal(sha(readFileSync(traceScript)), sha(git('show', candidate + ':' + witness)))
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'know001-bound-offline-'))
  const home = join(dir, 'home'), data = join(dir, 'data'), control = join(dir, 'control')
  const profile = 'know001-offline', profileDir = join(home, 'profiles', profile)
  const product = join(profileDir, 'node_modules', 'knowledgeos-panel')
  mkdirSync(data); mkdirSync(control)
  for (const file of git('ls-files', '--', pkg + '/package.json', pkg + '/cordis.patch.yml', pkg + '/lib').toString().trim().split(/\r?\n/)) {
    const dest = join(product, file.slice(pkg.length + 1))
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, readFileSync(join(root, file)), { flag: 'wx' })
  }
  const staged = realpathSync(join(product, 'lib/index.js'))
  assert.equal(sha(readFileSync(staged)), entry)
  const deps = join(product, 'node_modules', '@deepseek-ai')
  mkdirSync(deps, { recursive: true })
  symlinkSync(realpathSync(join(pinned.runtime, 'apps/cli/node_modules/@deepseek-ai/schemastery')), join(deps, 'schemastery'), 'junction')
  const writeProfile = (filename, value) => writeFileSync(join(profileDir, filename), JSON.stringify(value), { flag: 'wx' })
  writeProfile('package.json', { name: profile, private: true, dependencies: { 'knowledgeos-panel': 'link:' + slash(product) },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'knowledgeos-panel'] } } })
  writeProfile('cordis.yml', [])
  writeProfile('cordis.patch.yml', [
    { id: 'knowledgeos-host', config: { dataDir: slash(data), ai: { provider, model, timeoutMs: 30_000 } } },
    { insert: [{ id: 'know001-offline-adapter', name: slash(local('adapter.mjs')) }] },
  ])
  const port = await freePort()
  const base = 'http://127.0.0.1:' + port
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(systemroot|windir|comspec|path|pathext|programfiles.*|processor_.*|number_of_processors)$/i.test(key)))
  for (const key of ['HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP']) {
    env[key] = join(dir, 'sandbox-' + key)
    mkdirSync(env[key])
  }
  Object.assign(env, {
    DSH_HOME: home, DSH_CLIENT_COMMIT_HASH: pinned.facts.upstream, DSH_TELEMETRY_DISABLED: '1', DSH_TELEMETRY_MODE: 'DISABLED',
    TSX_DISABLE_CACHE: '1', KO_ENTRY: staged, KO_HASH: entry, KO_TEST_LOOPBACK: base, KO_TERMS_CONTROL: control,
  })
  let processState, boots = 0
  async function start() {
    assert(!processState)
    const trace = join(dir, 'boot-' + ++boots)
    mkdirSync(trace)
    const child = spawn(process.execPath, [
      '--import', 'tsx/esm', '--import', pathToFileURL(traceScript).href, '--import', pathToFileURL(local('offline-egress.mjs')).href,
      'apps/cli/src/bin.ts', '--profile', profile, '--host', '127.0.0.1', '--port', String(port), '--no-open',
    ], { cwd: pinned.runtime, env: { ...env, KO_RUN: trace }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let ended = false, tail = ''
    const done = new Promise(ok => {
      child.once('error', () => { ended = true; ok() })
      child.once('close', () => { ended = true; ok() })
    })
    processState = { child, done }
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { tail = (tail + chunk).slice(-24000) })
    try {
      const loaded = join(trace, 'loaded.json')
      const entryUrl = await until(() => {
        assert(!ended, 'isolated fixture Host exited before readiness')
        return existsSync(loaded) && /dsh web:\s*(http:\/\/[^\s]+)\s/.exec(tail)?.[1]
      }, 'bound offline KNOW-001 Host', 90_000)
      assert.equal(new URL(entryUrl).origin, base)
      assert.deepEqual(JSON.parse(readFileSync(loaded, 'utf8')), { pid: child.pid, hash: entry })
      return { entry: entryUrl, pid: child.pid }
    } catch (error) {
      await stop()
      throw error
    }
  }
  async function stop() {
    if (!processState) return
    const { child, done } = processState
    if (child.exitCode === null && child.signalCode === null) child.kill()
    let timer
    try { await Promise.race([done, new Promise((_, no) => { timer = setTimeout(() => no(Error('offline Host shutdown timeout')), 15_000) })]) }
    finally { clearTimeout(timer); processState = undefined }
  }
  const events = () => {
    const trace = join(control, 'adapter.jsonl')
    return existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  }
  const arm = mode => {
    assert(modes.has(mode))
    const id = randomUUID()
    writeFileSync(join(control, 'next-case.json'), JSON.stringify({ id, mode }), { flag: 'wx' })
    return id
  }
  const release = id => {
    assert.match(id, /^[a-f0-9-]{36}$/)
    writeFileSync(join(control, 'release-' + id), '', { flag: 'a' })
  }
  const proof = () => ({
    mode: 'CONTROLLED_FIXTURE',
    provider,
    model,
    real_inference_requests: 0,
    fixture_dispatches: events().filter(event => event.event === 'fixture-dispatch').length,
    external_fetch_denials: existsSync(join(control, 'blocked.jsonl')) ? readFileSync(join(control, 'blocked.jsonl'), 'utf8').trim().split('\n').length : 0,
    controller_sha256: sha(readFileSync(local('controller.mjs'))),
    adapter_sha256: sha(readFileSync(local('adapter.mjs'))),
    egress_sha256: sha(readFileSync(local('offline-egress.mjs'))),
  })
  return { base, dbPath: join(data, 'knowledgeos.sqlite'), playwright: pinned.playwright, start, stop, proof,
    events, arm, release, waitEvent: (event, id) => until(() => events().find(row => row.event === event && row.id === id), event, 10_000) }
}
