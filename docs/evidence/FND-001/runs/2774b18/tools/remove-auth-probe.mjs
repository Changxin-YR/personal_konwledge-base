#!/usr/bin/env node
/**
 * Independent removal-auth probe for FND-001 (written by the independent tester).
 *
 * Why: closeout-e2e checks `/knowledgeos/status` is not 200 after the bundle is
 * removed. A 404 alone does not prove the request carried a valid session, and
 * a stopped server / failed cookie must not be scored as a successful removal.
 * This probe proves the restarted Host is reachable and the fresh cookie is
 * valid on an existing route, then reads the removed route with that cookie.
 *
 * It also confirms the reinstalled bundle is byte-identical to the frozen
 * product candidate (lib/index.js and lib/client.js).
 *
 * Usage:
 *   node remove-auth-probe.mjs --dsh-root <build> --home <isolated-home>
 *     --profile knowledgeos-test --port 3099 --plugin <repo>/packages/knowledgeos-panel
 *     --out <evidence-dir>
 */
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
if (!option('dsh-root') || !option('home') || !option('plugin') || !option('out')) {
  console.error('missing required option')
  process.exit(64)
}
const dshRoot = resolve(option('dsh-root'))
const home = resolve(option('home'))
const profile = option('profile') ?? 'knowledgeos-test'
const port = Number(option('port') ?? '3099')
const pluginPath = resolve(option('plugin'))
const outDir = resolve(option('out'))
const commitHash = option('commit') ?? '39163dd30f703a79079e2d2446545cff3c453738'
const base = `http://127.0.0.1:${port}`
await mkdir(outDir, { recursive: true })
const hostLog = join(outDir, 'host.log')
await writeFile(hostLog, '', 'utf8')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const FROZEN = {
  'lib/index.js': '22757b15ec4352d9a26d848320dc31b3a96aba86446fb70fa51fc94ce2d26c6a',
  'lib/client.js': 'f0eb568f9021f4ad4dbbd85ebb6683ea0245d44c449d4b938738caacdf9974d9',
}
const summary = {
  started_at: new Date().toISOString(),
  base,
  profile,
  plugin_path: pluginPath,
  host_starts: [],
  steps: [],
  checks: {},
  failures: [],
}
const record = (name, ok, detail) => {
  summary.steps.push({ name, ok, detail, at: new Date().toISOString() })
  if (!ok) summary.failures.push(`${name}: ${JSON.stringify(detail)}`)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`)
}
const cli = (...cliArgs) => spawnSync(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', ...cliArgs], {
  cwd: dshRoot,
  env: { ...process.env, DSH_HOME: home, DSH_CLIENT_COMMIT_HASH: commitHash },
  encoding: 'utf8',
  timeout: 180_000,
  windowsHide: true,
})
const hashes = async () => {
  const result = {}
  for (const file of Object.keys(FROZEN)) {
    result[file] = createHash('sha256').update(await readFile(join(pluginPath, file))).digest('hex')
  }
  return result
}
const profileManifest = async () =>
  JSON.parse(await readFile(join(home, 'profiles', profile, 'package.json'), 'utf8'))

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
  const onData = chunk => {
    const raw = chunk.toString()
    chunks.push(raw)
    void appendFile(hostLog, raw.replace(/token=[^\s&]+/gu, 'token=<redacted>'))
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const match = /dsh web:\s*(http:\/\/\S+)/.exec(chunks.join(''))
    if (match !== null) {
      summary.host_starts.push({ label, pid: child.pid, at: new Date().toISOString() })
      return match[1]
    }
    if (child.exitCode !== null) throw new Error(`host exited early with ${child.exitCode}: ${chunks.join('').slice(-2000)}`)
    await sleep(250)
  }
  throw new Error('host did not print an entry URL')
}

async function stopHost() {
  if (host === null || host.exitCode !== null) return
  host.kill()
  await Promise.race([exited, sleep(10_000)])
  await sleep(1_000)
}

async function fetchProbe(path, cookie) {
  const headers = { accept: 'text/html,application/json' }
  if (cookie.length > 0) headers.cookie = cookie
  const response = await fetch(new URL(path, base), { headers, redirect: 'manual' })
  const text = await response.text()
  return {
    status: response.status,
    location: response.headers.get('location'),
    contentType: response.headers.get('content-type'),
    bodyPrefix: text.slice(0, 160),
  }
}

async function getSession(entryUrl) {
  const response = await fetch(entryUrl, { redirect: 'manual' })
  const cookie = (response.headers.getSetCookie?.() ?? []).map(value => value.split(';', 1)[0]).join('; ')
  return { entryStatus: response.status, entryLocation: response.headers.get('location'), cookie }
}

const statusPath = '/knowledgeos/status'
try {
  const before = await hashes()
  summary.checks.artifacts_before = before
  record('frozen artifacts present before cycle', JSON.stringify(before) === JSON.stringify(FROZEN), before)

  // Control: with the bundle installed, a valid cookie reads 200 and a bogus
  // cookie is rejected with 401/403 by the same route.
  const controlEntry = await startHost('control-installed')
  const control = await getSession(controlEntry)
  const controlValid = await fetchProbe(statusPath, control.cookie)
  const controlInvalid = await fetchProbe(statusPath, 'dsh-auth-invalid=probe')
  const controlRootValid = await fetchProbe('/', control.cookie)
  const controlRootAnon = await fetchProbe('/', '')
  summary.checks.control = {
    entry_status: control.entryStatus,
    status_valid_cookie: controlValid.status,
    status_invalid_cookie: controlInvalid.status,
    root_valid_cookie: controlRootValid.status,
    root_anonymous: controlRootAnon.status,
  }
  record('control: valid cookie reads the live route', controlValid.status === 200, summary.checks.control)
  record('control: bogus cookie is rejected by the live route', controlInvalid.status === 401 || controlInvalid.status === 403, summary.checks.control)
  record('control: a fresh cookie authenticates the existing page route',
    controlRootValid.status === 200 && controlRootAnon.status !== 200, summary.checks.control)
  await stopHost()

  // Remove with the fixed CLI, exactly as the lifecycle requires.
  const remove = cli('plugin', '--profile', profile, 'remove', 'knowledgeos-panel')
  summary.checks.remove = { exit: remove.status, stdout: remove.stdout.trim(), stderr: remove.stderr.trim() }
  record('fixed CLI remove exited 0', remove.status === 0, summary.checks.remove)
  const afterRemove = await profileManifest()
  summary.checks.profile_after_remove = {
    dependency: afterRemove.dependencies?.['knowledgeos-panel'] ?? null,
    bundles: afterRemove.dsh?.profile?.bundles ?? [],
  }
  record('profile no longer references the bundle',
    summary.checks.profile_after_remove.dependency === null
      && summary.checks.profile_after_remove.bundles.includes('knowledgeos-panel') === false,
    summary.checks.profile_after_remove)

  // Removed state: restart, prove the Host and the fresh session are valid on
  // an existing route, then read the removed feature route with that session.
  const removedEntry = await startHost('after-remove')
  const removed = await getSession(removedEntry)
  const rootValid = await fetchProbe('/', removed.cookie)
  const rootAnon = await fetchProbe('/', '')
  const removedStatus = await fetchProbe(statusPath, removed.cookie)
  const removedStatusAnon = await fetchProbe(statusPath, '')
  summary.checks.removed = {
    entry_status: removed.entryStatus,
    root_valid_cookie: rootValid.status,
    root_anonymous: rootAnon.status,
    feature_route_valid_cookie: removedStatus.status,
    feature_route_anonymous: removedStatusAnon.status,
    feature_route_content_type: removedStatus.contentType,
    feature_route_body_prefix: removedStatus.bodyPrefix,
  }
  record('removed Host is reachable and the fresh cookie is valid',
    rootValid.status === 200 && rootAnon.status !== 200, summary.checks.removed)
  record('removed feature route returns 404 (not 200, not an auth failure)',
    removedStatus.status === 404, summary.checks.removed)
  record('removed feature route is not the KnowledgeOS payload',
    removedStatus.bodyPrefix.includes('"product":"KnowledgeOS"') === false, summary.checks.removed)
  await stopHost()

  // Reinstall the same checkout, restart, and read the route again.
  const add = cli('plugin', '--profile', profile, 'add', pluginPath)
  summary.checks.reinstall = { exit: add.status, stdout: add.stdout.trim(), stderr: add.stderr.trim() }
  record('fixed CLI reinstall exited 0', add.status === 0, summary.checks.reinstall)
  const restoredManifest = await profileManifest()
  summary.checks.profile_after_reinstall = {
    dependency: restoredManifest.dependencies?.['knowledgeos-panel'] ?? null,
    bundles: restoredManifest.dsh?.profile?.bundles ?? [],
  }
  record('profile links back to the candidate checkout',
    typeof summary.checks.profile_after_reinstall.dependency === 'string'
      && summary.checks.profile_after_reinstall.dependency.toLowerCase().includes('packages/knowledgeos-panel'),
    summary.checks.profile_after_reinstall)

  const restoredEntry = await startHost('after-reinstall')
  const restored = await getSession(restoredEntry)
  const restoredStatus = await fetchProbe(statusPath, restored.cookie)
  summary.checks.restored = {
    entry_status: restored.entryStatus,
    feature_route_valid_cookie: restoredStatus.status,
    feature_route_content_type: restoredStatus.contentType,
  }
  record('reinstalled route is live with a valid cookie again', restoredStatus.status === 200, summary.checks.restored)
  const after = await hashes()
  summary.checks.artifacts_after = after
  record('reinstalled artifacts equal the frozen candidate bytes',
    JSON.stringify(after) === JSON.stringify(FROZEN), { before, after })
  await stopHost()
} catch (error) {
  record('unexpected exception', false, { message: error instanceof Error ? error.message : String(error) })
} finally {
  await stopHost()
  try {
    const manifest = await profileManifest()
    if ((manifest.dsh?.profile?.bundles ?? []).includes('knowledgeos-panel') === false) {
      const recovery = cli('plugin', '--profile', profile, 'add', pluginPath)
      summary.checks.recovery = { exit: recovery.status, stdout: recovery.stdout.trim(), stderr: recovery.stderr.trim() }
      if (recovery.status !== 0) summary.failures.push('emergency recovery failed; profile is missing the bundle')
    }
  } catch (error) {
    summary.failures.push(`profile inspection failed: ${String(error)}`)
  }
  summary.finished_at = new Date().toISOString()
  summary.result = summary.failures.length === 0 ? 'PASS' : 'FAIL'
  await writeFile(join(outDir, 'remove-auth-probe.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ result: summary.result, failures: summary.failures, out: outDir }, null, 2))
  process.exit(summary.result === 'PASS' ? 0 : 1)
}