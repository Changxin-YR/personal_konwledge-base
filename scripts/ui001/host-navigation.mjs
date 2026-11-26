// node host-navigation.mjs <frozen checkout> <40-char candidate SHA> <entry SHA256> <main|independent>
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const usage = 'node host-navigation.mjs <frozen checkout> <full candidate SHA> <entry SHA256> <main|independent>'
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--help') { console.log(usage); process.exit(0) }
const [checkout, candidate, entry, kind] = args
if (args.length !== 4 || !/^[a-f0-9]{40}$/.test(candidate) || !/^[a-f0-9]{64}$/.test(entry) || !['main','independent'].includes(kind)) {
  console.error(usage); process.exit(2)
}
const root = realpathSync(checkout), self = 'scripts/ui001/host-navigation.mjs'
const load = path => import(pathToFileURL(join(root, path)).href)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const out = mkdtempSync(join(tmpdir(), `knowledgeos-ui001-${kind}-`)), summary = join(out, 'summary.json')
const facts = { unit_id: 'UI-001', candidate_sha: candidate, entry_sha256: entry, run_kind: kind, run_id: randomUUID(),
  node: process.version, sqlite: process.versions.sqlite, status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', P01: 'NOT_RUN',
  screens: [], navigation: [], objects: [], checks: [], browser_denied: 0, model_routes_blocked: 0, boots: [], model_observations: [], phase: 'bind_candidate' }
let host, browser, h, owner, boot, testing

function bind() {
  const git = (...command) => execFileSync('git', ['--no-replace-objects','--no-optional-locks', ...command],
    { cwd: root, windowsHide: true, stdio: ['ignore','pipe','pipe'] })
  assert.equal(realpathSync(fileURLToPath(import.meta.url)), realpathSync(join(root, self)))
  assert.equal(git('rev-parse','HEAD').toString().trim(), candidate)
  const files = [self, ...['expectations','fixture','records','workspaces'].map(name => `scripts/ui001/host-support-${name}.mjs`),
    ...['host-support','host-support-reader','host-support-practice'].map(name => `scripts/learn006/${name}.mjs`),
    'scripts/integrated-case-proof.mjs','scripts/lib002/a07-isolated-host.mjs',
    'scripts/fnd003/harness.mjs','scripts/fnd004/harness.mjs','scripts/fnd005/candidate-live-binding.mjs']
  const hashes = {}
  for (const path of files) {
    hashes[path] = digest(readFileSync(join(root, path)))
    assert.equal(hashes[path], digest(git('show', `${candidate}:${path}`)))
  }
  facts.runner_sha256 = hashes[self]
  facts.helper_set_sha256 = digest(JSON.stringify(hashes))
}

async function start() {
  const started = await host.start()
  assert.equal(new URL(started.entry).origin, host.base)
  boot = { number: facts.boots.length + 1, host_non_loopback_requests: null }
  facts.boots.push(boot)
  return started.entry
}

async function zeroCalls(label) {
  const status = await h.api(owner, '/knowledge/v1/ai/status')
  facts.model_observations.push({ point: label, attempts: status.attempts, configured: status.configured })
  assert.equal(status.attempts, 0)
  assert.deepEqual([status.reported_input_tokens, status.reported_output_tokens], [0, 0])
}

async function stop() {
  if (!host) return
  if (boot) boot.host_non_loopback_requests = host.repositoryEvents().length
  await host.stop()
  if (boot) assert.equal(boot.host_non_loopback_requests, 0)
  boot = undefined
}

function fail(error) {
  process.exitCode = 1
  if (testing) facts[testing] = 'FAIL'
  if (testing) facts.P01 = 'FAIL'
  facts.status = 'FAIL'
  // Report only our static phase/source line and classified business status, never raw call logs or error text.
  const frame = String(error?.stack ?? '').split('\n').filter(line => /^\s*at /.test(line))
    .map(line => line.replaceAll('\\', '/').match(/\/(?:ui001|learn006)\/(host-[\w-]+\.mjs:\d+):\d+/)?.[1]).find(Boolean)
  facts.failure ??= { phase: facts.phase, source: frame, type: ['TimeoutError','AssertionError'].includes(error?.name) ? error.name : 'runtime',
    ...(Number.isInteger(error?.httpStatus) && { http_status: error.httpStatus }), ...(error?.businessCode && { code: error.businessCode }) }
}

async function run() {
  bind()
  const { candidateFacts } = await load('scripts/integrated-case-proof.mjs')
  const frozen = candidateFacts(root, candidate)
  assert.equal(frozen.entry_sha256, entry)
  Object.assign(facts, { tree: frozen.tree, source_tree: frozen.source_tree, build_sha256: frozen.build_sha256 })
  const [{ isolate }, { api, dbPath, entryCookie }, { harness, prefix }, fixture, layout, records] = await Promise.all([
    load('scripts/lib002/a07-isolated-host.mjs'), load('scripts/fnd004/harness.mjs'), load('scripts/learn006/host-support.mjs'),
    load('scripts/ui001/host-support-fixture.mjs'), load('scripts/ui001/host-support-workspaces.mjs'), load('scripts/ui001/host-support-records.mjs'),
  ])
  facts.phase = 'isolated_host_and_synthetic_accounts'
  host = await isolate(candidate, entry, { repositoryTraffic: 'fixture-only' })
  assert.match(host.base, /^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/)
  host.dbPath = dbPath(host.data)
  facts.dsh_upstream = host.facts.upstream
  facts.dsh_runtime_sha256 = host.facts.runtime_sha256
  const bootstrap = await entryCookie(await start()), password = randomUUID()
  const names = ['author','learner-a','learner-b'].map(name => `ui-${name}-${facts.run_id.slice(0,8)}`)
  for (const [i, name] of names.entries()) {
    const response = await api(host.port, i === 0 ? bootstrap.cookie : '', 'POST', prefix + (i === 0 ? '/auth/bootstrap' : '/auth/register'),
      { login_name: name, display_name: ['合成作者','合成学习者甲','合成学习者乙'][i], password })
    assert.equal(response.status, 201)
  }
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    /^(systemroot|windir|comspec|path|pathext|programfiles.*|localappdata|appdata|userprofile|home|temp|tmp|lang|display|xdg_runtime_dir)$/i.test(name)))
  browser = await chromium.launch({ channel: 'chrome', headless: true, env,
    args: ['--disable-background-networking','--disable-component-update','--disable-sync','--no-proxy-server'] })
  facts.chrome = browser.version()
  h = harness({ host, browser, facts, out, password })
  const loginAll = async () => {
    const actors = []
    for (const name of names) {
      const actor = await h.login(name)
      // A mounted model adapter is allowed. No test interaction may invoke it.
      await actor.context.route(/\/knowledge\/v1\/(?:ai\/prepare|terms\/explain|practice-sessions\/generate)(?:\?|$)/, route => {
        facts.model_routes_blocked++
        return route.abort()
      })
      actors.push(actor)
    }
    assert.equal(new Set(actors.map(actor => actor.id)).size, 3)
    return actors
  }
  const initial = await loginAll()
  owner = initial[0]
  await zeroCalls('before_preparation')
  h.step('prepare_shared_version_question_and_mask_through_http')
  const f = await fixture.prepare(h, ...initial, kind === 'independent')
  await zeroCalls('after_http_preparation')
  owner = undefined
  for (const actor of initial) await actor.context.close()
  await stop()
  h.step('offline_handwritten_favorite_fixture')
  f.cards = await fixture.seedTerms(await load('packages/knowledgeos-panel/lib/test-support.js'), host.data, initial[1], password, f)
  h.step('fresh_browser_logins_and_acl_controls')
  await start()
  const actors = await loginAll(), [, a, b] = actors
  owner = actors[0]
  assert.deepEqual(actors.map(actor => actor.id), initial.map(actor => actor.id))
  await zeroCalls('before_navigation')
  await fixture.filterControls(h, owner, a, f)
  facts.sqlite_schema = h.rows('PRAGMA user_version')[0].user_version
  assert.equal(facts.sqlite_schema, (await load('packages/knowledgeos-panel/lib/storage.js')).SCHEMA_VERSION)
  h.pass('ISOLATED_FIXTURE', { ordinary_learners: 2, handwritten_terms: 3, shared_source_sha256: digest(f.source.text) })

  testing = 'T02'
  await layout.checkNavigation(h, a, out)
  h.pass('FOUR_VISIBLE_ENTRIES', { observations: facts.navigation.map(n => ({ workspace: n.workspace, width: n.viewport[0],
    first_view_hit_targets: n.links.filter(link => link.in_first_view && link.center_hits_link).length })) })
  h.pass('RESPONSIVE_WORKSPACE_NAVIGATION', { tab_enter_activations: facts.navigation.reduce((n, x) => n + x.activations.length, 0),
    workspace_switches: facts.navigation.length, max_nav_depth: Math.max(...facts.navigation.map(n => n.nav_ancestor_depth)),
    max_sidebar_columns: Math.max(...facts.navigation.map(n => n.sidebar_columns)),
    max_horizontal_overflow: Math.max(...facts.navigation.map(n => n.document_width - n.page_width)) })
  facts.T02 = 'PASS'
  testing = 'T01'
  await records.checkRecords(h, a, b, f, kind === 'independent')
  assert.deepEqual(h.rows('PRAGMA foreign_key_check'), [])
  await zeroCalls('after_personal_state_roundtrip')
  assert.deepEqual([facts.browser_denied, facts.model_routes_blocked], [0, 0])
  facts.T01 = 'PASS'
  testing = undefined
  facts.phase = 'cleanup'
}

try { await run() } catch (error) { fail(error) }
finally {
  if (facts.failure && owner && boot) { try { await zeroCalls('at_failure') } catch (error) { fail(error) } }
  if (facts.failure && browser && host) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      if (!['/knowledgeos/library','/knowledgeos/today'].some(path => page.url() === host.base + path)) continue
      try {
        const file = 'failure-workspace.png', width = page.viewportSize().width
        const image = await page.screenshot({ path: join(out, file), clip: { x: 0, y: 0, width, height: 340 },
          animations: 'disabled', mask: [page.locator('#who,#list,#receipt,input')] })
        facts.screens.push({ file, sha256: digest(image), bytes: image.length })
      } catch { /* Preserve the original failure when the page has already closed. */ }
      break
    }
  }
  try { await browser?.close() } catch (error) { fail(error) }
  try { await stop() } catch (error) { fail(error) }
  facts.real_inference_requests = facts.boots.length && facts.boots.every(b => b.host_non_loopback_requests === 0) &&
    facts.model_observations.length && facts.model_observations.every(o => o.attempts === 0) ? 0 : null
  if (!facts.failure && facts.T01 === 'PASS' && facts.T02 === 'PASS') {
    facts.status = facts.P01 = 'PASS'
    facts.phase = 'complete'
  }
  writeFileSync(summary, JSON.stringify(facts, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ status: facts.status, T01: facts.T01, T02: facts.T02, P01: facts.P01, phase: facts.phase, summary }))
}
