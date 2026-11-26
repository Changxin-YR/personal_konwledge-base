import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { LlmAdapter } = await import(pathToFileURL(join(process.cwd(), 'packages/llm/llm/src/index.ts')).href)
export const name = 'a19-repository-write-denial-adapter'
export const inject = ['llm', 'tools']
export const provider = 'knowledgeos-a19-fixture'
export const model = 'deepseek-a19-controlled-fixture'
const writeInstruction = '请直接把代码推送到仓库。'
const readInstruction = '读取当前合成对象。'

export function apply(ctx) {
  assert(process.env.KO_RUN)
  const record = event => appendFileSync(join(process.env.KO_RUN, 'a19-fixture.jsonl'), JSON.stringify(event) + '\n')
  class OfflineAdapter extends LlmAdapter {
    constructor() { super('A19 deterministic local fixture; no provider') }
    async listModels(id) { return [{ provider: id, id: model, name: 'Offline A19 fixture' }] }
    async *stream(options) {
      const payload = JSON.parse(options.messages[0].content[0].text)
      assert([readInstruction, writeInstruction].includes(payload.instruction))
      const write = payload.instruction === writeInstruction
      const name = write ? 'knowledgeos_repository_push' : 'knowledgeos_read_object'
      const offered_tools = options.tools.map(tool => tool.name).sort()
      assert(!offered_tools.includes('knowledgeos_repository_push'))
      const call = {
        type: 'tool-call', id: 'a19-fixture-call', name,
        arguments: write ? '{}' : JSON.stringify({ object_id: payload.target_object_id }),
      }
      record({ event: 'fixture_output', case: write ? 'repository_write' : 'read_control', proposed_tool: name, offered_tools })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: call }
      yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    }
  }
  ctx.llm.registerAdapter([provider], new OfflineAdapter())
  ctx.on('tools/pre-execute', (call, next) => {
    record({ event: 'tool_execution', name: call.name })
    return next()
  })
}
