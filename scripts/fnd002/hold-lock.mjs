#!/usr/bin/env node
/**
 * Hold a real SQLite write transaction on the FND-002 business database.
 *
 * Usage: node scripts/fnd002/hold-lock.mjs <database-path>
 * Prints `locked` after BEGIN IMMEDIATE and stays alive until stdin is closed,
 * a line arrives, or the timeout expires.
 */
import { DatabaseSync } from 'node:sqlite'

const path = process.argv[2]
if (!path) {
  console.error('usage: node scripts/fnd002/hold-lock.mjs <database-path>')
  process.exit(64)
}
const db = new DatabaseSync(path)
db.exec('PRAGMA busy_timeout=250')
db.exec('BEGIN IMMEDIATE')
console.log('locked')
const release = () => {
  try { db.exec('ROLLBACK') } catch { /* the connection may already be closing */ }
  try { db.close() } catch { /* idempotent close */ }
  process.exit(0)
}
process.stdin.setEncoding('utf8')
process.stdin.on('data', release)
process.stdin.on('end', release)
setTimeout(release, 30_000)