import assert from 'node:assert/strict'
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { exactFile, roles, unit } from './guard.mjs'

// userInfo().homedir comes from the OS account, even inside the disposable Host HOME.
// There is deliberately no CLI/env budget namespace. Both operators use this OS account.
export const budgetDirectory = () => join(realpathSync(userInfo().homedir), '.knowledgeos-acceptance', unit)
export function reserve(dir, role, manifest) {
  assert(roles.includes(role))
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  assert(lstatSync(dir).isDirectory() && realpathSync(dir) === dir)
  const { candidate, entry_sha256, wire_sha256 } = manifest
  const pin = JSON.stringify({ unit, candidate, entry_sha256, wire_sha256 })
  const file = join(dir, 'candidate.json')
  try { writeFileSync(file, pin, { flag: 'wx', mode: 0o600, flush: true }) }
  catch (error) {
    if (error.code !== 'EEXIST') throw error
    assert.equal(exactFile(file).toString(), pin, 'shared budget is already bound to a different candidate or wire')
  }
  // Reserve before dispatch. A timeout, transport failure or crash never refunds a slot.
  writeFileSync(join(dir, role + '.spent'), pin, { flag: 'wx', mode: 0o600, flush: true })
}
