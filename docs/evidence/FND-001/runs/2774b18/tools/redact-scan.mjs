#!/usr/bin/env node
/**
 * Redact and scan the FND-001 evidence directory for launch tokens and
 * dsh-auth cookie material. Independent tester tool; writes only under the
 * evidence runs directory.
 *
 * Usage: node redact-scan.mjs <runs-dir> [--apply]
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join, extname, relative } from 'node:path'

const root = process.argv[2]
const apply = process.argv.includes('--apply')
if (!root) {
  console.error('usage: node redact-scan.mjs <runs-dir> [--apply]')
  process.exit(64)
}
const TOKEN = /token=([A-Za-z0-9._~-]{8,})/g
const AUTH = /dsh-auth-([A-Za-z0-9_-]{8,})/g
const TEXT = new Set(['.json', '.log', '.txt', '.html', '.mjs', '.cjs', '.js', '.ps1', '.md', '.yml', '.yaml'])

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

const files = await walk(root)
const report = { root, applied: apply, files_scanned: 0, files_changed: [], text_hits_before: 0, auth_hits_before: 0, remaining: [], binary_hits: [] }
for (const file of files) {
  const rel = relative(root, file)
  const buffer = await readFile(file)
  const isText = TEXT.has(extname(file).toLowerCase())
  let text = isText ? buffer.toString('utf8') : buffer.toString('latin1')
  const tokens = [...text.matchAll(TOKEN)]
  const auth = [...text.matchAll(AUTH)]
  if (tokens.length === 0 && auth.length === 0) continue
  report.files_scanned += 1
  report.text_hits_before += tokens.length
  report.auth_hits_before += auth.length
  if (!isText) {
    report.binary_hits.push({ file: rel, token_hits: tokens.length, auth_hits: auth.length })
    continue
  }
  if (!apply) {
    report.files_changed.push({ file: rel, token_hits: tokens.length, auth_hits: auth.length, applied: false })
    continue
  }
  const redacted = text.replace(TOKEN, 'token=<redacted>').replace(AUTH, '<redacted>')
  if (redacted !== text) {
    await writeFile(file, redacted, 'utf8')
    report.files_changed.push({ file: rel, token_hits: tokens.length, auth_hits: auth.length, applied: true })
  }
}
// Verify again after the optional rewrite.
for (const file of files) {
  const rel = relative(root, file)
  const buffer = await readFile(file)
  const isText = TEXT.has(extname(file).toLowerCase())
  const text = buffer.toString(isText ? 'utf8' : 'latin1')
  const tokens = [...text.matchAll(TOKEN)]
  const auth = [...text.matchAll(AUTH)]
  if (tokens.length > 0 || auth.length > 0) {
    report.remaining.push({ file: rel, token_hits: tokens.length, auth_hits: auth.length, text: isText })
  }
}
report.files_scanned_total = files.length
report.result = report.remaining.length === 0 ? 'CLEAN' : (apply ? 'REMAINING' : 'FOUND')
console.log(JSON.stringify(report, null, 2))
process.exit(report.remaining.length === 0 ? 0 : 1)