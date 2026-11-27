import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import dgram from 'node:dgram'
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import { join } from 'node:path'
import { budgetDirectory, reserve } from './budget.mjs'
import { checkPacket, checkPrice, completion, digest, fixtureKey, liveAlias, passPermit, route, sha } from './guard.mjs'

const { KO_EX_DIR: dir, KO_EX_MODE: mode, KO_EX_MANIFEST_SHA256: manifestHash, KO_EX_HOST: hostOrigin } = process.env
assert(['dry', 'live'].includes(mode))
assert.match(manifestHash, digest)
assert.match(hostOrigin, /^http:\/\/127\.0\.0\.1:[1-9][0-9]+$/)
const host = new URL(hostOrigin)
const completionURL = new URL(completion)
const path = name => join(dir, name)
const manifestBytes = readFileSync(path('manifest.json'))
assert.equal(sha(manifestBytes), manifestHash)
const manifest = JSON.parse(manifestBytes.toString('utf8'))
const live = mode === 'live'
async function readLiveCredential() {
  const parts = []
  let size = 0
  for await (const part of process.stdin) {
    size += part.length
    assert(size <= 4096, 'invalid credential pipe')
    parts.push(part)
  }
  const value = Buffer.concat(parts).toString('ascii')
  assert(/^[!-~]{1,4096}$/.test(value), 'isolated credential unavailable')
  process.env[liveAlias] = value // DSH resolves only this native alias in its isolated environment.
  return value
}
const credential = live ? await readLiveCredential() : fixtureKey
assert(credential?.trim())
const baseFetch = globalThis.fetch
const safe = (name, row) => appendFileSync(path(name), JSON.stringify(row) + '\n')
let used = false, canConnect = false, hasConnected = false

function denied(scope, destination) {
  safe('network-denials.jsonl', { scope, destination, result: 'DENIED_BEFORE_DISPATCH' })
  throw Error('EXPLAIN002_TOKEASE_EGRESS_DENIED')
}
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const supplied = Array.isArray(args[0]) ? args[0] : args
  const options = typeof supplied[0] === 'number' ? { port: supplied[0], host: supplied[1] } : supplied[0]
  if (options && typeof options === 'object' && !options.path) {
    if (options.host === host.hostname && Number(options.port) === Number(host.port)) return connect.apply(this, args)
    if (live && canConnect && !hasConnected && options.host === completionURL.hostname && Number(options.port) === 443) {
      hasConnected = true
      safe('transport-socket.jsonl', { result: 'AUTHORIZED_TOKEASE_TLS_CONNECT' })
      return connect.apply(this, args)
    }
  }
  const target = typeof options === 'string' ? options : options?.path
  const ipc = typeof target === 'string' && (target.startsWith('\\\\.\\pipe\\') || target.startsWith('\\\\?\\pipe\\'))
  const destination = ipc ? 'windows_local_pipe' : options?.host === '127.0.0.1' ? 'unapproved_loopback' : 'non_loopback'
  return denied('tcp', destination)
}
dgram.createSocket = () => denied('udp', 'all_datagram_sockets')
syncBuiltinESMExports()

function fixtureResponse() {
  const dryReply = JSON.parse(readFileSync(path('dry-reply.json')))
  const common = { id: 'explain002-dry', created: 1, object: 'chat.completion.chunk', model: route.model }
  const choice = (delta, finish_reason) => ({ ...common, choices: [{ index: 0, delta, finish_reason }] })
  const frames = [
    choice({ role: 'assistant', content: JSON.stringify(dryReply) }, null),
    choice({}, 'stop'),
    { ...common, choices: [], usage: { prompt_tokens: 35, completion_tokens: 23, total_tokens: 58 } },
  ]
  return new Response(frames.map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('') + 'data: [DONE]\n\n', {
    status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  })
}

async function observe(response) {
  const decoder = new TextDecoder()
  const responseDigest = createHash('sha256')
  const finishCodes = new Set(['stop', 'length', 'tool_calls', 'content_filter', 'aborted', 'insufficient_system_resource'])
  const evidence = { http_status: response.status, bytes: 0, content_chars: 0, reasoning_chars: 0 }
  const usage = {}, keys = { prompt_tokens: 'input_tokens', completion_tokens: 'output_tokens', total_tokens: 'total_tokens' }
  let pending = ''
  try {
    if (response.body) for await (const chunk of response.body) {
      evidence.bytes += chunk.byteLength
      responseDigest.update(chunk)
      if (evidence.bytes > 400_000) { evidence.observation_limited = true; break }
      pending += decoder.decode(chunk, { stream: true })
      const lines = pending.split('\n')
      pending = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data:') || line.includes('[DONE]')) continue
        let item
        try { item = JSON.parse(line.slice(5).trim()) } catch { continue }
        for (const choice of item.choices ?? []) {
          if (typeof choice.delta?.content === 'string') evidence.content_chars += choice.delta.content.length
          if (typeof choice.delta?.reasoning_content === 'string') evidence.reasoning_chars += choice.delta.reasoning_content.length
          if (choice.finish_reason) evidence.finish = finishCodes.has(choice.finish_reason) ? choice.finish_reason : 'other'
        }
        for (const [source, target] of Object.entries(keys)) {
          const n = item.usage?.[source]
          if (Number.isSafeInteger(n) && n >= 0) usage[target] = n
        }
      }
    }
  } catch { evidence.observation_interrupted = true }
  finally {
    if (!evidence.observation_limited && !evidence.observation_interrupted) evidence.response_sha256 = responseDigest.digest('hex')
    safe('response-usage.jsonl', { ...evidence, ...usage })
  }
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : input)
  const method = init.method ?? (input instanceof Request ? input.method : 'GET')
  if (url.origin === host.origin && !url.username && !url.password && !url.hash)
    return baseFetch(input, { ...init, redirect: 'error' })
  let evidence
  try {
    assert(!used && url.href === completion && method === 'POST')
    assert(existsSync(path('native-armed')) && !existsSync(path('consumed.json')))
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined))
    assert(headers.get('authorization') === 'Bearer ' + credential)
    assert(/^application\/json(?:;|$)/i.test(headers.get('content-type') ?? ''))
    if (live) {
      const approval = readFileSync(path('approved.json'))
      assert.equal(sha(approval), manifest.approval_sha256)
      checkPrice(JSON.parse(approval))
    }
    const permit = JSON.parse(readFileSync(path('permit.json'), 'utf8'))
    passPermit(permit, manifest, manifestHash)
    evidence = checkPacket(init.body, manifest, live)
    if (live) reserve(budgetDirectory(), process.env.KO_EX_ROLE, manifest)
    renameSync(path('permit.json'), path('consumed.json'))
    used = true
  } catch { return denied('fetch', url.href === completion ? 'unapproved_tokease_packet' : 'unapproved_destination') }

  safe(live ? 'live-dispatch.jsonl' : 'dry-wire.jsonl', evidence)
  if (!live) return fixtureResponse()

  canConnect = true
  try {
    const response = await baseFetch(completion, { method: 'POST', body: init.body, signal: init.signal,
      headers: { authorization: 'Bearer ' + credential, 'content-type': 'application/json', accept: 'text/event-stream' }, redirect: 'error' })
    void observe(response.clone())
    return response
  } catch (error) {
    safe('transport-error.jsonl', { result: 'TOKEASE_TRANSPORT_FAILED' })
    throw error
  } finally { canConnect = false }
}
