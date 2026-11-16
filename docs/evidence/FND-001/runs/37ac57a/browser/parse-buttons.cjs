const fs = require('node:fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]);
const interesting = buttons.filter(b => /重试|重新连接|连接|刷新/.test(b));
console.log('total buttons:', buttons.length);
for (const b of interesting) {
  const testid = /data-testid="([^"]*)"/.exec(b)?.[1] ?? '';
  const text = b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const disabled = /disabled/.test(b);
  const hidden = /display:\s*none|visibility:\s*hidden|aria-hidden="true"/.test(b);
  console.log(JSON.stringify({ testid, text, disabled, hidden }));
}
console.log('--- data-testid occurrences ---');
for (const m of html.matchAll(/data-testid="([^"]+)"/g)) { /* list */ }
const ids = [...new Set([...html.matchAll(/data-testid="([^"]+)"/g)].map(m => m[1]))];
console.log(ids.join(', '));
