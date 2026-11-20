// A Cordis probe installed ONLY in the fresh a07-isolated harness profile.
// No RPC, provider credentials, fabricated lifecycle events or product hooks.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export const inject = ['sessions', 'officeKit']
const probe = 'lib004-session-probe'
const within = (parent, child) => { const p = relative(parent, child); return p && !p.startsWith('..') && !p.includes(':') }
function isolatedRoot(data, child = false) {
  const dir = dirname(realpathSync(data)); const temp = realpathSync(tmpdir())
  if (child) { assert.equal(dirname(temp), dir); assert.match(basename(temp), /^env-(TEMP|TMP)$/) }
  else assert.equal(dirname(dir), temp)
  assert.match(basename(dir), /^kos-a07-[\w-]+$/); return dir
}
export function installProbe(data, bytes) {
  const dir = isolatedRoot(data), profile = realpathSync(join(dir, 'home/profiles/a07-isolated'))
  assert(within(dir, profile)); const pkg = join(profile, 'node_modules', probe), io = join(dir, probe)
  mkdirSync(pkg); mkdirSync(io); mkdirSync(join(io, 's1')); mkdirSync(join(io, 's2'))
  const source = join(io, 's1/a08-v1.docx'); writeFileSync(source, bytes, { flag: 'wx' })
  copyFileSync(fileURLToPath(import.meta.url), join(pkg, 'index.mjs'))
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: probe, type: 'module', main: 'index.mjs' }))
  const cfg = join(profile, 'cordis.patch.yml'), layers = JSON.parse(readFileSync(cfg)); assert.equal(layers[0].id,'knowledgeos-host')
  writeFileSync(cfg, JSON.stringify([...layers, { insert: [{ id: probe, name: probe }] }]))
  return { io, source }
}
export async function observe(io, name, pid, timeout = 90000) {
  assert(['origin', 'disposed'].includes(name)); const path = join(io, name + '.json')
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(100)) {
    if (existsSync(join(io, 'error'))) throw new Error('DSH lifecycle probe failed')
    if (!existsSync(path)) continue
    const value = JSON.parse(readFileSync(path)); assert.equal(value.pid, pid); return value
  }
  throw new Error('DSH lifecycle evidence unavailable')
}

export function apply(ctx) {
  const home = realpathSync(process.env.DSH_HOME), dir = isolatedRoot(join(dirname(home), 'data'), true)
  assert.equal(home, join(dir, 'home')); const io = join(dir, probe)
  assert.equal(realpathSync(dirname(fileURLToPath(import.meta.url))), join(home, 'profiles', 'a07-isolated', 'node_modules', probe))
  if (existsSync(join(io, 'disposed.json'))) return // The restart is a distinct experiment.
  const controller = new AbortController(); ctx.effect(() => () => controller.abort())
  const publish = (name, record) => writeFileSync(join(io, name + '.json'), JSON.stringify({ ...record, pid: process.pid }), { flag: 'wx' })
  const mounted = cwd => {
    const session = ctx.sessions.prepare(randomUUID(), { meta: { cwd } }); const leave = ctx.effect(() => ctx.sessions.enter(session))
    ctx.sessions.announce(session); assert.equal(ctx.sessions.get(session.id), session); return { session, leave }
  }
  let disposed; ctx.on('session/disposed', s => { disposed = s.id })
  const run = async () => {
    const s1 = mounted(join(io, 's1')), input = join(s1.session.header.cwd, 'a08-v1.docx')
    const bytes = readFileSync(input), digest = sha(bytes)
    // This independent lifetime witness is never uploaded as a derived result.
    const temp = await ctx.officeKit.convertTo({ extension: 'docx', format: 'pdf', output: { owner: s1.session.id, name: 'lifetime.pdf' },
      source: { key: s1.session.id, version: digest, bytes: bytes.length, read: async () => ({ bytes: readFileSync(input), version: digest }) } }, controller.signal)
    assert(within(dir, realpathSync(temp.path))); const tempSha = sha(readFileSync(temp.path))
    publish('origin', { session: s1.session.id, input_sha256: digest, witness_sha256: tempSha })
    while (!existsSync(join(io, 'end-origin'))) await sleep(100, undefined, { signal: controller.signal })
    assert.equal(sha(readFileSync(temp.path)), tempSha); await s1.leave()
    assert.equal(disposed, s1.session.id); assert.equal(ctx.sessions.get(s1.session.id), undefined)
    for (const end = Date.now() + 15000; existsSync(temp.path) && Date.now() < end;) await sleep(50)
    assert(!existsSync(temp.path)); const s2 = mounted(join(io, 's2'))
    publish('disposed', { session: disposed, fresh_session: s2.session.id, live_lookup_absent: true, office_temp_absent: true })
  }
  void run().catch(() => { if (!controller.signal.aborted) writeFileSync(join(io, 'error'), 'lifecycle unavailable') })
}
