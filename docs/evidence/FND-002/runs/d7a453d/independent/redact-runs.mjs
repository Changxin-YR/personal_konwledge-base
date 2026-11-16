#!/usr/bin/env node
/**
 * FND-002 independent verifier — evidence redaction and leakage scan.
 *
 * Replaces every entry-URL token and dsh-auth cookie/token value in the run
 * evidence with `<redacted>`, then proves no secret remains and that no
 * database/WAL/SHM/cookie file entered the evidence tree.
 *
 * Usage:
 *   node docs/evidence/FND-002/runs/d7a453d/independent/redact-runs.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RUN = resolve(fileURLToPath(new URL('..', import.meta.url)))
const TEXT_EXT = /\.(log|json|txt|md|yml|yaml|mjs|csv)$/i
const DB_NAME = /(\.sqlite|\.sqlite3|\.db|\.db-wal|\.db-shm|knowledgeos\.sqlite-wal|knowledgeos\.sqlite-shm|-wal|-shm|\.journal)$/i

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const files = walk(RUN)
const relative = path => path.slice(RUN.length + 1).split(/[\\/]/).join('/')
// Verifier scripts under independent/ are source, not evidence: never rewrite them.
const isVerifierScript = path => /^independent\/[^/]+\.mjs$/.test(relative(path)) || relative(path) === 'independent/redaction-report.json'
const textFiles = files.filter(path => TEXT_EXT.test(path) && !isVerifierScript(path))
const scriptFiles = files.filter(path => isVerifierScript(path))

// Collect the raw secrets before rewriting so the post-scan can prove removal.
const secrets = new Set()
for (const path of textFiles) {
  const text = readFileSync(path, 'utf8')
  for (const match of text.matchAll(/token=([A-Za-z0-9_-]{20,})/g)) if (match[1] !== '<redacted>') secrets.add(match[1])
  for (const match of text.matchAll(/dsh-auth[A-Za-z0-9_-]*=([^\s;"'\\]+)/g)) {
    if (match[1].length >= 8 && match[1] !== '<redacted>' && !match[1].startsWith('<')) secrets.add(match[1])
  }
}

const changed = []
for (const path of textFiles) {
  const before = readFileSync(path, 'utf8')
  const after = before
    .replace(/token=[A-Za-z0-9_-]+/g, 'token=<redacted>')
    .replace(/dsh-auth[A-Za-z0-9_-]*=[^\s;"'\\]*/g, 'dsh-auth=<redacted>')
    .replace(/dsh-auth[A-Za-z0-9_-]{8,}/g, '<redacted>')
  if (after !== before) {
    writeFileSync(path, after, 'utf8')
    changed.push({ file: path.slice(RUN.length + 1), replacements: countDiff(before, after) })
  }
}

function countDiff(before, after) {
  const count = text => (text.match(/token=[A-Za-z0-9_-]+|dsh-auth[A-Za-z0-9_-]*=[^\s;"'\\]*|dsh-auth[A-Za-z0-9_-]{8,}/g) ?? []).length
  return count(before) - count(after)
}

// Post-scan: remaining raw secrets, token= values, cookie names, databases.
const remainingSecrets = []
for (const path of textFiles) {
  const text = readFileSync(path, 'utf8')
  for (const secret of secrets) if (text.includes(secret)) remainingSecrets.push({ file: path.slice(RUN.length + 1), secretLength: secret.length })
}
const tokenOccurrences = []
for (const path of textFiles) {
  const text = readFileSync(path, 'utf8')
  for (const match of text.matchAll(/token=(?!<redacted>)\S+/g)) tokenOccurrences.push({ file: path.slice(RUN.length + 1), sample: match[0].slice(0, 12) })
}
const dshAuthOccurrences = []
for (const path of textFiles) {
  const text = readFileSync(path, 'utf8')
  for (const match of text.matchAll(/dsh-auth[A-Za-z0-9_-]{8,}|dsh-auth=(?!<redacted>)[^\s;"'\\]*/g)) dshAuthOccurrences.push({ file: path.slice(RUN.length + 1), sample: match[0].slice(0, 16) })
}
const dbLikeFiles = files.filter(path => DB_NAME.test(path) || /cookie|credential/i.test(path))
const sqliteHeaderFiles = []
for (const path of files) {
  const head = readFileSync(path).subarray(0, 16).toString('latin1')
  if (head.startsWith('SQLite format 3')) sqliteHeaderFiles.push(path.slice(RUN.length + 1))
}

const result = {
  role: 'independent',
  run_dir: RUN.replace(/\\/g, '/').replace(/.*docs\/evidence/, 'docs/evidence'),
  scanned_files: files.length,
  text_evidence_files: textFiles.length,
  verifier_scripts_not_rewritten: scriptFiles.map(path => relative(path)),
  secrets_found_before: secrets.size,
  changed_files: changed,
  remaining_raw_secrets: remainingSecrets,
  token_occurrences_not_redacted: tokenOccurrences,
  dsh_auth_occurrences_not_redacted: dshAuthOccurrences,
  db_or_cookie_like_files: dbLikeFiles.map(path => path.slice(RUN.length + 1)),
  sqlite_header_files: sqliteHeaderFiles,
  result: remainingSecrets.length === 0 && tokenOccurrences.length === 0 && dshAuthOccurrences.length === 0
    && dbLikeFiles.length === 0 && sqliteHeaderFiles.length === 0 ? 'PASS' : 'FAIL',
}
writeFileSync(join(RUN, 'independent', 'redaction-report.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(result, null, 2))
process.exit(result.result === 'PASS' ? 0 : 1)