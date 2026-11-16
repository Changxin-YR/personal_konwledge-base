// Read the live route once for the R4 launch evidence. Usage: node R4-status-probe.mjs <entry-url>
const url = process.argv[2]
const base = new URL(url).origin
const entry = await fetch(url, { redirect: 'manual' })
const cookie = (entry.headers.getSetCookie?.() ?? []).map(value => value.split(';', 1)[0]).join('; ')
const status = await fetch(`${base}/knowledgeos/status`, {
  headers: cookie.length > 0 ? { accept: 'application/json', cookie } : { accept: 'application/json' },
  redirect: 'manual',
})
const text = await status.text()
console.log(JSON.stringify({
  entry_status: entry.status,
  cookie_received: cookie.length > 0,
  status_code: status.status,
  content_type: status.headers.get('content-type'),
  body_prefix: text.slice(0, 120),
}, null, 2))