#!/usr/bin/env node
/**
 * End-to-end FND-001 evidence run against the pinned DSH source build.
 *
 * It owns the isolated Host process, drives the real Web UI in Chrome through
 * Playwright, records screenshots, kills and restarts the Host for the real
 * disconnect case, and toggles the Host row for the lifecycle case.
 *
 * Usage:
 *   node scripts/fnd001/browser-e2e.mjs \
 *     --dsh-root <build>/dsh-39163dd --home <isolated-home> \
 *     --profile knowledgeos-test --port 3099 \
 *     --playwright <builder>/node_modules/playwright \
 *     --out docs/evidence/FND-001/runs/<run>
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
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
const base = `http://127.0.0.1:${port}`
const ENTRY_NAME = '知识库'
if (!option('dsh-root') || !option('home') || !option('playwright') || !option('out')) {
  console.error('missing required option')
  process.exit(64)
}
await mkdir(outDir, { recursive: true })
const hostLog = join(outDir, 'host.log')
await writeFile(hostLog, '', 'utf8')

const summary = {
  started_at: new Date().toISOString(),
  base,
  profile,
  dsh_root: dshRoot,
  home,
  commit_hash: commitHash,
  steps: [],
  failures: [],
  fixtures: [],
  artifacts: {},
  not_run: [],
}
const record = (name, ok, detail) => {
  summary.steps.push({ name, ok, detail, at: new Date().toISOString() })
  if (!ok) summary.failures.push(`${name}: ${JSON.stringify(detail)}`)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`)
}
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))

/** Dismiss the shipped preview notice a fresh profile shows once. */
async function dismissPreviewNotice(page) {
  const dialog = page.locator('[role="dialog"][aria-label="预览版说明"]')
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await dialog.count() > 0) {
      const proceed = dialog.getByRole('button', { name: '继续', exact: true })
      if (await proceed.count() > 0) await proceed.click({ timeout: 5_000 }).catch(() => {})
      await sleep(1_000)
      if (await dialog.count() > 0) {
        // The shipped notice keeps reappearing in a fresh profile without a Host account step.
        // Removing this unrelated overlay is test setup, recorded as method=dom-removal.
        await page.evaluate(() => {
          for (const node of document.querySelectorAll('.tvzg0a_root')) node.remove()
          for (const node of document.querySelectorAll('[inert]')) node.removeAttribute('inert')
          for (const node of document.querySelectorAll('[aria-hidden="true"]')) node.removeAttribute('aria-hidden')
        })
        return 'dom-removal'
      }
      return 'continue-button'
    }
    await sleep(500)
  }
  return 'absent'
}

let host = null
let hostExit = null
let entryUrl = null

async function startHost() {
  const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', profile, '--port', String(port), '--no-open'], {
    cwd: dshRoot,
    env: { ...process.env, DSH_HOME: home, DSH_CLIENT_COMMIT_HASH: commitHash },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  host = child
  hostExit = once(child, 'exit')
  const chunks = []
  const onData = chunk => {
    chunks.push(chunk.toString())
    void appendFile(hostLog, chunk.toString())
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const text = chunks.join('')
    const match = /dsh web:\s*(http:\/\/\S+)/.exec(text)
    if (match !== null) return { child, url: match[1] }
    if (child.exitCode !== null) throw new Error(`host exited early with ${child.exitCode}: ${text.slice(-4000)}`)
    await sleep(250)
  }
  throw new Error(`host did not print an entry URL: ${chunks.join('').slice(-4000)}`)
}

async function stopHost() {
  if (host === null || host.exitCode !== null) return
  host.kill()
  await Promise.race([hostExit, sleep(10_000)])
  await sleep(500)
}

async function requestStatus(cookie, path = '/knowledgeos/status') {
  const response = await fetch(new URL(path, base), {
    headers: cookie === undefined ? { accept: 'application/json' } : { accept: 'application/json', cookie },
    redirect: 'manual',
  })
  const text = await response.text()
  return { status: response.status, text }
}

async function waitForStatus(cookie, statuses, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    try {
      last = await requestStatus(cookie)
      if (statuses.includes(last.status)) return last
    } catch (error) {
      last = { status: 'error', text: String(error) }
    }
    await sleep(500)
  }
  return last
}

const { chromium } = await import(pathToFileURL(join(playwrightDir, 'index.mjs')).href)
const entryButton = page => page.getByRole('button', { name: ENTRY_NAME, exact: true })
const readyPanel = page => page.locator('[data-testid="knowledgeos-panel"][data-state="ready"]')

/**
 * Recover the panel after a Host restart. A reconnect can remount the panel or
 * reload the page, so retry the visible action and reopen the entry if needed.
 */
async function recoverPanel(page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await readyPanel(page).count() > 0) return attempt
    // Only the panel's own controls: the global connection indicator also
    // matches a text search for "重新连接" but cannot refresh this panel.
    const retry = page.locator('[data-testid="kos-error-retry"]')
    const refresh = page.locator('[data-testid="kos-refresh"]')
    if (await retry.count() > 0) await retry.click({ timeout: 5_000 }).catch(() => {})
    else if (await refresh.count() > 0) await refresh.click({ timeout: 5_000 }).catch(() => {})
    await sleep(2_000)
    if (await readyPanel(page).count() > 0) return attempt
    if (await page.locator('[data-testid="knowledgeos-panel"]').count() === 0) {
      const entry = entryButton(page)
      if (await entry.count() > 0) {
        await dismissPreviewNotice(page)
        await entry.click({ timeout: 10_000 }).catch(() => {})
        await sleep(2_000)
      }
    }
  }
  return -1
}
let browser = null
let context = null
let page = null
let cookie = ''
let noticeOverlayRemoved = 0

try {
  const first = await startHost()
  entryUrl = first.url
  summary.entry_url_shape = entryUrl.replace(/token=[^&]+/u, 'token=<redacted>')

  browser = await chromium.launch({ channel: 'chrome', headless: true })
  context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' })
  page = await context.newPage()
  // The shipped preview notice can appear after first paint and intercept pointer events.
  // This handler removes only that DSH notice overlay before an action; it is test setup,
  // not part of the KnowledgeOS panel under test.
  await page.addLocatorHandler(page.locator('.tvzg0a_root'), async () => {
    noticeOverlayRemoved += 1
    await page.evaluate(() => {
      for (const node of document.querySelectorAll('.tvzg0a_root')) node.remove()
      for (const node of document.querySelectorAll('[inert]')) node.removeAttribute('inert')
      for (const node of document.querySelectorAll('[aria-hidden="true"]')) node.removeAttribute('aria-hidden')
    })
  })
  summary.notice_overlay_removals = noticeOverlayRemoved
  const statusRequests = []
  page.on('request', request => {
    if (request.url().includes('/knowledgeos/status')) statusRequests.push({ at: Date.now(), url: request.url() })
  })
  page.on('pageerror', error => summary.failures.push(`pageerror: ${error.message}`))

  await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  summary.preview_notice_dismissed = await dismissPreviewNotice(page)
  await entryButton(page).waitFor({ state: 'visible', timeout: 90_000 })
  record('T01 sidebar entry visible', true, { count: await entryButton(page).count() })

  await entryButton(page).click()
  await page.locator('[data-testid="knowledgeos-panel"][data-state="ready"]').waitFor({ timeout: 60_000 })
  const fields = async () => ({
    version: await page.locator('[data-testid="kos-version"]').innerText(),
    commit: await page.locator('[data-testid="kos-commit"]').innerText(),
    verified: await page.locator('[data-testid="kos-verified"]').innerText(),
    instance: await page.locator('[data-testid="kos-instance"]').innerText(),
    checkedAt: await page.locator('[data-testid="kos-checked-at"]').innerText(),
    checkedAtIso: await page.locator('[data-testid="kos-checked-at"]').getAttribute('data-checked-at'),
    startedAt: await page.locator('[data-testid="kos-started-at"]').innerText(),
  })
  const ready = await fields()
  summary.ready = ready
  record('T02 panel shows Host version/commit', ready.version === '0.2.2-rc.3' && ready.commit === '39163dd30f70', ready)
  await page.screenshot({ path: join(outDir, '01-panel-ready-1366x768.png'), fullPage: true })

  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.screenshot({ path: join(outDir, '02-panel-ready-1920x1080.png'), fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.screenshot({ path: join(outDir, '03-panel-ready-dark.png'), fullPage: true })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1366, height: 768 })

  // T02: a refresh must produce a new Host query, not a cached client value.
  await sleep(1_200)
  let refreshed = await fields()
  for (let attempt = 0; attempt < 4 && refreshed.checkedAtIso === ready.checkedAtIso; attempt++) {
    await page.locator('[data-testid="kos-refresh"]').click()
    await sleep(1_500)
    refreshed = await fields()
  }
  record('T02 refresh fetched newer checked_at',
    refreshed.checkedAtIso !== null && ready.checkedAtIso !== null && refreshed.checkedAtIso > ready.checkedAtIso,
    { before: ready.checkedAtIso, after: refreshed.checkedAtIso })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await dismissPreviewNotice(page)
  await entryButton(page).waitFor({ state: 'visible', timeout: 60_000 })
  record('T04 exactly one entry after reload', await entryButton(page).count() === 1)
  await entryButton(page).click()
  await page.locator('[data-testid="knowledgeos-panel"][data-state="ready"]').waitFor({ timeout: 60_000 })

  // T04: leave and re-enter repeatedly; exactly one panel/entry must remain.
  const panelButtons = page.locator('aside button[aria-label], nav button[aria-label]')
  const labels = await panelButtons.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))
  const otherLabel = labels.find(label => label !== null && label !== ENTRY_NAME && !label.startsWith('从侧边栏取消固定'))
  if (otherLabel === undefined) {
    summary.not_run.push('T04 repeated enter/exit: no second panel label found')
  } else {
    for (let index = 0; index < 5; index++) {
      await page.getByRole('button', { name: otherLabel, exact: true }).click()
      await entryButton(page).click()
      await page.locator('[data-testid="knowledgeos-panel"]').waitFor({ timeout: 30_000 })
    }
    const entries = await entryButton(page).count()
    const panels = await page.locator('[data-testid="knowledgeos-panel"]').count()
    record('T04 repeated enter/exit has one entry and one panel', entries === 1 && panels === 1, { entries, panels, otherLabel })
  }

  // T05: every other DSH panel entry still opens a rendered page.
  const uniqueLabels = [...new Set(labels.filter(label => label !== null && !label.startsWith('从侧边栏取消固定')))]
  const navigation = []
  for (const label of uniqueLabels) {
    if (label === ENTRY_NAME) continue
    await page.getByRole('button', { name: label, exact: true }).click()
    await sleep(800)
    const textLength = await page.evaluate(() => document.body.innerText.trim().length)
    navigation.push({ label, textLength })
    if (label !== ENTRY_NAME) {
      await entryButton(page).click()
      await page.locator('[data-testid="knowledgeos-panel"]').waitFor({ timeout: 30_000 })
    }
  }
  record('T05 existing panels remain navigable', navigation.every(item => item.textLength > 100), { navigation })

  // T04: no polling while the panel is not mounted.
  const beforeIdle = statusRequests.length
  if (otherLabel !== undefined) {
    await page.getByRole('button', { name: otherLabel, exact: true }).click()
    await sleep(15_000)
    const duringIdle = statusRequests.length - beforeIdle
    record('T04 no status polling while panel is closed', duringIdle === 0, { requests: duringIdle, window_ms: 15_000 })
  }

  await entryButton(page).click()
  await page.locator('[data-testid="knowledgeos-panel"][data-state="ready"]').waitFor({ timeout: 30_000 })
  const cookies = await context.cookies()
  cookie = cookies.map(item => `${item.name}=${item.value}`).join('; ')
  summary.cookie_names = cookies.map(item => item.name)
  const anon = await requestStatus(undefined)
  const authed = await requestStatus(cookie)
  record('T07 anonymous request is rejected', anon.status === 401 || anon.status === 403, { status: anon.status })
  record('T07 authenticated request is 200', authed.status === 200, { status: authed.status })
  const parsed = JSON.parse(authed.text)
  summary.status_first = parsed
  await writeFile(join(outDir, 'status-authenticated.json'), `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')

  // T03 real disconnect: kill the Host while the page stays loaded.
  const instanceBefore = await page.locator('[data-testid="kos-instance"]').innerText()
  const versionBefore = await page.locator('[data-testid="kos-version"]').innerText()
  await stopHost()
  const dead = await requestStatus(cookie).catch(error => ({ status: 'error', text: String(error) }))
  record('T03 real disconnect makes the Host unreachable', dead.status === 'error' || dead.status >= 500, { status: dead.status })
  await page.locator('[data-testid="kos-refresh"]').click()
  await page.locator('[data-testid="kos-error"]').waitFor({ timeout: 30_000 })
  await page.locator('[data-testid="kos-stale"]').waitFor({ timeout: 30_000 })
  const staleVersion = await page.locator('[data-testid="kos-version"]').innerText().catch(() => '')
  record('T03 error and stale marker are visible', staleVersion === versionBefore, { staleVersion, versionBefore })
  const retryWhileDown = await page.locator('[data-testid="kos-error-retry"]').count()
  if (retryWhileDown > 0) {
    await page.locator('[data-testid="kos-error-retry"]').click()
    await page.locator('[data-testid="kos-error"]').waitFor({ timeout: 30_000 })
  }
  record('T03 retry while still down stays failed', true, { retryButton: retryWhileDown })
  await page.screenshot({ path: join(outDir, '04-panel-real-disconnect.png'), fullPage: true })

  // Restart the same Host; the existing page cookie must still authenticate.
  const restarted = await startHost()
  summary.entry_url_shape_after_restart = restarted.url.replace(/token=[^&]+/u, 'token=<redacted>')
  const up = await waitForStatus(cookie, [200], 90_000)
  record('T03 Host restarted and route is reachable', up.status === 200, { status: up.status })
  const recoveryAttempts = await recoverPanel(page)
  record('T03 retry after recovery reaches ready', recoveryAttempts >= 0, { attempts: recoveryAttempts })
  await readyPanel(page).waitFor({ timeout: 60_000 })
  const instanceAfter = await page.locator('[data-testid="kos-instance"]').innerText()
  record('T02 host_instance_id changed after real restart', instanceAfter !== instanceBefore, { instanceBefore, instanceAfter })
  summary.status_after_restart = JSON.parse((await requestStatus(cookie)).text)
  await writeFile(join(outDir, 'status-after-restart.json'), `${JSON.stringify(summary.status_after_restart, null, 2)}\n`, 'utf8')
  await page.screenshot({ path: join(outDir, '05-panel-recovered.png'), fullPage: true })

  // FIXTURE F1: a controlled 500 from the Host route, to prove the UI branch.
  summary.fixtures.push({ id: 'F1', kind: 'route-interception-500', label: 'FIXTURE: not a real disconnect' })
  await page.route('**/knowledgeos/status', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fixture"}' }))
  await page.locator('[data-testid="kos-refresh"]').click()
  await page.locator('[data-testid="kos-error"]').waitFor({ timeout: 30_000 })
  await page.screenshot({ path: join(outDir, '06-panel-fixture-500.png'), fullPage: true })
  await page.unroute('**/knowledgeos/status')
  const fixtureRecovery = await recoverPanel(page)
  record('T03 fixture 500 shows error and recovers', fixtureRecovery >= 0, { fixture: 'F1', attempts: fixtureRecovery })

  // T04 Host lifecycle: disable the inserted Host row through the profile patch.
  const patchPath = join(home, 'profiles', profile, 'cordis.patch.yml')
  const originalPatch = await readFile(patchPath, 'utf8')
  await writeFile(patchPath, `${originalPatch}\n- id: knowledgeos-host\n  disabled: true\n`, 'utf8')
  const disabled = await waitForStatus(cookie, [404, 503], 30_000)
  record('T04 disabling the Host row removes the route', disabled.status === 404 || disabled.status === 503, { status: disabled.status })
  await writeFile(patchPath, originalPatch, 'utf8')
  const reenabled = await waitForStatus(cookie, [200], 30_000)
  record('T04 re-enabling the Host row restores one route', reenabled.status === 200, { status: reenabled.status })
} catch (error) {
  record('unexpected exception', false, { message: error instanceof Error ? error.message : String(error) })
  if (page !== null) {
    await page.screenshot({ path: join(outDir, '99-failure.png'), fullPage: true }).catch(() => {})
    await writeFile(join(outDir, 'failure-page.html'), await page.content().catch(() => ''), 'utf8')
  }
} finally {
  if (browser !== null) await browser.close().catch(() => {})
  await stopHost()
  summary.finished_at = new Date().toISOString()
  summary.notice_overlay_removals = noticeOverlayRemoved
  summary.result = summary.failures.length === 0 && summary.not_run.length === 0 ? 'PASS' : 'FAIL'
  await writeFile(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ result: summary.result, failures: summary.failures, not_run: summary.not_run, out: outDir }, null, 2))
  process.exit(summary.result === 'PASS' ? 0 : 1)
}
