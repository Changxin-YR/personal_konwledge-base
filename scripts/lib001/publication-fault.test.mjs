// Run with node --test after building the panel and preparing the pinned DSH Host.
// LIB001_REVIEW_ROOT optionally selects another integrated checkout without writing to it.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(process.env.LIB001_REVIEW_ROOT || fileURLToPath(new URL('../..', import.meta.url)))
const harness = await import(pathToFileURL(join(root, 'scripts/fnd003/harness.mjs')).href)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
let dir, data, originals, host, origin, cookie, db

function pdf() {
  let text = `%PDF-1.7\n% synthetic ${randomUUID()}\n`
  const offsets = []
  for (const [i, dict] of ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 20 20] /Resources << >> >>'].entries()) {
    offsets.push(text.length)
    text += `${i + 1} 0 obj\n${dict}\nendobj\n`
  }
  const offset = text.length
  text += 'xref\n0 4\n0000000000 65535 f \n' + offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')
  return Buffer.from(text + `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`, 'ascii')
}

async function http(path, body, headers = {}) {
  return fetch(origin + '/knowledge/v1' + path, { method: body ? 'POST' : 'GET', body,
    headers: { origin, cookie: cookie ?? '', 'x-knowledgeos-request': '1', ...headers },
    redirect: 'error', signal: AbortSignal.timeout(15000) })
}

before(async t => {
  dir = await mkdtemp(join(tmpdir(), 'lib001-publication-'))
  data = join(dir, 'data'); originals = join(data, 'originals')
  const home = join(dir, 'home'), profile = 'knowledgeos-identity-test', p = join(home, 'profiles', profile)
  const pkg = join(root, 'packages/knowledgeos-panel')
  await mkdir(join(p, 'node_modules'), { recursive: true }); await mkdir(data)
  await symlink(pkg, join(p, 'node_modules/knowledgeos-panel'), process.platform === 'win32' ? 'junction' : 'dir')
  await writeFile(join(p, 'package.json'), JSON.stringify({ name: 'lib001-publication-test', private: true,
    dependencies: { 'knowledgeos-panel': 'link:' + pkg.replaceAll('\\', '/') },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'knowledgeos-panel'] } } }))
  await writeFile(join(p, 'cordis.yml'), '[]')
  await writeFile(join(p, 'cordis.patch.yml'), JSON.stringify([{ id: 'knowledgeos-host', config: { dataDir: data } }]))
  const socket = createServer().listen(0, '127.0.0.1'); await once(socket, 'listening')
  const { port } = socket.address(); await new Promise(resolve => socket.close(resolve))
  t.diagnostic('Host bundle SHA-256: ' + sha(await readFile(join(pkg, 'lib/index.js'))))
  host = await harness.startHost({ home, profile, port, env: { TSX_DISABLE_CACHE: '1' } })
  const entry = new URL(host.entryUrl)
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(entry.hostname)); assert.equal(Number(entry.port), port)
  origin = entry.origin
  cookie = (await harness.entryCookie(host.entryUrl)).cookie
  const credentials = { login_name: 'publication_test', password: 'Synthetic password 2026!' }
  const json = { 'content-type': 'application/json' }
  const setup = await http('/auth/bootstrap', JSON.stringify({ ...credentials, display_name: 'Synthetic' }), json)
  assert.equal(setup.status, 201, await setup.text())
  cookie = ''
  const login = await http('/auth/login', JSON.stringify(credentials), json)
  assert.equal(login.status, 200); cookie = harness.cookieFromResponse(login); assert.ok(cookie)
  await login.arrayBuffer()
  db = new DatabaseSync(join(data, 'knowledgeos.sqlite'), { readOnly: false })
})

after(async () => {
  db?.close()
  await harness.stopHost(host)
  if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 })
})

const upload = (key, bytes) => http('/imports', bytes, { 'content-type': 'application/pdf',
  'idempotency-key': key, 'x-knowledgeos-filename': 'synthetic.pdf' })
const get = r => http(`/assets/${r.id}/versions/${r.version_id}/original`)
const files = async () => (await readdir(originals)).sort()
const counts = () => db.prepare(`SELECT (SELECT count(*) FROM blobs) blobs,
  (SELECT count(*) FROM assets) assets, (SELECT count(*) FROM asset_versions) versions`).get()

async function seed() {
  const key = randomUUID(), bytes = pdf(), response = await upload(key, bytes)
  assert.equal(response.status, 201)
  const { data: receipt } = await response.json(); assert.equal(receipt.sha256, sha(bytes))
  const original = await get(receipt); assert.equal(original.status, 200)
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes)
  return { key, bytes, receipt }
}

async function withWriter(op) {
  db.exec('BEGIN IMMEDIATE')
  try { return await op() } finally { db.exec('ROLLBACK') }
}

test('a publication that cannot begin leaves neither a DB reference nor an orphan', async () => {
  const { receipt } = await seed(), before = await files(), committed = counts()
  const failed = await withWriter(() => upload(randomUUID(), pdf()))
  assert.ok(failed.status >= 500, `expected a storage failure, got ${failed.status}`)
  await failed.arrayBuffer()
  assert.deepEqual(counts(), committed)
  assert.deepEqual(await files(), before, 'unreferenced file after a known non-commit')
  const original = await get(receipt); assert.equal(sha(Buffer.from(await original.arrayBuffer())), receipt.sha256)
})

test('successful replay implies the same version still serves the exact original bytes', async () => {
  const { key, bytes, receipt } = await seed(), committed = counts()
  const { storage_key: name } = db.prepare(`SELECT b.storage_key FROM asset_versions v
    JOIN blobs b ON b.id=v.blob_id WHERE v.id=?`).get(receipt.version_id)
  assert.match(name, /^[0-9a-f-]+\.pdf$/)
  await unlink(join(originals, name))
  const missing = await get(receipt); assert.ok(!missing.ok); await missing.arrayBuffer()
  const replay = await upload(key, bytes)
  if (replay.ok) {
    const { data: replayed } = await replay.json()
    assert.equal(replayed.id, receipt.id); assert.equal(replayed.version_id, receipt.version_id)
    const original = await get(receipt)
    assert.equal(original.status, 200, 'replay reported success for an unavailable original')
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes)
  } else {
    assert.ok(replay.status >= 500, `expected a storage failure, got ${replay.status}`)
    await replay.arrayBuffer()
  }
  assert.equal(counts().versions, committed.versions)
  assert.equal(counts().assets, committed.assets)
})

test('an unrelated SQLite writer does not block list or original reads', async () => {
  const { receipt, bytes } = await seed()
  await withWriter(async () => {
    const list = await http('/assets'), original = await get(receipt)
    assert.deepEqual([list.status, original.status], [200, 200], 'list/original status under a held writer lock')
    assert.ok((await list.json()).data.items.some(v => v.version_id === receipt.version_id))
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes)
  })
})
