import assert from 'node:assert/strict'
import { absent, hash, prefix, termList, terms, uuid, versionPath } from './host-support.mjs'

const word = '索引'
const contexts = [
  { stage: 'database-index', marker: '数据库索引（database index）', concept: /查[找询阅]|检索|扫描|数据结构|定位.{0,8}记录|目录|找到|快速定位/iu },
  { stage: 'array-index', marker: '数组索引（array index）', concept: /位置|编号|下标|元素|第几|偏移/u },
]

// The controller authorizes the last occurrence in each exact KNOW-001 synthetic paragraph.
// Compute coordinates from frozen input bytes, before inspecting any product term or citation.
export function sources(h, fixture, asset, kind) {
  const lines = fixture.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
  return contexts.map(context => {
    const matches = lines.filter(line => line.includes(context.marker))
    assert.equal(matches.length, 1)
    const text = matches[0] + '\n'
    const delimit = text.split('「索引」')
    assert.equal(delimit.length, 2)
    const start = kind === 'main' ? text.lastIndexOf(word) : Buffer.byteLength(delimit[0] + '「', 'utf16le') / 2
    assert(start > text.indexOf(word) && start > [...text.slice(0, start)].length)
    assert.equal(text.slice(start, start + word.length), word)
    const blocks = h.rows('SELECT ordinal, anchor FROM text_blocks WHERE version_id=? AND text=?', asset.version_id, text)
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].anchor, hash(text))
    const spec = { asset_id: asset.id, version_id: asset.version_id, ordinal: blocks[0].ordinal,
      start, end: start + word.length, source_hash: hash(text) }
    return { ...context, text, spec }
  })
}

export const reader = asset => '/knowledgeos/reader?' + new URLSearchParams({ asset: asset.id, version: asset.version_id })
export const position = async (h, actor, asset) => (await h.api(actor, `${versionPath(asset)}/reader-state`)).position
export const list = async (h, actor, asset, archived = false) => (await h.api(actor, termList(asset, archived))).terms
export const getTerm = async (h, actor, id) => (await h.api(actor, `${terms}/${id}`)).term

export function assertSpec(value, spec) {
  for (const key of ['asset_id','version_id','ordinal','start','end','source_hash']) assert.equal(value[key], spec[key], `source field ${key}`)
  assert.equal(value.conversion_id ?? null, null)
}
export async function openReader(h, actor, asset) {
  await actor.page.bringToFront()
  await actor.page.goto(h.base + reader(asset))
  await actor.page.locator('#text').waitFor()
}
export async function jump(h, actor, asset, source) {
  const { page } = actor
  await page.waitForFunction(() => !document.getElementById('bookmark-add').disabled)
  await page.locator('#number').fill(String(source.spec.ordinal))
  await h.event(actor, `${versionPath(asset)}/reader-state`, 'PUT',
    () => page.locator('#jump').getByRole('button', { name: '跳转', exact: true }).click(), 200)
  assert.equal(await page.locator('#text').textContent(), source.text)
  assert.equal((await position(h, actor, asset)).ordinal, source.spec.ordinal)
}

// TreeWalker and native DOM Range from KNOW-001, also valid when a mark splits a text node.
export async function select(actor, text, start, end) {
  const measured = await actor.page.locator('#text').evaluate((node, selection) => {
    const { start, end } = selection
    function boundary(offset) {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        if (offset <= walker.currentNode.length) return [walker.currentNode, offset]
        offset -= walker.currentNode.length
      }
      throw Error('DOM range boundary')
    }
    const range = document.createRange()
    range.setStart(...boundary(start)); range.setEnd(...boundary(end))
    const user = window.getSelection()
    user.removeAllRanges(); user.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    const before = range.cloneRange()
    before.selectNodeContents(node); before.setEnd(range.startContainer, range.startOffset)
    return { text: node.textContent, start: before.toString().length, quote: user.toString() }
  }, { start, end })
  assert.deepEqual(measured, { text, start, quote: text.slice(start, end) })
}

export async function sourceHref(h, actor, href, spec) {
  assert.equal(typeof href, 'string')
  const url = new URL(href, h.base)
  assert.equal(url.origin, h.base); assert.equal(url.pathname, '/knowledgeos/reader')
  const q = url.searchParams
  assert.equal(q.get('asset'), spec.asset_id); assert.equal(q.get('version'), spec.version_id)
  assert.equal(q.get('conversion'), null)
  if (q.has('citation')) {
    const id = q.get('citation'); assert.match(id, uuid)
    const pinned = await h.api(actor, `${prefix}/citations/${id}/resolve`)
    assertSpec(pinned, spec)
  } else {
    assert.equal(q.get('unit'), String(spec.ordinal))
    assert.equal(q.get('match'), `${spec.start}:${spec.end}:${spec.source_hash}`)
  }
  return url
}

export async function assertMarked(h, actor, source) {
  const { page } = actor, { spec } = source
  await page.locator('#text mark').waitFor()
  await sourceHref(h, actor, page.url(), spec)
  assert.equal(await page.locator('#number').inputValue(), String(spec.ordinal))
  const measured = await page.locator('#text').evaluate(node => {
    const marks = node.querySelectorAll('mark')
    if (marks.length !== 1) throw Error('expected one restored mark')
    const before = document.createRange(); before.selectNodeContents(node); before.setEndBefore(marks[0])
    const start = before.toString().length, quote = marks[0].textContent
    return { text: node.textContent, start, end: start + quote.length, quote }
  })
  assert.deepEqual(measured, { text: source.text, start: spec.start, end: spec.end, quote: source.text.slice(spec.start, spec.end) })
  return { ordinal: spec.ordinal, start: measured.start, end: measured.end, block_sha256: hash(measured.text), quote_sha256: hash(measured.quote),
    version_sha256: hash(spec.version_id) }
}

export async function saveContext(h, actor, peer, asset, source) {
  await openReader(h, actor, asset); await jump(h, actor, asset, source)
  const { page } = actor, { spec } = source
  const before = h.snapshot(), saved = await list(h, actor, asset)
  await select(actor, source.text, spec.start, spec.end)
  await h.host.beforeExplain({ stage: source.stage, spec, sourceText: source.text })
  const lookup = await h.event(actor, terms + '/explain', 'POST', '#term-explain', 200)
  const draft = lookup.data, x = draft.explanation
  assert.deepEqual(lookup.body, spec); assertSpec(draft.source, spec)
  assert.equal(draft.term, word); assert.equal(draft.source.quote, word); assert.equal(draft.source.quote_hash, hash(word))
  assert(source.text.includes(draft.source.excerpt) && draft.source.excerpt.includes(source.marker))
  await page.locator('#term-evidence').waitFor()
  assert.equal(await page.locator('#term-evidence').textContent(), draft.source.excerpt)
  for (const field of ['context', 'plain', 'professional']) {
    assert.match(x[field], source.concept); assert.equal(await page.locator('#term-' + field).textContent(), x[field])
  }
  assert(x.confusions.length > 0)
  const confused = await page.locator('#term-confusions').textContent()
  assert.match(confused, /索引|检索|扫描|查[找询]|键|树|目录|数据结构|数组|位置|指针|编号|下标|元素|偏移/u)
  for (const item of x.confusions) {
    assert(item.term.trim() && item.distinction.trim()); assert(confused.includes(item.term) && confused.includes(item.distinction))
  }
  await sourceHref(h, actor, await page.locator('#term-origin').getAttribute('href'), spec)
  assert.deepEqual(h.snapshot(), before); assert.deepEqual(await list(h, actor, asset), saved)
  await h.deny(peer, terms, { method: 'POST', data: { explanation_id: draft.explanation_id } }, [403, 404, 409])
  assert.deepEqual(h.snapshot(), before)
  await h.capture(actor, '#term-panel', source.stage + '-temporary')
  const receipt = await h.event(actor, terms, 'POST', '#term-save', 201)
  assert.equal(receipt.body.explanation_id, draft.explanation_id)
  const card = receipt.data.term
  assert.match(card.id, uuid); assert.equal(card.favorite, true); assert(Number.isSafeInteger(card.revision))
  assertSpec(card.source, spec); assert.deepEqual(card.explanation, x)
  const all = await list(h, actor, asset)
  assert.deepEqual(all.map(t => t.id).sort(), [...saved.map(t => t.id), card.id].sort())
  const raw = h.rows('SELECT * FROM saved_terms WHERE id=? AND owner_id=?', card.id, actor.id)
  assert.equal(raw.length, 1); assertSpec(raw[0], spec); assert.equal(raw[0].quote_hash, hash(word))
  assert.deepEqual(JSON.parse(raw[0].explanation_json).explanation, x)
  assert.equal(h.rows('SELECT COUNT(*) AS n FROM saved_terms')[0].n, all.length)
  return card
}

export async function openCard(h, actor, asset, card, archived = false) {
  await openReader(h, actor, asset)
  const { page } = actor
  const initial = await h.event(actor, termList(asset), 'GET', '#terms-open', 200)
  let listed = initial.data.terms
  await page.locator('#term-list').waitFor()
  if (archived) {
    const archivedList = await h.event(actor, termList(asset, true), 'GET', '#term-archive-toggle', 200)
    listed = archivedList.data.terms
  }
  const index = listed.findIndex(t => t.id === card.id)
  assert(index >= 0)
  const buttons = page.locator('#term-list li button')
  const byId = page.locator(`#term-list [data-term-id="${card.id}"]:is(button), #term-list [data-term-id="${card.id}"] button`)
  const target = (await byId.count()) === 1 ? byId : buttons.nth(index)
  const got = await h.event(actor, `${terms}/${card.id}`, 'GET', () => target.click(), 200)
  assert.equal(got.data.term.id, card.id)
  await page.locator('#term-origin').waitFor()
  await sourceHref(h, actor, await page.locator('#term-origin').getAttribute('href'), card.source)
  return got.data.term
}

export async function editCard(h, actor, peer, asset, card, other, supplement) {
  await openCard(h, actor, asset, card)
  const db = () => h.rows('SELECT * FROM saved_terms WHERE id=?', card.id)[0]
  const original = db()
  await actor.page.locator('#term-supplement').fill(supplement)
  const edit = await h.event(actor, `${terms}/${card.id}`, 'PATCH', '#term-edit', 200)
  assert.deepEqual(edit.body, { expected_revision: card.revision, supplement })
  const edited = await getTerm(h, actor, card.id)
  assert(edited.revision > card.revision); assert.equal(edited.supplement, supplement); assert.equal(edited.favorite, true)
  assert.deepEqual(edited.explanation, card.explanation); assert.deepEqual(edited.source, card.source)
  assert.deepEqual(db(), original)
  const preferences = h.rows('SELECT revision,favorite,supplement FROM term_card_preferences WHERE term_id=? AND owner_id=?', card.id, actor.id)
  assert.deepEqual(preferences, [{ revision: edited.revision, favorite: 1, supplement }])
  const before = h.snapshot()
  await h.deny(actor, `${terms}/${card.id}`, { method: 'PATCH', data: { expected_revision: card.revision, supplement: '过期补充' } }, [409])
  assert.deepEqual(await getTerm(h, actor, other.id), other)
  assert.deepEqual(await list(h, peer, asset), [])
  for (const term of [edited, other]) {
    await h.deny(peer, `${terms}/${term.id}`, {}, [403, 404], [supplement, term.explanation.plain])
    await h.deny(peer, `${terms}/${term.id}`, { method: 'PATCH', data: { expected_revision: term.revision, favorite: false } })
  }
  assert.deepEqual(h.snapshot(), before)
  // openCard navigates afresh, so a textarea value held in the old document cannot pass.
  await openCard(h, actor, asset, edited)
  assert.equal(await actor.page.locator('#term-supplement').inputValue(), supplement)
  assert.equal(await actor.page.locator('#term-professional').textContent(), card.explanation.professional)
  await h.capture(actor, '#term-panel', 'saved-edited-card')
  await openReader(h, peer, asset)
  await h.event(peer, termList(asset), 'GET', '#terms-open', 200)
  await peer.page.locator('#term-status').filter({ hasText: '没有收藏的术语' }).waitFor()
  assert.equal(await peer.page.locator('#term-list li button').count(), 0)
  absent(await peer.page.locator('#term-panel').innerText(), [supplement, edited.explanation.professional])
  return edited
}

export async function favorite(h, actor, card, value) {
  const result = await h.event(actor, `${terms}/${card.id}`, 'PATCH', '#term-favorite', 200)
  assert.deepEqual(result.body, { expected_revision: card.revision, favorite: value })
  const saved = await getTerm(h, actor, card.id)
  assert.equal(saved.id, card.id); assert.equal(saved.favorite, value); assert(saved.revision > card.revision)
  for (const field of ['explanation','source','supplement']) assert.deepEqual(saved[field], card[field])
  return saved
}
