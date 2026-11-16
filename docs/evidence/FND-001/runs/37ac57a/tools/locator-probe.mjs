#!/usr/bin/env node
/**
 * Independent observation tool (not product code, not part of the candidate).
 *
 * Reproduces the locator ambiguity in the candidate browser-e2e after a real
 * disconnect: the DSH shell connection indicator is a <button> whose zh
 * "connecting" aria-label contains 重试, so the unscoped regex used by the
 * candidate can select it instead of the KnowledgeOS panel retry.
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
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

const { chromium } = await import(pathToFileURL(join(playwrightDir, 'index.mjs')).href)
let browser = null
try {
  const entryUrl = await startHost()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' })
  const page = await context.newPage()
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
  await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await dismiss()
  const entry = page.getByRole('button', { name: '知识库', exact: true })
  await entry.waitFor({ state: 'visible', timeout: 90_000 })
  await entry.click()
  await page.locator('[data-testid="knowledgeos-panel"][data-state="ready"]').waitFor({ timeout: 60_000 })

  await stopHost()
  await page.locator('[data-testid="kos-refresh"]').click()
  await page.locator('[data-testid="kos-error"]').waitFor({ timeout: 30_000 })
  // Let the shell connection indicator settle into its reconnecting state.
  await sleep(3_000)

  const candidates = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="knowledgeos-panel"]')
    return [...document.querySelectorAll('button')].map((button, index) => {
      const label = button.getAttribute('aria-label') ?? ''
      const text = (button.textContent ?? '').trim()
      const matches = /重新连接|重试/.test(label) || /重新连接|重试/.test(text)
      if (!matches) return null
      return {
        index,
        ariaLabel: label,
        text,
        dataTestId: button.getAttribute('data-testid'),
        insidePanel: panel !== null && panel.contains(button),
        visible: !!(button.offsetWidth || button.offsetHeight || button.getClientRects().length),
        html: button.outerHTML.slice(0, 260),
      }
    }).filter(Boolean)
  })
  log('matching-buttons-at-disconnect', candidates)
  const locatorCount = await page.getByRole('button', { name: /重新连接|重试/ }).count()
  log('candidate-locator-count', { count: locatorCount })

  const panelStateBefore = await page.locator('[data-testid="knowledgeos-panel"]').getAttribute('data-state')
  const failedAtBefore = await page.locator('[data-testid="kos-error"] p').nth(1).innerText()
  // Exactly the candidate's locator (no panel scoping), then observe whether the panel refreshes.
  await page.getByRole('button', { name: /重新连接|重试/ }).first().click()
  await sleep(5_000)
  const failedAtAfter = await page.locator('[data-testid="kos-error"] p').nth(1).innerText()
  log('after-candidate-locator-click', {
    panelStateBefore,
    failedAtBefore,
    failedAtAfter,
    panelRefreshed: failedAtBefore !== failedAtAfter,
  })
  await page.screenshot({ path: join(outDir, 'after-candidate-locator-click.png'), fullPage: true })
  await writeFile(join(outDir, 'locator-probe.json'), `${JSON.stringify({ events, candidates }, null, 2)}\n`, 'utf8')
} catch (error) {
  log('exception', { message: error instanceof Error ? error.message : String(error) })
  await writeFile(join(outDir, 'locator-probe.json'), `${JSON.stringify({ events, error: String(error) }, null, 2)}\n`, 'utf8')
  process.exitCode = 1
} finally {
  if (browser !== null) await browser.close().catch(() => {})
  await stopHost()
}