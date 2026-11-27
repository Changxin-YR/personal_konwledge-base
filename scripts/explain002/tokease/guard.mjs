import assert from 'node:assert/strict'
import { lstatSync, readFileSync } from 'node:fs'
import { priceApproval } from '../../fnd005/candidate-live-guards.mjs'
import { cap, checkPacket as checkSingleTurn, commit, digest, only, route, sha } from '../../learn002/tokease/guard.mjs'

export { cap, commit, digest, only, route, sha }
export const unit = 'EXPLAIN-002'
export const stage = 'valid-module-explanation'
export const completion = route.endpoint + '/chat/completions'
export const dryAlias = 'KOS_EXPLAIN002_DRY_SENTINEL'
export const fixtureKey = 'EXPLAIN002_DRY_STATIC_PUBLIC_SENTINEL'
export const liveAlias = 'KOS_TOKEASE_ACCEPTANCE_KEY'
export const roles = ['main', 'independent']
export const jsonBytes = value => JSON.stringify(value, null, 2) + '\n'
export function exactFile(file) {
  const stat = lstatSync(file)
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 32000, 'expected a bounded regular evidence file')
  return readFileSync(file)
}

// LEARN-002's approved single-turn envelope already requires two exact text hashes,
// a disabled thinking mode, bounded completion, SSE and zero tools.
export function checkPacket(body, manifest, live) {
  return { ...checkSingleTurn(body, manifest, live), stage }
}
export function checkPrice(quote, now = Date.now()) {
  only(quote, ['provider', 'model', 'endpoint', 'currency', 'input', 'output', 'billing_group', 'reviewed_at'])
  priceApproval(quote, route, now)
  assert(quote.endpoint === route.endpoint && quote.billing_group === 'default')
  assert(quote.input <= 1 && quote.output <= 3, 'price exceeds reviewed LEARN-002 default-group ceiling')
}
export function checkManifest(value, fixed, extra = []) {
  only(value, [...Object.keys(fixed), ...extra])
  for (const key of Object.keys(fixed)) assert.deepEqual(value[key], fixed[key])
  assert.equal(value.unit, unit)
  assert.equal(value.stage, stage)
  assert.deepEqual(value.route, route)
  assert.match(value.candidate, commit)
  for (const key of Object.keys(value).filter(k => k.endsWith('_sha256'))) assert.match(value[key], digest)
  return value
}
export function passPermit(p, manifest, manifestHash, now = Date.now()) {
  only(p, ['unit', 'candidate', 'entry_sha256', 'manifest_sha256', 'stage', 'expires_at'])
  assert(p.unit === unit && p.stage === stage && p.candidate === manifest.candidate && p.entry_sha256 === manifest.entry_sha256)
  assert(p.manifest_sha256 === manifestHash && Number.isSafeInteger(p.expires_at) && p.expires_at > now && p.expires_at <= now + 30000)
}
