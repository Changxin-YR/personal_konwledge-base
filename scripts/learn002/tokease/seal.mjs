import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { boundManifest, digest, quickSystem, route, sha, stage } from './guard.mjs'
import { fixture } from './synthetic.mjs'

const [calibrationFile, priceFile, manifestFile, fndGuards] = process.argv.slice(2)
assert(calibrationFile && priceFile && manifestFile && fndGuards, 'node seal.mjs <dry calibration> <fresh reviewed price> <output manifest> <fnd guards>')
const price = readFileSync(priceFile)
const { priceApproval } = await import(pathToFileURL(resolve(fndGuards)).href)
priceApproval(JSON.parse(price), route)
const calibration = JSON.parse(readFileSync(calibrationFile, 'utf8'))
const fixed = {
  unit: 'LEARN-002', candidate: calibration.candidate, entry_sha256: calibration.entry_sha256, route, stage,
  fixture_sha256: sha(readFileSync(new URL('synthetic.mjs', import.meta.url))),
  system_sha256: sha(quickSystem), user_sha256: sha(JSON.stringify(fixture)),
}
assert.match(calibration.wire_sha256, digest)
const manifest = boundManifest({ ...calibration, approval_sha256: sha(price) }, fixed, true)
const bytes = JSON.stringify(manifest, null, 2) + '\n'
writeFileSync(manifestFile, bytes, { flag: 'wx' })
process.stdout.write(JSON.stringify({ manifest_sha256: sha(bytes), candidate: manifest.candidate, route }) + '\n')
