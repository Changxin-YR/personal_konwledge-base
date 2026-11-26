import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { seed } from '../fnd006/independent/common.mjs'
import { AiService } from '../../packages/knowledgeos-panel/src/host/ai-service.ts'
import { AssetError } from '../../packages/knowledgeos-panel/src/host/asset-store.ts'
import { termSystem, readTermAnswer } from '../../packages/knowledgeos-panel/src/host/term-http.ts'
import { decodeText } from '../../packages/knowledgeos-panel/src/host/text-document.ts'
import * as lib from '../../packages/knowledgeos-panel/lib/test-support.js'
import { MIGRATION_V36_CHECKSUM } from '../../packages/knowledgeos-panel/lib/storage.js'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const answer = { status: 'explained', context: '当前位置编号', plain: '数到第几个元素', professional: '元素位置的整数编号',
  confusions: [{ term: '数据库索引', distinction: '数据库另有加速检索的数据结构' }], uncertainty: '' }
const profile = { provider: 'term-fixture', model: 'deepseek-term-fixture' }

test('text-only inference shares call accounting, checks before dispatch, and closes rejected streams', async () => {
  const inflight = new AbortController()
  let dispatched = 0, closed = 0, chunks
  const actor = { serviceId: 'synthetic', userId: 'synthetic', sessionId: 'synthetic' }
  const runner = new AiService({}, profile, {
    listProviders: () => [{ id: profile.provider }],
    listModels: async () => [{ id: profile.model }],
    resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'off' }] } }),
    async *stream(options) {
      dispatched++
      assert.deepEqual(options.tools, [])
      assert.equal(options.maxTokens, 1536)
      assert.equal(options.reasoningEffort, 'off')
      assert.equal(options.system, termSystem)
      try { yield* chunks }
      finally { closed++ }
    },
  })
  const invoke = (authorize = () => {}) => runner.explainSelection(actor, termSystem, '{}', inflight.signal, authorize)
  await assert.rejects(invoke(() => { throw new AssetError(404, 'SOURCE_NOT_FOUND') }), { code: 'SOURCE_NOT_FOUND' })
  assert.equal(dispatched, 0)
  chunks = [
    { type: 'text-delta', text: 'partial' },
    { type: 'block-end', block: { type: 'text', text: JSON.stringify(answer) } },
    { type: 'usage', usage: { inputTokens: 20, outputTokens: 12 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  assert.deepEqual((await invoke()).text, JSON.stringify(answer))
  assert.equal(runner.status().reported_input_tokens, 20)
  assert.equal(runner.status().reported_output_tokens, 12)
  chunks = [{ type: 'text-delta', text: 'x'.repeat(100_000) }, { type: 'finish', reason: { kind: 'stop' } }]
  await assert.rejects(invoke(), { code: 'MODEL_OUTPUT_INVALID' })
  await Promise.resolve()
  assert.equal(closed, 2)
  chunks = [
    { type: 'block-end', block: { type: 'text', text: JSON.stringify(answer) } },
    { type: 'block-end', block: { type: 'tool-call', id: 'forged', name: 'write', arguments: '{}' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  await assert.rejects(invoke(), { code: 'MODEL_OUTPUT_INVALID' })
  assert.equal(runner.status().attempts, 3)
  chunks = [{ type: 'finish', reason: { kind: 'max-tokens' } }]
  await assert.rejects(invoke(), { code: 'MODEL_OUTPUT_TRUNCATED' })
  runner.close()
})

test('model output contains no trusted source, reference or tool fields', () => {
  const { status: _status, ...valid } = answer
  assert.deepEqual(readTermAnswer(JSON.stringify(answer)), valid)
  assert.throws(() => readTermAnswer('{"status":"insufficient"}'), { code: 'TERM_SOURCE_INSUFFICIENT' })
  for (const value of [{ ...answer, source: 'https://example.invalid' }, { ...answer, confusions: [{ term: '假', distinction: '假', citation_id: 'invalid' }] },
    { ...answer, professional: 'x'.repeat(501) }, { ...answer, confusions: Array(3).fill(answer.confusions[0]) }])
    assert.throws(() => readTermAnswer(JSON.stringify(value)), { code: 'MODEL_OUTPUT_INVALID' })
  assert.throws(() => readTermAnswer(JSON.stringify(answer) + ' arbitrary suffix'), { code: 'MODEL_OUTPUT_INVALID' })
})

test('v36 rollback preserves v35 history and saved terms keep exact immutable UTF-16 selections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kos-know001-')), oldModule = join(dir, 'v35.mjs')
  writeFileSync(oldModule, execFileSync('git', ['show', '067de23:packages/knowledgeos-panel/lib/test-support.js']))
  const old = await import(pathToFileURL(oldModule).href)
  const { actor } = await seed(old, dir)
  let storage = new old.ProbeStorage({ dataDir: dir })
  const body = '🧪第一个索引与另一个索引不同，数组索引用于表示元素位置编号。'
  const bytes = Buffer.from(body), key = randomUUID()
  const published = storage.assets.publish(actor, { title: 'Term.md', key },
    { key, sha256: digest(bytes), byteLength: bytes.length }, { media: 'text/markdown', ...decodeText(bytes, 'text/markdown') }).receipt
  const start = body.lastIndexOf('索引')
  const target = { asset_id: published.id, version_id: published.version_id, ordinal: 1, start, end: start + 2, source_hash: digest(body) }
  const original = storage.citations.create(actor, target, randomUUID())
  storage.close()
  const db = new DatabaseSync(join(dir, 'knowledgeos.sqlite'), { readOnly: true })
  const data = table => db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()
  const oldLedger = data('schema_migrations'), oldCitations = data('citations')
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 35)
    storage = new lib.ProbeStorage({ dataDir: dir, failureAt: 'v36:after-schema' })
    assert.equal(storage.available, false); storage.close()
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 35)
    assert.deepEqual(data('schema_migrations'), oldLedger)
    assert.deepEqual(data('citations'), oldCitations)
    storage = new lib.ProbeStorage({ dataDir: dir })
    assert(storage.available)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 36)
    assert.equal(data('schema_migrations')[35].checksum, MIGRATION_V36_CHECKSUM)
    const selected = storage.terms.selection(actor, target)
    assert.equal(selected.source.quote, '索引')
    assert.equal(selected.source.quote_hash, original.data.quote_hash)
    assert.equal([...body.slice(0, start)].length + 1, start)
    assert.deepEqual(data('saved_terms'), [])
    assert.throws(() => storage.terms.selection(actor, { ...target, start: 1, end: 3 }), { code: 'INVALID_CITATION_RANGE' })
    assert.throws(() => storage.terms.selection(actor, { ...target, source_hash: 'a'.repeat(64) }), { code: 'CITATION_SOURCE_CHANGED' })
    const card = { explanation_id: randomUUID(), term: '索引', source: selected.source,
      explanation: readTermAnswer(JSON.stringify(answer)), ...profile }
    const saved = storage.terms.save(actor, card, '我的用法')
    assert.equal(saved.replayed, false)
    assert.deepEqual(storage.terms.save(actor, card, '我的用法'), { ...saved, replayed: true })
    assert.throws(() => storage.terms.save(actor, card, 'other'), { code: 'IDEMPOTENCY_CONFLICT' })
    assert.deepEqual(storage.terms.list(actor, target.asset_id, target.version_id), [saved.term])
    assert.deepEqual(data('citations'), oldCitations)
    assert.equal(data('saved_terms').length, 1)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { storage.close(); db.close() }
})
