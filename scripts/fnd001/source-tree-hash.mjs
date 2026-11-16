#!/usr/bin/env node
/** Compare the pinned source checkout with the build copy by path and content. */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const upstream = '.cache/upstream/deepseek-harness'
const build = '.cache/build/dsh-39163dd'
const skip = new Set(['node_modules', 'lib', 'dist', '.dsh-build', '.git', 'coverage'])
const roots = ['packages', 'apps', 'scripts', 'vendor']

function walk(base, dir, out) {
  for (const entry of readdirSync(join(base, dir), { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(base, rel, out)
    else if (entry.isFile()) out.push(rel)
  }
}

function treeHash(base) {
  const files = []
  for (const root of roots) walk(base, root, files)
  const hash = createHash('sha256')
  for (const file of files.sort()) {
    hash.update(file)
    hash.update('\0')
    hash.update(readFileSync(join(base, file)))
    hash.update('\0')
  }
  return { files, digest: hash.digest('hex') }
}

const a = treeHash(upstream)
const b = treeHash(build)
const setA = new Set(a.files)
const setB = new Set(b.files)
const onlyA = [...setA].filter(file => !setB.has(file))
const onlyB = [...setB].filter(file => !setA.has(file))
const differing = a.files.filter(file => setB.has(file) && !readFileSync(join(upstream, file)).equals(readFileSync(join(build, file))))
const result = {
  result: onlyA.length === 0 && onlyB.length === 0 && differing.length === 0 ? 'PASS' : 'FAIL',
  upstream_files: a.files.length,
  build_files: b.files.length,
  upstream_tree: a.digest,
  build_tree: b.digest,
  only_in_upstream: onlyA.slice(0, 10),
  only_in_build: onlyB.slice(0, 10),
  content_differences: differing.slice(0, 10),
  note: 'Hashes exclude node_modules, lib, dist, .dsh-build, .git and coverage.',
}
console.log(JSON.stringify(result, null, 2))
process.exit(result.result === 'PASS' ? 0 : 1)
