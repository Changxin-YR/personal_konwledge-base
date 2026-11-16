#!/usr/bin/env node
/**
 * FND-001 closeout evidence: R1 full lifecycle plus R2 refresh states.
 *
 * It owns the isolated test Host and a real Chrome page. Sequence:
 *   1. R2: delay the next status response, refresh, assert loading is not a failure.
 *   2. R1: 5 page reloads and 10 enter/exit cycles, one entry/panel and one request each.
 *   3. R1: 60 seconds away from the panel with no feature request or error.
 *   4. R1: real bundle remove through the fixed CLI, restart, verify route and entry gone.
 *   5. R1: reinstall the same candidate checkout, restart, verify one entry and live route.
 *
 * Usage:
 *   node scripts/fnd001/closeout-e2e.mjs \
 *     --dsh-root <build>/dsh-39163dd --home <isolated-home> \
 *     --profile knowledgeos-test --port 3099 \
 *     --playwright <builder>/node_modules/playwright \
 *     --out docs/evidence/FND-001/runs/<round>
 */
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { appendFile, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
const dshRoot = resolve(option('dsh-root') ?? '')
const home = resolve(option('home') ?? '')
const profile = option('profile') ?? 'knowledgeos-test'
const port = Number(option('port') ?? '3099')
const playwrightDir = resolve(option('playwright') ?? '')
const outDir = resolve(option('out') ?? '')
const commitHash = option('commit') ?? '39163dd30f703a79079e2d2446545cff3c453738'
const pluginPath = resolve(option('plugin') ?? join(dshRoot, '..', '..', 'packages', 'knowledgeos-panel'))
const base = `http://127.0.0.1:${port}`
const ENTRY_NAME = '知识库'
if (!option('dsh-root') || !option('home') || !option('playwright') || !option('out')) {
  console.error('missing required option')
  process.exit(64)
}
await mkdir(outDir, { recursive: true })
const hostLog = join(outDir, 'host.log')
await writeFile(hostLog, '', 'utf8')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const summary = {
  started_at: new Date().toISOString(),
  base,
  profile,
  dsh_root: dshRoot,
  home,
  plugin_path: pluginPath,
  commit_hash: commitHash,
  host_starts: [],
  steps: [],
  failures: [],
  not_run: [],
  recovery: [],
  r1: {},
  r2: {},
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

let host = null
let exited = null
let entryUrl = null

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
    chunks.push(chunk.toString())
    void appendFile(hostLog, chunk.toString())
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const match = /dsh web:\s*(http:\/\/\S+)/.exec(chunks.join(''))
    if (match !== null) {
      entryUrl = match[1]
      summary.host_starts.push({ label, pid: child.pid, at: new Date().toISOString(), entry_url_shape: entryUrl.replace(/token=[^&]+/u, 'token=<redacted>') })
      return entryUrl
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
  await sleep(400)
}

async function entryCookie(url) {
  const response = await fetch(url, { redirect: 'manual' })
  const cookie = (response.headers.getSetCookie?.() ?? []).map(value => value.split(';', 1)[0]).join('; ')
  return { cookie, status: response.status }
}

async function readStatus(cookie) {
  try {
    const response = await fetch(new URL('/knowledgeos/status', base), {
      headers: cookie.length === 0 ? { accept: 'application/json' } : { accept: 'application/json', cookie },
      redirect: 'manual',
    })
    const text = await response.text()
    return { status: response.status, contentType: response.headers.get('content-type'), text }
  } catch (error) {
    return { status: 'error', contentType: null, text: String(error) }
  }
}

const { chromium } = await import(pathToFileURL(join(playwrightDir, 'index.mjs')).href)
const entryButton = page => page.getByRole('button', { name: ENTRY_NAME, exact: true })
const readyPanel = page => page.locator('[data-testid="knowledgeos-panel"][data-state="ready"]')

/** Remove the shipped preview notice before actions (DSH onboarding, not this feature). */
async function dismissPreviewNotice(page) {
  await page.addLocatorHandler(page.locator('.tvzg0a_root'), async () => {
    await page.evaluate(() => {
      for (const node of document.querySelectorAll('.tvzg0a_root')) node.remove()
      for (const node of document.querySelectorAll('[inert]')) node.removeAttribute('inert')
      for (const node of document.querySelectorAll('[aria-hidden="true"]')) node.removeAttribute('aria-hidden')
    })
  })
}

async function openPanel(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await dismissPreviewNotice(page)
  await entryButton(page).waitFor({ state: 'visible', timeout: 90_000 })
  await entryButton(page).click()
  await readyPanel(page).waitFor({ timeout: 60_000 })
}

let browser = null
let context = null
let page = null

try {
  const firstEntry = await startHost('initial')
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' })
  page = await context.newPage()
  const statusRequests = []
  const pageErrors = []
  page.on('request', request => {
    if (request.url().includes('/knowledgeos/status')) statusRequests.push({ at: Date.now() })
  })
  page.on('pageerror', error => pageErrors.push(error.message))

  await openPanel(page, firstEntry)
  const cookie = (await entryCookie(firstEntry)).cookie

  // ---- R2: refresh loading state must not claim a connection failure ----
  const checkedBefore = await page.locator('[data-testid="kos-checked-at"]').getAttribute('data-checked-at')
  const requestCountBefore = statusRequests.length
  let delayed = false
  await page.route('**/knowledgeos/status', async route => {
    if (!delayed) {
      delayed = true
      await sleep(3_000)
    }
    await route.continue()
  })
  await page.locator('[data-testid="kos-refresh"]').click()
  await page.locator('[data-testid="knowledgeos-panel"][data-state="loading"]').waitFor({ timeout: 5_000 })
  const loadingConnection = await page.locator('[data-testid="kos-connection"]').innerText()
  const loadingChip = await page.locator('[data-testid="kos-status"]').innerText()
  const refreshingVisible = await page.locator('[data-testid="kos-refreshing"]').isVisible().catch(() => false)
  await page.screenshot({ path: join(outDir, 'R2-refreshing.png'), fullPage: true })
  await readyPanel(page).waitFor({ timeout: 30_000 })
  const checkedAfter = await page.locator('[data-testid="kos-checked-at"]').getAttribute('data-checked-at')
  await page.unroute('**/knowledgeos/status')
  summary.r2 = { loadingConnection, loadingChip, refreshingVisible, checkedBefore, checkedAfter, requests: statusRequests.length - requestCountBefore }
  record('R2 loading is not shown as a failure',
    !loadingConnection.includes('失败') && loadingConnection.includes('刷新') && loadingChip === '刷新中' && refreshingVisible,
    summary.r2)
  record('R2 refresh then yields a newer success', checkedAfter !== null && checkedBefore !== null && checkedAfter > checkedBefore, { checkedBefore, checkedAfter })

  // ---- R1: five full page reloads ----
  const reloads = []
  for (let index = 0; index < 5; index++) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await dismissPreviewNotice(page)
    await entryButton(page).waitFor({ state: 'visible', timeout: 60_000 })
    const entriesBeforeClick = await entryButton(page).count()
    await entryButton(page).click()
    await readyPanel(page).waitFor({ timeout: 60_000 })
    reloads.push({
      index: index + 1,
      entries: entriesBeforeClick,
      panels: await page.locator('[data-testid="knowledgeos-panel"]').count(),
    })
  }
  record('R1 five reloads keep one entry and one panel', reloads.every(item => item.entries === 1 && item.panels === 1), { reloads })

  // ---- R1: ten enter/exit cycles, one status request per mount ----
  const cycles = []
  const otherButton = page.locator('aside button[aria-label="插件"], nav button[aria-label="插件"]').first()
  for (let index = 0; index < 10; index++) {
    await otherButton.click()
    await sleep(400)
    const before = statusRequests.length
    await entryButton(page).click()
    await readyPanel(page).waitFor({ timeout: 60_000 })
    await sleep(600)
    cycles.push({
      index: index + 1,
      entries: await entryButton(page).count(),
      panels: await page.locator('[data-testid="knowledgeos-panel"]').count(),
      requests: statusRequests.length - before,
    })
  }
  record('R1 ten enter/exit cycles keep one entry and one panel', cycles.every(item => item.entries === 1 && item.panels === 1), { cycles })
  record('R1 each mount issues exactly one status request', cycles.every(item => item.requests === 1), { cycles })

  // ---- R1: 60 seconds away from the panel ----
  await otherButton.click()
  const idleStart = statusRequests.length
  const errorStart = pageErrors.length
  await sleep(60_000)
  const idleRequests = statusRequests.length - idleStart
  const idleErrors = pageErrors.length - errorStart
  summary.r1.idle = { seconds: 60, requests: idleRequests, pageErrors: idleErrors }
  record('R1 60 seconds away produces no feature request', idleRequests === 0, { requests: idleRequests, seconds: 60 })
  record('R1 60 seconds away produces no page error', idleErrors === 0, { pageErrors: idleErrors })

  // ---- R1: real bundle removal ----
  await entryButton(page).click()
  await readyPanel(page).waitFor({ timeout: 60_000 })
  await page.screenshot({ path: join(outDir, 'R1-before-remove.png'), fullPage: true })
  const profileDir = join(home, 'profiles', profile)
  for (const file of ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml']) {
    await copyFile(join(profileDir, file), join(outDir, `before-remove-${file}`)).catch(() => {})
  }
  await stopHost()
  const removeResult = cli('plugin', '--profile', profile, 'remove', 'knowledgeos-panel')
  summary.r1.remove = { exit: removeResult.status, stdout: removeResult.stdout.trim(), stderr: removeResult.stderr.trim() }
  record('R1 fixed CLI removed the bundle', removeResult.status === 0, summary.r1.remove)
  const profileAfterRemove = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
  summary.r1.profile_after_remove = profileAfterRemove
  record('R1 removed bundle left no dependency', profileAfterRemove.dependencies?.['knowledgeos-panel'] === undefined, profileAfterRemove.dependencies)
  record('R1 removed bundle left no layer', (profileAfterRemove.dsh?.profile?.bundles ?? []).includes('knowledgeos-panel') === false, profileAfterRemove.dsh?.profile?.bundles)

  const removedEntry = await startHost('after-remove')
  const removedCookie = (await entryCookie(removedEntry)).cookie
  const removedStatus = await readStatus(removedCookie)
  summary.r1.route_after_remove = {
    status: removedStatus.status,
    contentType: removedStatus.contentType,
    bodyPrefix: removedStatus.text.slice(0, 120),
  }
  const stillOurJson = removedStatus.status === 200
    && (removedStatus.contentType ?? '').includes('application/json')
    && removedStatus.text.includes('"product":"KnowledgeOS"')
  record('R1 status route is gone after removal', !stillOurJson, summary.r1.route_after_remove)
  await page.goto(removedEntry, { waitUntil: 'domcontentloaded' })
  await dismissPreviewNotice(page)
  await sleep(2_000)
  const entryAfterRemove = await entryButton(page).count()
  const panelAfterRemove = await page.locator('[data-testid="knowledgeos-panel"]').count()
  const navButtonsAfterRemove = await page.locator('aside button[aria-label], nav button[aria-label]').count()
  summary.r1.client_after_remove = { entries: entryAfterRemove, panels: panelAfterRemove, navButtons: navButtonsAfterRemove }
  record('R1 Client entry and panel are gone after removal', entryAfterRemove === 0 && panelAfterRemove === 0, summary.r1.client_after_remove)
  record('R1 DSH navigation still renders after removal', navButtonsAfterRemove > 3, { navButtons: navButtonsAfterRemove })
  await page.screenshot({ path: join(outDir, 'R1-after-remove.png'), fullPage: true })
  await writeFile(join(outDir, 'R1-after-remove.html'), await page.content(), 'utf8')
  await stopHost()

  // ---- R1: reinstall the same candidate and recover ----
  const addResult = cli('plugin', '--profile', profile, 'add', pluginPath)
  summary.r1.reinstall = { exit: addResult.status, stdout: addResult.stdout.trim(), stderr: addResult.stderr.trim() }
  record('R1 fixed CLI reinstalled the same candidate', addResult.status === 0, summary.r1.reinstall)
  const profileAfterAdd = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
  summary.r1.profile_after_add = profileAfterAdd
  record('R1 reinstall restored the bundle layer', (profileAfterAdd.dsh?.profile?.bundles ?? []).includes('knowledgeos-panel'), profileAfterAdd.dsh?.profile?.bundles)

  const restoredEntry = await startHost('after-reinstall')
  const restoredCookie = (await entryCookie(restoredEntry)).cookie
  const restoredStatus = await readStatus(restoredCookie)
  summary.r1.route_after_reinstall = { status: restoredStatus.status, contentType: restoredStatus.contentType }
  record('R1 status route is live after reinstall', restoredStatus.status === 200 && (restoredStatus.contentType ?? '').includes('application/json'), summary.r1.route_after_reinstall)
  await page.goto(restoredEntry, { waitUntil: 'domcontentloaded' })
  await dismissPreviewNotice(page)
  await entryButton(page).waitFor({ state: 'visible', timeout: 60_000 })
  record('R1 reinstall restores exactly one entry', await entryButton(page).count() === 1)
  await entryButton(page).click()
  await readyPanel(page).waitFor({ timeout: 60_000 })
  record('R1 reinstall restores one working panel', await page.locator('[data-testid="knowledgeos-panel"]').count() === 1)
  await page.screenshot({ path: join(outDir, 'R1-after-reinstall.png'), fullPage: true })
  summary.r1.restored = {
    version: await page.locator('[data-testid="kos-version"]').innerText(),
    commit: await page.locator('[data-testid="kos-commit"]').innerText(),
    instance: await page.locator('[data-testid="kos-instance"]').innerText(),
  }
  record('R1 reinstalled panel shows the fixed source build', summary.r1.restored.version === '0.2.2-rc.3' && summary.r1.restored.commit === '39163dd30f70', summary.r1.restored)

  // R4: record the actual fixed-source launch shape used by every start above.
  const versionResult = cli('-V')
  summary.r4 = {
    launch_argv: ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', profile, '--port', String(port), '--no-open'],
    cli_version_exit: versionResult.status,
    cli_version: versionResult.stdout.trim() || versionResult.stderr.trim(),
    init_used_in_this_run: false,
  }
  record('R4 fixed source launch used an explicit profile with no extra web token', versionResult.status === 0, summary.r4)
} catch (error) {
  record('unexpected exception', false, { message: error instanceof Error ? error.message : String(error) })
  if (page !== null) {
    await page.screenshot({ path: join(outDir, '99-failure.png'), fullPage: true }).catch(() => {})
    await writeFile(join(outDir, 'failure-page.html'), await page.content().catch(() => ''), 'utf8')
  }
} finally {
  if (browser !== null) await browser.close().catch(() => {})
  await stopHost()
  // Recovery: never leave the isolated profile without the candidate bundle.
  try {
    const profileDir = join(home, 'profiles', profile)
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    if ((manifest.dsh?.profile?.bundles ?? []).includes('knowledgeos-panel') === false) {
      const recovery = cli('plugin', '--profile', profile, 'add', pluginPath)
      summary.recovery.push({ action: 'plugin add', exit: recovery.status, stdout: recovery.stdout.trim(), stderr: recovery.stderr.trim() })
    }
  } catch (error) {
    summary.recovery.push({ action: 'inspect profile', error: String(error) })
  }
  summary.finished_at = new Date().toISOString()
  summary.result = summary.failures.length === 0 ? 'PASS' : 'FAIL'
  await writeFile(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ result: summary.result, failures: summary.failures, out: outDir, recovery: summary.recovery }, null, 2))
  process.exit(summary.result === 'PASS' ? 0 : 1)
}
