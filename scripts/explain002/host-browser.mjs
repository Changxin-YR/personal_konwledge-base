import assert from 'node:assert/strict'
import { COMMIT, FILES, QUESTION, REPOSITORY, SOURCES, TREE, UNPINNED_PATH, UNPINNED_BLOB, quote, source } from './fixture.mjs'
import { factLocation, verifyCitation, verifyDenial, verifyModuleAnswer, verifyUrl } from './host-oracle.mjs'

export const API = '/knowledge/v1', REPOS = API + '/repositories', PAGE = '/knowledgeos/repositories'
const writeHeaders = { 'x-knowledgeos-request': '1' }
const isResponse = (base, path, method) => response => new URL(response.url()).origin === base && new URL(response.url()).pathname === path && response.request().method() === method
const okData = async (response, actor) => {
  const body = await response.json()
  assert.equal(response.status(), 200, 'HTTP ' + response.status() + ' ' + (body.code ?? 'unexpected status'))
  assert.equal(body.data.actor_id, actor)
  return body.data
}
export async function isolatedContext(browser, base, traffic) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 }, locale: 'zh-CN', serviceWorkers: 'block' })
  await ctx.route('**/*', route => {
    if (new URL(route.request().url()).origin === base) return route.continue()
    traffic.external++; return route.abort()
  })
  ctx.on('request', request => {
    const url = new URL(request.url())
    if (url.origin === base && url.pathname.endsWith('/module-explain') && request.method() === 'POST') traffic.page_module_posts++
  })
  return ctx
}
export async function signIn(browser, base, traffic, name, password) {
  const ctx = await isolatedContext(browser, base, traffic)
  const page = await ctx.newPage(); page.setDefaultTimeout(15000)
  await page.goto(base + '/knowledgeos/account')
  await page.locator('#login_name').fill(name); await page.locator('#login_password').fill(password)
  const [login] = await Promise.all([page.waitForResponse(isResponse(base, API + '/auth/login', 'POST')), page.locator('#login').click()])
  assert.equal(login.status(), 200); await page.locator('#profile').waitFor()
  const me = await ctx.request.get(base + API + '/me', { maxRedirects: 0 }); assert.equal(me.status(), 200)
  const id = (await me.json()).data.id; assert.equal(typeof id, 'string')
  return { ctx, page, id }
}
export async function selectFiles(owner, base, snapshot) {
  const { page } = owner
  await page.bringToFront(); await page.goto(base + PAGE)
  const prefix = REPOS + '/' + snapshot
  const [detail] = await Promise.all([page.waitForResponse(isResponse(base, prefix, 'GET')), page.locator('#snapshots').getByRole('button', { name: new RegExp(REPOSITORY) }).click()])
  const opened = await okData(detail, owner.id); assert.equal(opened.snapshot.id, snapshot); assert.deepEqual(opened.files, SOURCES.map(item => item.path))
  for (const file of FILES.slice(0, 3)) {
    const [saved] = await Promise.all([page.waitForResponse(isResponse(base, prefix + '/files', 'GET')), page.locator('#tree').getByRole('button', { name: file.path, exact: true }).click()])
    const data = await okData(saved, owner.id); assert.equal(data.file.commit, COMMIT); assert.equal(data.file.text, source(file.path))
    await page.locator('#module-toggle').click()
    assert.equal(await page.locator('#module-sources li').count(), FILES.slice(0, FILES.indexOf(file) + 1).length)
  }
  assert.equal(await page.locator('#module-panel').isVisible(), true)
  assert.equal(await page.locator('#module-sources li').count(), 3)
  await page.locator('#module-question').fill(QUESTION)
}
export async function askOnce(owner, base, snapshot, saveActual) {
  const { page } = owner
  const expectedSources = SOURCES.map(item => ({ path: item.path, start_line: item.first, end_line: item.last }))
  const endpoint = REPOS + '/' + snapshot + '/module-explain'
  const [response] = await Promise.all([
    page.waitForResponse(isResponse(base, endpoint, 'POST'), { timeout: 150000 }),
    page.locator('#module-submit').click(),
  ])
  assert.deepEqual(response.request().postDataJSON(), { actor_id: owner.id, sources: expectedSources, question: QUESTION })
  const { explanation } = await okData(response, owner.id); saveActual(explanation); verifyModuleAnswer(explanation, snapshot)
  const area = page.locator('#module-answer'); await area.waitFor()
  for (const id of ['#module-summary','#module-relations','#module-flows','#module-tradeoffs','#module-limits','#module-facts']) await page.locator(id).waitFor()
  assert.equal(await page.locator('#module-facts').getByRole('listitem').count(), explanation.facts.length)
  assert.equal(await page.locator('#module-summary').getByRole('listitem').count(), explanation.summary.length)
  assert.equal(await page.locator('#module-relations').getByRole('listitem').count(), explanation.relations.length)
  assert.equal(await page.locator('#module-flows section').count(), explanation.flows.length)
  assert.equal(await page.locator('#module-tradeoffs').getByRole('listitem').count(), explanation.tradeoffs.length)
  assert.equal(await page.locator('#module-limits').getByRole('listitem').count(), explanation.limits.length)
  return explanation
}
async function renderedCitation(page, base, snapshot, loc) {
  const readback = page.locator('#citation-readback'), where = page.locator('#citation-location'), link = page.locator('#citation-link')
  await readback.waitFor(); assert.equal(await readback.textContent(), quote(loc.path, loc.start_line, loc.end_line))
  const text = await where.innerText(); assert(text.includes(loc.path) && text.includes(COMMIT), 'visible file and commit')
  const href = await link.getAttribute('href'); assert(href)
  verifyUrl(new URL(href, page.url()).href, base, PAGE, { snapshot, ...loc }); return new URL(href, page.url()).href
}
export async function clickAllFacts(owner, base, snapshot, facts, capture) {
  const { page, id } = owner, links = [], endpoint = REPOS + '/' + snapshot + '/citation'
  const buttons = page.locator('#module-facts').getByRole('button')
  for (const [index, fact] of facts.entries()) {
    const loc = factLocation(fact)
    const [response] = await Promise.all([page.waitForResponse(isResponse(base, endpoint, 'GET')), buttons.nth(index).click()])
    verifyUrl(response.url(), base, endpoint, loc); verifyCitation((await okData(response, id)).citation, snapshot, loc)
    const href = await renderedCitation(page, base, snapshot, loc); links.push({ loc, href })
    if (index === 0) await capture(page, 'citation-click')
  }
  return links
}
export async function restoreLink(owner, base, snapshot, link, refresh = false) {
  const { page } = owner, endpoint = REPOS + '/' + snapshot + '/citation'
  const open = async action => {
    const [response] = await Promise.all([page.waitForResponse(isResponse(base, endpoint, 'GET')), action()])
    verifyUrl(response.url(), base, endpoint, link.loc); verifyCitation((await okData(response, owner.id)).citation, snapshot, link.loc)
    assert.equal(await renderedCitation(page, base, snapshot, link.loc), link.href)
    assert.equal(await page.locator('#file-text').textContent(), source(link.loc.path))
    assert.equal(await page.locator('#explain-start').inputValue(), String(link.loc.start_line))
    assert.equal(await page.locator('#explain-end').inputValue(), String(link.loc.end_line))
  }
  await page.bringToFront(); await open(() => page.goto(link.href)); if (refresh) await open(() => page.reload())
}
export async function refusePage(outsider, base, snapshot, href) {
  const page = outsider.page; await page.bringToFront()
  const [response] = await Promise.all([page.waitForResponse(isResponse(base, REPOS, 'GET')), page.goto(href)])
  const listed = await okData(response, outsider.id); assert(!listed.snapshots.some(item => item.id === snapshot))
  await page.locator('#status').filter({ hasText: /无权|不可用|无法|不存在|未找到|拒绝|未获授权/ }).waitFor()
  for (const selector of ['#citation-readback','#citation-location','#file-text','#explain-answer','#module-answer']) assert.equal(await page.locator(selector).isVisible(), false, 'denied view: ' + selector)
  assert.equal(await page.locator('#citation-readback').textContent(), ''); assert.equal(await page.locator('#file-text').textContent(), '')
  assert.equal(await page.locator('#citation-link').getAttribute('href'), null)
}
export async function negativeCases({ base, snapshot, owner, outsider, anonymous, pass }) {
  const resource = base + REPOS + '/' + snapshot
  const valid = SOURCES.map(item => ({ path: item.path, start_line: item.first, end_line: item.last }))
  const cases = [
    ['anonymous', anonymous, owner.id, valid, 401, 'AUTH_REQUIRED'],
    ['other-business-user', outsider.ctx, outsider.id, valid, 404, 'NOT_FOUND'],
    ['one-source', owner.ctx, owner.id, valid.slice(0, 1), 422, 'MODULE_SOURCES_INVALID'],
    ['unlisted-file', owner.ctx, owner.id, [...valid.slice(0, 2), { path: UNPINNED_PATH, start_line: 1, end_line: 1 }], 404, 'NOT_FOUND'],
    ['reversed-range', owner.ctx, owner.id, [...valid.slice(0, 2), { path: valid[2].path, start_line: 3, end_line: 1 }], 422, 'MODULE_RANGE_INVALID'],
  ]
  for (const [name, ctx, actor, sources, status, code] of cases) {
    const post = await ctx.request.post(resource + '/module-explain', { headers: writeHeaders, data: { actor_id: actor, sources, question: QUESTION }, maxRedirects: 0 })
    verifyDenial(post.status(), await post.json(), status, code); pass(name, { status: post.status(), code })
  }
  const mismatch = await owner.ctx.request.post(resource + '/module-explain', { headers: writeHeaders, data: { actor_id: outsider.id, sources: valid, question: QUESTION } })
  verifyDenial(mismatch.status(), await mismatch.json(), 409, 'ACTOR_MISMATCH'); pass('actor-mismatch', { status: mismatch.status(), code: 'ACTOR_MISMATCH' })
}

export async function citationNegativeCases({ base, snapshot, owner, pass }) {
  const endpoint = REPOS + '/' + snapshot + '/citation'
  const entry = SOURCES[0]
  const valid = factLocation({ path: entry.path, start_line: entry.first, end_line: entry.first })
  const cases = [
    ['wrong-commit', { ...valid, commit: '0'.repeat(40) }, 409, 'CODE_SOURCE_CHANGED'],
    ['wrong-blob', { ...valid, blob_sha: '0'.repeat(40) }, 409, 'CODE_SOURCE_CHANGED'],
    ['citation-past-end', { ...valid, end_line: entry.last + 1 }, 422, 'CODE_RANGE_INVALID'],
    ['unpinned-citation', { path: UNPINNED_PATH, commit: COMMIT, blob_sha: UNPINNED_BLOB, start_line: 1, end_line: 1 }, 404, 'NOT_FOUND'],
  ]
  for (const [name, location, status, code] of cases) {
    const response = await owner.ctx.request.get(base + endpoint + '?' + new URLSearchParams(location), { maxRedirects: 0 })
    verifyDenial(response.status(), await response.json(), status, code); pass(name, { status: response.status(), code })
  }
}

export async function savedRangeNegativeCases({ base, snapshot, owner, pass }) {
  const resource = base + REPOS + '/' + snapshot + '/module-explain'
  const valid = SOURCES.map(item => ({ path: item.path, start_line: item.first, end_line: item.last }))
  const cases = [
    ['reversed-range-after-save', [...valid.slice(0, 2), { path: valid[2].path, start_line: 3, end_line: 1 }], 422, 'MODULE_RANGE_INVALID'],
    ['past-end-after-save', [...valid.slice(0, 2), { path: valid[2].path, start_line: 1, end_line: 8 }], 422, 'MODULE_RANGE_INVALID'],
  ]
  for (const [name, sources, status, code] of cases) {
    const response = await owner.ctx.request.post(resource, { headers: writeHeaders, data: { actor_id: owner.id, sources, question: QUESTION }, maxRedirects: 0 })
    verifyDenial(response.status(), await response.json(), status, code); pass(name, { status: response.status(), code })
  }
}
