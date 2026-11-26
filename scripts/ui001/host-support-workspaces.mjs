import assert from 'node:assert/strict'
import { join } from 'node:path'
import { hash } from '../learn006/host-support.mjs'
import { homes, shortcuts, sizes } from './host-support-expectations.mjs'

const ready = { terms: '#term-workspace', recall: '#collection', quick: '#practice-workspace', review: '#review-workspace' }
const target = (page, entry) => page.locator('#learning-shortcuts').getByRole('link', { name: entry.name, exact: true })

async function home(h, actor, path) {
  assert(homes.includes(path))
  await actor.page.bringToFront()
  const res = await actor.page.goto(h.base + path)
  assert.equal(res.status(), 200)
  assert.equal(actor.page.url(), h.base + path)
  await actor.page.locator('#learning-shortcuts').waitFor()
}

async function activate(page, base, path, action) {
  const url = base + path
  const [res] = await Promise.all([
    page.waitForResponse(r => r.url() === url && r.request().isNavigationRequest() && r.frame() === page.mainFrame()),
    page.waitForURL(url), action(),
  ])
  assert.equal(res.status(), 200)
  assert.equal(res.request().method(), 'GET')
  assert.equal(res.request().redirectedFrom(), null)
  assert.equal(page.url(), url)
}

export async function openEntry(h, actor, workspace, key) {
  await home(h, actor, workspace)
  const entry = shortcuts.find(item => item.key === key)
  await activate(actor.page, h.base, entry.path, () => target(actor.page, entry).click())
  await actor.page.locator(ready[key]).waitFor()
}

// Tab from the live document. Do not programmatically focus the link or send keys to a locator.
async function keyboardFocus(page, link) {
  const limit = 3 + await page.locator('a[href],button,input,select,textarea,[tabindex],summary').count()
  for (let tabs = 1; tabs <= limit; tabs++) {
    await page.keyboard.press('Tab')
    const state = await link.evaluate(a => {
      if (document.activeElement !== a) return null
      const s = getComputedStyle(a)
      return { focus_visible: a.matches(':focus-visible'), outline: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow !== 'none' }
    })
    if (state) {
      assert(state.focus_visible && ((state.outline !== 'none' && state.width > 0) || state.shadow))
      return { tabs, ...state }
    }
  }
  assert.fail('link not reachable with Tab')
}

async function layout(page) {
  const measured = await page.evaluate(() => {
    const root = document.documentElement, w = root.clientWidth, h = root.clientHeight
    const selector = 'nav,aside,[role=navigation],[role=complementary],[class*="sidebar" i],[id*="sidebar" i]'
    const columns = Array.from(document.body.querySelectorAll('*')).filter(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el)
      return (el.matches(selector) || ['sticky','fixed'].includes(s.position)) && s.visibility === 'visible' &&
        r.width > 0 && r.width < w / 2 && r.height > h * 0.45 && r.right > 0 && r.left < w && r.top < h && r.bottom > 0
    })
    const distinct = columns.filter(child => !columns.some(parent => parent !== child && parent.contains(child)))
    let depth = 0
    for (const link of document.querySelectorAll('.workspace-nav a, #learning-shortcuts a')) {
      let n = 0
      for (let el = link.parentElement; el; el = el.parentElement) if (el.matches('nav,[role=navigation],[role=menu],details')) n++
      depth = Math.max(n, depth)
    }
    return { viewport: [innerWidth, innerHeight], page_width: w, document_width: root.scrollWidth,
      body_width: document.body.scrollWidth, horizontal_offset: scrollX, sidebar_columns: distinct.length, nav_ancestor_depth: depth }
  })
  assert(measured.document_width <= measured.page_width && measured.body_width <= measured.page_width)
  assert.equal(measured.horizontal_offset, 0)
  assert(measured.sidebar_columns < 3)
  assert(measured.nav_ancestor_depth <= 2)
  return measured
}

async function fourLinks(page, base) {
  const links = page.locator('#learning-shortcuts').getByRole('link')
  assert.equal(await links.count(), shortcuts.length)
  const observations = []
  for (const entry of shortcuts) {
    const link = target(page, entry)
    assert.equal(await link.count(), 1)
    assert.equal(await link.isVisible(), true)
    assert((await link.innerText()).includes(entry.name))
    const sample = await link.evaluate(a => {
      const box = a.getBoundingClientRect(), cx = box.left + box.width / 2, cy = box.top + box.height / 2
      return { href: a.href, x: box.x, y: box.y, width: box.width, height: box.height,
        in_first_view: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= document.documentElement.clientWidth,
        center_hits_link: a.contains(document.elementFromPoint(cx, cy)) }
    })
    assert.equal(sample.href, base + entry.path)
    assert(sample.width > 0 && sample.height > 0 && sample.in_first_view && sample.center_hits_link)
    const { href, ...geometry } = sample
    observations.push({ name: entry.name, href: new URL(href).pathname + new URL(href).search, ...geometry })
  }
  return observations
}

// Exercise both directions of workspace switching and every shortcut at both viewport sizes.
export async function checkNavigation(h, actor, out) {
  const page = actor.page
  for (const [size, viewport] of Object.entries(sizes)) {
    await page.setViewportSize(viewport)
    for (const [index, path] of homes.entries()) {
      const workspace = path.split('/').pop(), other = homes[1 - index]
      h.step(`layout_${workspace}_${size}`)
      await home(h, actor, path)
      const measured = await layout(page)
      assert.deepEqual(measured.viewport, [viewport.width, viewport.height])
      const links = await fourLinks(page, h.base)
      const shot = `${size}-${workspace}.png`
      const image = await page.screenshot({ path: join(out, shot), animations: 'disabled',
        mask: [page.locator('#who,#list,#receipt,input[type=file]')] })
      h.facts.screens.push({ file: shot, sha256: hash(image), bytes: image.length })
      const switcher = page.locator('.workspace-nav').getByRole('link', { name: index === 0 ? '今日计划' : '知识库', exact: true })
      const workspaceFocus = await keyboardFocus(page, switcher)
      await activate(page, h.base, other, () => page.keyboard.press('Enter'))
      await page.locator('#learning-shortcuts').waitFor()
      const activations = []
      for (const entry of shortcuts) {
        h.step(`keyboard_${workspace}_${size}_${entry.key}`)
        await home(h, actor, path)
        const focus = await keyboardFocus(page, target(page, entry))
        if (entry.key === 'terms') await h.capture(actor, '#learning-shortcuts', `focus-${workspace}-${size}`)
        await activate(page, h.base, entry.path, () => page.keyboard.press('Enter'))
        await page.locator(ready[entry.key]).waitFor()
        activations.push({ href: entry.path, ...focus, destination: await layout(page) })
      }
      h.facts.navigation.push({ workspace, size, ...measured, links, switch_to: other, workspace_focus: workspaceFocus, activations })
    }
  }
  await page.setViewportSize(sizes.wide)
}
