#!/usr/bin/env node
/**
 * Static scope check for FND-001.
 *
 * It verifies the candidate only adds the one panel/Host-status slice and does
 * not introduce database, account, model, RAG, import, plan, or packaging code.
 * Exit 0 means the scanned files stayed inside the unit scope.
 */
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { globSync } from 'node:fs'

const root = resolve(process.argv[2] ?? '.')
const packageDir = join(root, 'packages', 'knowledgeos-panel')
const files = globSync(['src/**/*.ts', 'src/**/*.tsx', 'build.mjs', 'package.json', 'cordis.patch.yml'], { cwd: packageDir })
  .map(file => join(packageDir, file))
const scripts = globSync(['scripts/fnd001/*.mjs'], { cwd: root }).map(file => join(root, file))
const failures = []
const notes = []

const forbiddenImport = /from\s+['"](?:node:sqlite|better-sqlite3|sqlite3|drizzle-orm|prisma|kysely|openai|@anthropic-ai|@google\/genai|passport|jsonwebtoken|bcrypt|pdf-parse|pdfjs-dist|@langchain)/u
const forbiddenDependency = /"(?:better-sqlite3|sqlite3|drizzle-orm|prisma|kysely|openai|@anthropic-ai\/sdk|jsonwebtoken|bcrypt|pdf-parse|pdfjs-dist|@langchain\/[^"]+)"/u

for (const file of files) {
  const text = await readFile(file, 'utf8')
  if (forbiddenImport.test(text)) failures.push(`${file}: imports a module outside FND-001 scope`)
  if (file.endsWith('package.json') && forbiddenDependency.test(text)) failures.push(`${file}: declares a dependency outside FND-001 scope`)
}
for (const file of scripts) {
  const text = await readFile(file, 'utf8')
  if (forbiddenImport.test(text)) failures.push(`${file}: test harness imports a module outside FND-001 scope`)
}

const panelPackage = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))
if (panelPackage.dsh?.client?.platform !== 'web') failures.push('package.json: dsh.client.platform must be web')
if (panelPackage.dsh?.bundle?.patch === undefined) failures.push('package.json: dsh.bundle.patch is missing')
if (panelPackage.exports?.['./client'] === undefined) failures.push('package.json: exports["./client"] is missing')
if (panelPackage.dependencies !== undefined && Object.keys(panelPackage.dependencies).length > 0) {
  failures.push('package.json: runtime dependencies are outside FND-001 scope')
}
notes.push(`scanned ${files.length} package file(s) and ${scripts.length} harness file(s)`)

const sourceFiles = globSync(['src/**/*.ts', 'src/**/*.tsx'], { cwd: packageDir })
if (sourceFiles.length > 20) failures.push(`too many source files for one slice: ${sourceFiles.length}`)

const result = { result: failures.length === 0 ? 'PASS' : 'FAIL', failures, notes, package_files: files.length, script_files: scripts.length }
console.log(JSON.stringify(result, null, 2))
process.exit(failures.length === 0 ? 0 : 1)
