import { MAX_MODULE_FILES, MAX_MODULE_LINES, MAX_MODULE_QUESTION_LENGTH } from '../domain/module-explanation.ts'

export const moduleExplainHtml = `
<section id="module-panel" hidden aria-labelledby="module-heading">
  <h2 id="module-heading">模块与关键业务流程讲解</h2>
  <p class="badge" id="module-scope"></p>
  <ul id="module-sources" aria-label="模块讲解文件"></ul>
  <form id="module-form">
    <label>想了解这个模块的什么？<textarea id="module-question" rows="3" maxlength="${MAX_MODULE_QUESTION_LENGTH}" placeholder="例如：请求如何经过入口、服务和持久化层？异常时哪些边界会拒绝？" required></textarea></label>
    <p class="badge">只会使用当前固定提交中已保存的文件行段。没有代码证据的关系会列入证据边界。</p>
    <button id="module-submit" type="submit">讲解选定模块</button>
  </form>
  <p id="module-status" role="status"></p>
  <div id="module-answer" hidden>
    <p class="badge" id="module-source"></p>
    <h3>模块职责</h3><ul id="module-summary"></ul>
    <h3>文件间关系</h3><ul id="module-relations"></ul>
    <h3>关键流程</h3><div id="module-flows"></div>
    <h3>设计取舍</h3><ul id="module-tradeoffs"></ul>
    <h3>证据边界</h3><ul id="module-limits"></ul>
    <h3>可回读事实</h3><ol id="module-facts"></ol>
  </div>
</section>`

export const moduleExplainScript = String.raw`
const moduleErrors = {
  MODULE_SOURCES_INVALID:'请至少选择两个不同的源码文件。', MODULE_RANGE_INVALID:'请检查模块文件的起止行。',
  MODULE_RANGE_TOO_LARGE:'模块文件行段过长，请缩短后再试。', MODULE_TEXT_REQUIRED:'选定文件没有可分析的源码。',
  MODULE_FILE_TOO_LARGE:'选定行段过大，请缩短后再试。', MODULE_TOO_LARGE:'选定源码总量过大，请减少文件或行段。', CODE_SOURCE_CHANGED:'固定来源与当前文件不一致，请重新打开文件。',
  MODEL_NOT_CONFIGURED:'尚未配置可用的模型。', CREDENTIALS_MISSING:'模型凭据尚未配置。', MODEL_NOT_FOUND:'配置的模型不可用。',
  PROVIDER_PERMISSION_DENIED:'模型服务拒绝了请求。', CREDENTIALS_INVALID:'模型凭据无效。', QUOTA_EXHAUSTED:'模型额度已用完。',
  PROVIDER_RATE_LIMITED:'模型服务请求频繁，请稍后重试。', MODEL_TIMEOUT:'模型响应超时，请稍后重试。',
  REQUEST_LIMIT:'已有讲解正在进行，请稍后再试。', MODEL_OUTPUT_INVALID:'模型答复格式或引用未通过核对，请调整问题后重试。',
  MODEL_OUTPUT_TRUNCATED:'模型答复过长，请减少文件或行段。', MODEL_OUTPUT_EMPTY:'模型返回了空答复。',
  MODEL_OUTPUT_INCOMPLETE:'模型答复不完整。', CANCELLED:'讲解已取消。'
};
let moduleSelection = new Map();
function moduleLineCount(text) { return text.split(/\r\n|\r|\n/).length - (/[\r\n]$/.test(text) ? 1 : 0); }
function resetModuleAnswer() {
  $('module-answer').hidden = true;
  for (const id of ['module-status','module-source','module-summary','module-relations','module-flows','module-tradeoffs','module-limits','module-facts']) $(id).replaceChildren();
}
function resetModule() {
  moduleSelection = new Map(); resetModuleAnswer(); $('module-panel').hidden = true; $('module-form').reset(); $('module-submit').disabled = false;
}
function moduleCurrentFileButton(file) {
  const selectedForModule = moduleSelection.has(file.path);
  $('module-toggle').textContent = selectedForModule ? '移出模块讲解' : '加入模块讲解';
  $('module-toggle').setAttribute('aria-pressed', String(selectedForModule));
}
function renderModuleSelection() {
  const list = $('module-sources'); list.replaceChildren();
  const count = moduleSelection.size;
  $('module-panel').hidden = count === 0;
  $('module-scope').textContent = count < 2 ? '已选 ' + count + ' 个文件，还需至少选择 2 个文件。' : '已选 ' + count + ' 个文件，最多 ' + ${MAX_MODULE_FILES} + ' 个。每个文件最多 ' + ${MAX_MODULE_LINES} + ' 行。';
  for (const source of moduleSelection.values()) {
    const item = document.createElement('li');
    const path = document.createElement('code'); path.textContent = source.path; item.append(path);
    const fields = document.createElement('span'); fields.className = 'module-range';
    const startLabel = document.createElement('label'); startLabel.textContent = '起始行'; const start = document.createElement('input'); start.type = 'number'; start.min = '1'; start.value = String(source.start_line); start.setAttribute('aria-label', source.path + ' 起始行');
    const endLabel = document.createElement('label'); endLabel.textContent = '结束行'; const end = document.createElement('input'); end.type = 'number'; end.min = '1'; end.value = String(source.end_line); end.setAttribute('aria-label', source.path + ' 结束行');
    start.addEventListener('change', () => { source.start_line = start.valueAsNumber; resetModuleAnswer(); }); end.addEventListener('change', () => { source.end_line = end.valueAsNumber; resetModuleAnswer(); });
    startLabel.append(start); endLabel.append(end); fields.append(startLabel, endLabel);
    const remove = button(item, '移除', false, () => { moduleSelection.delete(source.path); renderModuleSelection(); if (openCode?.path === source.path) moduleCurrentFileButton({ path: source.path }); });
    item.append(fields, remove); list.append(item);
  }
  if (openCode) moduleCurrentFileButton(openCode);
}
function toggleModuleFile(file) {
  if (!file || !file.text || !file.text.trim()) return;
  if (moduleSelection.has(file.path)) moduleSelection.delete(file.path);
  else {
    if (moduleSelection.size >= ${MAX_MODULE_FILES}) { $('module-status').textContent = '已达到模块文件上限。'; return; }
    const count = moduleLineCount(file.text);
    moduleSelection.set(file.path, { path: file.path, start_line: 1, end_line: Math.min(count, ${MAX_MODULE_LINES}) });
  }
  resetModuleAnswer(); renderModuleSelection(); moduleCurrentFileButton(file);
}
function moduleFactLocation(answer, fact) {
  const source = answer.sources.find(item => item.path === fact.path);
  if (!source) throw Error('NOT_FOUND');
  return { path: fact.path, commit: source.commit, blob_sha: source.blob_sha, start_line: fact.start_line, end_line: fact.end_line };
}
async function rereadModuleFact(answer, fact, current) {
  const location = moduleFactLocation(answer, fact);
  const data = await request(api + '/' + answer.snapshot_id + '/citation?' + new URLSearchParams(location));
  if (generation !== current.generation || selected !== current.snapshot) return;
  showCitation(data.citation);
}
function moduleClaim(parent, claim) {
  const item = document.createElement('li'); item.textContent = claim.text + '（依据 ' + claim.facts.join('、') + '）'; parent.append(item);
}
function renderModuleAnswer(answer, current) {
  $('module-source').textContent = '固定提交 ' + answer.commit + ' · ' + answer.sources.length + ' 个源码文件 · ' + answer.model;
  for (const claim of answer.summary) moduleClaim($('module-summary'), claim);
  if (!answer.summary.length) moduleClaim($('module-summary'), { text: '当前证据不足以概括模块职责。', facts: [] });
  for (const claim of answer.relations) moduleClaim($('module-relations'), claim);
  if (!answer.relations.length) moduleClaim($('module-relations'), { text: '当前选定行段没有可确认的文件间关系。', facts: [] });
  for (const flow of answer.flows) {
    const section = document.createElement('section'); const heading = document.createElement('h4'); heading.textContent = flow.name; const steps = document.createElement('ol');
    for (const step of flow.steps) { const item = document.createElement('li'); item.textContent = step.text + '（依据 ' + step.facts.join('、') + '）'; steps.append(item); }
    section.append(heading, steps); $('module-flows').append(section);
  }
  if (!answer.flows.length) moduleClaim($('module-flows'), { text: '当前证据不足以确认完整业务流程。', facts: [] });
  for (const claim of answer.tradeoffs) moduleClaim($('module-tradeoffs'), claim);
  if (!answer.tradeoffs.length) moduleClaim($('module-tradeoffs'), { text: '当前证据不足以确认设计取舍。', facts: [] });
  for (const limit of answer.limits) { const item = document.createElement('li'); item.textContent = limit; $('module-limits').append(item); }
  if (!answer.limits.length) moduleClaim($('module-limits'), { text: '未返回额外证据边界。', facts: [] });
  for (const fact of answer.facts) {
    const item = document.createElement('li'); const where = document.createElement('small'); where.textContent = fact.path + ' · L' + fact.start_line + '–L' + fact.end_line; const quote = document.createElement('pre'); quote.textContent = fact.quote;
    item.append(where, quote); button(item, '查看固定原文', false, () => operation(() => rereadModuleFact(answer, fact, current))); $('module-facts').append(item);
  }
  $('module-answer').hidden = false;
}
$('module-form').addEventListener('submit', event => {
  event.preventDefault();
  void operation(async () => {
    if (moduleSelection.size < 2 || !selected) { $('module-status').textContent = '请至少选择两个源码文件。'; return; }
    const current = { generation, snapshot: selected }, sources = [...moduleSelection.values()].map(source => ({ ...source }));
    if (sources.some(source => !Number.isInteger(source.start_line) || !Number.isInteger(source.end_line) || source.start_line < 1 || source.end_line < source.start_line || source.end_line - source.start_line >= ${MAX_MODULE_LINES})) {
      $('module-status').textContent = '请检查每个文件的起止行，单个行段不能超过 ' + ${MAX_MODULE_LINES} + ' 行。'; return;
    }
    resetModuleAnswer(); $('module-submit').disabled = true; $('module-status').textContent = '正在讲解模块并核对跨文件引用…';
    try {
      const { explanation } = await request(api + '/' + selected + '/module-explain', 'POST', { actor_id: actor, sources, question: $('module-question').value });
      if (generation !== current.generation || selected !== current.snapshot) return;
      renderModuleAnswer(explanation, current); $('module-status').textContent = '已核对模块引用，可回读固定版本原文。';
    } catch (error) { if (generation === current.generation && selected === current.snapshot) $('module-status').textContent = moduleErrors[error.message] || codeErrors[error.message] || '暂时无法完成模块讲解，请稍后重试。'; }
    finally { if (generation === current.generation && selected === current.snapshot) $('module-submit').disabled = false; }
  });
});`
