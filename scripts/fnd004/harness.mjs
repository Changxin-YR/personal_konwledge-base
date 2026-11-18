import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join, resolve } from 'node:path'
import { REPO, startHost, stopHost, entryCookie, request, cookieFromResponse } from '../fnd003/harness.mjs'

export const FND004_HOME = join(REPO, '.cache', 'dsh-home-fnd004')
export const FND004_PROFILE = 'knowledgeos-identity-test'
export const FND004_PORT = 3121
export const FND004_TEMPLATE_HOME = join(REPO, '.cache', 'dsh-home-fnd003')

export const dbPath = dataDir => join(dataDir, 'knowledgeos.sqlite')
export const jsonHeaders = extra => ({ 'content-type': 'application/json', 'x-knowledgeos-request': '1', ...(extra ?? {}) })
export const jsonBody = value => JSON.stringify(value)

export function prepareProfile(dataDir) {
  const profile = join(FND004_HOME, 'profiles', FND004_PROFILE)
  rmSync(FND004_HOME, { recursive: true, force: true })
  mkdirSync(FND004_HOME, { recursive: true })
  cpSync(join(FND004_TEMPLATE_HOME, 'profiles', FND004_PROFILE), profile, { recursive: true })
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(profile, 'cordis.patch.yml'), `- id: knowledgeos-host\n  config:\n    dataDir: "${resolve(dataDir).replaceAll('\\', '/')}"\n`)
  return { home: FND004_HOME, profile }
}

export async function startDedicatedHost(dataDir, outDir, port = FND004_PORT) {
  const prepared = prepareProfile(dataDir)
  return await startHost({
    home: prepared.home,
    profile: FND004_PROFILE,
    port,
    logFile: join(outDir, 'dsh-host.log'),
  })
}

export function api(port, cookie, method, path, payload, extraHeaders) {
  return request({
    port,
    cookie,
    method,
    path,
    headers: method === 'GET' ? (extraHeaders ?? {}) : jsonHeaders(extraHeaders),
    body: payload === undefined ? undefined : jsonBody(payload),
  })
}

export async function login(port, loginName, password) {
  const response = await api(port, '', 'POST', '/knowledge/v1/auth/login', { login_name: loginName, password })
  return { response, cookie: cookieFromResponse(response), user: response.json?.data }
}

export async function bootstrapAndRegister({ dataDir, outDir, port = FND004_PORT }) {
  const host = await startDedicatedHost(dataDir, outDir, port)
  const ownerCookie = (await entryCookie(host.entryUrl)).cookie
  const bootstrap = await api(port, ownerCookie, 'POST', '/knowledge/v1/auth/bootstrap', { login_name: 'admin', display_name: '管理员', password: 'Admin password 2026!' })
  const registerAlice = await api(port, '', 'POST', '/knowledge/v1/auth/register', { login_name: 'alice', display_name: '甲', password: 'Alice password 2026!' })
  const registerBob = await api(port, '', 'POST', '/knowledge/v1/auth/register', { login_name: 'bob', display_name: '乙', password: 'Bob password 2026!' })
  const admin = await login(port, 'admin', 'Admin password 2026!')
  const alice = await login(port, 'alice', 'Alice password 2026!')
  const bob = await login(port, 'bob', 'Bob password 2026!')
  return { host, ownerCookie, bootstrap, registerAlice, registerBob, admin, alice, bob }
}

export function sql(path, statement, params = []) {
  const db = new DatabaseSync(path, { readOnly: true })
  try { return db.prepare(statement).all(...params) } finally { db.close() }
}

export function databaseFacts(path) {
  return {
    userVersion: Number(sql(path, 'PRAGMA user_version')[0]?.user_version ?? 0),
    applicationId: Number(sql(path, 'PRAGMA application_id')[0]?.application_id ?? 0),
    tables: sql(path, "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type, name"),
    ledger: sql(path, 'SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version'),
  }
}

export { REPO, startHost, stopHost, entryCookie, request, cookieFromResponse }
