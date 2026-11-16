#!/usr/bin/env node
/**
 * Collect the Host-side FND-001 contract evidence on the pinned source build.
 *
 * Sequence: start Host -> two authenticated status reads in one instance ->
 * stop -> start again -> one read -> stop. Then run the wire-contract checks
 * for the same-instance pair and the restart pair.
 *
 * Usage:
 *   node scripts/fnd001/host-contract-run.mjs \
 *     --dsh-root <build>/dsh-39163dd --home <isolated-home> \
 *     --profile knowledgeos-test --port 3099 \
 *     --out docs/evidence/FND-001/runs/<run>
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
const dshRoot = resolve(option('dsh-root') ?? '')
const home = resolve(option('home') ?? '')
const profile = option('profile') ?? 'knowledgeos-test'
const port = Number(option('port') ?? '3099')
const outDir = resolve(option('out') ?? '')
const commitHash = option('commit') ?? '39163dd30f703a79079e2d2446545cff3c453738'
const base = `http://127.0.0.1:${port}`
if (!option('dsh-root') || !option('home') || !option('out')) {
  console.error('missing required option')
  process.exit(64)
}
await mkdir(outDir, { recursive: true })
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))
const failures = []
const steps = []

let host = null
let exited = null

async function startHost(label) {
  const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', profile, '--port', String(port), '--no-open'], {
    cwd: dshRoot,
    env: { ...process.env, DSH_HOME: home, DSH_CLIENT_COMMIT_HASH: commitHash },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  host = child
  exited = once(child, 'exit')
  const chunks = []
  child.stdout.on('data', chunk => { chunks.push(chunk.toString()) })
  child.stderr.on('data', chunk => { chunks.push(chunk.toString()) })
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const match = /dsh web:\s*(http:\/\/\S+)/.exec(chunks.join(''))
    if (match !== null) {
      const redacted = chunks.join('').replace(/token=[^\s&]+/gu, 'token=<redacted>')
      await writeFile(join(outDir, `host-${label}.log`), redacted, 'utf8')
      return match[1]
    }
    if (child.exitCode !== null) throw new Error(`host exited early with ${child.exitCode}: ${chunks.join('').slice(-3000)}`)
    await sleep(250)
  }
  throw new Error(`host did not print an entry URL: ${chunks.join('').slice(-3000)}`)
}

async function stopHost() {
  if (host === null || host.exitCode !== null) return
  host.kill()
  await Promise.race([exited, sleep(10_000)])
  await sleep(500)
}

async function readAuthenticated(entryUrl) {
  const entry = new URL(entryUrl)
  const entryResponse = await fetch(entry, { redirect: 'manual' })
  const cookie = (entryResponse.headers.getSetCookie?.() ?? []).map(value => value.split(';', 1)[0]).join('; ')
  if (cookie.length === 0) throw new Error('entry URL returned no browser cookie')
  const anonymous = await fetch(new URL('/knowledgeos/status', base), { headers: { accept: 'application/json' }, redirect: 'manual' })
  const response = await fetch(new URL('/knowledgeos/status', base), {
    headers: { accept: 'application/json', cookie },
    redirect: 'manual',
  })
  const text = await response.text()
  return { entryStatus: entryResponse.status, anonymousStatus: anonymous.status, status: response.status, text }
}

async function runContract(mode, first, second) {
  const child = spawn(process.execPath, [join(here, 'status-contract.mjs'), '--mode', mode, first, second], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const chunks = []
  child.stdout.on('data', chunk => chunks.push(chunk.toString()))
  child.stderr.on('data', chunk => chunks.push(chunk.toString()))
  const [code] = await once(child, 'exit')
  const output = chunks.join('').trim()
  steps.push({ step: `contract-${mode}`, exit_code: code, output })
  if (code !== 0) failures.push(`contract ${mode} failed: ${output}`)
}

try {
  const firstEntry = await startHost('instance-1')
  const first = await readAuthenticated(firstEntry)
  await sleep(1_500)
  const second = await readAuthenticated(firstEntry)
  await writeFile(join(outDir, 'status-same-instance-a.json'), `${JSON.stringify(JSON.parse(first.text), null, 2)}\n`, 'utf8')
  await writeFile(join(outDir, 'status-same-instance-b.json'), `${JSON.stringify(JSON.parse(second.text), null, 2)}\n`, 'utf8')
  steps.push({
    step: 'authenticated-instance-1',
    entry_status: first.entryStatus,
    anonymous_status: first.anonymousStatus,
    authenticated_status: first.status,
    second_status: second.status,
  })
  if (first.anonymousStatus !== 401 && first.anonymousStatus !== 403) failures.push(`anonymous read returned ${first.anonymousStatus}`)
  if (first.status !== 200 || second.status !== 200) failures.push(`authenticated read returned ${first.status}/${second.status}`)
  await stopHost()

  const secondEntry = await startHost('instance-2')
  const third = await readAuthenticated(secondEntry)
  await writeFile(join(outDir, 'status-after-restart.json'), `${JSON.stringify(JSON.parse(third.text), null, 2)}\n`, 'utf8')
  steps.push({ step: 'authenticated-instance-2', entry_status: third.entryStatus, anonymous_status: third.anonymousStatus, authenticated_status: third.status })
  if (third.status !== 200) failures.push(`authenticated read after restart returned ${third.status}`)
  await stopHost()

  await runContract('same-instance', join(outDir, 'status-same-instance-a.json'), join(outDir, 'status-same-instance-b.json'))
  await runContract('restart', join(outDir, 'status-same-instance-a.json'), join(outDir, 'status-after-restart.json'))
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error))
} finally {
  await stopHost()
  const summary = { result: failures.length === 0 ? 'PASS' : 'FAIL', failures, steps, out: outDir, finished_at: new Date().toISOString() }
  await writeFile(join(outDir, 'host-contract-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(summary, null, 2))
  process.exit(failures.length === 0 ? 0 : 1)
}
