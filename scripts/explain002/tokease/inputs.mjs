import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { commit, digest, route, sha, stage, unit } from './guard.mjs'

export const prefix = 'scripts/explain002/tokease'
const fixtureFile = 'scripts/explain002/fixture.mjs'
const domainFile = 'packages/knowledgeos-panel/src/domain/module-explanation.ts'
const codeDomainFile = 'packages/knowledgeos-panel/src/domain/code-explanation.ts'
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
  const hashes = Object.fromEntries([...helpers, ...shared, fixtureFile, domainFile, codeDomainFile, entryFile].map(file => [file, frozen(root, candidate, file)]))
  assert.equal(hashes[entryFile], entry)
  const from = file => import(pathToFileURL(join(root, file)).href)
  const { MODULE_EXPLANATION_SYSTEM: system, groundedModuleExplanation } = await loadDomain(root)
  assert(typeof system === 'string' && system.trim())
  const fixture = await from(fixtureFile)
  const user = fixture.modulePacket()
  const reply = fixture.moduleReply(user)
  const sources = user.sources
  assert.deepEqual(groundedModuleExplanation(JSON.stringify(reply), sources), reply)
  const fixed = { unit, candidate, entry_sha256: entry, route, stage, fixture_sha256: hashes[fixtureFile],
    system_sha256: sha(system), user_sha256: sha(JSON.stringify(user)) }
  return { fixed, hashes, system, user, reply }
}

export async function loadDomain(root) {
  const codeJs = stripTypeScriptTypes(readFileSync(join(root, codeDomainFile), 'utf8'), { mode: 'transform' })
  const codeUrl = 'data:text/javascript;base64,' + Buffer.from(codeJs).toString('base64')
  const moduleJs = stripTypeScriptTypes(readFileSync(join(root, domainFile), 'utf8'), { mode: 'transform' })
    .replaceAll("from './code-explanation.ts'", `from '${codeUrl}'`)
  return import('data:text/javascript;base64,' + Buffer.from(moduleJs).toString('base64'))
}
