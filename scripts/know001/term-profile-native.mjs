import assert from 'node:assert/strict'
import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { installTermNativeGate } from './term-native-gate.mjs'
import { route } from './term-egress.mjs'

export const name = 'know001-term-native-acceptance'
export const inject = ['llm', 'settings', 'credentials', 'agentDefaultModel']
const { checkedRoute, dispatch, ids } = await import(pathToFileURL(process.env.KO_TERM_FND_GUARDS).href)

async function projection(ctx) {
  const selected = ids(ctx.agentDefaultModel.currentSelection())
  assert.deepEqual(selected, ids(route))
  const entries = ctx.llm.listConfigurableProviders().filter(row => row.provider === selected.provider)
  assert.equal(entries.length, 1)
  const section = ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === entries[0].settingsNs)
  const profile = section?.value?.providers?.[selected.provider]
  assert(profile && !entries[0].error)
  const alias = process.env.KO_TERM_PHASE === 'live' ? 'KOS_TOKEASE_ACCEPTANCE_KEY' : 'KOS_KNOW001_DRY_SENTINEL'
  assert(profile.api === 'openai-completions' && profile.apiKeyEnv === alias)
  const descriptor = await ctx.credentials.describe(alias)
  assert(descriptor.configured && descriptor.source === 'env')
  const pinned = checkedRoute(selected, await ctx.llm.listModels(selected.provider), entries[0], profile, true,
    ctx.llm.providerRetryPolicy(selected.provider))
  assert.deepEqual(pinned, route)
  return pinned
}

export function apply(ctx) {
  const mode = process.env.KO_TERM_PHASE
  const dir = process.env.KO_TERM_DIR
  const run = process.env.KO_RUN
  let head
  if (mode === 'live') {
    installTermNativeGate(ctx, {
      dir, mode, candidate: process.env.KO_BOUND_CANDIDATE, entryHash: process.env.KO_HASH,
      manifestHash: process.env.KO_TERM_MANIFEST_SHA256, verifiedRoute: () => head, dispatch, ids,
    })
  } else {
    ctx.on('llm-pi-ai/request-headers', (req, _headers, next) => {
      assert.equal(mode, 'dry')
      assert.deepEqual(head, route)
      assert.deepEqual(ids(req), ids(route))
      assert.equal(req.baseURL.replace(/\/$/, ''), route.endpoint)
      assert(!req.sessionId && !req.purpose)
      assert.equal(ctx.llm.providerRetryPolicy(route.provider).maxRetries, 0)
      return next()
    })
  }
  ctx.effect(() => {
    let disposed = false
    const runProjection = async () => {
      for (let index = 0; index < 120 && !disposed; index++) {
        try {
          const selected = await projection(ctx)
          if (disposed) return
          head = selected
          const tmp = join(run, 'route.tmp'), final = join(run, 'route.json')
          assert(!existsSync(final))
          writeFileSync(tmp, JSON.stringify({ pid: process.pid, ...selected }), { flag: 'wx' })
          renameSync(tmp, final)
          return
        } catch {
          await new Promise(resolve => setTimeout(resolve, 250))
        }
      }
    }
    void runProjection()
    return () => { disposed = true; head = undefined }
  })
}
