import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { checkManifest, route, sha } from './term-egress.mjs'

const local = name => fileURLToPath(new URL(name, import.meta.url))
const candidateShape = /^[0-9a-f]{40}$/
const hashShape = /^[0-9a-f]{64}$/
const exactFile = (path, max) => {
  const stat = lstatSync(path)
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= max)
  return readFileSync(path)
}
const stageNames = ['database-index', 'array-index']
const stageMarkers = ['数据库索引（database index）', '数组索引（array index）']
const term = '索引'

function sourceWindow(text, start, end) {
  const split = n => n > 0 && n < text.length && /[\uD800-\uDBFF]/.test(text.charAt(n - 1)) && /[\uDC00-\uDFFF]/.test(text.charAt(n))
  let low = Math.max(0, start - 220), high = Math.min(text.length, end + 220)
  if (split(low)) low++
  if (split(high)) high--
  return {
    term: text.slice(start, end).trim(),
    before: text.slice(low, start),
    after: text.slice(end, high),
  }
}

function approvedSynthetic(fixture) {
  const lines = fixture.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
  return stageMarkers.map((marker, index) => {
    const candidates = lines.filter(line => line.includes(marker))
    assert.equal(candidates.length, 1)
    const text = candidates[0] + '\n'
    const start = text.lastIndexOf(term)
    const end = start + term.length
    assert(start > text.indexOf(term))
    return { stage: stageNames[index], text, start, end,
      user_sha256: sha(JSON.stringify(sourceWindow(text, start, end))) }
  })
}

async function allocatePort() {
  const server = createServer()
  await new Promise((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  const port = server.address().port
  await new Promise(ok => server.close(ok))
  return port
}

function makePrivate(dir) {
  if (process.platform !== 'win32') return
  const system = process.env.SystemRoot
  assert(system)
  const exe = name => join(system, 'System32', name + '.exe')
  const user = execFileSync(exe('whoami'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' })
  const sid = user.match(/S-1-[\d-]+/)?.[0]
  assert(sid)
  execFileSync(exe('icacls'), [dir, '/inheritance:r', '/grant:r', '*' + sid + ':(OI)(CI)F'], { stdio: 'pipe' })
}

export async function createFixture({ root, candidate, entry, out, fixtureSha256 }) {
  assert.match(candidate, candidateShape)
  assert.match(entry, hashShape)
  assert.match(fixtureSha256, hashShape)
  const mode = process.env.KO_KNOW001_PHASE ?? 'dry'
  assert(['dry', 'live'].includes(mode))
  const dir = mkdtempSync(join(dirname(realpathSync(out)), 'knowledgeos-know001-profile-'))
  makePrivate(dir)
  const home = join(dir, 'home'), data = join(dir, 'data')
  const profile = 'know001-confined'
  const profileDir = join(home, 'profiles', profile)
  const product = join(profileDir, 'node_modules/knowledgeos-panel')
  const load = path => import(pathToFileURL(join(root, path)).href)
  const { binding, pkg } = await load('scripts/fnd005/candidate-live-binding.mjs')
  const { until } = await load('scripts/lib002/a07-isolated-host.mjs')
  const { priceApproval } = await load('scripts/fnd005/candidate-live-guards.mjs')
  const pinned = binding(candidate, resolve(process.env.KO_TEST_CACHE ?? join(root, '.cache')))
  assert.equal(pinned.facts.entry_sha256, entry)
  const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root })
  const guardHelper = join(root, 'scripts/fnd005/candidate-live-guards.mjs')
  const loaderHelper = join(root, 'scripts/fnd005/candidate-live-trace.mjs')
  for (const rel of ['scripts/fnd005/candidate-live-guards.mjs', 'scripts/fnd005/candidate-live-trace.mjs', 'scripts/lib002/a07-isolated-host.mjs',
    ...['term-controller.mjs','term-profile-preload.mjs','term-profile-native.mjs','term-egress.mjs','term-native-gate.mjs'].map(name=>'scripts/know001/'+name)]) {
    assert.equal(sha(readFileSync(join(root, rel))), sha(git('show', candidate + ':' + rel)))
  }
  const fixture = git('show', candidate + ':scripts/know001/context-fixture.md')
  assert.equal(sha(fixture), fixtureSha256)
  const sources = approvedSynthetic(fixture)
  const sourceCode = git('show', candidate + ':packages/knowledgeos-panel/src/host/term-http.ts').toString('utf8')
  const system = sourceCode.match(/^export const termSystem = '([^'\r\n]+)'$/m)?.[1]
  assert(system && !system.includes('\\'), 'review frozen termSystem literal before calibrating')
  const expected = {
    unit: 'KNOW-001', candidate, entry_sha256: entry, route, fixture_sha256: fixtureSha256, system_sha256: sha(system),
    steps: sources.map(({ stage, user_sha256 }) => ({ stage, user_sha256 })),
  }
  const write = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value), { flag: 'wx' })
  const readEvents = name => {
    const file = join(dir, name)
    return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  }

  let approval, manifest, manifestHash, credential
  const alias = mode === 'live' ? 'KOS_TOKEASE_ACCEPTANCE_KEY' : 'KOS_KNOW001_DRY_SENTINEL'
  if (mode === 'dry') {
    write('expected-dry.json', expected)
    credential = 'synthetic-offline-only'
  } else {
    assert.equal(process.env.KO_KNOW001_ACTIVATE, 'allow-two-text-inferences:' + candidate)
    manifestHash = process.env.KO_KNOW001_MANIFEST_SHA256
    assert.match(manifestHash, hashShape)
    const manifestBytes = exactFile(process.env.KO_KNOW001_MANIFEST, 4096)
    assert.equal(sha(manifestBytes), manifestHash)
    manifest = JSON.parse(manifestBytes.toString('utf8'))
    checkManifest(manifest, candidate, entry)
    const approvalBytes = exactFile(process.env.KO_KNOW001_APPROVAL, 4096)
    assert.equal(sha(approvalBytes), manifest.approval_sha256)
    approval = JSON.parse(approvalBytes.toString('utf8'))
    priceApproval(approval, route)
    assert.equal(manifest.fixture_sha256, fixtureSha256)
    assert.equal(manifest.system_sha256, expected.system_sha256)
    assert.deepEqual(manifest.steps.map(({ stage, user_sha256 }) => ({ stage, user_sha256 })), expected.steps)
    writeFileSync(join(dir, 'term-manifest.json'), manifestBytes, { flag: 'wx' })
    writeFileSync(join(dir, 'approved.json'), approvalBytes, { flag: 'wx' })
    credential = process.env[alias]
    assert(typeof credential === 'string' && credential.trim().length > 0, 'native credential was not provided to live launcher')
  }

  mkdirSync(data)
  const artifacts = git('ls-files', '--', pkg + '/package.json', pkg + '/cordis.patch.yml', pkg + '/lib').toString('utf8').trim().split(/\r?\n/)
  for (const file of artifacts) {
    const target = join(product, file.slice(pkg.length + 1))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(join(root, file)), { flag: 'wx' })
  }
  const stagedEntry = realpathSync(join(product, 'lib/index.js'))
  assert.equal(sha(readFileSync(stagedEntry)), entry)
  const dependency = join(product, 'node_modules/@deepseek-ai')
  mkdirSync(dependency, { recursive: true })
  symlinkSync(realpathSync(join(pinned.runtime, 'apps/cli/node_modules/@deepseek-ai/schemastery')), join(dependency, 'schemastery'), 'junction')
  const config = (file, value) => writeFileSync(join(profileDir, file), JSON.stringify(value), { flag: 'wx' })
  config('package.json', {
    name: profile, private: true, dependencies: { 'knowledgeos-panel': 'link:' + product.replaceAll('\\', '/') },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'knowledgeos-panel'] } },
  })
  config('cordis.yml', [])
  config('cordis.patch.yml', [
    { id: 'knowledgeos-host', config: { dataDir: data.replaceAll('\\', '/') } },
    { id: 'llm-pi-ai', config: { providers: { [route.provider]: {
      api: 'openai-completions', baseURL: route.endpoint, apiKeyEnv: alias, transport: 'sse', cacheRetention: 'none',
      retryPolicy: { mode: 'normal', maxRetries: 0 }, models: [{ id: route.model, name: route.model, maxTokens: 512 }],
    } } } },
    { id: 'agent-default-model', config: { provider: route.provider, model: route.model } },
    { insert: [{ id: 'know001-acceptance-native', name: local('term-profile-native.mjs').replaceAll('\\', '/') }] },
  ])

  const port = await allocatePort()
  const base = 'http://127.0.0.1:' + port
  let active, starts = 0, armed = 0
  async function beforeExplain({ stage, spec, sourceText }) {
    assert(active, 'Host is not running')
    assert(armed < 2)
    const selected = sources[armed]
    assert.equal(stage, selected.stage)
    assert.equal(sourceText, selected.text)
    assert.equal(spec.start, selected.start)
    assert.equal(spec.end, selected.end)
    assert.equal(spec.source_hash, sha(selected.text))
    const step = armed + 1
    if (step === 2) {
      const log = mode === 'live' ? 'term-dispatches.jsonl' : 'term-calibrations.jsonl'
      assert.equal(readEvents(log).length, 1)
    }
    if (mode === 'dry') {
      write('term-dry-armed-' + step, { stage })
    } else {
      priceApproval(approval, route)
      write('term-permit-' + step, { unit: 'KNOW-001', candidate, entry_sha256: entry, manifest_sha256: manifestHash,
        step, stage, expires_at: Date.now() + 30000 })
    }
    armed++
  }

  async function start() {
    assert(!active)
    const run = join(dir, 'boot-' + ++starts)
    mkdirSync(run)
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(systemroot|windir|comspec|path|pathext|programfiles.*|processor_.*|number_of_processors)$/i.test(key)))
    for (const key of ['HOME','USERPROFILE','LOCALAPPDATA','APPDATA','TEMP','TMP']) {
      env[key] = join(run, 'env-' + key)
      mkdirSync(env[key])
    }
    Object.assign(env, {
      DSH_HOME: home, DSH_CLIENT_COMMIT_HASH: pinned.facts.upstream,
      DSH_TELEMETRY_DISABLED: '1', DSH_TELEMETRY_MODE: 'DISABLED', TSX_DISABLE_CACHE: '1',
      KO_ENTRY: stagedEntry, KO_HASH: entry, KO_RUN: run, KO_TERM_DIR: dir,
      KO_TEST_LOOPBACK: base, KO_BOUND_CANDIDATE: candidate, KO_TERM_FND_GUARDS: guardHelper,
      KO_TERM_PHASE: mode, [alias]: credential,
      ...(manifestHash ? { KO_TERM_MANIFEST_SHA256: manifestHash } : {}),
    })
    const child = spawn(process.execPath, [
      '--import', pathToFileURL(local('term-profile-preload.mjs')).href,
      '--import', 'tsx/esm', '--import', pathToFileURL(loaderHelper).href,
      'apps/cli/src/bin.ts', '--profile', profile, '--host', '127.0.0.1', '--port', String(port), '--no-open',
    ], { cwd: pinned.runtime, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let closed = false, tail = ''
    const done = new Promise(ok => {
      child.once('error', () => { closed = true; ok() })
      child.once('close', () => { closed = true; ok() })
    })
    active = { child, done, closed: () => closed }
    for (const channel of [child.stdout, child.stderr]) channel.on('data', chunk => { tail = (tail + chunk).slice(-24000) })
    const loaded = join(run, 'loaded.json'), selected = join(run, 'route.json')
    const url = await until(() => {
      assert(!closed, 'KNOW-001 isolated profile exited before readiness')
      return existsSync(loaded) && existsSync(selected) && /dsh web:\s*(http:\/\/[^\s]+)\s/.exec(tail)?.[1]
    }, 'KNOW-001 native Host and exact route', 120000)
    assert.equal(new URL(url).origin, base)
    assert.deepEqual(JSON.parse(readFileSync(loaded, 'utf8')), { pid: child.pid, hash: entry })
    assert.deepEqual(JSON.parse(readFileSync(selected, 'utf8')), { pid: child.pid, ...route })
    return { entry: url, pid: child.pid }
  }

  async function stop() {
    if (!active) return
    const { child, closed, done } = active
    if (!closed()) child.kill()
    let timeout
    try { await Promise.race([done, new Promise((_, fail) => { timeout = setTimeout(() => fail(Error('KNOW-001 Host did not stop')), 15000) })]) }
    finally { clearTimeout(timeout); active = undefined }
  }

  function proof() {
    const calibrations = readEvents('term-calibrations.jsonl')
    const dispatches = readEvents('term-dispatches.jsonl')
    assert.equal(armed, 2)
    assert.equal(readEvents('term-denials.jsonl').length, 0)
    if (mode === 'dry') {
      assert.equal(calibrations.length, 2)
      assert.equal(dispatches.length, 0)
      const safe = { ...expected, steps: calibrations.map(row => ({
        stage: row.stage, user_sha256: row.user_sha256, wire_sha256: row.request_sha256,
      })) }
      const filename = join(out, 'term-calibration.json')
      const bytes = JSON.stringify(safe, null, 2) + '\n'
      if (!existsSync(filename)) writeFileSync(filename, bytes, { flag: 'wx' })
      else assert.equal(readFileSync(filename, 'utf8'), bytes)
      return { ...route, mode, wire_calibrations: 2, real_inference_requests: 0,
        calibration: basename(filename), calibration_sha256: sha(bytes), requests: calibrations }
    }
    assert.equal(calibrations.length, 0)
    assert.equal(dispatches.length, 2)
    assert([1, 2].every(step => existsSync(join(dir, 'term-consumed-' + step))))
    return { ...route, mode, wire_calibrations: 0, real_inference_requests: 2, manifest_sha256: manifestHash, requests: dispatches }
  }

  return { base, dbPath: join(data, 'knowledgeos.sqlite'), playwright: pinned.playwright, start, stop, beforeExplain, proof }
}
