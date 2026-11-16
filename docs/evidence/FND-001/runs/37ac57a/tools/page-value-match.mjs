#!/usr/bin/env node
/**
 * Independent observation tool (not product code, not part of the candidate).
 *
 * Captures the exact /knowledgeos/status response that the real browser panel
 * rendered and compares every displayed value field-by-field with that body.
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
  const captures = []
  page.on('response', response => {
    if (!response.url().includes('/knowledgeos/status')) return
    void response.json().then(body => captures.push({ at: new Date().toISOString(), status: response.status(), body })).catch(() => {})
  })
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
  await sleep(1_000)

  const displayed = {
    version: await page.locator('[data-testid="kos-version"]').innerText(),
    commit: await page.locator('[data-testid="kos-commit"]').innerText(),
    verified: await page.locator('[data-testid="kos-verified"]').innerText(),
    instance: await page.locator('[data-testid="kos-instance"]').innerText(),
    checkedAtIso: await page.locator('[data-testid="kos-checked-at"]').getAttribute('data-checked-at'),
    checkedAtText: await page.locator('[data-testid="kos-checked-at"]').innerText(),
    startedAtText: await page.locator('[data-testid="kos-started-at"]').innerText(),
  }
  const latest = captures.at(-1)
  if (latest === undefined) throw new Error('no captured status response')
  const body = latest.body
  const fmt = value => new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value))
  const verifiedFace = body.upstream_commit_verified === true
    ? '与锁定提交一致'
    : body.upstream_commit_verified === false ? '与锁定提交不一致' : 'Host 未记录构建提交，无法核验'
  const comparisons = {
    version: displayed.version === body.upstream_version,
    commit: displayed.commit === body.upstream_commit.slice(0, 12),
    verified: displayed.verified === verifiedFace,
    instance: displayed.instance === body.host_instance_id,
    checkedAtIso: displayed.checkedAtIso === body.checked_at,
    checkedAtText: displayed.checkedAtText === fmt(body.checked_at),
    startedAtText: displayed.startedAtText === fmt(body.started_at),
    responseIsSameInstance: body.host_instance_id === displayed.instance,
  }
  const result = {
    result: Object.values(comparisons).every(Boolean) ? 'PASS' : 'FAIL',
    captured_at: latest.at,
    http_status: latest.status,
    response: body,
    displayed,
    comparisons,
  }
  await writeFile(join(outDir, 'page-value-match.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  await page.screenshot({ path: join(outDir, 'panel-ready.png'), fullPage: true })
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.result === 'PASS' ? 0 : 1
} catch (error) {
  console.error(String(error))
  process.exitCode = 1
} finally {
  if (browser !== null) await browser.close().catch(() => {})
  await stopHost()
}