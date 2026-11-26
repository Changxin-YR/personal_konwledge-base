import assert from 'node:assert/strict'
import { BLOB, COMMIT, FIRST, LAST, LINES, LOCATION, PATH, UNPINNED_SOURCE, quote } from './fixture.mjs'

export const factLocation = ({ start_line, end_line }) => ({ ...LOCATION, start_line, end_line })
export function verifyLocation(actual, snapshot, expected) {
  assert.equal(actual.snapshot_id, snapshot, 'snapshot binding')
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, 'location: ' + key)
}
export function verifyCitation(actual, snapshot, location) {
  verifyLocation(actual, snapshot, location)
  assert.equal(actual.quote, quote(location.start_line, location.end_line), 'citation bytes')
}
export function verifyUrl(url, origin, pathname, expected) {
  const target = new URL(url)
  assert.equal(target.origin, origin)
  assert.equal(target.pathname, pathname)
  assert(!target.username && !target.password && !target.hash)
  assert.equal(target.searchParams.size, Object.keys(expected).length)
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(target.searchParams.getAll(key), [String(value)], 'URL: ' + key)
}
export function verifyDenial(status, payload, expected, code) {
  assert.equal(status, expected, 'denial HTTP status for ' + code)
  assert.equal(payload.code, code, 'business denial code')
  assert.equal(payload.data, undefined, 'denial returned business data')
  const raw = JSON.stringify(payload)
  for (const key of ['explanation','citation','source','quote','facts','interpretations','limits','path','commit','blob_sha','start_line','end_line','snapshot_id']) {
    assert(!raw.includes('"' + key + '"'), 'denial returned ' + key)
  }
  for (const marker of [PATH, COMMIT, BLOB, ...LINES.slice(0, 5), LINES[6], UNPINNED_SOURCE.trim()]) {
    assert(!raw.includes(marker), 'denial disclosed fixture bytes or location')
  }
}

const clean = text => text.normalize('NFKC').replace(/[*_`]/g, '').replace(/\s+/g, ' ')
const comment = /注释|备注|comment/i
const conflict = /不(?:完全)?(?:一[致样]|相符|符|同|吻合|匹配)|(?:冲突|矛盾|差异|偏差|出入|相悖|有别|不等价)|conflict|disagree|mismatch|inconsistent|differ/i
const deniesConflict = /(?:没有|不存在|并无|无)(?:任何)?(?:冲突|矛盾|差异|出入)|(?:完全|二者|两者|二者边界|两者边界)一致|\bno (?:conflict|difference)\b/i
const caller = /调用|调用点|使用方|使用者|消费方|call(?:er|s|ed|ing)|import/i
const unknown = /无法|不能|难以|不(?:能|明|清楚|知道|足|确定|可(?:知|得知|判断|确定|推断))|未知|缺(?:少|乏|失)|[未没](?:知|给出|见|显示|展示|出现|提供|包含|发现|有|能|明确|体现|涉及)|需(?:要)?(?:查看|检查|检索|搜索|更多|额外)|看不出|不得而知|cannot|can't|unknown|not (?:shown|provided|present|identify)|no (?:evidence|call site)|insufficient/i
function verifyCallers(readings, limits) {
  assert(limits.some(text => caller.test(text) && unknown.test(text)), 'limits must explain why callers cannot be identified')
  // Check each assertion separately so a disclaimer cannot excuse a later invented caller.
  const assertions = [...readings, ...limits].flatMap(text => text.split(/[。！？；;\n]|[，,]?(?:然而|但是|不过|但(?!(?:凡|是))|\bbut\b)/i))
  for (const claim of assertions.filter(text => caller.test(text))) {
    const concrete = /(?:被|由|供).{1,45}(?:调用|使用)|(?:模块|服务|组件|控制器|[A-Za-z_$][\w.$/]*)(?:会|直接|实际|负责|中|也)?调用(?:它|该|本|此|\s*shippingFee)|(?:调用者|调用方)(?:包括|为|是)|(?:called|invoked|used) by|[\w.]+ calls shippingFee/i
    assert(!concrete.test(claim) || unknown.test(claim), 'asserted an external caller')
  }
}
function expectFee(readings, subtotal, expected) {
  const pattern = new RegExp('(?<![0-9])' + subtotal + '(?![0-9])\\s*(?:→|⟶|->|=>|⇒|[:：]|(?:\\s*时[，,]?\\s*)?(?:的)?(?:实际)?(?:运费|返回值|费用|收费|返回)(?:\\s*(?:为|是|等于|=))?)\\s*([0-9]+(?:\\.[0-9]+)?)', 'gi')
  const prices = Array.from(readings.matchAll(pattern), match => Number(match[1]))
  assert(prices.includes(expected), 'interpretations must answer subtotal ' + subtotal + ' with fee ' + expected)
  assert(prices.every(value => value === expected), 'contradictory fee for subtotal ' + subtotal)
}
export function verifyAnswer(answer, snapshot) {
  assert(answer && typeof answer === 'object')
  verifyLocation(answer.source, snapshot, LOCATION)
  assert.equal(answer.source.total_lines, LINES.length)
  for (const name of ['provider','model']) assert.equal(typeof answer[name] === 'string' && !!answer[name].trim(), true, 'missing ' + name)
  for (const name of ['facts','interpretations','limits']) assert(Array.isArray(answer[name]) && answer[name].length > 0, name + ' must contain the requested evidence')
  const seen = new Set()
  for (const fact of answer.facts) {
    assert.deepEqual(Object.keys(fact).sort(), ['end_line','quote','start_line'])
    assert.equal(fact.quote, quote(fact.start_line, fact.end_line), 'source fact must be verbatim, including indent')
    const id = fact.start_line + ':' + fact.end_line
    assert(!seen.has(id), 'duplicate fact'); seen.add(id)
  }
  const referenced = new Set()
  for (const interpretation of answer.interpretations) {
    assert(typeof interpretation.text === 'string' && interpretation.text.trim())
    assert(Array.isArray(interpretation.facts) && interpretation.facts.length)
    assert.equal(new Set(interpretation.facts).size, interpretation.facts.length)
    for (const index of interpretation.facts) {
      assert(Number.isInteger(index) && index >= 1 && index <= answer.facts.length, 'invalid fact reference')
      const { start_line, end_line } = answer.facts[index - 1]
      for (let line = start_line; line <= end_line; line++) referenced.add(line)
    }
  }
  for (const line of [2, 4, 5]) assert(referenced.has(line), 'readings need evidence for fixture line ' + line)
  assert(answer.limits.every(text => typeof text === 'string' && text.trim()))
  const readings = answer.interpretations.map(item => clean(item.text))
  const text = readings.join('。')
  assert(/运费|配送费|配送费用|shipping (?:fee|cost|charge)|freight/i.test(text), 'explain the shipping responsibility')
  expectFee(text, 50, 8); expectFee(text, 51, 0)
  assert(comment.test(text) && conflict.test(text) && !deniesConflict.test(text), 'explain the comment/implementation conflict')
  verifyCallers(readings, answer.limits.map(clean))
  for (const outside of [LINES[FIRST - 2], LINES[LAST], 'OUTSIDE_RANGE_SENTINEL_7B', 'UNPINNED_SENTINEL_91']) {
    assert(!JSON.stringify([answer.facts,readings,answer.limits]).includes(outside), 'answer includes out-of-scope source')
  }
}
