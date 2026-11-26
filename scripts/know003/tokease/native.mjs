import assert from 'node:assert/strict'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cap, dryAlias, liveAlias, passPermit, route, sha } from './guard.mjs'

export const name = 'know003-tokease-acceptance-native'
export const inject = ['llm', 'settings', 'credentials', 'agentDefaultModel']
const { checkedRoute, dispatch, endpoint, ids } = await import(pathToFileURL(process.env.KO_ONT_GUARDS).href)
const dir = process.env.KO_ONT_DIR
const path = name => join(dir, name)
const manifestBytes = readFileSync(path('manifest.json'))
const manifest = JSON.parse(manifestBytes.toString('utf8'))
const manifestHash = process.env.KO_ONT_MANIFEST_SHA256
assert.equal(sha(manifestBytes), manifestHash)

async function projection(ctx, mode) {
  const selected = ids(ctx.agentDefaultModel.currentSelection())
  assert.deepEqual(selected, ids(route))
  const entries = ctx.llm.listConfigurableProviders().filter(row => row.provider === route.provider)
  assert.equal(entries.length, 1)
  assert(!entries[0].error)
  const section = ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === entries[0].settingsNs)
  const profile = section?.value?.providers?.[selected.provider]
  const alias = mode === 'live' ? liveAlias : dryAlias
  assert(profile?.api === 'openai-completions' && profile.apiKeyEnv === alias)
  const key = await ctx.credentials.describe(alias)
  assert(key.configured && key.source === 'env')
  const modelInfo = await ctx.llm.resolveModelInfo(selected.provider, selected.model)
  assert.equal(modelInfo.defaultMaxTokens, cap)
  assert(modelInfo.reasoning?.efforts.some(effort => effort.id === 'off'))
  const pinned = checkedRoute(selected, await ctx.llm.listModels(selected.provider), entries[0], profile, true,
    ctx.llm.providerRetryPolicy(selected.provider))
  assert.deepEqual(pinned, route)
  return pinned
}

export function apply(ctx) {
  const mode = process.env.KO_ONT_MODE
  assert(['dry', 'live'].includes(mode))
  let head, armed = false
  ctx.on('llm-pi-ai/request-headers', (req, _headers, next) => {
    try {
      assert(!armed)
      assert.deepEqual(head, route)
      assert.deepEqual(ids(ctx.agentDefaultModel.currentSelection()), ids(route))
      assert.equal(ctx.llm.providerRetryPolicy(route.provider).maxRetries, 0)
      const permit = JSON.parse(readFileSync(path('permit.json'), 'utf8'))
      passPermit(permit, manifest, manifestHash)
      if (mode === 'live') {
        const approval = readFileSync(path('approved.json'))
        assert.equal(sha(approval), manifest.approval_sha256)
        dispatch(req, route, JSON.parse(approval.toString('utf8')), 1, () => writeFileSync(path('native-armed'), '', { flag: 'wx' }))
      } else {
        assert.deepEqual(ids(req), ids(route))
        assert.equal(endpoint(req.baseURL), route.endpoint)
        assert(!req.sessionId && !req.purpose)
        writeFileSync(path('native-armed'), '', { flag: 'wx' })
      }
      armed = true
    } catch {
      writeFileSync(path('native-denial'), 'DENIED_BEFORE_DISPATCH', { flag: 'a' })
      throw Error('KNOW003_NATIVE_DENIED')
    }
    return next()
  })
  ctx.effect(() => {
    let disposed = false
    const run = process.env.KO_RUN
    void (async () => {
      for (let index = 0; index < 120 && !disposed; index++) {
        try {
          const value = await projection(ctx, mode)
          if (disposed) return
          const temp = join(run, 'route.tmp'), ready = join(run, 'route.json')
          assert(!existsSync(ready))
          writeFileSync(temp, JSON.stringify({ pid: process.pid, ...value }), { flag: 'wx' })
          renameSync(temp, ready)
          head = value
          return
        } catch {
          await new Promise(ok => setTimeout(ok, 250))
        }
      }
    })()
    return () => { disposed = true; head = undefined }
  })
}
