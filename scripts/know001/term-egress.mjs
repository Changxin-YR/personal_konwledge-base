import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

export const route = Object.freeze({ provider: 'tokease', model: 'deepseek-v4.1-flash-1017', endpoint: 'https://tokease.cn/v1' })
export const completionURL = route.endpoint + '/chat/completions'
export const sha = value => createHash('sha256').update(value).digest('hex')
const digest = /^[0-9a-f]{64}$/
const commit = /^[0-9a-f]{40}$/
const stages = ['database-index', 'array-index']
const fields = new Set(['model', 'messages', 'stream', 'stream_options', 'store', 'max_tokens', 'max_completion_tokens', 'n', 'thinking'])

function exact(object, keys) {
  assert(object && typeof object === 'object' && !Array.isArray(object))
  assert.deepEqual(Object.keys(object).sort(), [...keys].sort())
}

function textOf(content) {
  if (typeof content === 'string') return content
  assert(Array.isArray(content) && content.length === 1)
  const [part] = content
  exact(part, ['type', 'text'])
  assert(part.type === 'text' && typeof part.text === 'string')
  return part.text
}

export function checkManifest(manifest, candidate, entryHash) {
  exact(manifest, ['unit', 'candidate', 'entry_sha256', 'route', 'fixture_sha256', 'approval_sha256', 'system_sha256', 'steps'])
  assert.equal(manifest.unit, 'KNOW-001')
  assert.match(candidate, commit)
  assert.match(entryHash, digest)
  assert.equal(manifest.candidate, candidate)
  assert.equal(manifest.entry_sha256, entryHash)
  assert.deepEqual(manifest.route, route)
  for (const key of ['fixture_sha256', 'approval_sha256', 'system_sha256']) assert.match(manifest[key], digest)
  assert(Array.isArray(manifest.steps) && manifest.steps.length === stages.length)
  for (const [i, step] of manifest.steps.entries()) {
    exact(step, ['stage', 'user_sha256', 'wire_sha256'])
    assert.equal(step.stage, stages[i])
    assert.match(step.user_sha256, digest)
    assert.match(step.wire_sha256, digest)
  }
  assert.notEqual(manifest.steps[0].user_sha256, manifest.steps[1].user_sha256)
  assert.notEqual(manifest.steps[0].wire_sha256, manifest.steps[1].wire_sha256)
}

export function checkTermCompletion({ url, method, body, permit, manifest, manifestHash, step, now = Date.now() }) {
  assert.equal(url, completionURL)
  assert.equal(method, 'POST')
  assert(step === 1 || step === 2)
  exact(permit, ['unit', 'candidate', 'entry_sha256', 'manifest_sha256', 'step', 'stage', 'expires_at'])
  assert.equal(permit.unit, manifest.unit)
  assert.equal(permit.candidate, manifest.candidate)
  assert.equal(permit.entry_sha256, manifest.entry_sha256)
  assert.equal(permit.manifest_sha256, manifestHash)
  assert.equal(permit.step, step)
  const expected = manifest.steps[step - 1]
  assert.equal(permit.stage, expected.stage)
  assert(Number.isSafeInteger(permit.expires_at) && permit.expires_at > now && permit.expires_at <= now + 30000)
  assert(typeof body === 'string' && Buffer.byteLength(body, 'utf8') <= 8192)
  assert.equal(sha(body), expected.wire_sha256)
  const packet = JSON.parse(body)
  assert(packet && typeof packet === 'object' && !Array.isArray(packet))
  assert(Object.keys(packet).every(key => fields.has(key)), 'unexpected payload field, including tools')
  assert.equal(packet.model, route.model)
  assert.equal(packet.stream, true)
  if (packet.n !== undefined) assert.equal(packet.n, 1)
  if (packet.stream_options !== undefined) assert.deepEqual(packet.stream_options, { include_usage: true })
  if (packet.store !== undefined) assert.equal(packet.store, false)
  if (packet.thinking !== undefined) assert.deepEqual(packet.thinking, { type: 'disabled' })
  const limits = [packet.max_tokens, packet.max_completion_tokens].filter(value => value !== undefined)
  assert(limits.length && limits.every(value => Number.isInteger(value) && value >= 1 && value <= 512))
  assert(Array.isArray(packet.messages) && packet.messages.length === 2)
  const [system, user] = packet.messages
  exact(system, ['role', 'content'])
  exact(user, ['role', 'content'])
  assert(system.role === 'system' || system.role === 'developer')
  assert.equal(user.role, 'user')
  assert.equal(sha(textOf(system.content)), manifest.system_sha256)
  assert.equal(sha(textOf(user.content)), expected.user_sha256)
  return { stage: expected.stage, request_sha256: expected.wire_sha256, output_token_cap: Math.min(...limits) }
}

// Call only from a reviewed test Host preload. It does not install a global
// hook, read credentials, or infer approval when imported.
export function guardedTermFetch(baseFetch, { dir, loopback, candidate, entryHash, manifestHash, verifyAuth, priceApproval, live, record }) {
  assert(/^http:\/\/127\.0\.0\.1:[1-9][0-9]+$/.test(loopback))
  assert.equal(typeof verifyAuth, 'function')
  assert.equal(typeof priceApproval, 'function')
  assert.equal(typeof record, 'function')
  assert.match(manifestHash, digest)
  const path = name => join(dir, name)
  const manifestBytes = readFileSync(path('term-manifest.json'))
  assert.equal(sha(manifestBytes), manifestHash)
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  checkManifest(manifest, candidate, entryHash)
  let dispatches = 0
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.origin === loopback && !url.username && !url.password) {
      return baseFetch(input, { ...init, redirect: 'error' })
    }
    let evidence
    try {
      assert(live === true && dispatches < 2)
      assert(!url.username && !url.password)
      const step = dispatches + 1
      const armed = path('term-armed-' + step)
      const permitPath = path('term-permit-' + step)
      const consumed = path('term-consumed-' + step)
      assert(existsSync(armed) && !existsSync(consumed))
      const header = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization')
      assert(verifyAuth(header) === true)
      const approvalBytes = readFileSync(path('approved.json'))
      assert.equal(sha(approvalBytes), manifest.approval_sha256)
      const approval = JSON.parse(approvalBytes.toString('utf8'))
      priceApproval(approval, route)
      const permit = JSON.parse(readFileSync(permitPath, 'utf8'))
      evidence = checkTermCompletion({ url: url.href, method: init.method ?? (input instanceof Request ? input.method : 'GET'),
        body: init.body, permit, manifest, manifestHash, step })
      renameSync(permitPath, consumed)
      dispatches++
    } catch {
      throw Error('KNOW001_ACCEPTANCE_EGRESS_DENIED')
    }
    record(evidence)
    return baseFetch(input, { ...init, redirect: 'error' })
  }
}
