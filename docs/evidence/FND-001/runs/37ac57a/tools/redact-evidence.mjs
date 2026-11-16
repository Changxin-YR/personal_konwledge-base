#!/usr/bin/env node
/**
 * Evidence redaction tool (not product code).
 * Replaces launch tokens, DSH auth cookie names/values and Cookie headers in the
 * captured evidence, then reports residual matches. Values are replaced, never
 * removed, so result fields keep their meaning.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = process.argv[2]
if (root === undefined) {
  console.error('usage: node redact-evidence.mjs <runs-dir>')
  process.exit(64)
}
const TEXT = new Set(['.log', '.json', '.txt', '.html', '.md', '.jsonl'])
const skipDirs = new Set(['tools'])

async function walk(dir, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path, out)
    else if (TEXT.has(extname(entry.name).toLowerCase())) out.push(path)
  }
}

const files = []
await walk(root, files)
const rules = [
  { id: 'launch-token', pattern: /token=[^\s&"'<>]+/gu, replacement: 'token=<redacted>' },
  { id: 'cookie-name', pattern: /dsh-auth-[A-Za-z0-9_-]{8,}/gu, replacement: 'dsh-auth-<redacted>' },
  { id: 'cookie-header', pattern: /(cookie:\s*)[^\r\n]+/giu, replacement: '$1<redacted>' },
  { id: 'cookie-value', pattern: /(dsh-auth-[A-Za-z0-9_-]*=)[^\s;,"']+/gu, replacement: '$1<redacted>' },
]
const report = []
for (const file of files) {
  let text = await readFile(file, 'utf8')
  const applied = {}
  for (const rule of rules) {
    const matches = text.match(rule.pattern)
    if (matches === null) continue
    applied[rule.id] = matches.length
    text = text.replace(rule.pattern, rule.replacement)
  }
  if (Object.keys(applied).length > 0) {
    await writeFile(file, text, 'utf8')
    report.push({ file: relative(root, file), applied })
  }
}

// Residual scan: evidence output only, tools are the operators and may name the patterns.
const residual = []
for (const file of files) {
  const text = await readFile(file, 'utf8')
  const hits = []
  if (/token=(?!<redacted>)/u.test(text)) hits.push('unredacted token=')
  if (/dsh-auth-(?!<redacted>)/u.test(text)) hits.push('unredacted dsh-auth cookie')
  if (/cookie:\s*(?!<redacted>)/iu.test(text)) hits.push('unredacted Cookie header')
  if (hits.length > 0) residual.push({ file: relative(root, file), hits })
}
const result = { result: residual.length === 0 ? 'PASS' : 'FAIL', scanned: files.length, changed: report, residual }
console.log(JSON.stringify(result, null, 2))
process.exit(residual.length === 0 ? 0 : 1)