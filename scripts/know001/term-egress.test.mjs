import { installTermNativeGate } from './term-native-gate.mjs'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { checkManifest, checkTermCompletion, completionURL, guardedTermFetch, route, sha } from './term-egress.mjs'

const now = 1760000000000
const candidate = 'a'.repeat(40)
const entryHash = 'b'.repeat(64)
const system = 'Use only the synthetic passage to explain the selected term.'
const database = '{"term":"索引","context":"数据库用B-tree索引查找记录。"}'
const array = '{"term":"索引","context":"数组索引0是第一个元素。"}'
const packet = context => ({
  model: route.model, stream: true, stream_options: { include_usage: true }, store: false,
  max_completion_tokens: 1536, thinking: { type: 'disabled' }, messages: [{ role: 'system', content: system }, { role: 'user', content: context }],
})

function supply() {
  const packets = [packet(database), packet(array)]
  const approval = { mock: true }
  const manifest = {
    unit: 'KNOW-001', candidate, entry_sha256: entryHash, route, fixture_sha256: '3'.repeat(64),
    approval_sha256: sha(JSON.stringify(approval)), system_sha256: sha(system),
    steps: packets.map((body, index) => ({
      stage: ['database-index', 'array-index'][index], user_sha256: sha(body.messages[1].content), wire_sha256: sha(JSON.stringify(body)),
    })),
  }
  return { packets, manifest, approval }
}

const permitFor = (manifest, step, expires = now + 5000) => ({
  unit: manifest.unit, candidate, entry_sha256: entryHash, manifest_sha256: sha(JSON.stringify(manifest)),
  step, stage: manifest.steps[step - 1].stage, expires_at: expires,
})

test('exact reviewed text-only completion validates and identifies its source step', () => {
  const { packets, manifest } = supply()
  checkManifest(manifest, candidate, entryHash)
  for (const step of [1, 2]) {
    const parsed = checkTermCompletion({
      url: completionURL, method: 'POST', body: JSON.stringify(packets[step - 1]),
      permit: permitFor(manifest, step), manifest, manifestHash: sha(JSON.stringify(manifest)), step, now,
    })
    assert.equal(parsed.stage, manifest.steps[step - 1].stage)
    assert.equal(parsed.output_token_cap, 1536)
  }
})

test('cannot replace a source passage, candidate, wire byte sequence or expiry', () => {
  const { packets, manifest } = supply()
  const permit = permitFor(manifest, 1)
  const args = { url: completionURL, method: 'POST', body: JSON.stringify(packets[0]), permit, manifest,
    manifestHash: sha(JSON.stringify(manifest)), step: 1, now }
  for (const mutation of [
    { body: JSON.stringify(packets[1]) },
    { body: ' ' + args.body },
    { url: completionURL + '?next=x' },
    { method: 'GET' },
    { permit: { ...permit, candidate: 'c'.repeat(40) } },
    { permit: { ...permit, expires_at: now } },
    { permit: { ...permit, expires_at: now + 30001 } },
    { step: 2 },
  ]) assert.throws(() => checkTermCompletion({ ...args, ...mutation }))
})

test('even a reviewed digest cannot authorize non-text tools, attachments, or oversized output', () => {
  for (const mutation of [
    { tools: [] },
    { tools: [{ name: 'never-allowed' }] },
    { tool_choice: 'none' },
    { max_completion_tokens: 1537 },
    { n: 2 },
    { store: true },
    { thinking: { type: 'enabled' } },
    { model: 'different-model' },
    { messages: [{ role: 'system', content: system }, { role: 'user', content: [{ type: 'image_url', image_url: { url: 'fixture' } }] }] },
  ]) {
    const { packets, manifest } = supply()
    const body = JSON.stringify({ ...packets[0], ...mutation })
    manifest.steps[0].wire_sha256 = sha(body)
    const args = { url: completionURL, method: 'POST', body, permit: permitFor(manifest, 1), manifest,
      manifestHash: sha(JSON.stringify(manifest)), step: 1, now }
    assert.throws(() => checkTermCompletion(args))
  }
})

test('emulated fetch admits exactly two one-use text requests and disallows redirects', async () => {
  const { packets, manifest, approval } = supply()
  const dir = mkdtempSync(join(tmpdir(), 'know001-egress-offline-'))
  const put = (name, data) => writeFileSync(join(dir, name), JSON.stringify(data))
  const manifestHash = sha(JSON.stringify(manifest))
  put('term-manifest.json', manifest)
  put('approved.json', approval)
  const fakeCalls = [], evidence = []
  const loopback = 'http://127.0.0.1:13375'
  const baseFetch = async (input, init) => {
    fakeCalls.push({ input, redirect: init.redirect })
    return new Response(null, { status: 204 })
  }
  const guard = guardedTermFetch(baseFetch, {
    dir, loopback, candidate, entryHash, manifestHash, live: true,
    verifyAuth: header => header === 'Bearer mock-unit-only',
    priceApproval: quote => assert.deepEqual(quote, approval), record: item => evidence.push(item),
  })
  const request = (step, header = 'Bearer mock-unit-only') => guard(completionURL, {
    method: 'POST', headers: { authorization: header }, body: JSON.stringify(packets[step - 1]), redirect: 'follow',
  })
  const allow = step => {
    put('term-armed-' + step, null)
    put('term-permit-' + step, permitFor(manifest, step, Date.now() + 5000))
  }
  await guard(loopback + '/probe')
  await assert.rejects(() => request(1), /KNOW001_ACCEPTANCE_EGRESS_DENIED/)
  allow(1)
  await assert.rejects(() => request(1, 'Bearer mismatch'), /KNOW001_ACCEPTANCE_EGRESS_DENIED/)
  await request(1)
  assert(existsSync(join(dir, 'term-consumed-1')))
  assert(!existsSync(join(dir, 'term-permit-1')))
  await assert.rejects(() => request(1), /KNOW001_ACCEPTANCE_EGRESS_DENIED/)
  allow(2)
  await assert.rejects(() => request(1), /KNOW001_ACCEPTANCE_EGRESS_DENIED/)
  await request(2)
  assert(existsSync(join(dir, 'term-consumed-2')))
  await assert.rejects(() => request(2), /KNOW001_ACCEPTANCE_EGRESS_DENIED/)
  await assert.rejects(() => guard('https://example.invalid/nope'), /KNOW001_ACCEPTANCE_EGRESS_DENIED/)
  assert.deepEqual(fakeCalls.map(item => item.redirect), ['error', 'error', 'error'])
  assert.deepEqual(evidence.map(item => item.stage), ['database-index', 'array-index'])
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'term-consumed-2'), 'utf8')).step, 2)
})


test('native hook arms in order only after the preceding permit is consumed', () => {
  const { manifest, approval } = supply()
  const dir = mkdtempSync(join(tmpdir(), 'know001-native-offline-'))
  const put = (name, data) => writeFileSync(join(dir, name), JSON.stringify(data))
  put('term-manifest.json', manifest)
  put('approved.json', approval)
  const manifestHash = sha(JSON.stringify(manifest))
  let hook
  const ctx = {
    on(event, handler) { assert.equal(event, 'llm-pi-ai/request-headers'); hook = handler },
    agentDefaultModel: { currentSelection: () => route },
    llm: { providerRetryPolicy: () => ({ maxRetries: 0 }) },
  }
  const identify = ({ provider, model }) => ({ provider, model })
  installTermNativeGate(ctx, {
    dir, mode: 'live', candidate, entryHash, manifestHash, verifiedRoute: () => route, ids: identify,
    dispatch(req, selected, quote, n, arm) {
      assert.deepEqual(req, route)
      assert.deepEqual(selected, route)
      assert.deepEqual(quote, approval)
      arm(n)
    },
  })
  const attempt = () => hook(route, null, () => 'native hook continued')
  assert.throws(attempt, /KNOW001_ACCEPTANCE_NATIVE_DENIED/)
  put('term-permit-1', permitFor(manifest, 1, Date.now() + 5000))
  assert.equal(attempt(), 'native hook continued')
  assert(existsSync(join(dir, 'term-armed-1')))
  put('term-permit-2', permitFor(manifest, 2, Date.now() + 5000))
  assert.throws(attempt, /KNOW001_ACCEPTANCE_NATIVE_DENIED/)
  put('term-consumed-1', permitFor(manifest, 1, Date.now() + 5000))
  assert.equal(attempt(), 'native hook continued')
  assert(existsSync(join(dir, 'term-armed-2')))
  assert.throws(attempt, /KNOW001_ACCEPTANCE_NATIVE_DENIED/)
})
