#!/usr/bin/env node
/**
 * Verify the artifacts the test profile actually loads against a frozen
 * expected-hash manifest.
 *
 * The expected hashes come from the candidate manifest committed before the
 * run; this script never derives them from the files it is checking.
 *
 * Usage:
 *   node scripts/fnd002/check-loaded-artifacts.mjs \
 *     --profile-dir <home>/profiles/<profile> --expected <manifest.json> \
 *     [--package knowledgeos-panel] [--actual-dir <temp-copy>]
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
const profileDir = resolve(option('profile-dir') ?? '')
const expectedPath = resolve(option('expected') ?? '')
const packageName = option('package') ?? 'knowledgeos-panel'
const actualOverride = option('actual-dir') === undefined ? undefined : resolve(option('actual-dir'))
if (!option('profile-dir') || !option('expected')) {
  console.error('usage: check-loaded-artifacts.mjs --profile-dir <dir> --expected <manifest.json> [--actual-dir <dir>]')
  process.exit(64)
}

const failures = []
let expected
try {
  expected = JSON.parse(readFileSync(expectedPath, 'utf8'))
} catch (error) {
  console.error(JSON.stringify({ result: 'FAIL', failures: [`cannot read expected manifest: ${error.message}`] }, null, 2))
  process.exit(1)
}
if (typeof expected !== 'object' || expected === null || typeof expected.artifacts !== 'object' || expected.artifacts === null) {
  console.error(JSON.stringify({ result: 'FAIL', failures: ['expected manifest must contain an artifacts object'] }, null, 2))
  process.exit(1)
}

let packageDir = actualOverride
let resolvedSpec
if (packageDir === undefined) {
  let profile
  try {
    profile = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  } catch (error) {
    console.error(JSON.stringify({ result: 'FAIL', failures: [`cannot read profile manifest: ${error.message}`] }, null, 2))
    process.exit(1)
  }
  resolvedSpec = profile.dependencies?.[packageName]
  if (typeof resolvedSpec !== 'string') {
    failures.push(`profile does not depend on ${packageName}`)
  } else {
    const raw = resolvedSpec.startsWith('link:') || resolvedSpec.startsWith('file:')
      ? resolvedSpec.replace(/^(link:|file:)/, '')
      : resolvedSpec
    packageDir = isAbsolute(raw) ? raw : resolve(profileDir, raw)
  }
}

const artifacts = []
for (const [relativePath, expectedHash] of Object.entries(expected.artifacts)) {
  if (packageDir === undefined) break
  const file = join(packageDir, relativePath)
  if (!existsSync(file)) {
    failures.push(`missing loaded artifact ${relativePath}`)
    artifacts.push({ path: relativePath, expected: expectedHash, actual: null, match: false })
    continue
  }
  const actual = createHash('sha256').update(readFileSync(file)).digest('hex')
  const match = actual === expectedHash
  artifacts.push({ path: relativePath, expected: expectedHash, actual, match })
  if (!match) failures.push(`loaded artifact mismatch ${relativePath}: expected ${expectedHash}, actual ${actual}`)
}

const result = {
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  profile_dir: profileDir,
  package_dir: packageDir ?? null,
  resolved_spec: resolvedSpec ?? null,
  expected_source: expectedPath,
  expected_candidate: expected.candidate ?? null,
  artifacts,
  failures,
}
console.log(JSON.stringify(result, null, 2))
process.exit(failures.length === 0 ? 0 : 1)