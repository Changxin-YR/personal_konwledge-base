import { MAX_CODE_LINES, MAX_QUESTION_LENGTH } from '../domain/code-explanation.ts'

export const explainHtml = `
<section id="explain-panel" hidden aria-labelledby="explain-heading">
  <h2 id="explain-heading">单文件代码讲解</h2>
  <form id="explain-form">
    <p class="badge" id="explain-scope"></p>
    <div class="code-range"><label>起始行<input type="number" id="explain-start" min="1" required></label>
    <label>结束行<input type="number" id="explain-end" min="1" required></label></div>
    <label>想了解这段代码的什么？<textarea id="explain-question" rows="2" maxlength="${MAX_QUESTION_LENGTH}" placeholder="例如：等于阈值时会走哪个分支？" required></textarea></label>
    <p class="badge">将文件路径、所选行和问题发送给已配置的模型。</p>
    <button id="explain-submit" type="submit">讲解选定行</button>
  </form>
  <p id="explain-status" role="status"></p>
  <div id="explain-answer" hidden>
    <p class="badge" id="explain-source"></p>
    <h3>源码事实</h3><ol id="explain-facts"></ol>
    <h3>业务与代码解读（推断）</h3><ul id="explain-interpretations"></ul>
    <h3>上下文与证据边界</h3><ul id="explain-limits"></ul>
  </div>
  <div id="citation-box" hidden><h3 id="citation-location"></h3><pre id="citation-readback" tabindex="-1"></pre><a id="citation-link">固定引用链接</a></div>
</section>`

export const explainScript = String.raw`
let openCode;
const codeErrors = {
  CODE_QUESTION_INVALID:'请输入有效的问题。', CODE_RANGE_INVALID:'请检查起止行是否在文件范围内。',
  CODE_TEXT_REQUIRED:'请选取含有源码的文本行。', CODE_RANGE_TOO_LARGE:'所选代码过长，请缩短行段后再提问。',
  CODE_SOURCE_CHANGED:'固定来源与当前文件不一致，请重新打开文件。', NOT_FOUND:'这份固定文件现已不可用。',
  MODEL_NOT_CONFIGURED:'尚未配置可用的模型。', CREDENTIALS_MISSING:'模型凭据尚未配置。',
  MODEL_NOT_FOUND:'配置的模型不可用。', PROVIDER_PERMISSION_DENIED:'模型服务拒绝了请求。', CREDENTIALS_INVALID:'模型凭据无效。',
  QUOTA_EXHAUSTED:'模型额度已用完。', PROVIDER_RATE_LIMITED:'模型服务请求频繁，请稍后重试。',
  MODEL_TIMEOUT:'模型响应超时，请稍后重试。', REQUEST_LIMIT:'已有讲解正在进行，请稍后再试。',
  MODEL_OUTPUT_INVALID:'模型答复格式或引用未通过核对，请调整问题后重试。',
  MODEL_OUTPUT_TRUNCATED:'模型答复过长，未能完整返回。请缩短行段或问题。',
  MODEL_OUTPUT_EMPTY:'模型返回了空答复。', MODEL_OUTPUT_INCOMPLETE:'模型答复不完整。', CANCELLED:'讲解已取消。'
};
function resetCodeAnswer() {
  $('explain-answer').hidden = $('citation-box').hidden = true;
  $('citation-link').removeAttribute('href');
  for (const id of ['explain-status','explain-source','explain-facts','explain-interpretations','explain-limits','citation-location','citation-readback']) $(id).replaceChildren();
}
function closeCode() {
  openCode = undefined;
  resetCodeAnswer();
  $('explain-panel').hidden = true;
  $('explain-form').reset();
  $('explain-submit').disabled = false;
}
function selectCode(file) {
  closeCode();
  if (!file.text || !file.text.trim()) return;
  const count = file.text.split(/\r\n|\r|\n/).length - (/[\r\n]$/.test(file.text) ? 1 : 0);
  openCode = { snapshot: selected, path: file.path, commit: file.commit, blob_sha: file.sha };
  $('explain-start').max = $('explain-end').max = String(count);
  $('explain-start').value = '1';
  $('explain-end').value = String(Math.min(count, ${MAX_CODE_LINES}));
  $('explain-scope').textContent = '文件共 ' + count + ' 行，每次可选 ' + ${MAX_CODE_LINES} + ' 行。';
  $('explain-panel').hidden = false;
}
function addItem(parent, text) {
  const item = document.createElement('li');
  item.textContent = text;
  parent.append(item);
  return item;
}
async function rereadCode(source, fact, current) {
  const location = { path: source.path, commit: source.commit, blob_sha: source.blob_sha, start_line: fact.start_line, end_line: fact.end_line };
  $('citation-box').hidden = true;
  $('citation-readback').textContent = '';
  const data = await request(api + '/' + source.snapshot_id + '/citation?' + new URLSearchParams(location));
  if (openCode !== current) return;
  showCitation(data.citation);
}
function showCitation(c) {
  const params = new URLSearchParams({ snapshot: c.snapshot_id, path: c.path, commit: c.commit, blob_sha: c.blob_sha, start_line: c.start_line, end_line: c.end_line });
  $('citation-link').href = '/knowledgeos/repositories?' + params;
  $('citation-location').textContent = c.path + ' · L' + c.start_line + '–L' + c.end_line + ' · ' + c.commit;
  $('citation-readback').textContent = c.quote;
  $('citation-box').hidden = false;
  $('citation-readback').focus();
}
async function restoreCitation() {
  const params = new URLSearchParams(location.search);
  if (!params.has('snapshot')) return;
  const snapshot = params.get('snapshot');
  if (!rows.some(row => row.id === snapshot)) throw Error('NOT_FOUND');
  params.delete('snapshot');
  const { citation } = await request(api + '/' + snapshot + '/citation?' + params);
  await open(snapshot);
  if (!files.includes(citation.path)) throw Error('NOT_FOUND');
  await show(citation.path);
  $('explain-start').value = citation.start_line;
  $('explain-end').value = citation.end_line;
  showCitation(citation);
}
function renderCode(answer, current) {
  const source = answer.source;
  $('explain-source').textContent = source.path + ' · L' + source.start_line + '–L' + source.end_line + ' · ' + source.commit + ' · ' + answer.model;
  for (const fact of answer.facts) {
    const item = addItem($('explain-facts'), '');
    const quote = document.createElement('pre');
    quote.textContent = fact.quote;
    item.append(quote);
    button(item, '查看原文 L' + fact.start_line + '–L' + fact.end_line, false, () => operation(() => rereadCode(source, fact, current)));
  }
  if (!answer.facts.length) addItem($('explain-facts'), '所选行中没有可引用的直接依据。');
  for (const reading of answer.interpretations) addItem($('explain-interpretations'), reading.text + '（依据 ' + reading.facts.join('、') + '）');
  if (!answer.interpretations.length) addItem($('explain-interpretations'), '现有证据不足以作出解读。');
  for (const limit of answer.limits) addItem($('explain-limits'), limit);
  if (!answer.limits.length) addItem($('explain-limits'), '本次解读仅覆盖所选行。');
  $('explain-answer').hidden = false;
}
$('explain-form').addEventListener('submit', event => {
  event.preventDefault();
  void operation(async () => {
    const current = openCode;
    if (!current) return;
    resetCodeAnswer();
    const payload = { actor_id: actor, path: current.path, commit: current.commit, blob_sha: current.blob_sha,
      start_line: $('explain-start').valueAsNumber, end_line: $('explain-end').valueAsNumber, question: $('explain-question').value };
    if (payload.end_line < payload.start_line || payload.end_line - payload.start_line >= ${MAX_CODE_LINES}) {
      $('explain-status').textContent = '请选择连续的 1 至 ' + ${MAX_CODE_LINES} + ' 行。';
      return;
    }
    $('explain-submit').disabled = true;
    $('explain-status').textContent = '正在讲解并核对引用…';
    try {
      const { explanation } = await request(api + '/' + current.snapshot + '/explain', 'POST', payload);
      if (openCode !== current) return;
      renderCode(explanation, current);
      $('explain-status').textContent = '已核对引用，可查看固定版本原文。';
    } catch (error) {
      if (openCode === current) $('explain-status').textContent = codeErrors[error.message] || '暂时无法完成讲解，请稍后重试。';
    } finally { if (openCode === current) $('explain-submit').disabled = false; }
  });
});`
