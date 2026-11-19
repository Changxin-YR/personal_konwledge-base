// Focused UI contract tests: real Chrome and library HTML, synthetic parse responses.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildLibraryHtml } from '../../packages/knowledgeos-panel/src/host/library-page.ts'

const pw = resolve(process.env.KO_TEST_CACHE ?? '.cache', 'panel-builder/node_modules/playwright/index.mjs')
const { chromium } = await import(pathToFileURL(pw).href)
let browser
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }) })
after(async () => { await browser?.close() })

const snapshot = (state, pages = [], error = null) => ({ state, pages, total: pages.length, error })
async function fixture(t) {
  const id = randomUUID(), rows = [1, 2].map(version => ({ id, version, version_id: randomUUID(),
    title: '私人文档', sha256: 'a'.repeat(64), byte_length: 42 }))
  const paths = rows.map(r => `/knowledge/v1/assets/${id}/versions/${r.version_id}/parse`)
  const f = { calls: [], reply: () => ({ data: snapshot('idle') }) }, errors = []
  const srv = createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    try {
      if (req.url === '/knowledgeos/library') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(buildLibraryHtml()) }
      if (req.url === '/favicon.ico') { res.writeHead(204); return res.end() }
      const user = /session=(alice|bob)\b/.exec(req.headers.cookie ?? '')?.[1]
      if (!user) return send(401, {})
      if (req.url === '/knowledge/v1/me') return send(200, { data: { id: user } })
      if (req.url === '/knowledge/v1/assets') return send(200, { data: { items: user === 'alice' ? rows : [] } })
      const version = paths.findIndex(path => req.url === path || req.url.startsWith(path + '/'))
      assert.notEqual(version, -1)
      const action = req.url.slice(paths[version].length)
      assert.equal(req.method, action ? 'POST' : 'GET')
      if (action) assert.equal(req.headers['x-knowledgeos-request'], '1')
      const call = { version: version + 1, action }; f.calls.push(call)
      const { status = 200, data } = await f.reply(call); send(status, { data })
    } catch (e) { errors.push(e.message); send(500, {}) }
  })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${srv.address().port}`, ctx = await browser.newContext(), page = await ctx.newPage()
  t.after(async () => { await ctx.close(); srv.closeAllConnections(); await new Promise(r => srv.close(r)); assert.deepEqual(errors, []) })
  page.setDefaultTimeout(7000); page.on('pageerror', e => errors.push(e.message))
  const login = value => ctx.addCookies([{ name: 'session', value, url: origin, httpOnly: true }])
  await login('alice'); await page.goto(origin + '/knowledgeos/library'); await page.getByText('资料已刷新。').waitFor()
  const select = n => page.getByLabel('资料版本').selectOption(rows[n - 1]?.version_id ?? '')
  const btn = name => page.getByRole('button', { name, exact: true })
  return { f, page, paths, select, btn, login, ctx }
}

test('selected version only: paginate, display literal page errors, retry a page and restart a failed document', async t => {
  const { f, page, select, btn } = await fixture(t)
  const pages = Array.from({ length: 730 }, (_, i) => ({ page: i + 1, state: i === 25 ? 'failed' : i === 26 ? 'review' : 'ready',
    chapter: i === 25 ? '<b>未识别章节</b>' : '第一章', error: i === 25 ? '<i>局部错误</i>' : null })).reverse()
  f.reply = ({ action }) => ({ data: action === '/start' ? snapshot('queued') : action === '/retry/26' ? snapshot('failed', [], '<b>解析器错误</b>') : snapshot('partial', pages) })
  assert.equal(await btn('刷新进度').isVisible(), false); assert.deepEqual(f.calls, [])
  await select(1); await page.getByText(/可用 728/).waitFor(); const list = page.getByRole('list', { name: '分章节页状态' })
  assert.equal(await list.getByRole('listitem').count(), 25); assert.equal(await btn('上一组').isEnabled(), false)
  await btn('下一组').click(); await list.getByText('<b>未识别章节</b>', { exact: true }).waitFor()
  await list.getByText('<i>局部错误</i>', { exact: true }).waitFor(); assert.equal(await list.locator('b,i').count(), 0)
  assert.ok(await btn('重试第 27 页').isVisible()); await btn('重试第 26 页').click()
  await page.getByText('<b>解析器错误</b>', { exact: true }).waitFor(); await btn('重新解析').click(); await btn('取消解析').waitFor()
  assert.deepEqual(f.calls, ['', '/retry/26', '/start'].map(action => ({ version: 1, action })))
  await select(0); assert.equal(await btn('取消解析').isVisible(), false)
})

test('cancelled resumes the document; partial offers only failed and review page retries', async t => {
  const { f, page, select, btn } = await fixture(t)
  const pages = ['ready', 'failed', 'pending', 'review'].map((state, i) => ({ page: i + 1, state, chapter: '第一章', error: null }))
  f.reply = ({ action }) => ({ data: snapshot(action === '/start' ? 'partial' : action === '/retry/4' ? 'queued' : 'cancelled', pages) })
  await select(1); await btn('继续解析').waitFor()
  const retries = page.getByRole('button', { name: /^重试第 / })
  assert.deepEqual(await retries.allTextContents(), []); await btn('继续解析').click()
  await page.getByText(/部分完成 ·/).waitFor()
  assert.equal(await page.locator('#parse-action').isVisible(), false)
  assert.deepEqual(await retries.allTextContents(), ['重试第 2 页', '重试第 4 页'])
  await btn('重试第 4 页').click(); await btn('取消解析').waitFor()
  assert.deepEqual(await retries.allTextContents(), [])
  assert.deepEqual(f.calls.map(c => c.action), ['', '/start', '/retry/4'])
})

test('a superseded poll cannot undo cancel; an earlier version cannot replace the new selection', async t => {
  const { f, page, paths, select, btn } = await fixture(t)
  const poll = Promise.withResolvers(), late = Promise.withResolvers(); t.after(() => { poll.resolve(); late.resolve() })
  let reads = 0
  f.reply = async ({ version, action }) => {
    if (version === 2) return { data: snapshot('complete') }
    if (action === '/cancel') return { data: snapshot('cancelled') }
    if (action === '/start') return { data: snapshot('running') }
    if (++reads === 1) return { data: snapshot('idle') }
    await (reads === 2 ? poll : late).promise; return { data: snapshot('running') }
  }
  await select(1); await btn('开始解析').waitFor(); const polling = page.waitForRequest(r => r.url().endsWith(paths[0]))
  await btn('开始解析').click(); await btn('取消解析').waitFor(); await polling
  await btn('取消解析').click(); await btn('继续解析').waitFor()
  const released = page.waitForResponse(r => r.url().endsWith(paths[0])); poll.resolve(); await (await released).finished()
  assert.equal(await btn('继续解析').isVisible(), true)
  const fetching = page.waitForRequest(r => r.url().endsWith(paths[0])); await btn('刷新进度').click(); await fetching
  await select(2); await page.getByText(/解析完成 ·/).waitFor(); const stale = page.waitForResponse(r => r.url().endsWith(paths[0]))
  late.resolve(); await (await stale).finished(); assert.equal(await btn('取消解析').isVisible(), false)
  assert.equal(await page.getByText(/解析完成 ·/).isVisible(), true)
})

test('returning to a version reads after its pending write; duplicate actions are disabled', async t => {
  const { f, page, select, btn, paths } = await fixture(t)
  const gate = Promise.withResolvers(); t.after(() => gate.resolve()); let state = 'idle'
  f.reply = async ({ version, action }) => {
    if (version === 2) return { data: snapshot('complete') }
    if (action) { await gate.promise; state = 'queued' }
    return { data: snapshot(state) }
  }
  await select(1); const post = page.waitForRequest(r => r.url().endsWith(paths[0] + '/start'))
  await btn('开始解析').click(); await post; assert.equal(await btn('开始解析').isEnabled(), false)
  await select(2); await page.getByText(/解析完成 ·/).waitFor(); await select(1)
  await page.getByText('正在读取解析进度…').waitFor(); gate.resolve(); await btn('取消解析').waitFor()
  assert.deepEqual(f.calls.map(c => [c.version, c.action]), [[1, ''], [1, '/start'], [2, ''], [1, '']])
})

test('denial clears the private library; expiry prevents posting to the old selection', async t => {
  const { f, page, select, btn, ctx } = await fixture(t)
  await select(2); await btn('开始解析').waitFor(); f.reply = () => ({ status: 403 }); await btn('开始解析').click()
  await page.getByRole('status').filter({ hasText: '资料不可访问' }).waitFor()
  assert.doesNotMatch(await page.locator('body').textContent(), /私人文档|alice/); assert.equal(await btn('刷新进度').isVisible(), false)
  f.reply = () => ({ data: snapshot('idle') }); await btn('刷新资料').click(); await select(2); await btn('开始解析').waitFor()
  await ctx.clearCookies(); await btn('开始解析').click(); await page.getByRole('status').filter({ hasText: '请先登录' }).waitFor()
  assert.equal(f.calls.filter(c => c.action).length, 1); assert.equal(await btn('刷新进度').isVisible(), false)
})

test('an account switch during a read discards the previous account’s result', async t => {
  const { f, page, select, btn, login, paths } = await fixture(t)
  const gate = Promise.withResolvers(); t.after(() => gate.resolve())
  f.reply = async () => { await gate.promise; return { data: snapshot('failed', [], 'private diagnostic') } }
  const sent = page.waitForRequest(r => r.url().endsWith(paths[1])); await select(2); await sent
  await login('bob'); gate.resolve(); await page.getByText('暂无资料').waitFor()
  assert.doesNotMatch(await page.locator('body').innerText(), /私人文档|alice|private diagnostic/); assert.equal(await btn('刷新进度').isVisible(), false)
})

test('an uncertain POST requires a fresh status read instead of replaying the action', async t => {
  const { f, page, select, btn } = await fixture(t)
  await select(1); await btn('开始解析').waitFor(); f.reply = () => ({ status: 503 }); await btn('开始解析').click()
  await page.getByText(/无法确认当前解析状态/).waitFor(); assert.equal(await btn('开始解析').isVisible(), false)
  f.reply = () => ({ data: snapshot('running') }); await btn('刷新进度').click(); await btn('取消解析').waitFor()
  f.reply = () => ({ data: snapshot('complete') }); await page.getByText(/解析完成 ·/).waitFor()
  assert.equal(await btn('取消解析').isVisible(), false); assert.equal(f.calls.filter(c => c.action).length, 1)
})
