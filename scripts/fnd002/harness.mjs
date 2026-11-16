/**
 * Shared harness for FND-002 real Host/HTTP/SQLite tests.
 *
 * Starts and stops only the isolated test Host, resolves its authenticated
 * cookie from the startup entry URL, and offers real HTTP and SQLite probes.
 */
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = fileURLToPath(new URL('../..', import.meta.url))
export const DSH_ROOT = join(REPO, '.cache', 'build', 'dsh-39163dd')
export const DEFAULT_HOME = join(REPO, '.cache', 'dsh-home-fnd002')
export const UPSTREAM_COMMIT = '39163dd30f703a79079e2d2446545cff3c453738'

export const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))

/**
 * Start the isolated Host and wait for its authenticated entry URL.
 * @param {{home?: string, profile?: string, port?: number, logFile?: string, env?: Record<string,string>}} options
 */
export async function startHost(options = {}) {
  const home = options.home ?? DEFAULT_HOME
  const profile = options.profile ?? 'knowledgeos-storage-test'
  const port = options.port ?? 3100
  const logFile = options.logFile ?? join(home, 'host.log')
  await mkdir(home, { recursive: true })
  const child = spawn(process.execPath, [
    '--import', 'tsx/esm', 'apps/cli/src/bin.ts',
    '--profile', profile,
    '--port', String(port),
    '--no-open',
  ], {
    cwd: DSH_ROOT,
    env: { ...process.env, DSH_HOME: home, DSH_CLIENT_COMMIT_HASH: UPSTREAM_COMMIT, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const exited = once(child, 'exit')
  const chunks = []
  const onData = chunk => {
    const raw = chunk.toString()
    chunks.push(raw)
    void appendFile(logFile, raw)
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const match = /dsh web:\s*(http:\/\/\S+)/.exec(chunks.join(''))
    if (match !== null) {
      return { child, exited, entryUrl: match[1], logFile, port, home, profile, output: () => chunks.join('') }
    }
    if (child.exitCode !== null) throw new Error(`host exited early with ${child.exitCode}: ${chunks.join('').slice(-4000)}`)
    await sleep(250)
  }
  throw new Error(`host did not print an entry URL: ${chunks.join('').slice(-4000)}`)
}

/** Stop the Host and wait for exit. */
export async function stopHost(host) {
  if (host === null || host === undefined) return
  if (host.child.exitCode === null) host.child.kill()
  await Promise.race([host.exited, sleep(15_000)])
  await sleep(800)
}

/** Exchange the entry URL token for the browser cookie. */
export async function entryCookie(entryUrl) {
  const response = await fetch(entryUrl, { redirect: 'manual' })
  const cookies = (response.headers.getSetCookie?.() ?? []).map(value => value.split(';', 1)[0])
  return { cookie: cookies.join('; '), status: response.status, cookies }
}

/**
 * Make one real HTTP request.
 * @param {{base?: string, port?: number, method?: string, path: string, cookie?: string, headers?: Record<string,string>, body?: string|Buffer, redirect?: RequestRedirect}} options
 */
export async function request(options) {
  const base = options.base ?? `http://127.0.0.1:${options.port ?? 3100}`
  const headers = { ...(options.headers ?? {}) }
  if (options.cookie !== undefined) headers.cookie = options.cookie
  const response = await fetch(new URL(options.path, base), {
    method: options.method ?? 'GET',
    headers,
    body: options.body,
    redirect: options.redirect ?? 'manual',
  })
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: response.status, headers: response.headers, text, json }
}

/** Read one JSON response body from a file or return undefined. */
export async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return undefined }
}

/** Run the fixed-source DSH CLI (plugin/profile commands). */
export function runCli(cliArgs, options = {}) {
  return spawnSync(process.execPath, [
    '--import', 'tsx/esm', 'apps/cli/src/bin.ts',
    ...cliArgs,
  ], {
    cwd: DSH_ROOT,
    env: { ...process.env, DSH_HOME: options.home ?? DEFAULT_HOME, DSH_CLIENT_COMMIT_HASH: UPSTREAM_COMMIT },
    encoding: 'utf8',
    timeout: 180_000,
    windowsHide: true,
  })
}

/** Write a JSON evidence file with a trailing newline. */
export async function writeEvidence(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

/** Safe relative path label for evidence. */
export function dataDirLabel(dataDir) {
  return dataDir.replace(REPO, '<repo>').replace(/\\/g, '/')
}