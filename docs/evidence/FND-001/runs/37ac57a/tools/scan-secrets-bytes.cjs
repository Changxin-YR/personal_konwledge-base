const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const findings = [];
let scanned = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'tools') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (e.name.endsWith('.png')) continue;
    scanned++;
    const buf = fs.readFileSync(p);
    const ascii = buf.toString('latin1');
    const utf16 = buf.toString('utf16le');
    const tests = [
      ['ascii-token', /token=(?!<redacted>)[^\s&"'<>]+/.test(ascii)],
      ['utf16-token', /token=(?!<redacted>)[^\s&"'<>]+/.test(utf16)],
      ['ascii-cookie', /dsh-auth-(?!<redacted>)[A-Za-z0-9_-]{8,}/.test(ascii)],
      ['utf16-cookie', /dsh-auth-(?!<redacted>)[A-Za-z0-9_-]{8,}/.test(utf16)],
    ];
    const hits = tests.filter(([, hit]) => hit).map(([id]) => id);
    if (hits.length > 0) findings.push({ file: path.relative(root, p), hits });
  }
}
walk(root);
const result = { result: findings.length === 0 ? 'PASS' : 'FAIL', scanned_files: scanned, findings };
fs.writeFileSync(path.join(root, 'redaction-verify.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(result, null, 2));
process.exit(findings.length === 0 ? 0 : 1);
