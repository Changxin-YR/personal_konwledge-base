// Real Chrome and the library page; the peer serves only the specified business routes.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { buildLibraryHtml } from '../../packages/knowledgeos-panel/src/host/library-page.ts'
import { acceptanceSamples } from './acceptance-samples.mjs'

const pw = resolve(process.env.KO_TEST_CACHE ?? '.cache', 'panel-builder/node_modules/playwright/index.mjs')
const { chromium } = await import(pathToFileURL(pw).href)
let browser
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }) })
after(async () => { await browser?.close() })

const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc = 'application/msword'
const row = (title, media_type) => ({ id: randomUUID(), version_id: randomUUID(), version: 1, title, media_type,
  byte_length: 42, sha256: 'd'.repeat(64) })
const conversion = (state, extra) => ({ id: randomUUID(), state, page_count: state === 'ready' ? 3 : null,
  missing_fonts: [], failure_code: null, notes: [], ...extra })
const base = r => `/knowledge/v1/assets/${r.id}/versions/${r.version_id}/office`
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i

async function fixture(t) {
  const w1 = row('私人样本.docx', docx), w2 = { ...row('另一个版本.doc', doc), id: w1.id, version: 2 }
  const rows = [row('参考.pdf'), row('笔记.txt', 'text/plain'), w1, w2]
  const peer = { user: 'alice', posts: [], errors: [], office: () => ({ conversions: [] }) }
  const ctx = await browser.newContext(), page = await ctx.newPage()
  t.after(async () => { await ctx.close(); assert.deepEqual(peer.errors, []) })
  page.setDefaultTimeout(8000); page.on('pageerror', e => peer.errors.push(e.message))
  await ctx.route('http://localhost/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, h = req.headers(), method = req.method()
    const reply = (data, status = 200) => route.fulfill({ status, json: { data } })
    try {
      if (path === '/knowledgeos/library') return await route.fulfill({ contentType: 'text/html; charset=utf-8', body: buildLibraryHtml() })
      if (path === '/knowledge/v1/me') return await reply({ id: peer.user })
      if (path === '/knowledge/v1/assets') return await reply({ items: peer.user === 'alice' ? rows : [] })
      assert.equal(peer.user, 'alice'); if (method === 'POST') assert.equal(h['x-knowledgeos-request'], '1')
      if (path === '/knowledge/v1/imports') {
        assert.equal(method, 'POST'); const r = row(decodeURIComponent(h['x-knowledgeos-filename']), h['content-type'])
        if (h['x-knowledgeos-asset-id']) { r.id = h['x-knowledgeos-asset-id']; r.version = Number(h['x-knowledgeos-expected-version']) + 1 }
        peer.posts.push({ h, bytes: req.postDataBuffer() }); rows.push(r); return await reply(r)
      }
      const r = rows.find(x => path === base(x) || path.startsWith(base(x) + '/')); assert.ok(r, path)
      const action = path.slice(base(r).length); assert.equal(method, action ? 'POST' : 'GET')
      const result = await peer.office(r, action, req)
      if (result.status) return await route.fulfill({ status: result.status })
      return await reply({ version_id: r.version_id, ...result })
    } catch (e) { peer.errors.push(e.message); await route.abort() }
  })
  await page.goto('http://localhost/knowledgeos/library'); await page.getByText('资料已刷新。').waitFor()
  return { w1, w2, peer, page, btn: name => page.getByRole('button', { name, exact: true }),
    select: r => page.getByLabel('Word 版本', { exact: true }).selectOption(r.version_id) }
}

test('Word intake sends original bytes with DOC/DOCX MIME; other format pickers and raw originals stay isolated', async t => {
  const { page, peer, w2, btn } = await fixture(t)
  await page.getByLabel('导入格式').selectOption('word'); const pick = page.getByLabel('Word 文件')
  const go = btn('导入 Word'); assert.equal(await page.getByLabel('文本编码').isVisible(), false)
  await pick.setInputFiles({ name: 'wrong.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') })
  assert.equal(await go.isEnabled(), false)
  await page.getByLabel('导入到').selectOption(w2.id)
  for (const [name, type, bytes] of [['新样本.DOCX', docx, acceptanceSamples()['a08-v1.docx']], ['旧样本.DoC', doc, Buffer.from([0xd0, 0xcf, 0x11, 0xe0])]]) {
    await pick.setInputFiles({ name, mimeType: 'application/octet-stream', buffer: bytes }); await go.click()
    const receipt = page.getByRole('region', { name: '导入回执' }); await receipt.getByText(name, { exact: true }).waitFor()
    const post = peer.posts.at(-1); assert.deepEqual(post.bytes, bytes); assert.equal(post.h['content-type'], type)
    assert.match(post.h['idempotency-key'], uuid); assert.equal(post.h['x-knowledgeos-encoding'], undefined)
    assert.equal(post.h['x-knowledgeos-asset-id'], w2.id); assert.equal(post.h['x-knowledgeos-expected-version'], type === docx ? '2' : '3')
    assert.equal(await receipt.getByRole('link').count(), 1)
    assert.match(await receipt.getByRole('link', { name: '导出原件' }).getAttribute('href'), /\/original\?download=1$/)
  }
  assert.deepEqual(await page.getByLabel('资料版本').locator('option').allTextContents(), ['选择资料版本', '参考.pdf · v1'])
  assert.deepEqual(await page.getByLabel('文本版本').locator('option').allTextContents(), ['选择文本版本', '笔记.txt · v1'])
  assert.equal(await page.getByLabel('Word 版本', { exact: true }).locator('option').count(), 5)
  assert.equal(await page.locator('iframe,embed,object').count(), 0)
})

test('polls active jobs; failed and cancelled retries keep the last ready PDF and its page notes', async t => {
  const { w1, select, peer, page, btn } = await fixture(t)
  const good = conversion('ready', { missing_fonts: ['<b>Mono</b>'] }), keys = [], actions = []
  let history = [good], polls = 0, advance = false
  peer.office = (_r, action, req) => {
    if (!action) {
      if (advance && ++polls === 2) history[0].state = 'running'
      if (advance && polls === 3) Object.assign(history[0], { state: 'failed', failure_code: 'FONT_ERROR' })
      return { conversions: history }
    }
    actions.push(action)
    if (action.endsWith('/notes') || action === '/start') { const key = req.headers()['idempotency-key']; assert.match(key, uuid); keys.push(key) }
    if (action === '/start') history.unshift(conversion('queued'))
    else if (action === `/${good.id}/notes`) {
      assert.equal(req.headers()['content-type'], 'application/json');const note = req.postDataJSON()
      assert.deepEqual(note, { page: 2, body: '<i>代码缩进</i>' }); good.notes.push({ id: randomUUID(), ...note })
    } else { assert.equal(action, `/${history[0].id}/cancel`); history[0].state = 'cancelled' }
    return { status: 204 } // Only GET defines the authoritative conversions snapshot.
  }
  await select(w1); const preview = page.getByRole('link', { name: '预览转换 PDF' }); await preview.waitFor()
  advance = true; await btn('重新转换').click(); await page.getByText('最近一次：排队中').waitFor()
  await page.getByLabel('质量问题').fill('暂存'); await page.getByText('最近一次：转换中').waitFor()
  await page.locator('#office-status').filter({ hasText: /转换失败.*FONT_ERROR/ }).waitFor(); assert.equal(await page.getByLabel('质量问题').inputValue(), '暂存')
  assert.equal(await preview.getAttribute('href'), `${base(w1)}/${good.id}/pdf`)
  assert.equal(await page.getByRole('link', { name: '下载转换 PDF' }).getAttribute('href'), `${base(w1)}/${good.id}/pdf?download=1`)
  await page.getByText(/上一次可用结果.*3 页.*<b>Mono<\/b>/).waitFor()
  await page.getByLabel('质量问题').fill('<i>代码缩进</i>'); await page.getByLabel('页码').fill('4')
  await btn('保存质量记录').click(); assert.deepEqual(actions, ['/start'])
  await page.getByLabel('页码').fill('2'); await btn('保存质量记录').click(); await page.getByText('第 2 页：<i>代码缩进</i>').waitFor()
  advance = false; await btn('重新转换').click(); await btn('取消转换').click(); await page.getByText('最近一次：已取消').waitFor()
  assert.equal(await preview.getAttribute('href'), `${base(w1)}/${good.id}/pdf`); assert.equal(new Set(keys).size, 3)
  history.unshift(conversion('superseded',{failure_code:'SOURCE_CHANGED'}));await btn('刷新转换状态').click()
  await page.getByText(/最近一次：源版本已变化/).waitFor();assert.equal(await preview.getAttribute('href'), `${base(w1)}/${good.id}/pdf`)
  assert.equal(await page.locator('#office b,#office i').count(), 0)
  await page.setViewportSize({ width: 320, height: 720 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
})

test('late denial, wrong-version snapshot and principal change cannot display another selection', async t => {
  const { w1, w2, select, peer, page, btn } = await fixture(t)
  const hold = Promise.withResolvers(), arrived = Promise.withResolvers(); t.after(() => hold.resolve())
  peer.office = async r => { if (r === w1) { arrived.resolve(); await hold.promise; return { status: 403 } } return { conversions: [] } }
  await select(w1); await arrived.promise; await select(w2); await btn('开始转换').waitFor()
  const late = page.waitForResponse(r => r.url().endsWith(base(w1))); hold.resolve(); await (await late).finished()
  peer.office = () => ({ version_id: w1.version_id, conversions: [conversion('ready')] })
  await btn('刷新转换状态').click(); await page.getByText(/无法确认转换状态/).waitFor(); assert.equal(await page.getByRole('link', { name: '预览转换 PDF' }).count(), 0)
  peer.office = () => ({ conversions: [conversion('ready')] }); await btn('刷新转换状态').click(); await page.getByLabel('质量问题').fill('私人草稿')
  peer.office = () => { peer.user = 'bob'; return { conversions: [] } }
  await btn('刷新转换状态').click(); await page.getByText('暂无资料').waitFor()
  assert.equal(await page.getByLabel('质量问题').inputValue(), ''); assert.equal(await page.locator('#office-preview').getAttribute('href'), null)
  assert.doesNotMatch(await page.locator('body').textContent(), /私人样本|alice/)
})

test('returning to a version waits for its pending start; current permission denial clears the review', async t => {
  const { w1, w2, peer, select, page, btn } = await fixture(t)
  const good = conversion('ready'), running = conversion('running'), hold = Promise.withResolvers(), arrived = Promise.withResolvers()
  let started = false, writes = 0; t.after(() => hold.resolve())
  peer.office = async (r, action) => {
    if (action) {
      assert.equal(action, '/start'); assert.equal(r, w1); ++writes; arrived.resolve(); await hold.promise
      started = true; return { status: 204 }
    }
    return { conversions: r === w2 ? [] : started ? [running, good] : [good] }
  }
  await select(w1); await btn('重新转换').click(); await arrived.promise
  assert.equal(await btn('重新转换').isDisabled(), true)
  await select(w2); await btn('开始转换').waitFor(); await select(w1)
  hold.resolve(); await btn('取消转换').waitFor(); assert.equal(writes, 1)
  await page.getByLabel('质量问题').fill('未保存的私有内容'); peer.office = () => ({ status: 403 })
  await btn('保存质量记录').click(); await page.getByRole('status').filter({ hasText: '资料不可访问' }).waitFor()
  assert.equal(await page.locator('#office-preview').getAttribute('href'), null)
  assert.equal(await page.getByLabel('质量问题').inputValue(), '')
  assert.doesNotMatch(await page.locator('body').textContent(), /私人样本|另一个版本|alice/)
})

test('off-page ready PDF, latest notes, history navigation and live head remain independently accessible', async t => {
  const { w1, peer, page, select, btn } = await fixture(t)
  const notes = Array.from({ length: 23 }, (_, i) => ({ id: randomUUID(), page: 1, body: 'quality ' + (i + 1) }))
  const old = conversion('ready', { notes: [{ id: randomUUID(), page: 2, body: 'older PDF note' }] })
  const good = conversion('ready', { notes: notes.slice(-10), notes_next_before: notes[13].id })
  const head = Array.from({ length: 10 }, () => conversion('failed')), status = page.locator('#office-status')
  head[0].state = 'running'
  let finish = false
  peer.office = (_r, action, req) => {
    assert.equal(action, ''); const q = Object.fromEntries(new URL(req.url()).searchParams)
    if (q.before) { assert.deepEqual(q, { before: head[9].id }); return { conversions: [good, old] } }
    if (q.conversion === old.id) { assert.deepEqual(q, { conversion: old.id });return { conversions: [old] } }
    if (q.conversion === good.id) {
      if (!q.notes_before) return { conversions: [good] }
      const end = notes.findIndex(n => n.id === q.notes_before);assert.ok([3,13].includes(end))
      return { conversions: [{ ...good, notes: notes.slice(Math.max(0,end-10),end), notes_next_before: end>10 ? notes[end-10].id : undefined }] }
    }
    assert.deepEqual(q, {});if (finish) head[0].state = 'failed'
    return { conversions: head, next_before: head[9].id, latest_ready: good }
  }
  await select(w1); await status.filter({hasText:'转换中'}).waitFor();await page.getByLabel('质量问题').fill('draft')
  const preview = page.getByRole('link', { name: '预览转换 PDF' }), detail = page.getByRole('region', { name: '历史质量记录' })
  assert.equal(await preview.getAttribute('href'),`${base(w1)}/${good.id}/pdf`)
  await page.locator('#office-notes').getByText('第 1 页：quality 23', {exact:true}).waitFor()
  await btn('查看更早质量记录').click();await detail.getByText('第 1 页：quality 13', {exact:true}).waitFor()
  await btn('更早记录').click();await detail.getByText('第 1 页：quality 1', {exact:true}).waitFor();assert.equal(await btn('更早记录').count(),0)
  await btn('最新记录').click();await detail.getByText('第 1 页：quality 23', {exact:true}).waitFor()
  await btn('更早转换').click();await btn('查看质量记录：'+old.id).click();await detail.getByText('第 2 页：older PDF note').waitFor()
  finish=true;await status.filter({hasText:'转换失败'}).waitFor();await btn('重新转换').waitFor()
  assert.equal(await page.getByLabel('质量问题').inputValue(),'draft');assert.equal(await detail.getByRole('link').getAttribute('href'),`${base(w1)}/${old.id}/pdf`)
  assert.equal(await preview.getAttribute('href'),`${base(w1)}/${good.id}/pdf`);await btn('返回最近转换').click()
  await btn('更早转换').waitFor();assert.equal(await detail.count(),0);assert.equal(await page.locator('#office-attempts li').count(),10)
})

test('late detail cannot restore prior version history; current denied history clears private state',async t=>{
  const { w1, w2, peer, page, select, btn } = await fixture(t),hold=Promise.withResolvers(),arrived=Promise.withResolvers()
  t.after(()=>hold.resolve());const good=conversion('ready'),failed=conversion('failed');let deny=false
  peer.office=async(r,_action,req)=>{
    if(new URL(req.url()).searchParams.has('conversion')){
      if(deny)return {status:404};arrived.resolve();await hold.promise;return {conversions:[good]}
    }
    return {conversions:r===w1?[failed,good]:[]}
  }
  await select(w1);await btn('查看质量记录：'+good.id).click();await arrived.promise
  await select(w2);await btn('开始转换').waitFor();const late=page.waitForResponse(r=>r.url().includes('?conversion='));hold.resolve();await (await late).finished()
  assert.equal(await page.locator('#office-detail-pdf').getAttribute('href'),null);assert.equal(await page.locator('#office-attempts li').count(),0)
  await select(w1);deny=true;await btn('查看质量记录：'+good.id).click();await page.getByRole('status').filter({hasText:'资料不可访问'}).waitFor()
  assert.equal(await page.locator('#office-preview').getAttribute('href'),null);assert.doesNotMatch(await page.locator('body').textContent(),new RegExp(good.id))
})
