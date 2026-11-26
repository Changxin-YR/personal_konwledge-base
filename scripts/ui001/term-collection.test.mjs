import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempDisposableSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { decodeText } from '../../packages/knowledgeos-panel/src/host/text-document.ts'
import { digest, lib, query, root, seed } from '../fnd006/independent/common.mjs'

const v42 = '0649220a90acdbc29b9f0853ba5a1e67a9538e4b'

function publish(store, owner, text, previous) {
  const bytes = Buffer.from(text), key = randomUUID()
  const revision = previous && { assetId: previous.id, expectedVersion: previous.version }
  const { receipt } = store.assets.publish(owner, { title: 'fixture.txt', key, ...revision },
    { key, sha256: digest(bytes), byteLength: bytes.length }, { media: 'text/plain', ...decodeText(bytes, 'text/plain') })
  return { ...receipt, text }
}

function grant(store, owner, reader, asset) {
  const invite = store.invitations.create(owner, owner.userId, { scope: 'object', id: asset.id, permission: 'read' }, randomUUID())
  store.invitations.redeem(reader, reader.userId, invite.token)
  return invite.id
}

function save(store, actor, asset, term, serial) {
  const id = `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`
  const start = asset.text.indexOf(term), end = start + term.length
  assert.notEqual(start, -1)
  const { source } = store.terms.selection(actor, { asset_id: asset.id, version_id: asset.version_id,
    ordinal: 1, start, end, source_hash: asset.sha256 })
  const context = `语境 ${term}`
  const explanation = { context, plain: term, professional: term, confusions: [], uncertainty: '' }
  store.terms.save(actor, { explanation_id: id, term, source, explanation, provider: 'fixture', model: 'fixture' }, '')
  return { id, term, context, asset: asset.id, version: asset.version_id }
}

async function supportAt(dir, commit) {
  const file = join(dir, `${randomUUID()}.mjs`)
  writeFileSync(file, execFileSync('git', ['cat-file', 'blob', `${commit}:packages/knowledgeos-panel/lib/test-support.js`], { cwd: root }))
  return import(pathToFileURL(file).href)
}

async function legacyFixture(dir) {
  const old = await supportAt(dir, v42)
  const { actor: owner } = await seed(old, dir)
  const store = new old.ProbeStorage({ dataDir: dir }), identity = new old.IdentityService(store)
  try {
    const account = { loginName: 'ui001reader', password: `Fixture!${randomUUID()}` }
    await identity.register({ ...account, displayName: '合成读者' })
    const reader = identity.actor((await identity.login({ ...account, source: 'local-fixture' })).token)
    assert.ok(reader)
    const first = publish(store, owner, '旧版术语')
    grant(store, owner, reader, first)
    return { owner, reader, first, legacy: save(store, reader, first, '旧版术语', 1) }
  } finally { await identity.close(); store.close() }
}

function checkRows(rows, expected) {
  const actual = rows.map(({ href, ...card }) => {
    assert.deepEqual(Object.keys(card).sort(), ['context', 'id', 'term'])
    const url = new URL(href, 'https://ui001.invalid')
    assert.equal(url.origin + url.pathname, 'https://ui001.invalid/knowledgeos/reader')
    assert.equal(url.searchParams.get('term'), card.id, 'reader link must select the listed card')
    return { ...card, asset: url.searchParams.get('asset'), version: url.searchParams.get('version') }
  })
  const byId = (a, b) => a.id.localeCompare(b.id)
  assert.deepEqual(actual.sort(byId), [...expected].sort(byId))
}

test('personal term collection across source versions, page boundaries and access changes', async t => {
  const temp = mkdtempDisposableSync(join(tmpdir(), 'kos-ui001-terms-'))
  let store
  t.after(() => { store?.close(); temp.remove() })
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  const { owner, reader, first, legacy } = await legacyFixture(temp.path)
  const product = process.env.UI001_CANDIDATE ? await supportAt(temp.path, process.env.UI001_CANDIDATE) : lib
  function openProduct() {
    const current = new product.ProbeStorage({ dataDir: temp.path })
    assert.ok(current.available, current.failure?.message)
    return current
  }
  store = openProduct()
  const words = Array.from({ length: 40 }, (_, i) => `词${String(i + 1).padStart(2, '0')}`)
  const latest = publish(store, owner, [...words, '已归档', '他人卡'].join(' '), first)
  const restricted = publish(store, owner, '撤权卡')
  const invitation = grant(store, owner, reader, restricted)
  const withdrawn = save(store, reader, restricted, '撤权卡', 37)
  const archived = save(store, reader, latest, '已归档', 39)
  const peer = save(store, owner, latest, '他人卡', 41)
  assert.equal(typeof store.terms.collection, 'function', 'missing public storage.terms.collection(actor, after?)')
  checkRows(store.terms.collection(reader).terms, [legacy, withdrawn, archived])
  store.terms.update(reader, archived.id, { expected_revision: 0, favorite: false })
  const invite = store.invitations.get(owner, owner.userId, invitation)
  store.invitations.change(owner, owner.userId, invite.id, invite.revision, 'revoke')

  // All saves tie. Interleave the hidden odd IDs with visible even IDs and vary insertion order.
  const visible = words.map((word, i) => save(store, reader, latest, word, 2 * (1 + (i + 20) % 40)))
  assert.equal(query(temp.path, db => db.prepare('SELECT count(DISTINCT created_at) AS n FROM saved_terms').get().n), 1)
  function readPages() {
    const firstPage = store.terms.collection(reader)
    assert.equal(firstPage.terms.length, 40)
    assert.equal(firstPage.next, firstPage.terms.at(-1).id)
    const tail = store.terms.collection(reader, firstPage.next)
    assert.equal(tail.terms.length, 1)
    assert.equal(tail.next, null)
    checkRows([...firstPage.terms, ...tail.terms], [legacy, ...visible])
    const from39 = store.terms.collection(reader, firstPage.terms[38].id)
    assert.deepEqual(from39, { terms: [firstPage.terms[39], ...tail.terms], next: null })
    return [firstPage, tail]
  }
  const pages = readPages()
  store.close()
  store = openProduct()
  assert.deepEqual(readPages(), pages, 'tied pages and cursors must survive reopening SQLite')
  const other = store.terms.collection(owner)
  checkRows(other.terms, [peer])
  assert.equal(other.next, null)
  const lastId = pages[1].terms[0].id
  store.terms.update(reader, lastId, { expected_revision: 0, favorite: false })
  assert.deepEqual(store.terms.collection(reader, pages[0].next), { terms: [], next: null })
  const exact = store.terms.collection(reader)
  checkRows(exact.terms, [legacy, ...visible].filter(card => card.id !== lastId))
  assert.equal(exact.next, null, 'exactly 40 visible rows exhaust the collection')
})
