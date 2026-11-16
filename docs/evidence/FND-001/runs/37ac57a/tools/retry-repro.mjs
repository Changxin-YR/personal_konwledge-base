#!/usr/bin/env node
/**
 * Independent observation tool (not product code, not part of the candidate).
 *
 * Purpose: determine whether the KnowledgeOS panel's own retry control recovers
 * after a real Host restart, or whether the shipped browser-e2e failure is an
 * ambiguous-selector / timing artifact. It starts and stops the same isolated
 * test Host on 3099 and drives Chrome through Playwright.
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
if (!option('dsh-root') || !option('home') || !option('playwright') || !option('out')) {
  console.error('missing required option')
  process.exit(64)
}
await mkdir(outDir, { recursive: true })
const hostLog = join(outDir, 'host.log')
await writeFile(hostLog, '', 'utf8')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const events = []
const log = (name, detail) => {
  events.push({ at: new Date().toISOString(), name, detail })
  console.log(`${name} ${detail === undefined ? '' : JSON.stringify(detail)}`)
}

let host = null
let hostExit = null
async function startHost(label) {
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
    const text = chunk.toString()
    chunks.push(text)
    void appendFile(hostLog, text)
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const match = /dsh web:\s*(http:\/\/\S+)/.exec(chunks.join(''))
    if (match !== null) return match[1]
    if (child.exitCode !== null) throw new Error(`host exited early ${child.exitCode}`)
    await sleep(250)
  }
  throw new Error('no entry URL')
}
async function stopHost() {
  if (host === null || host.exitCode !== null) return
  host.kill()
  await Promise.race([hostExit, sleep(10_000)])
  await sleep(500)
}
async function entryCookie(entryUrl) {
  const response = await fetch(new URL(entryUrl), { redirect: 'manual' })
  const cookie = (response.headers.getSetCookie?.() ?? []).map(v => v.split(';', 1)[0]).join('; ')
  return { cookie, status: response.status }
}
async function statusWith(cookie) {
  try {
    const response = await fetch(new URL('/knowledgeos/status', base), {
      headers: { accept: 'application/json', ...(cookie ? { cookie } : {}) },
      redirect: 'manual',
    })
    return { status: response.status, body: await response.text() }
  } catch (error) {
    return { status: 'error', body: String(error) }
  }
}

const { chromium } = await import(pathToFileURL(join(playwrightDir, 'index.mjs')).href)
let browser = null
try {
  const firstEntry = await startHost('1')
  const { cookie } = await entryCookie(firstEntry)
  log('host-1-entry', { cookie: cookie.length > 0 })
  log('node-status-before', await statusWith(cookie))

  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' })
  const page = await context.newPage()
  const statusEvents = []
  page.on('request', r => { if (r.url().includes('/knowledgeos/status')) statusEvents.push({ at: Date.now(), kind: 'request', url: r.url() }) })
  page.on('response', async r => {
    if (r.url().includes('/knowledgeos/status')) statusEvents.push({ at: Date.now(), kind: 'response', status: r.status() })
  })
  page.on('requestfailed', r => {
    if (r.url().includes('/knowledgeos/status')) statusEvents.push({ at: Date.now(), kind: 'requestfailed', failure: r.failure()?.errorText })
  })
  page.on('pageerror', e => log('pageerror', { message: e.message }))
  page.on('console', m => { if (m.type() === 'error') log('console-error', { text: m.text() }) })
  await page.addLocatorHandler(page.locator('.tvzg0a_root'), async () => {
    await page.evaluate(() => {
      for (const node of document.querySelectorAll('.tvzg0a_root')) node.remove()
      for (const node of document.querySelectorAll('[inert]')) node.removeAttribute('inert')
      for (const node of document.querySelectorAll('[aria-hidden="true"]')) node.removeAttribute('aria-hidden')
    })
  })
  const dismiss = async () => {
    const dialog = page.locator('[role="dialog"][aria-label="预览版说明"]')
    for (let i = 0; i < 20; i++) {
      if (await dialog.count() > 0) {
        const proceed = dialog.getByRole('button', { name: '继续', exact: true })
        if (await proceed.count() > 0) await proceed.click({ timeout: 5_000 }).catch(() => {})
        await sleep(800)
        if (await dialog.count() > 0) {
          await page.evaluate(() => {
            for (const node of document.querySelectorAll('.tvzg0a_root')) node.remove()
            for (const node of document.querySelectorAll('[inert]')) node.removeAttribute('inert')
            for (const node of document.querySelectorAll('[aria-hidden="true"]')) node.removeAttribute('aria-hidden')
          })
        }
        return
      }
      await sleep(400)
    }
  }
  await page.goto(firstEntry, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await dismiss()
  const entry = page.getByRole('button', { name: '知识库', exact: true })
  await entry.waitFor({ state: 'visible', timeout: 90_000 })
  await entry.click()
  const panel = page.locator('[data-testid="knowledgeos-panel"]')
  await page.locator('[data-testid="knowledgeos-panel"][data-state="ready"]').waitFor({ timeout: 60_000 })
  const read = async () => ({
    state: await panel.getAttribute('data-state'),
    instance: await page.locator('[data-testid="kos-instance"]').innerText().catch(() => null),
    checkedAt: await page.locator('[data-testid="kos-checked-at"]').getAttribute('data-checked-at').catch(() => null),
    error: await page.locator('[data-testid="kos-error"]').innerText().catch(() => null),
    failedAt: await page.locator('[data-testid="kos-error"]').locator('p').nth(1).innerText().catch(() => null),
  })
  const readyBefore = await read()
  log('panel-ready-before', readyBefore)

  await stopHost()
  log('node-status-down', await statusWith(cookie))
  await page.locator('[data-testid="kos-refresh"]').click()
  await page.locator('[data-testid="kos-error"]').waitFor({ timeout: 30_000 })
  await page.locator('[data-testid="kos-stale"]').waitFor({ timeout: 30_000 })
  log('panel-error-after-disconnect', await read())

  const restartedEntry = await startHost('2')
  log('host-2-entry', { cookieLength: (await entryCookie(restartedEntry)).cookie.length })
  let up = null
  for (let i = 0; i < 120; i++) {
    up = await statusWith(cookie)
    if (up.status === 200) break
    await sleep(500)
  }
  log('node-status-after-restart', { status: up.status, body: up.status === 200 ? JSON.parse(up.body) : up.body })

  const waitTransition = async (buttonTestId, label) => {
    const before = statusEvents.length
    await page.locator(`[data-testid="${buttonTestId}"]`).click()
    const transitions = []
    let final = null
    for (let i = 0; i < 40; i++) {
      final = await read()
      transitions.push({ at: new Date().toISOString(), state: final.state })
      if (final.state === 'ready') break
      await sleep(1000)
    }
    const net = statusEvents.slice(before)
    log(`retry-${label}`, {
      clicked: buttonTestId,
      transitions: transitions.map(t => t.state).filter((v, i, a) => i === 0 || v !== a[i - 1]),
      final: await read(),
      network: net,
    })
    await page.screenshot({ path: join(outDir, `after-retry-${label}.png`), fullPage: true })
    return final.state
  }

  const retryState = await waitTransition('kos-error-retry', 'panel-retry')
  if (retryState !== 'ready') {
    await waitTransition('kos-refresh', 'panel-refresh-reconnect')
  }

  // Extra evidence: does a full reload make the page recover and show the new instance?
  await page.reload({ waitUntil: 'domcontentloaded' })
  await dismiss()
  await entry.waitFor({ state: 'visible', timeout: 60_000 })
  await entry.click()
  await page.locator('[data-testid="knowledgeos-panel"][data-state="ready"]').waitFor({ timeout: 60_000 }).catch(() => {})
  log('after-reload', await read())
  await page.screenshot({ path: join(outDir, 'after-reload.png'), fullPage: true })

  await writeFile(join(outDir, 'retry-repro.json'), `${JSON.stringify({ events, statusEvents }, null, 2)}\n`, 'utf8')
} catch (error) {
  log('exception', { message: error instanceof Error ? error.message : String(error) })
  await writeFile(join(outDir, 'retry-repro.json'), `${JSON.stringify({ events, error: String(error) }, null, 2)}\n`, 'utf8')
  process.exitCode = 1
} finally {
  if (browser !== null) await browser.close().catch(() => {})
  await stopHost()
}