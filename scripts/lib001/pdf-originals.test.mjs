import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PdfOriginals, PdfInputError, PdfStorageError } from '../../packages/knowledgeos-panel/src/host/pdf-originals.ts'

const limit = 64 * 1024 * 1024
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/

function pdf(stream = false) {
  let s = '%PDF-1.7\n'
  const catalog = s.length
  s += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const pages = s.length
  s += '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n'
  const offset = s.length
  if (stream) {
    const entries = Buffer.alloc(28)
    entries.writeUInt16BE(65535, 5)
    for (const [i, pos] of [catalog, pages, offset].entries()) {
      entries[(i + 1) * 7] = 1
      entries.writeUInt32BE(pos, (i + 1) * 7 + 1)
    }
    s += '3 0 obj\n<< /Type/XRef /Size 4 /Root 1 0 R /W [1 4 2] /Length 28 >>\nstream\n'
    s += entries.toString('latin1') + '\nendstream\nendobj\n'
  } else {
    s += 'xref\n0 3\n0000000000 65535 f \n'
    for (const pos of [catalog, pages]) s += `${String(pos).padStart(10, '0')} 00000 n \n`
    s += 'trailer\n<< /Size 3 /Root 1 0 R >>\n'
  }
  return Buffer.from(s + `startxref\n${offset}\n%%EOF\n`, 'latin1')
}

async function fixture(t) {
  const parent = await fs.mkdtemp(join(tmpdir(), 'lib001-'))
  t.after(() => fs.rm(parent, { recursive: true, force: true }))
  const root = join(parent, 'originals')
  return { parent, root, store: new PdfOriginals(root) }
}
const read = (store, item) => store.read(item.key, item.sha256, item.byteLength)

test('both xref forms, independent keys and input snapshot under concurrent puts', async t => {
  const { store, root } = await fixture(t), original = pdf(true)
  const input = Uint8Array.from(original), pending = store.put(input)
  input.fill(0)
  const items = await Promise.all([pending, ...Array.from({ length: 7 }, () => new PdfOriginals(root).put(original))])
  assert.equal(new Set(items.map(i => i.key)).size, items.length)
  for (const item of items) {
    assert.match(item.key, keyPattern)
    assert.equal(item.sha256, digest(original))
    assert.equal(item.byteLength, original.length)
    assert.deepEqual(await read(store, item), original)
  }
  assert.deepEqual(await read(store, await store.put(pdf())), pdf())
  assert.equal((await fs.readdir(root)).length, items.length + 1)
})

test('malformed envelopes never publish', async t => {
  const { root, store } = await fixture(t)
  const c = pdf().toString('latin1'), s = pdf(true).toString('latin1')
  for (const text of ['', 'junk' + c, c.replace('1.7', 'xxx'), c.slice(0, -5), c + 'junk',
    c.replace(/startxref\n\d+/, 'startxref\n0'), c.replace(/startxref\n\d+/, 'startxref\n99999999999999999999'),
    c.replace(/startxref\n\d+/, 'startxref\n9'), c.replace('xref\n0 3', 'xrefjunk'),
    s.replace('/Type/XRef', '/Type/ObjS'), s.replace('>>\nstream', '>>\nbroken'), c + 'startxref\n1\n%%EOF\n',
    s.replace(/startxref\n\d+/, 'startxref\n9'), s.replace('/Type/XRef', '/Note (/Type/XRef)'),
    s.replace('/Type/XRef', '/Meta << /Type/XRef >>'), s.replace('/Type/XRef', '% /Type/XRef\n')]) {
    await assert.rejects(store.put(Buffer.from(text, 'latin1')), PdfInputError)
  }
  await assert.rejects(store.put(new Uint8Array(limit + 1)), PdfInputError)
  assert.deepEqual(await fs.readdir(root).catch(e => e.code === 'ENOENT' ? [] : Promise.reject(e)), [])
})

test('exact 64 MiB limit is inclusive', async t => {
  const { store } = await fixture(t), small = pdf(), at = small.indexOf('startxref')
  const bytes = Buffer.concat([small.subarray(0, at), Buffer.from('%'),
    Buffer.alloc(limit - small.length - 2, 32), Buffer.from('\n'), small.subarray(at)])
  assert.equal(bytes.length, limit)
  assert.equal(digest(await read(store, await store.put(bytes))), digest(bytes))
})

test('reads bind exact key, size and hash after restart and tampering', async t => {
  const { store, root } = await fixture(t), bytes = pdf(), item = await store.put(bytes)
  const restarted = new PdfOriginals(root)
  await restarted.discard(item.key)
  assert.deepEqual(await read(restarted, item), bytes)
  for (const key of [`../${item.key}`, item.key + ':ads', item.key.toUpperCase(), item.key + '\n', `${randomUUID()}.pdf`]) {
    await assert.rejects(read(restarted, { ...item, key }))
  }
  for (const byteLength of [0, -1, 1.5, limit + 1, NaN, bytes.length + 1]) {
    await assert.rejects(read(restarted, { ...item, byteLength }))
  }
  await assert.rejects(read(restarted, { ...item, sha256: '0'.repeat(64) }))
  const path = join(root, item.key)
  await fs.writeFile(path, Buffer.alloc(bytes.length, 32))
  await assert.rejects(read(store, item))
  await fs.truncate(path, 8)
  await assert.rejects(read(restarted, item))
})

test('rollback acts only on files from its own attempt and tolerates double discard', async t => {
  const { root, store } = await fixture(t), other = new PdfOriginals(root)
  const a = await store.put(pdf()), b = await other.put(pdf())
  await Promise.all([store.discard(a.key), store.discard(a.key), store.discard(b.key), store.discard('../outside')])
  assert.deepEqual(await fs.readdir(root), [b.key])
  assert.deepEqual(await read(other, b), pdf())
})

test('retain is synchronous, idempotent, instance-local and prevents subsequent discard', async t => {
  const { root, store } = await fixture(t), other = new PdfOriginals(root)
  const committed = await store.put(pdf()), pending = await other.put(pdf(true))
  assert.equal(store.retain(committed.key), undefined)
  store.retain(committed.key)
  store.retain(pending.key)
  await store.discard(committed.key)
  await other.discard(pending.key)
  assert.deepEqual(await fs.readdir(root), [committed.key])
  assert.deepEqual(await read(store, committed), pdf())
})

test('retain revokes a discard that has not issued its unlink', async t => {
  const { store } = await fixture(t), item = await store.put(pdf())
  const discarding = store.discard(item.key)
  store.retain(item.key)
  await discarding
  await store.discard(item.key)
  assert.deepEqual(await read(store, item), pdf())
})

test('public errors distinguish bad input from storage faults without exposing paths or causes', async t => {
  const { root, store } = await fixture(t)
  function matches(Type, code, message) {
    return e => {
      assert.ok(e instanceof Type)
      assert.equal(e.code, code)
      assert.equal(e.message, message)
      assert.equal(e.stack, `${Type.name}: ${message}`)
      for (const field of ['path', 'dest', 'syscall', 'cause']) assert.equal(field in e, false)
      return true
    }
  }
  const invalid = matches(PdfInputError, 'PDF_INVALID_INPUT', 'Invalid PDF envelope')
  const storage = matches(PdfStorageError, 'PDF_ORIGINAL_UNAVAILABLE', 'PDF original unavailable')
  await assert.rejects(store.put(Buffer.from(root)), invalid)
  const item = await store.put(pdf()), bad = Buffer.alloc(item.byteLength)
  await fs.writeFile(join(root, item.key), bad)
  // Even with matching metadata, an invalid envelope on disk is not an HTTP 422.
  await assert.rejects(read(store, { ...item, sha256: digest(bad) }), storage)
  await assert.rejects(read(store, { ...item, key: `${randomUUID()}.pdf` }), storage)
  const deny = () => { throw Object.assign(new Error(`EACCES: ${root}`), { code: 'EACCES', path: root }) }
  const unlink = t.mock.method(fs, 'unlink', deny)
  await assert.rejects(store.discard(item.key), storage)
  unlink.mock.restore()
  await store.discard(item.key)
  t.mock.method(fs, 'open', deny)
  await assert.rejects(store.put(pdf()), storage)
})

test('unusable disk path fails; restarting never sweeps partial files', async t => {
  const { root, store } = await fixture(t)
  await fs.writeFile(root, 'occupied')
  await assert.rejects(store.put(pdf()))
  assert.equal(await fs.readFile(root, 'utf8'), 'occupied')
  await fs.unlink(root)
  await fs.mkdir(root)
  const partial = `.${randomUUID()}.pending`
  await fs.writeFile(join(root, partial), '%PDF-')
  const restarted = new PdfOriginals(root), item = await restarted.put(pdf())
  await assert.rejects(restarted.read(partial, digest(Buffer.from('%PDF-')), 5))
  await restarted.discard(partial)
  assert.deepEqual(await read(restarted, item), pdf())
  assert.equal(await fs.readFile(join(root, partial), 'utf8'), '%PDF-')
})

for (const fault of ['disk full after partial write', 'short write', 'file sync', 'post-publication sync']) {
  test(`put cleans up its own files on ${fault}`, async t => {
    const { store, root } = await fixture(t), open = fs.open
    const existing = await store.put(pdf())
    t.mock.method(fs, 'open', async (...args) => {
      const h = await open(...args)
      if (args[0].endsWith('.pending')) {
        if (fault.includes('write')) t.mock.method(h, 'writeFile', async data => {
          await h.write(data.subarray(0, 9))
          if (fault.startsWith('disk full')) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
        })
        else {
          const sync = h.sync.bind(h)
          let calls = 0
          t.mock.method(h, 'sync', async () => {
            if (++calls === (fault === 'file sync' ? 1 : 2)) throw new Error(fault)
            await sync()
          })
        }
      }
      return h
    })
    await assert.rejects(store.put(pdf(true)), PdfStorageError)
    assert.deepEqual(await fs.readdir(root), [existing.key])
    assert.deepEqual(await read(store, existing), pdf())
  })
}

test('a collision at final publication never overwrites or unlinks the previous occupant', async t => {
  const { store, root } = await fixture(t), link = fs.link
  let occupant
  t.mock.method(fs, 'link', async (stage, final) => {
    occupant = final
    await fs.writeFile(final, 'existing occupant', { flag: 'wx' })
    return link(stage, final)
  })
  await assert.rejects(store.put(pdf()), PdfStorageError)
  assert.equal(await fs.readFile(occupant, 'utf8'), 'existing occupant')
  assert.equal((await fs.readdir(root)).length, 1)
})

test('junction or linked ancestor fails closed for put, read and rollback', async t => {
  const { parent, root, store } = await fixture(t), item = await store.put(pdf())
  const actual = join(parent, 'actual')
  await fs.rename(root, actual)
  await fs.symlink(actual, root, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(store.put(pdf()))
  await assert.rejects(read(store, item))
  await assert.rejects(store.discard(item.key))
  await assert.rejects(new PdfOriginals(join(root, 'child')).put(pdf()))
  assert.deepEqual(await fs.readdir(actual), [item.key])
  assert.deepEqual(await fs.readFile(join(actual, item.key)), pdf())
})

test('a replaced leaf cannot be read through a hard link or discarded as owned', async t => {
  const { parent, root, store } = await fixture(t), item = await store.put(pdf()), path = join(root, item.key)
  await fs.rename(path, join(parent, 'saved'))
  const foreign = join(parent, 'foreign')
  await fs.writeFile(foreign, pdf())
  await fs.link(foreign, path)
  await assert.rejects(read(store, item))
  await assert.rejects(store.discard(item.key))
  assert.deepEqual(await fs.readFile(path), pdf())
})

test('process exit mid-write leaves only a private stage; restart preserves acknowledged data', async t => {
  const { store, root } = await fixture(t), existing = await store.put(pdf())
  const module = new URL('../../packages/knowledgeos-panel/src/host/pdf-originals.ts', import.meta.url).href
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs/promises'
    import { PdfOriginals } from ${JSON.stringify(module)}
    const open = fs.open
    fs.open = async (...args) => {
      const h = await open(...args)
      if (args[0].endsWith('.pending')) h.writeFile = async data => {
        await h.write(data.subarray(0, 9)); await h.sync(); process.exit(74)
      }
      return h
    }
    await new PdfOriginals(process.argv[1]).put(Buffer.from(process.argv[2], 'base64'))
  `, root, pdf(true).toString('base64')], { encoding: 'utf8', timeout: 10000, windowsHide: true })
  assert.equal(child.status, 74, child.stderr)
  const names = await fs.readdir(root), restarted = new PdfOriginals(root)
  assert.equal(names.length, 2)
  const stage = names.find(n => n !== existing.key)
  assert.match(stage, /^\..+\.pending$/)
  assert.equal((await fs.stat(join(root, stage))).size, 9)
  await assert.rejects(restarted.read(stage, digest(pdf().subarray(0, 9)), 9))
  assert.deepEqual(await read(restarted, existing), pdf())
  assert.deepEqual(await read(restarted, await restarted.put(pdf(true))), pdf(true))
})
