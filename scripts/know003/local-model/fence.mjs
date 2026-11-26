import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import { appendFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'

const host = new URL(process.env.KO_ONT_HOST)
const fixture = new URL(process.env.KO_ONT_COMPLETION)
const log = process.env.KO_ONT_DENIED
for (const url of [host, fixture]) {
  assert.equal(url.protocol, 'http:')
  assert.equal(url.hostname, '127.0.0.1')
  assert(url.port && !url.username && !url.password)
}
assert.equal(fixture.pathname, '/v1/chat/completions')
assert(log)

function denied(scope, destination) {
  appendFileSync(log, JSON.stringify({ scope, destination, result: 'DENIED_BEFORE_DISPATCH' }) + '\n')
  throw Error('KNOW003_LOCAL_EGRESS_DENIED')
}

const baseFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const source = input instanceof Request ? input.url : input
  const url = new URL(source)
  const method = init.method ?? (input instanceof Request ? input.method : 'GET')
  if (!url.username && !url.password && !url.hash && (
    url.origin === host.origin || url.href === fixture.href && method === 'POST'
  )) return baseFetch(input, { ...init, redirect: 'error' })
  return denied('fetch', url.hostname === '127.0.0.1' ? 'unapproved_loopback' : 'non_loopback')
}

const connect = net.Socket.prototype.connect
const ports = new Set([Number(host.port), Number(fixture.port)])
net.Socket.prototype.connect = function (...args) {
  const supplied = Array.isArray(args[0]) ? args[0] : args
  const options = typeof supplied[0] === 'number' ? { port: supplied[0], host: supplied[1] } : supplied[0]
  if (options && typeof options === 'object' && !options.path && options.host === '127.0.0.1' && ports.has(Number(options.port)))
    return connect.apply(this, args)
  const target = typeof options === 'string' ? options : options?.path
  const localIpc = typeof target === 'string' && (
    target.startsWith('\\\\.\\pipe\\') || target.startsWith('\\\\?\\pipe\\')
  )
  const destination = localIpc ? 'windows_local_pipe'
    : options?.host === '127.0.0.1' ? 'unapproved_loopback' : 'non_loopback'
  return denied('tcp', destination)
}
dgram.createSocket = () => denied('udp', 'all_datagram_sockets')
syncBuiltinESMExports()
