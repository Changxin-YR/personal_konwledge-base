import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
const candidate = process.argv[process.argv.indexOf('--candidate') + 1] ?? 'WORKTREE'
const out = 'docs/evidence/FND-004/independent'
mkdirSync(out, { recursive: true })
const checks = []
const check = async (id, fn) => { try { await fn(); checks.push({ id, status: 'PASS' }) } catch (error) { checks.push({ id, status: 'FAIL', error: error instanceof Error ? error.message : String(error) }) } }
await check('route-whitelist', async () => {
  const source = await readFile('packages/knowledgeos-panel/src/host/index.ts', 'utf8')
  for (const route of ['/knowledge/v1/objects', '/knowledge/v1/projects', '/knowledge/v1/grants']) if (!source.includes(route)) throw new Error(`missing registered route ${route}`)
  if (source.includes("path: '/api'") || source.includes('path: "/api"')) throw new Error('wide /api route registered')
})
await check('domain-entrypoint', async () => {
  const source = await readFile('packages/knowledgeos-panel/src/host/authorization.ts', 'utf8')
  for (const action of ['read', 'comment', 'edit', 'export', 'manage_share', 'delete', 'review', 'view_learning_records']) if (!source.includes(`'${action}'`)) throw new Error(`missing action ${action}`)
  if (!source.includes('now < grant.expiresAt')) throw new Error('expiry boundary missing')
})
await check('build-artifacts', async () => {
  for (const file of ['packages/knowledgeos-panel/lib/index.js', 'packages/knowledgeos-panel/lib/storage.js', 'packages/knowledgeos-panel/lib/test-support.js']) if (!existsSync(file)) throw new Error(`missing ${file}`)
})
const summary = { candidate, status: checks.some(item => item.status === 'FAIL') ? 'FAIL' : 'PASS', checks, not_run: ['real_DSH_browser_route_probe', 'full_A02_A34_A46_search_ai_export_cache'] }
await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
if (summary.status === 'FAIL') process.exitCode = 1
