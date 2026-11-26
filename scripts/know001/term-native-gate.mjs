import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkManifest, route, sha } from './term-egress.mjs'

// Insert this gate in a disposable Host plugin only. Pass in the existing
// FND-005 pure dispatch and ids helpers. The verifiedRoute getter holds only
// redacted route metadata established by native projection.
export function installTermNativeGate(ctx, {
  dir, mode, candidate, entryHash, manifestHash, verifiedRoute, dispatch, ids,
}) {
  const path = name => join(dir, name)
  const approvedManifest = readFileSync(path('term-manifest.json'))
  assert.equal(sha(approvedManifest), manifestHash)
  const manifest = JSON.parse(approvedManifest.toString('utf8'))
  checkManifest(manifest, candidate, entryHash)
  let armedCount = 0
  ctx.on('llm-pi-ai/request-headers', (req, _headers, next) => {
    try {
      assert.equal(mode, 'live')
      assert.deepEqual(verifiedRoute(), route)
      assert.deepEqual(ids(ctx.agentDefaultModel.currentSelection()), ids(route))
      assert.equal(ctx.llm.providerRetryPolicy(route.provider).maxRetries, 0)
      const approvalBytes = readFileSync(path('approved.json'))
      assert.equal(sha(approvalBytes), manifest.approval_sha256)
      const approval = JSON.parse(approvalBytes.toString('utf8'))
      const step = armedCount + 1
      assert(step <= 2)
      if (step === 2) assert(existsSync(path('term-consumed-1')))
      const permit = JSON.parse(readFileSync(path('term-permit-' + step), 'utf8'))
      const now = Date.now()
      assert.equal(permit.candidate, candidate)
      assert.equal(permit.entry_sha256, entryHash)
      assert.equal(permit.manifest_sha256, manifestHash)
      assert.equal(permit.step, step)
      assert.equal(permit.stage, manifest.steps[step - 1].stage)
      assert(Number.isSafeInteger(permit.expires_at) && permit.expires_at > now && permit.expires_at <= now + 30000)
      dispatch(req, route, approval, step, index => {
        writeFileSync(path('term-armed-' + index), '', { flag: 'wx' })
      })
      armedCount++
    } catch {
      throw Error('KNOW001_ACCEPTANCE_NATIVE_DENIED')
    }
    return next()
  })
}
