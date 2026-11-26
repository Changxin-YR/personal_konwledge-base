import assert from 'node:assert/strict'
import { BLOB, COMMIT, FIRST, LAST, LOCATION, PATH, QUESTION, REPOSITORY, SOURCE, UNPINNED_BLOB, UNPINNED_PATH, quote } from './fixture.mjs'
import { factLocation, verifyAnswer, verifyCitation, verifyDenial, verifyUrl } from './host-oracle.mjs'

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
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 980 }, locale: 'zh-CN', serviceWorkers: 'block' })
  await ctx.route('**/*', route => {
    if (new URL(route.request().url()).origin === base) return route.continue()
    traffic.external++; return route.abort()
  })
  ctx.on('request', request => {
    const url = new URL(request.url())
    if (url.origin === base && url.pathname.endsWith('/explain') && request.method() === 'POST') traffic.page_explain_posts++
  })
  return ctx
}
export async function signIn(browser, base, traffic, name, password) {
  const ctx = await isolatedContext(browser, base, traffic)
  const page = await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(base + '/knowledgeos/account')
  await page.locator('#login_name').fill(name)
  await page.locator('#login_password').fill(password)
  const [login] = await Promise.all([page.waitForResponse(isResponse(base, API + '/auth/login', 'POST')), page.locator('#login').click()])
  assert.equal(login.status(), 200); await page.locator('#profile').waitFor()
  const me = await ctx.request.get(base + API + '/me', { maxRedirects: 0 })
  assert.equal(me.status(), 200)
  const id = (await me.json()).data.id
  assert.equal(typeof id, 'string')
  return { ctx, page, id }
}
export async function selectFile(owner, base, snapshot) {
  const { page } = owner
  await page.bringToFront(); await page.goto(base + PAGE)
  const prefix = REPOS + '/' + snapshot
  const [detail] = await Promise.all([page.waitForResponse(isResponse(base, prefix, 'GET')), page.locator('#snapshots').getByRole('button', { name: new RegExp(REPOSITORY) }).click()])
  const opened = await okData(detail, owner.id)
  assert.equal(opened.snapshot.id, snapshot); assert.deepEqual(opened.files, [PATH])
  const [file] = await Promise.all([page.waitForResponse(isResponse(base, prefix + '/files', 'GET')), page.locator('#tree').getByRole('button', { name: PATH, exact: true }).click()])
  const saved = (await okData(file, owner.id)).file
  assert.equal(saved.commit, COMMIT); assert.equal(saved.sha, BLOB); assert.equal(saved.text, SOURCE)
  await page.locator('#file-text').waitFor()
  assert.equal(await page.locator('#commit').textContent(), COMMIT)
  assert.equal(await page.locator('#file-path').textContent(), PATH)
  assert.equal(await page.locator('#file-text').textContent(), SOURCE)
  await page.locator('#explain-question').fill(QUESTION)
  await page.locator('#explain-start').fill(String(FIRST)); await page.locator('#explain-end').fill(String(LAST))
}
export async function askOnce(owner, base, snapshot, saveActual) {
  const { page } = owner
  const [response] = await Promise.all([
    page.waitForResponse(isResponse(base, REPOS + '/' + snapshot + '/explain', 'POST'), { timeout: 150000 }),
    page.locator('#explain-submit').click(),
  ])
  assert.deepEqual(response.request().postDataJSON(), { actor_id: owner.id, ...LOCATION, question: QUESTION })
  const { explanation } = await okData(response, owner.id)
  saveActual(explanation)
  verifyAnswer(explanation, snapshot)
  const area = page.locator('#explain-answer'); await area.waitFor()
  const facts = area.locator('#explain-facts'), readings = area.locator('#explain-interpretations'), limits = area.locator('#explain-limits')
  for (const group of [facts, readings, limits]) await group.waitFor()
  const factRows = facts.getByRole('listitem'), readingRows = readings.getByRole('listitem'), limitRows = limits.getByRole('listitem')
  assert.equal(await factRows.count(), explanation.facts.length)
  assert.equal(await readingRows.count(), explanation.interpretations.length)
  assert.equal(await limitRows.count(), explanation.limits.length)
  for (const [i, fact] of explanation.facts.entries()) {
    const row = factRows.nth(i)
    const quoted = row.locator('pre'); await quoted.waitFor()
    assert.equal(await quoted.textContent(), fact.quote)
    assert.equal(await row.getByRole('button').count(), 1)
    // Apart from its citation control, a fact must contain only the verified quote.
    const unexplained = await row.evaluate(node => { const copy = node.cloneNode(true); copy.querySelectorAll('pre,button').forEach(part => part.remove()); return copy.textContent.trim() })
    assert.equal(unexplained, '')
  }
  for (const [i, item] of explanation.interpretations.entries()) {
    const row = readingRows.nth(i); await row.waitFor()
    const text = await row.innerText()
    assert(text.includes(item.text), 'reading in its visible group')
    const references = text.replace(item.text, '').match(/\d+/g)?.map(Number)
    assert.deepEqual(references, item.facts, 'rendered references')
  }
  for (const [i, item] of explanation.limits.entries()) {
    await limitRows.nth(i).waitFor(); assert.equal(await limitRows.nth(i).textContent(), item)
  }
  return explanation
}
const citationQuery = loc => new URLSearchParams(loc).toString()
async function renderedCitation(page, base, snapshot, loc) {
  // The readback can be reused by multiple facts. Wait for this range, not just a visible box.
  await page.waitForFunction(expected => {
    const pre = document.getElementById('citation-readback')
    return pre?.getClientRects().length && pre.textContent === expected
  }, quote(loc.start_line, loc.end_line))
  const readback = page.locator('#citation-readback'), where = page.locator('#citation-location'), link = page.locator('#citation-link')
  await where.waitFor(); await link.waitFor()
  assert.equal(await readback.textContent(), quote(loc.start_line, loc.end_line))
  const text = await where.innerText(); assert(text.includes(PATH) && text.includes(COMMIT), 'visible file and commit')
  assert(new RegExp('L?' + loc.start_line + '\\s*[-–—~至]\\s*L?' + loc.end_line + '(?![0-9])').test(text), 'visible line range')
  const href = new URL(await link.getAttribute('href'), page.url()).href
  verifyUrl(href, base, PAGE, { snapshot, ...loc })
  return href
}
export async function clickAllFacts(owner, base, snapshot, facts, capture) {
  const { page, id } = owner, links = []
  const endpoint = REPOS + '/' + snapshot + '/citation'
  const buttons = page.locator('#explain-facts').getByRole('button')
  for (const [i, fact] of facts.entries()) {
    const loc = factLocation(fact)
    const [response] = await Promise.all([page.waitForResponse(isResponse(base, endpoint, 'GET')), buttons.nth(i).click()])
    verifyUrl(response.url(), base, endpoint, loc)
    verifyCitation((await okData(response, id)).citation, snapshot, loc)
    const href = await renderedCitation(page, base, snapshot, loc)
    links.push({ loc, href })
    if (i === 0) await capture(page, 'citation-click')
  }
  return links
}
export async function restoreLink(owner, base, snapshot, link, refresh = false) {
  const { page } = owner
  await page.bringToFront()
  const endpoint = REPOS + '/' + snapshot + '/citation'
  const open = async action => {
    const [response] = await Promise.all([page.waitForResponse(isResponse(base, endpoint, 'GET')), action()])
    verifyUrl(response.url(), base, endpoint, link.loc)
    verifyCitation((await okData(response, owner.id)).citation, snapshot, link.loc)
    assert.equal(await renderedCitation(page, base, snapshot, link.loc), link.href)
    assert.equal(await page.locator('#file-text').textContent(), SOURCE)
    assert.equal(await page.locator('#explain-start').inputValue(), String(link.loc.start_line))
    assert.equal(await page.locator('#explain-end').inputValue(), String(link.loc.end_line))
  }
  await open(() => page.goto(link.href))
  if (refresh) await open(() => page.reload())
}
export async function refusePage(outsider, base, snapshot, href) {
  const page = outsider.page
  await page.bringToFront()
  const [response] = await Promise.all([page.waitForResponse(isResponse(base, REPOS, 'GET')), page.goto(href)])
  const listed = await okData(response, outsider.id)
  assert(!listed.snapshots.some(item => item.id === snapshot))
  await page.locator('#status').filter({ hasText: /无权|不可用|无法|不存在|未找到|拒绝|未获授权/ }).waitFor()
  for (const selector of ['#citation-readback','#citation-location','#file-text','#explain-answer']) {
    assert.equal(await page.locator(selector).isVisible(), false, 'denied view: ' + selector)
  }
  assert.equal(await page.locator('#citation-readback').textContent(), '')
  assert.equal(await page.locator('#file-text').textContent(), '')
  assert.equal(await page.locator('#citation-link').getAttribute('href'), null)
}
export async function negativeCases({ base, snapshot, owner, outsider, anonymous, pass }) {
  const resource = base + REPOS + '/' + snapshot
  const cases = [
    ['anonymous', anonymous, owner.id, LOCATION, 401, 'AUTH_REQUIRED'],
    ['other-business-user', outsider.ctx, outsider.id, LOCATION, 404, 'NOT_FOUND'],
    ['wrong-commit', owner.ctx, owner.id, { ...LOCATION, commit: 'a'.repeat(40) }, 409, 'CODE_SOURCE_CHANGED'],
    ['wrong-blob', owner.ctx, owner.id, { ...LOCATION, blob_sha: 'b'.repeat(40) }, 409, 'CODE_SOURCE_CHANGED'],
    ['listed-unpinned', owner.ctx, owner.id, { ...LOCATION, path: UNPINNED_PATH, blob_sha: UNPINNED_BLOB, start_line: 1, end_line: 1 }, 404, 'NOT_FOUND'],
    ['reversed-range', owner.ctx, owner.id, { ...LOCATION, start_line: LAST, end_line: FIRST }, 422, 'CODE_RANGE_INVALID'],
    ['past-end', owner.ctx, owner.id, { ...LOCATION, end_line: 8 }, 422, 'CODE_RANGE_INVALID'],
  ]
  for (const [name, ctx, actor, loc, status, code] of cases) {
    const post = await ctx.request.post(resource + '/explain', { headers: writeHeaders, data: { actor_id: actor, ...loc, question: QUESTION }, maxRedirects: 0 })
    verifyDenial(post.status(), await post.json(), status, code)
    const get = await ctx.request.get(resource + '/citation?' + citationQuery(loc), { maxRedirects: 0 })
    verifyDenial(get.status(), await get.json(), status, code)
    pass(name, { explain_status: post.status(), citation_status: get.status(), code })
  }
  const mismatch = await owner.ctx.request.post(resource + '/explain', { headers: writeHeaders, data: { actor_id: outsider.id, ...LOCATION, question: QUESTION }, maxRedirects: 0 })
  verifyDenial(mismatch.status(), await mismatch.json(), 409, 'ACTOR_MISMATCH')
  pass('actor-mismatch', { explain_status: mismatch.status(), code: 'ACTOR_MISMATCH' })
}
