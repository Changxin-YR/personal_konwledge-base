// Drive the library page in Chrome against a cookie-scoped HTTP peer, without a live Host.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildLibraryHtml } from '../../packages/knowledgeos-panel/src/host/library-page.ts'

const pw = resolve(process.env.KO_TEST_CACHE ?? '.cache', 'panel-builder/node_modules/playwright/index.mjs')
const { chromium } = await import(pathToFileURL(pw).href)
let browser
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }) })
after(async () => { await browser?.close() })

const asset = (title, media_type) => ({ id: randomUUID(), version_id: randomUUID(), version: 1,
  title, media_type, sha256: 'b'.repeat(64), byte_length: 42 })
const literal = '<b>正文 & 引用</b>'
const samplePage = (row, from) => ({ version_id: row.version_id, encoding: 'utf-8', total: 7,
  blocks: Array.from({ length: Math.min(5, 8 - from) }, (_, i) => {
    const ordinal = from + i
    return { ordinal, kind: 'paragraph', start: ordinal * 20, end: ordinal * 20 + 12,
      text: ordinal === 1 ? literal : '段落 ' + ordinal, anchor: 'block-' + ordinal }
  }) })

async function fixture(t) {
  const pdf = asset('旧版.pdf'), md = asset('笔记.md', 'text/markdown'), txt = asset('日记.txt', 'text/plain')
  const rows = [pdf, md, txt], posts = [], reads = [], errors = []
  const peer = { blocks: (row, from) => ({ data: samplePage(row, from) }), postStatus: 200 }
  const server = createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    const url = new URL(req.url, 'http://localhost')
    try {
      if (url.pathname === '/knowledgeos/library') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(buildLibraryHtml())
      }
      if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end() }
      const user = /session=(alice|bob)\b/.exec(req.headers.cookie ?? '')?.[1]
      if (!user) return reply(401, {})
      if (url.pathname === '/knowledge/v1/me') return reply(200, { data: { id: user } })
      if (url.pathname === '/knowledge/v1/assets') return reply(200, { data: { items: user === 'alice' ? rows : [] } })
      assert.equal(user, 'alice')
      if (req.url === '/knowledge/v1/imports' && req.method === 'POST') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk)
        const h = req.headers, bytes = Buffer.concat(chunks); posts.push({ h, bytes })
        const row = asset(decodeURIComponent(h['x-knowledgeos-filename']), h['content-type'])
        if (h['x-knowledgeos-asset-id']) { row.id = h['x-knowledgeos-asset-id']; row.version = Number(h['x-knowledgeos-expected-version']) + 1 }
        if (peer.postStatus === 200) rows.push(row)
        return reply(peer.postStatus, { data: row })
      }
      const row = rows.find(r => url.pathname === `/knowledge/v1/assets/${r.id}/versions/${r.version_id}/blocks`)
      assert.ok(row && row.media_type?.startsWith('text/'), req.url); assert.equal(req.method, 'GET')
      const from = Number(url.searchParams.get('from')); assert.equal(req.url.split('?')[1], `from=${from}&limit=5`)
      reads.push({ row, from }); const { status = 200, data } = await peer.blocks(row, from); reply(status, { data })
    } catch (e) { errors.push(e.message); reply(500, {}) }
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${server.address().port}`, ctx = await browser.newContext(), page = await ctx.newPage()
  t.after(async () => { await ctx.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); assert.deepEqual(errors, []) })
  page.setDefaultTimeout(7000); page.on('pageerror', e => errors.push(e.message))
  const login = value => ctx.addCookies([{ name: 'session', value, url: origin, httpOnly: true }])
  await login('alice'); await page.goto(origin + '/knowledgeos/library'); await page.getByText('资料已刷新。').waitFor()
  const btn = name => page.getByRole('button', { name, exact: true })
  const select = row => page.getByLabel('文本版本').selectOption(row.version_id)
  return { page, pdf, md, txt, posts, reads, peer, login, btn, select }
}

test('text import uses the filename, original bytes, optional hint and version precondition', async t => {
  const { page, md, posts, peer, btn } = await fixture(t)
  const parse = page.getByLabel('资料版本')
  assert.deepEqual(await parse.locator('option').allTextContents(), ['选择资料版本', '旧版.pdf · v1'])
  await page.getByLabel('导入格式').selectOption('text')
  const file = page.getByLabel('文本文件'), encoding = page.getByLabel('文本编码'), submit = btn('导入文本')
  for (const hint of ['UTF-8', 'UTF-16', 'GB18030']) assert.match(await encoding.innerText(), new RegExp(hint))
  const pick = (name, buffer) => file.setInputFiles({ name, mimeType: 'application/octet-stream', buffer })
  await pick('wrong.pdf', Buffer.from('pdf')); assert.equal(await submit.isEnabled(), false)
  const first = Buffer.from('# 笔记\n'); await pick('笔记.MD', first); await submit.click()
  const receipt = page.getByRole('region', { name: '导入回执' }); await receipt.getByText('笔记.MD', { exact: true }).waitFor()
  assert.deepEqual(posts[0].bytes, first); assert.equal(posts[0].h['content-type'], 'text/markdown')
  assert.equal(posts[0].h['x-knowledgeos-encoding'], undefined); assert.equal(posts[0].h['x-knowledgeos-asset-id'], undefined)
  assert.equal(posts[0].h['x-knowledgeos-filename'], encodeURIComponent('笔记.MD')); assert.equal(posts[0].h['x-knowledgeos-request'], '1')
  await page.getByLabel('导入到').selectOption(md.id); const bytes = Buffer.from([0xd6, 0xd0, 0x0a])
  await pick('旧编码.TXT', bytes); peer.postStatus = 422; await submit.click(); await page.getByRole('status').filter({ hasText: '编码' }).waitFor()
  await encoding.selectOption('gb18030'); peer.postStatus = 200; await submit.click(); await receipt.getByText('v2', { exact: true }).waitFor()
  assert.deepEqual(posts[2].bytes, bytes); assert.equal(posts[2].h['content-type'], 'text/plain')
  assert.equal(posts[2].h['x-knowledgeos-encoding'], 'gb18030'); assert.equal(posts[2].h['x-knowledgeos-expected-version'], '1')
  assert.equal(posts[2].h['x-knowledgeos-asset-id'], md.id); assert.ok(posts[2].h['idempotency-key']); assert.notEqual(posts[2].h['idempotency-key'], posts[1].h['idempotency-key'])
  assert.equal(await parse.locator('option').count(), 2); assert.equal(await receipt.getByRole('link', { name: '导出 PDF' }).count(), 0)
})

test('block pages show server offsets and literal content; invalid pages never render', async t => {
  const { page, md, txt, peer, reads, btn, select } = await fixture(t)
  assert.deepEqual(reads, []); await select(md)
  const list = page.getByRole('list', { name: '文本块' }); await list.getByText(literal, { exact: true }).waitFor()
  assert.equal(await list.locator('b').count(), 0); assert.equal(await list.getByRole('listitem').count(), 5)
  await list.getByText(/偏移.*20.*32/).waitFor(); assert.equal(await btn('上一页').isEnabled(), false)
  await btn('下一页').click(); await list.getByText('段落 7').waitFor(); assert.equal(await list.getByRole('listitem').count(), 2)
  assert.equal(await btn('下一页').isEnabled(), false); await btn('上一页').click(); await list.getByText(literal).waitFor()
  assert.deepEqual(reads.map(x => x.from), [1, 6, 1]); assert.ok(reads.every(x => x.row === md))
  peer.blocks = () => ({ data: samplePage(md, 1) }); await select(txt); await page.getByText(/无法读取文本块/).waitFor()
  assert.equal(await list.getByRole('listitem').count(), 0)
  peer.blocks = () => ({ status: 403 }); await btn('重试读取').click(); await page.getByRole('status').filter({ hasText: '资料不可访问' }).waitFor()
  assert.doesNotMatch(await page.locator('body').textContent(), /笔记\.md|alice|日记\.txt/)
})

test('late block responses cannot overwrite a new selection or cross an account change', async t => {
  const { page, peer, md, txt, select, login } = await fixture(t)
  const hold = Promise.withResolvers(); t.after(() => hold.resolve())
  peer.blocks = async row => { if (row === md) { await hold.promise; return { status: 403 } } return { data: samplePage(row, 1) } }
  const sent = page.waitForRequest(r => r.url().includes(md.version_id)); await select(md); await sent
  await select(txt); await page.getByText(literal, { exact: true }).waitFor()
  const stale = page.waitForResponse(r => r.url().includes(md.version_id)); hold.resolve(); await (await stale).finished()
  const change = Promise.withResolvers(); t.after(() => change.resolve())
  peer.blocks = async row => { await change.promise; return { data: samplePage(row, 1) } }
  const pending = page.waitForRequest(r => r.url().includes(md.version_id)); await select(md); await pending
  await login('bob'); change.resolve(); await page.getByText('暂无资料').waitFor()
  assert.doesNotMatch(await page.locator('body').textContent(), /正文 & 引用|alice|笔记\.md/)
})
