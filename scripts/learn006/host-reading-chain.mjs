import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const usage = 'node host-reading-chain.mjs <frozen checkout> <full candidate SHA> <entry SHA256> <main|independent> [dry|live]'
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--help') { console.log(usage); process.exit(0) }
const [checkout, candidate, entry, kind, mode = 'dry'] = args
if (![4, 5].includes(args.length) || !/^[a-f0-9]{40}$/.test(candidate) || !/^[a-f0-9]{64}$/.test(entry) ||
    !['main', 'independent'].includes(kind) || !['dry', 'live'].includes(mode)) {
  console.error(usage); process.exit(2)
}

const digest = value => createHash('sha256').update(value).digest('hex')
const out = mkdtempSync(join(tmpdir(), 'knowledgeos-learn006-' + kind + '-'))
const facts = { unit_id: 'LEARN-006', candidate_sha: candidate, run_kind: kind, model_phase: mode, run_id: randomUUID(),
  status: 'NOT_RUN', T01: 'NOT_RUN', T02: 'NOT_RUN', P03: 'NOT_RUN', A10: 'NOT_RUN',
  local_chain: { T01: 'NOT_RUN', T02: 'NOT_RUN' }, checks: [], screens: [], boots: [], reader_returns: [], browser_denied: 0,
  phase: 'verify_frozen_inputs', node: process.version, platform: process.platform }
const runner = 'scripts/learn006/host-reading-chain.mjs'
const controller = 'scripts/know001/term-controller.mjs', input = 'scripts/know001/context-fixture.md'
const handles = ['host-support','host-support-reader','host-support-practice','host-support-access'].map(name => `scripts/learn006/${name}.mjs`)
let host, browser

function failed(error) {
  facts.status = 'FAIL'; process.exitCode = 1
  // Never emit Playwright call logs, raw assertion diffs, Host stderr, paths, headers or response bodies.
  const frame = String(error?.stack ?? '').split('\n').find(line => /^\s*at /.test(line) && /\/learn006\/host-[\w-]+\.mjs:\d+:\d+/.test(line))
  const source = frame?.match(/\/learn006\/(host-[\w-]+\.mjs:\d+):\d+/)?.[1]
  facts.failure ??= { phase: facts.phase, type: error?.name === 'AssertionError' ? 'assertion' : error?.name === 'TimeoutError' ? 'timeout' : 'runtime',
    ...(source && { source }), ...(Number.isInteger(error?.httpStatus) && { http_status: error.httpStatus }),
    ...(error?.businessCode && { code: error.businessCode }) }
}

async function boot() {
  const result = await host.start()
  assert.equal(new URL(result.entry).origin, host.base); assert(Number.isInteger(result.pid))
  facts.boots.push(result.pid)
  return result.entry
}

function modelProof() {
  const proof = host.proof()
  assert.equal(proof.mode, mode); assert.equal(proof.provider, 'tokease'); assert.equal(proof.model, 'deepseek-v4.1-flash-1017')
  assert.equal(proof.endpoint, 'https://tokease.cn/v1'); assert.equal(proof.real_inference_requests, mode === 'live' ? 2 : 0)
  assert.equal(proof.wire_calibrations, mode === 'dry' ? 2 : 0)
  assert.deepEqual(proof.requests.map(r => r.stage), ['database-index','array-index'])
  for (const row of proof.requests) { assert.equal(row.output_token_cap, 1536); assert.match(row.request_sha256, /^[a-f0-9]{64}$/) }
  const proofHash = mode === 'live' ? proof.manifest_sha256 : proof.calibration_sha256
  assert.match(proofHash, /^[a-f0-9]{64}$/)
  return { mode, provider: proof.provider, model: proof.model, real_inference_requests: proof.real_inference_requests,
    wire_calibrations: proof.wire_calibrations, [mode === 'live' ? 'manifest_sha256' : 'calibration_sha256']: proofHash,
    dispatches: proof.requests.map(row => ({ stage: row.stage, request_sha256: row.request_sha256 })) }
}

async function run() {
  const root = realpathSync(checkout)
  const git = (...command) => execFileSync('git', ['--no-replace-objects','--no-optional-locks', ...command], { cwd: root, stdio: ['ignore','pipe','pipe'] })
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
  assert.equal(realpathSync(fileURLToPath(import.meta.url)), realpathSync(join(root, runner)))
  const load = file => import(pathToFileURL(join(root, file)).href)
  const bindings = [runner, ...handles, 'scripts/learn006/host-expectations.md', controller, input, 'scripts/integrated-case-proof.mjs',
    'scripts/fnd003/harness.mjs', 'scripts/fnd004/harness.mjs', 'scripts/fnd005/candidate-live-binding.mjs', 'scripts/lib002/a07-isolated-host.mjs',
    ...['term-egress', 'term-profile-preload', 'term-profile-native', 'term-native-gate'].map(name => `scripts/know001/${name}.mjs`),
    ...['candidate-live-trace','candidate-live-guards'].map(name => `scripts/fnd005/${name}.mjs`)]
  const hashes = {}
  for (const file of bindings) {
    hashes[file] = digest(readFileSync(join(root, file)))
    assert.equal(hashes[file], digest(git('show', candidate + ':' + file)))
  }
  const { candidateFacts } = await load('scripts/integrated-case-proof.mjs')
  const { tree, source_tree, entry_sha256, build_sha256 } = candidateFacts(root, candidate)
  assert.equal(entry_sha256, entry)
  Object.assign(facts, { tree, source_tree, entry_sha256, build_sha256, runner_sha256: hashes[runner], helper_set_sha256: digest(JSON.stringify(hashes)),
    fixture_sha256: hashes[input], controller_sha256: hashes[controller] })
  const [{ harness, hash, prefix, action }, R, P, C] = await Promise.all(handles.map(load))
  const { createFixture } = await load(controller)
  const { entryCookie, api } = await load('scripts/fnd004/harness.mjs')
  const fixture = readFileSync(join(root, input))
  // Explicit CLI mode selects the existing controller. Its live manifest, new permits and pricing gates stay in force.
  process.env.KO_KNOW001_PHASE = mode
  facts.phase = 'boot_isolated_host'
  host = await createFixture({ root, candidate, entry, out, fixtureSha256: hashes[input] })
  assert.match(host.base, /^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/)
  const entryUrl = await boot(), port = Number(new URL(host.base).port)
  const bootstrap = await entryCookie(entryUrl), password = randomUUID()
  const tag = (kind === 'main' ? '主跑' : '独立') + '-' + facts.run_id.slice(0, 8)
  const names = ['author','reader-a','reader-b'].map(label => label + '-' + facts.run_id.slice(0, 8))
  for (const [i, name] of names.entries()) {
    const route = i === 0 ? '/auth/bootstrap' : '/auth/register'
    const response = await api(port, i === 0 ? bootstrap.cookie : '', 'POST', prefix + route,
      { login_name: name, display_name: ['合成作者','学习者甲','学习者乙'][i], password })
    assert.equal(response.status, 201)
  }
  const { chromium } = await import(pathToFileURL(host.playwright).href)
  // Chrome needs ordinary OS paths, never model settings or operator credentials.
  const chromeEnv = Object.fromEntries(Object.keys(process.env).filter(key =>
    /^(systemroot|windir|comspec|path|pathext|programfiles.*|localappdata|appdata|userprofile|home|temp|tmp|lang|display|xdg_runtime_dir)$/i.test(key)).map(key => [key, process.env[key]]))
  browser = await chromium.launch({ channel: 'chrome', headless: true, env: chromeEnv,
    args: ['--disable-background-networking','--disable-component-update','--disable-sync','--no-proxy-server'] })
  facts.chrome = browser.version()
  const h = harness({ host, browser, facts, out, password })
  facts.sqlite_schema = h.rows('PRAGMA user_version')[0].user_version
  const { SCHEMA_VERSION } = await load('packages/knowledgeos-panel/lib/storage.js')
  assert.equal(facts.sqlite_schema, SCHEMA_VERSION)
  h.step('fresh_accounts_independent_grants')
  const owner = await h.login(names[0]), A = await h.login(names[1]), B = await h.login(names[2])
  assert.equal(new Set([owner.id, A.id, B.id]).size, 3)
  const project = await h.api(owner, `${prefix}/projects`, { method: 'POST', data: { name: tag + ' 术语练习' }, status: 201 })
  await h.grant(owner, [A, B], 'project', project.id)
  for (const actor of [A, B]) {
    const roster = await h.api(actor, `${prefix}/project-tasks/projects/${project.id}/members`)
    assert.equal(roster.project.can_manage, false); assert(roster.project.members.some(row => row.id === actor.id && row.role === 'member'))
  }
  const asset = await h.publish(owner, fixture, 'term-context-fixture.md')
  const grantA = await h.grant(owner, [A], 'object', asset.id), grantB = await h.grant(owner, [B], 'object', asset.id)
  assert.notEqual(grantA, grantB)
  for (const actor of [A, B]) await h.original(actor, asset, hashes[input])
  assert.deepEqual(h.rows('SELECT id FROM saved_terms'), []); assert.deepEqual(h.rows('SELECT id FROM practice_sessions'), [])
  const [dbSource, arraySource] = R.sources(h, fixture, asset, kind)
  assert.notEqual(dbSource.spec.ordinal, arraySource.spec.ordinal)
  h.step('database_reader_explicit_save')
  const first = await R.saveContext(h, A, B, asset, dbSource)
  h.step('array_reader_explicit_save')
  const second = await R.saveContext(h, A, B, asset, arraySource)
  assert.notEqual(first.id, second.id); assert.notEqual(first.source.source_hash, second.source.source_hash)
  for (const field of ['context','plain','professional','confusions']) assert.notDeepEqual(first.explanation[field], second.explanation[field])
  facts.model = modelProof()
  const usage = await h.api(A, prefix + '/ai/status')
  assert.equal(usage.attempts, 2); assert.equal(usage.provider, facts.model.provider); assert.equal(usage.model, facts.model.model)
  facts.model_usage = { attempts: usage.attempts, reported_input_tokens: usage.reported_input_tokens, reported_output_tokens: usage.reported_output_tokens,
    known_estimated_usd: usage.known_estimated_usd, unknown_cost_calls: usage.unknown_cost_calls }
  const contextFacts = [first, second].map((term, index) => ({ stage: [dbSource, arraySource][index].stage,
    plain_and_definition_match_context: true, ordinal: term.source.ordinal, start: term.source.start, end: term.source.end,
    source_sha256: term.source.source_hash, confusions: term.explanation.confusions.length, explanation_sha256: hash(JSON.stringify(term.explanation)) }))
  facts.checks.push({ id: 'REAL_DUAL_CONTEXT_EXPLANATIONS', status: mode === 'live' ? 'PASS' : 'NOT_RUN', real_inference_requests: facts.model.real_inference_requests,
    wire_calibrations: facts.model.wire_calibrations, contexts: contextFacts })
  h.pass('DISTINCT_PINNED_SELECTIONS', { cards: contextFacts, fixed_version: hash(asset.version_id) })
  h.step('edit_reopen_and_peer_isolation')
  const edited = await R.editCard(h, A, B, asset, first, second, tag + ' 甲的个人补充')
  h.pass('EXPLICIT_PRIVATE_SAVES', { saved_counts: [0, 1, 2], peer_cards: 0, peer_detail_and_write_denied: true })
  h.step('publish_existing_questions_and_version_controls')
  const qs = await P.makeBank(h, owner, project, asset, fixture, dbSource, kind, tag)
  assert.deepEqual(await R.getTerm(h, A, edited.id), edited)
  assert.deepEqual(await R.getTerm(h, A, second.id), second)
  h.step('filtered_bank_and_rejected_creates')
  await P.checkCatalog(h, A, B, asset, edited, second, arraySource, qs, kind)
  await R.openReader(h, A, asset); await R.jump(h, A, asset, dbSource)
  await R.openReader(h, B, asset); await R.jump(h, B, asset, arraySource)
  const aPosition = await R.position(h, A, asset), bPosition = await R.position(h, B, asset)
  assert.equal(aPosition.ordinal, dbSource.spec.ordinal); assert.equal(bPosition.ordinal, arraySource.spec.ordinal)
  assert.notEqual(aPosition.ordinal, bPosition.ordinal)
  h.step('guided_and_ordinary_same_version')
  const state = await P.practice(h, A, B, asset, dbSource, edited, qs)
  h.step('practice_review_history_and_favorites')
  const restored = await C.returnsAndFavorites(h, A, B, asset, dbSource, arraySource, edited, second, qs, state, bPosition)
  h.pass('EDIT_REOPEN_AND_REVIEW', { saved_revision: first.revision, edited_revision: edited.revision, restored_revision: restored.revision,
    preserved_explanation_sha256: hash(JSON.stringify(restored.explanation)), review_session: hash(state.a.id), reviewed_card: hash(restored.id) })
  facts.local_chain.T01 = 'PASS'
  const durable = h.snapshot()
  h.step('mounted_reader_actual_single_grant_revocation')
  await C.revoke(h, owner, A, asset, restored, grantA)
  await C.checkRevoked(h, A, B, asset, dbSource, restored, second, qs, state, bPosition, 'before-boot')
  assert.deepEqual(h.snapshot(), durable)
  h.step('restart_same_database_with_fresh_browser_sessions')
  for (const context of browser.contexts()) await context.close()
  await host.stop(); await boot(); assert.notEqual(facts.boots[0], facts.boots[1])
  const freshA = await h.login(names[1]), freshB = await h.login(names[2])
  assert.equal(freshA.id, A.id); assert.equal(freshB.id, B.id)
  await C.checkRevoked(h, freshA, freshB, asset, dbSource, restored, second, qs, state, bPosition, 'after-boot')
  assert.deepEqual(h.snapshot(), durable)
  // Prove a surviving term origin can be read after a cold boot. A new invitation is explicit;
  // no storage is edited to restore access, and the previously revoked invitation is never reused.
  h.step('new_grant_reads_unchanged_history_after_restart')
  const freshOwner = await h.login(names[0])
  const newGrant = await h.grant(freshOwner, [freshA], 'object', asset.id)
  assert.notEqual(newGrant, grantA)
  assert.deepEqual(await R.getTerm(h, freshA, restored.id), restored)
  await P.verifyPersonal(h, freshA, freshB, qs, state)
  await P.termOrigin(h, freshA, (await h.api(freshA, action(state.a, 'questions'))).session, restored, dbSource)
  await R.openCard(h, freshA, asset, second)
  assert.equal(await freshA.page.locator('#term-professional').textContent(), second.explanation.professional)
  await P.returnToSource(h, freshA, arraySource, 'array-card-reviewed-after-boot', '#term-origin')
  await freshA.page.goto(h.base + '/knowledgeos/practice'); await P.historyButton(freshA, state.a).click()
  await P.returnToSource(h, freshA, dbSource, 'restored-origin-after-boot')
  const newPath = `${prefix}/invitations/${newGrant}`
  const receipt = await h.api(freshOwner, newPath)
  await h.api(freshOwner, newPath + '/revoke', { method: 'POST', data: { actor_id: freshOwner.id, expected_revision: receipt.revision } })
  await h.deny(freshA, action(state.a, 'questions')); await h.original(freshB, asset, asset.sha256)
  assert.deepEqual(h.snapshot(), durable)
  facts.sqlite = C.sqlProof(h, durable)
  assert.deepEqual(modelProof(), facts.model); assert.equal(facts.browser_denied, 0)
  h.pass('T02_revoke_restart_preserves_rows', { real_host_boots: facts.boots.length, ...facts.sqlite })
  facts.local_chain.T02 = 'PASS'
  if (mode === 'live') facts.T01 = facts.T02 = facts.P03 = facts.A10 = 'PASS'
  facts.phase = 'completed'; facts.status = 'PASS'
}

try { await run() } catch (error) { failed(error) }
finally {
  try { await browser?.close() } catch (error) { failed(error) }
  try { await host?.stop() } catch (error) { failed(error) }
  writeFileSync(join(out, 'summary.json'), JSON.stringify(facts, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ status: facts.status, model_phase: mode, run_kind: kind, report: join(out, 'summary.json') }))
}
