import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const prefix = '/knowledge/v1'
export const terms = `${prefix}/terms`
export const bank = `${prefix}/questions`
export const sessions = `${prefix}/practice-sessions`
export const review = `${prefix}/me/wrong-questions`
export const versionPath = asset => `${prefix}/assets/${asset.id}/versions/${asset.version_id}`
export const termList = (asset, archived = false) => `${terms}?${new URLSearchParams({
  asset: asset.id, version: asset.version_id, ...(archived ? { archived: '1' } : {}),
})}`
export const questionsFor = term => `${bank}?term=${term.id}`
export const action = (session, name) => `${sessions}/${session.id}/${name}`
export const hash = value => createHash('sha256').update(value).digest('hex')
export const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/

export function absent(value, markers) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const marker of markers) assert(marker && !text.includes(marker), 'unexpected disclosure')
}

// A single read transaction gives a coherent baseline for receipts, links and rows.
// Hash in memory so even a failed comparison cannot publish raw SQLite contents.
export function database(dbPath) {
  function read(fn) {
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try { db.exec('BEGIN'); return fn(db) } finally { db.close() }
  }
  const rows = (sql, ...args) => read(db => db.prepare(sql).all(...args).map(row => ({ ...row })))
  const snapshot = () => read(db => {
    const names = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all()
    const result = {}
    for (const { name } of names) {
      if (!/^(assets|asset_versions|blobs|text_blocks|text_versions|citations|questions)$|term|practice|question_/i.test(name)) continue
      assert.match(name, /^[a-z][a-z0-9_]*$/i)
      const values = db.prepare(`SELECT * FROM "${name}"`).all().map(row => JSON.stringify(row)).sort()
      result[name] = { count: values.length, sha256: hash(JSON.stringify(values)) }
    }
    return result
  })
  return { rows, snapshot }
}

function statusCheck(response, payload, expected) {
  if (![expected].flat().includes(response.status())) {
    const e = new Error('HTTP status')
    e.httpStatus = response.status()
    if (/^[A-Z][A-Z0-9_]{1,60}$/.test(payload?.code)) e.businessCode = payload.code
    throw e
  }
}

export function harness({ host, browser, facts, out, password }) {
  const { base } = host
  const { rows, snapshot } = database(host.dbPath)
  const scope = path => {
    assert(path.startsWith('/') && new URL(path, base).origin === base)
    return base + path
  }
  async function login(name) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN', serviceWorkers: 'block' })
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === base) return route.continue()
      facts.browser_denied++
      return route.abort()
    })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    await page.goto(scope('/knowledgeos/account'))
    await page.locator('#login_name').fill(name)
    await page.locator('#login_password').fill(password)
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url() === scope(`${prefix}/auth/login`) && r.request().method() === 'POST'),
      page.locator('#login').click(),
    ])
    statusCheck(response, undefined, 200)
    await page.locator('#profile').waitFor()
    const me = await context.request.get(scope(`${prefix}/me`), { maxRedirects: 0 })
    statusCheck(me, undefined, 200)
    const { id } = (await me.json()).data
    assert.match(id, uuid)
    return { name, id, context, page }
  }
  // LEARN-005 invitation and practice protocols, using this controller's own isolated base.
  async function wire(actor, path, { method = 'GET', data, key = randomUUID(), headers = {} } = {}) {
    const response = await actor.context.request.fetch(scope(path), { method, data, maxRedirects: 0,
      headers: { 'x-knowledgeos-reader-actor': actor.id, ...(method === 'GET' ? {} : {
        'content-type': 'application/json', 'x-knowledgeos-request': '1', 'idempotency-key': key,
      }), ...headers },
    })
    const payload = await response.json()
    return { response, payload }
  }
  async function api(actor, path, options = {}) {
    const { response, payload } = await wire(actor, path, options)
    statusCheck(response, payload, options.status ?? 200)
    assert(payload.data)
    if (Object.hasOwn(payload.data, 'actor_id')) assert.equal(payload.data.actor_id, actor.id)
    return payload.data
  }
  async function deny(actor, path, options = {}, statuses = [403, 404], markers = []) {
    const { response, payload } = await wire(actor, path, options)
    statusCheck(response, payload, statuses)
    assert.equal(payload.data, undefined)
    assert.equal(typeof payload.code, 'string')
    absent(payload, markers)
  }
  async function event(actor, path, method, click, status) {
    const { page } = actor
    const canonical = value => { const url = new URL(value); url.searchParams.sort(); return url.href }
    const url = canonical(scope(path))
    facts.last_ui = { method, route: new URL(url).pathname.replaceAll(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g, ':id'),
      ...(typeof click === 'string' && { control: click }) }
    const [response] = await Promise.all([
      page.waitForResponse(r => r.request().method() === method && canonical(r.url()) === url, { timeout: 45000 }),
      typeof click === 'string' ? page.locator(click).click() : click(),
    ])
    const payload = await response.json()
    statusCheck(response, payload, status)
    if (Object.hasOwn(payload.data, 'actor_id')) assert.equal(payload.data.actor_id, actor.id)
    const request = response.request()
    if (method !== 'GET' && path !== `${prefix}/citations`) assert.equal(request.headers()['x-knowledgeos-reader-actor'], actor.id)
    return { data: payload.data, body: method === 'GET' ? undefined : request.postDataJSON(), key: request.headers()['idempotency-key'] }
  }
  async function capture(actor, selector, name) {
    assert.match(name, /^[a-z0-9-]+$/)
    // Clip to a business component. Account pages, address bars and Host chrome are never captured.
    const image = await actor.page.locator(selector).screenshot({ path: join(out, name + '.png'), animations: 'disabled' })
    facts.screens.push({ file: name + '.png', sha256: hash(image), bytes: image.length })
  }
  async function grant(owner, members, type, id) {
    const invite = await api(owner, `${prefix}/invitations`, { method: 'POST', status: 201, data: {
      actor_id: owner.id, scope: type, target_id: id, permission: type === 'project' ? 'member' : 'read', days: 2, max_redemptions: members.length,
    } })
    for (const member of members) await api(member, `${prefix}/invitations/redeem`, { method: 'POST', status: 201,
      data: { actor_id: member.id, token: invite.token },
    })
    return invite.id
  }
  async function publish(owner, bytes, filename, previous) {
    const result = await api(owner, `${prefix}/imports`, { method: 'POST', status: 201, data: bytes, headers: {
      'content-type': 'text/markdown', 'x-knowledgeos-filename': filename,
      ...(previous ? { 'x-knowledgeos-asset-id': previous.id, 'x-knowledgeos-expected-version': String(previous.version) } : {}),
    } })
    assert.match(result.id, uuid); assert.match(result.version_id, uuid)
    assert.equal(result.sha256, hash(bytes))
    return result
  }
  async function original(actor, asset, expectedHash) {
    const response = await actor.context.request.get(scope(`${versionPath(asset)}/original`), { maxRedirects: 0 })
    statusCheck(response, undefined, 200)
    assert.equal(hash(await response.body()), expectedHash)
  }
  const step = phase => { facts.phase = phase }
  const pass = (id, details = {}) => facts.checks.push({ id, status: 'PASS', ...details })
  return { base, facts, host, rows, snapshot, login, wire, api, deny, event, capture, grant, publish, original, step, pass }
}
