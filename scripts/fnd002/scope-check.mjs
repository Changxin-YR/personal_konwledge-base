#!/usr/bin/env node
/**
 * FND-002 scope check.
 *
 * The FND-001 check intentionally banned SQLite for the whole package; it stays
 * as history. This check allows exactly the FND-002 storage adapter and trusted
 * config while rejecting future business layers and dependency inversion.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const packageDir = join(root, 'packages', 'knowledgeos-panel')
const hostFiles = ['config.ts', 'storage.ts', 'records.ts', 'http.ts', 'index.ts', 'test-support.ts', 'status.ts']
const failures = []
const notes = []

const read = async path => await readFile(join(packageDir, path), 'utf8')
const hostSource = {}
for (const file of hostFiles) hostSource[file] = await read(join('src', 'host', file))

// SQLite is confined to the adapter (and its test-only re-export).
for (const [file, text] of Object.entries(hostSource)) {
  if (file !== 'storage.ts' && /from\s+['"]node:sqlite['"]/.test(text)) failures.push(`${file}: only the storage adapter may import node:sqlite`)
  if (file === 'test-support.ts' && /from\s+['"]node:sqlite['"]/.test(text)) failures.push('test-support.ts: must re-export the adapter, not import node:sqlite directly')
}
if (!/from\s+['"]node:sqlite['"]/.test(hostSource['storage.ts'])) failures.push('storage.ts: expected the real node:sqlite import')

// Application case has no platform/SQL imports.
if (/from\s+['"](?:node:http|node:sqlite|node:fs|node:path|@deepseek-ai\/cordis|react)/.test(hostSource['records.ts'])) {
  failures.push('records.ts: application case imports a platform layer')
}
if (/from\s+['"]\.\/storage\.ts['"]/.test(hostSource['records.ts'])) failures.push('records.ts: application case imports the SQLite adapter directly')

// HTTP boundary has no SQL/handle access.
if (/from\s+['"](?:node:sqlite|node:fs)/.test(hostSource['http.ts'])) failures.push('http.ts: HTTP boundary must not import SQLite or filesystem')
if (/\bSELECT\b|\bINSERT\b|\bBEGIN\b/.test(hostSource['http.ts'])) failures.push('http.ts: HTTP boundary contains SQL text')

// No client-facing fault/SQL/path switches.
for (const file of ['http.ts', 'config.ts', 'index.ts']) {
  if (/force_fail|db_path|database_path|migration_override|migration_version/i.test(hostSource[file])) {
    failures.push(`${file}: client-visible fault/SQL/path switch detected`)
  }
}
if (!/migrationOverride/.test(hostSource['storage.ts'])) notes.push('storage.ts keeps the test-only migration override')

// Only the two mandated tables are created.
const createTables = [...hostSource['storage.ts'].matchAll(/CREATE TABLE\s+(\w+)/g)].map(match => match[1])
if (createTables.sort().join(',') !== 'schema_migrations,storage_probe_records') {
  failures.push(`storage.ts: unexpected table set ${createTables.join(',')}`)
}

// Routes stay limited to FND-001 status and FND-002 records.
const routePaths = [...hostSource['index.ts'].matchAll(/path:\s*(STATUS_PATH|RECORDS_PATH)/g)].map(match => match[1])
if (routePaths.sort().join(',') !== 'RECORDS_PATH,RECORDS_PATH,STATUS_PATH') failures.push(`index.ts: unexpected route registrations ${routePaths.join(',')}`)

// Manifest dependency policy.
const manifest = JSON.parse(await read(join('package.json')))
const runtimeDependencies = Object.keys(manifest.dependencies ?? {})
if (runtimeDependencies.length !== 1 || runtimeDependencies[0] !== '@deepseek-ai/schemastery') {
  failures.push(`package.json: unexpected runtime dependencies ${runtimeDependencies.join(',')}`)
}
const forbiddenDependency = /sqlite|drizzle|prisma|kysely|typeorm|sequelize|openai|anthropic|@google\/genai|langchain|pdf-parse|pdfjs|jsonwebtoken|passport|bcrypt|bullmq|kafka|amqplib/i
for (const name of [...runtimeDependencies, ...Object.keys(manifest.devDependencies ?? {})]) {
  if (forbiddenDependency.test(name)) failures.push(`package.json: forbidden dependency ${name}`)
}

// Host source may not pull in future feature modules.
const featureNames = new Set(['auth', 'account', 'permission', 'rag', 'embedding', 'job', 'jobs', 'outbox', 'audit', 'pdf', 'knowledge', 'note', 'notes', 'project', 'projects', 'schedule'])
for (const [file, text] of Object.entries(hostSource)) {
  for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const leaf = match[1].split('/').pop().replace(/\.ts$/, '')
    if (featureNames.has(leaf)) failures.push(`${file}: imports a future feature module ${match[1]}`)
  }
}

// Client sources stay outside storage.
const clientDir = join(packageDir, 'src', 'client')
for (const entry of await readdir(clientDir)) {
  if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue
  const text = await readFile(join(clientDir, entry), 'utf8')
  if (/node:sqlite|knowledgeos\/foundation\/records/.test(text)) failures.push(`client/${entry}: client must not know the storage adapter`)
}

const result = {
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  failures,
  notes: [`checked ${hostFiles.length} host files`, ...notes],
  allowed_tables: createTables,
  runtime_dependencies: runtimeDependencies,
}
console.log(JSON.stringify(result, null, 2))
process.exit(failures.length === 0 ? 0 : 1)