const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const bad = [];
let n = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'tools') walk(p); }
    else if (e.name.endsWith('.json')) {
      n++;
      try { JSON.parse(fs.readFileSync(p, 'utf8')); } catch (err) { bad.push({ file: path.relative(root, p), error: String(err) }); }
    }
  }
}
walk(root);
console.log(JSON.stringify({ json_files: n, invalid: bad, result: bad.length === 0 ? 'PASS' : 'FAIL' }, null, 2));
const summary = JSON.parse(fs.readFileSync(path.join(root, 'browser-rerun', 'summary.json'), 'utf8'));
console.log('browser-rerun result=' + summary.result + ' steps=' + summary.steps.length + ' cookie_names=' + JSON.stringify(summary.cookie_names));
const failed = JSON.parse(fs.readFileSync(path.join(root, 'browser', 'summary.json'), 'utf8'));
console.log('browser-v1 result=' + failed.result + ' failures=' + failed.failures.length);
