import assert from 'node:assert/strict'
import { absent, action, bank, hash, prefix, review, sessions, termList, terms, versionPath } from './host-support.mjs'
import { favorite, getTerm, jump, list, openCard, openReader, position } from './host-support-reader.mjs'
import { historyButton, historyReturn, protectedCatalog, returnToSource, termOrigin } from './host-support-practice.mjs'

export async function returnsAndFavorites(h, A, B, asset, dbSource, arraySource, card, other, qs, state, bPosition) {
  const { a } = state, { target } = qs
  await A.page.bringToFront()
  await returnToSource(h, A, dbSource, 'practice-exact-reader-return')
  assert.deepEqual(await position(h, B, asset), bPosition)
  // Move the reader before each later return. Restoring the last viewed paragraph would be wrong.
  await jump(h, A, asset, arraySource)
  await historyReturn(h, A, a, target, dbSource, 'review')
  assert.deepEqual(await position(h, B, asset), bPosition)
  h.pass('RETURN_TO_READING', { reader_utf16: [dbSource.spec.start, dbSource.spec.end], peer_ordinal: bPosition.ordinal,
    source_ordinal: dbSource.spec.ordinal, original_hash: dbSource.spec.source_hash, question_citation_utf16: [target.ref.start, target.ref.end] })

  await openCard(h, A, asset, card)
  const before = h.snapshot(), archived = await favorite(h, A, card, false)
  assert.deepEqual((await list(h, A, asset)).map(t => t.id), [other.id])
  const removed = (await list(h, A, asset, true)).find(t => t.id === card.id)
  assert.deepEqual(removed, archived)
  // Check the default list in a fresh Chrome document, then click the actual practice history while archived.
  const separate = { ...A, page: await A.context.newPage() }
  separate.page.setDefaultTimeout(15000)
  try {
    await openReader(h, separate, asset); await jump(h, separate, asset, arraySource)
    await h.event(separate, termList(asset), 'GET', '#terms-open', 200)
    await separate.page.locator('#term-list').waitFor()
    assert.equal(await separate.page.locator('#term-list li button').count(), 1)
    await historyReturn(h, separate, a, target, dbSource, 'history')
  } finally { await separate.page.close() }
  await termOrigin(h, A, (await h.api(A, action(a, 'questions'))).session, archived, dbSource)
  assert.deepEqual(await position(h, B, asset), bPosition)
  await A.page.bringToFront()
  await openCard(h, A, asset, archived, true)
  await h.capture(A, '#term-panel', 'archived-card-before-restore')
  const restored = await favorite(h, A, archived, true)
  assert.deepEqual((await list(h, A, asset)).map(t => t.id).sort(), [card.id, other.id].sort())
  assert.deepEqual(await getTerm(h, A, other.id), other)
  const after = h.snapshot()
  for (const name of ['assets','asset_versions','blobs','text_blocks','citations','questions','question_versions',
    'practice_sessions','practice_session_questions','practice_attempts','practice_attempt_receipts','practice_hint_events']) assert.deepEqual(after[name], before[name])
  await h.original(B, asset, asset.sha256)
  h.pass('T02_archive_history_restore', { restored_same_card: true, original_sha256: asset.sha256, preserved_attempts: after.practice_attempts.count })
  return restored
}

export async function checkRevoked(h, A, B, asset, source, card, other, qs, state, bPosition, screen) {
  const { a, b, peer, aReceipt } = state, { target } = qs
  const markers = [target.prompt, target.explanation, source.marker, card.supplement, card.explanation.professional, card.id, source.spec.source_hash]
  const denied = (path, options) => h.deny(A, path, options, [403, 404], markers)
  for (const path of [versionPath(asset) + '/original', versionPath(asset) + '/reader?unit=' + source.spec.ordinal,
    `${prefix}/citations/${target.ref.id}/resolve`, `${terms}/${card.id}`, `${terms}/${other.id}`, action(a, 'questions')]) await denied(path)
  await denied(`${terms}/${card.id}`, { method: 'PATCH', data: { expected_revision: card.revision, supplement: '撤权后尝试编辑' } })
  await denied(sessions, { method: 'POST', data: aReceipt.body, key: aReceipt.key })
  await denied(action(a, 'attempts'), { method: 'POST', data: state.first.body, key: state.first.key })
  for (const archived of [false, true]) {
    const { response, payload } = await h.wire(A, termList(asset, archived))
    assert([200, 403, 404].includes(response.status()))
    if (response.status() === 200) assert.deepEqual(payload.data.terms, [])
    else assert.equal(payload.data, undefined)
    absent(payload, markers)
  }
  await protectedCatalog(h, A, card, markers)
  assert.deepEqual((await h.api(A, bank)).questions, [])
  assert.deepEqual((await h.api(A, sessions)).sessions, [])
  assert.deepEqual((await h.api(A, review)).items, [])
  await A.page.bringToFront(); await A.page.goto(new URL(card.source.origin, h.base).href)
  await A.page.locator('#status').filter({ hasText: /不可访问|权限/ }).waitFor()
  assert.equal(await A.page.locator('#text mark').count(), 0); absent(await A.page.locator('body').innerText(), markers)
  await A.page.goto(h.base + '/knowledgeos/practice?session=' + a.id)
  await A.page.locator('#practice-workspace').waitFor()
  await A.page.locator('#practice-status').filter({ hasText: /不可访问|权限/ }).waitFor()
  assert.equal(await A.page.locator('#quick-return-reader').isVisible(), false)
  assert.equal(await A.page.locator('#practice-detail').isVisible(), false)
  assert.equal(await historyButton(A, a).count(), 0); absent(await A.page.locator('body').innerText(), markers)
  await h.capture(A, '#practice-status', screen + '-revoked-practice')
  await A.page.goto(h.base + '/knowledgeos/review'); await A.page.locator('#review-workspace').waitFor()
  assert.equal(await A.page.locator('#review-questions button').count(), 0); absent(await A.page.locator('body').innerText(), markers)
  await h.original(B, asset, asset.sha256)
  assert((await h.api(B, bank)).questions.some(q => q.version_id === target.version_id))
  const details = await h.api(B, action(b, 'questions'))
  assert.deepEqual(details.questions[0].attempts.map(item => item.id), [peer.row.id]); assert.equal(details.questions[0].feedback.evidence.id, target.ref.id)
  assert.deepEqual(await position(h, B, asset), bPosition)
  await B.page.bringToFront(); await B.page.goto(h.base + '/knowledgeos/practice'); await historyButton(B, b).click()
  await B.page.locator('#practice-feedback').filter({ hasText: target.explanation }).waitFor()
  assert.equal(await B.page.locator('#quick-return-reader').isVisible(), false)
  assert.deepEqual(await list(h, B, asset), [])
  await h.deny(B, `${terms}/${card.id}`)
  await openReader(h, B, asset)
  assert.equal(await B.page.locator('#number').inputValue(), String(bPosition.ordinal))
  const [block] = h.rows('SELECT anchor FROM text_blocks WHERE version_id=? AND ordinal=?', asset.version_id, bPosition.ordinal)
  assert.equal(hash(await B.page.locator('#text').textContent()), block.anchor)
}

export async function revoke(h, owner, A, asset, card, grantId) {
  await openCard(h, A, asset, card)
  await A.page.locator('#term-professional').filter({ hasText: card.explanation.professional }).waitFor()
  const path = `${prefix}/invitations/${grantId}`
  const grant = await h.api(owner, path)
  await h.api(owner, path + '/revoke', { method: 'POST', data: { actor_id: owner.id, expected_revision: grant.revision } })
  // Observe the mounted Reader clear on its own ACL recheck, before opening any fresh URL.
  await A.page.locator('#status').filter({ hasText: /不可访问|权限/ }).waitFor()
  await A.page.locator('#term-panel').waitFor({ state: 'hidden' }); await A.page.locator('#text').waitFor({ state: 'hidden' })
  absent(await A.page.locator('body').innerText(), [card.explanation.professional, card.supplement])
  await h.capture(A, '#status', 'active-reader-revoked')
}

export function sqlProof(h, snapshot) {
  for (const [table, count] of Object.entries({ saved_terms: 2, questions: 4, practice_sessions: 2, practice_attempts: 3, practice_hint_events: 1 })) {
    assert.equal(snapshot[table].count, count)
  }
  assert.deepEqual(h.rows('PRAGMA foreign_key_check'), [])
  assert.deepEqual(h.rows('PRAGMA quick_check'), [{ quick_check: 'ok' }])
  return { tables: Object.keys(snapshot).length, business_rows_sha256: hash(JSON.stringify(snapshot)),
    terms: snapshot.saved_terms.count, attempts: snapshot.practice_attempts.count, hints: snapshot.practice_hint_events.count }
}
