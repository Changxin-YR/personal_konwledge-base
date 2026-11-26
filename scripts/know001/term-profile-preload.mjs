import assert from 'node:assert/strict'
import { appendFileSync, existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkManifest, checkTermCompletion, completionURL, guardedTermFetch, route, sha } from './term-egress.mjs'

const { KO_TERM_DIR: dir, KO_TEST_LOOPBACK: loopback, KO_BOUND_CANDIDATE: candidate, KO_HASH: entryHash, KO_TERM_PHASE: mode } = process.env
assert(dir && /^[0-9a-f]{40}$/.test(candidate) && /^[0-9a-f]{64}$/.test(entryHash))
assert(/^http:\/\/127\.0\.0\.1:[1-9][0-9]+$/.test(loopback))
assert(['dry', 'live'].includes(mode))
const baseFetch = globalThis.fetch
const append = (file, data) => appendFileSync(join(dir, file), JSON.stringify(data) + '\n')
const records = file => {
  const name = join(dir, file)
  return existsSync(name) ? readFileSync(name, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
}

if (mode === 'live') {
  // The launcher only supplies this value after its explicit live activation.
  const credential = process.env.KOS_TOKEASE_ACCEPTANCE_KEY
  assert(credential?.trim())
  const guardPath = process.env.KO_TERM_FND_GUARDS
  assert(guardPath)
  const { priceApproval } = await import(pathToFileURL(guardPath).href)
  const guarded = guardedTermFetch(baseFetch, {
    dir, loopback, candidate, entryHash, manifestHash: process.env.KO_TERM_MANIFEST_SHA256,
    verifyAuth: header => header === 'Bearer ' + credential,
    priceApproval, live: true, record: event => append('term-dispatches.jsonl', event),
  })
  globalThis.fetch = async (input, init) => {
    try { return await guarded(input, init) }
    catch (error) {
      if (error?.message === 'KNOW001_ACCEPTANCE_EGRESS_DENIED') append('term-denials.jsonl', { scope: 'live', result: 'DENIED_BEFORE_DISPATCH' })
      throw error
    }
  }
} else {
  const dry = JSON.parse(readFileSync(join(dir, 'expected-dry.json'), 'utf8'))
  const replies = [
    { status: 'explained', context: '本段的数据库索引用 B-tree 查找记录并减少扫描。',
      plain: '用辅助结构减少扫描，帮助数据库查询。', professional: '按键值定位记录的数据结构。',
      confusions: [{ term: '数组索引', distinction: '数组索引用下标选元素。' }], uncertainty: '' },
    { status: 'explained', context: '数组索引是从 0 计数的位置编号，0 指第一个元素。',
      plain: '像按位置编号找到第一个元素。', professional: '用于寻址数组元素的整数下标。',
      confusions: [{ term: '数据库索引', distinction: '数据库索引用结构加快查找。' }], uncertainty: '' },
  ]
  function fixtureResponse(answer) {
    const fields = { id: 'know001-offline', created: 1, object: 'chat.completion.chunk', model: route.model }
    const part = (delta, finish_reason) => ({ ...fields, choices: [{ index: 0, delta, finish_reason }] })
    const frames = [
      part({ role: 'assistant', content: JSON.stringify(answer) }, null),
      part({}, 'stop'),
      { ...fields, choices: [], usage: { prompt_tokens: 31, completion_tokens: 29, total_tokens: 60 } },
    ]
    return new Response(frames.map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('') + 'data: [DONE]\n\n', {
      status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    })
  }
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.origin === loopback && !url.username && !url.password) return baseFetch(input, { ...init, redirect: 'error' })
    try {
      assert.equal(url.href, completionURL)
      assert.equal(init.method, 'POST')
      const previous = records('term-calibrations.jsonl')
      assert(previous.length < 2)
      const index = previous.length
      const arm = join(dir, 'term-dry-armed-' + (index + 1))
      const raw = JSON.parse(readFileSync(arm, 'utf8'))
      assert.deepEqual(raw, { stage: dry.steps[index].stage })
      const manifest = { ...dry, approval_sha256: '0'.repeat(64), steps: dry.steps.map((step, i) => ({
        ...step, wire_sha256: i === index ? sha(init.body) : previous[i]?.request_sha256 ?? '0'.repeat(64),
      })) }
      checkManifest(manifest, candidate, entryHash)
      const manifestHash = sha(JSON.stringify(manifest))
      const permit = { unit: 'KNOW-001', candidate, entry_sha256: entryHash, manifest_sha256: manifestHash,
        step: index + 1, stage: manifest.steps[index].stage, expires_at: Date.now() + 5000 }
      const sample = checkTermCompletion({
        url: url.href, method: init.method, body: init.body, permit, manifest, manifestHash, step: index + 1,
      })
      renameSync(arm, join(dir, 'term-dry-consumed-' + (index + 1)))
      append('term-calibrations.jsonl', { ...sample, user_sha256: manifest.steps[index].user_sha256 })
      return fixtureResponse(replies[index])
    } catch {
      append('term-denials.jsonl', { scope: 'dry', result: 'DENIED_BEFORE_DISPATCH' })
      throw Error('KNOW001_DRY_EGRESS_DENIED')
    }
  }
}
