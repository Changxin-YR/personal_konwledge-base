import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

export const name = 'know001-local-text-adapter'
export const inject = ['llm']
export const provider = 'knowledgeos-know001-fixture'
export const model = 'deepseek-know001-controlled-fixture'
export const sentinel = 'CONTROLLED_KNOW001_REVOKED_RESULT'
const contents = {
  database: {
    context: '数据库索引用于检索记录的数据结构。',
    plain: '数据库查找记录时，利用索引可以少扫描无关数据。',
    professional: '数据库索引是按键值组织记录位置的辅助数据结构。',
    confusions: [{ term: '数组下标', distinction: '数组下标是元素的位置编号。' }],
    uncertainty: '',
  },
  array: {
    context: '数组索引表示访问元素的位置编号。',
    plain: '数组从 0 数起，索引 0 是第一个元素的位置。',
    professional: '数组索引是由整数表示的元素位置或下标。',
    confusions: [{ term: '数据库索引', distinction: '数据库索引用于检索记录，而数组索引定位元素。' }],
    uncertainty: '',
  },
}

export function apply(ctx) {
  assert(process.env.KO_TERMS_CONTROL)
  const dir = process.env.KO_TERMS_CONTROL
  const path = name => join(dir, name)
  const record = event => appendFileSync(path('adapter.jsonl'), JSON.stringify(event) + '\n')
  assert(LlmAdapter)
  class OfflineAdapter extends LlmAdapter {
    constructor() { super('KNOW-001 deterministic local fixture') }
    async listModels(id) { return [{ provider: id, id: model, name: 'KnowledgeOS local fixture' }] }
    async *stream(options) {
      assert.equal(options.provider, provider)
      assert.equal(options.model, model)
      assert.equal(options.maxTokens, 512)
      assert.deepEqual(options.tools, [])
      assert.equal(options.messages.length, 1)
      const payload = options.messages[0].content[0].text
      const input = JSON.parse(payload)
      assert.deepEqual(Object.keys(input).sort(), ['after', 'before', 'term'])
      assert.equal(input.term, '索引')
      const excerpt = input.before + input.after
      const kind = excerpt.includes('B-tree') ? 'database' : excerpt.includes('从 0 计数') ? 'array' : undefined
      assert(kind)
      const next = path('next-case.json')
      const control = existsSync(next) ? JSON.parse(readFileSync(next, 'utf8')) : null
      if (control) {
        assert.match(control.id, /^[a-f0-9-]{36}$/)
        renameSync(next, path('consumed-' + control.id + '.json'))
      }
      const mode = control?.mode ?? 'normal', id = control?.id ?? null
      const payloadHash = createHash('sha256').update(payload).digest('hex')
      record({ event: 'fixture-dispatch', id, mode, kind, payload_sha256: payloadHash, tools: 0 })
      try {
        let text
        if (mode === 'malformed') text = '{"status":'
        else if (mode === 'malicious-reference') text = JSON.stringify({ status: 'explained', ...contents[kind], source: 'https://example.invalid/not-a-citation' })
        else if (mode === 'insufficient') text = '{"status":"insufficient"}'
        else if (mode === 'oversized') text = 'x'.repeat(97_000)
        else text = JSON.stringify({ status: 'explained', ...contents[kind], ...(mode === 'hold' ? { uncertainty: sentinel } : {}) })
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: text.slice(0, 8) }
        if (mode === 'hold') {
          record({ event: 'stream-held', id })
          const deadline = Date.now() + 20_000
          while (!existsSync(path('release-' + id))) {
            assert(Date.now() < deadline)
            await pause(25, undefined, { signal: options.signal })
          }
          record({ event: 'stream-released', id })
        }
        yield { type: 'block-end', index: 0, block: { type: 'text', text } }
        yield { type: 'usage', usage: { inputTokens: 33, outputTokens: 24, totalTokens: 57 } }
        yield { type: 'finish', reason: { kind: mode === 'truncated' ? 'max-tokens' : 'stop' } }
      } finally {
        record({ event: 'stream-closed', id, aborted: options.signal?.aborted ?? false })
      }
    }
  }
  ctx.llm.registerAdapter([provider], new OfflineAdapter())
}

// Await only the pinned DSH runtime import before the fixture is mounted.
const { LlmAdapter } = process.env.KO_TERMS_CONTROL
  ? await import(pathToFileURL(join(process.cwd(), 'packages/llm/llm/src/index.ts')).href)
  : { LlmAdapter: undefined }
