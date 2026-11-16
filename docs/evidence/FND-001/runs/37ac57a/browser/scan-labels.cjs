const fs = require('node:fs');
const html = fs.readFileSync('docs/evidence/FND-001/runs/37ac57a/browser/failure-page.html', 'utf8');
for (const needle of ['连接中断','连接异常','立即重连','正在重试','连接失败','重试']) {
  const n = html.split(needle).length - 1;
  console.log(needle, '=>', n);
}
// show context around 立即重连 if present
const i = html.indexOf('立即重连');
if (i >= 0) console.log(html.slice(Math.max(0, i - 600), i + 200));
