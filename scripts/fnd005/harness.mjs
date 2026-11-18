import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { REPO, startHost, stopHost, entryCookie, cookieFromResponse } from '../fnd003/harness.mjs'
import { api, login, sql, dbPath, databaseFacts } from '../fnd004/harness.mjs'
export { REPO, api, login, sql, dbPath, databaseFacts, stopHost, entryCookie, cookieFromResponse }
export function prepareRun(out, port = 3131, options = {}) {
  const root = mkdtempSync(join(REPO, '.cache/fnd005-')), home = join(root, 'home'), dataDir = join(root, 'data'), profileName = 'knowledgeos-identity-test', profile = join(home, 'profiles', profileName)
  cpSync(join(REPO, '.cache/dsh-home-fnd003/profiles', profileName), profile, { recursive: true })
  mkdirSync(out, { recursive: true }); mkdirSync(dataDir, { recursive: true })
  const fixture = options.fixture !== false
  const barrierDir=join(root,'barriers');mkdirSync(barrierDir,{recursive:true})
  const config = options.ai ?? (fixture ? { provider: 'fnd005-fixture', model: 'controlled-tool-model', maxCalls: 64, timeoutMs: 1000, budgetUsd: .1, inputUsdPerMillion: .001, outputUsdPerMillion: .001 } : {})
  const patch = [{ id: 'knowledgeos-host', config: { dataDir: resolve(dataDir).replaceAll('\\', '/'), ai: config } }]
  if(options.providerRows)patch.push(...options.providerRows)
  if (fixture) patch.push({ insert: [{ id: 'fnd005-provider', name: resolve(REPO, 'scripts/fnd005/fixture-provider.mjs').replaceAll('\\', '/'), config:{probePath:join(root,'unbound-probe.json').replaceAll('\\','/'),barrierDir:barrierDir.replaceAll('\\','/')} }] })
  writeFileSync(join(profile, 'cordis.patch.yml'), JSON.stringify(patch, null, 2))
  return { root, home, dataDir, barrierDir, port, profile: profileName, out, start: () => startHost({ home, profile: profileName, port, logFile: join(root, 'host.log') }) }
}
export async function accounts(run) {
  const host = await run.start(), ownerCookie = (await entryCookie(host.entryUrl)).cookie
  const setup = await api(run.port, ownerCookie, 'POST', '/knowledge/v1/auth/bootstrap', { login_name: 'admin', display_name: '管理员', password: 'Admin password 2026!' })
  if (setup.status !== 201) throw new Error('bootstrap failed '+JSON.stringify(setup.json))
  for (const [name,display] of [['alice','甲'],['bob','乙']]) {
    const r = await api(run.port, '', 'POST', '/knowledge/v1/auth/register', { login_name: name, display_name: display, password: `${display} synthetic password 2026!` })
    if (r.status !== 201) throw new Error('registration failed')
  }
  const alice = await login(run.port, 'alice', '甲 synthetic password 2026!'), bob = await login(run.port, 'bob', '乙 synthetic password 2026!')
  if (alice.response.status !== 200 || bob.response.status !== 200) throw new Error('login failed')
  alice.user=(await api(run.port,alice.cookie,'GET','/knowledge/v1/me')).json.data
  bob.user=(await api(run.port,bob.cookie,'GET','/knowledge/v1/me')).json.data
  return { host, ownerCookie, alice, bob }
}
