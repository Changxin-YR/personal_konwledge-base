import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Script } from 'node:vm'
import {
  groundedModuleExplanation,
  moduleLineRange,
  moduleSourceRequests,
  moduleSourceWindow,
} from '../../packages/knowledgeos-panel/src/domain/module-explanation.ts'
import { buildRepositoryHtml } from '../../packages/knowledgeos-panel/src/host/repository-page.ts'

const sourceA = {
  path: 'src/entry.ts', commit: 'a'.repeat(40), blob_sha: 'b'.repeat(40),
  ...moduleSourceWindow('export function run() {\n  return service.save();\n}\n', { path: 'src/entry.ts', start_line: 1, end_line: 3 }),
}
const sourceB = {
  path: 'src/service.ts', commit: 'a'.repeat(40), blob_sha: 'c'.repeat(40),
  ...moduleSourceWindow('export function save() {\n  return store.write();\n}\n', { path: 'src/service.ts', start_line: 1, end_line: 3 }),
}
const sourceC = {
  path: 'src/store.ts', commit: 'a'.repeat(40), blob_sha: 'd'.repeat(40),
  ...moduleSourceWindow('export function write() {\n  throw new Error("disk");\n}\n', { path: 'src/store.ts', start_line: 1, end_line: 3 }),
}

function answer(overrides = {}) {
  return {
    facts: [
      { path: 'src/entry.ts', start_line: 1, end_line: 2, quote: 'export function run() {\n  return service.save();' },
      { path: 'src/service.ts', start_line: 1, end_line: 2, quote: 'export function save() {\n  return store.write();' },
      { path: 'src/store.ts', start_line: 1, end_line: 2, quote: 'export function write() {\n  throw new Error("disk");' },
    ],
    summary: [{ text: '入口调用服务，服务调用持久化边界。', facts: [1, 2] }],
    relations: [{ text: 'run 到 save 再到 write 形成实际调用链。', facts: [1, 2, 3] }],
    flows: [{ name: '异常流程', steps: [{ text: '持久化边界可能抛出磁盘错误。', facts: [3] }] }],
    tradeoffs: [{ text: '边界通过独立函数隔离持久化细节。', facts: [2, 3] }],
    limits: ['当前片段没有展示调用者和恢复策略。'],
    ...overrides,
  }
}

test('module source windows preserve absolute lines and enforce bounded ranges', () => {
  assert.deepEqual(moduleLineRange(1, 160), { start_line: 1, end_line: 160 })
  assert.throws(() => moduleLineRange(1, 161), { code: 'MODULE_RANGE_TOO_LARGE' })
  assert.throws(() => moduleSourceRequests([{ path: 'a.ts', start_line: 1, end_line: 1 }]), { code: 'MODULE_SOURCES_INVALID' })
  assert.throws(() => moduleSourceRequests([{ path: 'a.ts', start_line: 1, end_line: 1 }, { path: 'a.ts', start_line: 2, end_line: 2 }]), { code: 'MODULE_SOURCES_INVALID' })
  assert.deepEqual(moduleSourceRequests([{ path: 'a.ts', start_line: 2, end_line: 3 }, { path: 'b.ts', start_line: 1, end_line: 4 }]), [
    { path: 'a.ts', start_line: 2, end_line: 3 }, { path: 'b.ts', start_line: 1, end_line: 4 },
  ])
  assert.throws(() => moduleSourceWindow('x\ny', { path: 'a.ts', start_line: 1, end_line: 3 }), { code: 'MODULE_RANGE_INVALID' })
})

test('grounded module answers require exact cross-file facts and references', () => {
  const sources = [sourceA, sourceB, sourceC]
  assert.deepEqual(groundedModuleExplanation(JSON.stringify(answer()), sources), answer())
  assert.throws(() => groundedModuleExplanation(JSON.stringify(answer({ facts: [{ path: 'src/entry.ts', start_line: 1, end_line: 1, quote: 'forged' }] })), sources), { code: 'MODEL_OUTPUT_INVALID' })
  assert.throws(() => groundedModuleExplanation(JSON.stringify(answer({ relations: [{ text: '猜测', facts: [9] }] })), sources), { code: 'MODEL_OUTPUT_INVALID' })
  assert.throws(() => groundedModuleExplanation(JSON.stringify({ ...answer(), unexpected: true }), sources), { code: 'MODEL_OUTPUT_INVALID' })
  assert.deepEqual(groundedModuleExplanation(JSON.stringify({ facts: [], summary: [], relations: [], flows: [], tradeoffs: [], limits: ['缺少异常实现。'] }), sources).limits, ['缺少异常实现。'])
})

test('repository page includes module controls and parses its generated browser script', () => {
  const html = buildRepositoryHtml('nonce')
  assert.match(html, /module-explain/)
  assert.match(html, /module-panel/)
  const script = /<script nonce="nonce">([\s\S]*?)<\/script>/.exec(html)?.[1]
  assert.ok(script)
  new Script(script)
})


import { explainPinnedModule } from '../../packages/knowledgeos-panel/src/host/repository-explanation.ts'

const actor = { userId: 'user-1', sessionId: 'session-1', serviceId: 'service-1' }

function moduleStore(texts) {
  const entries = [...texts.entries()].map(([path, text], index) => ({ path, kind: 'file', size: Buffer.byteLength(text), sha: String.fromCharCode(98 + index).repeat(40) }))
  const snapshot = { id: 'snapshot-1', commit: 'a'.repeat(40), tree: 'z'.repeat(40) }
  return {
    detail(current, id) { assert.deepEqual(current, actor); assert.equal(id, snapshot.id); return { snapshot, entries, files: entries.map(entry => entry.path) } },
    file(current, id, path) {
      assert.deepEqual(current, actor); assert.equal(id, snapshot.id)
      const text = texts.get(path); if (text === undefined) throw Object.assign(new Error('NOT_FOUND'), { status: 404, code: 'NOT_FOUND' })
      const entry = entries.find(item => item.path === path)
      return { path, sha: entry.sha, commit: snapshot.commit, size: Buffer.byteLength(text), text }
    },
  }
}

test('module explanation binds tree, fixed files and model evidence to one snapshot', async () => {
  const texts = new Map([
    ['src/entry.ts', 'export function run() {\n  return service.save();\n}\n'],
    ['src/service.ts', 'export function save() {\n  return store.write();\n}\n'],
    ['src/store.ts', 'export function write() {\n  throw new Error("disk");\n}\n'],
  ])
  const store = moduleStore(texts)
  const response = await explainPinnedModule(store, {
    async explainSelection(_actor, _system, userText, _signal, authorize) {
      const packet = JSON.parse(userText)
      assert.equal(packet.commit, 'a'.repeat(40)); assert.equal(packet.tree.length, 3); assert.equal(packet.sources.length, 3)
      assert.deepEqual(packet.sources.map(source => source.path), [...texts.keys()])
      authorize()
      return { text: JSON.stringify(answer()), provider: 'fixture', model: 'module-test' }
    },
  }, () => actor, actor.userId, 'snapshot-1', [
    { path: 'src/entry.ts', start_line: 1, end_line: 3 },
    { path: 'src/service.ts', start_line: 1, end_line: 3 },
    { path: 'src/store.ts', start_line: 1, end_line: 3 },
  ], '模块如何从入口走到存储边界？', new AbortController().signal)
  assert.equal(response.snapshot_id, 'snapshot-1')
  assert.equal(response.sources.length, 3)
  assert.equal(response.relations[0].facts[0], 1)
})

test('module explanation rejects a source change observed during authorization', async () => {
  const texts = new Map([
    ['src/entry.ts', 'export function run() {\n  return service.save();\n}\n'],
    ['src/service.ts', 'export function save() {\n  return store.write();\n}\n'],
  ])
  const store = moduleStore(texts)
  await assert.rejects(
    explainPinnedModule(store, {
      async explainSelection(_actor, _system, _userText, _signal, authorize) {
        authorize(); texts.set('src/service.ts', 'export function save() {\n  return changed.write();\n}\n'); authorize()
        return { text: JSON.stringify({ facts: [], summary: [], relations: [], flows: [], tradeoffs: [], limits: ['unreachable'] }), provider: 'fixture', model: 'module-test' }
      },
    }, () => actor, actor.userId, 'snapshot-1', [
      { path: 'src/entry.ts', start_line: 1, end_line: 3 },
      { path: 'src/service.ts', start_line: 1, end_line: 3 },
    ], '异常路径如何处理？', new AbortController().signal), { code: 'CODE_SOURCE_CHANGED' })
})
