/** Shared real Host harness for FND-003. */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = fileURLToPath(new URL('../..', import.meta.url))
export const DSH_ROOT = join(REPO, '.cache', 'build', 'dsh-39163dd')
export const DEFAULT_HOME = join(REPO, '.cache', 'dsh-home-fnd003')
export const DEFAULT_PROFILE = 'knowledgeos-identity-test'
export const DEFAULT_PORT = 3101
export const UPSTREAM_COMMIT = '39163dd30f703a79079e2d2446545cff3c453738'
export const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))

export async function startHost(options = {}) {
  const home = options.home ?? DEFAULT_HOME
  const profile = options.profile ?? DEFAULT_PROFILE
  const port = options.port ?? DEFAULT_PORT
  const logFile = options.logFile ?? join(home, 'host.log')
  await mkdir(home, { recursive: true })
  const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', profile, '--port', String(port), '--no-open'], {
    cwd: DSH_ROOT,
    env: { ...process.env, DSH_HOME: home, DSH_CLIENT_COMMIT_HASH: UPSTREAM_COMMIT, ...(options.env ?? {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const exited = once(child, 'exit')
  const chunks = []
  const onData = chunk => { const raw = chunk.toString(); chunks.push(raw); void appendFile(logFile, raw) }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const match = /dsh web:\s*(http:\/\/\S+)/.exec(chunks.join(''))
    if (match !== null) return { child, exited, entryUrl: match[1], logFile, port, home, profile, output: () => chunks.join('') }
    if (child.exitCode !== null) throw new Error(`host exited early with ${child.exitCode}: ${chunks.join('').slice(-4000)}`)
    await sleep(250)
  }
  throw new Error(`host did not print an entry URL: ${chunks.join('').slice(-4000)}`)
}

export async function stopHost(host) {
  if (host === undefined || host === null) return
  if (host.child.exitCode === null) host.child.kill()
  await Promise.race([host.exited, sleep(15_000)])
  await sleep(700)
}

export async function entryCookie(entryUrl) {
  const response = await fetch(entryUrl, { redirect: 'manual' })
  const cookies = (response.headers.getSetCookie?.() ?? []).map(value => value.split(';', 1)[0])
  return { cookie: cookies.join('; '), cookies, status: response.status }
}

export function cookieFromResponse(response) {
  const values = response.headers.getSetCookie?.() ?? []
  return values.map(value => value.split(';', 1)[0]).join('; ')
}

export async function request(options) {
  const base = options.base ?? `http://127.0.0.1:${options.port ?? DEFAULT_PORT}`
  const headers = { ...(options.headers ?? {}) }
  if (options.cookie !== undefined && options.cookie !== '') headers.cookie = options.cookie
  const response = await fetch(new URL(options.path, base), { method: options.method ?? 'GET', headers, body: options.body, redirect: options.redirect ?? 'manual' })
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: response.status, headers: response.headers, text, json }
}

export async function requestWithHost(options) {
  const base = new URL(options.base ?? `http://127.0.0.1:${options.port ?? DEFAULT_PORT}`)
  const headers = { ...(options.headers ?? {}) }
  if (options.cookie !== undefined && options.cookie !== '') headers.cookie = options.cookie
  return await new Promise(resolveRequest => {
    const req = httpRequest({ hostname: base.hostname, port: Number(base.port), path: options.path, method: options.method ?? 'GET', headers }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8'); let json
        try { json = JSON.parse(text) } catch { json = undefined }
        resolveRequest({ status: response.statusCode ?? 0, headers: response.headers, text, json })
      })
    })
    req.on('error', error => resolveRequest({ status: 0, headers: new Headers(), text: String(error), json: undefined }))
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

export async function writeEvidence(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return undefined }
}
