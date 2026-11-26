import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { bank, hash, prefix, terms, uuid } from '../learn006/host-support.mjs'

const post = data => ({ method: 'POST', status: 201, data })
export const recall = `${prefix}/recall`
export const collection = `${terms}/collection`

async function materialSource(h, owner, text, word, filename) {
  const asset = await h.publish(owner, Buffer.from(text), filename)
  const spec = { asset_id: asset.id, version_id: asset.version_id, ordinal: 1,
    start: text.lastIndexOf(word), end: text.lastIndexOf(word) + word.length, source_hash: hash(text) }
  assert(spec.start >= 0)
  const source = await h.api(owner, `${recall}/source?` + new URLSearchParams({
    asset_id: asset.id, version_id: asset.version_id, ordinal: '1',
  }))
  assert.deepEqual([source.ordinal, source.source_hash, source.text], [1, spec.source_hash, text])
  return { asset, text, word, spec }
}

export async function createRecall(h, actor, source, title) {
  const { asset_id, version_id, ordinal, source_hash, start, end } = source.spec
  const point = offset => ({ ordinal, offset, source_hash })
  const result = await h.api(actor, recall, post({ actor_id: actor.id, asset_id, version_id, title,
    first: point(0), last: point(source.text.length), interior_hashes: [], masks: [{ ordinal, start, end, group: 1 }] }))
  assert.match(result.material.id, uuid)
  assert.deepEqual([result.progress.self_rating, result.revision], [null, 1])
  return result.material
}

// LEARN-005 project invitations and LEARN-004 source/range contracts. All prepared
// objects except the handwritten saved terms go through the real Host's public HTTP surface.
export async function prepare(h, owner, a, b, independent) {
  const tag = independent ? '复核' : '主跑'
  const word = independent ? '版本' : '索引'
  const text = `🧭 ${tag}资料。前一处${word}用于对照，后一处${word}是本次需要回看的词。`
  const source = await materialSource(h, owner, text, word, 'learning-source.md')
  const limited = await materialSource(h, owner, '另一份合成资料只在准备期间开放。', '合成', 'limited-source.md')
  const project = await h.api(owner, `${prefix}/projects`, post({ name: `${tag}导航用例` }))
  await h.grant(owner, [a, b], 'project', project.id)
  await h.grant(owner, [a, b], 'object', source.asset.id)
  const limitedGrant = await h.grant(owner, [a], 'object', limited.asset.id)
  for (const actor of [a, b]) await h.original(actor, source.asset, hash(text))
  const citation = await h.api(owner, `${prefix}/citations`, post(source.spec))
  assert.equal(citation.quote_hash, hash(word))
  const correct = independent ? 2 : 1
  const draft = { kind: 'choice', prompt: `在${tag}资料中，后一处固定的词是什么？`, difficulty: 'basic',
    options: correct === 2 ? ['日期', word] : [word, '日期'], answer: correct, explanation: '引用标出了后一处词。',
    source_citation_id: citation.id, project_id: project.id }
  const { question } = await h.api(owner, bank, post(draft))
  assert.match(question.version_id, uuid)
  assert.equal(question.prompt, draft.prompt)
  for (const actor of [a, b]) {
    const visible = (await h.api(actor, bank)).questions
    assert.deepEqual(visible.map(q => [q.id, q.version_id]), [[question.id, question.version_id]])
  }
  const material = await createRecall(h, a, source, `${tag}甲的遮挡`)
  return { source, limited, limitedGrant, question, citation, material, incorrect: 3 - correct, explanation: draft.explanation }
}

// Same v43 service API as LEARN-006. Open the isolated SQLite only while its Host
// is stopped. These are handwritten inputs for navigation, never model responses.
export async function seedTerms({ ProbeStorage, IdentityService }, dataDir, learner, password, fixture) {
  const store = new ProbeStorage({ dataDir })
  let identity
  try {
    assert(store.available)
    identity = new IdentityService(store)
    const login = await identity.login({ loginName: learner.name, password, source: 'ui001-local-seed' })
    const actor = identity.actor(login.token)
    assert.equal(actor?.userId, learner.id)
    function card(input, label) {
      const { source } = store.terms.selection(actor, input.spec)
      assert.equal(source.quote, input.word)
      const result = store.terms.save(actor, { explanation_id: randomUUID(), term: input.word, source,
        provider: 'offline-fixture', model: 'handwritten', explanation: { context: `${label}的语境`, plain: '本地合成说明。',
          professional: `${label}的定义`, confusions: [{ term: '日期', distinction: '分别核对原文和作答。' }], uncertainty: '' },
      }, `${label}的个人补充`)
      assert.equal(result.replayed, false)
      assert.equal(result.term.favorite, true)
      return result.term
    }
    return { kept: card(fixture.source, '保留'), archived: card(fixture.source, '收起'), restricted: card(fixture.limited, '限时') }
  } finally { try { await identity?.close() } finally { store.close() } }
}

export async function filterControls(h, owner, a, f) {
  const { archived, restricted } = f.cards
  const update = await h.api(a, `${terms}/${archived.id}`, { method: 'PATCH',
    data: { expected_revision: archived.revision, favorite: false } })
  assert.equal(update.term.favorite, false)
  const invitation = `${prefix}/invitations/${f.limitedGrant}`
  const { revision } = await h.api(owner, invitation)
  await h.api(owner, `${invitation}/revoke`, { method: 'POST', data: { actor_id: owner.id, expected_revision: revision } })
  await h.deny(a, `${terms}/${restricted.id}`)
  assert.deepEqual(h.rows('SELECT id FROM saved_terms WHERE owner_id=? ORDER BY id', a.id).map(r => r.id),
    Object.values(f.cards).map(card => card.id).sort())
  assert.deepEqual(h.rows('SELECT term_id,favorite FROM term_card_preferences WHERE owner_id=?', a.id),
    [{ term_id: archived.id, favorite: 0 }])
}
