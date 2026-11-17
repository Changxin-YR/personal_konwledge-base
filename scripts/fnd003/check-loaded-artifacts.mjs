#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { DEFAULT_HOME, DEFAULT_PROFILE, REPO } from './harness.mjs'

const args = process.argv.slice(2)
const value = name => { const index = args.indexOf(`--${name}`); return index < 0 ? undefined : args[index + 1] }
const manifestPath = resolve(value('manifest') ?? join(REPO, 'docs', 'evidence', 'FND-003', 'candidate-manifest.json'))
const profileDir = resolve(value('profile-dir') ?? join(DEFAULT_HOME, 'profiles', DEFAULT_PROFILE))
const digest = bytes => ({ bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') })
const result = { manifest: relative(REPO, manifestPath).replaceAll('\\', '/'), profile_dir: relative(REPO, profileDir).replaceAll('\\', '/'), source_mismatches: [], loaded_mismatches: [], loaded_root: null }

try {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const [file, expected] of Object.entries(manifest.files ?? {})) {
    try {
      const actual = digest(readFileSync(join(REPO, file)))
      if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) result.source_mismatches.push({ file, expected, actual })
    } catch (error) { result.source_mismatches.push({ file, error: String(error) }) }
  }
  const profilePackagePath = join(profileDir, 'package.json')
  const profilePackage = JSON.parse(readFileSync(profilePackagePath, 'utf8'))
  const dependency = profilePackage.dependencies?.['knowledgeos-panel']
  if (typeof dependency !== 'string') throw new Error('profile package does not declare knowledgeos-panel')
  const packageDir = resolve(profileDir, dependency.replace(/^(?:link|file):/, ''))
  result.loaded_root = realpathSync(packageDir)
  for (const [file, expected] of Object.entries(manifest.files ?? {})) {
    const prefix = 'packages/knowledgeos-panel/'
    if (!file.startsWith(prefix)) continue
    const installedPath = join(result.loaded_root, file.slice(prefix.length))
    try {
      const actual = digest(readFileSync(installedPath))
      if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) result.loaded_mismatches.push({ file, installed_path: installedPath, expected, actual })
    } catch (error) { result.loaded_mismatches.push({ file, installed_path: installedPath, error: String(error) }) }
  }
} catch (error) {
  result.error = String(error)
}

const passed = result.error === undefined && result.source_mismatches.length === 0 && result.loaded_mismatches.length === 0
result.result = passed ? 'PASS' : 'FAIL'
console.log(JSON.stringify(result, null, 2))
process.exitCode = passed ? 0 : 1
