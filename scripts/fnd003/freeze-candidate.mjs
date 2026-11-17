#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { REPO } from './harness.mjs'

const args = process.argv.slice(2)
const value = name => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1] }
const out = resolve(value('out') ?? join(REPO, 'docs', 'evidence', 'FND-003', 'candidate-manifest.json'))
const paths = [
  'AGENTS.md', 'CODEX_START.md', 'config/execution_state.json', 'config/work_units.json',
  'packages/knowledgeos-panel/package.json', 'packages/knowledgeos-panel/package-lock.json',
  'packages/knowledgeos-panel/lib/index.js', 'packages/knowledgeos-panel/lib/client.js',
  'packages/knowledgeos-panel/lib/storage.js', 'packages/knowledgeos-panel/lib/test-support.js',
  'packages/knowledgeos-panel/src/host/index.ts', 'packages/knowledgeos-panel/src/host/identity.ts',
  'packages/knowledgeos-panel/src/host/identity-http.ts', 'packages/knowledgeos-panel/src/host/identity-peer.ts',
  'packages/knowledgeos-panel/src/host/storage.ts', 'packages/knowledgeos-panel/src/host/test-support.ts',
  'packages/knowledgeos-panel/src/client/Panel.tsx', 'scripts/fnd003/harness.mjs',
  'scripts/fnd003/scope-check.mjs', 'scripts/fnd003/freeze-candidate.mjs', 'scripts/fnd003/run-all.mjs', 'scripts/fnd003/independent-verification.mjs', 'scripts/fnd003/check-loaded-artifacts.mjs',
]
const files = {}
for (const relative of paths) {
  const bytes = readFileSync(join(REPO, relative))
  files[relative] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const result = { schema_version: 1, candidate: value('candidate') ?? `fnd003-${new Date().toISOString().replace(/[-:.TZ]/g, '')}`, frozen_at: new Date().toISOString(), upstream_commit: '39163dd30f703a79079e2d2446545cff3c453738', node: process.versions.node, files }
mkdirSync(resolve(out, '..'), { recursive: true })
writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ result: 'PASS', manifest: out, candidate: result.candidate, file_count: Object.keys(files).length }, null, 2))
