import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { commit, digest, route, sha, stage, unit } from './guard.mjs'

export const prefix = 'scripts/explain001/tokease'
const fixtureFile = 'scripts/explain001/fixture.mjs'
const domainFile = 'packages/knowledgeos-panel/src/domain/code-explanation.ts'
const entryFile = 'packages/knowledgeos-panel/lib/index.js'
const shared = ['scripts/learn002/tokease/guard.mjs', 'scripts/lib002/a07-isolated-host.mjs',
  ...['binding', 'guards', 'trace'].map(n => 'scripts/fnd005/candidate-live-' + n + '.mjs')]
const helpers = ['controller', 'guard', 'inputs', 'budget', 'native', 'preload', 'seal'].map(n => prefix + '/' + n + '.mjs')
export const checkout = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)))
export function frozen(root, candidate, file) {
  const bytes = readFileSync(join(root, file))
  const gitBytes = execFileSync('git', ['--no-optional-locks', 'show', candidate + ':' + file],
    { cwd: root, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(sha(bytes), sha(gitBytes), 'frozen file mismatch: ' + file)
  return sha(bytes)
}
export async function inputs(root, candidate, entry) {
  assert.equal(realpathSync(root), checkout)
  assert.match(candidate, commit)
  assert.match(entry, digest)
  assert.equal(execFileSync('git', ['--no-optional-locks', 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), candidate)
  const hashes = Object.fromEntries([...helpers, ...shared, fixtureFile, domainFile, entryFile].map(file => [file, frozen(root, candidate, file)]))
  assert.equal(hashes[entryFile], entry)
  const from = file => import(pathToFileURL(join(root, file)).href)
  const { CODE_EXPLANATION_SYSTEM: system, groundedExplanation, sourceWindow } = await loadDomain(root)
  assert(typeof system === 'string' && system.trim())
  const fixture = await from(fixtureFile)
  const user = syntheticInput(fixture)
  const reply = syntheticReply(user)
  const window = sourceWindow(fixture.SOURCE, { start_line: fixture.FIRST, end_line: fixture.LAST })
  assert.deepEqual(user.lines, window.lines)
  assert.deepEqual(groundedExplanation(JSON.stringify(reply), window), reply)
  const fixed = { unit, candidate, entry_sha256: entry, route, stage, fixture_sha256: hashes[fixtureFile],
    system_sha256: sha(system), user_sha256: sha(JSON.stringify(user)) }
  return { fixed, hashes, system, user, reply }
}

export async function loadDomain(root) {
  // Node's strip-only loader cannot parse the domain error's TS parameter properties.
  const js = stripTypeScriptTypes(readFileSync(join(root, domainFile), 'utf8'), { mode: 'transform' })
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
export function syntheticInput({ PATH, QUESTION, FIRST, LAST, LINES }) {
  const selected = LINES.slice(FIRST - 1, LAST)
  assert(selected.length === LAST - FIRST + 1)
  return { path: PATH, question: QUESTION, lines: selected.map((text, i) => ({ line: FIRST + i, text })) }
}
export function syntheticReply(user) {
  const fact = (start_line, end_line) => ({ start_line, end_line,
    quote: user.lines.filter(row => row.line >= start_line && row.line <= end_line).map(row => row.text).join('\n') })
  const facts = [fact(2, 2), fact(3, 3), fact(4, 5)]
  assert.equal(facts[0].quote, '// Free shipping at subtotal >= 50.')
  assert.equal(facts[1].quote, 'export function shippingFee(subtotal) {')
  assert.equal(facts[2].quote, '  if (subtotal > 50) return 0;\n  return 8;')
  return { facts, interpretations: [{ text: 'shippingFee 按订单小计计算运费。注释说满 50 免运费，实际条件是严格大于 50，等于 50 走默认分支。因此 50→8，51→0，注释与实现的边界不一致。', facts: [1, 2, 3] }],
    limits: ['选中行只给出函数声明和实现，没有调用点或导入记录，无法确定哪些外部模块调用它。需要查看调用处。'] }
}
