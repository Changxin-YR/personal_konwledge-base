import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkManifest, checkPrice, exactFile, jsonBytes, sha } from './guard.mjs'
import { checkout, inputs } from './inputs.mjs'

const [calibrationFile, priceFile, manifestFile, fndGuards] = process.argv.slice(2)
assert(calibrationFile && priceFile && manifestFile && fndGuards, 'node seal.mjs <dry calibration> <fresh reviewed price> <output manifest> <fnd guards>')
const priceBytes = exactFile(priceFile)
const { priceApproval } = await import(pathToFileURL(resolve(fndGuards)).href)
checkPrice(JSON.parse(priceBytes))
priceApproval(JSON.parse(priceBytes), (await import('./guard.mjs')).route)
const calibration = JSON.parse(readFileSync(calibrationFile, 'utf8'))
const fixed = (await inputs(checkout, calibration.candidate, calibration.entry_sha256)).fixed
assert.equal(calibration.wire_sha256?.length, 64)
const manifest = checkManifest({ ...calibration, ...fixed, approval_sha256: sha(priceBytes) }, fixed, ['wire_sha256', 'approval_sha256'])
const bytes = Buffer.from(jsonBytes(manifest))
writeFileSync(manifestFile, bytes, { flag: 'wx' })
process.stdout.write(JSON.stringify({ manifest_sha256: sha(bytes), candidate: manifest.candidate, route: manifest.route }) + '\n')
