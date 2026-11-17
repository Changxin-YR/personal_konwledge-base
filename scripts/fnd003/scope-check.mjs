#!/usr/bin/env node
/** FND-003 scope and evidence hygiene check. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { REPO } from './harness.mjs'

const failures = []
const required = [
  'packages/knowledgeos-panel/src/host/identity.ts',
  'packages/knowledgeos-panel/src/host/identity-http.ts',
  'packages/knowledgeos-panel/src/host/identity-peer.ts',
  'packages/knowledgeos-panel/src/host/storage.ts',
  'scripts/fnd003/harness.mjs',
  'scripts/fnd003/run-all.mjs',
]
for (const path of required) if (!existsSync(join(REPO, path))) failures.push(`missing ${path}`)

const sourcePaths = [
  'packages/knowledgeos-panel/src/host/index.ts',
  'packages/knowledgeos-panel/src/host/identity.ts',
  'packages/knowledgeos-panel/src/host/identity-http.ts',
  'packages/knowledgeos-panel/src/host/identity-peer.ts',
  'packages/knowledgeos-panel/src/host/storage.ts',
  'packages/knowledgeos-panel/src/client/Panel.tsx',
]
const source = sourcePaths.map(path => readFileSync(join(REPO, path), 'utf8')).join('\n')
for (const forbidden of ['acl', 'outbox', 'rag', 'jobs', 'shared_space', 'invite_code']) {
  if (new RegExp(`\\b${forbidden}\\b`, 'i').test(source)) failures.push(`future scope marker in product source: ${forbidden}`)
}
for (const requiredMarker of ['service_identity', 'auth_sessions', 'password_credentials', 'spaces', 'SameSite=Strict', 'x-knowledgeos-request']) {
  if (!source.includes(requiredMarker)) failures.push(`missing FND-003 marker ${requiredMarker}`)
}
const evidenceRoot = join(REPO, 'docs', 'evidence', 'FND-003')
if (!existsSync(evidenceRoot)) failures.push('missing FND-003 evidence root')
const evidenceFiles = existsSync(evidenceRoot) ? readdirSync(evidenceRoot).map(name => join(evidenceRoot, name)) : []
for (const file of evidenceFiles) {
  if (statSync(file).isFile()) {
    const text = readFileSync(file, 'utf8')
    if (/password\s*[:=]\s*[^<\s]/i.test(text) || /token\s*[:=]\s*[A-Za-z0-9_-]{20,}/i.test(text)) failures.push(`possible secret in evidence ${relative(REPO, file)}`)
  }
}
const result = { result: failures.length === 0 ? 'PASS' : 'FAIL', failures, checked: [...required, ...sourcePaths] }
console.log(JSON.stringify(result, null, 2))
process.exit(failures.length === 0 ? 0 : 1)

